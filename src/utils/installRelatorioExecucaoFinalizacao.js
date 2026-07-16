import { base44 } from '@/api/base44Client';

const text = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];
const normalize = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function metaCode(row = {}) {
  const source = text(row.meta_codigo || row.codigo || row.numero || row.ordem || row.meta_id || row.id || row.meta_nome || row.nome);
  const match = source.toUpperCase().match(/(?:META\s*)?(\d{1,2})([A-Z])?/);
  return match ? `${Number(match[1])}${match[2] || ''}` : '';
}

function isRubrica(row = {}) {
  const source = normalize(`${row.meta_nome || row.nome || row.titulo || ''} ${row.rubrica || ''} ${row.grupo || ''}`);
  const hasFinance = ['valor_previsto', 'valor_total', 'valor_utilizado', 'saldo', 'natureza_despesa']
    .some((field) => row?.[field] !== undefined && row?.[field] !== null && text(row[field]));
  return hasFinance || /(rubrica|material de escritorio|alimentacao|lanches|transporte|seguranca|limpeza|designer|fotografo|contador|juridic|coordenador|analista administrativo|assistente administrativo|infraestrutura|producao executiva)/.test(source);
}

function unique(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function cleanSchedule(rows) {
  return unique(
    asArray(rows).filter((row) => !isRubrica(row) && (metaCode(row) || row.project_meta_id || row.chave_logica)),
    (row) => metaCode(row) || text(row.project_meta_id || row.meta_id || row.id || row.chave_logica),
  ).sort((a, b) => {
    const ma = metaCode(a).match(/(\d+)([A-Z]?)/);
    const mb = metaCode(b).match(/(\d+)([A-Z]?)/);
    const na = Number(ma?.[1] || 999);
    const nb = Number(mb?.[1] || 999);
    return na !== nb ? na - nb : text(ma?.[2]).localeCompare(text(mb?.[2]));
  });
}

function activityKey(item = {}) {
  return text(item.atividade_id || item.id || item.agenda_id) || `${normalize(item.atividade || item.titulo || item.nome)}|${text(item.data)}|${normalize(item.museu)}`;
}

function buildAudit(schedule, activityRows) {
  const issues = [];
  const byActivity = new Map();
  const metaCodes = new Set(schedule.map(metaCode).filter(Boolean));

  for (const meta of schedule) {
    const code = metaCode(meta);
    const activities = asArray(meta.agenda_atividades || meta.atividades_vinculadas);
    if (!activities.length) issues.push({ tipo: 'META_SEM_ATIVIDADE', meta: code || text(meta.meta_nome) });
    if (!asArray(meta.documentos_verificacao).length) issues.push({ tipo: 'META_SEM_EVIDENCIA', meta: code || text(meta.meta_nome) });
    for (const activity of activities) {
      const key = activityKey(activity);
      if (!key) continue;
      if (!byActivity.has(key)) byActivity.set(key, new Set());
      byActivity.get(key).add(code || text(meta.meta_nome));
    }
  }

  for (const [atividade, metas] of byActivity.entries()) {
    if (metas.size > 1) issues.push({ tipo: 'ATIVIDADE_EM_MULTIPLAS_METAS', atividade, metas: [...metas] });
  }

  for (const row of asArray(activityRows)) {
    const code = text(row.meta_id || row.meta_codigo);
    if (!code) issues.push({ tipo: 'ATIVIDADE_SEM_META', atividade: activityKey(row) });
    else if (metaCodes.size && !metaCodes.has(metaCode({ meta_codigo: code })) && !metaCodes.has(code)) {
      issues.push({ tipo: 'ATIVIDADE_META_INEXISTENTE', atividade: activityKey(row), meta: code });
    }
  }

  return {
    total_inconsistencias: issues.length,
    inconsistencias: issues,
    aprovado_para_exportacao: issues.filter((item) => item.tipo === 'ATIVIDADE_EM_MULTIPLAS_METAS').length === 0,
    auditado_em: new Date().toISOString(),
  };
}

function buildNarrative(schedule, summary = {}) {
  const metasExecutadas = schedule.filter((meta) => Number(meta.percentual_execucao || 0) > 0).length;
  const metasIntegrais = schedule.filter((meta) => Number(meta.percentual_execucao || 0) >= 100).length;
  const atividades = Number(summary.total_atividades || 0);
  const publico = Number(summary.publico_total || 0);
  const fotos = Number(summary.fotos_total || 0);
  const documentos = Number(summary.documentos_total || 0);

  return {
    introducao: `O relatório consolida a execução física do projeto com base nos registros aprovados de Agenda, Atividade, Programação e relatórios mensais, vinculados às metas oficiais do plano de trabalho.`,
    resultados: `Foram identificadas ${atividades.toLocaleString('pt-BR')} atividade(s), com público consolidado de ${publico.toLocaleString('pt-BR')} pessoa(s), ${fotos.toLocaleString('pt-BR')} registro(s) fotográfico(s) e ${documentos.toLocaleString('pt-BR')} documento(s) de verificação.`,
    metas: `${metasExecutadas} de ${schedule.length} meta(s) apresentam execução comprovada; ${metasIntegrais} estão registradas como integralmente realizadas.`,
    metodologia: 'A consolidação prioriza vínculos explícitos de meta e atividade. Na ausência de identificador, utiliza correspondência por título, descrição, museu, período e natureza da ação, preservando a origem de cada dado para auditoria.',
    orientacao_ia: 'Revisar o texto em português do Brasil, eliminar caixa alta desnecessária, não inventar resultados e citar somente atividades, público, documentos e fotografias presentes no contexto estruturado.',
  };
}

function installReprocessButton() {
  if (!/RelatorioExecucaoObjeto/i.test(window.location.pathname)) return;
  if (document.querySelector('[data-reprocessar-relatorios-execucao]')) return;

  const heading = [...document.querySelectorAll('h1, h2')].find((item) => /relat[oó]rio de execu[cç][aã]o/i.test(item.textContent || ''));
  const host = heading?.parentElement || document.querySelector('main');
  if (!host) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.reprocessarRelatoriosExecucao = 'true';
  button.className = 'ml-2 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
  button.textContent = 'Reprocessar relatórios existentes';
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    const original = button.textContent;
    try {
      const entity = base44?.entities?.RelatorioExecucaoObjeto;
      const records = await entity.list('-created_date', 10000);
      for (let index = 0; index < asArray(records).length; index += 1) {
        const record = records[index];
        button.textContent = `Reprocessando ${index + 1} de ${records.length}`;
        await entity.update(record.id, { ...record, reprocessamento_solicitado_em: new Date().toISOString() });
      }
      button.textContent = `${records.length} relatório(s) reprocessado(s)`;
    } catch (error) {
      console.error('[Relatório de execução] Falha no reprocessamento.', error);
      button.textContent = 'Falha ao reprocessar';
    } finally {
      setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
      }, 3500);
    }
  });
  host.appendChild(button);
}

