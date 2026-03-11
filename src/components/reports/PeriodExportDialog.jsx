import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

export default function PeriodExportDialog({ open, onClose, museusUnicos = [] }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMuseum, setSelectedMuseum] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Informe ambas as datas');
      return;
    }
    if (!selectedMuseum) {
      toast.error('Selecione um museu');
      return;
    }

    setIsLoading(true);
    try {
      const response = await base44.functions.invoke('generateMuseumConsolidatedReport', {
        dateFrom,
        dateTo,
        museum: selectedMuseum
      });

      if (response.data?.error) {
        toast.error(response.data.error);
      } else if (response.data?.pdf_url) {
        toast.success('Relatório gerado com sucesso!');
        // Abre o PDF em nova aba
        window.open(response.data.pdf_url, '_blank');
        onClose();
      } else {
        toast.success('Relatório consolidado gerado com sucesso!');
        onClose();
      }
    } catch (err) {
      toast.error('Erro ao gerar relatório: ' + (err?.message || 'tente novamente'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar Consolidado por Período</DialogTitle>
          <DialogDescription>
            Selecione um museu e um intervalo de datas para gerar um PDF consolidado de atividades e gastos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Museu</label>
            <Select value={selectedMuseum} onValueChange={setSelectedMuseum}>
              <SelectTrigger className="border border-gray-100">
                <SelectValue placeholder="Selecione um museu" />
              </SelectTrigger>
              <SelectContent>
                {museusUnicos.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Data Inicial</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-100"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Data Final</label>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="border border-gray-100"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button 
            className="bg-black hover:bg-gray-800 text-white gap-2" 
            onClick={handleExport}
            disabled={isLoading}
          >
            {isLoading ? (
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}