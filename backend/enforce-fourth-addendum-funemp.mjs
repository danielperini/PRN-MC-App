import pg from 'pg';

// Official classification rule supplied by the project: only fiscal records
// with a FUNEMP reference can remain in the 4th Addendum / Noturno Pampulha.
// This script is deliberately safe by default. Run with
// FUNEMP_4TH_ADDITIVE_APPLY=1 to persist the audited correction.
const APPLY=String(process.env.FUNEMP_4TH_ADDITIVE_APPLY || '') === '1';
const { Pool }=pg;
const pool=new Pool({
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor', password:process.env.POSTGRES_PASSWORD || '',
});

const META_3='6a3c0b9bfa079f5914d83253';
const META_4='6a3c0b9bfa079f5914d83254';
const CENTER_3='Noturno 2026';
const CENTER_4='Noturno Pampulha';
const RUBRICAS_4=new Set([
  'rubrica-4a-apresentacoes-pampulha',
  'rubrica-4a-infraestrutura-pampulha',
  'rubrica-4a-produtor-pampulha',
  'rubrica-4a-sinalizacao-pampulha',
]);
// Equivalent 3rd Addendum budget lines. This preserves the expense category
// when a wrongly grouped Pampulha record is returned to Noturno 2026.
const RUBRICA_3_BY_4={
  'rubrica-4a-apresentacoes-pampulha':'3e50ff7c0ae346099cf986bf',
  'rubrica-4a-infraestrutura-pampulha':'89e8e86924dc9b5092c6ff61',
  'rubrica-4a-produtor-pampulha':'8041979a22bd5bddb1c95927',
  'rubrica-4a-sinalizacao-pampulha':'fb1378f042dff12a9abe3c2e',
};

function fiscalText(row) {
  return [row.descricao_item,row.descricao_servico,row.fornecedor_nome,row.nf_emitente_nome,row.centro_custo,row.rubrica_nome,row.raw_data && JSON.stringify(row.raw_data)]
    .filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
}
function hasFunemp(row) { return /\bFUNEMP\b/.test(fiscalText(row)); }
function amount(row) { return Number(row.nf_valor_total || row.valor_aprovado || row.valor_total || row.valor_solicitado || 0); }

async function syncRubricaBalances() {
  await pool.query(`WITH used AS (
    SELECT rubrica_id,ROUND(SUM(CASE WHEN nf_valor_total>0 THEN nf_valor_total WHEN valor_aprovado>0 THEN valor_aprovado WHEN valor_total>0 THEN valor_total ELSE COALESCE(valor_solicitado,0) END)::numeric,2) amount
    FROM purchase_requests
    WHERE rubrica_id IS NOT NULL AND UPPER(COALESCE(status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
      AND COALESCE(incluir_no_somatorio,TRUE) IS DISTINCT FROM FALSE AND COALESCE(duplicada_financeira,FALSE)=FALSE
    GROUP BY rubrica_id
  ) UPDATE rubricas r SET valor_utilizado=COALESCE(u.amount,0),saldo=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),saldo_real=COALESCE(r.valor_total,r.valor_rubrica,0)-COALESCE(u.amount,0),percentual_utilizado=CASE WHEN COALESCE(r.valor_total,r.valor_rubrica,0)>0 THEN ROUND(COALESCE(u.amount,0)/COALESCE(r.valor_total,r.valor_rubrica,0)*100,2) ELSE 0 END,updated_at=NOW() FROM (SELECT id FROM rubricas) all_r LEFT JOIN used u ON u.rubrica_id=all_r.id WHERE r.id=all_r.id`);
}

async function run() {
  const rows=(await pool.query(`SELECT * FROM purchase_requests WHERE meta_id=$1 OR lower(COALESCE(centro_custo,'')) LIKE '%pampulha%' OR rubrica_id=ANY($2::text[]) ORDER BY nf_numero,id`,[META_4,[...RUBRICAS_4]])).rows;
  const report={apply:APPLY,analisadas:rows.length,funemp_quarto:[],movidas_terceiro:[],sem_mapa:[],total_quarto:0,total_terceiro:0};
  for(const row of rows) {
    const fourth=hasFunemp(row);
    const targetRubrica=fourth ? row.rubrica_id : RUBRICA_3_BY_4[row.rubrica_id];
    const info={id:row.id,nf:row.nf_numero || null,fornecedor:row.nf_emitente_nome || row.fornecedor_nome || null,valor:amount(row),rubrica_origem:row.rubrica_id || null,rubrica_destino:targetRubrica || null};
    if (fourth) { report.funemp_quarto.push(info); report.total_quarto+=info.valor; }
    else { report.movidas_terceiro.push(info); report.total_terceiro+=info.valor; if(!targetRubrica) report.sem_mapa.push(info); }
    if (!APPLY || (!fourth && !targetRubrica)) continue;
    const targetMeta=fourth ? META_4 : META_3;
    const targetCenter=fourth ? CENTER_4 : CENTER_3;
    await pool.query(`UPDATE purchase_requests SET meta_id=$1,centro_custo=$2,rubrica_id=$3,raw_data=COALESCE(raw_data,'{}'::jsonb)||$4::jsonb,updated_at=NOW(),updated_date=NOW() WHERE id=$5`,[
      targetMeta,targetCenter,targetRubrica,JSON.stringify({
        classificacao_aditivo:{ aditivo:fourth?'4º Aditivo':'3º Aditivo', regra:'FUNEMP obrigatório para 4º Aditivo', evidencia:fourth?'FUNEMP encontrado':'FUNEMP ausente', conciliado_em:new Date().toISOString() },
      }),row.id,
    ]);
  }
  if (APPLY) await syncRubricaBalances();
  console.log('FOURTH_ADDITIVE_FUNEMP_RULE',JSON.stringify(report));
}

run().catch(error=>{ console.error('FOURTH_ADDITIVE_FUNEMP_RULE_FAILED',error); process.exitCode=1; }).finally(()=>pool.end());
