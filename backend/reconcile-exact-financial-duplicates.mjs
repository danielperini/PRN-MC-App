import pg from 'pg';

// Financial deduplication is conservative: same fiscal key AND the same PDF,
// XML or Drive object. Original records and their documents remain untouched.
const APPLY = process.argv.includes('--apply');
const { Pool } = pg;
const pool = new Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || '',
});
const digits = value => String(value || '').replace(/\D/g, '');
const number = value => digits(value).replace(/^0+/, '') || '0';
const date = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const amountCents = row => Math.round(Number(row.nf_valor_total || row.valor_aprovado || row.valor_total || row.valor_solicitado || 0) * 100);
const key = row => {
  const tax = digits(row.nf_emitente_cpf_cnpj);
  const invoice = number(row.nf_numero);
  const issued = date(row.nf_data_emissao);
  const cents = amountCents(row);
  return tax.length === 14 && invoice !== '0' && issued && cents > 0 ? `${tax}|${invoice}|${issued}|${cents}` : null;
};
const active = row => row.incluir_no_somatorio !== false && row.duplicada_financeira !== true
  && ['APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO'].includes(String(row.status || '').toUpperCase());
const commonDocument = rows => ['nf_pdf_url','nf_xml_url','drive_file_id'].some(field => {
  const values = rows.map(row => String(row[field] || '').trim());
  return values.every(Boolean) && new Set(values).size === 1;
});
const score = row => Number(row.bank_count || 0) * 10000 + Number(row.link_count || 0) * 1000
  + Number(row.doc_count || 0) * 100 + Number(Boolean(row.nf_pdf_url)) * 20
  + Number(Boolean(row.nf_xml_url)) * 10 + Number(Boolean(row.drive_file_id));
const rank = (a,b) => score(b) - score(a)
  || new Date(a.created_date || 0) - new Date(b.created_date || 0)
  || String(a.id).localeCompare(String(b.id));

async function loadRows(db) {
  return (await db.query(`SELECT p.*,
    (SELECT COUNT(*) FROM purchase_documents d WHERE d.purchase_request_id=p.id) AS doc_count,
    (SELECT COUNT(*) FROM financial_document_links f WHERE f.purchase_request_id=p.id) AS link_count,
    (SELECT COUNT(*) FROM movimentacoes_bancarias m WHERE m.purchase_request_id=p.id) AS bank_count
    FROM purchase_requests p`)).rows;
}

function planGroups(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const fiscalKey = key(row);
    if (!fiscalKey) continue;
    const group = byKey.get(fiscalKey) || [];
    group.push(row);
    byKey.set(fiscalKey,group);
  }
  const planned = [];
  const skipped = [];
  for (const [fiscalKey, all] of byKey) {
    if (all.length < 2) continue;
    const included = all.filter(active).sort(rank);
    if (included.length < 2) continue;
    let reason = '';
    if (new Set(included.map(row => String(row.rubrica_id || ''))).size !== 1) reason = 'different_rubricas';
    else if (!commonDocument(included)) reason = 'no_identical_document';
    else if (included.filter(row => Number(row.bank_count || 0) > 0).length > 1) reason = 'multiple_bank_links';
    if (reason) { skipped.push({ fiscalKey, ids:included.map(row => row.id), reason }); continue; }
    planned.push({ fiscalKey, canonical:included[0], duplicates:included.slice(1), rubricaId:included[0].rubrica_id });
  }
  return { planned, skipped };
}

