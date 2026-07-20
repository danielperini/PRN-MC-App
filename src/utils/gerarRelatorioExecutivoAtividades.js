/**
 * Lógica compartilhada para geração de Relatório Executivo de Fotos baseado em atividades.
 * Usado pelo RelatorioExecutivoPDFDialog (individual + lote) para evitar duplicação.
 */
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import { drawTimbreViaduto } from '@/components/gallery/timbreViadutoPDF';
import { isLegendaGenerica } from '@/components/gallery/deduplicarFotosGaleria';

export const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som',
  MUMO: 'MUMO — Museu da Moda',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
  NOTURNO: '🌙 Noturno nos Museus',
};
export const SECTION_ABREV = {
  MHAB: 'MHAB', MIS: 'MIS', MUMO: 'MUMO', MAP: 'MAP',
  CasaKubitschek: 'Casa Kubitschek', CasaDoBalile: 'Casa do Baíle',
  NOTURNO: 'Noturno nos Museus',
};

/**
 * Todas as atividades são válidas — sem critério de meta física.
 */
export function isAtividadeFisica(act) {
  return true;
}

function normalizarTexto(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function matchMuseu(reportMuseu, sectionKey) {
  const m = normalizarTexto(reportMuseu);
  const k = normalizarTexto(sectionKey);
  if (!m || !k) return false;
  if (m === k) return true;
  if (m.includes(k)) return true;
  const label = normalizarTexto(SECTION_LABELS[sectionKey] || '');
  if (label && m.includes(normalizarTexto(SECTION_ABREV[sectionKey]))) return true;
  const palavras = k.split(/[\s-]+/).filter((p) => p.length > 2);
  return palavras.some((p) => m.includes(p));
}

function loadImageElement(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; resolve(null); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

function imageToDataUrl(img, maxW, maxH) {
  try {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.70), w, h };
  } catch { return null; }
}

async function fetchPhotoData(url, maxW, maxH) {
  const img = await loadImageElement(url);
  if (!img || img.naturalWidth === 0) return null;
  return imageToDataUrl(img, maxW, maxH);
}

export function formatDateBR(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
}

async function tick() {
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => setTimeout(r, 0));
}

/**
 * Busca atividades com fotos para um museu+mês+ano.
 * Retorna array de { atividade, fotos: [{ fileUrl, legenda, activityId, reportId }] }.
 */
export async function buscarAtividadesComFotos(museuKey, mes, ano, opts = {}) {
  const { maxFotos = 5, onProgresso = () => {} } = opts;

  onProgresso(5, 'Buscando relatórios do período...');
  const reports = await base44.entities.Report.filter({ mes_referencia: mes, ano });
  const reportsMuseu = (reports || []).filter((r) => matchMuseu(r.museu, museuKey));
  const reportIds = reportsMuseu.map((r) => r.id);
  if (reportIds.length === 0) return [];

  onProgresso(20, `Buscando atividades de ${reportIds.length} relatório(s)...`);
  let todasAtividades = [];
  const batchSize = 5;
  for (let i = 0; i < reportIds.length; i += batchSize) {
    const lote = reportIds.slice(i, i + batchSize);
    const resultados = await Promise.all(
      lote.map((rid) => base44.entities.Activity.filter({ report_id: rid }).catch(() => []))
    );
    resultados.forEach((acts) => { todasAtividades = todasAtividades.concat(acts || []); });
    onProgresso(20 + Math.round((i / reportIds.length) * 30), `Atividades · ${Math.min(i + batchSize, reportIds.length)}/${reportIds.length}...`);
  }

  const fisicas = todasAtividades.filter(isAtividadeFisica);
  fisicas.sort((a, b) => {
    const da = new Date(a.data_realizacao || a.data_inicio || 0).getTime();
    const db = new Date(b.data_realizacao || b.data_inicio || 0).getTime();
    return da - db;
  });

  onProgresso(55, 'Buscando fotos do museu/período...');
  let poolFotos = [];
  try {
    poolFotos = await base44.entities.ReportPhoto.filter({ museu: museuKey }) || [];
    poolFotos = poolFotos.filter((f) => f.mes_referencia === mes);
  } catch { poolFotos = []; }

  onProgresso(70, 'Montando conjuntos de fotos...');
  const atividadesComFotos = fisicas.map((act) => {
    const fotosAtividade = [];
    const vistos = new Set();
    const actFotos = Array.isArray(act.fotos) ? act.fotos : [];
    for (const f of actFotos) {
      const url = f.file_url || f.fileUrl;
      if (url && !vistos.has(url)) {
        fotosAtividade.push({ fileUrl: url, legenda: f.legenda || act.titulo, activityId: act.id, reportId: act.report_id });
        vistos.add(url);
      }
      if (fotosAtividade.length >= maxFotos) break;
    }
    if (fotosAtividade.length < maxFotos && act.id) {
      for (const rp of poolFotos) {
        if (rp.activity_id === act.id) {
          const url = rp.file_url;
          if (url && !vistos.has(url)) {
            fotosAtividade.push({ fileUrl: url, legenda: rp.legenda || rp.caption || act.titulo, activityId: act.id, reportId: act.report_id || rp.report_id });
            vistos.add(url);
          }
        }
        if (fotosAtividade.length >= maxFotos) break;
      }
    }
    return { atividade: act, fotos: fotosAtividade };
  });

  return atividadesComFotos;
}

