/**
 * Gera uma amostra do Relatório Executivo de Fotos usando fotos do ReportPhoto.
 * Útil para validar layout (4 fotos/página, timbre institucional, legendas IA)
 * quando a entidade Activity está vazia ou sem vínculos.
 *
 * Uso: import { gerarAmostraRelatorioExecutivo } from '@/utils/exportarAmostraRelatorioExecutivo';
 *      gerarAmostraRelatorioExecutivo('MHAB', 'Abril', 2026);
 *      gerarAmostraRelatorioExecutivo('MHAB', ['Março', 'Abril'], 2026);
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
  NOTURNO: '🌙 Noturno nos Museus',
};
const SECTION_ABREV = {
  MHAB: 'MHAB', MIS: 'MIS', MUMO: 'MUMO', MAP: 'MAP',
  CasaKubitschek: 'Casa Kubitschek', CasaDoBalile: 'Casa do Baíle',
  NOTURNO: 'Noturno nos Museus',
};

const NOTURNO_MUSEUS = ['MAP', 'CasaKubitschek', 'CasaDoBalile', 'NOTURNO'];

/**
 * Normaliza o nome da pasta de origem, removendo prefixo data/museu (YYYY-MM-MUSEU-)
 * e ocorrências no meio da string. Exportada para reutilização.
 * @param {string} pastaOrigem
 * @returns {string}
 */
