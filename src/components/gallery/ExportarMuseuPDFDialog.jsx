import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2, AlertTriangle, Building2, RefreshCw, CheckCircle2, CloudDownload, Check } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import viadutoHeaderOriginal from '@/assets/viadutoHeaderOriginal';
import { drawTimbreViaduto } from './timbreViadutoPDF';
import { isLegendaGenerica } from './deduplicarFotosGaleria';
import RevisaoAntesExportar from './RevisaoAntesExportar';

const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile'];
const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som',
  MUMO: 'MUMO — Museu da Moda',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
};
const SECTION_KEYS_ABREV = {
  MHAB: 'MHAB',
  MIS: 'MIS',
  MUMO: 'MUMO',
  MAP: 'MAP',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
};

const FOLDER_DRIVE_ID = '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ';

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
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.78), w, h };
  } catch {
    return null;
  }
}

async function fetchPhotoData(foto, maxW, maxH) {
  const urls = [foto.fileUrl, ...(foto.fallbackUrls || []), foto.originalFileUrl].filter(Boolean);
  for (const url of urls) {
    const img = await loadImageElement(url);
    if (img && img.naturalWidth > 0) {
      const result = imageToDataUrl(img, maxW, maxH);
      if (result) return { ...result, url };
    }
  }
  return null;
}

function normalizarLegenda(texto = '') {
  return String(texto).replace(/\boficina\b/gi, 'atividade educativa').replace(/\s{2,}/g, ' ').trim();
}

// Helper: atualiza o progresso E aguarda o browser pintar, evitando texto travado/corrompido
async function atualizarProgresso(setProgresso, texto, setProgressoPct, pct) {
  setProgresso(texto);
  if (setProgressoPct && typeof pct === 'number') setProgressoPct(pct);
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => setTimeout(r, 0));
}

async function sincronizarFotosMuseoDoDrive(museuKey, setProgresso, setProgressoPct) {
  await atualizarProgresso(setProgresso, `Varrendo pastas do ${SECTION_KEYS_ABREV[museuKey]} no Drive...`, setProgressoPct, 5);
  try {
    let offset = 0;
    let totalCriadas = 0;
    let totalReparadas = 0;
    let hasMore = true;
    let page = 0;
    const MAX_PAGES = 60;
    let lastOffset = -1;
    while (hasMore && page < MAX_PAGES) {
      page++;
      await atualizarProgresso(setProgresso, `Varredura ${SECTION_KEYS_ABREV[museuKey]} · lote ${page} (${totalCriadas} novas até agora)...`, setProgressoPct, Math.min(5 + page * 3, 15));
      const res = await base44.functions.invoke('varrerFotosMuseusDrive', {
        folder_id: FOLDER_DRIVE_ID,
        museu: museuKey,
        offset,
      });
      const d = res?.data || {};
      totalCriadas += d.criadas || 0;
      totalReparadas += d.reparadas || 0;
      hasMore = d.has_more;
      if (d.next_offset === lastOffset) break; // safety: offset não avançou
      lastOffset = offset;
      offset = d.next_offset;
      if (!d.success) break;
    }
    if (totalCriadas + totalReparadas > 0) {
      await atualizarProgresso(setProgresso, `✓ ${totalCriadas} novas + ${totalReparadas} reparadas do ${SECTION_KEYS_ABREV[museuKey]}. Recarregando banco...`, setProgressoPct, 18);
      await new Promise(r => setTimeout(r, 600));
    } else {
      await atualizarProgresso(setProgresso, `Nenhuma foto nova encontrada no Drive do ${SECTION_KEYS_ABREV[museuKey]}.`, setProgressoPct, 18);
    }
  } catch (e) {
    console.warn('Varredura Drive silenciada:', e?.message);
  }
}

async function buscarFotosAtualizadasDoMuseu(museuKey) {
  try {
    const fotos = await base44.entities.ReportPhoto.filter({ museu: museuKey });
    return Array.isArray(fotos) ? fotos : [];
  } catch {
    return [];
  }
}

