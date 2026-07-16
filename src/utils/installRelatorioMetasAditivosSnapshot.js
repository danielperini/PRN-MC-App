import { base44 } from '@/api/base44Client';

const SNAPSHOT_EM = '2026-07-17';
const SNAPSHOT_FONTE = 'Painel Metas do 3º e 4º Aditivo informado pela coordenação';

const META_SNAPSHOT = {
  'meta-1': { status_objeto: 'Concluída', titulo: 'Equipe principal', previsto: 481900, realizado: 136900, percentual_financeiro: 28.41 },
  'meta-2': { status_objeto: 'Concluída', titulo: 'Plano de comunicação', conclusao_fisica: 100, sem_rubricas: true },
  'meta-3': { status_objeto: 'Em execução', titulo: 'Manutenção das exposições', previsto: 45000, realizado: 3753.36, percentual_financeiro: 8.34 },
  'meta-4': { status_objeto: 'Em execução', titulo: 'Alteração de núcleos e salas expositivas', previsto: 81719.85, realizado: 75445.85, percentual_financeiro: 92.32 },
  'meta-5': { status_objeto: 'Em execução', titulo: 'Ações educativas (mín. 60)', sem_rubricas: true },
  'meta-6': { status_objeto: 'Em execução', titulo: 'Ações culturais (mín. 30)', quantidade_prevista: 30, sem_rubricas: true },
  'meta-7': { status_objeto: 'Concluída', titulo: 'Contratação de educadores', previsto: 46000, realizado: 0, percentual_financeiro: 0 },
  'meta-8': { status_objeto: 'Em execução', titulo: 'Exposição e evento MHAB', sem_rubricas: true },
  'meta-9': { status_objeto: 'Em execução', titulo: 'Exposição e evento MIS', sem_rubricas: true },
  'meta-10': { status_objeto: 'Em execução', titulo: 'Mostras de baixa/média complexidade', previsto: 1000, realizado: 1002.62, percentual_financeiro: 100.26 },
  'meta-11': { status_objeto: 'Em execução', titulo: 'Noturno nos Museus', previsto: 148350, realizado: 84864, percentual_financeiro: 57.21 },
  'meta-11a': { status_objeto: 'Em execução', titulo: 'Noturno 2026', sem_rubricas: true },
  'meta-11b': { status_objeto: 'Em execução', titulo: 'Noturno Pampulha', sem_rubricas: true },
  'meta-12': { status_objeto: 'Em execução', titulo: 'Exposição MHAB (pesquisa e curadoria)', sem_rubricas: true },
  'meta-13': { status_objeto: 'Em execução', titulo: 'Exposição MUMO (pesquisa e curadoria)', sem_rubricas: true },
  'meta-14': { status_objeto: 'Concluída', titulo: 'Acessibilidade', conclusao_fisica: 100, sem_rubricas: true },
  'meta-15': { status_objeto: 'Concluída', titulo: 'Inscrição em Leis de Incentivo', conclusao_fisica: 100, sem_rubricas: true },
  'meta-16': { status_objeto: 'Em execução', titulo: 'Diárias de educadores', sem_rubricas: true },
  'meta-17': { status_objeto: 'Em execução', titulo: 'Publicações e catálogos', previsto: 37250, realizado: 7000, percentual_financeiro: 18.79 },
  'meta-18': { status_objeto: 'Em execução', titulo: 'Custeio das atividades educativas e culturais', previsto: 58000, realizado: 7984.71, percentual_financeiro: 13.77 },
  'meta-19': { status_objeto: 'Em execução', titulo: 'Atividade Presente de Iemanjá', sem_rubricas: true },
  'meta-20': { status_objeto: 'Em execução', titulo: 'Ações educativas e/ou culturais (30 ações)', previsto: 7500, realizado: 0, percentual_financeiro: 0 },
  'meta-21': { status_objeto: 'Em execução', titulo: 'Exposição e evento MUMO', previsto: 210000, realizado: 1550, percentual_financeiro: 0.74 },
  'meta-22': { status_objeto: 'Em execução', titulo: 'Consultoria para execução do projeto', previsto: 7500, realizado: 0, percentual_financeiro: 0 },
  'meta-23': { status_objeto: 'Em execução', titulo: 'Despesas Gerais', previsto: 38200, realizado: 19875, percentual_financeiro: 52.03 },
  'meta-24': { status_objeto: 'Em execução', titulo: 'Emenda Parlamentar', sem_rubricas: true },
  'meta-25': { status_objeto: 'Em execução', titulo: 'Outras Ações', sem_rubricas: true },
};

