import test from 'node:test';
import assert from 'node:assert/strict';

const { parseDate } = await import('../backend/programacao-date.mjs');

test('datas da planilha são dias de calendário estáveis no fuso de Brasília', () => {
  for (const value of [new Date('2026-10-15T03:00:28.000Z'), '15/10/2026', '2026-10-15']) {
    assert.equal(parseDate(value, 'Outubro 2026')?.toISOString(), '2026-10-15T12:00:00.000Z');
  }
  assert.equal(parseDate('06/10 à 9/10 Turma única', 'Outubro 2026')?.toISOString(), '2026-10-06T12:00:00.000Z');
  assert.equal(parseDate('a partir de 13/10', 'Outubro 2026')?.toISOString(), '2026-10-13T12:00:00.000Z');
});

test('não inventa dia para data ausente ou inválida', () => {
  assert.equal(parseDate('', 'Novembro 2026'), null);
  assert.equal(parseDate('a confirmar', 'Novembro 2026'), null);
  assert.equal(parseDate('31/02/2026', 'Fevereiro 2026'), null);
});
