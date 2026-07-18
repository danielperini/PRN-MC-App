import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileDown, Images, Building2, Loader2 } from 'lucide-react';
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

// Busca imagem e retorna data URL redimensionada para economizar memória
async function fetchImageResized(url, maxW = 400, maxH = 300) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    const ratio = Math.min(maxW / bmp.width, maxH / bmp.height, 1);
    canvas.width = Math.round(bmp.width * ratio);
    canvas.height = Math.round(bmp.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

// Processa fotos em lote com concorrência limitada
async function processLote(fotos, concurrency, onEach) {
  const results = [];
  for (let i = 0; i < fotos.length; i += concurrency) {
    const slice = fotos.slice(i, i + concurrency);
    const loteResults = await Promise.all(slice.map(onEach));
    results.push(...loteResults);
  }
  return results;
}

export default function ExportarGaleriaPDFDialog({ open, onClose, fotos }) {
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState('');

  // Filtra SEM_IDENTIFICACAO
  const fotosValidas = fotos.filter(f => f.sectionKey && SECTION_ORDER.includes(f.sectionKey));
  const museusPresentes = SECTION_ORDER.filter(k => fotosValidas.some(f => f.sectionKey === k));

  async function handleExportar() {
    if (fotosValidas.length === 0) {
      toast.error('Nenhuma foto com museu identificado para exportar.');
      return;
    }
    setLoading(true);
    setProgresso('Iniciando...');
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = 210, pageH = 297, margin = 12;

      // Capa
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('Galeria de Fotos', pageW / 2, 100, { align: 'center' });
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('Museus Centro', pageW / 2, 116, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(180, 180, 180);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 136, { align: 'center' });
      doc.text(`${fotosValidas.length} fotos`, pageW / 2, 146, { align: 'center' });

      // Agrupa por museu
      const grupos = new Map(SECTION_ORDER.map(k => [k, []]));
      for (const foto of fotosValidas) {
        grupos.get(foto.sectionKey).push(foto);
      }

      const cols = 3, rows = 2, perPage = cols * rows;
      const cellW = (pageW - margin * 2 - (cols - 1) * 4) / cols;
      const imgH = 42;
      const cellH = imgH + 14;

      let fotosProcessadas = 0;
      const total = fotosValidas.length;

      for (const sectionKey of SECTION_ORDER) {
        const secFotos = grupos.get(sectionKey) || [];
        if (!secFotos.length) continue;

        // Página título da seção
        doc.addPage();
        doc.setFillColor(245, 245, 245);
        doc.rect(0, 0, pageW, pageH, 'F');
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(SECTION_LABELS[sectionKey], pageW / 2, pageH / 2 - 10, { align: 'center', maxWidth: 180 });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`${secFotos.length} foto${secFotos.length !== 1 ? 's' : ''}`, pageW / 2, pageH / 2 + 8, { align: 'center' });

        // Processa em páginas de 6
        for (let p = 0; p < Math.ceil(secFotos.length / perPage); p++) {
          const pageFotos = secFotos.slice(p * perPage, (p + 1) * perPage);

          // Carrega imagens do lote com concorrência 3
          setProgresso(`Carregando imagens ${fotosProcessadas + 1}–${Math.min(fotosProcessadas + pageFotos.length, total)} de ${total}...`);
          const imagens = await processLote(pageFotos, 3, async (foto) => {
            const url = foto.fileUrl || foto.url;
            return url ? await fetchImageResized(url) : null;
          });
          fotosProcessadas += pageFotos.length;

          doc.addPage();
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, pageW, pageH, 'F');

          doc.setFontSize(8);
          doc.setTextColor(120, 120, 120);
          doc.setFont('helvetica', 'normal');
          doc.text(SECTION_LABELS[sectionKey], margin, 8);

          for (let i = 0; i < pageFotos.length; i++) {
            const foto = pageFotos[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = margin + col * (cellW + 4);
            const y = 14 + row * (cellH + 6);

            const imgData = imagens[i];
            if (imgData) {
              try {
                doc.addImage(imgData, 'JPEG', x, y, cellW, imgH, undefined, 'FAST');
              } catch {
                doc.setFillColor(220, 220, 220);
                doc.rect(x, y, cellW, imgH, 'F');
              }
            } else {
              doc.setFillColor(220, 220, 220);
              doc.rect(x, y, cellW, imgH, 'F');
              doc.setFontSize(6);
              doc.setTextColor(150, 150, 150);
              doc.text('Indisponível', x + cellW / 2, y + imgH / 2, { align: 'center' });
            }

            const legenda = foto.legenda || foto.activityTitulo || '';
            if (legenda) {
              doc.setFontSize(6.5);
              doc.setTextColor(40, 40, 40);
              doc.setFont('helvetica', 'normal');
              const lines = doc.splitTextToSize(legenda, cellW);
              doc.text(lines.slice(0, 2), x, y + imgH + 4);
            }
            if (foto.reportMes) {
              doc.setFontSize(6);
              doc.setTextColor(130, 130, 130);
              doc.text(foto.reportMes, x, y + imgH + 10);
            }
          }

          doc.setFontSize(7);
          doc.setTextColor(180, 180, 180);
          doc.text('Museus Centro — Galeria de Fotos', margin, pageH - 6);
          doc.text(`${doc.internal.getNumberOfPages()}`, pageW - margin, pageH - 6, { align: 'right' });
        }
      }

      setProgresso('Salvando arquivo...');
      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`Galeria_MuseusCentro_${ts}.pdf`);
      toast.success('PDF gerado e baixado com sucesso!');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
      setProgresso('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
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
              <span><strong>{fotosValidas.length}</strong> fotos identificadas serão incluídas no PDF</span>
            </div>
            {fotos.length - fotosValidas.length > 0 && (
              <p className="text-xs text-amber-600">
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
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{progresso || 'Gerando PDF...'}</span>
            </div>
          )}

          <p className="text-xs text-gray-400">
            O PDF é gerado e baixado diretamente no seu navegador. Para muitas fotos, pode levar alguns minutos.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
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