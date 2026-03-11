import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function RubricaExporter({ rubricas }) {
  const handleExportExcel = () => {
    const dadosExporte = rubricas.filter(r => r.ativo).map(r => ({
      Grupo: r.grupo,
      Rubrica: r.rubrica,
      'Nº de Parcelas': r.numero_parcelas_unidades,
      'Valor da Rubrica': r.valor_rubrica,
      'Valor Utilizado': r.valor_utilizado || 0,
      'Saldo': r.saldo || 0,
      '% Utilizado': ((r.percentual_utilizado || 0).toFixed(2)) + '%',
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExporte);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rubricas');
    XLSX.writeFile(wb, `Rubricas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <Button variant="outline" onClick={handleExportExcel} className="text-xs gap-2">
      <Download className="w-4 h-4" />
      Exportar
    </Button>
  );
}