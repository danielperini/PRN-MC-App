import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function toNumber(v) {
  return Number(v) || 0;
}

export default function TeamPaymentSubmit({
  effectiveMember,
  selectedComp,
  selectedRubricaId,
  selectedRubricaNome,
  form,
  valorParcela,
  pdfUrl,
  xmlUrl,
  pdfName,
  xmlName,
  descricaoModelo,
  resolvedName,
  resolvedFuncao,
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);

    try {
      // 🔒 BUSCAR EXISTENTES
      const existing = await base44.entities.TeamPayment.filter({
        user_email: effectiveMember.user_email,
        mes_referencia: selectedComp.mes,
        ano: selectedComp.ano
      });

      // 🔒 BLOQUEIO DE DUPLICAÇÃO
      const existeAtivo = (existing || []).some(p =>
        ['PAGO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'].includes(
          String(p.status || '').toUpperCase()
        )
      );

      if (existeAtivo) {
        throw new Error('Já existe uma nota fiscal enviada para essa competência.');
      }

      // 🔒 VALIDA RUBRICA
      if (!selectedRubricaId) {
        throw new Error('Rubrica obrigatória.');
      }

      // 🔒 VALIDA VALOR
      const valorFinal = toNumber(form.valor_nf || valorParcela);
      if (valorFinal <= 0) {
        throw new Error('Valor inválido.');
      }

      // 🔒 CHECK ORÇAMENTO
      const budgetCheck = await base44.functions.invoke('check_budget', {
        valor: valorFinal,
        user_email: effectiveMember.user_email,
        contexto: 'TEAM_PAYMENT',
        mes: selectedComp.mes,
        ano: selectedComp.ano,
        rubrica_id: selectedRubricaId
      });

      const bc = budgetCheck?.data || budgetCheck || {};

      if (bc?.blocked_by_rubrica) {
        throw new Error('Rubrica inválida.');
      }

      if (bc?.saldo_insuficiente) {
        throw new Error('Saldo insuficiente na rubrica.');
      }

      // 🔥 CREATE
      const payload = {
        team_member_id: effectiveMember.id,
        user_email: effectiveMember.user_email,
        user_name: resolvedName || '',
        funcao: resolvedFuncao,
        role: resolvedFuncao,
        mes_referencia: selectedComp.mes,
        ano: selectedComp.ano,
        numero_nf: form.numero_nf,
        valor_nf: valorFinal,
        valor_parcela_previsto: valorParcela,
        numero_parcela: (toNumber(effectiveMember.parcelas_pagas) || 0) + 1,
        nota_fiscal_url: pdfUrl,
        xml_url: xmlUrl,
        nota_fiscal_file_name: pdfName,
        xml_file_name: xmlName,
        descricao_nf_modelo: descricaoModelo,
        status: 'AGUARDANDO_APROVACAO',

        // 🔥 CRÍTICO
        rubrica_id: selectedRubricaId,
        rubrica_nome: selectedRubricaNome,

        // 🔒 anti duplicação
        unique_key: `${effectiveMember.user_email}_${selectedComp.mes}_${selectedComp.ano}`
      };

      await base44.entities.TeamPayment.create(payload);

      toast.success('Nota fiscal enviada com sucesso');

      // 🔄 REFRESH
      await Promise.all([
        queryClient.invalidateQueries(['team-payments']),
        queryClient.invalidateQueries(['team-payments-review']),
        queryClient.invalidateQueries(['rubricas'])
      ]);

    } catch (e) {
      toast.error(e.message || 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleSubmit} disabled={loading}>
      {loading ? 'Enviando...' : 'Enviar nota fiscal'}
    </Button>
  );
}
