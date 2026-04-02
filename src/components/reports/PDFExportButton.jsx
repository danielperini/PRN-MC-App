import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { FileDown, Loader, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toastMessages } from '@/lib/toastMessages';

const CAMPOS = [
  { id: 'identificacao', label: 'Identificação do Relatório' },
  { id: 'resumo', label: 'Resumo Executivo' },
  { id: 'atividades', label: 'Atividades Realizadas' },
  { id: 'avaliacao', label: 'Avaliação (Pontos, Desafios, Sugestões)' },
  { id: 'oportunidades', label: 'Oportunidades' },
  { id: 'depoimentos', label: 'Depoimentos' },
  { id: 'fotos', label: 'Miniaturas de Fotos' },
];

export default function PDFExportButton({ reportId, reportProtocolo, reportData, disabled = false }) {
  const [showDialog, setShowDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFields, setSelectedFields] = useState(CAMPOS.map(c => c.id));
  const [assinatura, setAssinatura] = useState('');

  const toggleField = (id) => {
    setSelectedFields(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setShowDialog(false);

      const response = await base44.functions.invoke('generateReportPDF', {
        reportId,
        selectedFields,
        assinatura,
      });

      if (response.data) {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio-${reportProtocolo || reportId}.pdf`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        toastMessages.pdfGenerateSuccess?.() ?? alert('PDF gerado com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toastMessages.pdfGenerateFailed?.(error?.message) ?? alert('Erro ao gerar PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        disabled={disabled || isExporting}
        className="gap-2"
      >
        {isExporting ? (
          <><Loader className="w-4 h-4 animate-spin" /> Gerando PDF...</>
        ) : (
          <><FileDown className="w-4 h-4" /> Exportar PDF</>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" /> Configurar Exportação PDF
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Seções a incluir:</p>
              <div className="space-y-2">
                {CAMPOS.map(campo => (
                  <div key={campo.id} className="flex items-center gap-2">
                    <Checkbox
                      id={campo.id}
                      checked={selectedFields.includes(campo.id)}
                      onCheckedChange={() => toggleField(campo.id)}
                    />
                    <Label htmlFor={campo.id} className="text-sm cursor-pointer">
                      {campo.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t">
              <Label className="text-sm font-medium text-gray-700">
                Assinatura do responsável
              </Label>
              <Input
                className="mt-1"
                placeholder="Nome completo para assinatura"
                value={assinatura}
                onChange={e => setAssinatura(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Após assinar, o PDF deve ser enviado ao coordenador até o dia 15 do mês seguinte ao mês de referência do relatório.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleExport} disabled={selectedFields.length === 0}>
              <FileDown className="w-4 h-4 mr-2" /> Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}