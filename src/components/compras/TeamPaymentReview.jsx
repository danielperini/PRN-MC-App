import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function TeamPaymentReview({ payment, refetch }) {
  const [loading, setLoading] = useState(false);

  const hasRubrica = !!payment?.rubrica_id;

  const handleApprove = async () => {
    if (!hasRubrica) {
      toast.error('Selecione uma rubrica antes de aprovar.');
      return;
    }

    try {
      setLoading(true);

      await base44.functions.invoke('processTeamPayment', {
        action: 'approve',
        paymentId: payment.id,
        rubrica_id: payment.rubrica_id
      });

      toast.success('Pagamento aprovado com sucesso');
      refetch?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao aprovar pagamento');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!hasRubrica) {
      toast.error('Pagamento sem rubrica vinculada.');
      return;
    }

    try {
      setLoading(true);

      await base44.functions.invoke('processTeamPayment', {
        action: 'mark_paid',
        paymentId: payment.id,
        rubrica_id: payment.rubrica_id
      });

      toast.success('Pagamento realizado com sucesso');
      refetch?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao realizar pagamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        onClick={handleApprove}
        disabled={loading || !hasRubrica}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aprovar'}
      </Button>

      <Button
        onClick={handlePay}
        disabled={loading || !hasRubrica}
        variant="secondary"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Marcar como pago'}
      </Button>
    </div>
  );
}
