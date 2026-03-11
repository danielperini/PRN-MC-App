import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { FileDown, Loader2 } from 'lucide-react';

export default function PDFGeneratorDialog({ open, onClose, selectedReports, reports, museus }) {
  const [generating, setGenerating] = useState(false);
  const [config, setConfig] = useState({
    titulo: 'Relatório Consolidado',
    subtitle: 'Museus Centro - Relatórios Mensais',
    incluirSumario: true,
    incluirAtividades: true,
    incluirGastos: true,
    incluirObservacoes: true,
    dataRelatorio: new Date().toLocaleDateString('pt-BR'),
    museusSelecionados: museus
  });

  const selectedReportsData = Array.from(selectedReports).map(id => reports.find(r => r.id === id)).filter(Boolean);
  const museusCoverage = [...new Set(selectedReportsData.map(r => r.museu))];

  const handleGeneratePDF = async () => {
    if (selectedReports.size === 0) {
      toast.error('Selecione ao menos um relatório');
      return;
    }

    setGenerating(true);
    try {
      const response = await base44.functions.invoke('generateCustomPDF', {
        reportIds: Array.from(selectedReports),
        config: config
      });

      if (response.data?.error) {
        toast.error(response.data.error);
      } else {
        toast.success('PDF gerado com sucesso!');
        onClose();
      }
    } catch (err) {
      toast.error('Erro ao gerar PDF: ' + (err?.message || 'tente novamente'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar PDF Consolidado</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            {selectedReports.size} relatório(s) selecionado(s) de {museusCoverage.length} museu(s)
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Título */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Título do Documento</Label>
            <Input
              value={config.titulo}
              onChange={e => setConfig(p => ({ ...p, titulo: e.target.value }))}
              placeholder="Ex: Relatório Consolidado"
            />
          </div>

          {/* Subtítulo */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Subtítulo</Label>
            <Input
              value={config.subtitle}
              onChange={e => setConfig(p => ({ ...p, subtitle: e.target.value }))}
              placeholder="Ex: Museus Centro - 2026"
            />
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Data do Relatório</Label>
            <Input
              value={config.dataRelatorio}
              onChange={e => setConfig(p => ({ ...p, dataRelatorio: e.target.value }))}
              type="text"
            />
          </div>

          {/* Opções de Conteúdo */}
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-semibold text-gray-900">Incluir no PDF:</p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.incluirSumario}
                  onCheckedChange={v => setConfig(p => ({ ...p, incluirSumario: v }))}
                  id="sumario"
                />
                <Label htmlFor="sumario" className="text-sm cursor-pointer">Sumário automático</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.incluirAtividades}
                  onCheckedChange={v => setConfig(p => ({ ...p, incluirAtividades: v }))}
                  id="atividades"
                />
                <Label htmlFor="atividades" className="text-sm cursor-pointer">Tabela de atividades</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.incluirGastos}
                  onCheckedChange={v => setConfig(p => ({ ...p, incluirGastos: v }))}
                  id="gastos"
                />
                <Label htmlFor="gastos" className="text-sm cursor-pointer">Tabela de gastos (se disponível)</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={config.incluirObservacoes}
                  onCheckedChange={v => setConfig(p => ({ ...p, incluirObservacoes: v }))}
                  id="obs"
                />
                <Label htmlFor="obs" className="text-sm cursor-pointer">Observações dos coordenadores</Label>
              </div>
            </div>
          </div>

          {/* Museus */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Museus Inclusos</Label>
            <div className="flex flex-wrap gap-2">
              {museusCoverage.map(m => (
                <span key={m} className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full border border-gray-200">
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Relatórios selecionados */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Relatórios</Label>
            <div className="max-h-40 overflow-y-auto space-y-1 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              {selectedReportsData.map(r => (
                <div key={r.id} className="text-sm text-gray-700 flex justify-between">
                  <span>{r.author_name}</span>
                  <span className="text-gray-500">{r.mes_referencia} {r.ano}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={generating}>
            Cancelar
          </Button>
          <Button
            className="bg-black hover:bg-gray-800 text-white gap-2"
            onClick={handleGeneratePDF}
            disabled={generating || selectedReports.size === 0}
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                Gerar PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}