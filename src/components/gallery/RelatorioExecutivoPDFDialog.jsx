import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileDown, BookImage, Calendar, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import { drawTimbreViaduto } from './timbreViadutoPDF';
import { isLegendaGenerica } from './deduplicarFotosGaleria';

const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile'];
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

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MAX_FOTOS = 5;

// Palavras-chave de atividades físicas
const KEYWORDS_FISICA = [
  'oficina', 'apresentação', 'apresentacao', 'espetáculo', 'espetaculo',
  'visita', 'exposição', 'exposicao', 'noturno', 'evento', 'formação',
  'formacao', 'mediação', 'mediacao', 'roda de conversa', 'show',
  'concerto', 'intervenção', 'intervencao', 'coral', 'bate-papo',
  'sarau', 'abertura', 'vernissage', 'vitrine', 'demonstração',
  'demonstracao', 'encontro', 'jornada', 'festa', 'celebração',
  'celebracao', 'comemoração', 'comemoracao',
];
const KEYWORDS_EXCLUIR = [
  'reunião interna', 'reuniao interna', 'planejamento', 'relatório',
  'relatorio', 'gestão', 'gestao', 'post', 'texto', 'revisão', 'revisao',
  'edição', 'edicao', 'briefing', 'alinhamento',
];

function isAtividadeFisica(act) {
  const titulo = String(act.titulo || '').toLowerCase();
  const excluida = KEYWORDS_EXCLUIR.some((k) => titulo.includes(k));
  if (excluida) return false;
  if (act.classificacao === 'META' || act.classificacao === 'EXTRA') {
    if (KEYWORDS_FISICA.some((k) => titulo.includes(k))) return true;
  }
  const produtos = Array.isArray(act.produtos_entregues) ? act.produtos_entregues : [];
  const produtosFisicos = ['Cobertura Fotográfica', 'Cobertura de Vídeo', 'Expografia', 'Catálogo', 'Cartaz', 'Roda de Conversa', 'Apresentação de Contas'];
  return produtos.some((p) => produtosFisicos.includes(p));
}

