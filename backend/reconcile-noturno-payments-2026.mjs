import pg from 'pg';

const { Pool } = pg;
const APPLY = String(process.env.NOTURNO_PAYMENTS_APPLY || '') === '1';
const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

// Fonte: Projeção_Execução Financeira - Noturno nos Museus.xlsx.
// Colunas: grupo | fornecedor | NF | valor | status de pagamento.
const REFERENCE = `
PAMPULHA|61.749.395 TANURE LUIZ DE SOUZA LISBOA|54|150.00|PAGO
PAMPULHA|67.495.472 ALEXANDRE MESSIAS DOS SANTOS|2|750.00|PAGO
PAMPULHA|46.840.033 ALICE NUNES LOBO|54|3500.00|PAGO
PAMPULHA|ASSOCIACAO VELHA GUARDA DA FACULDADE DO SAMBA DE BELO HORIZONTE|4|2646.00|PAGO
PAMPULHA|FLAG IMPRESSAO DIGITAL LTDA|450|11250.00|PAGO
PAMPULHA|DANIELA ISIS DE SOUZA ARAUJO 08012082624|54|5000.00|PAGO
CENTRO|GLOBAL SUPPORT|915|1500.00|PAGO
CENTRO|MARGARET APARECIDA DE LIMA BABA 03776490667|64|750.00|PAGO
CENTRO|KDU DA FAVELINHA PRODUCOES CULTURAIS LTDA|68|750.00|PAGO
CENTRO|41.905.903 MARIA EDUARDA MEDEIROS MAURICIO|46|1000.00|PAGO
CENTRO|61.312.916 LETICIA RODRIGUES GONCALVES|22|500.00|PAGO
CENTRO|NL SEGURANCAS E SERVICOS LTDA|46|1400.00|PAGO
CENTRO|53.933.640 BRUNO FERREIRA MALAGUTI SOARES|22|300.00|PAGO
CENTRO|ELAS PRODUCOES LTDA|4|1000.00|PAGO
CENTRO|57.804.436 RIWLLER ALEIXO OLIVEIRA SILVA|19|300.00|PAGO
CENTRO|EMER-SOM LTDA|78|5515.00|PAGO
CENTRO|35.728.859 CAMILA NATALIA FERREIRA TEOFILO ALVES|55|800.00|PAGO
PAMPULHA|FLAG IMPRESSAO DIGITAL LTDA|459|3000.00|PAGO
PAMPULHA|61.749.395 TANURE LUIZ DE SOUZA LISBOA|56|150.00|PAGO
PAMPULHA|EMER-SOM LTDA|77|8985.00|PAGO
PAMPULHA|46.840.033 ALICE NUNES LOBO|55|3500.00|PAGO
CENTRO|41.905.903 MARIA EDUARDA MEDEIROS MAURICIO|49|1000.00|PAGO
CENTRO|42.137.908 CAROLINA GIOVANNA GONCALVES BRANDHUBER|12|300.00|PAGO
CENTRO|GLOBAL SUPPORT|937|1500.00|PAGO
CENTRO|61.645.049 LIGIA DUTRA DA SILVA|16|300.00|PAGO
CENTRO|ELAS PRODUCOES LTDA|5|1000.00|PAGO
CENTRO|14.529.359 ENIO FLAVIO MOL|48|1000.00|PAGO
CENTRO|61.312.916 LETICIA RODRIGUES GONCALVES|23|500.00|PAGO
CENTRO|ARTE EM ILUMINAR LTDA|2|10590.04|PAGO
CENTRO|42.708.981 EDIVALDO GOMES DA CRUZ|66|300.00|PAGO
CENTRO|MARGARET APARECIDA DE LIMA BABA 03776490667|67|750.00|PAGO
PAMPULHA|67.495.472 ALEXANDRE MESSIAS DOS SANTOS|3|750.00|PAGO
PAMPULHA|POLVO STUDIO LTDA|19|12700.00|PAGO
PAMPULHA|POLVO STUDIO LTDA|20|7300.00|PAGO
PAMPULHA|ARTE EM ILUMINAR LTDA|1|9409.96|PAGO
PAMPULHA|62.699.887 ALEXANDRE GRISSI MABILLOT|66|200.00|PAGO
CENTRO|SABOTAGE FILMES LTDA|9|15625.00|PAGO
CENTRO|23.488.089 MARILIA APARECIDA MARQUES|45|450.00|PAGO
CENTRO|52.002.448 BARBARA MIRANDA ELIZEI|16|300.00|PAGO
CENTRO|54.879.608 LUCIA DE FATIMA FARIA|26|450.00|PAGO
CENTRO|65.540.988 LARA DE PAULA PASSOS|6|3500.00|PAGO
CENTRO|RODRIGO BORGES PRODUCOES MUSICAIS LTDA|96|7700.00|PAGO
CENTRO|RODRIGO BORGES PRODUCOES MUSICAIS LTDA|97|1300.00|PAGO
CENTRO|54.809.911 KAMILLA NUNES RODRIGUES|45|1770.00|PAGO
CENTRO|50.627.369 JOSE HUMBERTO GLORIA LEAL JUNIOR|19|3500.00|PAGO
CENTRO|41.768.492 JERUSA ALVES FURBINO DE FIGUEIREDO|3|300.00|PENDENTE
CENTRO|30.423.617 PEDRO PAULO GOMES JUNIOR|18|300.00|PAGO
PAMPULHA|ASSOCIACAO VELHA GUARDA DA FACULDADE DO SAMBA DE BELO HORIZONTE|5|2354.00|PAGO
PAMPULHA|ATELIE DO EVENTO LTDA|34|385.00|PAGO
CENTRO|67.190.224 MARLI DE SOUZA|2|300.00|PAGO
CENTRO|19.291.971 SAMIRA LOPES MOTA|110|2500.00|PAGO
CENTRO|MATHEUS STEINMULLER NEVES 13632040680|5|300.00|PENDENTE
CENTRO|NL SEGURANCAS E SERVICOS LTDA|51|1400.00|PENDENTE
PAMPULHA|DANIELA ISIS DE SOUZA ARAUJO 08012082624|56|5469.85|PAGO
`.trim().split('\n').map((line, index) => {
  const [grupo, fornecedor, nf, valor, status] = line.split('|');
  return { line: index + 2, grupo, fornecedor, nf: String(nf).replace(/^0+/, '') || '0', valor: Number(valor), status };
});

