import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';
import { toastMessages } from '@/lib/toastMessages';

const AVAILABLE_COLUMNS = [
  { key: 'museu', label: 'Museu', default: true },
  { key: 'data', label: 'Data', default: true },
  { key: 'horario', label: 'Horário', default: true },
  { key: 'titulo', label: 'Nome da Ação', default: true },
  { key: 'sinopse', label: 'Sinopse', default: true },
  { key: 'publico_alvo', label: 'Público-alvo', default: false },
  { key: 'vagas', label: 'Vagas', default: false },
  { key: 'inscricao', label: 'Inscrição', default: false },
  { key: 'local', label: 'Local', default: true },
  { key: 'tipo', label: 'Tipo de Atividade', default: false },
  { key: 'acessibilidade', label: 'Acessibilidade', default: false },
  { key: 'link_imagens', label: 'Link Imagens', default: false },
  { key: 'minibios', label: 'Minibios', default: false },
  { key: 'material_divulgacao_aprovado', label: 'Material de Divulgação', default: false },
];

export default function ExportProgramacaoDialog({
  open,
  onClose,
  data,
  currentMonth,
  formatMonthLabel,
}) {
  const [selectedColumns, setSelectedColumns] = useState(
    AVAILABLE_COLUMNS.filter(c => c.default).map(c => c.key)
  );
  const [exporting, setExporting] = useState(false);

  const toggleColumn = (key) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      toastMessages.warning('Selecione pelo menos uma coluna.');
      return;
    }

    setExporting(true);
    try {
      const doc = new (await import('jspdf')).jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const contentWidth = pageWidth - 2 * margin;

      let yPosition = margin;

      // Cabeçalho
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('Museus Centro', margin, yPosition);
      yPosition += 7;

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('Programação — Espelho da Planilha', margin, yPosition);
      yPosition += 6;

      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(`Mês: ${formatMonthLabel(currentMonth)}`, margin, yPosition);
      yPosition += 4;

      doc.text(
        `Data de geração: ${new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        margin,
        yPosition
      );
      yPosition += 8;

      // Tabela com dados
      const columns = AVAILABLE_COLUMNS.filter(c => selectedColumns.includes(c.key));
      const colWidth = contentWidth / columns.length;

      // Cabeçalho da tabela
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setFillColor(240, 240, 240);

      columns.forEach((col, idx) => {
        const xPos = margin + idx * colWidth;
        doc.rect(xPos, yPosition, colWidth, 6, 'F');
        doc.text(col.label, xPos + 1, yPosition + 4.5, { maxWidth: colWidth - 2 });
      });
      yPosition += 7;

      // Dados
      doc.setFont(undefined, 'normal');
      data.forEach((item) => {
        let rowHeight = 5;

        // Calcular altura necessária
        const textLines = [];
        columns.forEach((col) => {
          const value = item[col.key] || '—';
          const lines = doc.splitTextToSize(String(value), colWidth - 2);
          textLines.push(lines);
          rowHeight = Math.max(rowHeight, lines.length * 3.5);
        });

        // Verificar se precisa de nova página
        if (yPosition + rowHeight > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
        }

        // Desenhar linhas de dados
        columns.forEach((col, idx) => {
          const xPos = margin + idx * colWidth;
          const value = item[col.key] || '—';
          const lines = textLines[idx];

          doc.rect(xPos, yPosition, colWidth, rowHeight);
          lines.forEach((line, lineIdx) => {
            doc.text(line, xPos + 1, yPosition + 2 + lineIdx * 3.5, {
              maxWidth: colWidth - 2,
            });
          });
        });

        yPosition += rowHeight;
      });

      // Rodapé
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Total de atividades: ${data.length} | Página ${i} de ${pageCount}`,
          margin,
          pageHeight - 5
        );
      }

      // Download
      const fileName = `programacao-espelho-${formatMonthLabel(currentMonth).replace(/\s+/g, '-').toLowerCase()}.pdf`;
      doc.save(fileName);

      toastMessages.info(`PDF "${fileName}" gerado com sucesso!`);
      onClose();
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toastMessages.createFailed('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar Programação</DialogTitle>
          <DialogDescription>
            Selecione as colunas que deseja incluir no relatório. Será gerado um PDF em formato paisagem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-4 space-y-3">
            {AVAILABLE_COLUMNS.map((col) => (
              <div key={col.key} className="flex items-center gap-2">
                <Checkbox
                  id={`col-${col.key}`}
                  checked={selectedColumns.includes(col.key)}
                  onCheckedChange={() => toggleColumn(col.key)}
                />
                <Label htmlFor={`col-${col.key}`} className="text-sm font-normal cursor-pointer">
                  {col.label}
                </Label>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-500">
            <p>Selecionadas: {selectedColumns.length} de {AVAILABLE_COLUMNS.length} colunas</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={exporting}>
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || selectedColumns.length === 0}
            className="gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Exportar PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}