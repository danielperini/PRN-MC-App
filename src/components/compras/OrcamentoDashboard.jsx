import React from 'react';
import { AlertTriangle, Users } from 'lucide-react';

function toNumber(v) {
  return Number(v) || 0;
}

function getPurchaseValue(p) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_solicitado));

}

function normalizeText(value) {
  return String(value || '').
  toLowerCase().
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  trim();
}

function getRubricaPrevisto(r) {
  return (
    toNumber(r?.valor_rubrica) ||
    toNumber(r?.valor_previsto) ||
    toNumber(r?.previsto) ||
    toNumber(r?.saldo_inicial) ||
    0);

}

function getRubricaUtilizado(r) {
  return toNumber(r?.valor_utilizado) || toNumber(r?.utilizado) || 0;
}

function getRubricaNome(r) {
  return (
    r?.nome ||
    r?.descricao ||
    r?.rubrica_nome ||
    r?.titulo ||
    '');

}

function getRubricaGrupo(r) {
  return (
    r?.grupo ||
    r?.categoria ||
    r?.natureza_nome ||
    r?.grupo_nome ||
    '');

}

function isRubricaEquipe(r) {
  const grupo = normalizeText(getRubricaGrupo(r));
  const nome = normalizeText(getRubricaNome(r));

  const gruposEquipe = [
  'equipe e gestao',
  'manutencao e operacao',
  'noturno nos museus 2026'];


  const nomesEquipeExatos = [
  'coordenador geral',
  'assistente de coordenacao e producao',
  'coordenador de comunicacao',
  'analista administrativo-financeira',
  'analista administrativo financeira',
  'assistente administrativo',
  'producao mis/mumo/mhab',
  'assessor de imprensa',
  'designer',
  'rede social / marketing cultural (mes 19 ao 28)',
  'rede social / marketing cultural (mês 19 ao 28)',
  'fotografo (mes 19 ao 28)',
  'fotografo (mês 19 ao 28)',
  'educador mis / mumo / mhab',
  'producao (ed. 2026)',
  'assistente de producao (ed. 2026)'];


  const palavrasEquipe = [
  'coordenador',
  'coordenacao',
  'coordenação',
  'comunicacao',
  'comunicação',
  'administrativo',
  'administrativa',
  'producao',
  'produção',
  'assessor',
  'designer',
  'fotografo',
  'fotógrafo',
  'marketing cultural',
  'educador',
  'assistente de producao',
  'assistente de produção'];


  const grupoCompativel = gruposEquipe.includes(grupo);
  const nomeExato = nomesEquipeExatos.includes(nome);
  const nomePorPalavra = palavrasEquipe.some((p) => nome.includes(normalizeText(p)));

  if (grupo === 'noturno nos museus 2026') {
    return nome.includes('producao') || nome.includes('produção');
  }

  if (grupo === 'manutencao e operacao') {
    return nome.includes('educador');
  }

  if (grupo === 'equipe e gestao') {
    return true;
  }

  return grupoCompativel || nomeExato || nomePorPalavra;
}

function getIaRiskStatus(p) {
  return String(
    p?.ia_risco_status ||
    p?.ai_risk_status ||
    p?.nf_ia_status ||
    p?.analise_ia_status ||
    ''
  ).toUpperCase();
}

function getIaRiskSummary(p) {
  return (
    p?.ia_risco_resumo ||
    p?.ai_risk_summary ||
    p?.nf_ia_resumo ||
    p?.analise_ia_resumo ||
    '');

}

function getIaRiskDate(p) {
  return (
    p?.ia_risco_data_analise ||
    p?.ai_risk_analyzed_at ||
    p?.updated_date ||
    p?.updatedAt ||
    p?.created_date ||
    p?.createdAt ||
    null);

}

function getItemLabel(p) {
  return (
    p?.titulo ||
    p?.title ||
    p?.descricao ||
    p?.description ||
    p?.nome ||
    p?.fornecedor_nome ||
    p?.supplier_name ||
    p?.profissional_nome ||
    p?.team_member_name ||
    p?.team_member_nome ||
    `Compra ${p?.id || ''}`);

}

