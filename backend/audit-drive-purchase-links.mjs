import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import pg from 'pg';
import { google } from 'googleapis';

// Audits only the *backup link* of a purchase.  It does not alter fiscal
// amounts, dates, rubricas, payment state, or delete any Drive original.
// A link is replaced only when the existing Drive file has a concrete fiscal
// contradiction (different NF, amount, or fiscal month), and the original PDF
// can be recovered from this application's own document endpoint.
const applyFixes=process.argv.includes('--fix');
const { Pool }=pg;
const pool=new Pool({ host:process.env.DB_HOST || 'db',port:Number(process.env.DB_PORT || 5432),database:process.env.POSTGRES_DB || 'appgestor',user:process.env.POSTGRES_USER || 'appgestor',password:process.env.POSTGRES_PASSWORD || '' });
const uploadDir=process.env.UPLOAD_DIR || '/app/uploads';
const publicBaseUrl=String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/,'');
const rootId=process.env.GOOGLE_DRIVE_FOLDER_ID || '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';

const digits=(value)=>String(value || '').replace(/\D/g,'');
const norm=(value)=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const dateOf=(value)=>{ const date=value instanceof Date&&!Number.isNaN(value.getTime())?value.toISOString().slice(0,10):String(value || '').slice(0,10); return /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)?date:''; };
const monthOf=(value)=>{ const date=dateOf(value); return date?`${date.slice(5,7)}-${date.slice(0,4)}`:''; };
const amountOf=(purchase)=>Number(purchase.nf_valor_total || purchase.valor_total || purchase.valor_solicitado || 0);
const cleanName=(value)=>String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
const fileIdFrom=(value)=>String(value || '').match(/(?:drive\.google\.com\/file\/d\/|[?&]id=)([A-Za-z0-9_-]{5,})/i)?.[1] || '';
const directId=(purchase)=>String(purchase.drive_file_id || '').trim() || fileIdFrom(purchase.drive_file_url) || fileIdFrom(purchase.drive_backup_nf_pdf_link);
const sourceOf=(purchase)=>purchase.nf_pdf_link || purchase.nota_fiscal_pdf_url || purchase.nota_fiscal_url || purchase.arquivo_url || purchase.nf_pdf_url || purchase.file_url || purchase.documento_url || '';

