import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

const PHOTO_FIELDS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url', 'drive_url', 'gallery_url'];

function text(value) {
  return String(value ?? '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFilename(value) {
  return text(value || 'sem-identificacao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function photoUrl(photo = {}) {
  for (const field of PHOTO_FIELDS) {
    if (text(photo?.[field])) return text(photo[field]);
  }
  return '';
}

function activityId(activity = {}) {
  return text(activity.id || activity.activity_id || activity.atividade_id || activity.evento_id || activity.programacao_id);
}

function activityTitle(activity = {}) {
  return text(activity.nome || activity.titulo || activity.nome_acao || activity.atividade || activity.descricao || 'Atividade');
}

function reportActivities(report = {}) {
  return [
    report.atividades,
    report.activities,
    report.atividades_realizadas,
    report._atividades_periodo,
    report._agenda_periodo,
    report.tabelas_estruturadas?.atividades,
  ].flatMap(asArray);
}

function embeddedPhotos(report = {}) {
  return [
    report.fotos,
    report.photos,
    report.anexos_fotograficos,
    report.anexos_evidencias,
    report.galeria_fotos,
    report._fotos_atividades,
  ].flatMap(asArray);
}

function uniquePhotos(items = []) {
  const map = new Map();
  for (const item of items) {
    const url = photoUrl(item).split('?')[0];
    if (url && !map.has(url)) map.set(url, item);
  }
  return [...map.values()];
}

function photoBelongsToActivity(photo, activity) {
  const linked = text(photo.activity_id || photo.atividade_id || photo.evento_id || photo.programacao_id);
  const id = activityId(activity);
  if (linked && id && linked === id) return true;

  const caption = normalize(`${photo.atividade_nome || ''} ${photo.legenda || ''} ${photo.titulo || ''}`);
  const title = normalize(activityTitle(activity));
  return Boolean(title.length >= 6 && caption.includes(title));
}

async function urlToDataUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;

  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Falha ao carregar imagem (${response.status})`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Arquivo não é uma imagem válida');

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function imageFormat(dataUrl) {
  if (/^data:image\/(png)/i.test(dataUrl)) return 'PNG';
  if (/^data:image\/(webp)/i.test(dataUrl)) return 'WEBP';
  return 'JPEG';
}

async function addPhotoPage(pdf, photo, title, index) {
  const url = photoUrl(photo);
  if (!url) return false;

  try {
    const dataUrl = await urlToDataUrl(url);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - 42;
    const properties = pdf.getImageProperties(dataUrl);
    const ratio = Math.min(maxWidth / properties.width, maxHeight / properties.height);
    const width = properties.width * ratio;
    const height = properties.height * ratio;

    pdf.addPage();
    pdf.setFontSize(11);
    pdf.text(`${title} — Foto ${index + 1}`, margin, 14);
    pdf.addImage(dataUrl, imageFormat(dataUrl), margin + (maxWidth - width) / 2, 22, width, height, undefined, 'FAST');

    const caption = text(photo.legenda || photo.titulo || photo.atividade_nome || photo.descricao);
    if (caption) {
      pdf.setFontSize(8);
      const captionLines = pdf.splitTextToSize(caption, maxWidth);
      pdf.text(captionLines, margin, Math.min(pageHeight - 10, 26 + height));
    }
    return true;
  } catch (error) {
    console.warn('Foto não incluída no PDF:', url, error);
    return false;
  }
}

export default function BatchPDFExport({ reports = [] }) {
  const [showDialog, setShowDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, report: '' });

  const reportIds = useMemo(() => reports.map((report) => report.id).filter(Boolean), [reports]);

  useEffect(() => {
    if (showDialog) setSelectedIds(new Set(reportIds));
  }, [showDialog, reportIds]);

  const toggleReport = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((current) => current.size === reportIds.length ? new Set() : new Set(reportIds));
  };

  const generateBatchPDF = async () => {
    if (selectedIds.size === 0) {
      toast.error('Selecione ao menos um relatório');
      return;
    }

    setGenerating(true);
    const selectedReports = reports.filter((report) => selectedIds.has(report.id));
    setProgress({ current: 0, total: selectedReports.length, report: '' });

    try {
      const { jsPDF } = await import('jspdf');
      const reportPhotos = await base44.entities.ReportPhoto.list('-created_date', 10000).catch(() => []);
      let exported = 0;
      let photosIncluded = 0;

      for (let reportIndex = 0; reportIndex < selectedReports.length; reportIndex += 1) {
        const report = selectedReports[reportIndex];
        const author = report.author_name || report.created_by || 'Sem autor';
        setProgress({ current: reportIndex + 1, total: selectedReports.length, report: author });

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageHeight = pdf.internal.pageSize.getHeight();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 12;
        let yPos = margin;

        const ensureSpace = (height = 16) => {
          if (yPos + height > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
          }
        };

        const writeParagraph = (value, fontSize = 9, indent = 0) => {
          const content = text(value) || '—';
          pdf.setFontSize(fontSize);
          const lines = pdf.splitTextToSize(content, pageWidth - 2 * margin - indent);
          ensureSpace(lines.length * 4 + 4);
          pdf.text(lines, margin + indent, yPos);
          yPos += lines.length * 4 + 4;
        };

        pdf.setFontSize(18);
        pdf.text('Relatório Mensal de Atividades', margin, yPos);
        yPos += 10;
        pdf.setFontSize(10);
        pdf.text(`${report.mes_referencia || 'Sem mês'} ${report.ano || ''} — ${author}`, margin, yPos);
        yPos += 6;
        pdf.text(`Museu: ${report.museu || 'Não informado'}`, margin, yPos);
        yPos += 10;

        pdf.setFontSize(12);
        pdf.text('Resumo Executivo', margin, yPos);
        yPos += 6;
        writeParagraph(report.resumo_executivo || report.resumo || '(sem resumo executivo)', 10);

        const activities = reportActivities(report);
        const reportLinkedPhotos = uniquePhotos([
          ...embeddedPhotos(report),
          ...asArray(reportPhotos).filter((photo) => text(photo.report_id || photo.relatorio_id) === text(report.id)),
        ]);

        if (activities.length > 0) {
          ensureSpace(12);
          pdf.setFontSize(12);
          pdf.text('Atividades', margin, yPos);
          yPos += 7;

          for (let activityIndex = 0; activityIndex < activities.length; activityIndex += 1) {
            const activity = activities[activityIndex];
            ensureSpace(22);
            pdf.setFontSize(10);
            pdf.text(`${activityIndex + 1}. ${activityTitle(activity)}`, margin, yPos);
            yPos += 5;

            const date = text(activity.data || activity.data_atividade || activity.data_inicio);
            const publicTotal = Number(activity.publico_total || activity.total_publico || activity.publico_realizado || activity.participantes || activity.visitantes || 0);
            const metadata = [date ? `Data: ${date}` : '', publicTotal > 0 ? `Público: ${publicTotal.toLocaleString('pt-BR')}` : ''].filter(Boolean).join(' | ');
            if (metadata) writeParagraph(metadata, 8, 3);
            writeParagraph(activity.descricao_executado || activity.descricao || activity.objetivo || activity.resultado_alcancado || '', 9, 3);

            const activityPhotos = reportLinkedPhotos.filter((photo) => photoBelongsToActivity(photo, activity));
            for (let photoIndex = 0; photoIndex < activityPhotos.length; photoIndex += 1) {
              const included = await addPhotoPage(pdf, activityPhotos[photoIndex], activityTitle(activity), photoIndex);
              if (included) photosIncluded += 1;
            }
          }
        }

        const linkedActivityPhotoUrls = new Set(
          activities.flatMap((activity) => reportLinkedPhotos.filter((photo) => photoBelongsToActivity(photo, activity))).map((photo) => photoUrl(photo).split('?')[0]),
        );
        const remainingPhotos = reportLinkedPhotos.filter((photo) => !linkedActivityPhotoUrls.has(photoUrl(photo).split('?')[0]));
        for (let photoIndex = 0; photoIndex < remainingPhotos.length; photoIndex += 1) {
          const included = await addPhotoPage(pdf, remainingPhotos[photoIndex], 'Galeria complementar do relatório', photoIndex);
          if (included) photosIncluded += 1;
        }

        const filename = `relatorio_atividade_${safeFilename(author)}_${safeFilename(report.mes_referencia)}_${safeFilename(report.ano)}.pdf`;
        pdf.save(filename);
        exported += 1;

        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      toast.success(`${exported} relatório(s) exportado(s) separadamente, com ${photosIncluded} foto(s) incluída(s).`);
      setShowDialog(false);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Erro ao exportar relatórios:', error);
      toast.error(`Erro ao gerar PDFs: ${error?.message || 'tente novamente'}`);
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0, report: '' });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="border-black gap-2"
        onClick={() => setShowDialog(true)}
        disabled={reports.length === 0}
      >
        <Download className="w-4 h-4" />
        Exportar todos com fotos
      </Button>

      <Dialog open={showDialog} onOpenChange={(open) => !generating && setShowDialog(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar relatórios de atividades</DialogTitle>
            <p className="text-sm text-gray-500">
              Cada relatório será baixado em um PDF separado, incluindo as fotos anexadas e vinculadas às atividades.
            </p>
          </DialogHeader>

          <div className="space-y-4 mt-4 max-h-[400px] overflow-y-auto">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Checkbox
                checked={selectedIds.size === reports.length && reports.length > 0}
                onCheckedChange={toggleAll}
                id="select-all-reports"
                disabled={generating}
              />
              <label htmlFor="select-all-reports" className="text-sm font-semibold cursor-pointer">
                Selecionar todos ({reports.length})
              </label>
            </div>

            {reports.map((report) => (
              <div key={report.id} className="flex items-start gap-2">
                <Checkbox
                  checked={selectedIds.has(report.id)}
                  onCheckedChange={() => toggleReport(report.id)}
                  id={`report-${report.id}`}
                  className="mt-1"
                  disabled={generating}
                />
                <label htmlFor={`report-${report.id}`} className="text-sm cursor-pointer flex-1">
                  <p className="font-medium text-black">{report.author_name || report.created_by || 'Sem autor'}</p>
                  <p className="text-xs text-gray-500">
                    {report.mes_referencia} {report.ano} — {report.museu}
                  </p>
                </label>
              </div>
            ))}
          </div>

          {generating && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Exportando {progress.current} de {progress.total}: {progress.report || 'Preparando relatório'}
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={generating}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={generateBatchPDF}
              disabled={generating || selectedIds.size === 0}
            >
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {generating ? 'Exportando...' : `Exportar (${selectedIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
