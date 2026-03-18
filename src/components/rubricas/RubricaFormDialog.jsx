import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const GRUPOS = [
  'Equipe e gestão',
  'Consultorias',
  'Manutenção e operação',
  'Mostras e exposições',
  'Noturno nos Museus 2026',
  'Diárias e publicações',
  'Alimentação, material e ações',
  'Despesas gerais'
];

export default function RubricaFormDialog({ rubrica, onClose, onSuccess }) {
  const isEdit = !!rubrica;
  const [form, setForm] = useState({
    grupo: rubrica?.grupo || 'Equipe e gestão',
    rubrica: rubrica?.rubrica || '',
    numero_parcelas_unidades: rubrica?.numero_parcelas_unidades || '',
    valor_rubrica: rubrica?.valor_rubrica || '',
    observacao_uso: rubrica?.observacao_uso || '',
    ativo: rubrica?.ativo !== false,
    ordem_exibicao: rubrica?.ordem_exibicao || 99,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.rubrica || !form.valor_rubrica) return;
    setSaving(true);
    const valorRubrica = parseFloat(form.valor_rubrica);
    const valorUtilizado = rubrica?.valor_utilizado || 0;
    const payload = {
      ...form,
      valor_rubrica: valorRubrica,
      valor_utilizado: valorUtilizado,
      saldo: valorRubrica - valorUtilizado,
      percentual_utilizado: valorRubrica > 0 ? Math.round((valorUtilizado / valorRubrica) * 100) : 0,
      ordem_exibicao: parseInt(form.ordem_exibicao) || 99,
    };
    try {
      if (isEdit) {
        await base44.entities.Rubrica.update(rubrica.id, payload);
        toast.success('Rubrica atualizada com sucesso!');
      } else {
        await base44.entities.Rubrica.create(payload);
        toast.success('Rubrica criada com sucesso!');
      }
    } catch (e) {
      toast.error('Erro ao salvar rubrica: ' + (e?.message || 'tente novamente'));
      setSaving(false);
      return;
    }
    setSaving(false);
    onSuccess();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Rubrica' : 'Nova Rubrica'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Grupo</Label>
            <Select value={form.grupo} onValueChange={v => setForm(f => ({ ...f, grupo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRUPOS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome da Rubrica *</Label>
            <Input value={form.rubrica} onChange={e => setForm(f => ({ ...f, rubrica: e.target.value }))} placeholder="Ex: Coordenador Geral" />
          </div>
          <div>
            <Label>Nº Parcelas/Unidades</Label>
            <Input value={form.numero_parcelas_unidades} onChange={e => setForm(f => ({ ...f, numero_parcelas_unidades: e.target.value }))} placeholder="Ex: 10 meses" />
          </div>
          <div>
            <Label>Valor Total (R$) *</Label>
            <Input type="number" value={form.valor_rubrica} onChange={e => setForm(f => ({ ...f, valor_rubrica: e.target.value }))} placeholder="0" />
          </div>
          <div>
            <Label>Observação</Label>
            <Input value={form.observacao_uso} onChange={e => setForm(f => ({ ...f, observacao_uso: e.target.value }))} placeholder="Notas sobre uso..." />
          </div>
          <div>
            <Label>Ordem de Exibição</Label>
            <Input type="number" value={form.ordem_exibicao} onChange={e => setForm(f => ({ ...f, ordem_exibicao: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.rubrica || !form.valor_rubrica}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}