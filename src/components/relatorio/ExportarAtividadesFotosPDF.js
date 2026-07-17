import jsPDF from 'jspdf';
import { base44 } from '@/api/base44Client';

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_H = 12;
const HEADER_H = 14;
const Y_MAX = PAGE_H - FOOTER_H - 4;

function fmtDate(d) {
  if (!d) return '';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}

function newPage(doc) {
  doc.addPage();
  return HEADER_H + 4;
}

function check(doc, y, needed = 16) {
  if (y + needed > Y_MAX) return newPage(doc);
  return y;
}

function drawHeaders(doc, titulo, periodo) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    // Header
    doc.setFillColor(15, 15, 15);
    doc.rect(0, 0, PAGE_W, HEADER_H, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('VIADUTO DAS ARTES — MUSEUS CENTRO', M, 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(`${titulo}  •  ${periodo}`, M, 11);
    doc.text(`Pág. ${i} / ${total}`, PAGE_W - M, 11, { align: 'right' });

    // Footer
    doc.setDrawColor(200, 200, 200);
    doc.line(M, PAGE_H - FOOTER_H, PAGE_W - M, PAGE_H - FOOTER_H);
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'Relatório de Atividades com Registros Fotográficos — SUCC/PBH — Gerado em ' +
        new Date().toLocaleString('pt-BR'),
      M,
      PAGE_H - 5
    );
  }
}

async function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 8000);
  });
}