export function installRelatorioExecucaoFinalizacao() {
  if (typeof window === 'undefined' || window.__relatorioExecucaoFinalizacaoInstalled) return;
  window.__relatorioExecucaoFinalizacaoInstalled = true;

  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (entity?.update && !entity.__finalizacaoWrapped) {
    const originalUpdate = entity.update.bind(entity);
    entity.update = async (id, payload = {}) => {
      let current = {};
      try { current = await entity.get(id); } catch (_) {}

      const schedule = cleanSchedule(payload.cronograma_metas || current.cronograma_metas);
      const activityRows = asArray(payload.tabela_atividades_evidencias || current.tabela_atividades_evidencias);
      const summary = payload.resumo_atividades_ia || current.resumo_atividades_ia || {};
      const audit = buildAudit(schedule, activityRows);
      const narrative = buildNarrative(schedule, summary);

      return originalUpdate(id, {
        ...payload,
        cronograma_metas: schedule,
        tabela_metas_atividades: schedule.map((meta) => ({
          meta_id: meta.meta_id || meta.id || meta.chave_logica,
          meta_codigo: meta.meta_codigo || metaCode(meta),
          meta_nome: meta.meta_nome || meta.nome,
          atividades: meta.agenda_atividades || meta.atividades_vinculadas || [],
          publico_realizado: Number(meta.publico_realizado || 0),
          fotos: meta.documentos_verificacao || [],
          percentual_execucao: Number(meta.percentual_execucao || 0),
          status_meta: meta.status_meta,
          justificativa: meta.justificativa,
        })),
        auditoria_cronograma_metas: audit,
        narrativa_ia_relatorio_execucao: narrative,
        prompt_ia_relatorio_execucao: {
          idioma: 'pt-BR',
          regras: ['não inventar dados', 'não duplicar atividades', 'não misturar metas e rubricas', 'preservar links e fontes', 'usar linguagem institucional clara'],
          contexto: activityRows,
          resumo: summary,
          cronograma: schedule,
        },
        finalizacao_relatorio_execucao_em: new Date().toISOString(),
      });
    };
    entity.__finalizacaoWrapped = true;
  }

  const run = () => window.requestAnimationFrame(installReprocessButton);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  run();
}
