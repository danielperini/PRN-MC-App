import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { google } from 'googleapis';

const SOURCE_ROOT = process.env.DRIVE_RECONCILE_SOURCE_ROOT || '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const TARGET_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || ''
});
const clean = (v) => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim();
const digits = (v) => String(v || '').replace(/\D/g, '');
const tag = (xml, name) => (xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</(?:\\w+:)?${name}>`, 'i'))?.[1] || '').trim();
const fiscalKey = (m) => [digits(m.cnpj || m.cpf), String(m.numero || '').replace(/^0+/, ''), String(Number(m.valor || 0).toFixed(2)), String(m.data || '').slice(0, 10)].join('|');
const brl = (v) => Number(v || 0).toLocaleString('pt-BR',{ minimumFractionDigits:2,maximumFractionDigits:2 });
function standardName(meta, original) {
  const extension=/\.xml$/i.test(original)?'.xml':'.pdf';
  const number=clean(meta.numero || meta.nf_numero || 'SEM-NUM');
  const supplier=clean(meta.fornecedor || meta.nf_emitente_nome || '').replace(/^VIADUTO DAS ARTES$/i,'') || 'FORNECEDOR A REVISAR';
  return clean(`${number} - ${supplier} - MUSEUS CENTRO - R$ ${brl(meta.valor || meta.nf_valor_total)}`)+extension;
}

function xmlMeta(xml) {
  const emit = xml.match(/<(?:\w+:)?emit(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?emit>/i)?.[1] || '';
  return { numero:tag(xml, 'nNF'), valor:tag(xml, 'vNF'), data:tag(xml, 'dhEmi') || tag(xml, 'dEmi'), fornecedor:tag(emit, 'xNome'), cnpj:tag(emit, 'CNPJ'), cpf:tag(emit, 'CPF') };
}
function monthAllowed(p) {
  const m = String(p).match(/(?:^|\/)(0?[1-9]|1[0-2])[-_/](20\d{2})(?:\/|$)/);
  if (!m) return false;
  const n = Number(m[2]) * 100 + Number(m[1]);
  const now = new Date(); const max = now.getFullYear() * 100 + now.getMonth() + 1;
  return n >= 202602 && n <= max;
}
async function driveClient() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return google.drive({ version:'v3', auth });
}
async function tree(drive, root) {
  const out=[]; const queue=[{ id:root, path:'' }];
  while (queue.length) {
    const folder=queue.shift(); let token;
    do {
      const r=await drive.files.list({ q:`'${folder.id}' in parents and trashed=false`, fields:'nextPageToken,files(id,name,mimeType,md5Checksum,size)', pageSize:1000, pageToken:token, supportsAllDrives:true, includeItemsFromAllDrives:true });
      for (const f of r.data.files || []) { const p=folder.path ? `${folder.path}/${f.name}` : f.name; if (f.mimeType === 'application/vnd.google-apps.folder') queue.push({ id:f.id, path:p }); else out.push({ ...f, path:p }); }
      token=r.data.nextPageToken;
    } while (token);
  }
  return out;
}
async function bytes(drive, id) { const r=await drive.files.get({ fileId:id, alt:'media', supportsAllDrives:true }, { responseType:'arraybuffer' }); return Buffer.from(r.data); }
async function monthFolder(drive, emissionDate) {
  const date=String(emissionDate || '').slice(0,10); const m=date.match(/^(\d{4})-(\d{2})-\d{2}$/); if (!m) return null;
  const name=`${m[2]}-${m[1]}`; const q=`'${TARGET_ROOT}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found=await drive.files.list({ q,fields:'files(id)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true });
  if (found.data.files?.[0]?.id) return found.data.files[0].id;
  return (await drive.files.create({ requestBody:{ name,mimeType:'application/vnd.google-apps.folder',parents:[TARGET_ROOT] },fields:'id',supportsAllDrives:true })).data.id;
}
async function analyzePdf(buffer, filename) {
  if (!process.env.OPENAI_API_KEY) return {};
  const form=new FormData(); form.append('purpose','user_data'); form.append('file',new Blob([buffer],{ type:'application/pdf' }),filename);
  const up=await fetch('https://api.openai.com/v1/files',{ method:'POST',headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` },body:form });
  if (!up.ok) throw new Error(`OpenAI upload ${up.status}`); const file=await up.json();
  try {
    let result={};
    for (let attempt=1;attempt<=3;attempt++) {
      const prompt=`Faça OCR integral da nota fiscal, inclusive cabeçalho, rodapé e QR code. A DATA DE EMISSÃO é obrigatória: procure também por "emitida em", "data/hora da emissão" e "competência". Tentativa ${attempt}/3. Retorne somente JSON: {"nf_numero":"","nf_valor_total":0,"nf_data_emissao":"YYYY-MM-DD","nf_emitente_nome":"","nf_emitente_cpf_cnpj":"","descricao_servico":""}. Use o conteúdo, nunca o nome do arquivo.`;
      const rr=await fetch('https://api.openai.com/v1/responses',{ method:'POST',headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json' },body:JSON.stringify({ model:process.env.OPENAI_INVOICE_MODEL || 'gpt-4.1-mini', input:[{ role:'user',content:[{ type:'input_text',text:prompt },{ type:'input_file',file_id:file.id }] }], text:{ format:{ type:'json_object' } } }) });
      if (!rr.ok) throw new Error(`OpenAI response ${rr.status}`); const env=await rr.json(); const text=env.output_text || env.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text || '{}'; result={ ...result,...JSON.parse(text) };
      if (result.nf_data_emissao && result.nf_numero && Number(result.nf_valor_total)>0 && result.nf_emitente_cpf_cnpj) return result;
    }
    if (!result.nf_data_emissao) throw new Error('Data de emissão não localizada após 3 leituras OCR');
    return result;
  } finally { await fetch(`https://api.openai.com/v1/files/${file.id}`,{ method:'DELETE',headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` } }).catch(()=>{}); }
}
async function run() {
  fs.mkdirSync(uploadDir,{ recursive:true }); const drive=await driveClient();
  const [sourceAll,targetAll]=await Promise.all([tree(drive,SOURCE_ROOT),tree(drive,TARGET_ROOT)]);
  const source=sourceAll.filter(f=>monthAllowed(f.path) && /\.(pdf|xml)$/i.test(f.name));
  const target=targetAll.filter(f=>/\.(pdf|xml)$/i.test(f.name)); const targetHashes=new Set(target.map(f=>f.md5Checksum).filter(Boolean));
  const knownKeys=new Set();
  for (const f of target.filter(x=>/\.xml$/i.test(x.name))) { try { const m=xmlMeta((await bytes(drive,f.id)).toString('utf8')); if (m.numero) knownKeys.add(fiscalKey(m)); } catch {} }
  const existing=await pool.query(`SELECT id,file_name_original,resultado_ia,status_processamento FROM document_intakes WHERE COALESCE(status_registro,'')<>'DELETADO'`);
  for (const row of existing.rows) { const a=row.resultado_ia || {}; const k=fiscalKey({ cnpj:a.nf_emitente_cpf_cnpj,numero:a.nf_numero,valor:a.nf_valor_total,data:a.nf_data_emissao }); if (a.nf_numero) knownKeys.add(k); }
  let imported=0,duplicates=0,errors=0; const importedByFolder=new Map();
  for (const f of source.sort((a,b)=>/\.xml$/i.test(a.name)?-1:1)) {
    try {
      const buffer=await bytes(drive,f.id); const hash=f.md5Checksum || crypto.createHash('md5').update(buffer).digest('hex');
      if (targetHashes.has(hash)) { duplicates++; continue; }
      let meta={}; if (/\.xml$/i.test(f.name)) meta=xmlMeta(buffer.toString('utf8')); else meta=await analyzePdf(buffer,f.name);
      const mapped={ cnpj:meta.cnpj || meta.nf_emitente_cpf_cnpj,cpf:meta.cpf,numero:meta.numero || meta.nf_numero,valor:meta.valor || meta.nf_valor_total,data:meta.data || meta.nf_data_emissao };
      if (!mapped.data) throw new Error('Data de emissão fiscal ausente após leitura integral');
      const key=mapped.numero ? fiscalKey(mapped) : ''; const duplicate=key && knownKeys.has(key);
      const finalName=standardName({ ...meta,...mapped },f.name); const disk=`${Date.now()}-${f.id}-${finalName}`; fs.writeFileSync(path.join(uploadDir,disk),buffer);
      let backup=null; const folderId=!duplicate ? await monthFolder(drive,mapped.data) : null;
      if (folderId) backup=(await drive.files.copy({ fileId:f.id,requestBody:{ name:finalName,parents:[folderId] },fields:'id,webViewLink',supportsAllDrives:true })).data;
      const ai={ ...meta, nf_numero:mapped.numero || '',nf_valor_total:Number(mapped.valor || 0),nf_data_emissao:String(mapped.data || '').slice(0,10),nf_emitente_nome:meta.fornecedor || meta.nf_emitente_nome || '',nf_emitente_cpf_cnpj:mapped.cnpj || mapped.cpf || '',source_drive_file_id:f.id,source_drive_path:f.path,source_md5:hash,drive_backup_file_id:backup?.id || null,drive_backup_url:backup?.webViewLink || null,duplicate_detected:Boolean(duplicate),duplicate_key:key || null,analisado_em:new Date().toISOString(),provedor_ia:/\.xml$/i.test(f.name)?'xml':'openai' };
      const ins=await pool.query(`INSERT INTO document_intakes (arquivo_original_url,file_name_original,file_name_final,mime_type,status_processamento,status_registro,tipo_detectado,resultado_ia,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'ATIVO',$6,$7::jsonb,NOW(),NOW()) RETURNING id`,[`/api/files/${encodeURIComponent(disk)}`,f.name,finalName,/\.xml$/i.test(f.name)?'application/xml':'application/pdf',duplicate?'DUPLICADO':'AGUARDANDO_REVISAO',/\.xml$/i.test(f.name)?'NOTA_FISCAL_XML':'NOTA_FISCAL_PDF',JSON.stringify(ai)]);
      if (!duplicate && key) knownKeys.add(key); if (duplicate) duplicates++; else imported++;
      const folder=f.path.split('/').slice(0,-1).join('/'); const list=importedByFolder.get(folder)||[]; list.push({ id:ins.rows[0].id,type:/\.xml$/i.test(f.name)?'XML':'PDF',key,url:`/api/files/${encodeURIComponent(disk)}` }); importedByFolder.set(folder,list);
    } catch (e) { errors++; console.error('DRIVE_RECONCILE_FILE_ERROR',f.path,e.message); }
  }
  for (const list of importedByFolder.values()) for (const pdf of list.filter(x=>x.type==='PDF'&&x.key)) { const xml=list.find(x=>x.type==='XML'&&x.key===pdf.key); if (!xml) continue; await pool.query(`UPDATE document_intakes SET nf_xml_intake_id=$1,nf_xml_url=$2,grupo_status='COMPLETO' WHERE id=$3`,[xml.id,xml.url,pdf.id]); await pool.query(`UPDATE document_intakes SET nf_pdf_intake_id=$1,nf_pdf_url=$2,grupo_status='COMPLETO',ocultar_entrada_unica=TRUE WHERE id=$3`,[pdf.id,pdf.url,xml.id]); }
  console.log('DRIVE_RECONCILE_DONE',JSON.stringify({ source_files:source.length,target_files:target.length,imported,duplicates,errors }));
}
run().finally(()=>pool.end());