/**
 * Gera o PDF do Relatório Executivo a partir de atividades pré-buscadas.
 * Retorna { blob, filename, totalFotos, totalAtividades } se returnBlob=true.
 * Caso contrário, salva o PDF (doc.save) e retorna o resultado.
 * Retorna null se nenhuma atividade tiver fotos carregáveis.
 */
export async function gerarPDFAtividades(atividades, museuKey, mes, ano, opts = {}) {
  const { onProgresso = () => {}, returnBlob = false } = opts;

  const abrev = SECTION_ABREV[museuKey] || museuKey;
  const label = SECTION_LABELS[museuKey] || museuKey;

  const atividadesComFotos = atividades.filter((a) => a.fotos.length > 0);
  if (atividadesComFotos.length === 0) return null;

  const pageW = 210, pageH = 297, margin = 15;
  const cols = 2;
  const gapH = 6, gapV = 6;
  const footerH = 12;
  const titleBarH = 10;

  const fotosParaPDF = [];
  for (const item of atividadesComFotos) {
    for (const f of item.fotos) {
      fotosParaPDF.push({
        ...f,
        tituloAtividade: item.atividade.titulo,
        dataAtividade: formatDateBR(item.atividade.data_realizacao || item.atividade.data_inicio),
        museuAtividade: item.atividade.museu || museuKey,
      });
    }
  }

  // Legendas IA
  const precisamLegenda = fotosParaPDF.filter((f) => isLegendaGenerica(f.legenda));
  if (precisamLegenda.length > 0) {
    onProgresso(3, `Gerando legendas via IA · ${precisamLegenda.length} foto(s)...`);
    for (let i = 0; i < precisamLegenda.length; i += 5) {
      const lote = precisamLegenda.slice(i, i + 5);
      const loteNum = Math.floor(i / 5) + 1;
      const totalLotes = Math.ceil(precisamLegenda.length / 5);
      onProgresso(3 + Math.round((loteNum / totalLotes) * 12), `Legendas IA · lote ${loteNum}/${totalLotes}...`);
      const resultados = await Promise.allSettled(
        lote.map((f) => base44.functions.invoke('suggestPhotoCaption', {
          photoUrl: f.fileUrl, activityId: f.activityId, reportId: f.reportId,
        }))
      );
      resultados.forEach((r, idx) => {
        const f = lote[idx];
        if (r.status === 'fulfilled' && r.value?.data?.caption) f.legenda = r.value.data.caption;
      });
    }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  // Capa
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, pageW, pageH, 'F');
  const timbreCapaH = drawTimbreViaduto(doc, pageW, margin, true);
  const capaY0 = timbreCapaH + 10;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', pageW / 2, capaY0, { align: 'center' });
  doc.setFontSize(22);
  doc.text(abrev, pageW / 2, capaY0 + 50, { align: 'center' });
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(label, pageW / 2, capaY0 + 65, { align: 'center', maxWidth: 170 });
  doc.setFontSize(11);
  doc.setTextColor(180, 180, 180);
  doc.text('Relatório de Atividades', pageW / 2, capaY0 + 85, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`${mes} de ${ano}`, pageW / 2, capaY0 + 98, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(150, 205, 255);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, capaY0 + 115, { align: 'center' });

  // Índice
  doc.addPage();
  let indexPageCount = 1;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  const timbreH = drawTimbreViaduto(doc, pageW, margin);
  const contentTop = timbreH + 4;
  const contentBottom = pageH - footerH - margin;
  const contentW = pageW - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text('Índice de Atividades', pageW / 2, contentTop, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`${atividadesComFotos.length} atividade(s) · ${fotosParaPDF.length} foto(s)`, pageW / 2, contentTop + 6, { align: 'center' });

  let idxY = contentTop + 16;
  for (let i = 0; i < atividadesComFotos.length; i++) {
    const atvItem = atividadesComFotos[i].atividade;
    const tituloAtv = atvItem.titulo || `Atividade ${i + 1}`;
    const dataAtv = formatDateBR(atvItem.data_realizacao || atvItem.data_inicio);
    const numFotos = atividadesComFotos[i].fotos.length;
    if (idxY > contentBottom - 8) {
      doc.addPage();
      indexPageCount++;
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');
      drawTimbreViaduto(doc, pageW, margin);
      idxY = contentTop;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(`${i + 1}.`, margin, idxY);
    const tituloTrunc = doc.splitTextToSize(tituloAtv, contentW - 55)[0] || '';
    doc.text(tituloTrunc, margin + 8, idxY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    const meta = `${dataAtv ? dataAtv + ' · ' : ''}${numFotos} foto(s)`;
    doc.text(meta, pageW - margin, idxY, { align: 'right' });
    idxY += 7;
  }

  // Primeira página de fotos
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  drawTimbreViaduto(doc, pageW, margin);

  const usableH = contentBottom - contentTop;
  const cellW = (contentW - (cols - 1) * gapH) / cols;
  const gridH = usableH - titleBarH - gapV;
  const cellH = (gridH - gapV) / 2;
  const slotH = cellH - 16;

  // Pré-carrega imagens
  onProgresso(18, `Carregando ${fotosParaPDF.length} imagens...`);
  const imagens = [];
  for (let i = 0; i < fotosParaPDF.length; i++) {
    if (i > 0 && i % 3 === 0) {
      onProgresso(18 + Math.round((i / fotosParaPDF.length) * 40), `Carregando imagens · ${i}/${fotosParaPDF.length}...`);
      await tick();
    }
    imagens.push(await fetchPhotoData(fotosParaPDF[i].fileUrl, cellW * 3, slotH * 3));
  }
  const carregadas = imagens.filter(Boolean).length;
  if (carregadas === 0) return null;

  // Atualiza capa com contagem
  doc.setTextColor(150, 205, 255);
  doc.text(`${carregadas} fotografias em ${atividadesComFotos.length} atividades`, pageW / 2, capaY0 + 125, { align: 'center' });

  const imagemPorUrl = new Map(fotosParaPDF.map((f, i) => [f.fileUrl, imagens[i]]));
  const fotosComImg = fotosParaPDF.filter((_, i) => imagens[i]);

  onProgresso(60, `Montando PDF · ${carregadas} foto(s)...`);

  let paginaAtual = 2 + indexPageCount;
  let cursorY = contentTop;
  let slotsNaLinha = 0;
  let paginaIniciada = true;

  function desenharTimbrePagina() {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');
    drawTimbreViaduto(doc, pageW, margin);
  }
  function desenharRodape() {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    doc.text(`Página ${paginaAtual}`, pageW - margin, pageH - 5, { align: 'right' });
    doc.text(`${abrev} · ${mes}/${ano}`, margin, pageH - 5);
  }
  function novaPagina() {
    if (paginaIniciada) desenharRodape();
    doc.addPage();
    paginaAtual++;
    desenharTimbrePagina();
    cursorY = contentTop;
    slotsNaLinha = 0;
    paginaIniciada = true;
  }

  const atvComFotos = [];
  for (const item of atividadesComFotos) {
    const validas = item.fotos.filter((f) => imagemPorUrl.get(f.fileUrl));
    if (validas.length > 0) {
      atvComFotos.push({
        titulo: item.atividade.titulo,
        data: formatDateBR(item.atividade.data_realizacao || item.atividade.data_inicio),
        museu: item.atividade.museu || museuKey,
        fotos: validas,
      });
    }
  }

  let fotoIdx = 0;
  for (let aIdx = 0; aIdx < atvComFotos.length; aIdx++) {
    const atv = atvComFotos[aIdx];
    const espacoNecessario = titleBarH + gapV + cellH + gapV;
    if (cursorY + espacoNecessario > contentBottom) novaPagina();
    if (slotsNaLinha === 1) { cursorY += cellH + gapV; slotsNaLinha = 0; }

    doc.setFillColor(240, 240, 240);
    doc.rect(margin, cursorY, contentW, titleBarH, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, cursorY, contentW, titleBarH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(doc.splitTextToSize(atv.titulo, contentW - 20).slice(0, 1), margin + 3, cursorY + 7);
    if (atv.data) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(atv.data, pageW - margin - 3, cursorY + 7, { align: 'right' });
    }
    cursorY += titleBarH + gapV;

    for (let fIdx = 0; fIdx < atv.fotos.length; fIdx++) {
      const foto = atv.fotos[fIdx];
      const imgResult = imagemPorUrl.get(foto.fileUrl);
      if (!imgResult) continue;
      if (cursorY + cellH > contentBottom) novaPagina();
      const col = slotsNaLinha;
      const slotX = margin + col * (cellW + gapH);
      const slotY = cursorY;
      if (fotoIdx > 0 && fotoIdx % 2 === 0) { await tick(); }

      doc.setFillColor(245, 245, 245);
      doc.rect(slotX, slotY, cellW, slotH, 'F');
      const scale = Math.min(cellW / imgResult.w, slotH / imgResult.h);
      const renderW = imgResult.w * scale;
      const renderH = imgResult.h * scale;
      const offsetX = slotX + (cellW - renderW) / 2;
      const offsetY = slotY + (slotH - renderH) / 2;
      doc.addImage(imgResult.dataUrl, 'JPEG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
      doc.setDrawColor(205, 205, 205);
      doc.rect(slotX, slotY, cellW, slotH, 'S');

      const legCx = slotX + cellW / 2;
      let legY = slotY + slotH + 3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 20);
      const tituloLeg = doc.splitTextToSize(foto.tituloAtividade || atv.titulo || 'Registro fotográfico', cellW - 2)[0] || '';
      doc.text(tituloLeg, legCx, legY, { align: 'center', maxWidth: cellW - 2 });
      legY += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(102, 102, 102);
      doc.text(foto.museuAtividade || atv.museu || abrev, legCx, legY, { align: 'center' });
      legY += 3.5;
      doc.setFontSize(7);
      doc.setTextColor(153, 153, 153);
      doc.text(foto.dataAtividade || atv.data || '', legCx, legY, { align: 'center' });

      slotsNaLinha++;
      fotoIdx++;
      if (fotoIdx < fotosComImg.length) {
        onProgresso(60 + Math.round((fotoIdx / fotosComImg.length) * 35), `Montando PDF · foto ${fotoIdx}/${fotosComImg.length}...`);
      }
      if (slotsNaLinha >= cols) { cursorY += cellH + gapV; slotsNaLinha = 0; }
    }
  }
  desenharRodape();

  // QR code
  onProgresso(97, 'Adicionando QR code da galeria...');
  const galleryUrl = 'https://periniprojetos.com.br/GaleriaFotos';
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(galleryUrl)}`;
  const qrLoaded = await fetchPhotoData(qrImgUrl, 80, 80);

  doc.addPage();
  paginaAtual++;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  drawTimbreViaduto(doc, pageW, margin);
  if (qrLoaded) {
    const qrSize = 70;
    const qrX = (pageW - qrSize) / 2;
    const qrY = 120;
    doc.setFillColor(245, 245, 245);
    doc.rect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 'F');
    doc.addImage(qrLoaded.dataUrl, 'JPEG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');
    doc.setDrawColor(205, 205, 205);
    doc.rect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 'S');
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(50, 50, 50);
  doc.text('Galeria de Fotos Museus Centro', pageW / 2, 210, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 90, 180);
  doc.textWithLink(galleryUrl, pageW / 2, 223, { url: galleryUrl, align: 'center' });
  desenharRodape();

  const filename = `RelatorioExecutivo_${abrev}_${mes}_${ano}.pdf`;
  onProgresso(100, 'Concluído!');

  if (returnBlob) {
    return { blob: doc.output('blob'), filename, totalFotos: carregadas, totalAtividades: atvComFotos.length };
  }
  doc.save(filename);
  return { filename, totalFotos: carregadas, totalAtividades: atvComFotos.length };
}