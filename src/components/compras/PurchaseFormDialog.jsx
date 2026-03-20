import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Sparkles, AlertTriangle, Loader2, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import FormDocumentsField from './FormDocumentsField';
import { METAS_3_ADITIVO } from '@/components/planoTrabalho';
import { useBudgetLines } from './useBudgetLines';
import { useQuery } from '@tanstack/react-query';

export default function PurchaseFormDialog({
  currentUser,
  onClose,
  onSuccess,
  prefill,
  initialData = null,

  // 🔥 NOVO
  editMode = {}
}) {
  const rubricaRef = useRef(null);

  const { budgetLines } = useBudgetLines();

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('-created_date', 999),
  });

  const EMPTY = {
    meta_id: '',
    budgetline_id: '',
    rubrica_id: '',
    categoria: '',
    tipo_gasto: '',
    descricao_item: '',
    valor_solicitado: '',
  };

  const [form, setForm] = useState(() =>
    initialData ? { ...EMPTY, ...initialData } : EMPTY
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 🔥 AUTO FOCO NA RUBRICA
  useEffect(() => {
    if (editMode?.focus === 'rubrica') {
      setTimeout(() => {
        rubricaRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 300);
    }
  }, [editMode]);

  const handleSave = async () => {
    if (!form.descricao_item || (!form.rubrica_id && !form.budgetline_id)) {
      toast.error('Preencha descrição e rubrica.');
      return;
    }

    try {
      if (initialData?.id) {
        await base44.entities.PurchaseRequest.update(initialData.id, form);
      } else {
        await base44.entities.PurchaseRequest.create(form);
      }

      toast.success('Salvo com sucesso!');
      onSuccess?.();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl">

        <div className="p-6 border-b flex justify-between">
          <h2 className="font-bold">
            {initialData ? 'Editar compra' : 'Nova compra'}
          </h2>
          <Button variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="p-6 space-y-4">

          <div>
            <Label>Descrição *</Label>
            <Textarea
              value={form.descricao_item}
              onChange={e => set('descricao_item', e.target.value)}
            />
          </div>

          {/* 🔥 RUBRICA COM FOCO */}
          <div
            ref={rubricaRef}
            className={
              editMode?.focus === 'rubrica'
                ? 'border-2 border-red-500 rounded-lg p-2 bg-red-50'
                : ''
            }
          >
            <Label>Rubrica *</Label>

            <Select
              value={form.rubrica_id || ''}
              onValueChange={v =>
                setForm(f => ({
                  ...f,
                  rubrica_id: v,
                  budgetline_id: ''
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a rubrica..." />
              </SelectTrigger>

              <SelectContent>
                {rubricas.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.rubrica}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {editMode?.focus === 'rubrica' && (
              <p className="text-xs text-red-600 mt-1">
                ⚠️ Esta compra precisa de rubrica para contabilizar corretamente
              </p>
            )}
          </div>

          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              value={form.valor_solicitado}
              onChange={e => set('valor_solicitado', e.target.value)}
            />
          </div>

        </div>

        <div className="p-6 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}