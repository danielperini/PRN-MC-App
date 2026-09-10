import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { google } from 'googleapis';

const SOURCE_ROOT = process.env.DRIVE_RECONCILE_SOURCE_ROOT || '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const TARGET_ROOT = process.env.GOOGLE_DRIVE_FOLDER_ID || '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const ONLY_MONTH = String(process.env.DRIVE_RECONCILE_MONTH || '').trim();
const SOURCE_MONTH_ONLY = String(process.env.DRIVE_RECONCILE_SOURCE_MONTH_ONLY || '') === '1';
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
const analysisCacheFile=path.join(uploadDir,'.drive-reconcile-analysis-cache.json');
const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || ''
});
const clean = (v) => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim();
const comparable = (v) => clean(v).toUpperCase().replace(/\b(MUSEUS?|CENTRO|NOTA|FISCAL|NF|PDF|XML|LTDA|ME|EPP)\b/g,' ').replace(/[^A-Z0-9]/g,'');
const digits = (v) => String(v || '').replace(/\D/g, '');
const tag = (xml, name) => (xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</(?:\\w+:)?${name}>`, 'i'))?.[1] || '').trim();
const fiscalKey = (m) => [digits(m.cnpj || m.cpf), String(m.numero || '').replace(/^0+/, ''), String(Number(m.valor || 0).toFixed(2)), String(m.data || '').slice(0, 10)].join('|');
const brl = (v) => Number(v || 0).toLocaleString('pt-BR',{ minimumFractionDigits:2,maximumFractionDigits:2 });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function mapLimit(items,limit,worker) {
  const results=new Array(items.length); let cursor=0;
  async function next(){ while(true){ const index=cursor++; if(index>=items.length) return; results[index]=await worker(items[index],index); } }
  await Promise.all(Array.from({ length:Math.min(limit,items.length) },()=>next()));
  return results;
}
async function fetchWithRetry(url, options, label, maxAttempts=8) {
  let response;
  for (let attempt=1; attempt<=maxAttempts; attempt++) {
    response=await fetch(url,options);
    if (response.ok || ![429,500,502,503,504].includes(response.status)) return response;
    if (attempt===maxAttempts) return response;
    const retryAfter=Number(response.headers.get('retry-after'));
    const waitMs=Number.isFinite(retryAfter) && retryAfter>0
      ? retryAfter*1000
      : Math.min(180000, 20000*(2**(attempt-1))) + Math.floor(Math.random()*3000);
    console.warn(`DRIVE_RECONCILE_RETRY ${label} status=${response.status} attempt=${attempt}/${maxAttempts} wait_ms=${waitMs}`);
    await sleep(waitMs);
  }
  return response;
}
function standardName(meta, original) {
  const extension=/\.xml$/i.test(original)?'.xml':'.pdf';
  const number=clean(meta.numero || meta.nf_numero || 'SEM-NUM');
  const supplier=clean(meta.fornecedor || meta.nf_emitente_nome || '').replace(/^VIADUTO DAS ARTES$/i,'') || 'FORNECEDOR A REVISAR';
  return clean(`${number} - ${supplier} - MUSEUS CENTRO - R$ ${brl(meta.valor || meta.nf_valor_total)}`)+extension;
}

function xmlMeta(xml) {
  const emit = xml.match(/<(?:\w+:)?emit(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?emit>/i)?.[1] || '';
  const provider=emit || xml.match(/<(?:\w+:)?(?:PrestadorServico|Prestador)(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?(?:PrestadorServico|Prestador)>/i)?.[1] || xml;
  return {
    numero:tag(xml,'nNF') || tag(xml,'NumeroNfse') || tag(xml,'Numero'),
    valor:tag(xml,'vNF') || tag(xml,'ValorLiquidoNfse') || tag(xml,'ValorServicos') || tag(xml,'ValorNota'),
    data:tag(xml,'dhEmi') || tag(xml,'dEmi') || tag(xml,'DataEmissao') || tag(xml,'DataEmissaoNfse') || xml.match(/\b(20\d{2}-[01]\d-[0-3]\d)(?:T|\b)/)?.[1] || '',
    fornecedor:tag(provider,'xNome') || tag(provider,'RazaoSocial') || tag(provider,'NomeRazaoSocial'),
    cnpj:tag(provider,'CNPJ') || tag(provider,'Cnpj'), cpf:tag(provider,'CPF') || tag(provider,'Cpf')
  };
}
function xmlPdfConfidence(pdf, xmlEntry) {
  const hay=comparable(`${pdf.name} ${pdf.path}`); const meta=xmlEntry.meta;
  const number=String(meta.numero||'').replace(/^0+/,'');
  const supplier=comparable(meta.fornecedor||'');
  const supplierTokens=clean(meta.fornecedor||'').toUpperCase().split(/\s+/).filter(x=>x.length>=4 && !['LTDA','EIRELI'].includes(x));
  const value=Number(meta.valor||0); const valueDigits=String(value.toFixed(2)).replace(/\D/g,'');
  let score=0;
  if (number && new RegExp(`(?:^|\\D)0*${number}(?:\\D|$)`).test(`${pdf.name} ${pdf.path}`)) score+=0.35;
  if (supplier && hay.includes(supplier)) score+=0.25;
  else if (supplierTokens.length && supplierTokens.filter(t=>hay.includes(comparable(t))).length/supplierTokens.length>=0.6) score+=0.25;
  if (value>0 && (hay.includes(valueDigits) || hay.includes(String(Math.trunc(value))))) score+=0.25;
  const pdfFolder=pdf.path.split('/').slice(0,-1).join('/'); const xmlFolder=xmlEntry.file.path.split('/').slice(0,-1).join('/');
  if (pdfFolder===xmlFolder) score+=0.15;
  const pdfStem=comparable(pdf.name.replace(/\.pdf$/i,'')); const xmlStem=comparable(xmlEntry.file.name.replace(/\.xml$/i,''));
  if (pdfStem && xmlStem && (pdfStem===xmlStem || pdfStem.includes(xmlStem) || xmlStem.includes(pdfStem))) score=1;
  return Math.min(1,score);
}
function shouldAnalyzeUnmatchedPdf(file) {
  const name=clean(file.name||'').toUpperCase();
  const fiscalOrPayment=/\b(NF|NFS|NFSE|DANFE|NOTA FISCAL|RECIBO|COMPROVANTE|PAGAMENTO|PIX|TED|TRANSFERENCIA)\b/.test(name) || /^\s*(?:SEM-NUM|\d{1,12})\s*-/.test(name);
  const administrative=/\b(CONTRATO|RELATORIO|TERMO|ADITIVO|ATA|ORCAMENTO|PROPOSTA|CURRICULO|PLANO DE TRABALHO|FOTO|IMAGEM|ATIVIDADE)\b/.test(name);
  return fiscalOrPayment && !administrative;
}
function monthAllowed(p) {
  const m = String(p).match(/(?:^|\/)(0?[1-9]|1[0-2])[-_/](20\d{2})(?:\/|$)/);
  if (!m) return false;
  if (ONLY_MONTH && `${String(Number(m[1])).padStart(2,'0')}-${m[2]}` !== ONLY_MONTH) return false;
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
  const up=await fetchWithRetry('https://api.openai.com/v1/files',{ method:'POST',headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` },body:form },'openai_upload');
  if (!up.ok) throw new Error(`OpenAI upload ${up.status}`); const file=await up.json();
  try {
    let result={};
    for (let attempt=1;attempt<=3;attempt++) {
      const prompt=`Faça OCR integral do documento, inclusive cabeçalho, rodapé e QR code. Classifique tipo_documento estritamente como NOTA_FISCAL, COMPROVANTE_PAGAMENTO ou OUTRO. Contratos, relatórios, fotos e recibos que não comprovem pagamento são OUTRO. A data fiscal é obrigatória para nota. Em comprovante, extraia favorecido e valor pago. Tentativa ${attempt}/3. Retorne somente JSON: {"tipo_documento":"","nf_numero":"","nf_valor_total":0,"nf_data_emissao":"YYYY-MM-DD","nf_emitente_nome":"","nf_emitente_cpf_cnpj":"","descricao_servico":""}. Use o conteúdo, nunca o nome do arquivo.`;
      const rr=await fetchWithRetry('https://api.openai.com/v1/responses',{ method:'POST',headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json' },body:JSON.stringify({ model:process.env.OPENAI_INVOICE_MODEL || 'gpt-4.1-mini', input:[{ role:'user',content:[{ type:'input_text',text:prompt },{ type:'input_file',file_id:file.id }] }], text:{ format:{ type:'json_object' } } }) },'openai_analysis');
      if (!rr.ok) throw new Error(`OpenAI response ${rr.status}`); const env=await rr.json(); const text=env.output_text || env.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text || '{}'; result={ ...result,...JSON.parse(text) };
      if (result.tipo_documento==='COMPROVANTE_PAGAMENTO' && Number(result.nf_valor_total)>0 && result.nf_emitente_cpf_cnpj) return result;
      if (result.tipo_documento==='OUTRO') return result;
      if (result.nf_data_emissao && result.nf_numero && Number(result.nf_valor_total)>0 && result.nf_emitente_cpf_cnpj) return result;
    }
    if (!result.nf_data_emissao) throw new Error('Data de emissão não localizada após 3 leituras OCR');
    return result;
  } finally { await fetch(`https://api.openai.com/v1/files/${file.id}`,{ method:'DELETE',headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` } }).catch(()=>{}); }
}
function loadAnalysisCache() {
  try { return JSON.parse(fs.readFileSync(analysisCacheFile,'utf8')); } catch { return {}; }
}
function saveAnalysisCache(cache) {
  const tmp=`${analysisCacheFile}.tmp`; fs.writeFileSync(tmp,JSON.stringify(cache)); fs.renameSync(tmp,analysisCacheFile);
}
async function removeExactDuplicates() {
  const r=await pool.query(`SELECT id,tipo_detectado,resultado_ia,entidade_destino_id,attachment_id,revisado_pelo_usuario,created_at FROM document_intakes WHERE COALESCE(status_registro,'')<>'DELETADO'`);
  const groups=new Map();
  for(const row of r.rows){ const a=row.resultado_ia||{}; if(!a.nf_numero||!a.nf_emitente_cpf_cnpj||!a.nf_data_emissao||!Number(a.nf_valor_total)) continue; const k=`${row.tipo_detectado}|${fiscalKey({cnpj:a.nf_emitente_cpf_cnpj,numero:a.nf_numero,valor:a.nf_valor_total,data:a.nf_data_emissao})}`; const list=groups.get(k)||[]; list.push(row); groups.set(k,list); }
  let removed=0;
  for(const list of groups.values()){ if(list.length<2) continue; list.sort((a,b)=>((b.entidade_destino_id?100:0)+(b.attachment_id?50:0)+(b.revisado_pelo_usuario?20:0))-((a.entidade_destino_id?100:0)+(a.attachment_id?50:0)+(a.revisado_pelo_usuario?20:0)) || Number(a.id)-Number(b.id)); const discard=list.slice(1).map(x=>x.id); if(discard.length){ await pool.query(`UPDATE document_intakes SET status_registro='DELETADO',status_processamento='DUPLICADO_REMOVIDO',updated_at=NOW() WHERE id=ANY($1::bigint[])`,[discard]); removed+=discard.length; } }
  return removed;
}
async function prepareXmlStaging(sourceEntries,targetEntries,runId) {
  await pool.query(`CREATE UNLOGGED TABLE IF NOT EXISTS drive_reconcile_xml_staging (
    run_id text NOT NULL, source_scope text NOT NULL, drive_file_id text NOT NULL,
    file_name text, drive_path text, emission_date date, amount numeric(16,2), tax_id text,
    invoice_number text, fiscal_key text, is_duplicate boolean DEFAULT false,
    matched_scope text, created_at timestamptz DEFAULT NOW(),
    PRIMARY KEY (run_id,source_scope,drive_file_id)
  )`);
  await pool.query(`DELETE FROM drive_reconcile_xml_staging WHERE run_id=$1`,[runId]);
  for (const entry of [...sourceEntries.map(x=>({ ...x,scope:'SOURCE' })),...targetEntries.map(x=>({ ...x,scope:'TARGET' }))]) {
    const m=entry.meta; const key=m.numero ? fiscalKey(m) : null;
    await pool.query(`INSERT INTO drive_reconcile_xml_staging
      (run_id,source_scope,drive_file_id,file_name,drive_path,emission_date,amount,tax_id,invoice_number,fiscal_key)
      VALUES ($1,$2,$3,$4,$5,NULLIF($6,'')::date,$7,$8,$9,$10)
      ON CONFLICT (run_id,source_scope,drive_file_id) DO UPDATE SET
      file_name=EXCLUDED.file_name,drive_path=EXCLUDED.drive_path,emission_date=EXCLUDED.emission_date,
      amount=EXCLUDED.amount,tax_id=EXCLUDED.tax_id,invoice_number=EXCLUDED.invoice_number,fiscal_key=EXCLUDED.fiscal_key`,
      [runId,entry.scope,entry.file.id,entry.file.name,entry.file.path,String(m.data||'').slice(0,10),Number(m.valor||0),digits(m.cnpj||m.cpf),m.numero||'',key]);
  }
  await pool.query(`UPDATE drive_reconcile_xml_staging s SET is_duplicate=true,matched_scope='TARGET'
    WHERE s.run_id=$1 AND s.source_scope='SOURCE' AND s.fiscal_key IS NOT NULL AND EXISTS
    (SELECT 1 FROM drive_reconcile_xml_staging t WHERE t.run_id=s.run_id AND t.source_scope='TARGET' AND t.fiscal_key=s.fiscal_key)`,[runId]);
  await pool.query(`WITH ranked AS (SELECT ctid,row_number() OVER(PARTITION BY fiscal_key ORDER BY drive_path,drive_file_id) rn
    FROM drive_reconcile_xml_staging WHERE run_id=$1 AND source_scope='SOURCE' AND fiscal_key IS NOT NULL)
    UPDATE drive_reconcile_xml_staging s SET is_duplicate=true,matched_scope=COALESCE(matched_scope,'SOURCE')
    FROM ranked r WHERE s.ctid=r.ctid AND r.rn>1`,[runId]);
  const summary=await pool.query(`SELECT source_scope,is_duplicate,count(*)::int total FROM drive_reconcile_xml_staging WHERE run_id=$1 GROUP BY 1,2 ORDER BY 1,2`,[runId]);
  console.log('DRIVE_RECONCILE_XML_STAGING',JSON.stringify({ run_id:runId,rows:summary.rows }));
}
async function run() {
  fs.mkdirSync(uploadDir,{ recursive:true }); const drive=await driveClient();
  const analysisCache=loadAnalysisCache();
  const [sourceAll,targetAll]=await Promise.all([tree(drive,SOURCE_ROOT),tree(drive,TARGET_ROOT)]);
  const sourceCandidates=sourceAll.filter(f=>/\.(pdf|xml)$/i.test(f.name) && (SOURCE_MONTH_ONLY ? monthAllowed(f.path) : (ONLY_MONTH || monthAllowed(f.path))));
  const source=Array.from(new Map(sourceCandidates.map(f=>[f.md5Checksum || f.id,f])).values());
  console.log('DRIVE_RECONCILE_INVENTORY',JSON.stringify({ source_total:sourceAll.length,source_candidates:source.length,source_xml:source.filter(f=>/\.xml$/i.test(f.name)).length,source_pdf:source.filter(f=>/\.pdf$/i.test(f.name)).length,target_total:targetAll.length }));
  const runId=`${ONLY_MONTH||'all'}-${Date.now()}`; const xmlCache=new Map(); const sourceXmlEntries=[]; let xmlIndex=[];
  const indexedSourceXml=await mapLimit(source.filter(f=>/\.xml$/i.test(f.name)),8,async file=>{
    try { const buffer=await bytes(drive,file.id); const meta=xmlMeta(buffer.toString('utf8')); xmlCache.set(file.id,buffer); return meta.numero && meta.valor && meta.data ? { file,meta } : null; }
    catch(e) { console.error('DRIVE_RECONCILE_XML_INDEX_ERROR',file.path,e.message); return null; }
  });
  sourceXmlEntries.push(...indexedSourceXml.filter(Boolean));
  const target=targetAll.filter(f=>/\.(pdf|xml)$/i.test(f.name)); const targetHashes=new Set(target.map(f=>f.md5Checksum).filter(Boolean));
  const knownKeys=new Set();
  const targetXml=target.filter(x=>/\.xml$/i.test(x.name) && (!ONLY_MONTH || x.path.includes(ONLY_MONTH)));
  const targetXmlEntries=(await mapLimit(targetXml,8,async f=>{ try { const m=xmlMeta((await bytes(drive,f.id)).toString('utf8')); if(m.numero){ knownKeys.add(fiscalKey(m)); return { file:f,meta:m }; } } catch {} return null; })).filter(Boolean);
  await prepareXmlStaging(sourceXmlEntries,targetXmlEntries,runId);
  const uniqueXmlRows=await pool.query(`SELECT drive_file_id FROM drive_reconcile_xml_staging WHERE run_id=$1 AND source_scope='SOURCE' AND is_duplicate=false`,[runId]);
  const uniqueXmlIds=new Set(uniqueXmlRows.rows.map(x=>String(x.drive_file_id)));
  xmlIndex=sourceXmlEntries.filter(x=>uniqueXmlIds.has(String(x.file.id)));
  const existing=await pool.query(`SELECT id,file_name_original,file_name_final,resultado_ia,status_processamento FROM document_intakes WHERE COALESCE(status_registro,'')<>'DELETADO'`);
  const knownSourceIds=new Set(); const invoicesByPartyValue=new Map();
  for (const row of existing.rows) { const a=row.resultado_ia || {}; if(a.source_drive_file_id) knownSourceIds.add(String(a.source_drive_file_id)); const k=fiscalKey({ cnpj:a.nf_emitente_cpf_cnpj,numero:a.nf_numero,valor:a.nf_valor_total,data:a.nf_data_emissao }); if (a.nf_numero) { knownKeys.add(k); const pv=`${digits(a.nf_emitente_cpf_cnpj)}|${Number(a.nf_valor_total||0).toFixed(2)}`; const list=invoicesByPartyValue.get(pv)||[]; list.push({ ...row,key:k,data:a.nf_data_emissao }); invoicesByPartyValue.set(pv,list); } }
  let imported=0,duplicates=0,errors=0; const importedByFolder=new Map();
  for (const f of source.sort((a,b)=>/\.xml$/i.test(a.name)?-1:1)) {
    try {
      if (knownSourceIds.has(String(f.id))) { duplicates++; continue; }
      const buffer=xmlCache.get(f.id) || await bytes(drive,f.id); const hash=f.md5Checksum || crypto.createHash('md5').update(buffer).digest('hex');
      if (targetHashes.has(hash)) { duplicates++; continue; }
      let meta={};
      if (/\.xml$/i.test(f.name)) meta=xmlMeta(buffer.toString('utf8'));
      else {
        const matches=xmlIndex.map(x=>({ ...x,confidence:xmlPdfConfidence(f,x) })).filter(x=>x.confidence>=0.95).sort((a,b)=>b.confidence-a.confidence);
        if (matches.length===1 || (matches[0] && matches[0].confidence>matches[1]?.confidence)) {
          const x=matches[0]; meta={ ...x.meta,tipo_documento:'NOTA_FISCAL',nf_numero:x.meta.numero,nf_valor_total:Number(x.meta.valor),nf_data_emissao:x.meta.data,nf_emitente_nome:x.meta.fornecedor,nf_emitente_cpf_cnpj:x.meta.cnpj||x.meta.cpf,provedor_ia:'xml_correspondente',xml_source_drive_file_id:x.file.id,xml_match_confidence:x.confidence };
          console.log('DRIVE_RECONCILE_PDF_FROM_XML',f.path,x.file.path,x.confidence);
        } else {
          if (!shouldAnalyzeUnmatchedPdf(f)) {
            console.log('DRIVE_RECONCILE_IGNORED_NON_FISCAL',f.path);
            continue;
          }
          const cacheKey=f.md5Checksum || f.id;
          if (analysisCache[cacheKey]) meta={ ...analysisCache[cacheKey],provedor_ia:'cache_ocr' };
          else {
            meta=await analyzePdf(buffer,f.name);
            analysisCache[cacheKey]=meta;
            saveAnalysisCache(analysisCache);
          }
        }
      }
      if (!/\.xml$/i.test(f.name) && meta.tipo_documento==='OUTRO') continue;
      const mapped={ cnpj:meta.cnpj || meta.nf_emitente_cpf_cnpj,cpf:meta.cpf,numero:meta.numero || meta.nf_numero,valor:meta.valor || meta.nf_valor_total,data:meta.data || meta.nf_data_emissao };
      if (/\.xml$/i.test(f.name) && (!mapped.numero || !Number(mapped.valor) || !mapped.data)) {
        console.log('DRIVE_RECONCILE_IGNORED_NON_FISCAL_XML',f.path);
        continue;
      }
      const isProof=meta.tipo_documento==='COMPROVANTE_PAGAMENTO'; let parent=null;
      if (isProof) { const candidates=invoicesByPartyValue.get(`${digits(mapped.cnpj||mapped.cpf)}|${Number(mapped.valor||0).toFixed(2)}`)||[]; if(candidates.length===1){ parent=candidates[0]; mapped.data=parent.data; mapped.numero=(parent.resultado_ia||{}).nf_numero; } }
      if (!mapped.data) throw new Error(isProof?'Comprovante sem NF correspondente única':'Data de emissão fiscal ausente após leitura integral');
      if (ONLY_MONTH) { const m=String(mapped.data).slice(0,7).match(/^(\d{4})-(\d{2})$/); if(!m || `${m[2]}-${m[1]}`!==ONLY_MONTH) continue; }
      const key=mapped.numero ? fiscalKey(mapped) : ''; const duplicate=!isProof && key && knownKeys.has(key);
      const invoiceName=parent?.file_name_final || parent?.file_name_original || ''; const finalName=isProof&&invoiceName ? `${invoiceName.replace(/\.(pdf|xml)$/i,'')} - COMP.pdf` : standardName({ ...meta,...mapped },f.name); const disk=`${Date.now()}-${f.id}-${finalName}`; fs.writeFileSync(path.join(uploadDir,disk),buffer);
      let backup=null; const folderId=!duplicate ? await monthFolder(drive,mapped.data) : null;
      if (folderId) backup=(await drive.files.copy({ fileId:f.id,requestBody:{ name:finalName,parents:[folderId] },fields:'id,webViewLink',supportsAllDrives:true })).data;
      const ai={ ...meta, nf_numero:mapped.numero || '',nf_valor_total:Number(mapped.valor || 0),nf_data_emissao:String(mapped.data || '').slice(0,10),nf_emitente_nome:meta.fornecedor || meta.nf_emitente_nome || '',nf_emitente_cpf_cnpj:mapped.cnpj || mapped.cpf || '',source_drive_file_id:f.id,source_drive_path:f.path,source_md5:hash,drive_backup_file_id:backup?.id || null,drive_backup_url:backup?.webViewLink || null,duplicate_detected:Boolean(duplicate),duplicate_key:key || null,analisado_em:new Date().toISOString(),provedor_ia:/\.xml$/i.test(f.name)?'xml':(meta.provedor_ia||'openai') };
      const detected=isProof?'COMPROVANTE_PAGAMENTO':/\.xml$/i.test(f.name)?'NOTA_FISCAL_XML':'NOTA_FISCAL_PDF';
      const ins=await pool.query(`INSERT INTO document_intakes (arquivo_original_url,file_name_original,file_name_final,mime_type,status_processamento,status_registro,tipo_detectado,resultado_ia,nf_pdf_intake_id,grupo_status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'ATIVO',$6,$7::jsonb,$8,$9,NOW(),NOW()) RETURNING id`,[`/api/files/${encodeURIComponent(disk)}`,f.name,finalName,/\.xml$/i.test(f.name)?'application/xml':'application/pdf',duplicate?'DUPLICADO':'AGUARDANDO_REVISAO',detected,JSON.stringify(ai),parent?.id||null,parent?'COMPLETO':null]);
      if (!duplicate && key) knownKeys.add(key); if (duplicate) duplicates++; else imported++;
      const folder=f.path.split('/').slice(0,-1).join('/'); const list=importedByFolder.get(folder)||[]; list.push({ id:ins.rows[0].id,type:/\.xml$/i.test(f.name)?'XML':'PDF',key,url:`/api/files/${encodeURIComponent(disk)}` }); importedByFolder.set(folder,list);
    } catch (e) { errors++; console.error('DRIVE_RECONCILE_FILE_ERROR',f.path,e.message); }
  }
  for (const list of importedByFolder.values()) for (const pdf of list.filter(x=>x.type==='PDF'&&x.key)) { const xml=list.find(x=>x.type==='XML'&&x.key===pdf.key); if (!xml) continue; await pool.query(`UPDATE document_intakes SET nf_xml_intake_id=$1,nf_xml_url=$2,grupo_status='COMPLETO' WHERE id=$3`,[xml.id,xml.url,pdf.id]); await pool.query(`UPDATE document_intakes SET nf_pdf_intake_id=$1,nf_pdf_url=$2,grupo_status='COMPLETO',ocultar_entrada_unica=TRUE WHERE id=$3`,[pdf.id,pdf.url,xml.id]); }
  const duplicateRowsRemoved=await removeExactDuplicates();
  console.log('DRIVE_RECONCILE_DONE',JSON.stringify({ source_files:source.length,target_files:target.length,imported,duplicates,duplicate_rows_removed:duplicateRowsRemoved,errors }));
}
run().finally(()=>pool.end());
