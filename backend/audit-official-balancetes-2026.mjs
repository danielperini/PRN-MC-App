import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

// GRPBH source: the five supplied Museus Centro financial statements. Audit is
// read only by default. --apply persists the official monthly balances and
// reconciles only unique invoice + beneficiary + amount matches.
const APPLY = process.argv.includes('--apply');
const VERIFY_SOURCE = process.argv.includes('--verify-source');
let pool;
const privateSource = process.env.OFFICIAL_BALANCETE_FILE ||
  (process.env.UPLOAD_DIR ? resolve(process.env.UPLOAD_DIR, 'private', 'official-balancetes-2026.json') : new URL('./official-balancetes-2026.json', import.meta.url));
const source = JSON.parse(await readFile(privateSource, 'utf8'));
const STOP = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'LTDA', 'SA', 'S', 'A', 'ME', 'EIRELI', 'SOCIEDADE', 'INDIVIDUAL']);
const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const supplierTokens = value => new Set(normalized(value).split(' ').filter(token => token.length > 1 && !STOP.has(token) && !/^\d+$/.test(token)));
const invoice = value => String(value || '').replace(/\D/g, '').replace(/^0+/, '') || '';
const moneyCents = value => {
  if (value == null || value === '') return 0;
  const raw = String(value).trim().replace(/^R\$\s*/, '');
  const amount = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};
const purchaseGross = purchase => {
  for (const value of [purchase.nf_valor_total, purchase.valor_pago, purchase.valor_aprovado_admin, purchase.valor_aprovado, purchase.valor_solicitado, purchase.valor_total]) {
    const amount = moneyCents(value);
    if (amount > 0) return amount;
  }
  return 0;
};
const scoreSupplier = (expected, actual) => {
  const left = supplierTokens(expected);
  const right = supplierTokens(actual);
  if (!left.size || !right.size) return 0;
  const common = [...left].filter(token => right.has(token)).length;
  return Math.min(common / left.size, common / right.size);
};
const stableKey = entry => `${invoice(entry.invoice)}|${normalized(entry.beneficiary)}|${entry.gross_cents}`;
const sourceCenter = entry => {
  if (/FUNEMP/i.test(entry.description)) return 'Noturno Pampulha';
  if (/NOTURNO/i.test(entry.description)) return 'Noturno 2026';
  const mentioned = ['MUMO', 'MHAB', 'MIS'].filter(code => new RegExp(`\\b${code}\\b`, 'i').test(entry.description));
  return mentioned.length === 1 ? mentioned[0] : 'Atuação Geral';
};
const sameOfficial = (oldValue, expected) => oldValue &&
  oldValue.source_sha256 === expected.source_sha256 && oldValue.month === expected.month &&
  oldValue.page === expected.page && oldValue.gross_cents === expected.gross_cents &&
  oldValue.undue_cents === expected.undue_cents && oldValue.eligible_cents === expected.eligible_cents;
const addCenter = (summary, center, gross, eligible) => {
  summary[center] ||= { rows: 0, gross_cents: 0, eligible_cents: 0 };
  summary[center].rows++;
  summary[center].gross_cents += gross;
  summary[center].eligible_cents += eligible;
};

function validateSource() {
  let previous = null;
  for (const month of source.months) {
    const gross = month.entries.reduce((sum, row) => sum + row.gross_cents, 0);
    const undue = month.entries.reduce((sum, row) => sum + row.undue_cents, 0);
    if (gross !== month.expenses || undue !== month.undue ||
      month.previous + month.transfer + month.yield_amount + month.reimbursement !== month.subtotal ||
      month.subtotal - month.expenses !== month.balance ||
      (previous !== null && month.previous !== previous)) {
      throw new Error(`Official statement arithmetic invalid: ${month.month}`);
    }
    previous = month.balance;
  }
}

