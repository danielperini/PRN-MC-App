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

const GRUPOS = [
  'Equipe e gestão',
  'Manutenção e operação',
  'Despesas gerais',
  'Consultorias',
  'Formação',
];

export default function EditRubricaDialog({ rubrica, isOpen, onClose }) {
  const [formData, setFormData] = useState(rubrica || {
    grupo: '',
    rubrica: '',
    numero_parcelas_unidades: '',
    valor_rubrica: '',
    observacao_uso: '',
    ativo: true,
  });
  const queryClient = useQueryClient();

  const handleChange = (field, value) => {
    setFormData(f => ({
      ...f,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    if (!formData.grupo || !formData.rubrica || !formData.valor_rubrica) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      if (rubrica?.id) {
        // Editar existente (sem alterar valor_utilizado, saldo, percentual)
        await base44.entities.Rubrica.update(rubrica.id, {
          grupo: formData.grupo,
          rubrica: formData.rubrica,
          numero_parcelas_unidades: formData.numero_parcelas_unidades,
          valor_rubrica: parseFloat(formData.valor_rubrica),
          observacao_uso: formData.observacao_uso,
          ativo: formData.ativo,
        });
        toast.success('✅ Rubrica atualizada!');
      } else {
        // Criar nova
        const saldo = parseFloat(formData.valor_rubrica) - (formData.valor_utilizado || 0);
        await base44.entities.Rubrica.create({
          ...formData,
          valor_rubrica: parseFloat(formData.valor_rubrica),
          valor_utilizado: formData.valor_utilizado || 0,
          saldo,
          percentual_utilizado: 0,
        });
        toast.success('✅ Rubrica criada!');
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
      <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-black">
            {rubrica?.id ? 'Editar Rubrica' : 'Nova Rubrica'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Grupo *</label>
          <Select value={formData.grupo} onValueChange={v => handleChange('grupo', v)}>
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
          <label className="text-sm font-semibold text-black block mb-2">Nome da Rubrica *</label>
          <Input
            value={formData.rubrica}
            onChange={e => handleChange('rubrica', e.target.value)}
            placeholder="Ex: Coordenador Geral"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Nº de Parcelas / Unidades</label>
          <Input
            value={formData.numero_parcelas_unidades}
            onChange={e => handleChange('numero_parcelas_unidades', e.target.value)}
            placeholder="Ex: 10 meses"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Valor da Rubrica (R$) *</label>
          <Input
            type="number"
            step="0.01"
            value={formData.valor_rubrica}
            onChange={e => handleChange('valor_rubrica', e.target.value)}
            placeholder="0,00"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-black block mb-2">Observação</label>
          <Textarea
            rows={2}
            value={formData.observacao_uso}
            onChange={e => handleChange('observacao_uso', e.target.value)}
            placeholder="Ex: Soma de 3 produtoras"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.ativo}
            onChange={e => handleChange('ativo', e.target.checked)}
            className="w-4 h-4"
          />
          <label className="text-sm text-black">Ativa</label>
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="bg-black hover:bg-gray-800 text-white"
            onClick={handleSave}
          >
            {rubrica?.id ? 'Atualizar' : 'Criar'}
          </Button>
        </div>
      </div>
    </div>
  );
}