const text = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];
const normalize = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function canonicalMetaKey(meta = {}) {
  const raw = normalize(`${meta.meta_codigo || meta.codigo || meta.numero || meta.ordem || ''} ${meta.meta_nome || meta.nome || meta.titulo || ''}`);
  const match = raw.match(/(?:meta\s*)?(\d{1,2})([a-z])?/);
  return match ? `meta-${Number(match[1])}${match[2] || ''}` : '';
}

function enrichMeta(meta = {}) {
  const key = canonicalMetaKey(meta);
  const snapshot = META_SNAPSHOT[key];
  if (!snapshot) return meta;

  const isMeta6 = key === 'meta-6';
  const titulo = isMeta6
    ? text(meta.meta_nome || meta.nome || meta.titulo).replace(/36\s*(ações|acoes)/gi, '30 ações') || snapshot.titulo
    : text(meta.meta_nome || meta.nome || meta.titulo) || snapshot.titulo;

  return {
    ...meta,
    meta_nome: titulo,
    nome: meta.nome ? titulo : meta.nome,
    titulo: meta.titulo ? titulo : meta.titulo,
    quantidade_prevista: snapshot.quantidade_prevista ?? meta.quantidade_prevista,
    status_objeto_informado: snapshot.status_objeto,
    status_meta: snapshot.status_objeto,
    valor_previsto_meta: snapshot.previsto ?? null,
    valor_realizado_meta: snapshot.realizado ?? null,
    percentual_financeiro_meta: snapshot.percentual_financeiro ?? null,
    conclusao_fisica_informada: snapshot.conclusao_fisica ?? null,
    sem_rubricas_vinculadas: Boolean(snapshot.sem_rubricas),
    fonte_dados_meta: SNAPSHOT_FONTE,
    fonte_dados_meta_em: SNAPSHOT_EM,
  };
}

function financialRow(meta = {}) {
  const enriched = enrichMeta(meta);
  return {
    meta_id: enriched.meta_id || enriched.id || '',
    meta_codigo: enriched.meta_codigo || enriched.codigo || '',
    meta_nome: enriched.meta_nome || enriched.nome || enriched.titulo || '',
    status_objeto: enriched.status_objeto_informado || enriched.status_meta || '',
    valor_previsto: enriched.valor_previsto_meta,
    valor_realizado: enriched.valor_realizado_meta,
    percentual_financeiro: enriched.percentual_financeiro_meta,
    conclusao_fisica: enriched.conclusao_fisica_informada,
    sem_rubricas_vinculadas: enriched.sem_rubricas_vinculadas,
    fonte: SNAPSHOT_FONTE,
    data_referencia: SNAPSHOT_EM,
  };
}

export function installRelatorioMetasAditivosSnapshot() {
  if (typeof window === 'undefined' || window.__relatorioMetasAditivosSnapshotInstalled) return;
  window.__relatorioMetasAditivosSnapshotInstalled = true;

  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entity?.update || entity.__metasAditivosSnapshotWrapped) return;

  const originalUpdate = entity.update.bind(entity);
  entity.update = async (id, payload = {}) => {
    const result = await originalUpdate(id, payload);

    let current = {};
    try { current = await entity.get(id); } catch (_) {}

    const cronograma = asArray(current.cronograma_metas).map(enrichMeta);
    const tabelaMetas = asArray(current.tabela_metas_atividades).map(enrichMeta);
    const metaExecucao = asArray(current.meta_execucao).map(enrichMeta);

    const execucaoFinanceira = cronograma.map(financialRow);
    const totalVinculado = cronograma.reduce((sum, meta) => sum + Number(meta.quantidade_realizada || 0), 0);
    const publicoVinculado = cronograma.reduce((sum, meta) => sum + Number(meta.publico_realizado || 0), 0);

    return originalUpdate(id, {
      cronograma_metas: cronograma,
      tabela_metas_atividades: tabelaMetas,
      meta_execucao: metaExecucao,
      execucao_financeira_metas: execucaoFinanceira,
      resumo_atividades_sem_meta: {
        classificacao: 'ROTINA / EXTRA',
        descricao: 'Sem meta vinculada',
        atividades_informadas: 169,
        publico_informado: 35514,
        atividades_vinculadas_identificadas: totalVinculado,
        publico_vinculado_identificado: publicoVinculado,
        regra: 'Os 169 registros e o público de 35.514 permanecem fora das metas até que exista vínculo explícito. Não são redistribuídos automaticamente.',
        fonte: SNAPSHOT_FONTE,
        data_referencia: SNAPSHOT_EM,
      },
      observacao_execucao_metas: 'A execução física e a financeira são apresentadas separadamente. Atividades ROTINA/EXTRA sem vínculo explícito não compõem o realizado das metas.',
      dados_metas_aditivos_atualizados_em: new Date().toISOString(),
    });
  };

  entity.__metasAditivosSnapshotWrapped = true;
}
