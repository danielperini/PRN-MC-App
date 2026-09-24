import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarMetas3e4Aditivos } from '../src/utils/metasAditivosPermitidos.js';
import { CENTROS_CUSTO, sugerirCentroCusto } from '../src/lib/centroCustoRubrica.js';

test('meta do 5º aditivo aparece sem liberar metas legadas ocultas', () => {
  const metas = [
    { id: 'simposio', nome: 'Meta 24 - Realizar o 3º Simpósio do Patrimônio Cultural de Belo Horizonte', aditivo: '5º Aditivo', ordem: 5 },
    { id: 'legada', nome: 'Meta 4 - Legada', aditivo: '3º Aditivo', ordem: 4 },
    { id: 'antiga', nome: 'Meta do 2º Aditivo', aditivo: '2º Aditivo', ordem: 26 },
  ];
  assert.deepEqual(filtrarMetas3e4Aditivos(metas).map((meta) => meta.id), ['simposio']);
});

test('centro do Simpósio está disponível e é sugerido apenas para sua rubrica', () => {
  assert.ok(CENTROS_CUSTO.includes('Terceiro Simpósio do Patrimônio de BH'));
  assert.equal(sugerirCentroCusto('Coordenador Geral (Simpósio)'), 'Terceiro Simpósio do Patrimônio de BH');
  assert.equal(sugerirCentroCusto('5º Aditivo - Produção'), 'Terceiro Simpósio do Patrimônio de BH');
  assert.equal(sugerirCentroCusto('Produção Noturno'), 'Produção');
});
