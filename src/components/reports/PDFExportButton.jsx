import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { FileDown, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function PDFExportButton({ reportId, reportProtocolo, disabled = false }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      const response = await base44.functions.invoke('generateReportPDF', {
        reportId
      });

      if (response.data) {
        // Criar blob a partir da resposta
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio-${reportProtocolo}.pdf`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);

        toast.success('Relatório exportado com sucesso');
      }
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast.error('Erro ao exportar relatório');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={disabled || isExporting}
      variant="outline"
      className="gap-2"
      title="Exportar relatório em PDF"
    >
      {isExporting ? (
        <>
          <Loader className="w-4 h-4 animate-spin" />
          Exportando...
        </>
      ) : (
        <>
          <FileDown className="w-4 h-4" />
          Exportar PDF
        </>
      )}
    </Button>
  );
}