function supplierTokens(value) {
  const ignored=new Set(['LTDA','ME','EIRELI','EPP','MEI','S','A','SA','DE','DA','DO','DOS','DAS','E','SERVICO','SERVICOS','COMERCIO','COMERCIAL','EMPRESA','EMPRESAS']);
  return norm(value).split(/[^A-Z0-9]+/).filter(token=>token.length>=4&&!ignored.has(token));
}
function hasSupplierEvidence(expected,name) {
  const tokens=supplierTokens(expected); if(!tokens.length) return null;
  const hay=norm(name);
  const hits=tokens.filter(token=>hay.includes(token));
  return hits.length>=Math.min(2,tokens.length) || (tokens.length===1&&hits.length===1);
}
function amountMentions(name) {
  const out=[];
  for(const match of String(name || '').matchAll(/R\$\s*([0-9][0-9._,\s]*)/gi)) {
    const raw=match[1].replace(/[\s_]/g,'');
    const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
    const amount=Number(normalized); if(Number.isFinite(amount)&&amount>0) out.push(amount);
  }
  return out;
}
function numberMention(name) {
  const text=String(name || '');
  const explicit=text.match(/\bNF(?:S[- ]?E)?\s*[-#]?\s*0*(\d{1,12})\b/i);
  const first=text.match(/^\s*0*(\d{1,12})\s*[-_.]/);
  return String(explicit?.[1] || first?.[1] || '').replace(/^0+/,'');
}
function monthMention(name) {
  const text=norm(name);
  const numeric=text.match(/\b(0?[1-9]|1[0-2])[-_/](20\d{2})\b/);
  if(numeric) return `${String(Number(numeric[1])).padStart(2,'0')}-${numeric[2]}`;
  const months={JANEIRO:'01',FEVEREIRO:'02',MARCO:'03',ABRIL:'04',MAIO:'05',JUNHO:'06',JULHO:'07',AGOSTO:'08',SETEMBRO:'09',OUTUBRO:'10',NOVEMBRO:'11',DEZEMBRO:'12'};
  for(const [word,month] of Object.entries(months)) { const year=text.match(new RegExp(`\\b${word}[-_ ]?(20\\d{2})\\b`)); if(year) return `${month}-${year[1]}`; }
  return '';
}
function identityComplete(purchase) {
  return Boolean(digits(purchase.nf_emitente_cpf_cnpj || purchase.fornecedor_cpf_cnpj || purchase.fornecedor_cnpj) && String(purchase.nf_numero || '').trim() && amountOf(purchase)>0 && dateOf(purchase.nf_data_emissao || purchase.data_emissao));
}
function canonicalName(purchase) {
  const amount=amountOf(purchase);
  return `${cleanName(purchase.nf_numero || 'SEM-NUM')} - ${cleanName(purchase.nf_emitente_nome || purchase.fornecedor_nome || 'FORNECEDOR A REVISAR')} - MUSEUS CENTRO - R$ ${amount.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}.pdf`;
}
function sourceUrl(url) {
  if(!publicBaseUrl) return null;
  try {
    const base=new URL(publicBaseUrl); const target=new URL(String(url || ''),base);
    if(target.origin!==base.origin || !/^\/(?:api\/files|documentos)\//i.test(target.pathname)) return null;
    return target.toString();
  } catch { return null; }
}
async function sourceFile(url) {
  const match=String(url || '').match(/\/api\/files\/([^/?#]+)/i);
  if(match) { const local=path.join(uploadDir,path.basename(decodeURIComponent(match[1]))); if(fs.existsSync(local)) return { body:fs.createReadStream(local),mime:path.extname(local).toLowerCase()==='.xml'?'application/xml':'application/pdf' }; }
  const remote=sourceUrl(url); if(!remote) return null;
  const response=await fetch(remote,{redirect:'follow'}); if(!response.ok||!response.body) return null;
  const mime=String(response.headers.get('content-type') || '').split(';')[0] || 'application/pdf';
  return { body:Readable.fromWeb(response.body),mime };
}
async function driveClient() {
  if(!process.env.GOOGLE_DRIVE_CLIENT_ID||!process.env.GOOGLE_DRIVE_CLIENT_SECRET||!process.env.GOOGLE_DRIVE_REFRESH_TOKEN) throw new Error('Google Drive não configurado');
  const auth=new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID,process.env.GOOGLE_DRIVE_CLIENT_SECRET); auth.setCredentials({refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN});
  return google.drive({version:'v3',auth});
}
async function replaceWithCanonicalBackup(drive,purchase) {
  const fiscalDate=dateOf(purchase.nf_data_emissao || purchase.data_emissao); const source=await sourceFile(sourceOf(purchase));
  if(!fiscalDate||!source) return null;
  const folderName=monthOf(fiscalDate);
  const folderResult=await drive.files.list({q:`'${rootId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:'files(id)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true});
  const folderId=folderResult.data.files?.[0]?.id || (await drive.files.create({requestBody:{name:folderName,mimeType:'application/vnd.google-apps.folder',parents:[rootId]},fields:'id',supportsAllDrives:true})).data.id;
  const name=canonicalName(purchase); const existing=await drive.files.list({q:`'${folderId}' in parents and name='${name.replace(/'/g,"\\'")}' and trashed=false`,fields:'files(id,webViewLink)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true});
  return existing.data.files?.[0] || (await drive.files.create({requestBody:{name,parents:[folderId]},media:{mimeType:source.mime,body:source.body},fields:'id,webViewLink',supportsAllDrives:true})).data;
}
async function main() {
  const drive=await driveClient(); const folders=new Map();
  const rows=(await pool.query(`SELECT * FROM purchase_requests WHERE COALESCE(drive_file_id,'')<>'' OR COALESCE(drive_file_url,'')<>'' OR COALESCE(drive_backup_nf_pdf_link,'')<>'' ORDER BY id`)).rows;
  const report={checked:rows.length,verified:0,wrong:0,repaired:0,cleared:0,unverifiable:0,unavailable:0,errors:0,examples:[]};
  for(const purchase of rows) {
    const fileId=directId(purchase); if(!fileId) { report.unverifiable++; continue; }
    try {
      let file;
      try { file=(await drive.files.get({fileId,fields:'id,name,parents,trashed,webViewLink,mimeType',supportsAllDrives:true})).data; }
      catch(error) { if(Number(error?.code)===404) { file={id:fileId,name:'',parents:[],trashed:true}; } else throw error; }
      let parentName=''; const parentId=file.parents?.[0];
      if(parentId) { if(!folders.has(parentId)) folders.set(parentId,(await drive.files.get({fileId:parentId,fields:'name',supportsAllDrives:true})).data.name || ''); parentName=folders.get(parentId); }
      const expectedNumber=String(purchase.nf_numero || '').replace(/^0+/,''); const expectedAmount=amountOf(purchase); const expectedMonth=monthOf(purchase.nf_data_emissao || purchase.data_emissao);
      const amounts=amountMentions(file.name); const mentionedNumber=numberMention(file.name); const namedMonth=monthMention(file.name); const supplierEvidence=hasSupplierEvidence(purchase.nf_emitente_nome || purchase.fornecedor_nome,file.name);
      const reasons=[];
      if(file.trashed) reasons.push('arquivo_do_drive_inexistente');
      if(expectedAmount>0&&amounts.length&&!amounts.some(value=>Math.abs(value-expectedAmount)<0.005)) reasons.push(`valor_divergente:${amounts.join(',')}`);
      if(expectedNumber&&mentionedNumber&&mentionedNumber!==expectedNumber) reasons.push(`nf_divergente:${mentionedNumber}`);
      if(expectedMonth&&/^\d{2}-20\d{2}$/.test(parentName)&&parentName!==expectedMonth) reasons.push(`pasta_fiscal_divergente:${parentName}`);
      if(expectedMonth&&namedMonth&&namedMonth!==expectedMonth) reasons.push(`mes_no_nome_divergente:${namedMonth}`);
      if(supplierEvidence===false&&(reasons.length>0||amounts.length>0)) reasons.push('fornecedor_divergente');
      const wrong=reasons.some(reason=>!reason.startsWith('fornecedor_'));
      const verified=identityComplete(purchase)&&!wrong&&Boolean(expectedNumber&&mentionedNumber===expectedNumber)&&Boolean(amounts.some(value=>Math.abs(value-expectedAmount)<0.005))&&supplierEvidence===true&&(!parentName||parentName===expectedMonth);
      if(verified) { report.verified++; continue; }
      if(!wrong || !identityComplete(purchase)) { report.unverifiable++; continue; }
      report.wrong++; if(report.examples.length<20) report.examples.push({id:purchase.id,nf:purchase.nf_numero,fornecedor:purchase.nf_emitente_nome || purchase.fornecedor_nome,esperado:expectedAmount,arquivo:file.name,motivos:reasons});
      if(!applyFixes) continue;
      const replacement=await replaceWithCanonicalBackup(drive,purchase);
      if(replacement) {
        const link=replacement.webViewLink || `https://drive.google.com/file/d/${replacement.id}/view`;
        await pool.query(`UPDATE purchase_requests SET drive_file_id=$1,drive_file_url=$2,drive_backup_nf_pdf_link=$2,drive_backup_status='CONCLUIDO',updated_at=NOW(),updated_date=NOW() WHERE id=$3`,[replacement.id,link,purchase.id]);
        report.repaired++;
      } else {
        await pool.query(`UPDATE purchase_requests SET drive_file_id=NULL,drive_file_url=NULL,drive_backup_nf_pdf_link=NULL,drive_backup_status='PENDENTE_RECONCILIACAO',updated_at=NOW(),updated_date=NOW() WHERE id=$1`,[purchase.id]);
        report.cleared++;
      }
    } catch(error) { report.errors++; if(report.examples.length<20) report.examples.push({id:purchase.id,error:String(error?.message || error)}); }
  }
  console.log('DRIVE_PURCHASE_LINK_AUDIT',JSON.stringify(report));
}
main().catch(error=>{ console.error('DRIVE_PURCHASE_LINK_AUDIT_FAILED',error); process.exitCode=1; }).finally(()=>pool.end());