async function recalculate(db) {
  await db.query(`WITH used AS (
    SELECT p.rubrica_id, ROUND(SUM(CASE
      WHEN p.raw_data #>> '{official_balancete,eligible_cents}' ~ '^[0-9]+$'
        THEN (p.raw_data #>> '{official_balancete,eligible_cents}')::numeric / 100
      WHEN p.nf_valor_total > 0 THEN p.nf_valor_total
      WHEN p.valor_aprovado > 0 THEN p.valor_aprovado
      WHEN p.valor_total > 0 THEN p.valor_total
      ELSE COALESCE(p.valor_solicitado,0) END)::numeric,2) AS amount
    FROM purchase_requests p WHERE p.rubrica_id IS NOT NULL
      AND UPPER(COALESCE(p.status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
      AND COALESCE(p.incluir_no_somatorio,TRUE) IS DISTINCT FROM FALSE
      AND COALESCE(p.duplicada_financeira,FALSE)=FALSE GROUP BY p.rubrica_id
  ) UPDATE rubricas r SET valor_utilizado=COALESCE(u.amount,0),
    saldo=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),
    saldo_real=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),
    percentual_utilizado=CASE WHEN COALESCE(r.valor_total,r.valor_rubrica,0)>0
      THEN ROUND(COALESCE(u.amount,0)/COALESCE(r.valor_total,r.valor_rubrica,0)*100,2) ELSE 0 END,
    updated_at=NOW() FROM (SELECT id FROM rubricas) all_r
    LEFT JOIN used u ON u.rubrica_id=all_r.id WHERE r.id=all_r.id`);
}

async function main() {
  const db = await pool.connect();
  try {
    const { planned, skipped } = planGroups(await loadRows(db));
    const summary = { mode:APPLY ? 'apply' : 'dry_run', duplicate_groups:planned.length,
      purchases_to_exclude:planned.reduce((sum,group) => sum + group.duplicates.length,0),
      cents_to_reverse:planned.reduce((sum,group) => sum + group.duplicates.reduce((n,row) => n + amountCents(row),0),0),
      needs_review:skipped.length,
      groups:planned.map(group => ({ key:group.fiscalKey, canonical:group.canonical.id,
        duplicate_ids:group.duplicates.map(row => row.id), rubrica_id:group.rubricaId })),
      skipped };
    if (!APPLY || planned.length === 0) { console.log('EXACT_FINANCIAL_DUPLICATES', JSON.stringify(summary)); return; }
    await db.query('BEGIN');
    const plannedIds = planned.flatMap(group => [group.canonical.id,...group.duplicates.map(row => row.id)]).sort();
    await db.query('SELECT id FROM purchase_requests WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [plannedIds]);
    const fresh = planGroups(await loadRows(db));
    const freshSignatures = fresh.planned.map(group => [group.fiscalKey,group.canonical.id,...group.duplicates.map(row => row.id)].join('|')).sort();
    const plannedSignatures = planned.map(group => [group.fiscalKey,group.canonical.id,...group.duplicates.map(row => row.id)].join('|')).sort();
    if (JSON.stringify(freshSignatures) !== JSON.stringify(plannedSignatures)) throw new Error('duplicate_plan_changed_retry');
    for (const group of planned) for (const purchase of group.duplicates) {
      const audit = { action:'exclude_exact_financial_duplicate', at:new Date().toISOString(),
        fiscal_key:group.fiscalKey, canonical_id:group.canonical.id,
        before:{ incluir_no_somatorio:purchase.incluir_no_somatorio,
          duplicada_financeira:purchase.duplicada_financeira, duplicata_de:purchase.duplicata_de } };
      await db.query(`UPDATE purchase_requests SET incluir_no_somatorio=FALSE,duplicada_financeira=TRUE,
        duplicata_de=$2,raw_data=jsonb_set(COALESCE(raw_data,'{}'::jsonb),'{financial_correction_history}',
          COALESCE(CASE WHEN jsonb_typeof(raw_data->'financial_correction_history')='array'
            THEN raw_data->'financial_correction_history' ELSE '[]'::jsonb END,'[]'::jsonb)||$3::jsonb),
        updated_at=NOW(),updated_date=NOW() WHERE id=$1`, [purchase.id,group.canonical.id,JSON.stringify([audit])]);
    }
    await recalculate(db);
    await db.query('COMMIT');
    console.log('EXACT_FINANCIAL_DUPLICATES', JSON.stringify(summary));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { db.release(); await pool.end(); }
}
main().catch(error => { console.error('EXACT_FINANCIAL_DUPLICATES_ERROR',error.message); process.exitCode=1; });
