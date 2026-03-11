import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const AVAILABLE_COLUMNS = [
  { id: 'data', label: 'Data' },
  { id: 'descricao', label: 'Descrição' },
  { id: 'valor', label: 'Valor' },
  { id: 'atividade', label: 'Atividade' },
  { id: 'rubrica', label: 'Rubrica' },
  { id: 'status', label: 'Status' },
  { id: 'percentual_orcamento', label: '% Orçamento' },
  { id: 'responsavel', label: 'Responsável' },
];

export default function FinancialExcelExporter() {
  const [selectedColumns, setSelectedColumns] = useState(
    AVAILABLE_COLUMNS.map(c => c.id)
  );
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: statuses = [] } = useQuery({
    queryKey: ['purchase-statuses'],
    queryFn: async () => {
      const purchases = await base44.entities.PurchaseRequest.list();
      return [...new Set(purchases.map(p => p.status))];
    },
  });

  const handleColumnToggle = (columnId) => {
    setSelectedColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId]
    );
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('generateFinancialExcelReport', {
        dateFrom,
        dateTo,
        columns: selectedColumns,
        filterByStatus: status,
      });

      // Criar blob e download
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio_financeiro_${new Date().getTime()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 md:p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 w-full">
      <div className="space-y-4 md:space-y-6">
        {/* Cabeçalho */}
        <div>
          <h3 className="font-bold text-base md:text-lg text-gray-900">Exportar Relatório Financeiro</h3>
          <p className="text-xs md:text-sm text-gray-600 mt-1">
            Selecione colunas, filtros e baixe em Excel com fórmulas
          </p>
        </div>

        {/* Filtros de Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <div>
            <label className="text-xs md:text-sm font-semibold text-gray-700 block mb-2">
              Data Inicial
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 md:py-2.5 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs md:text-sm font-semibold text-gray-700 block mb-2">
              Data Final
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 md:py-2.5 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Filtro de Status */}
        <div>
          <label className="text-xs md:text-sm font-semibold text-gray-700 block mb-2">
            Status (opcional)
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="text-xs md:text-sm">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todos os status</SelectItem>
              {statuses.map(s => (
                <SelectItem key={s} value={s} className="text-xs md:text-sm">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Seleção de Colunas */}
        <div>
          <label className="text-xs md:text-sm font-semibold text-gray-700 block mb-3">
            Colunas a Exportar
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
            {AVAILABLE_COLUMNS.map(col => (
              <div key={col.id} className="flex items-center gap-2">
                <Checkbox
                  id={col.id}
                  checked={selectedColumns.includes(col.id)}
                  onCheckedChange={() => handleColumnToggle(col.id)}
                />
                <label
                  htmlFor={col.id}
                  className="text-xs md:text-sm text-gray-700 cursor-pointer"
                >
                  {col.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Botão de Export */}
        <Button
          onClick={handleExport}
          disabled={loading || selectedColumns.length === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 py-2 md:py-2.5 text-sm md:text-base"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Gerando Excel...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Exportar para Excel
            </>
          )}
        </Button>

        {/* Informações */}
        <div className="text-xs md:text-sm text-gray-600 bg-white/50 p-3 md:p-4 rounded border border-blue-200">
          <p className="font-semibold mb-2">Incluído no relatório:</p>
          <ul className="space-y-1 list-disc list-inside text-xs md:text-sm">
            <li>4 abas: Detalhado, Por Atividade, Por Status, Por Rubrica</li>
            <li>Somas, percentuais e médias calculadas automaticamente</li>
            <li>Formatação de moeda e células bloqueadas</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}