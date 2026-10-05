import pg from 'pg';
import { google } from 'googleapis';

const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || '',
});
const digits = value => String(value || '').replace(/\D/g,'');
const number = value => digits(value).replace(/^0+/, '') || '0';
const date = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const cents = row => Math.round(Number(row.nf_valor_total || row.valor_aprovado || row.valor_total || row.valor_solicitado || 0) * 100);
const fileId = row => String(row.drive_file_id || '').trim()
  || String(row.drive_file_url || '').match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || '';

async function main() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID,process.env.GOOGLE_DRIVE_CLIENT_SECRET);
  auth.setCredentials({refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN});
  const drive = google.drive({version:'v3',auth});
  const rows = (await pool.query(`SELECT p.*,
    (SELECT COUNT(*) FROM purchase_documents d WHERE d.purchase_request_id=p.id) AS doc_count,
    (SELECT COUNT(*) FROM financial_document_links f WHERE f.purchase_request_id=p.id) AS link_count,
    (SELECT COUNT(*) FROM movimentacoes_bancarias m WHERE m.purchase_request_id=p.id) AS bank_count
    FROM purchase_requests p WHERE p.incluir_no_somatorio IS DISTINCT FROM FALSE
      AND p.duplicada_financeira IS DISTINCT FROM TRUE
      AND UPPER(p.status) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')`)).rows;
  const groups = new Map();
  for (const row of rows) {
    const tax=digits(row.nf_emitente_cpf_cnpj), nf=number(row.nf_numero), issued=date(row.nf_data_emissao), value=cents(row);
    if (tax.length!==14 || nf==='0' || !issued || value<=0) continue;
    const key=`${tax}|${nf}|${issued}|${value}`;
    groups.set(key,[...(groups.get(key)||[]),row]);
  }
  const result=[];
  const metadata=new Map();
  for (const [key,group] of groups) {
    if(group.length<2) continue;
    const entries=[];
    for (const row of group) {
      const id=fileId(row);
      let file=null, error=null;
      if (id) {
        if (!metadata.has(id)) metadata.set(id,drive.files.get({fileId:id,fields:'id,name,md5Checksum,size,mimeType,parents,trashed',supportsAllDrives:true})
          .then(response=>response.data).catch(cause=>({error:cause.message})));
        const fetched=await metadata.get(id);
        if (fetched.error) error=fetched.error; else file=fetched;
      }
      entries.push({id:row.id,rubrica_id:row.rubrica_id,status:row.status,drive_id:id,
        md5:file?.md5Checksum || null,size:file?.size || null,parents:file?.parents || [],trashed:file?.trashed || false,
        pdf_url:row.nf_pdf_url || null,xml_url:row.nf_xml_url || null,
        doc_count:Number(row.doc_count),link_count:Number(row.link_count),bank_count:Number(row.bank_count),error});
    }
    result.push({key,entries});
  }
  console.log('AMBIGUOUS_INVOICE_HASHES',JSON.stringify({groups:result.length,items:result}));
  await pool.end();
}
main().catch(error=>{console.error('AMBIGUOUS_INVOICE_HASHES_ERROR',error.message);process.exitCode=1;pool.end().catch(()=>{});});
