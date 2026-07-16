import { base44 } from '@/api/base44Client';

const PHOTO_FIELDS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url', 'drive_url', 'gallery_url'];

const text = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : [];

function safeFilename(value) {
  return text(value || 'sem-identificacao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function photoUrl(photo = {}) {
  for (const field of PHOTO_FIELDS) {
    if (text(photo?.[field])) return text(photo[field]);
  }
  return '';
}

function activityId(activity = {}) {
  return text(activity.id || activity.activity_id || activity.atividade_id || activity.evento_id || activity.programacao_id);
}

function activityTitle(activity = {}) {
  return text(activity.nome || activity.titulo || activity.nome_acao || activity.atividade || activity.descricao || 'Atividade');
}

function reportActivities(report = {}) {
  return [
    report.atividades,
    report.activities,
    report.atividades_realizadas,
    report._atividades_periodo,
    report._agenda_periodo,
    report.tabelas_estruturadas?.atividades,
  ].flatMap(asArray);
}

function embeddedPhotos(report = {}) {
  return [
    report.fotos,
    report.photos,
    report.anexos_fotograficos,
    report.anexos_evidencias,
    report.galeria_fotos,
    report._fotos_atividades,
  ].flatMap(asArray);
}

function uniquePhotos(items = []) {
  const map = new Map();
  for (const item of items) {
    const url = photoUrl(item).split('?')[0];
    if (url && !map.has(url)) map.set(url, item);
  }
  return [...map.values()];
}

function belongsToActivity(photo, activity) {
  const linked = text(photo.activity_id || photo.atividade_id || photo.evento_id || photo.programacao_id);
  const id = activityId(activity);
  if (linked && id && linked === id) return true;

  const caption = text(`${photo.atividade_nome || ''} ${photo.legenda || ''} ${photo.titulo || ''}`).toLowerCase();
  const title = activityTitle(activity).toLowerCase();
  return title.length >= 6 && caption.includes(title);
}

async function urlToDataUrl(url) {
  if (url.startsWith('data:image/')) return url;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Imagem indisponível (${response.status})`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Arquivo anexado não é imagem');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function imageFormat(dataUrl) {
  if (/^data:image\/png/i.test(dataUrl)) return 'PNG';
  if (/^data:image\/webp/i.test(dataUrl)) return 'WEBP';
  return 'JPEG';
}

async function addPhoto(pdf, photo, title, index) {
  try {
    const dataUrl = await urlToDataUrl(photoUrl(photo));
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - 42;
    const props = pdf.getImageProperties(dataUrl);
    const ratio = Math.min(maxWidth / props.width, maxHeight / props.height);
    const width = props.width * ratio;
    const height = props.height * ratio;

    pdf.addPage();
    pdf.setFontSize(11);
    pdf.text(`${title} — Foto ${index + 1}`, margin, 14);
    pdf.addImage(dataUrl, imageFormat(dataUrl), margin + (maxWidth - width) / 2, 22, width, height, undefined, 'FAST');

    const caption = text(photo.legenda || photo.titulo || photo.descricao);
    if (caption) {
      pdf.setFontSize(8);
      pdf.text(pdf.splitTextToSize(caption, maxWidth), margin, Math.min(pageHeight - 10, 26 + height));
    }
    return true;
  } catch (error) {
    console.warn('[Exportação de relatórios] Foto ignorada:', photoUrl(photo), error);
    return false;
  }
}

async function exportReport(pdf, report, reportPhotos) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 12;
  let y = margin;

  const ensureSpace = (height = 16) => {
    if (y + height > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const paragraph = (value, fontSize = 9, indent = 0) => {
    const content = text(value) || '—';
    pdf.setFontSize(fontSize);
    const lines = pdf.splitTextToSize(content, pageWidth - 2 * margin - indent);
    ensureSpace(lines.length * 4 + 4);
    pdf.text(lines, margin + indent, y);
    y += lines.length * 4 + 4;
  };

  const author = report.author_name || report.created_by || 'Sem autor';
  pdf.setFontSize(18);
  pdf.text('Relatório Mensal de Atividades', margin, y);
  y += 10;
  pdf.setFontSize(10);
  pdf.text(`${report.mes_referencia || 'Sem mês'} ${report.ano || ''} — ${author}`, margin, y);
  y += 6;
  pdf.text(`Museu: ${report.museu || 'Não informado'}`, margin, y);
  y += 10;

  pdf.setFontSize(12);
  pdf.text('Resumo Executivo', margin, y);
  y += 6;
  paragraph(report.resumo_executivo || report.resumo || '(sem resumo executivo)', 10);

  const activities = reportActivities(report);
  const photos = uniquePhotos([
    ...embeddedPhotos(report),
    ...reportPhotos.filter((photo) => text(photo.report_id || photo.relatorio_id) === text(report.id)),
  ]);

  if (activities.length) {
    ensureSpace(12);
    pdf.setFontSize(12);
    pdf.text('Atividades', margin, y);
    y += 7;
  }

  let photosIncluded = 0;
  for (let index = 0; index < activities.length; index += 1) {
    const activity = activities[index];
    ensureSpace(22);
    pdf.setFontSize(10);
    pdf.text(`${index + 1}. ${activityTitle(activity)}`, margin, y);
    y += 5;

    const date = text(activity.data || activity.data_atividade || activity.data_inicio);
    const publicTotal = Number(activity.publico_total || activity.total_publico || activity.publico_realizado || activity.participantes || activity.visitantes || 0);
    const metadata = [date ? `Data: ${date}` : '', publicTotal > 0 ? `Público: ${publicTotal.toLocaleString('pt-BR')}` : ''].filter(Boolean).join(' | ');
    if (metadata) paragraph(metadata, 8, 3);
    paragraph(activity.descricao_executado || activity.descricao || activity.objetivo || activity.resultado_alcancado || '', 9, 3);

    const linked = photos.filter((photo) => belongsToActivity(photo, activity));
    for (let photoIndex = 0; photoIndex < linked.length; photoIndex += 1) {
      if (await addPhoto(pdf, linked[photoIndex], activityTitle(activity), photoIndex)) photosIncluded += 1;
    }
  }

  const linkedUrls = new Set(
    activities.flatMap((activity) => photos.filter((photo) => belongsToActivity(photo, activity))).map((photo) => photoUrl(photo).split('?')[0]),
  );
  const remaining = photos.filter((photo) => !linkedUrls.has(photoUrl(photo).split('?')[0]));
  for (let index = 0; index < remaining.length; index += 1) {
    if (await addPhoto(pdf, remaining[index], 'Galeria complementar do relatório', index)) photosIncluded += 1;
  }

  return { author, photosIncluded };
}

async function exportAll(button) {
  if (button.dataset.exporting === 'true') return;
  button.dataset.exporting = 'true';
  const originalText = button.textContent;
  button.disabled = true;

  try {
    button.textContent = 'Carregando relatórios...';
    const [reportsRaw, photosRaw] = await Promise.all([
      base44.entities.Report.list('-created_date', 10000),
      base44.entities.ReportPhoto.list('-created_date', 10000).catch(() => []),
    ]);
    const reports = asArray(reportsRaw);
    const reportPhotos = asArray(photosRaw);
    if (!reports.length) throw new Error('Nenhum relatório disponível para exportação');

    const { jsPDF } = await import('jspdf');
    let photosIncluded = 0;

    for (let index = 0; index < reports.length; index += 1) {
      const report = reports[index];
      button.textContent = `Exportando ${index + 1} de ${reports.length}...`;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const result = await exportReport(pdf, report, reportPhotos);
      photosIncluded += result.photosIncluded;
      pdf.save(`relatorio_atividade_${safeFilename(result.author)}_${safeFilename(report.mes_referencia)}_${safeFilename(report.ano)}.pdf`);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    button.textContent = `${reports.length} relatórios exportados (${photosIncluded} fotos)`;
    setTimeout(() => { button.textContent = originalText; }, 5000);
  } catch (error) {
    console.error('[Exportação de relatórios]', error);
    button.textContent = error?.message || 'Falha ao exportar relatórios';
    setTimeout(() => { button.textContent = originalText; }, 5000);
  } finally {
    button.disabled = false;
    button.dataset.exporting = 'false';
  }
}

function installButton() {
  if (!/Relatorios/i.test(window.location.pathname) || /RelatorioExecucaoObjeto/i.test(window.location.pathname)) return;
  if (document.querySelector('[data-export-all-activity-reports]')) return;

  const title = Array.from(document.querySelectorAll('h1')).find((element) => /relatórios mensais/i.test(element.textContent || ''));
  const header = title?.parentElement?.parentElement;
  const actions = header?.querySelector('.flex.flex-wrap.gap-2');
  if (!actions) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.exportAllActivityReports = 'true';
  button.className = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-black bg-white px-4 py-2 hover:bg-gray-50 disabled:opacity-50';
  button.textContent = 'Exportar todos com fotos';
  button.addEventListener('click', () => exportAll(button));
  actions.prepend(button);
}

export function installExportAllActivityReports() {
  if (typeof window === 'undefined' || window.__exportAllActivityReportsInstalled) return;
  window.__exportAllActivityReportsInstalled = true;

  const run = () => window.requestAnimationFrame(installButton);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  run();
}
