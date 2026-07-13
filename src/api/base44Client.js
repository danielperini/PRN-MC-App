import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { agruparMovimentacoesPorMes } from '@/utils/movimentacoesMensais';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

if (!appId) {
  console.error('VITE_BASE44_APP_ID não configurado.');
}

const client = createClient({
  appId,
  token: token || undefined,
  functionsVersion,
  serverUrl: '',
  requiresAuth: true,
  appBaseUrl,
});

const movimentacaoEntity = client?.entities?.MovimentacaoBancaria;
if (movimentacaoEntity?.list && !movimentacaoEntity.__monthNormalized) {
  const listOriginal = movimentacaoEntity.list.bind(movimentacaoEntity);
  movimentacaoEntity.list = async (...args) => {
    const registros = await listOriginal(...args);
    if (!Array.isArray(registros)) return registros;
    return agruparMovimentacoesPorMes(registros).flatMap(grupo => grupo.registros);
  };
  movimentacaoEntity.__monthNormalized = true;
}

export const base44 = client;