function normalizarFotoParaGaleria(foto) {
  return {
    id: foto.id,
    fileUrl: foto.file_url,
    legenda: foto.legenda || foto.caption,
    activityId: foto.activity_id,
    reportId: foto.report_id,
    activityTitulo: foto.activity_id,
    museu: foto.museu,
    sectionKey: foto.museu,
    reportMes: foto.mes_referencia,
    fileName: foto.file_name,
    date: foto.created_date,
    drive_file_id: foto.drive_file_id,
    created_date: foto.created_date,
  };
}

// Gera legendas via IA para fotos sem legenda ou com legenda genérica (lotes de 5)
async function gerarLegendasIA(fotos, setProgresso, legendasAtuais, setProgressoPct) {
  const precisam = fotos.filter((f) => isLegendaGenerica(f.legenda || f.caption));
  if (precisam.length === 0) return { revisadasIA: 0 };

  let revisadasIA = 0;
  const totalLotes = Math.ceil(precisam.length / 5);
  for (let i = 0; i < precisam.length; i += 5) {
    const lote = precisam.slice(i, i + 5);
    const loteNum = Math.floor(i / 5) + 1;
    await atualizarProgresso(setProgresso, `Gerando legendas com IA · lote ${loteNum} de ${totalLotes}...`, setProgressoPct, 20 + Math.round((loteNum / totalLotes) * 25));
    const resultados = await Promise.allSettled(
      lote.map((f) =>
        base44.functions.invoke('suggestPhotoCaption', {
          photoUrl: f.fileUrl,
          activityId: f.activityId,
          reportId: f.reportId,
        })
      )
    );
    resultados.forEach((r, idx) => {
      const foto = lote[idx];
      const fid = foto.id || foto.fileUrl;
      if (r.status === 'fulfilled' && r.value?.data?.caption) {
        const novaLegenda = r.value.data.caption;
        legendasAtuais[fid] = novaLegenda;
        foto.legenda = novaLegenda;
        revisadasIA++;
      }
    });
  }
  return { revisadasIA };
}

function filtrarFotosPorAtividade(fotos, limite) {
  if (!limite || limite === Infinity) return fotos;
  const grupos = {};
  for (const foto of fotos) {
    const chave = foto.activity_id || foto.activityTitulo || 'sem_atividade';
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(foto);
  }
  const resultado = [];
  for (const chave of Object.keys(grupos)) {
    const grupo = grupos[chave].sort((a, b) => {
      const aGen = isLegendaGenerica(a.legenda || a.caption);
      const bGen = isLegendaGenerica(b.legenda || b.caption);
      if (aGen && !bGen) return 1;
      if (!aGen && bGen) return -1;
      return 0;
    });
    resultado.push(...grupo.slice(0, limite));
  }
  return resultado;
}