async function saveOfficialMonths(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS official_balancete_months (
    month text NOT NULL, partnership text NOT NULL, project text NOT NULL,
    source_filename text NOT NULL, source_sha256 text NOT NULL, statement_status text NOT NULL,
    previous_cents bigint NOT NULL, transfer_cents bigint NOT NULL, yield_cents bigint NOT NULL,
    reimbursement_cents bigint NOT NULL, subtotal_cents bigint NOT NULL, expenses_cents bigint NOT NULL,
    balance_cents bigint NOT NULL, undue_cents bigint NOT NULL, outstanding_cents bigint NOT NULL,
    source_entries jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(partnership,month)
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS official_balancete_purchase_audit (
    run_id uuid NOT NULL, purchase_id text NOT NULL, official_month text NOT NULL,
    official_page integer NOT NULL, before_data jsonb NOT NULL, after_data jsonb NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,purchase_id)
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS official_balancete_audit_runs (
    run_id uuid PRIMARY KEY, report jsonb NOT NULL, executed_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const month of source.months) {
    await client.query(`INSERT INTO official_balancete_months (
      month, partnership, project, source_filename, source_sha256, statement_status,
      previous_cents, transfer_cents, yield_cents, reimbursement_cents, subtotal_cents,
      expenses_cents, balance_cents, undue_cents, outstanding_cents, source_entries, imported_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,now())
    ON CONFLICT (partnership,month) DO UPDATE SET project=EXCLUDED.project,
      source_filename=EXCLUDED.source_filename, source_sha256=EXCLUDED.source_sha256,
      statement_status=EXCLUDED.statement_status, previous_cents=EXCLUDED.previous_cents,
      transfer_cents=EXCLUDED.transfer_cents, yield_cents=EXCLUDED.yield_cents,
      reimbursement_cents=EXCLUDED.reimbursement_cents, subtotal_cents=EXCLUDED.subtotal_cents,
      expenses_cents=EXCLUDED.expenses_cents, balance_cents=EXCLUDED.balance_cents,
      undue_cents=EXCLUDED.undue_cents, outstanding_cents=EXCLUDED.outstanding_cents,
      source_entries=EXCLUDED.source_entries, imported_at=now()`, [
      month.month, source.partnership, source.project, month.source_filename,
      month.source_sha256, month.statement_status, month.previous, month.transfer,
      month.yield_amount, month.reimbursement, month.subtotal, month.expenses,
      month.balance, month.undue, month.outstanding, JSON.stringify(month.entries),
    ]);
  }
}

async function recalcRubricas(client) {
  await client.query(`WITH used AS (
    SELECT rubrica_id, ROUND(SUM(CASE
      WHEN raw_data #>> '{official_balancete,eligible_cents}' ~ '^[0-9]+$'
        THEN ((raw_data #>> '{official_balancete,eligible_cents}')::numeric / 100)
      WHEN nf_valor_total > 0 THEN nf_valor_total
      WHEN valor_aprovado > 0 THEN valor_aprovado
      WHEN valor_total > 0 THEN valor_total
      ELSE COALESCE(valor_solicitado,0)
    END)::numeric,2) AS amount
    FROM purchase_requests
    WHERE rubrica_id IS NOT NULL
      AND UPPER(COALESCE(status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
      AND COALESCE(incluir_no_somatorio,true) IS DISTINCT FROM false
      AND COALESCE(duplicada_financeira,false)=false
    GROUP BY rubrica_id
  ) UPDATE rubricas r SET valor_utilizado=COALESCE(u.amount,0),
    saldo=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),
    saldo_real=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),
    percentual_utilizado=CASE WHEN COALESCE(r.valor_total,r.valor_rubrica,0)>0
      THEN ROUND(COALESCE(u.amount,0)/COALESCE(r.valor_total,r.valor_rubrica,0)*100,2) ELSE 0 END,
    updated_at=now()
  FROM (SELECT id FROM rubricas) all_r LEFT JOIN used u ON u.rubrica_id=all_r.id
  WHERE r.id=all_r.id`);
}

async function run() {
  validateSource();
  if (VERIFY_SOURCE) {
    console.log('OFFICIAL_BALANCETE_SOURCE_VALID', JSON.stringify(source.months.map(month => ({
      month: month.month, rows: month.entries.length, expenses_cents: month.expenses,
      balance_cents: month.balance, undue_cents: month.undue, sha256: month.source_sha256,
    }))));
    return;
  }
  const { Pool } = (await import('pg')).default;
  pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor',
    password: process.env.POSTGRES_PASSWORD || '',
  });
  const client = await pool.connect();
  const runId = randomUUID();
  try {
    const purchases = (await client.query('SELECT * FROM purchase_requests')).rows;
    const rubricas = (await client.query('SELECT * FROM rubricas')).rows;
    const rubricaById = new Map(rubricas.map(row => [row.id, row]));
    const columns = new Set((await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_requests'`)).rows.map(row => row.column_name));
    const sourceKeyCounts = new Map();
    for (const month of source.months) for (const entry of month.entries) sourceKeyCounts.set(stableKey(entry), (sourceKeyCounts.get(stableKey(entry)) || 0) + 1);
    const usedPurchaseIds = new Set();
    const changes = [];
    const report = { run_id: runId, mode: APPLY ? 'apply' : 'audit', budget_scope: 'all_current_rubricas', months: [], by_source_center: {}, by_app_center: {}, budget_by_museum_before_apply: {}, budget_mismatches_before_apply: [], ambiguous: [], unmatched: [], review: [] };
    const calculatedByRubrica = new Map();
    for (const purchase of purchases) {
      if (!purchase.rubrica_id || !['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(String(purchase.status || '').toUpperCase()) ||
        purchase.duplicada_financeira || purchase.incluir_no_somatorio === false) continue;
      const recognized = purchase.raw_data?.official_balancete?.eligible_cents;
      calculatedByRubrica.set(purchase.rubrica_id, (calculatedByRubrica.get(purchase.rubrica_id) || 0) +
        (Number.isSafeInteger(recognized) && recognized >= 0 ? recognized : purchaseGross(purchase)));
    }
    for (const rubrica of rubricas) {
      const center = String(rubrica.museu_codigo || rubrica.centro_custo || rubrica.museu || 'Atuação Geral');
      report.budget_by_museum_before_apply[center] ||= { rubricas: 0, planned_cents: 0, stored_used_cents: 0, calculated_used_cents: 0 };
      const bucket = report.budget_by_museum_before_apply[center];
      const calculated = calculatedByRubrica.get(rubrica.id) || 0;
      bucket.rubricas++;
      bucket.planned_cents += moneyCents(rubrica.valor_total ?? rubrica.valor_rubrica);
      bucket.stored_used_cents += moneyCents(rubrica.valor_utilizado);
      bucket.calculated_used_cents += calculated;
      if (Math.abs(moneyCents(rubrica.valor_utilizado) - calculated) > 1) {
        report.budget_mismatches_before_apply.push({ rubrica_id: rubrica.id, center,
          stored_used_cents: moneyCents(rubrica.valor_utilizado), calculated_used_cents: calculated });
      }
    }

    for (const month of source.months) {
      const monthReport = { month: month.month, official_status: month.statement_status, official_expenses_cents: month.expenses,
        official_balance_cents: month.balance, official_undue_cents: month.undue, rows: month.entries.length,
        matched: 0, matched_gross_cents: 0, matched_eligible_cents: 0, unmatched: 0, ambiguous: 0, applied: 0 };
      for (const entry of month.entries) {
        const inferredCenter = sourceCenter(entry);
        addCenter(report.by_source_center, inferredCenter, entry.gross_cents, entry.gross_cents - entry.undue_cents);
        const ref = { month: month.month, page: entry.page, invoice: entry.invoice,
          beneficiary: entry.beneficiary, gross_cents: entry.gross_cents, undue_cents: entry.undue_cents,
          source_center: inferredCenter };
        // A receipt or invoice number 0 cannot identify a unique NF safely.
        if (!invoice(entry.invoice) || sourceKeyCounts.get(stableKey(entry)) !== 1) {
          report.ambiguous.push({ ...ref, reason: 'non_unique_or_missing_invoice' }); monthReport.ambiguous++; continue;
        }
        const candidates = purchases.filter(purchase =>
          invoice(purchase.nf_numero) === invoice(entry.invoice) &&
          purchaseGross(purchase) === entry.gross_cents &&
          Math.max(scoreSupplier(entry.beneficiary, purchase.nf_emitente_nome), scoreSupplier(entry.beneficiary, purchase.fornecedor_nome)) >= 0.85
        );
        if (candidates.length !== 1 || usedPurchaseIds.has(candidates[0]?.id)) {
          const item = { ...ref, candidates: candidates.map(row => row.id) };
          if (candidates.length === 0) { report.unmatched.push(item); monthReport.unmatched++; }
          else { report.ambiguous.push(item); monthReport.ambiguous++; }
          continue;
        }
        const purchase = candidates[0];
        usedPurchaseIds.add(purchase.id);
        monthReport.matched++;
        monthReport.matched_gross_cents += entry.gross_cents;
        monthReport.matched_eligible_cents += entry.gross_cents - entry.undue_cents;
        addCenter(report.by_app_center, String(purchase.centro_custo || 'Sem centro'), entry.gross_cents, entry.gross_cents - entry.undue_cents);
        const funding = /FUNEMP/i.test(entry.description) ? 'FUNEMP' : null;
        const center = normalized(purchase.centro_custo || purchase.museu || '');
        const rubrica = rubricaById.get(purchase.rubrica_id);
        const itemCode = String(rubrica?.codigo_item_pbh || '').split('.').pop().replace(/\D/g, '').replace(/^0+/, '');
        if (!rubrica || purchase.duplicada_financeira || purchase.incluir_no_somatorio === false ||
          (funding && !center.includes('PAMPULHA')) || (!funding && center.includes('NOTURNO PAMPULHA')) ||
          (['MUMO', 'MHAB', 'MIS'].includes(inferredCenter) && center !== inferredCenter) ||
          (itemCode && itemCode !== String(entry.item).replace(/^0+/, ''))) {
          report.review.push({ ...ref, purchase_id: purchase.id, rubrica_id: purchase.rubrica_id,
            centro_custo: purchase.centro_custo, funding, source_item: entry.item,
            rubrica_item: rubrica?.codigo_item_pbh, reason: 'budget_allocation_or_suppression_review' });
        }
        const official = { partnership: source.partnership, month: month.month, page: entry.page,
          source_sha256: month.source_sha256, gross_cents: entry.gross_cents,
          undue_cents: entry.undue_cents, eligible_cents: entry.gross_cents - entry.undue_cents,
          funding, statement_status: month.statement_status };
        if (!sameOfficial(purchase.raw_data?.official_balancete, official) ||
          String(purchase.status || '').toUpperCase() !== 'PAGO' || purchase.pago !== true ||
          String(purchase.status_pagamento || '').toUpperCase() !== 'PAGO') {
          changes.push({ purchase, official, entry });
        }
      }
      report.months.push(monthReport);
    }

    if (APPLY) {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(2026, 206)');
      await saveOfficialMonths(client);
      for (const { purchase, official, entry } of changes) {
        if (purchase.duplicada_financeira || (purchase.incluir_no_somatorio === false && official.eligible_cents > 0)) continue;
        const locked = (await client.query('SELECT * FROM purchase_requests WHERE id=$1 FOR UPDATE', [purchase.id])).rows[0];
        if (!locked || invoice(locked.nf_numero) !== invoice(entry.invoice) || purchaseGross(locked) !== entry.gross_cents ||
          Math.max(scoreSupplier(entry.beneficiary, locked.nf_emitente_nome), scoreSupplier(entry.beneficiary, locked.fornecedor_nome)) < 0.85) {
          report.review.push({ purchase_id: purchase.id, month: official.month, reason: 'changed_during_audit' });
          continue;
        }
        const newRaw = { ...(locked.raw_data || {}), official_balancete: official };
        const fields = [['raw_data', JSON.stringify(newRaw)], ['status', 'PAGO'], ['pago', true], ['status_pagamento', 'PAGO']]
          .filter(([field]) => columns.has(field));
        if (columns.has('valor_pago')) fields.push(['valor_pago', official.gross_cents / 100]);
        if (official.eligible_cents === 0 && columns.has('incluir_no_somatorio')) fields.push(['incluir_no_somatorio', false]);
        if (columns.has('updated_at')) fields.push(['updated_at', new Date()]);
        if (columns.has('updated_date')) fields.push(['updated_date', new Date()]);
        const params = fields.map(([, value]) => value);
        params.push(purchase.id);
        const result = await client.query(`UPDATE purchase_requests SET ${fields.map(([field], index) => `"${field}"=$${index + 1}${field === 'raw_data' ? '::jsonb' : ''}`).join(', ')} WHERE id=$${params.length} RETURNING *`, params);
        await client.query(`INSERT INTO official_balancete_purchase_audit
          (run_id,purchase_id,official_month,official_page,before_data,after_data)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [runId, purchase.id, official.month, entry.page,
          JSON.stringify(locked), JSON.stringify(result.rows[0])]);
        report.months.find(row => row.month === official.month).applied++;
      }
      await recalcRubricas(client);
      report.proposed_changes = changes.length;
      report.unmatched_count = report.unmatched.length;
      report.ambiguous_count = report.ambiguous.length;
      report.review_count = report.review.length;
      report.budget_mismatch_count_before_apply = report.budget_mismatches_before_apply.length;
      await client.query('INSERT INTO official_balancete_audit_runs(run_id,report) VALUES($1,$2::jsonb)', [runId, JSON.stringify(report)]);
      await client.query('COMMIT');
    }
    report.proposed_changes = changes.length;
    report.unmatched_count = report.unmatched.length;
    report.ambiguous_count = report.ambiguous.length;
    report.review_count = report.review.length;
    report.budget_mismatch_count_before_apply = report.budget_mismatches_before_apply.length;
    console.log('OFFICIAL_BALANCETE_AUDIT', JSON.stringify(report));
    if (report.unmatched_count || report.ambiguous_count || report.review_count || (!APPLY && report.budget_mismatch_count_before_apply)) process.exitCode = 2;
  } catch (error) {
    if (APPLY) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

run().catch(error => { console.error('OFFICIAL_BALANCETE_AUDIT_FATAL', error); process.exitCode = 1; }).finally(() => pool?.end());
