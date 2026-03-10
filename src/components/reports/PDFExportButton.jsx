import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Download, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function PDFExportButton({ reportId, fileName }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    if (!reportId) {
      toast.error('Salve o relatório antes de exportar');
      return;
    }

    setIsLoading(true);
    try {
      const response = await base44.functions.invoke('generateReportPDF', {
        reportId,
      });

      if (response.status === 200) {
        // Cria um blob a partir da resposta
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || `Relatorio.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast.success('PDF gerado e baixado com sucesso!');
      } else {
        toast.error('Erro ao gerar PDF');
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao exportar relatório para PDF');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={isLoading || !reportId}
      className="bg-red-600 hover:bg-red-700 text-white gap-2"
      title={!reportId ? 'Salve o relatório para exportar' : 'Baixar relatório em PDF'}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Gerando...
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          <span>Exportar PDF</span>
        </>
      )}
    </Button>
  );
}