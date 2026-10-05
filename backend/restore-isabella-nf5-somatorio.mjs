import pg from 'pg';

// One-off, guarded repair. Dry-run unless --apply is explicitly supplied.
const PURCHASE_ID = 'pr-aaf8e9cda3a6a237859e231c';
const RUBRICA_ID = '5f811df3c29961522f585744';
const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || '',
});

const digits = value => String(value || '').replace(/\D/g, '');
const invoiceNumber = value => digits(value).replace(/^0+/, '') || '0';
const issueDate = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const cents = value => Math.round(Number(value || 0) * 100);
const fiscalValue = row => cents(row.nf_valor_total || row.valor_aprovado || row.valor_total || row.valor_solicitado);

async function main() {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const purchase = (await db.query('SELECT * FROM purchase_requests WHERE id=$1 FOR UPDATE', [PURCHASE_ID])).rows[0];
    if (!purchase) throw new Error('purchase_not_found');
    if (digits(purchase.nf_emitente_cpf_cnpj) !== '65919095000197'
      || invoiceNumber(purchase.nf_numero) !== '5'
      || issueDate(purchase.nf_data_emissao) !== '2026-09-01'
      || fiscalValue(purchase) !== 420000
      || String(purchase.rubrica_id) !== RUBRICA_ID
      || String(purchase.centro_custo).toUpperCase() !== 'MIS'
      || String(purchase.status).toUpperCase() !== 'PAGO'
      || !purchase.nf_pdf_url || !purchase.nf_xml_url || !purchase.drive_file_id) {
      throw new Error('fiscal_identity_or_document_mismatch');
    }
    const all = (await db.query(`SELECT id,nf_emitente_cpf_cnpj,nf_numero,nf_data_emissao,
      nf_valor_total,valor_aprovado,valor_total,valor_solicitado,drive_file_id,nf_pdf_url,nf_xml_url
      FROM purchase_requests WHERE id<>$1`, [PURCHASE_ID])).rows;
    const sameFiscalKey = all.filter(row =>
      digits(row.nf_emitente_cpf_cnpj) === '65919095000197'
      && invoiceNumber(row.nf_numero) === '5'
      && issueDate(row.nf_data_emissao) === '2026-09-01'
      && fiscalValue(row) === 420000);
    const sameDocument = all.filter(row =>
      (row.drive_file_id && row.drive_file_id === purchase.drive_file_id)
      || (row.nf_pdf_url && row.nf_pdf_url === purchase.nf_pdf_url)
      || (row.nf_xml_url && row.nf_xml_url === purchase.nf_xml_url));
    const referenced = purchase.duplicata_de
      ? (await db.query('SELECT id FROM purchase_requests WHERE id=$1', [purchase.duplicata_de])).rows[0]
      : null;
    if (sameFiscalKey.length || sameDocument.length || referenced) {
      throw new Error(`duplicate_still_exists fiscal=${sameFiscalKey.length} document=${sameDocument.length} reference=${Boolean(referenced)}`);
    }
    const before = (await db.query('SELECT valor_utilizado FROM rubricas WHERE id=$1 FOR UPDATE', [RUBRICA_ID])).rows[0];
    if (!before) throw new Error('rubrica_not_found');
    const alreadyActive = purchase.incluir_no_somatorio !== false && purchase.duplicada_financeira !== true && !purchase.duplicata_de;
    const summary = { mode:APPLY ? 'apply' : 'dry_run', id:PURCHASE_ID, orphan_duplicate_reference:purchase.duplicata_de,
      exact_fiscal_matches:sameFiscalKey.length, same_document_matches:sameDocument.length,
      included_before:purchase.incluir_no_somatorio, rubrica_utilizado_before:before.valor_utilizado,
      action:alreadyActive ? 'unchanged' : 'restore' };
    if (!APPLY || alreadyActive) {
      await db.query('ROLLBACK');
      console.log('ISABELLA_NF5_RESTORE', JSON.stringify(summary));
      return;
    }
    const audit = { action:'restore_orphan_duplicate', at:new Date().toISOString(),
      reason:'NF 5 de 01/09/2026, CNPJ 65919095000197 e R$ 4.200,00 sem outra solicitação ou arquivo correspondente; referência de duplicata inexistente.',
      before:{ incluir_no_somatorio:purchase.incluir_no_somatorio, duplicada_financeira:purchase.duplicada_financeira,
        duplicata_de:purchase.duplicata_de, rubrica_valor_utilizado:before.valor_utilizado } };
    await db.query(`UPDATE purchase_requests SET incluir_no_somatorio=TRUE,duplicada_financeira=FALSE,duplicata_de=NULL,
      raw_data=jsonb_set(COALESCE(raw_data,'{}'::jsonb),'{financial_correction_history}',
        (CASE WHEN jsonb_typeof(raw_data->'financial_correction_history')='array'
          THEN raw_data->'financial_correction_history' ELSE '[]'::jsonb END) || $2::jsonb),
      updated_at=NOW(),updated_date=NOW() WHERE id=$1`, [PURCHASE_ID,JSON.stringify([audit])]);
    const updated = (await db.query(`WITH used AS (
      SELECT ROUND(SUM(CASE
        WHEN p.raw_data #>> '{official_balancete,eligible_cents}' ~ '^[0-9]+$'
          THEN (p.raw_data #>> '{official_balancete,eligible_cents}')::numeric / 100
        WHEN p.nf_valor_total > 0 THEN p.nf_valor_total
        WHEN p.valor_aprovado > 0 THEN p.valor_aprovado
        WHEN p.valor_total > 0 THEN p.valor_total
        ELSE COALESCE(p.valor_solicitado,0) END)::numeric,2) AS amount
      FROM purchase_requests p WHERE p.rubrica_id=$1
        AND UPPER(COALESCE(p.status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
        AND COALESCE(p.incluir_no_somatorio,TRUE) IS DISTINCT FROM FALSE
        AND COALESCE(p.duplicada_financeira,FALSE)=FALSE
    ) UPDATE rubricas r SET valor_utilizado=COALESCE(used.amount,0),
      saldo=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(used.amount,0),
      saldo_real=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(used.amount,0),
      percentual_utilizado=CASE WHEN COALESCE(r.valor_total,r.valor_rubrica,0)>0
        THEN ROUND(COALESCE(used.amount,0)/COALESCE(r.valor_total,r.valor_rubrica,0)*100,2) ELSE 0 END,
      updated_at=NOW() FROM used WHERE r.id=$1 RETURNING r.valor_utilizado`, [RUBRICA_ID])).rows[0];
    if (!updated) throw new Error('rubrica_recalculation_failed');
    await db.query('COMMIT');
    console.log('ISABELLA_NF5_RESTORE', JSON.stringify({ ...summary, rubrica_utilizado_after:updated.valor_utilizado }));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { db.release(); await pool.end(); }
}

main().catch(error => { console.error('ISABELLA_NF5_RESTORE_ERROR', error.message); process.exitCode=1; });
