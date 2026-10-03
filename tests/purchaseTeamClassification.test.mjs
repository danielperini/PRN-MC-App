import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTeamPaymentPurchase } from '../src/lib/purchaseTeamClassification.js';

test('água para equipes do Noturno não é pagamento de pessoal', () => {
  assert.equal(isTeamPaymentPurchase({
    descricao_item: 'Fornecimento de água mineral para apoio à operação das equipes no Noturno nos Museus',
    centro_custo: 'Noturno 2026',
    origem: 'reconstrucao_por_documento_fiscal',
  }), false);
});

test('vínculo explícito e origem de pagamento de equipe são classificados como pessoal', () => {
  assert.equal(isTeamPaymentPurchase({ team_payment_id: 'tp-123' }), true);
  assert.equal(isTeamPaymentPurchase({ origem: 'TEAM_PAYMENT' }), true);
  assert.equal(isTeamPaymentPurchase({ tipo_origem: 'Pagamentos de equipe' }), true);
});
