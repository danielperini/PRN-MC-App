/**
 * Gera uma amostra do Relatório Executivo de Fotos usando fotos do ReportPhoto.
 * Útil para validar layout (4 fotos/página, timbre institucional, legendas IA)
 * quando a entidade Activity está vazia ou sem vínculos.
 *
 * Uso: import { gerarAmostraRelatorioExecutivo } from '@/utils/exportarAmostraRelatorioExecutivo';
 *      gerarAmostraRelatorioExecutivo('MHAB', 'Abril', 2026);
 */
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import { drawTimbreViaduto } from '@/components/gallery/timbreViadutoPDF';
import { isLegendaGenerica } from '@/components/gallery/deduplicarFotosGaleria';

const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som',
  MUMO: 'MUMO — Museu da Moda',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
};
const SECTION_ABREV = {
  MHAB: 'MHAB', MIS: 'MIS', MUMO: 'MUMO', MAP: 'MAP',
  CasaKubitschek: 'Casa Kubitschek', CasaDoBalile: 'Casa do Baíle',
};

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

function formatDateBR(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
}

/**
 * @param {string} museuKey - chave do museu (MHAB, MIS, MUMO, etc.)
 * @param {string} mes - mês por extenso (Abril, Março, etc.)
 * @param {number} ano
 * @param {object} opts - { maxFotosPorAtividade, gerarLegendasIA, onProgresso }
 */
