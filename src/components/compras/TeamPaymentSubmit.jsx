import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TeamPaymentSubmit({ member, mes, ano, valor }) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!member?.user_email) {
        throw new Error('Membro inválido');
      }

      if (!member?.rubrica_id) {
        throw new Error('Membro sem rubrica vinculada');
      }

      // 🔥 VERIFICAR SE JÁ EXISTE (EVITA DUPLICAÇÃO)
      const existentes = await base44.entities.TeamPayment.filter({
        user_email: member.user_email,
        mes_referencia: mes,
        ano: ano
      });

      if (existentes?.length > 0) {
        return existentes[0]; // já existe → não cria outro
      }

      // 🔥 CRIA COM RUBRICA VINCULADA
      return await base44.entities.TeamPayment.create({
        user_email: member.user_email,
        user_name: member.user_name,
        mes_referencia: mes,
        ano: ano,
        valor_parcela_previsto: Number(valor) || 0,
        valor_nf: Number(valor) || 0,

        // 🔥 CRÍTICO
        rubrica_id: member.rubrica_id,
        rubrica_nome: member.rubrica_nome || '',

        status: 'AGUARDANDO_APROVACAO',
        created_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      toast.success('Pagamento enviado para aprovação');
      queryClient.invalidateQueries(['team-payments']);
    },
    onError: (err) => {
      toast.error(err.message || 'Erro ao enviar pagamento');
    },
    onSettled: () => {
      setSubmitting(false);
    }
  });

  const handleSubmit = async () => {
    if (submitting) return; // 🔥 evita duplo clique
    setSubmitting(true);
    submitMutation.mutate();
  };

  return (
    <Button
      onClick={handleSubmit}
      disabled={submitting}
      className="bg-black hover:bg-gray-800 text-white gap-2"
    >
      {submitting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Enviando...
        </>
      ) : (
        'Enviar para aprovação'
      )}
    </Button>
  );
}
