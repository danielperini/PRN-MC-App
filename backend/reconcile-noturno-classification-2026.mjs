import pg from 'pg';

const { Pool } = pg;
const APPLY = String(process.env.NOTURNO_CLASSIFICATION_APPLY || '') === '1';
const PAMPULHA_META_ID = '6a3c0b9bfa079f5914d83254';
const CENTRO_META_ID = '6a3c0b9bfa079f5914d83253';
const PAMPULHA_CENTER = 'Noturno Pampulha';
const CENTRO_CENTER = 'Noturno 2026';
const PAMPULHA_RUBRICAS = new Set([
  'rubrica-4a-apresentacoes-pampulha',
  'rubrica-4a-infraestrutura-pampulha',
  'rubrica-4a-produtor-pampulha',
  'rubrica-4a-sinalizacao-pampulha',
]);

const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

// Fonte: Projeção_Execução Financeira - Noturno nos Museus.xlsx.
// Cada migração é validada por id, NF, fornecedor e valor antes de alterar dados.
const MOVES = [
  { id: 'pr-6a4c01229f6dd7ddd56572d0', nf: '77', fornecedor: 'EMER-SOM LTDA', valor: 8985, grupo: 'PAMPULHA', rubrica: 'rubrica-4a-infraestrutura-pampulha' },
  { id: 'pr-6a467d1e804b0872ea4dd38e', nf: '20', fornecedor: 'POLVO STUDIO LTDA', valor: 7300, grupo: 'PAMPULHA', rubrica: 'rubrica-4a-infraestrutura-pampulha' },
  { id: 'pr-6a4bf01df8b37486e0b49d34', nf: '12', fornecedor: 'CAROLINA GIOVANNA GONCALVES BRANDHUBER', valor: 300, grupo: 'CENTRO', rubrica: '6b1e730803cbef2196d3f318' },
  { id: 'pr-6a4d6f9d26202b0aa48a9a34', nf: '16', fornecedor: 'BARBARA MIRANDA ELIZEI', valor: 300, grupo: 'CENTRO', rubrica: '6b1e730803cbef2196d3f318' },
  { id: 'pr-6a4beff4bb1ede59b4d19d8c', nf: '16', fornecedor: 'LIGIA DUTRA DA SILVA', valor: 300, grupo: 'CENTRO', rubrica: '6b1e730803cbef2196d3f318' },
  { id: 'ac943958-6e43-4743-98ab-cfba3cc7f6e9', nf: '5', fornecedor: 'MARIA CRISTINA FREITAS DA CUNHA', valor: 6000, grupo: 'CENTRO', rubrica: '8041979a22bd5bddb1c95927' },
  { id: 'pr-6a4d690ce68c8776d9d6989e', nf: '459', fornecedor: 'FLAG IMPRESSAO DIGITAL LTDA', valor: 3000, grupo: 'PAMPULHA', rubrica: 'rubrica-4a-infraestrutura-pampulha' },
  { id: 'pr-6a3d672f98407be582f944ad', nf: '54', fornecedor: 'DANIELA ISIS DE SOUZA ARAUJO', valor: 5000, grupo: 'PAMPULHA', rubrica: 'rubrica-4a-produtor-pampulha' },
];

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const invoiceNumber = value => String(value || '').replace(/\D/g, '').replace(/^0+/, '') || '0';
const amount = value => Number(Number(value || 0).toFixed(2));
const supplierMatches = (expected, actual) => {
  const left = new Set(normalize(expected).split(' ').filter(Boolean));
  const right = new Set(normalize(actual).split(' ').filter(Boolean));
  const shared = [...left].filter(token => right.has(token));
  return shared.length >= 2 || normalize(expected).includes(normalize(actual)) || normalize(actual).includes(normalize(expected));
};

async function syncRubricaBalances() {
  await pool.query(`
    WITH used AS (
      SELECT rubrica_id, ROUND(SUM(CASE
        WHEN nf_valor_total > 0 THEN nf_valor_total
        WHEN valor_aprovado > 0 THEN valor_aprovado
        WHEN valor_total > 0 THEN valor_total
        ELSE COALESCE(valor_solicitado, 0)
      END)::numeric, 2) AS amount
      FROM purchase_requests
      WHERE rubrica_id IS NOT NULL
        AND UPPER(COALESCE(status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
        AND COALESCE(incluir_no_somatorio,TRUE) IS DISTINCT FROM FALSE
        AND COALESCE(duplicada_financeira,FALSE)=FALSE
      GROUP BY rubrica_id
    )
    UPDATE rubricas r
    SET valor_utilizado=COALESCE(u.amount,0),
        saldo=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),
        saldo_real=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),
        percentual_utilizado=CASE WHEN COALESCE(r.valor_total,r.valor_rubrica,0)>0 THEN ROUND(COALESCE(u.amount,0)/COALESCE(r.valor_total,r.valor_rubrica,0)*100,2) ELSE 0 END,
        updated_at=NOW()
    FROM (SELECT id FROM rubricas) all_r
    LEFT JOIN used u ON u.rubrica_id=all_r.id
    WHERE r.id=all_r.id
  `);
}

