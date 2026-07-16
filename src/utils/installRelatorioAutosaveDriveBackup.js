import jsPDF from 'jspdf';
import { base44 } from '@/api/base44Client';

const ROUTE_PATTERN = /RelatorioExecucaoObjeto/i;
const SECTION_MAP = [
  ['Endereço de Execução', 'endereco_execucao'],
  ['Divulgação da Parceria', 'divulgacao_parceria'],
  ['Descrição das Ações', 'descricao_acoes'],
  ['Público-Alvo', 'publico_alvo'],
  ['Pesquisa de Satisfação', 'pesquisa_satisfacao'],
  ['Cronograma de Metas', 'cronograma_metas'],
  ['Equipe de Trabalho', 'equipe_trabalho'],
  ['Impactos Econômicos e Sociais', 'impactos_economicos_sociais'],
  ['Sustentabilidade', 'sustentabilidade'],
  ['Avaliação da Parceria', 'avaliacao_parceria'],
  ['Assinatura', 'assinatura'],
  ['Anexos e Evidências', 'anexos'],
];

let currentReportId = null;
let currentReport = null;
let saveTimer = null;
let renderTimer = null;
let saving = false;

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function formatBRL(value) {
  return money(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isRoute() {
  return typeof window !== 'undefined' && ROUTE_PATTERN.test(window.location.pathname);
}

function sectionText(section) {
  if (!section) return '';
  if (typeof section === 'string') return section;
  if (Array.isArray(section)) return JSON.stringify(section);
  return text(
    section.texto_editado ||
    section.texto_ia ||
    section.texto_interpretativo_editado ||
    section.texto_interpretativo_ia ||
    section.justificativa_editada ||
    section.justificativa_ia,
  );
}

function metaName(meta = {}) {
  return text(meta.meta_nome || meta.nome || meta.titulo || meta.codigo || meta.meta_codigo || 'Meta');
}

function metaActions(meta = {}) {
  return text(meta.acoes || meta.acoes_previstas || meta.descricao_acoes || meta.atividade || meta.atividades || meta.agenda_atividades?.map?.((item) => item.atividade || item.titulo).join('; '));
}

function metaDocuments(meta = {}) {
  const docs = meta.documentos_verificacao || meta.fontes_verificacao || meta.fotos_verificacao || [];
  if (Array.isArray(docs)) return docs.length > 0;
  return Boolean(text(docs));
}

function validateMeta(meta = {}) {
  const missing = [];
  if (!metaName(meta) || metaName(meta) === 'Meta') missing.push('meta');
  if (!text(meta.resultado_esperado || meta.objetivo || meta.finalidade)) missing.push('resultado esperado');
  if (!metaActions(meta)) missing.push('ações');
  if (!text(meta.periodo || meta.periodo_execucao || meta.periodo_previsto)) missing.push('período');
  if (!metaDocuments(meta)) missing.push('documentos de verificação');
  if (!text(meta.resultado_alcancado || meta.resultados_alcancados)) missing.push('resultado alcançado');
  if (!text(meta.status_meta || meta.status_execucao || meta.situacao)) missing.push('status');
  if (!text(meta.justificativa || meta.justificativa_execucao)) missing.push('justificativa');
  return { ok: missing.length === 0, missing };
}

function validateReport(report = {}) {
  const metas = Array.isArray(report.cronograma_metas) ? report.cronograma_metas : [];
  const metaResults = metas.map((meta) => ({ meta, ...validateMeta(meta) }));
  const missingSections = [];
  const required = ['descricao_acoes', 'publico_alvo', 'cronograma_metas', 'equipe_trabalho', 'impactos_economicos_sociais', 'avaliacao_parceria', 'assinatura'];
  for (const key of required) {
    if (key === 'cronograma_metas') {
      if (!metas.length) missingSections.push('cronograma de metas');
      continue;
    }
    const value = report[key];
    const valid = Array.isArray(value) ? value.length > 0 : typeof value === 'object' ? Object.keys(value || {}).length > 0 || sectionText(value).length > 0 : text(value).length > 0;
    if (!valid) missingSections.push(key.replace(/_/g, ' '));
  }
  return {
    ok: metas.length > 0 && metaResults.every((item) => item.ok) && missingSections.length === 0,
    metas,
    metaResults,
    invalidMetas: metaResults.filter((item) => !item.ok),
    missingSections,
  };
}

function canonicalRubricaKey(item = {}) {
  return [
    normalize(item.rubrica_nome || item.rubrica || item.nome || item.titulo),
    normalize(item.centro_custo || item.centro || item.unidade),
    normalize(item.natureza_despesa || item.natureza || item.codigo_natureza),
  ].join('|');
}

function calculateMemory(report = {}) {
  const rubricas = Array.isArray(report._rubricas_periodo) ? report._rubricas_periodo : [];
  const unique = new Map();
  for (const item of rubricas) {
    const key = canonicalRubricaKey(item) || `id:${item.id || unique.size}`;
    const current = unique.get(key);
    const score = (item.ativo !== false ? 10 : 0) + (money(item.valor_previsto || item.valor_total_original) > 0 ? 5 : 0) + (text(item.id) ? 1 : 0);
    if (!current || score > current.score) unique.set(key, { item, score });
  }
  const canonical = [...unique.values()].map((entry) => entry.item);
  const previsto = canonical.reduce((sum, item) => sum + money(item.valor_previsto ?? item.valor_total_original ?? item.valor_original ?? item.valor_total), 0);
  const utilizado = canonical.reduce((sum, item) => sum + money(item.total_gasto_periodo ?? item.valor_utilizado ?? item.realizado ?? item.total_gasto), 0);
  const saldo = previsto - utilizado;
  const totalReportado = money(report._total_financeiro);
  return {
    rubricasOriginais: rubricas.length,
    rubricasCanonicas: canonical.length,
    duplicadasIgnoradas: Math.max(0, rubricas.length - canonical.length),
    previsto,
    utilizado,
    saldo,
    totalReportado,
    divergencia: Math.abs(utilizado - totalReportado),
    ok: Math.abs(utilizado - totalReportado) <= 0.01 || totalReportado === 0,
  };
}

function panelRoot() {
  const title = [...document.querySelectorAll('h1')].find((element) => normalize(element.textContent).includes('relatorio de execucao do objeto'));
  return title?.closest('.max-w-6xl') || document.querySelector('main') || document.body;
}

function ensurePanel() {
  if (!isRoute() || !currentReport) return;
  const root = panelRoot();
  if (!root) return;
  let panel = root.querySelector('[data-relatorio-validacao-progressiva]');
  if (!panel) {
    panel = document.createElement('section');
    panel.dataset.relatorioValidacaoProgressiva = 'true';
    const reportCard = [...root.querySelectorAll('.rounded-xl.border, [class*="rounded-xl"]')]
      .find((element) => normalize(element.textContent).includes('relatorio em edicao'));
    if (reportCard?.parentElement) reportCard.parentElement.insertBefore(panel, reportCard);
    else root.prepend(panel);
  }

  const validation = validateReport(currentReport);
  const memory = calculateMemory(currentReport);
  const invalidRows = validation.invalidMetas.slice(0, 8).map(({ meta, missing }) => `<li><strong>${escapeHtml(metaName(meta))}</strong>: ${escapeHtml(missing.join(', '))}</li>`).join('');
  panel.className = `rounded-xl border p-4 space-y-3 ${validation.ok && memory.ok ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`;
  panel.innerHTML = `
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h3 class="font-semibold ${validation.ok ? 'text-green-900' : 'text-amber-900'}">Validação progressiva do relatório</h3>
        <p class="text-xs ${validation.ok ? 'text-green-700' : 'text-amber-700'}">${validation.ok ? 'Todos os campos obrigatórios das metas estão preenchidos.' : `${validation.invalidMetas.length} meta(s) e ${validation.missingSections.length} seção(ões) exigem revisão.`}</p>
      </div>
      <span class="text-xs font-semibold rounded-full px-2.5 py-1 ${validation.ok && memory.ok ? 'bg-green-200 text-green-900' : 'bg-amber-200 text-amber-900'}">${validation.ok && memory.ok ? 'Pronto para finalizar' : 'Revisão necessária'}</span>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
      <div class="rounded-lg border bg-white/80 p-2"><span class="block text-slate-500">Previsto</span><strong>${formatBRL(memory.previsto)}</strong></div>
      <div class="rounded-lg border bg-white/80 p-2"><span class="block text-slate-500">Utilizado</span><strong>${formatBRL(memory.utilizado)}</strong></div>
      <div class="rounded-lg border bg-white/80 p-2"><span class="block text-slate-500">Saldo</span><strong>${formatBRL(memory.saldo)}</strong></div>
      <div class="rounded-lg border bg-white/80 p-2"><span class="block text-slate-500">Memória</span><strong>${memory.ok ? 'Conferida' : `Divergência ${formatBRL(memory.divergencia)}`}</strong></div>
    </div>
    ${memory.duplicadasIgnoradas > 0 ? `<p class="text-xs text-slate-600">${memory.duplicadasIgnoradas} rubrica(s) duplicada(s) ignorada(s) na memória de cálculo.</p>` : ''}
    ${invalidRows ? `<details class="text-xs"><summary class="cursor-pointer font-medium">Campos pendentes por meta</summary><ul class="mt-2 ml-5 list-disc space-y-1">${invalidRows}</ul></details>` : ''}
    ${validation.missingSections.length ? `<p class="text-xs text-amber-800"><strong>Seções pendentes:</strong> ${escapeHtml(validation.missingSections.join(', '))}</p>` : ''}
  `;

  const reviewButtons = [...root.querySelectorAll('button')].filter((button) => normalize(button.textContent).includes('revisar e exportar'));
  for (const button of reviewButtons) {
    button.disabled = !validation.ok || !memory.ok;
    button.title = button.disabled ? 'Corrija os campos pendentes e a memória de cálculo antes da finalização.' : 'Relatório validado para revisão final.';
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function editorSectionKey() {
  const heading = [...document.querySelectorAll('h3')].find((element) => normalize(element.textContent).startsWith('editar '));
  if (!heading) return null;
  const title = heading.textContent.replace(/^Editar\s+/i, '').trim();
  const found = SECTION_MAP.find(([label]) => normalize(title).includes(normalize(label)));
  return found?.[1] || null;
}

function ensureAutosaveStatus(modal) {
  let status = modal.querySelector('[data-autosave-status]');
  if (!status) {
    status = document.createElement('span');
    status.dataset.autosaveStatus = 'true';
    status.className = 'ml-2 text-xs text-slate-500';
    const description = modal.querySelector('p.text-xs') || modal.querySelector('h3');
    description?.appendChild(status);
  }
  return status;
}

async function progressiveSave(textarea, modal) {
  if (!currentReportId || saving) return;
  const key = editorSectionKey();
  if (!key || key === 'cronograma_metas') return;
  const status = ensureAutosaveStatus(modal);
  saving = true;
  status.textContent = ' • Salvando...';
  try {
    const currentSection = currentReport?.[key];
    const payload = {
      ...(typeof currentSection === 'object' && !Array.isArray(currentSection) && currentSection ? currentSection : {}),
      texto_editado: textarea.value,
      modo: 'hibrido',
      editado_em: new Date().toISOString(),
      salvamento_progressivo_em: new Date().toISOString(),
    };
    await base44.entities.RelatorioExecucaoObjeto.update(currentReportId, { [key]: payload, rascunho_salvo_em: new Date().toISOString() });
    currentReport = { ...currentReport, [key]: payload, rascunho_salvo_em: new Date().toISOString() };
    status.textContent = ` • Salvo automaticamente às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    scheduleRender();
  } catch (error) {
    status.textContent = ' • Falha no salvamento automático';
    console.warn('[Relatório] Falha no salvamento progressivo.', error);
  } finally {
    saving = false;
  }
}

function bindAutosave() {
  if (!isRoute()) return;
  const textarea = [...document.querySelectorAll('textarea')].find((element) => element.offsetParent !== null && element.closest('.fixed.inset-0'));
  const modal = textarea?.closest('.fixed.inset-0');
  if (!textarea || !modal || textarea.dataset.progressiveSaveBound) return;
  textarea.dataset.progressiveSaveBound = 'true';
  ensureAutosaveStatus(modal).textContent = ' • Salvamento progressivo ativo';
  textarea.addEventListener('input', () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => progressiveSave(textarea, modal), 1200);
  });
  textarea.addEventListener('blur', () => {
    window.clearTimeout(saveTimer);
    progressiveSave(textarea, modal);
  });
}

function pdfLines(doc, report) {
  let y = 18;
  const addTitle = (title) => {
    if (y > 270) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title, 15, y);
    y += 7;
  };
  const addText = (value) => {
    const lines = doc.splitTextToSize(text(value) || '—', 180);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const line of lines) {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(line, 15, y);
      y += 5;
    }
    y += 2;
  };

  addTitle('RELATÓRIO DE EXECUÇÃO DO OBJETO');
  addText(`${report.identificacao_projeto?.projeto || 'Museus Centro'} — ${report.data_inicio || ''} a ${report.data_fim || ''}`);
  for (const [label, key] of SECTION_MAP) {
    if (key === 'cronograma_metas') continue;
    addTitle(label);
    addText(sectionText(report[key]));
  }
  addTitle('7. Cronograma de Metas');
  for (const meta of report.cronograma_metas || []) {
    addTitle(metaName(meta));
    addText(`Resultado esperado: ${meta.resultado_esperado || '—'}\nAções: ${metaActions(meta) || '—'}\nPeríodo: ${meta.periodo || meta.periodo_execucao || '—'}\nResultado alcançado: ${meta.resultado_alcancado || '—'}\nStatus: ${meta.status_meta || '—'}\nJustificativa: ${meta.justificativa || '—'}`);
  }
}

async function createBackupPdf(report) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdfLines(doc, report);
  const blob = doc.output('blob');
  const year = String(report.data_fim || report.data_inicio || new Date().toISOString()).slice(0, 4);
  const month = String(report.data_fim || report.data_inicio || new Date().toISOString()).slice(5, 7);
  const filename = `Relatorio_Execucao_Objeto_${year}-${month}_${report.id || Date.now()}.pdf`;
  const file = new File([blob], filename, { type: 'application/pdf' });
  const uploader = base44?.integrations?.Core?.UploadFile;
  if (!uploader) throw new Error('UploadFile não disponível.');
  const upload = await uploader({ file });
  const fileUrl = upload?.file_url || upload?.url || upload?.data?.file_url || upload?.data?.url;
  if (!fileUrl) throw new Error('O upload não retornou URL.');
  const folder = `Relatórios de Execução/${year}/${month}`;

  const intakeEntity = base44?.entities?.DocumentIntake;
  let intakeId = null;
  if (intakeEntity?.create) {
    const intake = await intakeEntity.create({
      titulo: filename,
      file_name_original: filename,
      file_url: fileUrl,
      arquivo_url: fileUrl,
      mime_type: 'application/pdf',
      tipo_detectado: 'relatorio_execucao_final',
      categoria: 'relatorio_execucao_final',
      status: 'APROVADO',
      projeto: 'Museus Centro',
      relatorio_id: report.id || currentReportId,
      competencia: `${year}-${month}`,
      destino_drive_pasta: folder,
      backup_drive_status: 'pendente',
      origem: 'Relatório de Execução do Objeto',
      aprovado_em: new Date().toISOString(),
    });
    intakeId = intake?.id || null;
  }

  await base44.entities.RelatorioExecucaoObjeto.update(currentReportId, {
    status: 'FINALIZADO',
    finalizado_em: new Date().toISOString(),
    pdf_final_url: fileUrl,
    pdf_final_nome: filename,
    backup_drive_pasta: folder,
    backup_drive_status: 'pendente',
    backup_drive_document_intake_id: intakeId,
  });

  try {
    await base44.functions.invoke('sincronizacaoFinalDrive', {
      dry_run: false,
      relatorio_id: currentReportId,
      document_intake_id: intakeId,
      tipo: 'relatorio_execucao_final',
      destino_drive_pasta: folder,
    });
    await base44.entities.RelatorioExecucaoObjeto.update(currentReportId, {
      backup_drive_status: 'sincronizacao_solicitada',
      backup_drive_solicitado_em: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[Relatório] PDF salvo e enfileirado; sincronização imediata com Drive não respondeu.', error);
  }

  return { fileUrl, filename, folder };
}

async function finalizeAndBackup(event) {
  if (!isRoute() || !currentReportId || !currentReport) return;
  const button = event.target?.closest?.('button');
  if (!button || !normalize(button.textContent).includes('pdf completo')) return;
  const validation = validateReport(currentReport);
  const memory = calculateMemory(currentReport);
  if (!validation.ok || !memory.ok) {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.alert('Finalize somente após corrigir os campos pendentes das metas e conferir a memória de cálculo.');
    ensurePanel();
    return;
  }

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Salvando PDF no Drive...';
  try {
    const result = await createBackupPdf(currentReport);
    button.textContent = 'PDF salvo e enfileirado';
    button.title = `${result.folder}/${result.filename}`;
  } catch (error) {
    console.error('[Relatório] Falha ao preparar backup do PDF.', error);
    window.alert(`O PDF local pode ser gerado, mas o backup automático falhou: ${error?.message || error}`);
    button.textContent = originalText;
  } finally {
    window.setTimeout(() => { button.disabled = false; }, 1500);
  }
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    ensurePanel();
    bindAutosave();
  }, 100);
}

function wrapEntity() {
  const entity = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entity || entity.__autosaveDriveBackupWrapped) return;

  if (entity.get) {
    const originalGet = entity.get.bind(entity);
    entity.get = async (id, ...args) => {
      const result = await originalGet(id, ...args);
      currentReportId = id;
      currentReport = result;
      scheduleRender();
      return result;
    };
  }

  if (entity.update) {
    const originalUpdate = entity.update.bind(entity);
    entity.update = async (id, payload = {}, ...args) => {
      const result = await originalUpdate(id, payload, ...args);
      currentReportId = id;
      currentReport = { ...(currentReport || {}), ...payload, ...(result && typeof result === 'object' ? result : {}) };
      const validation = validateReport(currentReport);
      const memory = calculateMemory(currentReport);
      if (!payload.validacao_progressiva && !payload.memoria_calculo_relatorio) {
        Promise.resolve().then(() => originalUpdate(id, {
          validacao_progressiva: {
            valido: validation.ok,
            metas_invalidas: validation.invalidMetas.map(({ meta, missing }) => ({ meta: metaName(meta), campos: missing })),
            secoes_pendentes: validation.missingSections,
            validado_em: new Date().toISOString(),
          },
          memoria_calculo_relatorio: {
            previsto: memory.previsto,
            utilizado: memory.utilizado,
            saldo: memory.saldo,
            rubricas_origem: memory.rubricasOriginais,
            rubricas_canonicas: memory.rubricasCanonicas,
            duplicadas_ignoradas: memory.duplicadasIgnoradas,
            total_reportado: memory.totalReportado,
            divergencia: memory.divergencia,
            conferida: memory.ok,
            calculada_em: new Date().toISOString(),
          },
        }).catch(() => {}));
      }
      scheduleRender();
      return result;
    };
  }

  entity.__autosaveDriveBackupWrapped = true;
}

export function installRelatorioAutosaveDriveBackup() {
  if (typeof window === 'undefined' || window.__relatorioAutosaveDriveBackupInstalled) return;
  window.__relatorioAutosaveDriveBackupInstalled = true;
  wrapEntity();
  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('input', scheduleRender, true);
  document.addEventListener('click', finalizeAndBackup, true);
  window.addEventListener('popstate', scheduleRender);
  scheduleRender();
}
