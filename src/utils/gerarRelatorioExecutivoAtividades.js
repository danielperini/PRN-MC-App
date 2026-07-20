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
 * Extrai a chave de contexto de uma ReportPhoto a partir do campo contexto_ia.
 * Tenta parsear como JSON e extrair pasta_origem ou atividade_nome.
 * Se for string, usa diretamente. Se vazio, retorna null.
 */
function extrairContexto(rp) {
  const raw = rp?.contexto_ia;
  if (!raw) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed.pasta_origem || parsed.atividade_nome || parsed.titulo || null;
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }
  if (typeof raw === 'object') {
    return raw.pasta_origem || raw.atividade_nome || raw.titulo || null;
  }
  return null;
}

/**
 * Busca ReportPhotos diretamente (sem depender de Activity) para um museu+mês+ano.
 * Fonte primária: ReportPhoto.filter({ museu, mes_referencia }).
 * Fonte secundária (fallback): Activity.fotos[] de atividades vinculadas a Report.filter({ museu, mes_referencia, ano }).
 * Deduplica por file_url, ordena por created_date ASC, agrupa por contexto_ia.
 * Retorna { grupos, totalFotos } onde grupos = [{ chave, fotos: [{ fileUrl, legenda, ... }] }] (máx 8 fotos por grupo).
 */
export async function buscarFotosPorContexto(museuKey, mes, ano, opts = {}) {
  const { onProgresso = () => {} } = opts;

  onProgresso(5, 'Buscando fotos do museu/período...');

  // Fonte primária: ReportPhoto direto
  let reportPhotos = [];
  try {
    reportPhotos = await base44.entities.ReportPhoto.filter({ museu: museuKey, mes_referencia: mes }) || [];
  } catch { reportPhotos = []; }

  onProgresso(30, `${reportPhotos.length} fotos encontradas em ReportPhoto...`);

  // Fonte secundária (fallback): Activity.fotos[] de relatórios do museu/período
  let activityPhotos = [];
  try {
    onProgresso(35, 'Buscando atividades vinculadas a relatórios...');
    const reports = await base44.entities.Report.filter({ museu: museuKey, mes_referencia: mes, ano }) || [];
    const reportIds = (reports || []).map((r) => r.id).filter(Boolean);
    if (reportIds.length > 0) {
      const batchSize = 5;
      let todasAtividades = [];
      for (let i = 0; i < reportIds.length; i += batchSize) {
        const lote = reportIds.slice(i, i + batchSize);
        const resultados = await Promise.all(
          lote.map((rid) => base44.entities.Activity.filter({ report_id: rid }).catch(() => []))
        );
        resultados.forEach((acts) => { todasAtividades = todasAtividades.concat(acts || []); });
      }
      todasAtividades.forEach((act) => {
        const actFotos = Array.isArray(act.fotos) ? act.fotos : [];
        actFotos.forEach((foto) => {
          if (!foto?.file_url) return;
          activityPhotos.push({
            file_url: foto.file_url,
            legenda: foto.legenda || foto.caption || act.titulo || '',
            caption: foto.caption || '',
            contexto_ia: foto.contexto_ia || act.titulo || '',
            mes_referencia: mes,
            ano,
            museu: museuKey,
            created_date: act.created_date || act.updated_date || null,
          });
        });
      });
    }
  } catch { activityPhotos = []; }

  onProgresso(55, `${activityPhotos.length} fotos em atividades...`);

  // Unir fontes e deduplicar por file_url
  const vistos = new Set();
  const todas = [];
  for (const rp of [...reportPhotos, ...activityPhotos]) {
    const url = rp.file_url || rp.fileUrl;
    if (!url || vistos.has(url)) continue;
    vistos.add(url);
    todas.push({
      fileUrl: url,
      legenda: rp.legenda || rp.caption || '',
      contexto: extrairContexto(rp) || null,
      created_date: rp.created_date || rp.updated_date || null,
    });
  }

  if (todas.length === 0) return { grupos: [], totalFotos: 0 };

  // Ordenar por created_date ASC
  todas.sort((a, b) => {
    const da = new Date(a.created_date || 0).getTime();
    const db = new Date(b.created_date || 0).getTime();
    return da - db;
  });

  // Agrupar por contexto_ia (null → "Registro do Período")
  const gruposMap = new Map();
  for (const foto of todas) {
    const chave = foto.contexto || 'Registro do Período';
    if (!gruposMap.has(chave)) gruposMap.set(chave, []);
    gruposMap.get(chave).push(foto);
  }

  // Limitar 8 fotos por grupo
  const grupos = Array.from(gruposMap.entries()).map(([chave, fotos]) => ({
    chave,
    fotos: fotos.slice(0, 8),
  }));

  onProgresso(70, `${grupos.length} grupo(s) formado(s)...`);

  return { grupos, totalFotos: todas.length };
}

