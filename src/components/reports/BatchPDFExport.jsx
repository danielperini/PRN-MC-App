import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Download, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function BatchPDFExport({ reports = [] }) {
  const [showDialog, setShowDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [generating, setGenerating] = useState(false);

  const toggleReport = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === reports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reports.map(r => r.id)));
    }
  };

  const generateBatchPDF = async () => {
    if (selectedIds.size === 0) {
      toast.error('Selecione ao menos um relatório');
      return;
    }

    setGenerating(true);

    try {
      const { jsPDF } = await import('jspdf');
      const selectedReports = reports.filter(r => selectedIds.has(r.id));

      // Gerar e baixar cada PDF individualmente
      for (const report of selectedReports) {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageHeight = pdf.internal.pageSize.getHeight();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 12;
        let yPos = margin;

        // Título
        pdf.setFontSize(18);
        pdf.text('Relatório Mensal', margin, yPos);
        yPos += 10;

        // Info do relatório
        pdf.setFontSize(10);
        pdf.text(`${report.mes_referencia}/${report.ano} — ${report.author_name}`, margin, yPos);
        yPos += 6;
        pdf.text(`Museu: ${report.museu}`, margin, yPos);
        yPos += 10;

        // Resumo
        pdf.setFontSize(12);
        pdf.text('Resumo Executivo', margin, yPos);
        yPos += 6;
        pdf.setFontSize(10);
        const resumoLines = pdf.splitTextToSize(report.resumo_executivo || '(sem resumo)', pageWidth - 2 * margin);
        pdf.text(resumoLines, margin, yPos);
        yPos += resumoLines.length * 5 + 5;

        if (yPos > pageHeight - 20) {
          pdf.addPage();
          yPos = margin;
        }

        // Atividades
        if (report.atividades && report.atividades.length > 0) {
          pdf.setFontSize(12);
          pdf.text('Atividades', margin, yPos);
          yPos += 6;

          report.atividades.forEach((ativ, idx) => {
            if (yPos > pageHeight - 20) {
              pdf.addPage();
              yPos = margin;
            }

            pdf.setFontSize(10);
            pdf.text(`${idx + 1}. ${ativ.nome || ativ.titulo || 'Atividade'}`, margin, yPos);
            yPos += 5;
            pdf.setFontSize(9);
            const descLines = pdf.splitTextToSize(ativ.descricao_executado || ativ.objetivo || '', pageWidth - 2 * margin - 5);
            pdf.text(descLines, margin + 3, yPos);
            yPos += descLines.length * 4 + 3;
          });
        }

        const filename = `relatorio_${report.author_name}_${report.mes_referencia}_${report.ano}.pdf`;
        pdf.save(filename);
        
        // Pequeno delay entre downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      toast.success(`${selectedIds.size} relatório(s) exportado(s) com sucesso!`);
      setShowDialog(false);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Erro ao gerar PDF em lote:', error);
      toast.error('Erro ao gerar PDFs');
    } finally {
      setGenerating(false);
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
        Exportar PDFs
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar relatórios em PDF</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4 max-h-[400px] overflow-y-auto">
            {/* Select All */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Checkbox
                checked={selectedIds.size === reports.length && reports.length > 0}
                onCheckedChange={toggleAll}
                id="select-all"
              />
              <label htmlFor="select-all" className="text-sm font-semibold cursor-pointer">
                Selecionar todos ({reports.length})
              </label>
            </div>

            {/* Reports List */}
            {reports.map(report => (
              <div key={report.id} className="flex items-start gap-2">
                <Checkbox
                  checked={selectedIds.has(report.id)}
                  onCheckedChange={() => toggleReport(report.id)}
                  id={`report-${report.id}`}
                  className="mt-1"
                />
                <label htmlFor={`report-${report.id}`} className="text-sm cursor-pointer flex-1">
                  <p className="font-medium text-black">{report.author_name}</p>
                  <p className="text-xs text-gray-500">
                    {report.mes_referencia}/{report.ano} — {report.museu}
                  </p>
                </label>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={generateBatchPDF}
              disabled={generating || selectedIds.size === 0}
            >
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {generating ? 'Gerando...' : `Exportar (${selectedIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}