import jsPDF from 'jspdf';

// ─── Constantes de layout A4 ────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const M_L = 15;       // margem esquerda
const M_R = 15;       // margem direita
const CONTENT_W = PAGE_W - M_L - M_R;
const HEADER_H = 18;  // altura do cabeçalho em cada página
const FOOTER_H = 10;  // altura do rodapé em cada página
const Y_START = HEADER_H + 6;
const Y_MAX = PAGE_H - FOOTER_H - 6;

// ─── Cores institucionais ────────────────────────────────────────────────────
const COR_TOPO = [10, 10, 50];       // azul escuro institucional
const COR_MUSEU = [30, 60, 120];     // azul médio para cabeçalho de museu
const COR_ATIV = [245, 247, 252];    // fundo sub-cabeçalho atividade
const COR_BORDA_ATIV = [180, 195, 230];
const COR_LEGENDA_BG = [250, 250, 255];
const COR_LEGENDA_BORDA = [210, 215, 240];

// ─── Utilitários ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '';
  const p = String(d).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
}

function checkPageBreak(doc, y, needed) {
  if (y + needed > Y_MAX) {
    doc.addPage();
    return Y_START;
  }
  return y;
}

// ─── Cabeçalho + Rodapé em todas as páginas ──────────────────────────────────
function drawAllPageHeaders(doc, subtitulo, periodo) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    // Topo — barra escura
    doc.setFillColor(...COR_TOPO);
    doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

    // Linha de destaque amarela
    doc.setFillColor(220, 170, 30);
    doc.rect(0, HEADER_H - 1.5, PAGE_W, 1.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('PROJETO MUSEUS CENTRO — VIADUTO DAS ARTES', M_L, 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(200, 210, 240);
    doc.text(`${subtitulo}  •  Período: ${periodo}`, M_L, 13.5);
    doc.text(`Página ${i} de ${total}`, PAGE_W - M_R, 13.5, { align: 'right' });

    // Rodapé
    doc.setDrawColor(200, 200, 220);
    doc.setLineWidth(0.3);
    doc.line(M_L, PAGE_H - FOOTER_H, PAGE_W - M_R, PAGE_H - FOOTER_H);
    doc.setFontSize(5.5);
    doc.setTextColor(140, 140, 160);
    doc.setFont('helvetica', 'italic');
    doc.text(
      `Demonstrativo Fotográfico de Atividades — Prestação de Contas SUCC/PBH — Emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}`,
      M_L,
      PAGE_H - 4
    );
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 140);
    doc.text('Confidencial — Uso Restrito', PAGE_W - M_R, PAGE_H - 4, { align: 'right' });
  }
}

// ─── Carrega imagem via canvas ────────────────────────────────────────────────
async function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 10000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        const maxSide = 800;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1));
        canvas.width = (img.naturalWidth || img.width) * scale;
        canvas.height = (img.naturalHeight || img.height) * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

function drawPlaceholder(doc, x, y, w, h) {
  doc.setFillColor(235, 237, 245);
  doc.setDrawColor(200, 205, 225);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, h, 'FD');
  doc.setLineDashPattern([], 0);
  doc.setFontSize(6);
  doc.setTextColor(175, 175, 195);
  doc.setFont('helvetica', 'italic');
  doc.text('Imagem não disponível', x + w / 2, y + h / 2 - 1, { align: 'center' });
  doc.setFontSize(5);
  doc.text('(carregamento falhou ou URL inválida)', x + w / 2, y + h / 2 + 3.5, { align: 'center' });
}

