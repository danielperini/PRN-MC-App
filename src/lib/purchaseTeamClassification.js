const TEAM_ORIGINS = new Set([
  'TEAM PAYMENT',
  'PAGAMENTO DE EQUIPE',
  'PAGAMENTOS DE EQUIPE',
  'PAGAMENTO EQUIPE',
  'FOLHA DE PAGAMENTO',
  'REMUNERACAO DE EQUIPE',
]);

function normalizeOrigin(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// A descrição pode mencionar equipes como destinatárias de água, transporte ou
// materiais. Somente um vínculo de pagamento ou uma origem explícita indica
// despesa de pessoal; texto livre e nome de rubrica não são prova disso.
export function isTeamPaymentPurchase(purchase) {
  if (!purchase) return false;
  if (purchase.team_payment_id) return true;
  return [purchase.tipo_origem, purchase.origem, purchase.tipo_solicitacao]
    .some((value) => TEAM_ORIGINS.has(normalizeOrigin(value)));
}
