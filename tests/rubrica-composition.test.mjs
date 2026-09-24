import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRubricaComposition } from '../backend/rubrica-composition.mjs';

test('o utilizado é exatamente a soma das solicitações exibidas, em centavos', () => {
  const result = buildRubricaComposition(
    [{ id: 'r1', grupo: 'Noturno', rubrica: 'Monitores', orcado: 3000 }],
    [
      { rubrica_id: 'r1', amount_cents: '300000', purchase: { id: 'p1', status: 'APROVADO' } },
      { rubrica_id: 'r1', amount_cents: '210000', purchase: { id: 'p2', status: 'PAGO', raw_data: { segredo: true } } },
    ],
  );
  assert.equal(result.r1.utilizado, 5100);
  assert.equal(result.r1.saldo, -2100);
  assert.equal(result.r1.percentual, 170);
  assert.equal(result.r1.solicitacoes.reduce((sum, p) => sum + Math.round(p.valor_composicao * 100), 0), result.r1.total_cents);
  assert.equal(result.r1.solicitacoes[1].raw_data, undefined);
});

test('rubrica sem solicitação continua auditável e mostra zero', () => {
  const result = buildRubricaComposition([{ id: 'r2', orcado: 21000 }], []);
  assert.equal(result.r2.utilizado, 0);
  assert.equal(result.r2.saldo, 21000);
  assert.deepEqual(result.r2.solicitacoes, []);
});
