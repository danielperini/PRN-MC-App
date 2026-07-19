import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileDown, Images, Building2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile'];
const SECTION_LABELS = {
  MHAB: 'MHAB — Museu Histórico Abílio Barreto',
  MIS: 'MIS — Museu da Imagem e do Som',
  MUMO: 'MUMO — Museu da Moda',
  MAP: 'MAP — Museu de Arte da Pampulha',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
};

// Carrega uma URL via elemento <img> (evita bloqueios CORS do fetch em URLs do Drive)
function loadImageElement(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; resolve(null); }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

// Converte HTMLImageElement para JPEG data URL via Canvas, respeitando proporção (contain)
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

// Tenta carregar uma foto pelos candidatos de URL, em ordem de prioridade
async function fetchPhotoData(foto, maxW, maxH) {
  const urls = [
    foto.fileUrl,
    ...(foto.fallbackUrls || []),
    foto.originalFileUrl,
  ].filter(Boolean);

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
  return String(texto)
    .replace(/\boficina\b/gi, 'atividade educativa')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default function ExportarGaleriaPDFDialog({ open, onClose, fotos }) {
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [auditoria, setAuditoria] = useState(null);

  // Filtra apenas fotos com museu identificado
  const fotosValidas = fotos.filter(f => f.sectionKey && SECTION_ORDER.includes(f.sectionKey));
  const museusPresentes = SECTION_ORDER.filter(k => fotosValidas.some(f => f.sectionKey === k));

  async function handleExportar() {
    if (fotosValidas.length === 0) {
      toast.error('Nenhuma foto com museu identificado para exportar.');
      return;
    }
    setLoading(true);
    setAuditoria(null);

    const auditLog = { carregadas: 0, falhas: 0, total: fotosValidas.length };

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = 210, pageH = 297, margin = 12;

      // Grade de 4 fotos por página: imagens maiores e legendas mais legíveis
      const cols = 2, rows = 2, perPage = cols * rows;
      const cellW = (pageW - margin * 2 - (cols - 1) * 6) / cols;
      const slotH = 96;
      const cellH = slotH + 22;

      // ──────────────────────────────────────────
      // CAPA
      // ──────────────────────────────────────────
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', pageW / 2, 28, { align: 'center' });
      doc.setFontSize(26);
      doc.setFont('helvetica', 'bold');
      doc.text('Galeria de Fotos', pageW / 2, 95, { align: 'center' });
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Museus Centro', pageW / 2, 112, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(170, 170, 170);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 130, { align: 'center' });
      doc.text(`${fotosValidas.length} fotografias`, pageW / 2, 141, { align: 'center' });

      // Link centralizado da capa
      doc.setFontSize(10);
      doc.setTextColor(150, 205, 255);
      doc.textWithLink('Fotos da galeria no app', pageW / 2, 165, {
        url: `${window.location.origin}/GaleriaFotos`,
        align: 'center',
      });

      // ──────────────────────────────────────────
      // AGRUPA POR MUSEU
      // ──────────────────────────────────────────
      const grupos = new Map(SECTION_ORDER.map(k => [k, []]));
      for (const foto of fotosValidas) {
        if (grupos.has(foto.sectionKey)) grupos.get(foto.sectionKey).push(foto);
      }

      let fotosProcessadas = 0;
      const total = fotosValidas.length;

      for (const sectionKey of SECTION_ORDER) {
        const secFotos = grupos.get(sectionKey) || [];
        if (!secFotos.length) continue;

        // ── Página título da seção ──
        doc.addPage();
        doc.setFillColor(245, 245, 245);
        doc.rect(0, 0, pageW, pageH, 'F');
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(SECTION_LABELS[sectionKey], pageW / 2, pageH / 2 - 12, { align: 'center', maxWidth: 180 });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`${secFotos.length} foto${secFotos.length !== 1 ? 's' : ''}`, pageW / 2, pageH / 2 + 6, { align: 'center' });

        doc.setFillColor(20, 20, 20);
        doc.rect(0, 0, pageW, 14, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', margin, 8.5);

        // ── Páginas de fotos ──
        for (let p = 0; p < Math.ceil(secFotos.length / perPage); p++) {
          const pageFotos = secFotos.slice(p * perPage, (p + 1) * perPage);

          // Carrega imagens do lote (concorrência 3)
          setProgresso(`${SECTION_LABELS[sectionKey]} · fotos ${fotosProcessadas + 1}–${Math.min(fotosProcessadas + pageFotos.length, total)} de ${total}`);

          const imagens = await Promise.all(
            pageFotos.map(foto => fetchPhotoData(foto, cellW * 4, slotH * 4)) // resolução 4× para qualidade
          );
          fotosProcessadas += pageFotos.length;
          imagens.forEach((r, i) => {
            if (r) auditLog.carregadas++;
            else { auditLog.falhas++; console.warn('[PDF] Foto não carregada:', pageFotos[i]?.fileUrl); }
          });

          doc.addPage();
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, pageW, pageH, 'F');

          // Cabeçalho institucional em todas as páginas do álbum
          doc.setFillColor(20, 20, 20);
          doc.rect(0, 0, pageW, 14, 'F');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text('VIADUTO DAS ARTES · MUSEUS CENTRO', margin, 6.5);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.text(SECTION_LABELS[sectionKey], margin, 11);
          doc.setTextColor(90, 90, 90);

          for (let i = 0; i < pageFotos.length; i++) {
            const foto = pageFotos[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const slotX = margin + col * (cellW + 4);
            const slotY = 14 + row * (cellH + 4);
            const imgResult = imagens[i];

            if (imgResult) {
              // Posiciona a imagem centralizada dentro do slot (object-fit: contain)
              const scaleX = cellW / imgResult.w;
              const scaleY = slotH / imgResult.h;
              const scale = Math.min(scaleX, scaleY);
              const renderW = imgResult.w * scale;
              const renderH = imgResult.h * scale;
              const offsetX = slotX + (cellW - renderW) / 2;
              const offsetY = slotY + (slotH - renderH) / 2;

              // Link clicável na foto
              doc.addImage(imgResult.dataUrl, 'JPEG', offsetX, offsetY, renderW, renderH, undefined, 'FAST');
              if (foto.fileUrl) {
                doc.link(offsetX, offsetY, renderW, renderH, { url: foto.fileUrl });
              }
            } else {
              // Quadro de falha — mostra o contexto em vez de "Indisponível" genérico
              doc.setFillColor(240, 240, 240);
              doc.rect(slotX, slotY, cellW, slotH, 'F');
              doc.setDrawColor(200, 200, 200);
              doc.rect(slotX, slotY, cellW, slotH, 'S');
              doc.setFontSize(5.5);
              doc.setTextColor(160, 160, 160);
              const nomeBreve = (foto.legenda || foto.activityTitulo || foto.fileName || '').substring(0, 40);
              doc.text(nomeBreve || 'Arquivo não acessível', slotX + cellW / 2, slotY + slotH / 2, { align: 'center', maxWidth: cellW - 4 });
              if (foto.fileUrl) {
                doc.setFontSize(4.5);
                doc.setTextColor(120, 120, 200);
                doc.textWithLink('→ abrir original', slotX + cellW / 2, slotY + slotH / 2 + 5, { url: foto.fileUrl, align: 'center' });
              }
            }

            // Legenda
            const legenda = normalizarLegenda(foto.legenda || foto.activityTitulo || '');
            if (legenda) {
              doc.setFontSize(8);
              doc.setTextColor(40, 40, 40);
              doc.setFont('helvetica', 'normal');
              const lines = doc.splitTextToSize(legenda, cellW);
              doc.text(lines.slice(0, 2), slotX, slotY + slotH + 5);
            }
            if (foto.reportMes) {
              doc.setFontSize(5.5);
              doc.setTextColor(130, 130, 130);
              doc.text(foto.reportMes, slotX, slotY + slotH + 11);
            }
          }

        }
      }

      setProgresso('Preparando a auditoria...');

      // Página de auditoria ao final
      doc.addPage();
      doc.setFillColor(252, 252, 252);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('Relatório de Auditoria', margin, 24);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const linhas = [
        `Total cadastrado na Galeria: ${total}`,
        `Fotos carregadas com sucesso: ${auditLog.carregadas}`,
        `Fotos não acessíveis (arquivo indisponível): ${auditLog.falhas}`,
        `Data de geração: ${new Date().toLocaleString('pt-BR')}`,
      ];
      linhas.forEach((linha, idx) => {
        doc.text(linha, margin, 38 + idx * 9);
      });
      doc.setFontSize(8);
      doc.setTextColor(100, 150, 220);
      doc.textWithLink('Fotos da galeria no app', pageW / 2, 38 + linhas.length * 9 + 10, {
        url: `${window.location.origin}/GaleriaFotos`,
        align: 'center',
      });

      // Paginação definitiva, incluindo a página de auditoria
      const totalPaginas = doc.internal.getNumberOfPages();
      for (let pagina = 1; pagina <= totalPaginas; pagina++) {
        doc.setPage(pagina);
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text('Museus Centro · Viaduto das Artes', margin, pageH - 6);
        doc.text(`Página ${pagina} de ${totalPaginas}`, pageW - margin, pageH - 6, { align: 'right' });
      }

      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`Galeria_MuseusCentro_${ts}.pdf`);

      setAuditoria(auditLog);
      toast.success(`PDF gerado! ${auditLog.carregadas}/${total} fotos incluídas.`);
      if (auditLog.falhas === 0) onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
      setProgresso('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Exportar Galeria em PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Images className="h-4 w-4 text-gray-400" />
              <span><strong>{fotosValidas.length}</strong> fotos identificadas serão incluídas</span>
            </div>
            {fotos.length - fotosValidas.length > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {fotos.length - fotosValidas.length} fotos sem museu identificado foram excluídas.
              </p>
            )}
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-gray-500">Museus incluídos:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {museusPresentes.map(m => (
                    <span key={m} className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
                      {SECTION_LABELS[m]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {loading && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span className="text-xs leading-snug">{progresso || 'Gerando PDF...'}</span>
              </div>
              <p className="text-[11px] text-gray-400 px-1">
                As fotos são carregadas via browser. URLs bloqueadas por CORS serão marcadas com link para o original.
              </p>
            </div>
          )}

          {auditoria && !loading && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1 text-xs">
              <p className="font-semibold text-green-800">Auditoria do PDF gerado</p>
              <p className="text-green-700">✓ Carregadas: <strong>{auditoria.carregadas}</strong> / {auditoria.total}</p>
              {auditoria.falhas > 0 && (
                <p className="text-amber-700">⚠ Não acessíveis (CORS/expiradas): <strong>{auditoria.falhas}</strong> — link para o original incluído no PDF.</p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400">
            O PDF é gerado no seu navegador. Fotos com restrição de acesso recebem link clicável para o original.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {auditoria && !loading ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button onClick={handleExportar} disabled={loading || fotosValidas.length === 0}>
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Gerando...</>
              : `Baixar PDF (${fotosValidas.length} fotos)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}