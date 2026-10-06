import crypto from 'node:crypto';
import pg from 'pg';

// Restore report PDF evidence only when the attachment itself names a real report.
// Preserve the attachment records and snapshot each report before changing its editor projection.
const apply = process.argv.includes('--apply');
const { Pool } = pg;
const pool = new Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || '',
});
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = value => Array.isArray(value) ? value : [];
const str = value => String(value ?? '').trim();

async function sourceRows(db) {
  return (await db.query(`SELECT a.id AS attachment_id,a.file_name,a.file_url,a.file_type,
      a.description,a.local_file_size,a.source_file_size,a.created_date,
      a.local_md5,a.source_file_hash,a.activity_id AS source_activity_id,
      r.id AS report_id,r.raw_data AS report_raw,
      ra.base44_activity_id AS valid_activity_id
    FROM attachments a
    JOIN reports r ON r.id::text=a.report_id OR r.base44_id=a.report_id
    LEFT JOIN report_activities ra ON ra.report_id=r.id::text
      AND ra.base44_activity_id=a.activity_id
    WHERE a.file_type='application/pdf' AND a.file_url IS NOT NULL AND a.file_url<>''
    ORDER BY r.id,a.id`)).rows;
}

function plan(rows) {
  const byReport = new Map();
  const seen = new Set();
  let repeatedSources = 0;
  for (const row of rows) {
    const fingerprint = str(row.local_md5 || row.source_file_hash) || str(row.file_url);
    const identity = `${row.report_id}|${fingerprint}`;
    if (seen.has(identity)) { repeatedSources++; continue; }
    seen.add(identity);
    const existing = list(obj(row.report_raw).attachments);
    if (existing.some(item => str(item.sourceAttachmentId) === str(row.attachment_id)
      || str(item.url) === str(row.file_url))) continue;
    const document = {
      name:row.file_name || `Documento ${row.attachment_id}.pdf`,
      url:row.file_url,type:row.file_type,
      size:Number(row.local_file_size || row.source_file_size || 0),
      created_at:row.created_date || null,caption:row.description || '',
      atividadeId:row.valid_activity_id || '',
      sourceAttachmentId:String(row.attachment_id),
    };
    byReport.set(String(row.report_id),[...(byReport.get(String(row.report_id)) || []),document]);
  }
  return {byReport,repeatedSources};
}

const db = await pool.connect();
const runId = crypto.randomUUID();
try {
  const sources = await sourceRows(db);
  const initial = plan(sources);
  const summary = {run_id:runId,mode:apply?'apply':'dry_run',source_documents:sources.length,
    repeated_sources:initial.repeatedSources,reports_to_update:initial.byReport.size,
    documents_to_restore:[...initial.byReport.values()].reduce((n,items)=>n+items.length,0),
    documents_with_valid_activity:[...initial.byReport.values()].flat().filter(item=>item.atividadeId).length,
    reports_updated:0,documents_restored:0};
  if (!apply || !summary.documents_to_restore) {
    console.log('RESTORE_REPORT_DOCUMENT_EVIDENCE',JSON.stringify(summary));
  } else {
    await db.query('BEGIN');
    await db.query(`CREATE TABLE IF NOT EXISTS report_relation_repair_snapshots (
      run_id UUID NOT NULL,captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_table TEXT NOT NULL,source_id TEXT NOT NULL,row_data JSONB NOT NULL,
      PRIMARY KEY(run_id,source_table,source_id))`);
    await db.query('SELECT id FROM reports WHERE id::text=ANY($1::text[]) ORDER BY id FOR UPDATE',
      [[...initial.byReport.keys()]]);
    const fresh = plan(await sourceRows(db));
    const signature = value => JSON.stringify([...value.byReport.entries()].sort());
    if (signature(initial) !== signature(fresh)) throw new Error('document_plan_changed_retry');
    for (const [reportId,documents] of fresh.byReport) {
      await db.query(`INSERT INTO report_relation_repair_snapshots(run_id,source_table,source_id,row_data)
        SELECT $1,'reports',id::text,to_jsonb(source) FROM reports AS source WHERE id::text=$2
        ON CONFLICT DO NOTHING`,[runId,reportId]);
      const row = (await db.query('SELECT raw_data FROM reports WHERE id::text=$1',[reportId])).rows[0];
      const raw = obj(row.raw_data);
      const updated = {...raw,attachments:[...list(raw.attachments),...documents]};
      await db.query('UPDATE reports SET raw_data=$2::jsonb WHERE id::text=$1',
        [reportId,JSON.stringify(updated)]);
      summary.reports_updated++;
      summary.documents_restored += documents.length;
    }
    await db.query('COMMIT');
    console.log('RESTORE_REPORT_DOCUMENT_EVIDENCE',JSON.stringify(summary));
  }
} catch (error) {
  try { await db.query('ROLLBACK'); } catch {}
  console.error('RESTORE_REPORT_DOCUMENT_EVIDENCE_ERROR',error);
  process.exitCode=1;
} finally {
  db.release();
  await pool.end();
}
