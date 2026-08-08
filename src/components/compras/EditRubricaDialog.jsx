import React, { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const ORIGENS = ['3º ADITIVO', '4º ADITIVO', '5º ADITIVO'];

/**
 * Dialog para editar os campos de uma Rubrica:
 *  - valor_rubrica (número)
 *  - grupo (texto)
 *  - origem_recurso (Select: 3º / 4º / 5º ADITIVO)
 * Props:
 *  - open / onOpenChange
 *  - rubrica: registro da Rubrica
 *  - onSaved: callback() após PATCH
 */
export default function EditRubricaDialog({ open, onOpenChange, rubrica, onSaved }) {
  const [valorRubrica, setValorRubrica] = useState('');
  const [grupo, setGrupo] = useState('');
  const [origem, setOrigem] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && rubrica) {
      setValorRubrica(rubrica?.valor_rubrica ?? '');
      setGrupo(rubrica?.grupo || '');
      setOrigem(rubrica?.origem_recurso || '');
    }
  }, [open, rubrica]);

  const handleSave = async () => {
    if (!rubrica?.id) return;
    const valor = Number(String(valorRubrica).replace(/[R$\s.]/g, '').replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error('Informe um valor de rubrica válido.');
      return;
    }
    if (!origem) {
      toast.error('Selecione a origem do recurso (aditivo).');
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Rubrica.update(rubrica.id, {
        valor_rubrica: valor,
        grupo: grupo?.trim() || '',
        origem_recurso: origem,
      });
      toast.success('Rubrica atualizada.');
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error('[EditRubricaDialog] erro PATCH:', err);
      toast.error('Falha ao atualizar rubrica.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base">Editar rubrica</DialogTitle>
          <DialogDescription className="text-xs">
            {rubrica?.rubrica || rubrica?.nome || '—'}
            {rubrica?.codigo ? ` · código ${rubrica.codigo}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="er-valor">Valor rubrica (R$)</Label>
            <Input
              id="er-valor"
              type="number"
              step="0.01"
              value={valorRubrica}
              onChange={(e) => setValorRubrica(e.target.value)}
              disabled={saving}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="er-grupo">Grupo</Label>
            <Input
              id="er-grupo"
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              disabled={saving}
              className="h-9 text-xs"
              placeholder="Ex.: Contratação da equipe principal"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="er-origem">Origem do recurso</Label>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger id="er-origem" className="h-9 text-xs">
                <SelectValue placeholder="Selecione o aditivo" />
              </SelectTrigger>
              <SelectContent>
                {ORIGENS.map((o) => (
                  <SelectItem key={o} value={o} className="text-xs">
                    {o}
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
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}