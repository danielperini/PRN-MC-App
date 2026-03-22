// 🔥 ALTERAÇÃO PRINCIPAL: apenas ajuste no payload

const payload = {
  ...form,

  // ❌ NÃO usar mais budgetline
  budgetline_id: null,

  report_id,
  centro_custo: form.centro_custo,
  rubrica_id: form.rubrica_id,

  // 🔥 garantir número
  valor_solicitado: toNumber(form.valor_solicitado),
  valor_unitario: toNumber(form.valor_unitario),
  qtd: toNumber(form.qtd) || 1,

  orcamento_url,
  nota_fiscal_url,

  ai_meta_score: aiAnalysis?.score,
  ai_meta_sugerida: aiAnalysis?.meta_sugerida,
  ai_analise: aiAnalysis?.justificativa,

  ai_rubrica_sugerida_id: rubricaSuggestion?.rubrica_id || null,
  ai_rubrica_sugerida_nome: rubricaSuggestion?.rubrica_nome || null,
  ai_rubrica_score: rubricaSuggestion?.score || null,
  ai_rubrica_justificativa: rubricaSuggestion?.justificativa || null,
  ai_rubrica_source: rubricaSuggestion?.source || null,

  status: 'RASCUNHO',
};