export function normalizarNomePasta(pastaOrigem) {
  if (!pastaOrigem) return '';
  let nome = String(pastaOrigem).trim();
  // Remove prefixo YYYY-MM-MUSEU- do início
  nome = nome.replace(/^\d{4}-\d{2}-[A-Z]+-\s*/i, '');
  // Remove ocorrências de YYYY-MM-MUSEU- no meio da string
  nome = nome.replace(/\s*\d{4}-\d{2}-[A-Z]+-\s*/g, ' ');
  nome = nome.replace(/\s{2,}/g, ' ').trim();
  if (nome) nome = nome.charAt(0).toUpperCase() + nome.slice(1);
  return nome;
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

function formatDateBR(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
}

/**
 * Extrai metadados do contexto_ia (pasta_origem, data_foto, evento)
 */
function parseContextoIA(rp) {
  if (!rp.contexto_ia) return { pasta: '', dataFoto: '', evento: '' };
  try {
    const obj = typeof rp.contexto_ia === 'string' ? JSON.parse(rp.contexto_ia) : rp.contexto_ia;
    return {
      pasta: String(obj?.pasta_origem || obj?.pasta || ''),
      dataFoto: String(obj?.data_foto || ''),
      evento: String(obj?.evento || ''),
    };
  } catch {
    return { pasta: '', dataFoto: '', evento: '' };
  }
}

function nomeFromFile(rp) {
  const fn = String(rp.file_name || rp.caption || '');
  return fn.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function dataFotoToBR(dataFoto) {
  if (!dataFoto) return '';
  const m = String(dataFoto).match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return '';
}

/**
 * @param {string} museuKey - chave do museu (MHAB, MIS, MUMO, NOTURNO, etc.)
 * @param {string|string[]} mesOuMeses - mês por extenso ou array de meses
 * @param {number} ano
 * @param {object} opts - { maxFotosPorAtividade, gerarLegendasIA, returnBlob, onProgresso }
 */
export async function gerarAmostraRelatorioExecutivo(museuKey, mesOuMeses, ano, opts = {}) {
  const {
    maxFotosPorAtividade = 4,
    gerarLegendasIA = true,
    returnBlob = false,
    onProgresso = () => {},
  } = opts;

  const meses = Array.isArray(mesOuMeses)
    ? mesOuMeses
    : (mesOuMeses ? [mesOuMeses] : []);

  if (meses.length === 0) {
    throw new Error('Nenhum mês selecionado.');
  }

  const abrev = SECTION_ABREV[museuKey] || museuKey;
  const label = SECTION_LABELS[museuKey] || museuKey;
  const isNoturno = museuKey === 'NOTURNO';

  // Label do intervalo de meses para capa
  const mesesLabel = meses.length === 1
    ? `${meses[0]} de ${ano}`
    : `${meses[0]}–${meses[meses.length - 1]} de ${ano}`;

  // ── Busca fotos ──
  onProgresso(2, 'Buscando fotos do período...');
  let fotos = [];
  try {
    if (isNoturno) {
      // Busca em todos os museus noturnos
      for (const m of NOTURNO_MUSEUS) {
        const fotosM = await base44.entities.ReportPhoto.filter({ museu: m }) || [];
        fotos.push(...fotosM);
      }
      // Filtra por contexto_ia.evento contendo 'Noturno' quando disponível
      fotos = fotos.filter((f) => {
        const ctx = parseContextoIA(f);
        if (ctx.evento) return ctx.evento.toLowerCase().includes('noturno');
        return true; // Inclui se não houver campo evento
      });
    } else {
      fotos = await base44.entities.ReportPhoto.filter({ museu: museuKey }) || [];
    }
    // Filtra por meses selecionados e ano
    fotos = fotos.filter((f) => meses.includes(f.mes_referencia) && f.ano === ano);
  } catch (e) {
    console.error('Erro ao buscar ReportPhoto:', e);
  }

  if (fotos.length === 0) {
    throw new Error(`Nenhuma foto encontrada para ${abrev} em ${mesesLabel}.`);
  }

  // Busca dados reais das atividades vinculadas
  const activityIds = [...new Set(fotos.map((f) => f.activity_id).filter(Boolean))];
  const activityMap = new Map();
  if (activityIds.length > 0) {
    for (let i = 0; i < activityIds.length; i += 50) {
      const loteIds = activityIds.slice(i, i + 50);
      const acts = await Promise.all(
        loteIds.map((aid) => base44.entities.Activity.get(aid).catch(() => null))
      );
      acts.forEach((a) => { if (a) activityMap.set(a.id, a); });
    }
  }

  // Agrupa fotos por pasta_origem (ou fallback file_name)
  const gruposMap = new Map();
  for (const rp of fotos) {
    const ctx = parseContextoIA(rp);
    const chave = ctx.pasta || nomeFromFile(rp) || `SemNome_${rp.id || Math.random()}`;
    if (!gruposMap.has(chave)) gruposMap.set(chave, { chave, fotos: [], mes: rp.mes_referencia || '' });
    gruposMap.get(chave).fotos.push({ rp, ctx });
  }

  // Constrói atividades virtuais a partir dos grupos
  let atividadesVirtuais = [];
  for (const grupo of gruposMap.values()) {
    const primeira = grupo.fotos[0];
    const atvReal = grupo.fotos.map((f) => f.rp.activity_id).find(Boolean);
    const atvData = atvReal ? activityMap.get(atvReal) : null;

    const tituloReal = atvData?.titulo || normalizarNomePasta(primeira.ctx.pasta) || nomeFromFile(primeira.rp);
    const dataReal = atvData
      ? formatDateBR(atvData.data_realizacao || atvData.data_inicio)
      : dataFotoToBR(primeira.ctx.dataFoto) || formatDateBR(primeira.rp.created_date);
    const museuReal = atvData?.museu || (isNoturno ? 'Noturno nos Museus' : museuKey);
    const mesGrupo = grupo.mes || primeira.rp.mes_referencia || (meses.length === 1 ? meses[0] : '');

    const fotosLimitadas = grupo.fotos.slice(0, maxFotosPorAtividade);
    atividadesVirtuais.push({
      titulo: tituloReal,
      data: dataReal,
      museu: museuReal,
      mes: mesGrupo,
      fotos: fotosLimitadas.map((f) => ({
        fileUrl: f.rp.file_url,
        legenda: f.rp.legenda || f.rp.caption || tituloReal,
        activityId: f.rp.activity_id,
        reportId: f.rp.report_id,
        tituloAtividade: tituloReal,
        dataAtividade: dataReal,
        museuAtividade: museuReal,
      })),
    });
  }

  // Ordena por data
  atividadesVirtuais.sort((a, b) => {
    const da = new Date(a.data || 0).getTime() || 0;
    const db = new Date(b.data || 0).getTime() || 0;
    return da - db;
  });

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
      fotosParaPDF.push({ ...f, tituloAtividade: item.titulo, dataAtividade: item.data, museuAtividade: item.museu, mes: item.mes });
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
  const isCapaEscura = isNoturno;
  doc.setFillColor(isCapaEscura ? 10 : 20, isCapaEscura ? 10 : 20, isCapaEscura ? 10 : 20);
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
  if (isNoturno) {
    doc.text('🌙 Noturno nos Museus', pageW / 2, capaY0 + 85, { align: 'center' });
  } else {
    doc.text('Relatório de Atividades (Amostra)', pageW / 2, capaY0 + 85, { align: 'center' });
  }
  doc.setFontSize(10);
  doc.text(mesesLabel, pageW / 2, capaY0 + 98, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(150, 205, 255);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, capaY0 + 115, { align: 'center' });

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
  const slotH = cellH - 14; // 14mm reservados para 3 linhas de legenda + margem

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
  doc.text(`${carregadas} fotografias em ${atividadesVirtuais.length} atividades`, pageW / 2, capaY0 + 125, { align: 'center' });

  // ── Páginas de fotos ──
  const fotosComImg = fotosParaPDF.filter((_, i) => imagens[i]);
  const imagemPorUrl = new Map(fotosParaPDF.map((f, i) => [f.fileUrl, imagens[i]]));

  // ── Página de índice ──
  doc.addPage();
  let indexPageCount = 1;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  drawTimbreViaduto(doc, pageW, margin);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text('Índice de Atividades', pageW / 2, contentTop, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`${atividadesVirtuais.length} atividade(s) · ${carregadas} foto(s) · ${mesesLabel}`, pageW / 2, contentTop + 6, { align: 'center' });

  let idxY = contentTop + 16;
  for (let i = 0; i < atividadesVirtuais.length; i++) {
    const atvItem = atividadesVirtuais[i];
    const tituloAtv = atvItem.titulo || `Atividade ${i + 1}`;
    const dataAtv = atvItem.data;
    const mesAtv = atvItem.mes || '';
    const numFotos = atvItem.fotos.filter((f) => imagemPorUrl.get(f.fileUrl)).length;

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
    const meta = `${mesAtv ? mesAtv + ' · ' : ''}${dataAtv ? dataAtv + ' · ' : ''}${numFotos} foto(s)`;
    doc.text(meta, pageW - margin, idxY, { align: 'right' });
    idxY += 7;
  }

  // Primeira página de fotos
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  drawTimbreViaduto(doc, pageW, margin);

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
    doc.text(`${abrev} · ${mesesLabel}`, margin, pageH - 5);
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
      atvComFotos.push({ titulo: item.titulo, data: item.data, museu: item.museu, mes: item.mes, fotos: validas });
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
    doc.setDrawColor(224, 224, 224);
    doc.rect(margin, cursorY, contentW, titleBarH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    // Trunca título a 1 linha com ellipsis
    const tituloBarra = doc.splitTextToSize(atv.titulo, contentW - 25)[0] || '';
    const tituloTruncado = tituloBarra.length < atv.titulo.length ? tituloBarra.replace(/.{3}$/, '...') : tituloBarra;
    doc.text(tituloTruncado, margin + 3, cursorY + 7);
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

      // Fundo letterbox #F5F5F5 — apenas o slot de foto (não a área de legenda)
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

      // Legenda estruturada (3 linhas, centralizada, 3mm entre linhas)
      const legCx = slotX + cellW / 2;
      let legY = slotY + slotH + 3;
      // Linha 1: título da atividade (bold, 8pt, #141414)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      const tituloLeg = doc.splitTextToSize(foto.tituloAtividade || atv.titulo || 'Registro fotográfico', cellW - 2)[0] || '';
      doc.text(tituloLeg, legCx, legY, { align: 'center', maxWidth: cellW - 2 });
      legY += 3;
      // Linha 2: museu (normal, 7.5pt, #666666)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(102, 102, 102);
      doc.text(foto.museuAtividade || atv.museu || abrev, legCx, legY, { align: 'center' });
      legY += 3;
      // Linha 3: data (normal, 7pt, #999999)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(153, 153, 153);
      doc.text(foto.dataAtividade || atv.data || '', legCx, legY, { align: 'center' });

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

  const mesesSlug = meses.length === 1 ? meses[0] : `${meses[0]}-${meses[meses.length - 1]}`;
  const filename = returnBlob
    ? `RelatorioExecutivo_${abrev}_${mesesSlug}_${ano}.pdf`
    : `Amostra_RelatorioExecutivo_${abrev}_${mesesSlug}_${ano}_${new Date().toISOString().slice(0, 10)}.pdf`;

  onProgresso(100, 'Concluído!');
  if (returnBlob) {
    return { blob: doc.output('blob'), filename, totalFotos: carregadas, totalAtividades: atvComFotos.length };
  }
  doc.save(filename);
  return { filename, totalFotos: carregadas, totalAtividades: atvComFotos.length };
}