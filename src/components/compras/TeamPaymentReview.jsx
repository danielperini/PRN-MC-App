import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function TeamPaymentReview({ payment, onUpdated }) {

  const [rubricaId, setRubricaId] = useState(payment?.rubrica_id || '');
  const [loading, setLoading] = useState(false);

  /* 🔥 BUSCA TODAS RUBRICAS */
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: async () => {
      return await base44.entities.Rubrica.list();
    }
  });

  /* 🔥 SUGESTÃO IA (simples: mesma do membro) */
  const suggestedRubricaId = payment?.rubrica_id;

  async function handleAction(action) {
    try {
      setLoading(true);

      if (!rubricaId) {
        toast.error('Selecione uma rubrica antes de continuar');
        return;
      }

      await base44.functions.invoke('teamPaymentActions', {
        payment_id: payment.id,
        action,
        rubrica_id: rubricaId // 🔥 ESSENCIAL
      });

      toast.success(
        action === 'approve'
          ? 'Pagamento aprovado'
          : 'Pagamento realizado'
      );

      onUpdated?.();

    } catch (e) {
      toast.error(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  }

  const status = String(payment?.status || '').toUpperCase();

  return (
    <div className="space-y-4 border p-4 rounded-xl">

      <div>
        <strong>{payment.user_email}</strong>
      </div>

      <div>
        {payment.mes_referencia}/{payment.ano}
      </div>

      <div>
        Status: {status}
      </div>

      <div>
        Valor: R$ {Number(payment.valor_nf || payment.valor_parcela_previsto || 0).toLocaleString('pt-BR')}
      </div>

      {/* 🔥 RUBRICA */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Rubrica</div>

        <Select value={rubricaId} onValueChange={setRubricaId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecionar rubrica" />
          </SelectTrigger>

          <SelectContent>
            {rubricas.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.rubrica || r.nome || r.descricao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 🔥 SUGESTÃO */}
        {suggestedRubricaId && (
          <div className="text-xs text-gray-500">
            Sugestão automática aplicada
          </div>
        )}
      </div>

      {/* 🔥 BOTÕES */}
      <div className="flex gap-2">

        {status === 'AGUARDANDO_APROVACAO' && (
          <Button
            onClick={() => handleAction('approve')}
            disabled={loading}
          >
            Aprovar
          </Button>
        )}

        {status === 'APROVADO_COORD' && (
          <Button
            onClick={() => handleAction('pay')}
            disabled={loading}
          >
            Marcar como pago
          </Button>
        )}

      </div>

    </div>
  );
}