export async function exportarAtividadesFotosPDF(relatorio, atividadesComFotos, fotosGaleria) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const periodo = `${fmtDate(relatorio.data_inicio)} a ${fmtDate(relatorio.data_fim)}` || 'Fev–Jun/2026';
  const titulo = 'Demonstrativo Fotográfico de Atividades';

  let y = HEADER_H + 6;

  // ── Capa ────────────────────────────────────────────────────────────────────
  doc.setFillColor(15, 15, 15);
  doc.rect(M, y, CONTENT_W, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('DEMONSTRATIVO FOTOGRÁFICO DE ATIVIDADES', PAGE_W / 2, y + 8, { align: 'center' });
  y += 14;

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Projeto Museus Centro  •  Período: ${periodo}`, PAGE_W / 2, y + 4, { align: 'center' });
  doc.text('Museu Histórico Abílio Barreto (MHAB)  |  Museu da Imagem e do Som (MIS BH)  |  Museu da Moda (MUMO)', PAGE_W / 2, y + 9, { align: 'center' });
  y += 16;

  // Nota SUCC
  doc.setFillColor(255, 251, 220);
  doc.setDrawColor(200, 160, 40);
  doc.rect(M, y, CONTENT_W, 14, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(100, 70, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('NORMAS SUCC/PBH:', M + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Registros fotográficos das atividades executadas no período. Cada foto apresenta descrição da ação, data do registro e museu de referência.',
    M + 3, y + 9,
    { maxWidth: CONTENT_W - 6 }
  );
  y += 18;

  // ── Agrupa atividades por museu ──────────────────────────────────────────────
  const grupos = new Map();

  // 1. Atividades com fotos diretamente vinculadas
  for (const atv of (atividadesComFotos || [])) {
    const museu = atv.museu || 'Geral';
    if (!grupos.has(museu)) grupos.set(museu, []);
    if ((atv.fotos || []).length > 0) {
      grupos.get(museu).push({
        titulo: atv.titulo,
        data: atv.data_realizacao || atv.data || '',
        museu,
        fotos: (atv.fotos || []).slice(0, 5).map(f => ({
          url: f.file_url || f.url,
          legenda: f.legenda || f.caption || atv.titulo,
          autor: f.autor || 'Daniel Moreira Soares',
          data: f.data || atv.data_realizacao || '',
        })),
      });
    }
  }

  // 2. Fotos da galeria agrupadas por activity/museu
  const fotosUsadas = new Set();
  for (const foto of (fotosGaleria || [])) {
    const url = foto.file_url || foto.url;
    if (!url || fotosUsadas.has(url)) continue;
    fotosUsadas.add(url);
    const museu = foto.museu || 'Geral';
    const tituloAtv = foto.atividade_nome || foto.activity_id || 'Registro do Período';
    if (!grupos.has(museu)) grupos.set(museu, []);
    const grupoMuseu = grupos.get(museu);
    let atv = grupoMuseu.find(a => a.titulo === tituloAtv);
    if (!atv) {
      atv = { titulo: tituloAtv, data: foto.created_date || '', museu, fotos: [] };
      grupoMuseu.push(atv);
    }
    if (atv.fotos.length < 5) {
      atv.fotos.push({
        url,
        legenda: foto.caption || foto.legenda || foto.file_name || tituloAtv,
        autor: foto.author || 'Daniel Moreira Soares',
        data: foto.created_date || '',
      });
    }
  }

  // Ordenar museus
  const ordemMuseu = ['MHAB', 'MIS', 'MUMO', 'Geral'];
  const museusSorted = [...grupos.keys()].sort((a, b) => {
    const ia = ordemMuseu.findIndex(m => a.toUpperCase().includes(m));
    const ib = ordemMuseu.findIndex(m => b.toUpperCase().includes(m));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const fotoW = (CONTENT_W - 4) / 3;
  const fotoH = 40;
  const legendaH = 14;
  const blocoH = fotoH + legendaH + 2;

  for (const museu of museusSorted) {
    const atividades = grupos.get(museu).filter(a => a.fotos.length > 0);
    if (atividades.length === 0) continue;

    // Cabeçalho do museu
    y = check(doc, y, 12);
    doc.setFillColor(20, 20, 60);
    doc.rect(M, y, CONTENT_W, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(museu.toUpperCase(), M + 3, y + 5.5);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${atividades.length} atividade(s) com registro fotográfico`, PAGE_W - M - 2, y + 5.5, { align: 'right' });
    y += 10;

    for (const atv of atividades) {
      // Sub-cabeçalho da atividade
      y = check(doc, y, 10);
      doc.setFillColor(240, 240, 248);
      doc.setDrawColor(180, 180, 210);
      doc.rect(M, y, CONTENT_W, 7, 'FD');
      doc.setTextColor(20, 20, 60);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(atv.titulo.slice(0, 70), M + 2, y + 4.8);
      if (atv.data) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(fmtDate(atv.data), PAGE_W - M - 2, y + 4.8, { align: 'right' });
      }
      y += 9;

      // Fotos em grid de 3
      for (let i = 0; i < atv.fotos.length; i += 3) {
        const grupo3 = atv.fotos.slice(i, i + 3);
        y = check(doc, y, blocoH + 3);

        for (let j = 0; j < grupo3.length; j++) {
          const foto = grupo3[j];
          const xFoto = M + j * (fotoW + 2);

          // Imagem
          if (foto.url) {
            const dataUrl = await loadImage(foto.url);
            if (dataUrl) {
              try {
                doc.addImage(dataUrl, 'JPEG', xFoto, y, fotoW, fotoH, undefined, 'FAST');
              } catch {
                drawPlaceholder(doc, xFoto, y, fotoW, fotoH);
              }
            } else {
              drawPlaceholder(doc, xFoto, y, fotoW, fotoH);
            }
          } else {
            drawPlaceholder(doc, xFoto, y, fotoW, fotoH);
          }

          // Legenda
          const ly = y + fotoH + 0.5;
          doc.setFillColor(248, 248, 255);
          doc.setDrawColor(200, 200, 220);
          doc.rect(xFoto, ly, fotoW, legendaH, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(20, 20, 60);
          const legLines = doc.splitTextToSize(foto.legenda?.slice(0, 60) || atv.titulo, fotoW - 3);
          doc.text(legLines[0] || '', xFoto + 1.5, ly + 3.5);
          if (legLines[1]) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.5);
            doc.setTextColor(60, 60, 80);
            doc.text(legLines[1], xFoto + 1.5, ly + 7);
          }

          // Museu + data
          doc.setFontSize(5);
          doc.setTextColor(130, 130, 160);
          doc.setFont('helvetica', 'italic');
          const meta = [museu, foto.data ? fmtDate(foto.data) : ''].filter(Boolean).join(' — ');
          doc.text(meta.slice(0, 30), xFoto + 1.5, ly + legendaH - 2);
        }

        y += blocoH + 3;
      }
      y += 4;
    }
    y += 6;
  }

  // Sem atividades com fotos
  if (museusSorted.length === 0 || [...grupos.values()].every(g => g.every(a => a.fotos.length === 0))) {
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhuma atividade com foto encontrada para o período.', PAGE_W / 2, y + 10, { align: 'center' });
  }

  drawHeaders(doc, titulo, periodo);

  const mesRef = (relatorio.data_inicio || '').slice(0, 7).replace('-', '_') || 'periodo';
  doc.save(`Atividades_Fotos_SUCC_${mesRef}.pdf`);
}

function drawPlaceholder(doc, x, y, w, h) {
  doc.setFillColor(235, 235, 240);
  doc.setDrawColor(200, 200, 210);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(x, y, w, h, 'FD');
  doc.setLineDashPattern([], 0);
  doc.setFontSize(6);
  doc.setTextColor(170, 170, 185);
  doc.setFont('helvetica', 'italic');
  doc.text('Foto não disponível', x + w / 2, y + h / 2, { align: 'center' });
}