import pg from 'pg';
import { google } from 'googleapis';

// Only the Drive copy belonging to an already-proven fiscal duplicate may be
// trashed, and only after identical bytes, folder and references are checked.
// Trashing is recoverable; the original local PDF/XML and canonical Drive file
// are never deleted. Dry-run by default.
const APPLY = process.argv.includes('--apply');
const { Pool } = pg;
const pool = new Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || '',
});
const digits = value => String(value || '').replace(/\D/g,'');
const number = value => digits(value).replace(/^0+/,'') || '0';
const date = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const cents = row => Math.round(Number(row.nf_valor_total || row.valor_aprovado || row.valor_total || row.valor_solicitado || 0) * 100);
const sameFiscalKey = (a,b) => digits(a.nf_emitente_cpf_cnpj).length === 14
  && digits(a.nf_emitente_cpf_cnpj) === digits(b.nf_emitente_cpf_cnpj)
  && number(a.nf_numero) === number(b.nf_numero)
  && date(a.nf_data_emissao) === date(b.nf_data_emissao)
  && cents(a) > 0 && cents(a) === cents(b);
const fileIdFrom = value => String(value || '').match(/(?:drive\.google\.com\/file\/d\/|[?&]id=)([A-Za-z0-9_-]{5,})/i)?.[1] || '';
const idOf = row => String(row.drive_file_id || '').trim() || fileIdFrom(row.drive_file_url) || fileIdFrom(row.drive_backup_nf_pdf_link);

async function main() {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN)
    throw new Error('drive_credentials_missing');
  const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID,process.env.GOOGLE_DRIVE_CLIENT_SECRET);
  auth.setCredentials({refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN});
  const drive = google.drive({version:'v3',auth});
  const db = await pool.connect();
  const summary = { mode:APPLY ? 'apply' : 'dry_run', examined:0, eligible:[], skipped:[], trashed:[], errors:[] };
  try {
    const pairs = (await db.query(`SELECT d.*,to_jsonb(c) AS canonical
      FROM purchase_requests d JOIN purchase_requests c ON c.id=d.duplicata_de
      WHERE d.duplicada_financeira=TRUE AND d.incluir_no_somatorio=FALSE
        AND d.duplicata_de IS NOT NULL ORDER BY d.id`)).rows;
    for (const duplicate of pairs) {
      summary.examined++;
      const canonical = duplicate.canonical;
      const duplicateId = idOf(duplicate);
      const canonicalId = idOf(canonical);
      const label = { duplicate:duplicate.id, canonical:canonical.id, duplicate_drive_id:duplicateId, canonical_drive_id:canonicalId };
      if (!sameFiscalKey(duplicate,canonical) || !duplicateId || !canonicalId || duplicateId === canonicalId) {
        summary.skipped.push({ ...label, reason:'fiscal_or_drive_identity_missing' }); continue;
      }
      try {
        const [source,target] = await Promise.all([duplicateId,canonicalId].map(async fileId =>
          (await drive.files.get({ fileId, fields:'id,name,mimeType,md5Checksum,size,parents,trashed,webViewLink',supportsAllDrives:true })).data));
        const sameFolder = (source.parents || []).some(parent => (target.parents || []).includes(parent));
        if (source.trashed || target.trashed || !source.md5Checksum || source.md5Checksum !== target.md5Checksum
          || String(source.size || '') !== String(target.size || '') || source.mimeType !== target.mimeType || !sameFolder) {
          summary.skipped.push({ ...label, reason:'hash_size_type_or_folder_mismatch', source_hash:source.md5Checksum || null, target_hash:target.md5Checksum || null }); continue;
        }
        const refs = (await db.query(`SELECT
          (SELECT COUNT(*) FROM purchase_requests WHERE drive_file_id=$1 AND id<>$2) AS other_purchases,
          (SELECT COUNT(*) FROM purchase_documents WHERE drive_file_id=$1) AS purchase_documents,
          (SELECT COUNT(*) FROM attachments WHERE drive_file_id=$1) AS attachments,
          (SELECT COUNT(*) FROM report_photos WHERE drive_file_id=$1) AS report_photos,
          (SELECT COUNT(*) FROM document_intakes WHERE arquivo_original_url LIKE '%'||$1||'%' OR nf_pdf_url LIKE '%'||$1||'%' OR nf_xml_url LIKE '%'||$1||'%') AS intakes`,
          [duplicateId,duplicate.id])).rows[0];
        if (Object.values(refs).some(value => Number(value) > 0)) {
          const documents = (await db.query(`SELECT id,purchase_request_id,attachment_id,document_type,file_url,drive_file_url
            FROM purchase_documents WHERE drive_file_id=$1`,[duplicateId])).rows;
          const attachments = (await db.query(`SELECT id,purchase_request_id,report_id,activity_id,document_intake_id,file_url
            FROM attachments WHERE drive_file_id=$1`,[duplicateId])).rows;
          summary.skipped.push({ ...label, reason:'other_app_references', references:refs,
            linked_documents:documents, linked_attachments:attachments }); continue;
        }
        summary.eligible.push({ ...label, checksum:source.md5Checksum, folder:source.parents?.[0] || null });
        if (!APPLY) continue;
        const targetLink = target.webViewLink || `https://drive.google.com/file/d/${canonicalId}/view`;
        await db.query('BEGIN');
        const current = (await db.query('SELECT drive_file_id,duplicata_de,duplicada_financeira,incluir_no_somatorio FROM purchase_requests WHERE id=$1 FOR UPDATE',[duplicate.id])).rows[0];
        if (current?.drive_file_id !== duplicateId || current?.duplicata_de !== canonical.id
          || current?.duplicada_financeira !== true || current?.incluir_no_somatorio !== false) throw new Error('purchase_changed_retry');
        const audit = { action:'consolidate_identical_drive_copy', at:new Date().toISOString(),
          old_drive_file_id:duplicateId, canonical_drive_file_id:canonicalId, md5:source.md5Checksum,
          original_name:source.name, original_parents:source.parents };
        await db.query(`UPDATE purchase_requests SET drive_file_id=$2,drive_file_url=$3,drive_backup_nf_pdf_link=$3,
          raw_data=jsonb_set(COALESCE(raw_data,'{}'::jsonb),'{drive_dedupe_history}',
            COALESCE(CASE WHEN jsonb_typeof(raw_data->'drive_dedupe_history')='array' THEN raw_data->'drive_dedupe_history' ELSE '[]'::jsonb END,'[]'::jsonb)||$4::jsonb),
          updated_at=NOW(),updated_date=NOW() WHERE id=$1`,[duplicate.id,canonicalId,targetLink,JSON.stringify([audit])]);
        await db.query('COMMIT');
        await drive.files.update({ fileId:duplicateId, requestBody:{trashed:true}, fields:'id,trashed', supportsAllDrives:true });
        summary.trashed.push(duplicateId);
      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        summary.errors.push({ ...label, error:error.message });
      }
    }
    console.log('DRIVE_PURCHASE_DUPLICATES',JSON.stringify(summary));
    if (summary.errors.length) process.exitCode=1;
  } finally { db.release(); await pool.end(); }
}
main().catch(error => { console.error('DRIVE_PURCHASE_DUPLICATES_ERROR',error.message); process.exitCode=1; });