/**
 * Gera PDF simplificado a partir de grupos de fotos por contexto.
 * Capa escura institucional; páginas internas brancas em grade 2×2 (4 fotos/página);
 * separador visual entre grupos; legenda centralizada em 3 linhas; rodapé institucional.
 * Retorna { blob, filename, totalFotos, totalGrupos } se returnBlob=true.
 */
export async function gerarPDFFotosSimplificado(grupos, museuKey, mes, ano, opts = {}) {
  const { onProgresso = () => {}, returnBlob = false } = opts;

  const abrev = SECTION_ABREV[museuKey] || museuKey;
  const label = SECTION_LABELS[museuKey] || museuKey;

  const gruposComFotos = (grupos || []).filter((g) => g.fotos.length > 0);
  if (gruposComFotos.length === 0) return null;

  const fotosParaPDF = [];
  for (const g of gruposComFotos) {
    for (const f of g.fotos) {
      fotosParaPDF.push({
        ...f,
        grupoChave: g.chave,
        museuAtividade: museuKey,
      });
    }
  }

  // Legendas IA — apenas onde isLegendaGenerica(legenda) === true
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
          photoUrl: f.fileUrl,
        }))
      );
      resultados.forEach((r, idx) => {
        const f = lote[idx];
        if (r.status === 'fulfilled' && r.value?.data?.caption) f.legenda = r.value.data.caption;
      });
    }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  const periodoLabel = `${mes} de ${ano}`;

  const pageW = 210, pageH = 297, margin = 15;
  const cols = 2;
  const gapH = 6, gapV = 6;
  const footerH = 12;
  const separadorH = 8;

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

  doc.setFontSize(42);
  doc.text(abrev, pageW / 2, capaY0 + 55, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text(label, pageW / 2, capaY0 + 70, { align: 'center', maxWidth: 170 });

  doc.setFontSize(11);
  doc.setTextColor(160, 160, 160);
  doc.text('Relatório de Atividades', pageW / 2, capaY0 + 90, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(220, 220, 220);
  doc.text(periodoLabel, pageW / 2, capaY0 + 104, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 160, 220);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, capaY0 + 118, { align: 'center' });

  // ── PRIMEIRA PÁGINA DE FOTOS ──
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  const contentTop = margin + 2;
  const contentBottom = pageH - footerH - 5;
  const contentW = pageW - margin * 2;
  const usableH = contentBottom - contentTop;
  const cellW = (contentW - (cols - 1) * gapH) / cols;
  const legendaH = 14;
  const gridH = usableH - separadorH - gapV;
  const cellH = (gridH - gapV) / 2;
  const slotH = cellH - legendaH;

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

  const imagemPorUrl = new Map(fotosParaPDF.map((f, i) => [f.fileUrl, imagens[i]]));

  // Atualiza capa com contagem
  doc.setTextColor(150, 205, 255);
  doc.text(`${carregadas} fotografias em ${gruposComFotos.length} grupo(s)`, pageW / 2, capaY0 + 125, { align: 'center' });

  onProgresso(60, `Montando PDF · ${carregadas} foto(s)...`);

  let paginaAtual = 2;
  let cursorY = contentTop;
  let slotsNaLinha = 0;
  let paginaIniciada = true;

  function desenharRodape() {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(170, 170, 170);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.text(`Viaduto das Artes · Projeto Museus Centro`, margin, pageH - 5);
    doc.text(`${abrev} · ${periodoLabel} · p. ${paginaAtual}`, pageW - margin, pageH - 5, { align: 'right' });
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
  for (let gIdx = 0; gIdx < gruposComFotos.length; gIdx++) {
    const grupo = gruposComFotos[gIdx];
    const fotosValidas = grupo.fotos.filter((f) => imagemPorUrl.get(f.fileUrl));
    if (fotosValidas.length === 0) continue;

    // Separador visual entre grupos
    if (fotoIdx > 0) {
      if (cursorY + separadorH + gapV > contentBottom) novaPagina();
      else cursorY += gapV;
    }

    // Linha fina + rótulo do grupo
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, cursorY, pageW - margin, cursorY);
    cursorY += 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    const grupoTrunc = doc.splitTextToSize(grupo.chave, contentW - 10)[0] || grupo.chave;
    doc.text(grupoTrunc, margin, cursorY + 4);
    cursorY += separadorH;

    for (const foto of fotosValidas) {
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

      // Legenda em 3 linhas: texto salvo/IA (bold 8pt), museu (cinza 7pt), data (cinza claro 7pt)
      const legCx = slotX + cellW / 2;
      let legY = slotY + slotH + 3.5;

      doc.setCharSpace(0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
      const legendaTexto = foto.legenda || grupo.chave || 'Registro fotográfico';
      const legendaTrunc = doc.splitTextToSize(legendaTexto, cellW - 4)[0] || '';
      doc.text(legendaTrunc, legCx, legY, { align: 'center' });
      legY += 3.8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.text(abrev, legCx, legY, { align: 'center' });
      legY += 3.2;

      doc.setTextColor(150, 150, 150);
      doc.text(periodoLabel, legCx, legY, { align: 'center' });

      slotsNaLinha++;
      fotoIdx++;
      onProgresso(60 + Math.round((fotoIdx / carregadas) * 35), `Montando PDF · foto ${fotoIdx}/${carregadas}...`);
      if (slotsNaLinha >= cols) { cursorY += cellH + gapV; slotsNaLinha = 0; }
    }
  }
  desenharRodape();

  const filename = `RelatorioExecutivo_${abrev}_${mes}_${ano}.pdf`;
  onProgresso(100, 'Concluído!');

  if (returnBlob) {
    return { blob: doc.output('blob'), filename, totalFotos: carregadas, totalGrupos: gruposComFotos.length };
  }
  doc.save(filename);
  return { filename, totalFotos: carregadas, totalGrupos: gruposComFotos.length };
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

  // Período para uso no rodapé e capa
  const periodoLabel = Array.isArray(mes) && mes.length > 1
    ? `${mes[0]}–${mes[mes.length - 1]} de ${ano}`
    : `${Array.isArray(mes) ? mes[0] : mes} de ${ano}`;

  // Sem timbre nas páginas internas — definir margens fixas
  const contentTop = margin + 2;
  const contentBottom = pageH - footerH - 5;
  const contentW = pageW - margin * 2;

  // ── CAPA ──────────────────────────────────────────────────────────────
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Timbre na capa apenas
  const timbreCapaH = drawTimbreViaduto(doc, pageW, margin, true);
  const capaY0 = timbreCapaH + 18;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setCharSpace(1.5);
  doc.text('VIADUTO DAS ARTES  ·  PROJETO MUSEUS CENTRO', pageW / 2, capaY0, { align: 'center' });
  doc.setCharSpace(0);

  doc.setFontSize(42);
  doc.setFont('helvetica', 'bold');
  doc.text(abrev, pageW / 2, capaY0 + 55, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text(label, pageW / 2, capaY0 + 70, { align: 'center', maxWidth: 170 });

  doc.setFontSize(11);
  doc.setTextColor(160, 160, 160);
  doc.text('Relatório de Atividades', pageW / 2, capaY0 + 90, { align: 'center' });

  // Linha de destaque do período
  doc.setFontSize(12);
  doc.setTextColor(220, 220, 220);
  doc.text(periodoLabel, pageW / 2, capaY0 + 104, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 160, 220);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, capaY0 + 118, { align: 'center' });

  // ── SEM ÍNDICE — Primeira página de fotos diretamente ─────────────────
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  const usableH = contentBottom - contentTop;
  const cellW = (contentW - (cols - 1) * gapH) / cols;
  // Sem timbre: mais espaço vertical disponível — acomodar 2 linhas de foto + legenda
  const legendaH = 14; // altura reservada para legenda: 3 linhas × ~4mm + margem
  const gridH = usableH - titleBarH - gapV;
  const cellH = (gridH - gapV) / 2;
  const slotH = cellH - legendaH;

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

  let paginaAtual = 2;
  let cursorY = contentTop;
  let slotsNaLinha = 0;
  let paginaIniciada = true;

  function desenharPaginaBranca() {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');
  }
  function desenharRodape() {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(170, 170, 170);
    // Linha separadora discreta
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.text(`Viaduto das Artes · Projeto Museus Centro`, margin, pageH - 5);
    doc.text(`${abrev} · ${periodoLabel} · p. ${paginaAtual}`, pageW - margin, pageH - 5, { align: 'right' });
  }
  function novaPagina() {
    if (paginaIniciada) desenharRodape();
    doc.addPage();
    paginaAtual++;
    desenharPaginaBranca();
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

    // Normalizar título: remover duplicações e caminhos de pasta
    const tituloNorm = (() => {
      let t = atv.titulo || 'Atividade';
      // Remover prefixo de caminho tipo "_Material Bruto/2026-MHAB/..."
      t = t.replace(/^_?Material\s*Bruto\/[^\s]+\/?\s*/i, '');
      // Remover padrão YYYY-MES-MUSEU do início
      t = t.replace(/^\d{4}-[A-Z]{3,5}\//, '');
      // Se o título contém duplicação (a primeira metade repete), pegar só a primeira ocorrência
      const mid = Math.floor(t.length / 2);
      if (t.length > 20 && t.slice(0, mid).trim() === t.slice(mid).trim()) {
        t = t.slice(0, mid).trim();
      }
      // Também checar duplicação com ' - Daniel Moreira' repetido
      const dupMatch = t.match(/^(.+?)\s+\1/);
      if (dupMatch) t = dupMatch[1];
      // Remover sufixo " - Daniel Moreira OFICINA/ENCONTRO/etc" duplicado
      t = t.replace(/\s+[-–]\s*Daniel Moreira\s+(MUSEU CRIATIVO|OFICINA|ENCONTRO|LANCAMENTO|TRATAMENTO|FOTOS?)[^\n]*/gi, '');
      t = t.replace(/\s+[-–]\s*Daniel Moreira\s*$/i, '');
      return t.trim();
    })();

    // Barra de título da atividade
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, cursorY, contentW, titleBarH, 'F');
    doc.setDrawColor(210, 210, 210);
    doc.line(margin, cursorY + titleBarH, margin + contentW, cursorY + titleBarH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    const tituloTrunc = doc.splitTextToSize(tituloNorm, contentW - 30)[0] || tituloNorm;
    doc.text(tituloTrunc, margin + 3, cursorY + 6.5);
    if (atv.data) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      doc.text(atv.data, pageW - margin - 3, cursorY + 6.5, { align: 'right' });
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

      // Legenda: usar título normalizado da atividade
      const tituloLegenda = (() => {
        let t = foto.tituloAtividade || atv.titulo || 'Registro fotográfico';
        t = t.replace(/^_?Material\s*Bruto\/[^\s]+\/?\s*/i, '');
        const dupMatch = t.match(/^(.+?)\s+\1/);
        if (dupMatch) t = dupMatch[1];
        t = t.replace(/\s+[-–]\s*Daniel Moreira\s*$/i, '');
        return t.trim();
      })();
      const museuLeg = (foto.museuAtividade || atv.museu || abrev || '').replace(/^MHAB.*$/i, 'MHAB');
      const dataLeg = foto.dataAtividade || atv.data || '';

      const legCx = slotX + cellW / 2;
      let legY = slotY + slotH + 3.5;

      doc.setCharSpace(0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 30, 30);
      const tituloLegTrunc = doc.splitTextToSize(tituloLegenda, cellW - 4)[0] || '';
      doc.text(tituloLegTrunc, legCx, legY, { align: 'center' });
      legY += 3.8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      if (museuLeg) {
        doc.text(museuLeg, legCx, legY, { align: 'center' });
        legY += 3.2;
      }
      if (dataLeg) {
        doc.setTextColor(150, 150, 150);
        doc.text(dataLeg, legCx, legY, { align: 'center' });
      }

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