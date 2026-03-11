import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function RubricaExporter({ rubricas }) {
  const exportToExcel = () => {
    try {
      if (!rubricas || rubricas.length === 0) {
        toast.error('Nenhuma rubrica para exportar');
        return;
      }

      const headers = ['Grupo', 'Rubrica', 'Parcelas', 'Valor Total', 'Utilizado', 'Saldo', '% Utilizado', 'Observação'];
      const rows = rubricas.map(r => [
        r.grupo,
        r.rubrica,
        r.numero_parcelas_unidades || '',
        r.valor_rubrica,
        r.valor_utilizado || 0,
        r.saldo || 0,
        (r.percentual_utilizado || 0).toFixed(2),
        r.observacao_uso || '',
      ]);

      const totalRow = [
        'TOTAL',
        '',
        '',
        rubricas.reduce((sum, r) => sum + r.valor_rubrica, 0),
        rubricas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0),
        rubricas.reduce((sum, r) => sum + (r.saldo || 0), 0),
        ((rubricas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0) / rubricas.reduce((sum, r) => sum + r.valor_rubrica, 0)) * 100).toFixed(2),
        '',
      ];

      const csv = [
        headers.join('\t'),
        ...rows.map(row => row.join('\t')),
        totalRow.join('\t'),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/tab-separated-values' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rubricas_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Arquivo exportado!');
    } catch (e) {
      toast.error('Erro ao exportar: ' + e.message);
    }
  };

  const exportToPDF = () => {
    toast.info('Exportação PDF em desenvolvimento');
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" className="gap-2" onClick={exportToExcel}>
        <Download className="w-4 h-4" />
        Excel
      </Button>
      <Button variant="outline" className="gap-2" onClick={exportToPDF}>
        <FileText className="w-4 h-4" />
        PDF
      </Button>
    </div>
  );
}