function normalizarTexto(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function matchMuseu(reportMuseu, sectionKey) {
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

async function atualizarProgresso(setProgresso, texto, setPct, pct) {
  setProgresso(texto);
  if (typeof pct === 'number') setPct(pct);
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => setTimeout(r, 0));
}

function formatDateBR(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
}

export default function RelatorioExecutivoPDFDialog({ open, onClose }) {
  const [museu, setMuseu] = useState('');
  const [mes, setMes] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [pct, setPct] = useState(0);
  const [atividades, setAtividades] = useState([]);
  const [fetched, setFetched] = useState(false);
  const [gerando, setGerando] = useState(false);

  const anos = useMemo(() => {
    const atual = new Date().getFullYear();
    return [atual, atual - 1, atual - 2];
  }, []);

  const buscarAtividades = useCallback(async () => {
    if (!museu || !mes) { toast.warning('Selecione museu e mês.'); return; }
    setLoading(true);
    setFetched(false);
    setAtividades([]);
    setPct(2);
    try {
      await atualizarProgresso(setProgresso, 'Buscando relatórios do período...', setPct, 5);
      const reports = await base44.entities.Report.filter({ mes_referencia: mes, ano });
      const reportsMuseu = (reports || []).filter((r) => matchMuseu(r.museu, museu));
      const reportIds = reportsMuseu.map((r) => r.id);
      if (reportIds.length === 0) {
        await atualizarProgresso(setProgresso, 'Nenhum relatório encontrado para os filtros.', setPct, 100);
        setFetched(true);
        setLoading(false);
        setProgresso('');
        return;
      }

      await atualizarProgresso(setProgresso, `Buscando atividades de ${reportIds.length} relatório(s)...`, setPct, 20);
      let todasAtividades = [];
      const batchSize = 5;
      for (let i = 0; i < reportIds.length; i += batchSize) {
        const lote = reportIds.slice(i, i + batchSize);
        const resultados = await Promise.all(
          lote.map((rid) => base44.entities.Activity.filter({ report_id: rid }).catch(() => []))
        );
        resultados.forEach((acts) => { todasAtividades = todasAtividades.concat(acts || []); });
        await atualizarProgresso(setProgresso, `Atividades · ${Math.min(i + batchSize, reportIds.length)}/${reportIds.length} relatórios...`, setPct, 20 + Math.round((i / reportIds.length) * 30));
      }

      const fisicas = todasAtividades.filter(isAtividadeFisica);
      fisicas.sort((a, b) => {
        const da = new Date(a.data_realizacao || a.data_inicio || 0).getTime();
        const db = new Date(b.data_realizacao || b.data_inicio || 0).getTime();
        return da - db;
      });

      await atualizarProgresso(setProgresso, `Buscando fotos do museu/período...`, setPct, 55);
      let poolFotos = [];
      try {
        poolFotos = await base44.entities.ReportPhoto.filter({ museu: museu }) || [];
        poolFotos = poolFotos.filter((f) => f.mes_referencia === mes);
      } catch { poolFotos = []; }

      await atualizarProgresso(setProgresso, `Montando conjuntos de fotos...`, setPct, 70);
      const atividadesComFotos = fisicas.map((act) => {
        const fotosAtividade = [];
        const vistos = new Set();

        const actFotos = Array.isArray(act.fotos) ? act.fotos : [];
        for (const f of actFotos) {
          const url = f.file_url || f.fileUrl;
          if (url && !vistos.has(url)) { fotosAtividade.push({ fileUrl: url, legenda: f.legenda || act.titulo, activityId: act.id, reportId: act.report_id }); vistos.add(url); }
          if (fotosAtividade.length >= MAX_FOTOS) break;
        }

        if (fotosAtividade.length < MAX_FOTOS && act.id) {
          for (const rp of poolFotos) {
            if (rp.activity_id === act.id) {
              const url = rp.file_url;
              if (url && !vistos.has(url)) { fotosAtividade.push({ fileUrl: url, legenda: rp.legenda || rp.caption || act.titulo, activityId: act.id, reportId: act.report_id || rp.report_id }); vistos.add(url); }
            }
            if (fotosAtividade.length >= MAX_FOTOS) break;
          }
        }

        if (fotosAtividade.length < MAX_FOTOS) {
          const tituloNorm = normalizarTexto(act.titulo);
          const palavras = tituloNorm.split(/\s+/).filter((p) => p.length > 3);
          for (const rp of poolFotos) {
            if (rp.activity_id === act.id) continue;
            const nomeNorm = normalizarTexto(rp.file_name || '');
            if (!nomeNorm) continue;
            const match = palavras.length > 0 && palavras.some((p) => nomeNorm.includes(p));
            if (match) {
              const url = rp.file_url;
              if (url && !vistos.has(url)) { fotosAtividade.push({ fileUrl: url, legenda: rp.legenda || rp.caption || act.titulo, activityId: act.id, reportId: act.report_id || rp.report_id }); vistos.add(url); }
            }
            if (fotosAtividade.length >= MAX_FOTOS) break;
          }
        }

        return { atividade: act, fotos: fotosAtividade };
      });

      setAtividades(atividadesComFotos);
      setFetched(true);
      setProgresso('');
      setPct(0);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao buscar atividades: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
      setProgresso('');
      setPct(0);
    }
  }, [museu, mes, ano]);

  const temFotos = atividades.some((a) => a.fotos.length > 0);

  async function gerarPDF() {
    if (!temFotos) return;
    setGerando(true);
    setPct(2);
    try {
      // Layout A4 retrato
      const pageW = 210, pageH = 297, margin = 15;
      const cols = 2, perPage = 4;
      const gapH = 6, gapV = 6;
      const footerH = 12;
      const titleBarH = 10;

      // ── Coleta fotos e gera legendas via IA ──
      const fotosParaPDF = [];
      const legendasIA = {};
      for (const item of atividades) {
        if (item.fotos.length === 0) continue;
        for (const f of item.fotos) {
          fotosParaPDF.push({ ...f, tituloAtividade: item.atividade.titulo, dataAtividade: formatDateBR(item.atividade.data_realizacao || item.atividade.data_inicio) });
        }
      }

      const precisamLegenda = fotosParaPDF.filter((f) => isLegendaGenerica(f.legenda));
      if (precisamLegenda.length > 0) {
        await atualizarProgresso(setProgresso, `Gerando legendas via IA · ${precisamLegenda.length} foto(s)...`, setPct, 3);
        for (let i = 0; i < precisamLegenda.length; i += 5) {
          const lote = precisamLegenda.slice(i, i + 5);
          const loteNum = Math.floor(i / 5) + 1;
          const totalLotes = Math.ceil(precisamLegenda.length / 5);
          await atualizarProgresso(setProgresso, `Legendas IA · lote ${loteNum}/${totalLotes}...`, setPct, 3 + Math.round((loteNum / totalLotes) * 12));
          const resultados = await Promise.allSettled(
            lote.map((f) => base44.functions.invoke('suggestPhotoCaption', {
              photoUrl: f.fileUrl,
              activityId: f.activityId,
              reportId: f.reportId,
            }))
          );
          resultados.forEach((r, idx) => {
            const f = lote[idx];
            const fid = f.fileUrl;
            if (r.status === 'fulfilled' && r.value?.data?.caption) {
              legendasIA[fid] = r.value.data.caption;
              f.legenda = r.value.data.caption;
            }
          });
        }
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

      // ── Capa ──
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, pageW, pageH, 'F');
      const timbreCapaH = drawTimbreViaduto(doc, pageW, margin, true);
      const capaY0 = timbreCapaH + 10;
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', pageW / 2, capaY0, { align: 'center' });
      doc.setFontSize(22);
      doc.text(SECTION_ABREV[museu], pageW / 2, capaY0 + 50, { align: 'center' });
      doc.setFontSize(13);
      doc.setFont('helvetica', 'normal');
      doc.text(SECTION_LABELS[museu], pageW / 2, capaY0 + 65, { align: 'center', maxWidth: 170 });
      doc.setFontSize(11);
      doc.setTextColor(180, 180, 180);
      doc.text('Relatório de Atividades', pageW / 2, capaY0 + 85, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`${mes} de ${ano}`, pageW / 2, capaY0 + 98, { align: 'center' });
      doc.setFontSize(9);
      doc.setTextColor(150, 205, 255);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, capaY0 + 115, { align: 'center' });
      doc.text(`${fotosParaPDF.length} fotografias em ${atividades.filter(a => a.fotos.length > 0).length} atividades`, pageW / 2, capaY0 + 125, { align: 'center' });

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

      // ── Pré-carrega imagens (resolução reduzida ×3) ──
      await atualizarProgresso(setProgresso, `Carregando ${fotosParaPDF.length} imagens...`, setPct, 18);
      const imagens = [];
      for (let i = 0; i < fotosParaPDF.length; i++) {
        if (i > 0 && i % 3 === 0) {
          await atualizarProgresso(setProgresso, `Carregando imagens · ${i}/${fotosParaPDF.length}...`, setPct, 18 + Math.round((i / fotosParaPDF.length) * 40));
        }
        imagens.push(await fetchPhotoData(fotosParaPDF[i].fileUrl, cellW * 3, slotH * 3));
      }

      const carregadas = imagens.filter(Boolean).length;
      if (carregadas === 0) throw new Error('Nenhuma imagem pôde ser carregada.');

      // ── Páginas de fotos ──
      const fotosComImg = fotosParaPDF.filter((_, i) => imagens[i]);
      const imagemPorUrl = new Map(fotosParaPDF.map((f, i) => [f.fileUrl, imagens[i]]));

      await atualizarProgresso(setProgresso, `Montando PDF · ${carregadas} foto(s)...`, setPct, 60);

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
        doc.text(`${SECTION_ABREV[museu]} · ${mes}/${ano}`, margin, pageH - 5);
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

      // Agrupa fotos por atividade (preservando ordem)
      const atividadesComFotos = [];
      for (const item of atividades) {
        const fotosValidas = item.fotos.filter((f) => imagemPorUrl.get(f.fileUrl));
        if (fotosValidas.length > 0) {
          atividadesComFotos.push({ titulo: item.atividade.titulo, data: formatDateBR(item.atividade.data_realizacao || item.atividade.data_inicio), fotos: fotosValidas });
        }
      }

      let fotoIdx = 0;
      for (let aIdx = 0; aIdx < atividadesComFotos.length; aIdx++) {
        const atv = atividadesComFotos[aIdx];

        const espacoNecessario = titleBarH + gapV + cellH + gapV;
        if (cursorY + espacoNecessario > contentBottom) {
          novaPagina();
        }
        if (slotsNaLinha === 1) {
          cursorY += cellH + gapV;
          slotsNaLinha = 0;
        }

        // ── Barra de título da atividade (full-width) ──
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

        // ── Fotos da atividade em grade 2×2 ──
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

          // Legenda estruturada (3 linhas, centralizada)
          const legCx = slotX + cellW / 2;
          let legY = slotY + slotH + 3;
          // Linha 1: título da atividade (bold, 8.5pt, #141414)
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(20, 20, 20);
          const tituloLeg = doc.splitTextToSize(foto.tituloAtividade || atv.titulo || 'Registro fotográfico', cellW - 2)[0] || '';
          doc.text(tituloLeg, legCx, legY, { align: 'center', maxWidth: cellW - 2 });
          legY += 4;
          // Linha 2: museu (normal, 7.5pt, #666666)
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(102, 102, 102);
          doc.text(SECTION_ABREV[museu], legCx, legY, { align: 'center' });
          legY += 3.5;
          // Linha 3: data (normal, 7pt, #999999)
          doc.setFontSize(7);
          doc.setTextColor(153, 153, 153);
          doc.text(foto.dataAtividade || atv.data || '', legCx, legY, { align: 'center' });

          slotsNaLinha++;
          fotoIdx++;

          if (fotoIdx < fotosComImg.length) {
            await atualizarProgresso(setProgresso, `Montando PDF · foto ${fotoIdx}/${fotosComImg.length}...`, setPct, 60 + Math.round((fotoIdx / fotosComImg.length) * 35));
          }

          if (slotsNaLinha >= cols) {
            cursorY += cellH + gapV;
            slotsNaLinha = 0;
          }
        }
      }

      desenharRodape();

      // ── Página final: QR code da galeria ──
      await atualizarProgresso(setProgresso, 'Adicionando QR code da galeria...', setPct, 97);
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
      doc.save(`RelatorioExecutivo_${SECTION_ABREV[museu]}_${mes}_${ano}_${ts}.pdf`);
      toast.success(`PDF gerado! ${carregadas} fotos em ${atividades.filter(a => a.fotos.length > 0).length} atividades.`);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e.message || 'tente novamente.'));
    } finally {
      setGerando(false);
      setProgresso('');
      setPct(0);
    }
  }

  function reset() {
    setMuseu(''); setMes(''); setAtividades([]); setFetched(false);
  }

  function handleClose() {
    if (loading || gerando) return;
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookImage className="h-5 w-5" />
            Relatório Executivo de Fotos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!fetched && (
            <>
              {/* Museu */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Museu
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SECTION_ORDER.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => !loading && setMuseu(museu === k ? '' : k)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-all
                        ${museu === k ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-800 hover:border-gray-400'}`}
                    >
                      <p className="font-semibold">{SECTION_ABREV[k]}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mês */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Mês de referência
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {MESES.map((m, idx) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => !loading && setMes(mes === m ? '' : m)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition-all
                        ${mes === m ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ano */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Ano</p>
                <div className="flex gap-2">
                  {anos.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => !loading && setAno(a)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-all
                        ${ano === a ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Progresso de busca */}
          {loading && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                <span className="text-xs">{progresso || 'Buscando...'}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-right">{Math.round(pct)}%</p>
            </div>
          )}

          {/* Preview de atividades */}
          {fetched && atividades.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  {atividades.length} {atividades.length === 1 ? 'atividade encontrada' : 'atividades encontradas'}
                </p>
                <button type="button" onClick={() => { setFetched(false); setAtividades([]); }} className="text-xs text-blue-600 hover:underline">
                  Voltar aos filtros
                </button>
              </div>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {atividades.map((item, idx) => {
                  const count = item.fotos.length;
                  const badge = count >= 3 ? 'bg-green-100 text-green-700' : count >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.atividade.titulo}</p>
                        <p className="text-xs text-gray-500">
                          {formatDateBR(item.atividade.data_realizacao || item.atividade.data_inicio) || 'Sem data'} · {item.atividade.classificacao}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge}`}>
                        {count} {count === 1 ? 'foto' : 'fotos'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!temFotos && (
                <p className="text-xs text-red-600 font-medium">Nenhuma atividade possui fotos. O PDF não pode ser gerado.</p>
              )}
            </div>
          )}

          {fetched && atividades.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <BookImage className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="font-medium text-gray-700">Nenhuma atividade física encontrada</p>
              <p className="mt-1 text-sm text-gray-500">Tente outro museu, mês ou ano.</p>
              <button type="button" onClick={() => setFetched(false)} className="mt-3 text-xs text-blue-600 hover:underline">
                Voltar aos filtros
              </button>
            </div>
          )}

          {/* Progresso de geração do PDF */}
          {gerando && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <FileDown className="h-4 w-4 animate-bounce text-blue-500 shrink-0" />
                <span className="text-xs">{progresso || 'Gerando PDF...'}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-right">{Math.round(pct)}%</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading || gerando}>
            Fechar
          </Button>
          {!fetched ? (
            <Button onClick={buscarAtividades} disabled={loading || !museu || !mes}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Buscando...</> : 'Buscar atividades'}
            </Button>
          ) : (
            <Button onClick={gerarPDF} disabled={gerando || !temFotos}>
              {gerando ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Gerando...</> : <><FileDown className="h-4 w-4 mr-1" />Gerar PDF</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}