async function run() {
  const ids = MOVES.map(move => move.id);
  const result = await pool.query('SELECT * FROM purchase_requests WHERE id = ANY($1::text[])', [ids]);
  const byId = new Map(result.rows.map(row => [row.id, row]));
  const invalid = MOVES.filter(move => {
    const purchase = byId.get(move.id);
    return !purchase || invoiceNumber(purchase.nf_numero) !== move.nf ||
      amount(purchase.nf_valor_total ?? purchase.valor_solicitado ?? purchase.valor_total) !== move.valor ||
      !supplierMatches(move.fornecedor, purchase.nf_emitente_nome || purchase.fornecedor_nome);
  });
  if (invalid.length) {
    console.error('NOTURNO_CLASSIFICATION_VALIDATION_FAILED', JSON.stringify(invalid));
    process.exitCode = 2;
    return;
  }

  const changes = MOVES.filter(move => {
    const purchase = byId.get(move.id);
    const expectedMeta = move.grupo === 'PAMPULHA' ? PAMPULHA_META_ID : CENTRO_META_ID;
    const expectedCenter = move.grupo === 'PAMPULHA' ? PAMPULHA_CENTER : CENTRO_CENTER;
    return purchase.meta_id !== expectedMeta || purchase.rubrica_id !== move.rubrica || purchase.centro_custo !== expectedCenter;
  });
  const stats = { apply: APPLY, validated: MOVES.length, changed: changes.length, pampulha_normalized: 0 };

  for (const move of changes) {
    const metaId = move.grupo === 'PAMPULHA' ? PAMPULHA_META_ID : CENTRO_META_ID;
    const center = move.grupo === 'PAMPULHA' ? PAMPULHA_CENTER : CENTRO_CENTER;
    if (APPLY) await pool.query(`UPDATE purchase_requests SET
      meta_id=$1, rubrica_id=$2, centro_custo=$3,
      raw_data=COALESCE(raw_data,'{}'::jsonb)||$4::jsonb,
      updated_at=NOW(), updated_date=NOW()
      WHERE id=$5`, [metaId, move.rubrica, center, JSON.stringify({
      classificacao_noturno_2026: { grupo: move.grupo, fonte: 'Projecao Execucao Financeira - Noturno nos Museus.xlsx', conciliado_em: new Date().toISOString() },
    }), move.id]);
    console.log('NOTURNO_CLASSIFICATION_MOVE', JSON.stringify({ ...move, meta_id: metaId, centro_custo: center, apply: APPLY }));
  }

  const currentPamp = await pool.query(`SELECT id FROM purchase_requests
    WHERE rubrica_id = ANY($1::text[])
      AND (meta_id IS DISTINCT FROM $2 OR centro_custo IS DISTINCT FROM $3)`, [[...PAMPULHA_RUBRICAS], PAMPULHA_META_ID, PAMPULHA_CENTER]);
  stats.pampulha_normalized = currentPamp.rowCount;
  if (APPLY && currentPamp.rowCount) await pool.query(`UPDATE purchase_requests SET
    meta_id=$1, centro_custo=$2,
    raw_data=COALESCE(raw_data,'{}'::jsonb)||$3::jsonb,
    updated_at=NOW(), updated_date=NOW()
    WHERE rubrica_id = ANY($4::text[])`, [PAMPULHA_META_ID, PAMPULHA_CENTER, JSON.stringify({
    classificacao_noturno_2026: { grupo: 'PAMPULHA', fonte: 'rubrica oficial 4o aditivo', conciliado_em: new Date().toISOString() },
  }), [...PAMPULHA_RUBRICAS]]);

  if (APPLY) await syncRubricaBalances();
  const totals = await pool.query(`SELECT r.id, r.nome, COUNT(p.id)::int AS notas,
    COALESCE(ROUND(SUM(CASE WHEN p.nf_valor_total > 0 THEN p.nf_valor_total WHEN p.valor_aprovado > 0 THEN p.valor_aprovado ELSE COALESCE(p.valor_solicitado,p.valor_total,0) END)::numeric,2),0) AS utilizado
    FROM rubricas r LEFT JOIN purchase_requests p ON p.rubrica_id=r.id
      AND UPPER(COALESCE(p.status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
      AND COALESCE(p.incluir_no_somatorio,TRUE) IS DISTINCT FROM FALSE
      AND COALESCE(p.duplicada_financeira,FALSE)=FALSE
    WHERE r.id = ANY($1::text[])
    GROUP BY r.id,r.nome ORDER BY r.id`, [[...PAMPULHA_RUBRICAS]]);
  console.log('NOTURNO_CLASSIFICATION_DONE', JSON.stringify({ ...stats, pampulha: totals.rows }));
}

run().catch(error => { console.error('NOTURNO_CLASSIFICATION_FATAL', error); process.exitCode = 1; }).finally(() => pool.end());