function getPrimaryRiskReason(p) {
  const summary = getIaRiskSummary(p);
  if (summary) return summary;

  const motivos = p?.ia_risco_motivos || p?.ai_risk_reasons || p?.nf_ia_motivos;
  if (Array.isArray(motivos) && motivos.length > 0) {
    return String(motivos[0] || '');
  }

  const semRubrica = !p?.rubrica_id && !p?.budgetline_id && !p?.budget_line_id;
  if (semRubrica) return 'sem rubrica vinculada';

  if (p?.nf_valida === false) return 'nota fiscal inválida';

  if (
  p?.nf_valor_extraido &&
  Math.abs(toNumber(p.nf_valor_extraido) - toNumber(p.valor_solicitado)) > 1)
  {
    return 'divergência de valor da nota';
  }

  return 'inconsistência detectada';
}

export default function OrcamentoDashboard({
  budgetLines = [],
  purchases = [],
  rubricas = []
}) {
  /* ================= BASE ================= */

  const TOTAL_PREVISTO = 1320000;
  const totalInicial = TOTAL_PREVISTO;

  const totalComprometido = rubricas.reduce(
    (acc, r) => acc + toNumber(r.valor_utilizado),
    0
  );

  const totalDisponivel = totalInicial - totalComprometido;
  const pctUsado = totalInicial > 0 ? totalComprometido / totalInicial * 100 : 0;

  /* ================= EXECUÇÃO REAL ================= */

  const totalPago = purchases.
  filter((p) => p.status === 'PAGO').
  reduce((acc, p) => acc + getPurchaseValue(p), 0);

  const totalAprovado = purchases.
  filter(
    (p) =>
    p.status === 'APROVADO_COORD' ||
    p.status === 'APROVADO_ADMIN' ||
    p.status === 'PAGO'
  ).
  reduce((acc, p) => acc + getPurchaseValue(p), 0);

  const pctExecucao = totalInicial > 0 ? totalPago / totalInicial * 100 : 0;

  /* ================= EQUIPE ================= */

  const rubricasEquipe = rubricas.filter(isRubricaEquipe);

  const totalEquipeViaRubrica = rubricasEquipe.reduce(
    (acc, r) => acc + getRubricaUtilizado(r),
    0
  );

  const totalEquipeViaPurchases = purchases.
  filter((p) => p.origem === 'TEAM_PAYMENT' || p.team_payment_id).
  reduce((acc, p) => acc + getPurchaseValue(p), 0);

  const totalEquipe = totalEquipeViaRubrica > 0 ?
  totalEquipeViaRubrica :
  totalEquipeViaPurchases;

  const totalUtilizadoGeralRubricas = rubricas.reduce(
    (acc, r) => acc + getRubricaUtilizado(r),
    0
  );

  const totalCompras = purchases.reduce((acc, p) => acc + getPurchaseValue(p), 0);

  const basePercentualEquipe = totalUtilizadoGeralRubricas > 0 ?
  totalUtilizadoGeralRubricas :
  totalCompras;

  const pctEquipe = basePercentualEquipe > 0 ?
  totalEquipe / basePercentualEquipe * 100 :
  0;

  /* ================= RISCO ================= */

  const riscoIaCompras = purchases.
  filter((p) => {
    const status = getIaRiskStatus(p);
    const statusHumanoFinal = String(
      p?.nf_status_final ||
      p?.invoice_final_status ||
      ''
    ).toUpperCase();

    if (statusHumanoFinal === 'APROVADA') return false;
    return status === 'ATENCAO' || status === 'ATENÇÃO' || status === 'CRITICO' || status === 'CRÍTICO';
  }).
  sort((a, b) => {
    const da = new Date(getIaRiskDate(a) || 0).getTime();
    const db = new Date(getIaRiskDate(b) || 0).getTime();
    return db - da;
  });

  const riscoComprasFallback = purchases.filter((p) => {
    const semRubrica = !p?.rubrica_id && !p?.budgetline_id && !p?.budget_line_id;
    const nfInvalida = p?.nf_valida === false;
    const divergenciaValor =
    p?.nf_valor_extraido &&
    Math.abs(toNumber(p.nf_valor_extraido) - toNumber(p.valor_solicitado)) > 1;

    return semRubrica || nfInvalida || divergenciaValor;
  });

  const riscoCompras = riscoIaCompras.length > 0 ? riscoIaCompras : riscoComprasFallback;
  const riscoRecentes = riscoCompras.slice(0, 2);

  /* ================= NATUREZA ================= */

  const porNatureza = budgetLines.reduce((acc, l) => {
    const key = l.natureza_nome || l.natureza_codigo || 'Outros';

    if (!acc[key]) {
      acc[key] = { nome: key, previsto: 0, comprometido: 0 };
    }

    acc[key].previsto += toNumber(l.saldo_inicial);
    acc[key].comprometido += toNumber(l.saldo_comprometido);

    return acc;
  }, {});

  const fmt = (v) =>
  `R$ ${toNumber(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2
  })}`;

  return (
    <div className="space-y-8 hidden">
      {/* KPI PRINCIPAL */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4"></div>

      {/* BARRA DE PROGRESSO - COMPROMETIMENTO */}
      <div>
        




        
        <div className="h-6 bg-white border-2 border-white rounded-lg overflow-hidden">
          <div
            className="h-full bg-black transition-all"
            style={{
              width: `${totalInicial > 0 ? Math.min(totalComprometido / totalInicial * 100, 100) : 0}%`
            }} />
          
        </div>
      </div>

      {/* EQUIPE + RISCO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 border rounded-xl bg-purple-50 hidden">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-purple-700" />
            <span className="text-xs text-purple-700">Equipe</span>
          </div>
          <p className="break-words text-lg font-bold leading-tight text-purple-800 tabular-nums">{fmt(totalEquipe)}</p>
          <p className="text-xs text-purple-600">{pctEquipe.toFixed(1)}% Restantes</p>
        </div>

        <div className="p-5 border rounded-xl bg-red-50 hidden">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-xs text-red-600">Risco IA</span>
          </div>

          <p className="text-xl font-bold text-red-700">{riscoCompras.length}</p>

          <p className="text-xs text-red-600 mb-2">
            {riscoCompras.length === 0 ?
            'nenhuma inconsistência recente' :
            riscoIaCompras.length > 0 ?
            'notas fiscais com inconsistência apontada pela IA' :
            'compras com inconsistência'}
          </p>

          {riscoRecentes.length > 0 &&
          <div className="space-y-1">
              {riscoRecentes.map((item) =>
            <div key={item.id} className="text-[11px] text-red-700 leading-snug">
                  • {getItemLabel(item)} — {getPrimaryRiskReason(item)}
                </div>
            )}
            </div>
          }
        </div>
      </div>

      {/* NATUREZA */}
      <div>
        
        <div className="space-y-2">
          {Object.values(porNatureza).map((n) => {
            const pct = n.previsto > 0 ? n.comprometido / n.previsto * 100 : 0;

            return (
              <div key={n.nome} className="p-3 border rounded-lg">
                <div className="flex justify-between text-xs">
                  <span>{n.nome}</span>
                  <span>{pct.toFixed(0)}%</span>
                </div>

                <div className="h-1 bg-gray-100 mt-1">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${pct}%` }} />
                  
                </div>
              </div>);

          })}
        </div>
      </div>

      {/* TABELA */}
      <table className="w-full text-xs">
        <thead>
          <tr>
            
            
            
            
            
          </tr>
        </thead>

        <tbody>
          {budgetLines.map((l) => {
            const saldo = toNumber(l.saldo_inicial) - toNumber(l.saldo_comprometido);

            return (
              <tr key={l.id}>
                <td>{l.codigo}</td>
                <td>{l.descricao}</td>
                <td>{fmt(l.saldo_inicial)}</td>
                <td>{fmt(l.saldo_comprometido)}</td>
                <td className={saldo < 0 ? 'text-red-600' : 'text-green-600'}>
                  {fmt(saldo)}
                </td>
              </tr>);

          })}
        </tbody>
      </table>
    </div>);

}
