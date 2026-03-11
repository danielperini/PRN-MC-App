import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ExportRubricasExcelButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('generateBudgetLineExcel', {});
      
      if (res.data?.file_url) {
        toast.success(`Planilha criada: ${res.data.arquivo}`);
        // Abrir link para download se disponível
        if (res.data.file_url) {
          window.open(res.data.file_url, '_blank');
        }
      } else if (res.data?.success) {
        toast.success('Planilha gerada com sucesso');
      }
    } catch (e) {
      toast.error('Erro ao gerar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleExport}
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Gerando...
        </>
      ) : (
        <>
          <FileDown className="w-4 h-4" />
          Exportar Rubricas XLS
        </>
      )}
    </Button>
  );
}