import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Critérios padrão (hardcoded) — retrocompatibilidade total quando não há registro persistido.
 * Espelham exatamente as heurísticas dos componentes originais CumprimentoMetasFisicas e
 * ResumoConsolidadoNoturnoMeta20 antes desta feature.
 */
export const DEFAULTS_CRITERIOS = {
  'dashboard_criterios_meta_20': {
    meta_codigos_aceitos: ['20', '10'],
    classificacoes_aceitas: ['cultural', 'educativa', 'meta'],
    palavras_chave_inclusao: ['mostra', 'cultural', 'show', 'teatro', 'apresent', 'música', 'educa', 'oficina', 'palestra', 'formação', 'roda'],
    palavras_chave_exclusao: ['11b', 'pampulha', '11', '16', '19', 'iemanjá', 'iemanja', 'noturno', 'diária', 'diaria'],
    geral_mode: 'consolidado',
  },
  'dashboard_criterios_noturno': {
    meta_codigos_aceitos: ['11'],
    classificacoes_aceitas: [],
    palavras_chave_inclusao: ['noturno centro'],
    palavras_chave_exclusao: ['11b', 'pampulha', 'noturno', '16', 'diária', 'diaria', '20', '10', 'mostra', '19', 'iemanjá', 'iemanja'],
    geral_mode: 'apenas_geral',
  },
};

export const CHAVES_DISPONIVEIS = [
  { chave: 'dashboard_criterios_meta_20', label: 'Meta 20 — Ações Educativas/Culturais' },
  { chave: 'dashboard_criterios_noturno', label: 'Noturno Centro — Meta 11' },
];

const DEFAULT_BASE = {
  meta_codigos_aceitos: [],
  classificacoes_aceitas: [],
  palavras_chave_inclusao: [],
  palavras_chave_exclusao: [],
  geral_mode: 'apenas_geral',
};

export function criteriosParaChave(chave) {
  return DEFAULTS_CRITERIOS[chave] || DEFAULT_BASE;
}

/**
 * Classifica uma atividade usando critérios dinâmicos (JSON).
 * Retorna `true` se a atividade é contabilizada, `null` caso contrário.
 * Ordem:
 *   1. Exclusões (meta_codigo, nome ou tipo contêm palavra-chave de exclusão) → null
 *   2. meta_codigo/meta_id contém código aceito → true
 *   3. classificacao da atividade bate com classificações aceitas → true
 *   4. nome/tipo contém palavra-chave de inclusão → true
 *   5. Caso contrário → null
 */
export function classificarComCriterios(a, criterios) {
  if (!a || !criterios) return null;

  const cod = String(a.meta_codigo || a.meta_id || '').toLowerCase();
  const nome = String(a.titulo || a.nome || a.descricao || '').toLowerCase();
  const tipo = (Array.isArray(a.tipo_acao_lista) ? a.tipo_acao_lista : [])
    .join(' ').toLowerCase();
  const class_ = String(a.classificacao || '').toLowerCase();

  const codigos = Array.isArray(criterios.meta_codigos_aceitos) ? criterios.meta_codigos_aceitos : [];
  const classificacoes = Array.isArray(criterios.classificacoes_aceitas) ? criterios.classificacoes_aceitas : [];
  const inclusao = Array.isArray(criterios.palavras_chave_inclusao) ? criterios.palavras_chave_inclusao : [];
  const exclusao = Array.isArray(criterios.palavras_chave_exclusao) ? criterios.palavras_chave_exclusao : [];

  for (const ex of exclusao) {
    const exLow = String(ex || '').toLowerCase().trim();
    if (!exLow) continue;
    if (cod.includes(exLow) || nome.includes(exLow) || tipo.includes(exLow)) return null;
  }
  for (const m of codigos) {
    const mLow = String(m || '').toLowerCase().trim();
    if (!mLow) continue;
    if (cod.includes(mLow)) return true;
  }
  for (const c of classificacoes) {
    const cLow = String(c || '').toLowerCase().trim();
    if (!cLow) continue;
    if (class_ === cLow || tipo.includes(cLow)) return true;
  }
  for (const inc of inclusao) {
    const incLow = String(inc || '').toLowerCase().trim();
    if (!incLow) continue;
    if (nome.includes(incLow) || tipo.includes(incLow)) return true;
  }
  return null;
}

/**
 * Conta quantas atividades seriam consideradas por cada par de critérios.
 * Usado para o preview "X atividades (atual: Y)" no drawer.
 */
export function contarAtividades(atividades, criterios) {
  if (!Array.isArray(atividades) || !criterios) return 0;
  let n = 0;
  for (const a of atividades) {
    if (classificarComCriterios(a, criterios)) n += 1;
  }
  return n;
}

/**
 * Hook reativo: carrega critérios persistidos por chave (5min staleTime),
 * com fallback automático para DEFAULTS_CRITERIOS[chave].
 */
export function useDashboardCriterios(chave) {
  const queryClient = useQueryClient();
  const queryKey = ['dashboard-criterios', chave];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const recs = await base44.entities.MetadadosConfig.filter({ chave_config: chave });
        if (recs && recs.length > 0 && recs[0].config_json) {
          return recs[0].config_json;
        }
      } catch (e) {
        // ignore — fallback abaixo
      }
      return criteriosParaChave(chave);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!chave,
  });

  const saveCriterios = async (config) => {
    let recs = [];
    try {
      recs = await base44.entities.MetadadosConfig.filter({ chave_config: chave });
    } catch (e) {
      // ignore
    }
    const payload = {
      categoria: 'dashboard_criterios',
      valor: chave,
      label: `Critérios Dashboard — ${chave}`,
      chave_config: chave,
      config_json: config,
      ativo: true,
    };
    let saved;
    if (recs && recs.length > 0) {
      saved = await base44.entities.MetadadosConfig.update(recs[0].id, { config_json: config });
    } else {
      saved = await base44.entities.MetadadosConfig.create(payload);
    }
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['dashboard-criterios'] });
    return saved;
  };

  return {
    criterios: data || criteriosParaChave(chave),
    isLoading,
    refetch,
    saveCriterios,
  };
}