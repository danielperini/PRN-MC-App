/**
 * Gera um Relatório Executivo completo que consolida TODAS as atividades registradas
 * e fotos importadas, agrupadas por museu e equipe.
 * Reutiliza a infraestrutura de PDF já existente (timbre, layout, legendas).
 */
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import { drawTimbreViaduto } from '@/components/gallery/timbreViadutoPDF';
import { isLegendaGenerica } from '@/components/gallery/deduplicarFotosGaleria';
import {
  SECTION_LABELS,
  SECTION_ABREV,
  matchMuseu,
  museuKeysParaFiltro,
  formatDateBR,
} from '@/utils/gerarRelatorioExecutivoAtividades';

const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile', 'NOTURNO'];

const EQUIPE_LABELS = {
  EDUCATIVO: 'Equipe Educativa',
  PRODUCAO: 'Equipe de Produção',
  COMUNICACAO: 'Equipe de Comunicação',
  ADMINISTRACAO: 'Equipe Administrativa',
};

function normalizarTexto(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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

async function tick() {
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => setTimeout(r, 0));
}

/**
 * Busca TODAS as atividades com fotos, agrupadas por museu e equipe.
 * Retorna array de { museuKey, equipe, atividades: [{ atividade, fotos }] }.
 */
export async function buscarTodasAtividadesComFotos(opts = {}) {
  const { onProgresso = () => {} } = opts;

  onProgresso(3, 'Buscando todas as atividades...');

  // Buscar todas as atividades
  const todasAtividades = await base44.entities.Activity.list('-created_date', 2000).catch(() => []);
  if (!todasAtividades || todasAtividades.length === 0) return [];

  onProgresso(15, `${todasAtividades.length} atividades encontradas. Buscando fotos...`);

  // Buscar todas as ReportPhotos
  let todasFotos = [];
  try {
    const vistosIds = new Set();
    for (const museuKey of SECTION_ORDER) {
      const variacoes = [...museuKeysParaFiltro(museuKey), 'GERAL'];
      for (const v of variacoes) {
        const page = await base44.entities.ReportPhoto.filter({ museu: v }, '-created_date', 500) || [];
        for (const rp of page) {
          if (!vistosIds.has(rp.id)) {
            vistosIds.add(rp.id);
            todasFotos.push(rp);
          }
        }
      }
    }
  } catch { todasFotos = []; }

  onProgresso(40, `${todasFotos.length} fotos no acervo. Vinculando...`);

  // Mapear fotos por activity_id
  const fotosPorAtividade = new Map();
  for (const rp of todasFotos) {
    if (!rp.activity_id) continue;
    if (!fotosPorAtividade.has(rp.activity_id)) fotosPorAtividade.set(rp.activity_id, []);
    const arr = fotosPorAtividade.get(rp.activity_id);
    if (arr.length < 5) {
      arr.push({
        fileUrl: rp.file_url,
        legenda: rp.legenda || rp.caption || '',
        file_name: rp.file_name || '',
      });
    }
  }

  onProgresso(55, 'Agrupando por museu e equipe...');

  // Agrupar atividades por museu → equipe
  const resultado = [];
  for (const museuKey of SECTION_ORDER) {
    const atividadesMuseu = todasAtividades.filter((act) => matchMuseu(act.museu, museuKey));
    if (atividadesMuseu.length === 0) continue;

    const equipesMap = new Map();
    for (const act of atividadesMuseu) {
      const equipe = act.tipo_equipe || 'SEM_EQUIPE';
      if (!equipesMap.has(equipe)) equipesMap.set(equipe, []);
      equipesMap.get(equipe).push(act);
    }

    for (const [equipe, atividades] of equipesMap) {
      const atvsComFotos = atividades
        .map((act) => {
          const fotos = fotosPorAtividade.get(act.id) || [];
          const actFotos = (Array.isArray(act.fotos) ? act.fotos : []).slice(0, 5).map((f) => ({
            fileUrl: f.file_url || f.fileUrl,
            legenda: f.legenda || act.titulo || '',
            file_name: f.file_name || '',
          }));
          const todas = [...actFotos, ...fotos].slice(0, 5);
          return { atividade: act, fotos: todas };
        })
        .filter((item) => item.fotos.length > 0);

      if (atvsComFotos.length === 0) continue;

      resultado.push({ museuKey, equipe, atividades: atvsComFotos });
    }
  }

  onProgresso(70, `${resultado.length} grupo(s) museu/equipe montado(s).`);

  return resultado;
}

