import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { google } from 'googleapis';

const { Pool } = pg;
const pool = new Pool({ host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432), database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor', password:process.env.POSTGRES_PASSWORD || '' });
const uploadDir=process.env.UPLOAD_DIR || '/app/uploads';
const rootId=process.env.GOOGLE_DRIVE_FOLDER_ID || '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const dateOf=value => { const date=value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0,10) : String(value||'').slice(0,10); return /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date) ? date : ''; };
const clean=value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
const sourceOf=p => p.nf_pdf_link || p.nota_fiscal_pdf_url || p.nota_fiscal_url || p.arquivo_url || p.drive_file_url || '';
const localOf=url => { const m=String(url||'').match(/\/api\/files\/([^/?#]+)/i); if(!m) return null; const file=path.join(uploadDir,path.basename(decodeURIComponent(m[1]))); return fs.existsSync(file) ? file : null; };
async function readSource(url) {
  const local=localOf(url);
  if(local) return { body:fs.createReadStream(local), mime:path.extname(local).toLowerCase()==='.xml' ? 'application/xml' : 'application/pdf' };
  if(!/^https:\/\//i.test(String(url))) return null;
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok || !response.body) throw new Error(`Documento fiscal indisponível (${response.status})`);
  return { body:Readable.fromWeb(response.body), mime:path.extname(new URL(response.url).pathname).toLowerCase()==='.xml' ? 'application/xml' : 'application/pdf' };
}
const nameOf=(p,url) => { const amount=Number(p.nf_valor_total || p.valor_total || p.valor_solicitado || 0); return `${clean(p.nf_numero || 'SEM-NUM') || 'SEM-NUM'} - ${clean(p.nf_emitente_nome || p.fornecedor_nome || 'FORNECEDOR A REVISAR') || 'FORNECEDOR A REVISAR'} - MUSEUS CENTRO - R$ ${amount.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}${path.extname(url).toLowerCase()==='.xml'?'.xml':'.pdf'}`; };
function escapeDrive(value) { return String(value).replace(/'/g,"\\'"); }
async function main() {
  if(!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) throw new Error('Google Drive não configurado');
  const auth=new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID,process.env.GOOGLE_DRIVE_CLIENT_SECRET); auth.setCredentials({refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN});
  const drive=google.drive({version:'v3',auth}); const folderCache=new Map();
  async function folder(date) { const label=`${date.slice(5,7)}-${date.slice(0,4)}`; if(folderCache.has(label)) return folderCache.get(label); const found=await drive.files.list({q:`'${rootId}' in parents and name='${label}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:'files(id)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true}); const id=found.data.files?.[0]?.id || (await drive.files.create({requestBody:{name:label,mimeType:'application/vnd.google-apps.folder',parents:[rootId]},fields:'id',supportsAllDrives:true})).data.id; folderCache.set(label,id); return id; }
  const rows=(await pool.query("SELECT * FROM purchase_requests WHERE (COALESCE(nota_fiscal_url,'')<>'' OR COALESCE(nota_fiscal_pdf_url,'')<>'' OR COALESCE(arquivo_url,'')<>'' OR COALESCE(drive_file_url,'')<>'') AND COALESCE(drive_file_id,'')='' AND COALESCE(drive_backup_status,'')<>'CONCLUIDO'")).rows;
  let backed=0, skipped=0, failed=0;
  for(const p of rows) { try { const date=dateOf(p.nf_data_emissao || p.data_emissao); const url=sourceOf(p); const source=await readSource(url); if(!date || !source) { skipped++; continue; } const parent=await folder(date); const name=nameOf(p,url); const found=await drive.files.list({q:`'${parent}' in parents and name='${escapeDrive(name)}' and trashed=false`,fields:'files(id,webViewLink)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true}); const remote=found.data.files?.[0] || (await drive.files.create({requestBody:{name,parents:[parent]},media:{mimeType:source.mime,body:source.body},fields:'id,webViewLink',supportsAllDrives:true})).data; const link=remote.webViewLink || `https://drive.google.com/file/d/${remote.id}/view`; await pool.query('UPDATE purchase_requests SET drive_file_id=$1, drive_file_url=$2, drive_backup_nf_pdf_link=$2, drive_backup_status=$3 WHERE id=$4',[remote.id,link,'CONCLUIDO',p.id]); backed++; } catch(error) { failed++; console.error('BACKUP_PENDING_FAILED',p.id,error.message); } }
  console.log(JSON.stringify({candidatas:rows.length,backup_concluido:backed,ignoradas:skipped,erros:failed}));
  await pool.end();
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
