import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import { toast } from 'sonner';

const GRUPOS = ['Equipe e gestão', 'Manutenção e operação', 'Despesas gerais'];

export default function EditRubricaDialog({ isOpen, onClose, rubrica = null }) {
  const [formData, setFormData] = useState(rubrica || {
    grupo: '',
    rubrica: '',
    numero_parcelas_unidades: '',
    valor_rubrica: '',
    observacao_uso: '',
    ativo: true,
  });
  const queryClient = useQueryClient();

  const handleSave = async () => {
    if (!formData.grupo || !formData.rubrica || !formData.valor_rubrica) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      if (rubrica?.id) {
        await base44.entities.Rubrica.update(rubrica.id, {
          grupo: formData.grupo,
          rubrica: formData.rubrica,
          numero_parcelas_unidades: formData.numero_parcelas_unidades,
          valor_rubrica: parseFloat(formData.valor_rubrica),
          observacao_uso: formData.observacao_uso,
          ativo: formData.ativo,
        });
        toast.success('✅ Atualizada!');
      } else {
        await base44.entities.Rubrica.create({
          grupo: formData.grupo,
          rubrica: formData.rubrica,
          numero_parcelas_unidades: formData.numero_parcelas_unidades,
          valor_rubrica: parseFloat(formData.valor_rubrica),
          valor_utilizado: 0,
          saldo: parseFloat(formData.valor_rubrica),
          percentual_utilizado: 0,
          observacao_uso: formData.observacao_uso,
          ativo: formData.ativo,
          ordem_exibicao: 999,
        });
        toast.success('✅ Criada!');
      }

      queryClient.invalidateQueries({ queryKey: ['rubricas'] });
      onClose();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-black">
            {rubrica?.id ? 'Editar Rubrica' : 'Nova Rubrica'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Grupo *</label>
          <Select value={formData.grupo} onValueChange={v => setFormData(f => ({ ...f, grupo: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRUPOS.map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Nome *</label>
          <Input
            value={formData.rubrica}
            onChange={e => setFormData(f => ({ ...f, rubrica: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Nº Parcelas</label>
          <Input
            value={formData.numero_parcelas_unidades}
            onChange={e => setFormData(f => ({ ...f, numero_parcelas_unidades: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Valor (R$) *</label>
          <Input
            type="number"
            step="0.01"
            value={formData.valor_rubrica}
            onChange={e => setFormData(f => ({ ...f, valor_rubrica: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Observação</label>
          <Textarea
            rows={2}
            value={formData.observacao_uso}
            onChange={e => setFormData(f => ({ ...f, observacao_uso: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.ativo}
            onChange={e => setFormData(f => ({ ...f, ativo: e.target.checked }))}
            className="w-4 h-4"
          />
          <label className="text-sm text-black">Ativa</label>
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="bg-black hover:bg-gray-800 text-white" onClick={handleSave}>
            {rubrica?.id ? 'Atualizar' : 'Criar'}
          </Button>
        </div>
      </div>
    </div>
  );
}