export async function gerarAmostraRelatorioExecutivo(museuKey, mes, ano, opts = {}) {
  const {
    maxFotosPorAtividade = 4,
    gerarLegendasIA = true,
    onProgresso = () => {},
  } = opts;

  const abrev = SECTION_ABREV[museuKey] || museuKey;
  const label = SECTION_LABELS[museuKey] || museuKey;

  onProgresso(2, 'Buscando fotos do período...');
  let fotos = [];
  try {
    fotos = await base44.entities.ReportPhoto.filter({ museu: museuKey }) || [];
    fotos = fotos.filter((f) => f.mes_referencia === mes && f.ano === ano);
  } catch (e) {
    console.error('Erro ao buscar ReportPhoto:', e);
  }

  if (fotos.length === 0) {
    throw new Error(`Nenhuma foto encontrada para ${abrev} em ${mes}/${ano}.`);
  }

  // Agrupa fotos em "atividades" virtuais (4 fotos cada)
  const atividadesVirtuais = [];
  for (let i = 0; i < fotos.length; i += maxFotosPorAtividade) {
    const lote = fotos.slice(i, i + maxFotosPorAtividade);
    atividadesVirtuais.push({
      titulo: `Atividade ${atividadesVirtuais.length + 1}`,
      data: formatDateBR(lote[0]?.created_date),
      fotos: lote.map((rp) => ({
        fileUrl: rp.file_url,
        legenda: rp.legenda || rp.caption || rp.file_name || `Atividade ${atividadesVirtuais.length + 1}`,
        activityId: rp.activity_id,
        reportId: rp.report_id,
      })),
    });
  }

  // Layout A4 retrato
  const pageW = 210, pageH = 297, margin = 15;
  const cols = 2, perPage = 4;
  const gapH = 6, gapV = 6;
  const footerH = 12;
  const titleBarH = 10;

  // Coleta fotos para o PDF
  const fotosParaPDF = [];
  for (const item of atividadesVirtuais) {
    for (const f of item.fotos) {
      fotosParaPDF.push({ ...f, tituloAtividade: item.titulo, dataAtividade: item.data });
    }
  }

  // Gera legendas via IA para fotos com legenda genérica
  const legendasIA = {};
  if (gerarLegendasIA) {
    const precisam = fotosParaPDF.filter((f) => isLegendaGenerica(f.legenda));
    if (precisam.length > 0) {
      onProgresso(5, `Gerando legendas via IA · ${precisam.length} foto(s)...`);
      for (let i = 0; i < precisam.length; i += 5) {
        const lote = precisam.slice(i, i + 5);
        const loteNum = Math.floor(i / 5) + 1;
        const totalLotes = Math.ceil(precisam.length / 5);
        onProgresso(5 + Math.round((loteNum / totalLotes) * 15), `Legendas IA · lote ${loteNum}/${totalLotes}...`);
        const resultados = await Promise.allSettled(
          lote.map((f) => base44.functions.invoke('suggestPhotoCaption', {
            photoUrl: f.fileUrl,
            activityId: f.activityId,
            reportId: f.reportId,
          }))
        );
        resultados.forEach((r, idx) => {
          const f = lote[idx];
          if (r.status === 'fulfilled' && r.value?.data?.caption) {
            legendasIA[f.fileUrl] = r.value.data.caption;
            f.legenda = r.value.data.caption;
          }
        });
      }
    }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  // ── Capa ──
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', pageW / 2, 30, { align: 'center' });
  doc.setFontSize(22);
  doc.text(abrev, pageW / 2, 80, { align: 'center' });
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(label, pageW / 2, 95, { align: 'center', maxWidth: 170 });
  doc.setFontSize(11);
  doc.setTextColor(180, 180, 180);
  doc.text('Relatório de Atividades (Amostra)', pageW / 2, 115, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`${mes} de ${ano}`, pageW / 2, 128, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(150, 205, 255);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 145, { align: 'center' });

  // Primeira página de fotos — desenha timbre e obtém altura real
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  const timbreH = drawTimbreViaduto(doc, pageW, margin);

  // Calcula layout dinâmico usando altura real do timbre
  const contentTop = timbreH + 4;
  const contentBottom = pageH - footerH - margin;
  const contentW = pageW - margin * 2;
  const usableH = contentBottom - contentTop;
  const cellW = (contentW - (cols - 1) * gapH) / cols;
  const gridH = usableH - titleBarH - gapV;
  const cellH = (gridH - gapV) / 2;
  const slotH = cellH - 16;

  // Pré-carrega imagens (resolução reduzida ×3)
  onProgresso(20, `Carregando ${fotosParaPDF.length} imagens...`);
  const imagens = [];
  for (let i = 0; i < fotosParaPDF.length; i++) {
    if (i > 0 && i % 3 === 0) {
      onProgresso(20 + Math.round((i / fotosParaPDF.length) * 40), `Carregando imagens · ${i}/${fotosParaPDF.length}...`);
    }
    imagens.push(await fetchPhotoData(fotosParaPDF[i].fileUrl, cellW * 3, slotH * 3));
  }

  const carregadas = imagens.filter(Boolean).length;
  if (carregadas === 0) throw new Error('Nenhuma imagem pôde ser carregada.');

  // Atualiza capa com contagem final
  doc.setTextColor(150, 205, 255);
  doc.text(`${carregadas} fotografias em ${atividadesVirtuais.length} atividades`, pageW / 2, 155, { align: 'center' });

  // ── Páginas de fotos ──
  const fotosComImg = fotosParaPDF.filter((_, i) => imagens[i]);
  const imagemPorUrl = new Map(fotosParaPDF.map((f, i) => [f.fileUrl, imagens[i]]));

  onProgresso(60, `Montando PDF · ${carregadas} foto(s)...`);

  let paginaAtual = 2;
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

  // Agrupa por atividade virtual
  const atvComFotos = [];
  for (const item of atividadesVirtuais) {
    const validas = item.fotos.filter((f) => imagemPorUrl.get(f.fileUrl));
    if (validas.length > 0) {
      atvComFotos.push({ titulo: item.titulo, data: item.data, fotos: validas });
    }
  }

  let fotoIdx = 0;
  for (let aIdx = 0; aIdx < atvComFotos.length; aIdx++) {
    const atv = atvComFotos[aIdx];

    const espacoNecessario = titleBarH + gapV + cellH + gapV;
    if (cursorY + espacoNecessario > contentBottom) {
      novaPagina();
    }
    if (slotsNaLinha === 1) {
      cursorY += cellH + gapV;
      slotsNaLinha = 0;
    }

    // Barra de título da atividade
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

    // Grade 2×2
    for (let fIdx = 0; fIdx < atv.fotos.length; fIdx++) {
      const foto = atv.fotos[fIdx];
      const imgResult = imagemPorUrl.get(foto.fileUrl);
      if (!imgResult) continue;

      if (cursorY + cellH > contentBottom) {
        novaPagina();
      }

      const col = slotsNaLinha;
      const slotX = margin + col * (cellW + gapH);
      const slotY = cursorY;

      if (fotoIdx > 0 && fotoIdx % 2 === 0) {
        await new Promise((r) => requestAnimationFrame(() => r()));
      }

      // Fundo letterbox #F5F5F5
      doc.setFillColor(245, 245, 245);
      doc.rect(slotX, slotY, cellW, slotH, 'F');

      // Imagem em modo "contain" (fit completo, sem crop)
      const scale = Math.min(cellW / imgResult.w, slotH / imgResult.h);
      const renderW = imgResult.w * scale;
      const renderH = imgResult.h * scale;
      const offsetX = slotX + (cellW - renderW) / 2;
      const offsetY = slotY + (slotH - renderH) / 2;
      doc.addImage(imgResult.dataUrl, 'JPEG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');

      // Borda do slot
      doc.setDrawColor(205, 205, 205);
      doc.rect(slotX, slotY, cellW, slotH, 'S');

      // Legenda estruturada (3 linhas, alinhada à esquerda)
      let legY = slotY + slotH + 3;
      // Linha 1: título da atividade (bold, 8.5pt, #141414)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 20);
      const tituloLeg = doc.splitTextToSize(foto.tituloAtividade || atv.titulo || 'Registro fotográfico', cellW - 2)[0] || '';
      doc.text(tituloLeg, slotX, legY);
      legY += 4;
      // Linha 2: museu (normal, 7.5pt, #666666)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(102, 102, 102);
      doc.text(abrev, slotX, legY);
      legY += 3.5;
      // Linha 3: data (normal, 7pt, #999999)
      doc.setFontSize(7);
      doc.setTextColor(153, 153, 153);
      doc.text(foto.dataAtividade || atv.data || '', slotX, legY);

      slotsNaLinha++;
      fotoIdx++;

      if (fotoIdx < fotosComImg.length) {
        onProgresso(60 + Math.round((fotoIdx / fotosComImg.length) * 35), `Montando PDF · foto ${fotoIdx}/${fotosComImg.length}...`);
      }

      if (slotsNaLinha >= cols) {
        cursorY += cellH + gapV;
        slotsNaLinha = 0;
      }
    }
  }

  desenharRodape();

  // ── Página final: QR code da galeria ──
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

  const ts = new Date().toISOString().slice(0, 10);
  const filename = `Amostra_RelatorioExecutivo_${abrev}_${mes}_${ano}_${ts}.pdf`;
  doc.save(filename);

  onProgresso(100, 'Concluído!');
  return { filename, totalFotos: carregadas, totalAtividades: atvComFotos.length };
}