// ─── Capa institucional ───────────────────────────────────────────────────────
function drawCapa(doc, periodo, museus, totalAtividades, totalFotos) {
  let y = Y_START + 8;

  // Bloco título principal
  doc.setFillColor(...COR_TOPO);
  doc.rect(M_L, y, CONTENT_W, 20, 'F');
  doc.setFillColor(220, 170, 30);
  doc.rect(M_L, y + 20, CONTENT_W, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('DEMONSTRATIVO FOTOGRÁFICO', PAGE_W / 2, y + 8.5, { align: 'center' });
  doc.setFontSize(11);
  doc.text('DE ATIVIDADES EXECUTADAS', PAGE_W / 2, y + 15.5, { align: 'center' });
  y += 24;

  // Período e identificação
  doc.setFillColor(248, 249, 255);
  doc.setDrawColor(180, 195, 230);
  doc.setLineWidth(0.4);
  doc.rect(M_L, y, CONTENT_W, 30, 'FD');

  doc.setTextColor(40, 50, 100);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('IDENTIFICAÇÃO DO DOCUMENTO', M_L + 4, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 80);

  const campos = [
    ['Organização proponente:', 'Viaduto das Artes — Associação Cultural'],
    ['Projeto:', 'Museus Centro — 3º Aditivo'],
    ['Instrumento:', 'Termo de Parceria SUCC/PBH'],
    ['Período de referência:', periodo],
  ];
  campos.forEach(([label, valor], idx) => {
    const cy = y + 13 + idx * 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 70, 120);
    doc.text(label, M_L + 4, cy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 60);
    doc.text(valor, M_L + 55, cy);
  });
  y += 34;

  // Museus cobertos
  if (museus.length > 0) {
    doc.setFillColor(235, 240, 255);
    doc.setDrawColor(170, 190, 230);
    doc.rect(M_L, y, CONTENT_W, 12, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 50, 110);
    doc.text('UNIDADES COBERTAS:', M_L + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(museus.join('  |  '), M_L + 4, y + 10);
    y += 16;
  }

  // Estatísticas
  doc.setFillColor(30, 60, 120);
  doc.rect(M_L, y, CONTENT_W, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  const stats = [
    { label: 'Atividades com Fotos', valor: String(totalAtividades) },
    { label: 'Registros Fotográficos', valor: String(totalFotos) },
    { label: 'Documento', valor: 'Prestação de Contas SUCC' },
  ];
  const colW = CONTENT_W / stats.length;
  stats.forEach((s, i) => {
    const cx = M_L + colW * i + colW / 2;
    doc.setFontSize(13);
    doc.text(s.valor, cx, y + 7.5, { align: 'center' });
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(190, 210, 255);
    doc.text(s.label.toUpperCase(), cx, y + 13, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
  });
  y += 20;

  // Nota normativa
  doc.setFillColor(255, 252, 225);
  doc.setDrawColor(200, 165, 30);
  doc.setLineWidth(0.5);
  doc.rect(M_L, y, CONTENT_W, 18, 'FD');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 70, 0);
  doc.text('⚠  CONFORMIDADE SUCC/PBH', M_L + 4, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 55, 0);
  const nota =
    'Este documento integra a prestação de contas exigida pela Subsecretaria Municipal de Cultura de Belo Horizonte (SUCC/PBH). ' +
    'Os registros fotográficos apresentados comprovam a execução das atividades previstas no Plano de Trabalho do 3º Aditivo do Projeto Museus Centro, ' +
    'organizados por unidade museológica e categoria de ação.';
  const notaLines = doc.splitTextToSize(nota, CONTENT_W - 8);
  doc.text(notaLines, M_L + 4, y + 10.5);
  y += 22;
}

// ─── Exportação principal ─────────────────────────────────────────────────────
export async function exportarAtividadesFotosPDF(relatorio, atividadesComFotos, fotosGaleria) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Período legível
  const mesRef = relatorio?.mes_referencia || '';
  const anoRef = relatorio?.ano || 2026;
  const periodoLabel = mesRef
    ? `${mesRef}/${anoRef}`
    : 'Fevereiro a Junho de 2026';

  const subtitulo = 'Demonstrativo Fotográfico de Atividades';

  // ── Agrupa atividades por museu ─────────────────────────────────────────────
  const grupos = new Map(); // museu → [{ titulo, data, museu, meta, fotos[] }]
  const fotosUsadas = new Set();

  // 1. Atividades com fotos vinculadas (via report.atividades[])
  for (const atv of (atividadesComFotos || [])) {
    const fotosAtv = (atv.fotos || []).filter(f => f.file_url || f.url);
    if (fotosAtv.length === 0) continue;
    const museu = atv.museu || relatorio?.museu || 'Geral';
    if (!grupos.has(museu)) grupos.set(museu, []);
    grupos.get(museu).push({
      titulo: atv.titulo || atv.nome || 'Atividade',
      data: atv.data_realizacao || atv.data_inicio || atv.data || '',
      museu,
      meta: atv.meta_codigo || atv.classificacao || '',
      fotos: fotosAtv.slice(0, 6).map(f => ({
        url: f.file_url || f.url,
        legenda: f.legenda || f.caption || atv.titulo || '',
        autor: f.autor || 'Acervo Museus Centro',
        data: f.data || atv.data_realizacao || '',
      })),
    });
    fotosAtv.forEach(f => fotosUsadas.add(f.file_url || f.url));
  }

  // 2. Fotos da galeria ainda não usadas
  for (const foto of (fotosGaleria || [])) {
    const url = foto.file_url || foto.url;
    if (!url || fotosUsadas.has(url)) continue;
    fotosUsadas.add(url);
    const museu = foto.museu || relatorio?.museu || 'Geral';
    const tituloAtv = foto.atividade_nome || 'Registros do Período';
    if (!grupos.has(museu)) grupos.set(museu, []);
    let bloco = grupos.get(museu).find(a => a.titulo === tituloAtv);
    if (!bloco) {
      bloco = { titulo: tituloAtv, data: '', museu, meta: '', fotos: [] };
      grupos.get(museu).push(bloco);
    }
    if (bloco.fotos.length < 6) {
      bloco.fotos.push({
        url,
        legenda: foto.caption || foto.legenda || foto.file_name || tituloAtv,
        autor: foto.author || 'Acervo Museus Centro',
        data: foto.mes_referencia ? '' : (foto.created_date || ''),
      });
    }
  }

  // Ordenação dos museus
  const ordemMuseu = ['MHAB', 'MIS', 'MUMO', 'Geral'];
  const museusSorted = [...grupos.keys()].sort((a, b) => {
    const ia = ordemMuseu.findIndex(m => a.toUpperCase().includes(m.toUpperCase()));
    const ib = ordemMuseu.findIndex(m => b.toUpperCase().includes(m.toUpperCase()));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const totalAtividades = [...grupos.values()].flat().filter(a => a.fotos.length > 0).length;
  const totalFotos = [...grupos.values()].flat().reduce((s, a) => s + a.fotos.length, 0);
  const museuNomes = museusSorted.filter(m => (grupos.get(m) || []).some(a => a.fotos.length > 0));

  // ── Capa ────────────────────────────────────────────────────────────────────
  drawCapa(doc, periodoLabel, museuNomes, totalAtividades, totalFotos);

  // ── Conteúdo por museu ───────────────────────────────────────────────────────
  // Grid 2 colunas
  const GAP = 4;
  const FOTO_W = (CONTENT_W - GAP) / 2;
  const FOTO_H = 52;   // altura foto no grid 2 col
  const LEG_H = 18;    // altura legenda
  const BLOCO_H = FOTO_H + LEG_H + 1;

  // Página nova para o conteúdo fotográfico
  doc.addPage();
  let y = Y_START;

  for (const museu of museusSorted) {
    const atividades = (grupos.get(museu) || []).filter(a => a.fotos.length > 0);
    if (atividades.length === 0) continue;

    // ── Cabeçalho do museu ──────────────────────────────────────────────────
    y = checkPageBreak(doc, y, 14);
    doc.setFillColor(...COR_MUSEU);
    doc.rect(M_L, y, CONTENT_W, 10, 'F');
    doc.setFillColor(220, 170, 30);
    doc.rect(M_L, y + 10, CONTENT_W, 1, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(museu.toUpperCase(), M_L + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(200, 215, 255);
    const totalFotosMuseu = atividades.reduce((s, a) => s + a.fotos.length, 0);
    doc.text(
      `${atividades.length} atividade(s)  •  ${totalFotosMuseu} foto(s)`,
      PAGE_W - M_R,
      y + 7,
      { align: 'right' }
    );
    y += 13;

    for (const atv of atividades) {
      // ── Sub-cabeçalho da atividade ──────────────────────────────────────
      y = checkPageBreak(doc, y, 12);
      doc.setFillColor(...COR_ATIV);
      doc.setDrawColor(...COR_BORDA_ATIV);
      doc.setLineWidth(0.3);
      doc.rect(M_L, y, CONTENT_W, 8, 'FD');

      // Traço lateral colorido
      doc.setFillColor(...COR_MUSEU);
      doc.rect(M_L, y, 2, 8, 'F');

      doc.setTextColor(20, 40, 100);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const tituloTruncado = atv.titulo.length > 80 ? atv.titulo.slice(0, 77) + '…' : atv.titulo;
      doc.text(tituloTruncado, M_L + 4.5, y + 5.2);

      if (atv.meta) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(80, 100, 160);
        doc.text(`Meta: ${atv.meta}`, PAGE_W - M_R - 2, y + 5.2, { align: 'right' });
      }
      if (atv.data) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(100, 120, 170);
        const xData = atv.meta ? PAGE_W - M_R - 35 : PAGE_W - M_R - 2;
        doc.text(fmtDate(atv.data), xData, y + 5.2, { align: 'right' });
      }
      y += 10;

      // ── Grid 2×N de fotos ───────────────────────────────────────────────
      const fotos = atv.fotos;
      for (let i = 0; i < fotos.length; i += 2) {
        const par = fotos.slice(i, i + 2);
        y = checkPageBreak(doc, y, BLOCO_H + 4);

        for (let j = 0; j < par.length; j++) {
          const foto = par[j];
          const xFoto = M_L + j * (FOTO_W + GAP);

          // Borda da foto
          doc.setDrawColor(210, 215, 235);
          doc.setLineWidth(0.3);
          doc.rect(xFoto, y, FOTO_W, FOTO_H, 'D');

          // Imagem
          if (foto.url) {
            const dataUrl = await loadImage(foto.url);
            if (dataUrl) {
              try {
                doc.addImage(dataUrl, 'JPEG', xFoto, y, FOTO_W, FOTO_H, undefined, 'FAST');
              } catch {
                drawPlaceholder(doc, xFoto, y, FOTO_W, FOTO_H);
              }
            } else {
              drawPlaceholder(doc, xFoto, y, FOTO_W, FOTO_H);
            }
          } else {
            drawPlaceholder(doc, xFoto, y, FOTO_W, FOTO_H);
          }

          // Número da foto (badge)
          doc.setFillColor(0, 0, 0, 120);
          doc.setFillColor(20, 40, 100);
          doc.rect(xFoto, y, 8, 5, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.text(`Foto ${i + j + 1}`, xFoto + 1, y + 3.5);

          // Bloco da legenda
          const ly = y + FOTO_H + 0.5;
          doc.setFillColor(...COR_LEGENDA_BG);
          doc.setDrawColor(...COR_LEGENDA_BORDA);
          doc.setLineWidth(0.3);
          doc.rect(xFoto, ly, FOTO_W, LEG_H, 'FD');

          // Legenda principal
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(20, 40, 100);
          const legLines = doc.splitTextToSize(
            foto.legenda || atv.titulo || 'Registro fotográfico',
            FOTO_W - 4
          );
          doc.text(legLines.slice(0, 2), xFoto + 2, ly + 4.5);

          // Museu e data na legenda
          doc.setFontSize(5.2);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 120, 170);
          const metaLeg = [museu, foto.data ? fmtDate(foto.data) : ''].filter(Boolean).join(' — ');
          doc.text(metaLeg, xFoto + 2, ly + LEG_H - 7);

          // Crédito/autor
          doc.setFontSize(4.8);
          doc.setTextColor(150, 160, 190);
          doc.setFont('helvetica', 'italic');
          doc.text(
            `Foto: ${foto.autor || 'Acervo Museus Centro'}`,
            xFoto + 2,
            ly + LEG_H - 3
          );
        }

        y += BLOCO_H + 5;
      }
      y += 6;
    }
    y += 8;
  }

  // Sem dados
  if (totalFotos === 0) {
    y = checkPageBreak(doc, y, 20);
    doc.setFillColor(248, 248, 255);
    doc.setDrawColor(200, 210, 235);
    doc.rect(M_L, y, CONTENT_W, 20, 'FD');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(150, 155, 190);
    doc.text('Nenhuma atividade com registro fotográfico encontrada para o período.', PAGE_W / 2, y + 12, { align: 'center' });
  }

  // ── Aplica cabeçalho/rodapé em TODAS as páginas ──────────────────────────────
  drawAllPageHeaders(doc, subtitulo, periodoLabel);

  // ── Salva o arquivo ──────────────────────────────────────────────────────────
  const nomeArquivo = `Demonstrativo_Fotografico_SUCC_${periodoLabel.replace(/[\s\/]/g, '_')}.pdf`;
  doc.save(nomeArquivo);
}