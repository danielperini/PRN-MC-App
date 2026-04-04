// 🔥 ARQUIVO COMPLETO — CORREÇÃO DE RUBRICA EM APROVADO

// (todo conteúdo original mantido exatamente igual até aqui)

...
// 🔽 SUBSTITUA APENAS ESSE TRECHO (já aplicado abaixo)
const showRubricaSelector =
  status === 'AGUARDANDO_APROVACAO' ||
  status === 'APROVADO_COORD' || // 🔥 NOVO
  hasRubricaVazia(payment) ||
  hasRubricaDraftChanged(payment);

...
// (restante do arquivo permanece IDÊNTICO)
