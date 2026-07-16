import { base44 } from '@/api/base44Client';
import * as moduloSincronizacao from './sincronizarRelatorioExecucao.js';

function normalizarLista(value) {
  return Array.isArray(value) ? value : [];
}

export async function listarMetasRelatorio(...args) {
  const fn = moduloSincronizacao?.listarMetasRelatorio;
  if (typeof fn === 'function') return fn(...args);

  const entidade = base44?.entities?.ProjectMeta;
  if (!entidade?.list) return [];
  const metas = await entidade.list('-created_date', 5000);
  return normalizarLista(metas);
}

export async function sincronizarRelatorioExecucao(payload) {
  const fn = moduloSincronizacao?.sincronizarRelatorioExecucao;
  if (typeof fn === 'function') return fn(payload);

  const relatorioId = payload?.relatorioId;
  if (!relatorioId) throw new Error('Relatório não identificado.');

  const atualizacao = {
    data_inicio: payload?.dataInicio || null,
    data_fim: payload?.dataFim || null,
    filtro_museu: payload?.filtroMuseu || 'todos',
    filtro_versao: payload?.filtroVersao || 'consolidado',
    filtro_meta_ids: normalizarLista(payload?.filtroMetaIds),
    sincronizado_em: new Date().toISOString(),
    sincronizacao_status: 'compatibilidade',
  };

  await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, atualizacao);
  return {
    relatorio_id: relatorioId,
    auditoria: {
      metas: atualizacao.filtro_meta_ids.length,
      notas_fiscais: 0,
      atividades: 0,
      fotos: 0,
    },
  };
}
