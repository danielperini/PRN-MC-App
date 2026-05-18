import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import GastosRubricaPanel from './GastosRubricaPanel';

export default function EditRubricaDialog({ rubrica, isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    saldo_inicial: rubrica?.saldo_inicial || 0,
    saldo_comprometido: rubrica?.saldo_comprometido || 0,
  });
  const [saving, setSaving] = useState(false);

  const saldo_disponivel = (formData.saldo_inicial || 0) - (formData.saldo_comprometido || 0);
  const fmt = (v) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const handleSave = async () => {
    if (!rubrica?.id) return;
    
    setSaving(true);
    try {
      await base44.entities.BudgetLine.update(rubrica.id, {
        saldo_inicial: parseFloat(formData.saldo_inicial) || 0,
        saldo_comprometido: parseFloat(formData.saldo_comprometido) || 0,
      });
      toast.success('Rubrica atualizada com sucesso!');
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error('Erro ao atualizar: ' + e.message);
    }
    setSaving(false);
  };

  if (!rubrica) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Editar Rubrica Orçamentária
          </DialogTitle>
          <DialogDescription>
            Atualize os valores de saldo e comprometimento para {rubrica.codigo}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="valores" className="w-full flex flex-col flex-1 min-h-0 overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="valores">Valores</TabsTrigger>
            <TabsTrigger value="gastos">Gastos</TabsTrigger>
          </TabsList>

          <TabsContent value="valores" className="space-y-4 overflow-y-auto flex-1">
            {/* Info rubrica */}
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <p className="font-medium text-gray-900">{rubrica.codigo}</p>
              <p className="text-xs text-gray-600 line-clamp-2">{rubrica.descricao}</p>
            </div>

            {/* Saldo Inicial */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-2 block">
                Saldo Inicial
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">R$</span>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.saldo_inicial}
                  onChange={(e) => setFormData(f => ({ ...f, saldo_inicial: e.target.value }))}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Saldo Comprometido */}
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-2 block">
                Saldo Comprometido
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">R$</span>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.saldo_comprometido}
                  onChange={(e) => setFormData(f => ({ ...f, saldo_comprometido: e.target.value }))}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Saldo Disponível */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-medium mb-1">Saldo Disponível</p>
              <p className={`break-words text-lg font-bold leading-tight tabular-nums ${saldo_disponivel < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                {fmt(saldo_disponivel)}
              </p>
              {saldo_disponivel < 0 && (
                <div className="flex items-center gap-1 text-xs text-red-600 mt-2">
                  <AlertTriangle className="w-3 h-3" />
                  Saldo insuficiente! Comprometido maior que disponível.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="gastos" className="max-h-96 overflow-y-auto">
            <GastosRubricaPanel rubricaId={rubrica.id} rubricaCodigo={rubrica.codigo} rubrica={rubrica} />
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 justify-end pt-3 border-t mt-2 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="bg-black hover:bg-gray-800 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
