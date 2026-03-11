import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Loader2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];

export default function ContractActivityReportGenerator({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    equipe: '',
    museu: ''
  });

  const handleGenerateReport = async () => {
    if (!filters.startDate || !filters.endDate) {
      toast.error('Selecione o período (data inicial e final)');
      return;
    }

    if (new Date(filters.startDate) > new Date(filters.endDate)) {
      toast.error('A data inicial deve ser anterior à final');
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('generateContractsActivitiesReport', {
        startDate: filters.startDate,
        endDate: filters.endDate,
        equipe: filters.equipe || undefined,
        museu: filters.museu || undefined
      });

      if (response.data && response.data.error) {
        toast.error(response.data.error);
      } else {
        toast.success('Relatório gerado com sucesso!');
        onClose();
      }
    } catch (err) {
      toast.error('Erro ao gerar relatório: ' + (err?.message || 'tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Gerar Relatório de Contratos e Atividades
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Período */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-black">Período</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Data Inicial</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Data Final</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Filtros opcionais */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-black">Filtros (opcionais)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Museu</Label>
                <Select value={filters.museu} onValueChange={v => setFilters(prev => ({ ...prev, museu: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Todos os museus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— Todos os museus —</SelectItem>
                    {MUSEUS.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Equipe / Função</Label>
                <Select value={filters.equipe} onValueChange={v => setFilters(prev => ({ ...prev, equipe: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Todas as equipes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>— Todas as equipes —</SelectItem>
                    {EQUIPES.map(e => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Preview de filtros */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <p className="text-blue-900 font-medium mb-1">Preview:</p>
            <p className="text-blue-700 text-xs">
              Relatório consolidado de contratos e atividades
              {filters.startDate && filters.endDate && ` de ${new Date(filters.startDate).toLocaleDateString('pt-BR')} a ${new Date(filters.endDate).toLocaleDateString('pt-BR')}`}
              {filters.museu && ` do museu ${filters.museu}`}
              {filters.equipe && ` da equipe ${filters.equipe}`}
            </p>
          </div>

          {/* Ações */}
          <div className="flex gap-2 justify-end border-t pt-4">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white gap-2"
              onClick={handleGenerateReport}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Gerar PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}