import pg from 'pg';
import { google } from 'googleapis';

const APPLY = process.argv.includes('--apply');

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
  const planned=[];
  const review=[];
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
        md5:file?.md5Checksum || null,size:file?.size || null,mime:file?.mimeType || null,parents:file?.parents || [],trashed:file?.trashed || false,
        pdf_url:row.nf_pdf_url || null,xml_url:row.nf_xml_url || null,
        doc_count:Number(row.doc_count),link_count:Number(row.link_count),bank_count:Number(row.bank_count),error});
    }
    result.push({key,entries});
    const first=entries[0];
    const sameBytes=Boolean(first.md5 && first.size && first.mime === 'application/pdf')
      && entries.every(entry => !entry.error && !entry.trashed && entry.md5===first.md5
        && entry.size===first.size && entry.mime===first.mime
        && entry.parents.some(parent=>first.parents.includes(parent)));
    const multipleBankLinks=entries.filter(entry=>entry.bank_count>0).length>1;
    if (!sameBytes || multipleBankLinks) {
      review.push({key,ids:entries.map(entry=>entry.id),reason:multipleBankLinks?'multiple_bank_links':'drive_hash_not_confirmed'});
      continue;
    }
    const entryById=new Map(entries.map(entry=>[entry.id,entry]));
    const score=row=>{const entry=entryById.get(row.id);return entry.bank_count*100000 + entry.link_count*10000
      + entry.doc_count*1000 + Number(Boolean(row.nf_pdf_url))*20 + Number(Boolean(row.nf_xml_url))*10;};
    const ranked=[...group].sort((a,b)=>score(b)-score(a)
      || new Date(a.created_date||0)-new Date(b.created_date||0) || String(a.id).localeCompare(String(b.id)));
    planned.push({key,canonical:ranked[0],duplicates:ranked.slice(1),md5:first.md5,
      cross_rubrica:new Set(group.map(row=>String(row.rubrica_id||''))).size>1});
  }
  const summary={mode:APPLY?'apply':'dry_run',groups:result.length,
    confirmed:planned.length,purchases_to_exclude:planned.reduce((sum,group)=>sum+group.duplicates.length,0),
    cents_to_reverse:planned.reduce((sum,group)=>sum+group.duplicates.reduce((n,row)=>n+cents(row),0),0),
    planned:planned.map(group=>({key:group.key,canonical:group.canonical.id,
      duplicates:group.duplicates.map(row=>row.id),cross_rubrica:group.cross_rubrica})),review};
  if(APPLY && planned.length) {
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      const ids=planned.flatMap(group=>[group.canonical.id,...group.duplicates.map(row=>row.id)]).sort();
      const current=(await db.query('SELECT * FROM purchase_requests WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[ids])).rows;
      if(current.length!==ids.length || current.some(row=>row.incluir_no_somatorio===false || row.duplicada_financeira===true))
        throw new Error('purchase_state_changed_retry');
      for(const group of planned) {
        const fiscalKey=row=>`${digits(row.nf_emitente_cpf_cnpj)}|${number(row.nf_numero)}|${date(row.nf_data_emissao)}|${cents(row)}`;
        if([group.canonical,...group.duplicates].some(row=>fiscalKey(current.find(item=>item.id===row.id))!==group.key))
          throw new Error('fiscal_key_changed_retry');
        for(const duplicate of group.duplicates) {
          const audit={action:'exclude_hash_confirmed_duplicate',at:new Date().toISOString(),
            fiscal_key:group.key,drive_md5:group.md5,canonical_id:group.canonical.id,
            cross_rubrica:group.cross_rubrica,
            before:{incluir_no_somatorio:duplicate.incluir_no_somatorio,
              duplicada_financeira:duplicate.duplicada_financeira,duplicata_de:duplicate.duplicata_de}};
          await db.query(`UPDATE purchase_requests SET incluir_no_somatorio=FALSE,duplicada_financeira=TRUE,
            duplicata_de=$2,raw_data=jsonb_set(COALESCE(raw_data,'{}'::jsonb),'{financial_correction_history}',
              COALESCE(CASE WHEN jsonb_typeof(raw_data->'financial_correction_history')='array'
                THEN raw_data->'financial_correction_history' ELSE '[]'::jsonb END,'[]'::jsonb)||$3::jsonb),
            updated_at=NOW(),updated_date=NOW() WHERE id=$1`,[duplicate.id,group.canonical.id,JSON.stringify([audit])]);
        }
      }
      await db.query(`WITH used AS (SELECT p.rubrica_id,ROUND(SUM(CASE
        WHEN p.raw_data #>> '{official_balancete,eligible_cents}' ~ '^[0-9]+$'
          THEN (p.raw_data #>> '{official_balancete,eligible_cents}')::numeric / 100
        WHEN p.nf_valor_total>0 THEN p.nf_valor_total WHEN p.valor_aprovado>0 THEN p.valor_aprovado
        WHEN p.valor_total>0 THEN p.valor_total ELSE COALESCE(p.valor_solicitado,0) END)::numeric,2) AS amount
        FROM purchase_requests p WHERE p.rubrica_id IS NOT NULL
          AND UPPER(COALESCE(p.status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
          AND COALESCE(p.incluir_no_somatorio,TRUE) IS DISTINCT FROM FALSE
          AND COALESCE(p.duplicada_financeira,FALSE)=FALSE GROUP BY p.rubrica_id)
        UPDATE rubricas r SET valor_utilizado=COALESCE(u.amount,0),
          saldo=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),
          saldo_real=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),
          percentual_utilizado=CASE WHEN COALESCE(r.valor_total,r.valor_rubrica,0)>0
            THEN ROUND(COALESCE(u.amount,0)/COALESCE(r.valor_total,r.valor_rubrica,0)*100,2) ELSE 0 END,
          updated_at=NOW() FROM (SELECT id FROM rubricas) all_r
          LEFT JOIN used u ON u.rubrica_id=all_r.id WHERE r.id=all_r.id`);
      await db.query('COMMIT');
    } catch(error) {await db.query('ROLLBACK').catch(()=>{});throw error;}
    finally {db.release();}
  }
  console.log('AMBIGUOUS_INVOICE_HASHES',JSON.stringify(summary));
  await pool.end();
}
main().catch(error=>{console.error('AMBIGUOUS_INVOICE_HASHES_ERROR',error.message);process.exitCode=1;pool.end().catch(()=>{});});