export default function ExportarMuseuPDFDialog({ open, onClose, fotos: fotosIniciais }) {
  const [museuSelecionado, setMuseuSelecionado] = useState('');
  const [fotosPorAtividade, setFotosPorAtividade] = useState(5);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [progressoPct, setProgressoPct] = useState(0);
  const [etapa, setEtapa] = useState(''); // 'drive' | 'legendas' | 'revisao' | 'pdf'
  const [auditoria, setAuditoria] = useState(null);
  const [fotosRevisao, setFotosRevisao] = useState([]);
  const [legendasAtualizadas, setLegendasAtualizadas] = useState({});

  const museusComFotos = SECTION_ORDER.filter(k =>
    fotosIniciais.some(f => f.sectionKey === k)
  );

  const handleLegendasAtualizadas = useCallback(({ id, legenda }) => {
    setLegendasAtualizadas((prev) => ({ ...prev, [id]: legenda }));
  }, []);

  async function handleExportar() {
    if (!museuSelecionado) return toast.warning('Selecione um museu para exportar.');
    setLoading(true);
    setAuditoria(null);

    try {
      // ── Etapa 1: busca fotos no banco primeiro ──
      setEtapa('drive');
      setProgressoPct(2);
      await atualizarProgresso(setProgresso, 'Buscando fotos no banco de dados...', setProgressoPct, 3);
      let fotosAtualizadas = await buscarFotosAtualizadasDoMuseu(museuSelecionado);
      let fotosDoMuseu = fotosAtualizadas.length > 0
        ? fotosAtualizadas.map(normalizarFotoParaGaleria).filter(f => f.fileUrl)
        : fotosIniciais.filter(f => f.sectionKey === museuSelecionado && f.fileUrl);

      if (fotosDoMuseu.length === 0) {
        toast.error('Nenhuma foto encontrada para este museu.');
        setLoading(false);
        setProgresso('');
        setProgressoPct(0);
        setEtapa('');
        return;
      }

      // ── Etapa 1.5: só varre o Drive se houver fotos em branco (sem URL válida) ──
      const semUrlBanco = fotosDoMuseu.filter(f => !f.fileUrl || typeof f.fileUrl !== 'string' || f.fileUrl.trim() === '');
      if (semUrlBanco.length > 0) {
        await sincronizarFotosMuseoDoDrive(museuSelecionado, setProgresso, setProgressoPct);
        await atualizarProgresso(setProgresso, 'Recarregando fotos do banco após varredura...', setProgressoPct, 18);
        fotosAtualizadas = await buscarFotosAtualizadasDoMuseu(museuSelecionado);
        if (fotosAtualizadas.length > 0) {
          fotosDoMuseu = fotosAtualizadas.map(normalizarFotoParaGaleria).filter(f => f.fileUrl);
        }
      } else {
        await atualizarProgresso(setProgresso, `${fotosDoMuseu.length} fotos encontradas no banco. Indo para legendas...`, setProgressoPct, 18);
      }

      // ── Etapa 2: filtra fotos por atividade (limite por grupo) ──
      const fotosFiltradas = filtrarFotosPorAtividade(fotosDoMuseu, fotosPorAtividade);

      // ── Etapa 2.5: valida integridade das URLs ──
      const semUrl = fotosFiltradas.filter(f => !f.fileUrl || typeof f.fileUrl !== 'string' || f.fileUrl.trim() === '');
      if (semUrl.length > 0) {
        toast.error(`${semUrl.length} foto(s) sem URL válida. Execute a varredura do Drive novamente.`);
        setLoading(false);
        setProgresso('');
        setEtapa('');
        return;
      }

      // ── Etapa 3: gera legendas via IA para fotos sem legenda ──
      setEtapa('legendas');
      const legendasAtuais = {};
      fotosFiltradas.forEach((f) => { legendasAtuais[f.id || f.fileUrl] = f.legenda || f.caption || ''; });
      const { revisadasIA } = await gerarLegendasIA(fotosFiltradas, setProgresso, legendasAtuais, setProgressoPct);
      setLegendasAtualizadas(legendasAtuais);

      // ── Etapa 4: tela de revisão antes de gerar o PDF ──
      setEtapa('revisao');
      setFotosRevisao(fotosFiltradas);
      setLoading(false);
      setProgresso('');
      setProgressoPct(0);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao preparar revisão: ' + (e.message || 'tente novamente.'));
      setLoading(false);
      setProgresso('');
      setProgressoPct(0);
      setEtapa('');
    }
  }

  async function gerarPDFFinal(fotosParaPDF, legendasMap) {
    setLoading(true);
    setEtapa('pdf');
    setProgressoPct(45);
    try {
      await atualizarProgresso(setProgresso, `Carregando ${fotosParaPDF.length} imagens para o PDF...`, setProgressoPct, 46);

      // Layout A4: 210×297, margem 10mm, header timbre ~32mm, footer 10mm, gap 5mm
      const pageW = 210, pageH = 297, margin = 10;
      const cols = 2, rows = 2, perPage = cols * rows;
      const gapH = 5, gapV = 5;
      const headerH = 32, footerH = 10;
      const cellW = (pageW - margin * 2 - (cols - 1) * gapH) / cols;
      const cellH = (pageH - headerH - footerH - margin * 2 - (rows - 1) * gapV) / rows;
      const slotH = cellH - 12; // espaço para legenda abaixo da foto

      const imagensPreCarregadas = [];
      for (let i = 0; i < fotosParaPDF.length; i++) {
        if (i > 0 && i % 3 === 0) {
          await atualizarProgresso(setProgresso, `Carregando imagens · ${i}/${fotosParaPDF.length}...`, setProgressoPct, 46 + Math.round((i / fotosParaPDF.length) * 24));
        }
        imagensPreCarregadas.push(await fetchPhotoData(fotosParaPDF[i], cellW * 4, slotH * 4));
      }

      const falhas = fotosParaPDF.filter((_, i) => !imagensPreCarregadas[i]);
      if (fotosParaPDF.length - falhas.length === 0) {
        throw new Error('Nenhuma imagem pôde ser carregada. Verifique a conexão ou execute a varredura do Drive novamente.');
      }
      if (falhas.length > 0) {
        toast.warning(`${falhas.length} de ${fotosParaPDF.length} foto(s) não puderam ser carregadas e serão ignoradas no PDF.`);
      }

      const imagemPorChave = new Map(
        fotosParaPDF.map((foto, i) => [foto.id || foto.fileUrl, imagensPreCarregadas[i]])
      );

      await atualizarProgresso(setProgresso, `Montando PDF · ${fotosParaPDF.length - falhas.length} foto(s)...`, setProgressoPct, 72);

      const auditLog = {
        carregadas: fotosParaPDF.length - falhas.length,
        falhas: falhas.length,
        total: fotosParaPDF.length,
        duplicatasRemovidas: (fotosRevisao?.length || 0) - fotosParaPDF.length,
        legendasIA: Object.values(legendasMap || {}).filter((v) => v && !isLegendaGenerica(v)).length,
      };

      // ── Gera o PDF ──
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

      // Capa
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', pageW / 2, 28, { align: 'center' });
      doc.setFontSize(24);
      doc.text(SECTION_KEYS_ABREV[museuSelecionado], pageW / 2, 90, { align: 'center' });
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text(SECTION_LABELS[museuSelecionado], pageW / 2, 107, { align: 'center', maxWidth: 170 });
      doc.setFontSize(10);
      doc.setTextColor(170, 170, 170);
      doc.text('Galeria de Fotos', pageW / 2, 126, { align: 'center' });
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 138, { align: 'center' });
      doc.text(`${auditLog.carregadas} fotografias`, pageW / 2, 150, { align: 'center' });
      doc.setTextColor(150, 205, 255);
      doc.textWithLink('Ver galeria completa no app', pageW / 2, 170, {
        url: `${window.location.origin}/GaleriaFotos`,
        align: 'center',
      });

      // Páginas de fotos
      const fotosComImg = fotosParaPDF.filter((_, i) => !!imagensPreCarregadas[i]);
      let fotosProcessadas = 0;

      const totalPaginasFoto = Math.ceil(fotosComImg.length / perPage);
      for (let p = 0; p < totalPaginasFoto; p++) {
        const pageFotos = fotosComImg.slice(p * perPage, (p + 1) * perPage);
        const pctPagina = 72 + Math.round(((p + 1) / totalPaginasFoto) * 25);
        await atualizarProgresso(setProgresso, `Montando PDF · página ${p + 1}/${totalPaginasFoto} (fotos ${fotosProcessadas + 1}–${Math.min(fotosProcessadas + pageFotos.length, fotosComImg.length)} de ${fotosComImg.length})`, setProgressoPct, pctPagina);
        const imagens = pageFotos.map((foto) => imagemPorChave.get(foto.id || foto.fileUrl));
        fotosProcessadas += pageFotos.length;

        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, pageH, 'F');

        // Timbre do Viaduto das Artes no cabeçalho
        drawTimbreViaduto(doc, pageW, margin);

        for (let i = 0; i < pageFotos.length; i++) {
          const foto = pageFotos[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const slotX = margin + col * (cellW + gapH);
          const slotY = headerH + margin + row * (cellH + gapV);
          const imgResult = imagens[i];
          if (!imgResult) continue;

          // Yield entre fotos pesadas para manter a UI responsiva (requestAnimationFrame garante repintura)
          if (i > 0) await new Promise((r) => requestAnimationFrame(() => r()));

          // Modo "cover": preenche o slot cortando o excedente
          const scale = Math.max(cellW / imgResult.w, slotH / imgResult.h);
          const renderW = imgResult.w * scale;
          const renderH = imgResult.h * scale;
          const offsetX = slotX + (cellW - renderW) / 2;
          const offsetY = slotY + (slotH - renderH) / 2;

          doc.setFillColor(246, 246, 246);
          doc.rect(slotX, slotY, cellW, slotH, 'F');
          doc.addImage(imgResult.dataUrl, 'JPEG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
          doc.setDrawColor(205, 205, 205);
          doc.rect(slotX, slotY, cellW, slotH, 'S');
          if (foto.fileUrl) doc.link(offsetX, offsetY, renderW, renderH, { url: foto.fileUrl });

          const fid = foto.id || foto.fileUrl;
          const legendaRaw = legendasMap?.[fid] || foto.legenda || foto.caption || foto.activityTitulo || foto.fileName || 'Registro fotográfico';
          const legenda = normalizarLegenda(legendaRaw);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(40, 40, 40);
          doc.text(doc.splitTextToSize(legenda, cellW).slice(0, 2), slotX, slotY + slotH + 4);
        }
      }

      // Rodapé + numeração em todas as páginas
      const totalPaginas = doc.internal.getNumberOfPages();
      for (let pg = 1; pg <= totalPaginas; pg++) {
        doc.setPage(pg);
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, pageH - footerH, pageW - margin, pageH - footerH);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(`${SECTION_LABELS[museuSelecionado]} · Museus Centro`, margin, pageH - 5);
        doc.text(`Página ${pg} de ${totalPaginas}`, pageW - margin, pageH - 5, { align: 'right' });
      }

      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`Galeria_${museuSelecionado}_${ts}.pdf`);

      setAuditoria(auditLog);
      toast.success(`PDF do ${SECTION_KEYS_ABREV[museuSelecionado]} gerado! ${auditLog.carregadas}/${auditLog.total} fotos incluídas.`);
      setEtapa('');
      setFotosRevisao([]);
      setProgressoPct(0);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
      setProgresso('');
      setProgressoPct(0);
    }
  }

  function handleGerarPDFFromRevisao(fotosFinais) {
    // Aplica legendas atualizadas nas fotos filtradas (já sem duplicatas removidas)
    const fotosComLegendas = fotosFinais.map((f) => {
      const fid = f.id || f.fileUrl;
      return { ...f, legenda: legendasAtualizadas[fid] || f.legenda || f.caption };
    });
    gerarPDFFinal(fotosComLegendas, legendasAtualizadas);
  }

  const fotosDoMuseu = museuSelecionado
    ? fotosIniciais.filter((f) => f.sectionKey === museuSelecionado)
    : [];

  const previewFiltradas = museuSelecionado
    ? filtrarFotosPorAtividade(fotosDoMuseu, fotosPorAtividade)
    : [];
  const numAtividades = museuSelecionado
    ? new Set(fotosDoMuseu.map((f) => f.activity_id || f.activityTitulo || 'sem_atividade')).size
    : 0;

  const emRevisao = etapa === 'revisao' && fotosRevisao.length > 0 && !loading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className={emRevisao ? 'max-w-2xl' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Exportar PDF por Museu
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Seleção de museu */}
          {!emRevisao && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Selecione o museu</p>
              <div className="grid grid-cols-2 gap-2">
                {SECTION_ORDER.map((k) => {
                  const count = fotosIniciais.filter((f) => f.sectionKey === k).length;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => !loading && setMuseuSelecionado(museuSelecionado === k ? '' : k)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-all
                        ${museuSelecionado === k
                          ? 'border-black bg-black text-white'
                          : count > 0
                            ? 'border-gray-200 bg-white text-gray-800 hover:border-gray-400'
                            : 'border-dashed border-gray-200 bg-gray-50 text-gray-400'
                        }`}
                    >
                      <p className="font-semibold">{SECTION_KEYS_ABREV[k]}</p>
                      <p className={`text-[10px] mt-0.5 ${museuSelecionado === k ? 'text-white/70' : 'text-gray-400'}`}>
                        {count > 0 ? `${count} foto${count !== 1 ? 's' : ''} em cache` : 'sem fotos carregadas'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seletor de fotos por atividade */}
          {museuSelecionado && !emRevisao && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Fotos por atividade</p>
              <div className="flex flex-wrap gap-1.5">
                {[2, 3, 4, 5].map((opt) => {
                  const val = opt;
                  const ativo = fotosPorAtividade === val;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={loading}
                      onClick={() => setFotosPorAtividade(val)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all
                        ${ativo
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500">
                {`Máximo ${fotosPorAtividade} fotos/atividade · ${numAtividades} ${numAtividades === 1 ? 'atividade' : 'atividades'} · ~${previewFiltradas.length} fotos estimadas`}
              </p>
            </div>
          )}

          {/* Info sobre o fluxo */}
          {museuSelecionado && !loading && !auditoria && !emRevisao && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-1.5 text-xs text-blue-700">
              <p className="font-semibold flex items-center gap-1.5">
                <CloudDownload className="h-3.5 w-3.5" /> Fluxo automático antes do PDF:
              </p>
              <p>1. Busca fotos no banco de dados (só varre o Drive se houver em branco)</p>
              <p>2. Gera legendas com IA para fotos sem legenda</p>
              <p>3. Revisão de duplicatas e legendas</p>
              <p>4. Gera o PDF com timbre do Viaduto das Artes (4 fotos/página)</p>
            </div>
          )}

          {/* Tela de revisão */}
          {emRevisao && (
            <RevisaoAntesExportar
              fotos={fotosRevisao}
              onLegendasAtualizadas={handleLegendasAtualizadas}
              onGerarPDF={handleGerarPDFFromRevisao}
              loading={loading}
            />
          )}

          {/* Progresso */}
          {loading && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                {etapa === 'drive' || etapa === 'legendas'
                  ? <RefreshCw className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                  : <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                }
                <span className="text-xs leading-snug">{progresso || 'Processando...'}</span>
              </div>
              {/* Barra de progresso percentual */}
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(3, Math.min(100, progressoPct))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{Math.round(progressoPct)}%</span>
                <span>{etapa === 'drive' ? 'Etapa: Drive' : etapa === 'legendas' ? 'Etapa: Legendas IA' : etapa === 'pdf' ? 'Etapa: PDF' : 'Processando'}</span>
              </div>
              {/* Stepper visual com checkmarks */}
              <div className="flex items-center gap-1 text-xs flex-wrap">
                {[
                  { key: 'drive', label: 'Drive' },
                  { key: 'legendas', label: 'Legendas IA' },
                  { key: 'revisao', label: 'Revisão' },
                  { key: 'pdf', label: 'PDF' },
                ].map((step, idx, arr) => {
                  const stepOrder = ['drive', 'legendas', 'revisao', 'pdf'];
                  const currentIdx = etapa ? stepOrder.indexOf(etapa) : -1;
                  const stepIdx = stepOrder.indexOf(step.key);
                  const isDone = currentIdx > stepIdx;
                  const isActive = currentIdx === stepIdx;
                  return (
                    <React.Fragment key={step.key}>
                      <span className={`rounded-full px-2 py-0.5 flex items-center gap-1 transition-all
                        ${isActive
                          ? 'bg-blue-100 text-blue-600 font-medium'
                          : isDone
                            ? 'bg-green-100 text-green-600 font-medium'
                            : 'bg-gray-100 text-gray-400'}`}>
                        {isDone && <Check className="h-3 w-3" />}
                        {idx + 1}. {step.label}
                      </span>
                      {idx < arr.length - 1 && <span className="text-gray-300">→</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auditoria */}
          {auditoria && !loading && !emRevisao && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-1 text-xs">
              <p className="font-semibold text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> PDF gerado com sucesso
              </p>
              <p className="text-green-700">✓ Fotos incluídas: <strong>{auditoria.carregadas}</strong> / {auditoria.total}</p>
              {auditoria.duplicatasRemovidas > 0 && (
                <p className="text-amber-700">⊘ Duplicatas removidas: <strong>{auditoria.duplicatasRemovidas}</strong></p>
              )}
              {auditoria.legendasIA > 0 && (
                <p className="text-blue-700">✎ Legendas revisadas por IA: <strong>{auditoria.legendasIA}</strong></p>
              )}
              {auditoria.falhas > 0 && (
                <p className="text-amber-700">⚠ Não acessíveis: <strong>{auditoria.falhas}</strong></p>
              )}
            </div>
          )}
        </div>

        {!emRevisao && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              {auditoria && !loading ? 'Fechar' : 'Cancelar'}
            </Button>
            <Button
              onClick={handleExportar}
              disabled={loading || !museuSelecionado}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Processando...</>
                : museuSelecionado
                  ? `Exportar ${SECTION_KEYS_ABREV[museuSelecionado]}`
                  : 'Selecione um museu'
              }
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}