/**
 * Gera o PDF consolidado a partir dos grupos museu/equipe.
 */
export async function gerarPDFRelatorioCompleto(grupos, opts = {}) {
  const { onProgresso = () => {}, returnBlob = false } = opts;

  const gruposComFotos = grupos.filter((g) => g.atividades.some((a) => a.fotos.length > 0));
  if (gruposComFotos.length === 0) return null;

  const fotosParaPDF = [];
  for (const grupo of gruposComFotos) {
    for (const item of grupo.atividades) {
      for (const f of item.fotos) {
        fotosParaPDF.push({
          ...f,
          tituloAtividade: item.atividade.titulo,
          dataAtividade: formatDateBR(item.atividade.data_realizacao || item.atividade.data_inicio),
          museuKey: grupo.museuKey,
          equipe: grupo.equipe,
        });
      }
    }
  }

  const pageW = 210, pageH = 297, margin = 15;
  const cols = 2;
  const gapH = 6, gapV = 6;
  const footerH = 12;
  const titleBarH = 10;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const periodoLabel = 'Consolidado';
  const abrevGeral = 'Museus Centro';

  // ── CAPA ──
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, pageW, pageH, 'F');
  const timbreCapaH = drawTimbreViaduto(doc, pageW, margin, true);
  const capaY0 = timbreCapaH + 18;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setCharSpace(1.5);
  doc.text('VIADUTO DAS ARTES  ·  PROJETO MUSEUS CENTRO', pageW / 2, capaY0, { align: 'center' });
  doc.setCharSpace(0);

  doc.setFontSize(36);
  doc.text('Relatório Executivo', pageW / 2, capaY0 + 50, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text('Atividades e Fotos por Museu e Equipe', pageW / 2, capaY0 + 65, { align: 'center', maxWidth: 170 });

  doc.setFontSize(11);
  doc.setTextColor(160, 160, 160);
  doc.text('Consolidado Geral', pageW / 2, capaY0 + 85, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 160, 220);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, capaY0 + 100, { align: 'center' });

  // Pré-carrega imagens
  onProgresso(18, `Carregando ${fotosParaPDF.length} imagens...`);
  const imagens = [];
  for (let i = 0; i < fotosParaPDF.length; i++) {
    if (i > 0 && i % 3 === 0) {
      onProgresso(18 + Math.round((i / fotosParaPDF.length) * 40), `Carregando imagens · ${i}/${fotosParaPDF.length}...`);
      await tick();
    }
    imagens.push(await fetchPhotoData(fotosParaPDF[i].fileUrl, 180, 180));
  }
  const carregadas = imagens.filter(Boolean).length;
  if (carregadas === 0) return null;

  const imagemPorUrl = new Map(fotosParaPDF.map((f, i) => [f.fileUrl, imagens[i]]));

  // Atualiza capa com contagem
  doc.setTextColor(150, 205, 255);
  doc.text(`${carregadas} fotografias em ${gruposComFotos.length} grupo(s) museu/equipe`, pageW / 2, capaY0 + 110, { align: 'center' });

  // ── PÁGINAS DE FOTOS ──
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  const contentTop = margin + 2;
  const contentBottom = pageH - footerH - 5;
  const contentW = pageW - margin * 2;
  const usableH = contentBottom - contentTop;
  const cellW = (contentW - (cols - 1) * gapH) / cols;
  const legendaH = 14;
  const gridH = usableH - titleBarH - gapV;
  const cellH = (gridH - gapV) / 2;
  const slotH = cellH - legendaH;

  let paginaAtual = 2;
  let cursorY = contentTop;
  let slotsNaLinha = 0;
  let paginaIniciada = true;
  let museuAtual = '';
  let equipeAtual = '';

  function desenharRodape() {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(170, 170, 170);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.text(`Viaduto das Artes · Projeto Museus Centro`, margin, pageH - 5);
    doc.text(`Consolidado · p. ${paginaAtual}`, pageW - margin, pageH - 5, { align: 'right' });
  }
  function novaPagina() {
    if (paginaIniciada) desenharRodape();
    doc.addPage();
    paginaAtual++;
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');
    cursorY = contentTop;
    slotsNaLinha = 0;
    paginaIniciada = true;
  }

  let fotoIdx = 0;
  for (const grupo of gruposComFotos) {
    const museuLabel = SECTION_LABELS[grupo.museuKey] || grupo.museuKey;
    const equipeLabel = EQUIPE_LABELS[grupo.equipe] || grupo.equipe || 'Sem equipe';

    // Cabeçalho de museu/equipe
    if (cursorY + titleBarH + gapV + cellH > contentBottom) novaPagina();
    if (slotsNaLinha === 1) { cursorY += cellH + gapV; slotsNaLinha = 0; }

    doc.setFillColor(240, 240, 240);
    doc.rect(margin, cursorY, contentW, titleBarH, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, cursorY + titleBarH, margin + contentW, cursorY + titleBarH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    const tituloGrupo = `${SECTION_ABREV[grupo.museuKey] || grupo.museuKey} · ${equipeLabel}`;
    doc.text(tituloGrupo, margin + 3, cursorY + 6.5);
    const totalAtvs = grupo.atividades.length;
    const totalFotos = grupo.atividades.reduce((s, a) => s + a.fotos.length, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`${totalAtvs} atividade(s) · ${totalFotos} foto(s)`, pageW - margin - 3, cursorY + 6.5, { align: 'right' });
    cursorY += titleBarH + gapV;

    for (const item of grupo.atividades) {
      const atv = item.atividade;
      const tituloAtv = atv.titulo || 'Atividade';
      const dataAtv = formatDateBR(atv.data_realizacao || atv.data_inicio);

      // Subtítulo da atividade
      if (cursorY + 6 + gapV + cellH > contentBottom) novaPagina();
      if (slotsNaLinha === 1) { cursorY += cellH + gapV; slotsNaLinha = 0; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      const tituloTrunc = doc.splitTextToSize(tituloAtv, contentW - 25)[0] || tituloAtv;
      doc.text(tituloTrunc, margin + 2, cursorY + 4);
      if (dataAtv) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(dataAtv, pageW - margin - 2, cursorY + 4, { align: 'right' });
      }
      cursorY += 6 + gapV;

      for (const foto of item.fotos) {
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

        // Legenda
        const legCx = slotX + cellW / 2;
        let legY = slotY + slotH + 3.5;
        const legendaTexto = foto.legenda || tituloAtv || 'Registro fotográfico';

        doc.setCharSpace(0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 30, 30);
        const legendaTrunc = doc.splitTextToSize(legendaTexto, cellW - 4)[0] || '';
        doc.text(legendaTrunc, legCx, legY, { align: 'center' });
        legY += 3.8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(110, 110, 110);
        doc.text(SECTION_ABREV[grupo.museuKey] || grupo.museuKey, legCx, legY, { align: 'center' });
        legY += 3.2;
        doc.setTextColor(150, 150, 150);
        doc.text(dataAtv || periodoLabel, legCx, legY, { align: 'center' });

        slotsNaLinha++;
        fotoIdx++;
        onProgresso(60 + Math.round((fotoIdx / carregadas) * 35), `Montando PDF · foto ${fotoIdx}/${carregadas}...`);
        if (slotsNaLinha >= cols) { cursorY += cellH + gapV; slotsNaLinha = 0; }
      }
    }
  }
  desenharRodape();

  const filename = `RelatorioExecutivo_Consolidado_${new Date().toISOString().slice(0, 10)}.pdf`;
  onProgresso(100, 'Concluído!');

  if (returnBlob) {
    return { blob: doc.output('blob'), filename, totalFotos: carregadas, totalGrupos: gruposComFotos.length };
  }
  doc.save(filename);
  return { filename, totalFotos: carregadas, totalGrupos: gruposComFotos.length };
}