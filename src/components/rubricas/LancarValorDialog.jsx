import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function LancarValorDialog({ rubrica, isOpen, onClose, onSuccess }) {
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const novoValor = parseFloat(valor);
    if (isNaN(novoValor) || novoValor < 0) {
      toast.error('Valor inválido');
      return;
    }

    setLoading(true);
    try {
      const novoUtilizado = (rubrica.valor_utilizado || 0) + novoValor;
      const saldo = rubrica.valor_rubrica - novoUtilizado;
      const percentual = rubrica.valor_rubrica > 0 
        ? (novoUtilizado / rubrica.valor_rubrica) * 100 
        : 0;

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: novoUtilizado,
        saldo: Number(saldo.toFixed(2)),
        percentual_utilizado: Number(percentual.toFixed(1)),
      });

      toast.success(`Lançamento de R$ ${novoValor.toFixed(2)} realizado`);
      setValor('');
      onClose();
      onSuccess?.();
    } catch (error) {
      toast.error('Erro ao lançar valor: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar Valor Utilizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-600">{rubrica?.rubrica}</p>
            <p className="text-xs text-slate-500">{rubrica?.grupo}</p>
          </div>
          <div>
            <Label>Valor a Lançar (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="mt-1"
            />
          </div>
          <div className="bg-slate-50 p-3 rounded text-sm">
            <p><strong>Saldo atual:</strong> R$ {(rubrica?.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <p><strong>Valor utilizado atual:</strong> R$ {(rubrica?.valor_utilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !valor}>
            {loading ? 'Lançando...' : 'Lançar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}