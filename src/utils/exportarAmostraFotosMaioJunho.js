import jsPDF from 'jspdf';
import viadutoHeaderOriginal from '@/assets/viadutoHeaderOriginal';
import { preloadPdfPhotos } from '@/utils/pdfPhotoLoader';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const GAP = 5;
const PHOTO_W = (PAGE_W - MARGIN * 2 - GAP) / 2;
const PHOTO_H = 74;
const CARD_H = 92;

function normalizar(valor = '') {
  return String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function periodoFoto(foto) {
  return normalizar(foto.reportMes || '').includes('junho') ? 'Junho/2026' : 'Maio/2026';
}

function dataFoto(foto) {
  const valor = foto.date || foto.timestamp || '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Data não informada' : data.toLocaleDateString('pt-BR');
}

function atividadeFoto(foto) {
  return foto.activityTitulo || foto.legenda || foto.fileName || 'Registro fotográfico';
}

export async function exportarAmostraFotosMaioJunho(images) {
  const fotos = images
    .filter((foto) => ['maio', 'junho'].some((mes) => normalizar(foto.reportMes).includes(mes)))
    .sort((a, b) => periodoFoto(a).localeCompare(periodoFoto(b)) || String(a.museu).localeCompare(String(b.museu)) || String(a.date).localeCompare(String(b.date)));

  if (!fotos.length) throw new Error('Não há fotos de maio e junho para gerar a amostra');

  const assets = await preloadPdfPhotos(fotos);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let page = 1;

  const cabecalho = () => {
    doc.addImage(viadutoHeaderOriginal, 'PNG', 0, 0, PAGE_W, 34.4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(35, 35, 35);
    doc.setFontSize(12);
    doc.text('AMOSTRA CONSOLIDADA DE REGISTROS FOTOGRÁFICOS', MARGIN, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text('Maio e Junho de 2026 · 4 fotos por página', MARGIN, 47);
  };

  const rodape = () => {
    doc.setDrawColor(210, 210, 210);
    doc.line(MARGIN, 286, PAGE_W - MARGIN, 286);
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(7);
    doc.text('Museus Centro · Viaduto das Artes', MARGIN, 291);
    doc.text(`Página ${page}`, PAGE_W - MARGIN, 291, { align: 'right' });
  };

  cabecalho();
  fotos.forEach((foto, index) => {
    if (index > 0 && index % 4 === 0) {
      rodape();
      doc.addPage();
      page += 1;
      cabecalho();
    }

    const slot = index % 4;
    const column = slot % 2;
    const row = Math.floor(slot / 2);
    const x = MARGIN + column * (PHOTO_W + GAP);
    const y = 55 + row * (CARD_H + 5);
    const asset = assets.get(foto.id || foto.fileUrl);
    const ratio = asset.width / asset.height;
    const fitWidth = Math.min(PHOTO_W, PHOTO_H * ratio);
    const fitHeight = Math.min(PHOTO_H, PHOTO_W / ratio);
    const imageX = x + (PHOTO_W - fitWidth) / 2;
    const imageY = y + (PHOTO_H - fitHeight) / 2;

    doc.setFillColor(246, 246, 246);
    doc.rect(x, y, PHOTO_W, PHOTO_H, 'F');
    doc.addImage(asset.dataUrl, asset.format, imageX, imageY, fitWidth, fitHeight);
    doc.setDrawColor(205, 205, 205);
    doc.rect(x, y, PHOTO_W, PHOTO_H, 'D');
    doc.setFillColor(248, 248, 248);
    doc.rect(x, y + PHOTO_H, PHOTO_W, CARD_H - PHOTO_H, 'F');
    doc.rect(x, y + PHOTO_H, PHOTO_W, CARD_H - PHOTO_H, 'D');
    doc.setTextColor(45, 45, 45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(atividadeFoto(foto), PHOTO_W - 4).slice(0, 2), x + 2, y + PHOTO_H + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(5.5);
    doc.text(`Museu: ${foto.museu || 'Não informado'}`, x + 2, y + PHOTO_H + 12);
    doc.text(`Data da realização: ${dataFoto(foto)} · ${periodoFoto(foto)}`, x + 2, y + PHOTO_H + 16);
  });
  rodape();
  doc.save('Amostra_Fotografica_Maio_Junho_2026.pdf');
}