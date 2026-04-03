import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function toNumber(v) {
  return Number(v) || 0;
}

function pickBestExistingPayment(items = []) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return [...items].sort((a, b) => {
    const va = toNumber(a?.valor_nf || a?.valor_parcela_previsto);
    const vb = toNumber(b?.valor_nf || b?.valor_parcela_previsto);

    if (vb !== va) return vb - va;

    return new Date(b?.created_date || b?.created_at || 0).getTime() -
      new Date(a?.created_date || a?.created_at || 0).getTime();
  })[0];
}

function resolveRubricaNome(member) {
  return (
    member?.rubrica_nome ||
    member?.rubrica ||
    member?.rubrica_label ||
    ''
  );
}

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

      if (!mes || !ano) {
        throw new Error('Competência inválida');
      }

      const valorNumerico = toNumber(valor);

      const existentes = await base44.entities.TeamPayment.filter({
        user_email: member.user_email,
        mes_referencia: mes,
        ano: ano
      });

      if (Array.isArray(existentes) && existentes.length > 0) {
        const existente = pickBestExistingPayment(existentes);

        if (!existente) {
          throw new Error('Falha ao validar pagamentos existentes');
        }

        if (
          !existente?.rubrica_id ||
          !existente?.rubrica_nome ||
          toNumber(existente?.valor_nf) <= 0
        ) {
          const atualizado = await base44.entities.TeamPayment.update(existente.id, {
            valor_parcela_previsto: toNumber(existente?.valor_parcela_previsto) || valorNumerico,
            valor_nf: toNumber(existente?.valor_nf) > 0 ? toNumber(existente?.valor_nf) : valorNumerico,
            rubrica_id: existente?.rubrica_id || member.rubrica_id,
            rubrica_nome: existente?.rubrica_nome || resolveRubricaNome(member),
            status: existente?.status || 'AGUARDANDO_APROVACAO'
          });

          return { created: false, payment: atualizado || existente };
        }

        return { created: false, payment: existente };
      }

      const created = await base44.entities.TeamPayment.create({
        user_email: member.user_email,
        user_name: member.user_name,
        team_member_id: member.id || null,
        mes_referencia: mes,
        ano: ano,
        valor_parcela_previsto: valorNumerico,
        valor_nf: valorNumerico,
        rubrica_id: member.rubrica_id,
        rubrica_nome: resolveRubricaNome(member),
        status: 'AGUARDANDO_APROVACAO',
        created_at: new Date().toISOString()
      });

      return { created: true, payment: created };
    },
    onSuccess: (result) => {
      if (result?.created) {
        toast.success('Pagamento enviado para aprovação');
      } else {
        toast.success('Pagamento já existia para essa competência');
      }

      queryClient.invalidateQueries({ queryKey: ['team-payments'] });
      queryClient.invalidateQueries({ queryKey: ['team-payments-review'] });
    },
    onError: (err) => {
      toast.error(err?.message || 'Erro ao enviar pagamento');
    },
    onSettled: () => {
      setSubmitting(false);
    }
  });

  const handleSubmit = async () => {
    if (submitting) return;
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