const STOP_WORDS = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'LTDA', 'ME', 'EIRELI', 'S', 'A']);
const supplierKey = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/\d/g, ' ').replace(/[^A-Z]+/g, ' ')
  .split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token)).join(' ');
const invoiceNumber = value => String(value || '').replace(/\D/g, '').replace(/^0+/, '') || '0';
const amount = value => Number(Number(value || 0).toFixed(2));
const supplierMatches = (expected, actual) => {
  const a = supplierKey(expected);
  const b = supplierKey(actual);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const left = new Set(a.split(' '));
  const right = new Set(b.split(' '));
  const shared = [...left].filter(token => right.has(token));
  return shared.length >= Math.min(2, left.size, right.size) && shared.length / Math.max(left.size, right.size) >= 0.6;
};

async function run() {
  const result = await pool.query(`SELECT * FROM purchase_requests
    WHERE EXTRACT(YEAR FROM nf_data_emissao)=2026
      AND COALESCE(duplicada_financeira,false)=false
      AND COALESCE(incluir_no_somatorio,true)=true`);
  const purchases = result.rows;
  const stats = { source_rows: REFERENCE.length, paid_reference: 0, pending_reference: 0, matched: 0, updated: 0, already_correct: 0, unmatched: [], ambiguous: [] };

  for (const reference of REFERENCE) {
    if (reference.status === 'PAGO') stats.paid_reference++;
    else stats.pending_reference++;
    const candidates = purchases.filter(purchase =>
      invoiceNumber(purchase.nf_numero) === reference.nf &&
      amount(purchase.nf_valor_total ?? purchase.valor_solicitado ?? purchase.valor_total) === reference.valor &&
      supplierMatches(reference.fornecedor, purchase.nf_emitente_nome || purchase.fornecedor_nome)
    );
    if (candidates.length !== 1) {
      const record = { ...reference, candidates: candidates.map(row => ({ id: row.id, fornecedor: row.nf_emitente_nome || row.fornecedor_nome, status: row.status, pago: row.pago })) };
      (candidates.length ? stats.ambiguous : stats.unmatched).push(record);
      console.warn(candidates.length ? 'NOTURNO_PAYMENT_AMBIGUOUS' : 'NOTURNO_PAYMENT_UNMATCHED', JSON.stringify(record));
      continue;
    }
    const purchase = candidates[0];
    stats.matched++;
    const paid = reference.status === 'PAGO';
    const alreadyCorrect = paid
      ? String(purchase.status || '').toUpperCase() === 'PAGO' && purchase.pago === true && String(purchase.status_pagamento || '').toUpperCase() === 'PAGO'
      : purchase.pago === false && String(purchase.status_pagamento || '').toUpperCase() === 'AGUARDANDO_PAGAMENTO';
    if (alreadyCorrect) { stats.already_correct++; continue; }
    if (APPLY) {
      await pool.query(`UPDATE purchase_requests SET
        status=CASE WHEN $1 THEN 'PAGO' WHEN UPPER(COALESCE(status,''))='PAGO' THEN 'APROVADO_COORD' ELSE status END,
        pago=$1,
        status_pagamento=CASE WHEN $1 THEN 'PAGO' ELSE 'AGUARDANDO_PAGAMENTO' END,
        valor_aprovado=CASE WHEN $1 THEN COALESCE(NULLIF(nf_valor_total,0),NULLIF(valor_solicitado,0),valor_total) ELSE valor_aprovado END,
        raw_data=COALESCE(raw_data,'{}'::jsonb)||$2::jsonb,
        updated_at=NOW(), updated_date=NOW()
        WHERE id=$3`, [paid, JSON.stringify({
        conciliacao_pagamento_noturno_2026: true,
        referencia_pagamento: 'Projecao Execucao Financeira - Noturno nos Museus.xlsx',
        status_referencia: reference.status,
        grupo_referencia: reference.grupo,
        conciliado_em: new Date().toISOString(),
      }), purchase.id]);
    }
    stats.updated++;
    console.log('NOTURNO_PAYMENT_MATCH', JSON.stringify({ line: reference.line, id: purchase.id, nf: reference.nf, fornecedor: reference.fornecedor, valor: reference.valor, status: reference.status, apply: APPLY }));
  }
  console.log('NOTURNO_PAYMENT_RECONCILE_DONE', JSON.stringify({ apply: APPLY, ...stats, unmatched: stats.unmatched.length, ambiguous: stats.ambiguous.length }));
  if (stats.unmatched.length || stats.ambiguous.length) process.exitCode = 2;
}

run().catch(error => { console.error('NOTURNO_PAYMENT_RECONCILE_FATAL', error); process.exitCode = 1; }).finally(() => pool.end());
