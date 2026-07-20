import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2, AlertTriangle, Building2, RefreshCw, CheckCircle2, CloudDownload } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import viadutoHeaderOriginal from '@/assets/viadutoHeaderOriginal';

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

function drawInstitutionalHeader(doc, pageW) {
  // Apenas rodapé — não sobrescreve imagens com rect branco no topo
  // O cabeçalho preto já é desenhado inline em cada página de fotos
}

async function sincronizarFotosMuseoDoDrive(museuKey, setProgresso) {
  setProgresso(`Varrendo pastas do ${SECTION_KEYS_ABREV[museuKey]} no Drive...`);
  try {
    let offset = 0;
    let totalCriadas = 0;
    let totalReparadas = 0;
    let hasMore = true;
    let page = 0;
    while (hasMore) {
      page++;
      setProgresso(`Varredura ${SECTION_KEYS_ABREV[museuKey]} · lote ${page} (${totalCriadas} novas até agora)...`);
      const res = await base44.functions.invoke('varrerFotosMuseusDrive', {
        folder_id: FOLDER_DRIVE_ID,
        museu: museuKey,
        offset,
      });
      const d = res?.data || {};
      totalCriadas += d.criadas || 0;
      totalReparadas += d.reparadas || 0;
      offset = d.next_offset;
      hasMore = d.has_more;
      if (!d.success) break;
    }
    if (totalCriadas + totalReparadas > 0) {
      setProgresso(`✓ ${totalCriadas} novas + ${totalReparadas} reparadas do ${SECTION_KEYS_ABREV[museuKey]}. Recarregando banco...`);
      await new Promise(r => setTimeout(r, 600));
    } else {
      setProgresso(`Nenhuma foto nova encontrada no Drive do ${SECTION_KEYS_ABREV[museuKey]}.`);
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
    activityTitulo: foto.activity_id,
    museu: foto.museu,
    sectionKey: foto.museu,
    reportMes: foto.mes_referencia,
    fileName: foto.file_name,
    date: foto.created_date,
  };
}

export default function ExportarMuseuPDFDialog({ open, onClose, fotos: fotosIniciais }) {
  const [museuSelecionado, setMuseuSelecionado] = useState('');
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [etapa, setEtapa] = useState(''); // 'drive' | 'pdf'
  const [auditoria, setAuditoria] = useState(null);

  const museusComFotos = SECTION_ORDER.filter(k =>
    fotosIniciais.some(f => f.sectionKey === k)
  );

  async function handleExportar() {
    if (!museuSelecionado) return toast.warning('Selecione um museu para exportar.');
    setLoading(true);
    setAuditoria(null);

    try {
      // ── Etapa 1: busca fotos do Drive antes de gerar o PDF ──
      setEtapa('drive');
      await sincronizarFotosMuseoDoDrive(museuSelecionado, setProgresso);

      // ── Etapa 2: carrega fotos atualizadas do banco ──
      setProgresso('Carregando fotos atualizadas do banco...');
      const fotosAtualizadas = await buscarFotosAtualizadasDoMuseu(museuSelecionado);
      const fotosDoMuseu = fotosAtualizadas.length > 0
        ? fotosAtualizadas.map(normalizarFotoParaGaleria).filter(f => f.fileUrl)
        : fotosIniciais.filter(f => f.sectionKey === museuSelecionado && f.fileUrl);

      if (fotosDoMuseu.length === 0) {
        toast.error('Nenhuma foto encontrada para este museu.');
        setLoading(false);
        setProgresso('');
        setEtapa('');
        return;
      }

      // ── Etapa 2.5: valida integridade das URLs ──
      const semUrl = fotosDoMuseu.filter(f => !f.fileUrl || typeof f.fileUrl !== 'string' || f.fileUrl.trim() === '');
      if (semUrl.length > 0) {
        toast.error(`${semUrl.length} foto(s) sem URL válida. Execute a varredura do Drive novamente.`);
        setLoading(false);
        setProgresso('');
        setEtapa('');
        return;
      }

      // ── Etapa 3: pré-carrega imagens ──
      setEtapa('pdf');
      setProgresso(`Carregando ${fotosDoMuseu.length} imagens para o PDF...`);
      const pageW = 210, pageH = 297, margin = 12;
      const cols = 2, rows = 2, perPage = cols * rows;
      const cellW = (pageW - margin * 2 - (cols - 1) * 6) / cols;
      const headerH = 34, slotH = 81, cellH = slotH + 26;

      const imagensPreCarregadas = await Promise.all(
        fotosDoMuseu.map(foto => fetchPhotoData(foto, cellW * 4, slotH * 4))
      );

      const falhas = fotosDoMuseu.filter((_, i) => !imagensPreCarregadas[i]);
      if (falhas.length > 0) {
        throw new Error(`${falhas.length} de ${fotosDoMuseu.length} imagem(ns) falharam ao carregar. Verifique a conexão ou execute a varredura do Drive novamente.`);
      }

      const imagemPorChave = new Map(
        fotosDoMuseu.map((foto, i) => [foto.id || foto.fileUrl, imagensPreCarregadas[i]])
      );

      const auditLog = { carregadas: fotosDoMuseu.length - falhas.length, falhas: falhas.length, total: fotosDoMuseu.length };

      // ── Etapa 4: gera o PDF ──
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
      doc.text(`Galeria de Fotos`, pageW / 2, 126, { align: 'center' });
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 138, { align: 'center' });
      doc.text(`${auditLog.carregadas} fotografias`, pageW / 2, 150, { align: 'center' });
      doc.setTextColor(150, 205, 255);
      doc.textWithLink('Ver galeria completa no app', pageW / 2, 170, {
        url: `${window.location.origin}/GaleriaFotos`,
        align: 'center',
      });

      // Páginas de fotos
      let fotosProcessadas = 0;
      const fotosComImg = fotosDoMuseu.filter((_, i) => !!imagensPreCarregadas[i]);

      for (let p = 0; p < Math.ceil(fotosComImg.length / perPage); p++) {
        const pageFotos = fotosComImg.slice(p * perPage, (p + 1) * perPage);
        setProgresso(`Montando PDF · fotos ${fotosProcessadas + 1}–${Math.min(fotosProcessadas + pageFotos.length, fotosComImg.length)} de ${fotosComImg.length}`);
        const imagens = pageFotos.map(foto => imagemPorChave.get(foto.id || foto.fileUrl));
        fotosProcessadas += pageFotos.length;

        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, pageH, 'F');

        doc.setFillColor(20, 20, 20);
        doc.rect(0, 0, pageW, 14, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', margin, 6.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(SECTION_LABELS[museuSelecionado], margin, 11);
        doc.setTextColor(90, 90, 90);

        for (let i = 0; i < pageFotos.length; i++) {
          const foto = pageFotos[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const slotX = margin + col * (cellW + 4);
          const slotY = headerH + row * (cellH + 4);
          const imgResult = imagens[i];
          if (!imgResult) continue;

          const scaleX = cellW / imgResult.w;
          const scaleY = slotH / imgResult.h;
          const scale = Math.min(scaleX, scaleY);
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

          const legenda = normalizarLegenda(foto.legenda || foto.caption || foto.activityTitulo || foto.fileName || 'Registro fotográfico');
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(40, 40, 40);
          doc.text(doc.splitTextToSize(legenda, cellW).slice(0, 2), slotX, slotY + slotH + 5);
          doc.setFontSize(5.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(115, 115, 115);
          if (foto.reportMes) doc.text(`Período: ${foto.reportMes}`, slotX, slotY + slotH + 15, { maxWidth: cellW });
        }
      }

      // Apenas rodapé + numeração em todas as páginas (sem sobrescrever imagens)
      const totalPaginas = doc.internal.getNumberOfPages();
      for (let pg = 1; pg <= totalPaginas; pg++) {
        doc.setPage(pg);
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(`${SECTION_LABELS[museuSelecionado]} · Museus Centro`, margin, pageH - 6);
        doc.text(`Página ${pg} de ${totalPaginas}`, pageW - margin, pageH - 6, { align: 'right' });
      }

      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`Galeria_${museuSelecionado}_${ts}.pdf`);

      setAuditoria(auditLog);
      toast.success(`PDF do ${SECTION_KEYS_ABREV[museuSelecionado]} gerado! ${auditLog.carregadas}/${auditLog.total} fotos incluídas.`);
      if (auditLog.falhas === 0) onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
      setProgresso('');
      setEtapa('');
    }
  }

  const fotosDoMuseu = museuSelecionado
    ? fotosIniciais.filter(f => f.sectionKey === museuSelecionado)
    : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Exportar PDF por Museu
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Seleção de museu */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Selecione o museu</p>
            <div className="grid grid-cols-2 gap-2">
              {SECTION_ORDER.map(k => {
                const count = fotosIniciais.filter(f => f.sectionKey === k).length;
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

          {/* Info sobre o fluxo */}
          {museuSelecionado && !loading && !auditoria && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-1.5 text-xs text-blue-700">
              <p className="font-semibold flex items-center gap-1.5">
                <CloudDownload className="h-3.5 w-3.5" /> Fluxo automático antes do PDF:
              </p>
              <p>1. Busca fotos novas do {SECTION_KEYS_ABREV[museuSelecionado]} no Google Drive</p>
              <p>2. Carrega fotos atualizadas do banco</p>
              <p>3. Gera o PDF com todas as fotos disponíveis</p>
            </div>
          )}

          {/* Progresso */}
          {loading && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                {etapa === 'drive'
                  ? <RefreshCw className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                  : <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                }
                <span className="text-xs leading-snug">{progresso || 'Processando...'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className={`rounded-full px-2 py-0.5 ${etapa === 'drive' ? 'bg-blue-100 text-blue-600 font-medium' : 'bg-gray-100 text-gray-400'}`}>
                  1. Drive
                </span>
                <span className="text-gray-300">→</span>
                <span className={`rounded-full px-2 py-0.5 ${etapa === 'pdf' ? 'bg-blue-100 text-blue-600 font-medium' : 'bg-gray-100 text-gray-400'}`}>
                  2. PDF
                </span>
              </div>
            </div>
          )}

          {/* Auditoria */}
          {auditoria && !loading && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-1 text-xs">
              <p className="font-semibold text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> PDF gerado com sucesso
              </p>
              <p className="text-green-700">✓ Fotos incluídas: <strong>{auditoria.carregadas}</strong> / {auditoria.total}</p>
              {auditoria.falhas > 0 && (
                <p className="text-amber-700">⚠ Não acessíveis: <strong>{auditoria.falhas}</strong></p>
              )}
            </div>
          )}
        </div>

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
      </DialogContent>
    </Dialog>
  );
}