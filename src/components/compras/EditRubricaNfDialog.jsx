import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

/**
 * Dialog pequeno (420px) para editar a rubrica vinculada a uma PurchaseRequest.
 * Props:
 *  - open / onOpenChange: controle do dialog
 *  - compra: PurchaseRequest selecionada
 *  - rubricasDoAditivo: rubricas ativas do mesmo aditivo (origem_recurso 3º/4º/5º)
 *  - onSaved: callback() após PATCH com sucesso — parent recarrega dados
 */
export default function EditRubricaNfDialog({
  open,
  onOpenChange,
  compra,
  rubricasDoAditivo = [],
  onSaved,
}) {
  const [rubricaId, setRubricaId] = useState('');
  const [saving, setSaving] = useState(false);

  const currentRubrica = useMemo(() => {
    if (!compra?.rubrica_id) return null;
    return rubricasDoAditivo.find((r) => r.id === compra.rubrica_id) || null;
  }, [compra, rubricasDoAditivo]);

  useEffect(() => {
    if (open && compra) {
      setRubricaId(compra.rubrica_id || '');
    }
  }, [open, compra]);

  const label = (r) => {
    const cod = r?.codigo ? ` [${r.codigo}]` : '';
    const nome = r?.rubrica || r?.nome || '(sem nome)';
    return `${nome}${cod}`;
  };

  const handleSave = async () => {
    if (!compra?.id) return;
    const selected = rubricasDoAditivo.find((r) => r.id === rubricaId);
    if (!selected) {
      toast.error('Selecione uma rubrica válida.');
      return;
    }
    if (selected.id === compra.rubrica_id) {
      toast.info('Rubrica não alterada.');
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      await base44.entities.PurchaseRequest.update(compra.id, {
        rubrica_id: selected.id,
        rubrica_nome: selected.rubrica || selected.nome || '',
      });
      toast.success('Rubrica da NF atualizada.');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error('[EditRubricaNfDialog] erro PATCH:', err);
      toast.error('Falha ao atualizar rubrica da NF.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base">Editar rubrica da NF</DialogTitle>
          <DialogDescription className="text-xs">
            Ajuste a classificação orçamentária desta nota fiscal sem sair da tela financeira.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-gray-500">Descrição</p>
            <p className="font-medium text-gray-800 line-clamp-2">
              {compra?.descricao_item || compra?.fornecedor_nome || '—'}
            </p>
            <p className="mt-1 text-gray-400">
              NF {compra?.nf_numero || '—'} · {compra?.fornecedor_nome || '—'}
            </p>
          </div>

          <div className="rounded-md border border-gray-200 px-3 py-2">
            <p className="text-gray-500">Rubrica atual</p>
            <p className="font-medium text-gray-800">
              {currentRubrica ? label(currentRubrica) : (compra?.rubrica_nome || 'Sem rubrica vinculada')}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-gray-600 font-medium">Nova rubrica</label>
            <Select value={rubricaId} onValueChange={setRubricaId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione a rubrica" />
              </SelectTrigger>
              <SelectContent>
                {rubricasDoAditivo.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    Nenhuma rubrica ativa neste aditivo
                  </SelectItem>
                )}
                {rubricasDoAditivo.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    {label(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !rubricaId}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}