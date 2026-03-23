import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Plus } from 'lucide-react';
import { toast } from 'sonner';

function toNumber(v) {
  return Number(v) || 0;
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function getBudgetLineId(member) {
  return member?.budgetline_id || member?.budget_line_id || '';
}

function getNFValidation(tp) {
  try {
    if (!tp?.resultado_validacao) return null;
    return JSON.parse(tp.resultado_validacao);
  } catch {
    return null;
  }
}

export default function TeamMemberDocsPanel({
  member,
  onClose,
  isCoordenador,
  budgetLines = [],
  initialMode = 'docs' // 🔥 NOVO
}) {
  const queryClient = useQueryClient();
  const [loadingAction, setLoadingAction] = useState(null);
  const [mode, setMode] = useState(initialMode); // 🔥 CONTROLE DE MODO

  const { data: payments = [] } = useQuery({
    queryKey: ['team-payments-member', member.id],
    queryFn: () =>
      base44.entities.TeamPayment.filter(
        { team_member_id: member.id },
        '-created_date',
        100
      ),
  });

  const budgetLine = useMemo(() => {
    const id = getBudgetLineId(member);
    return budgetLines.find((b) => b.id === id) || null;
  }, [budgetLines, member]);

  const saldoBudgetLine = budgetLine
    ? toNumber(budgetLine.saldo_inicial) - toNumber(budgetLine.saldo_comprometido)
    : 0;

  const enrichedPayments = useMemo(() => {
    return (payments || []).map((p, index) => {

      const nf = p.nota_fiscal_url || '';
      const xml = p.xml_url || '';

      const valorEsperado =
        toNumber(member.valor_parcela) ||
        (
          toNumber(member.numero_parcelas) > 0
            ? toNumber(member.valor_total) / toNumber(member.numero_parcelas)
            : 0
        );

      const valor = toNumber(p.valor_nf) || valorEsperado;

      const completo = !!nf && !!xml;
      const saldoOk = budgetLine ? saldoBudgetLine >= valor : true;

      const nfValidation = getNFValidation(p);

      return {
        ...p,
        valor,
        completo,
        saldoOk,
        nfValidation,
        ready: completo && saldoOk && nfValidation?.status !== 'divergente'
      };
    });
  }, [payments, member, budgetLine, saldoBudgetLine]);

  const uploadNF = async (payment, file, tipo) => {
    if (!file) return;

    setLoadingAction(payment.id);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      if (tipo === 'pdf') {
        await base44.entities.TeamPayment.update(payment.id, {
          nota_fiscal_url: file_url
        });

        await base44.functions.invoke('validateNotaFiscal', {
          documentId: payment.id,
          purchaseId: payment.purchase_id || null
        });
      }

      if (tipo === 'xml') {
        await base44.entities.TeamPayment.update(payment.id, {
          xml_url: file_url
        });
      }

      await queryClient.invalidateQueries();

    } catch (e) {
      toast.error(e.message);
    }

    setLoadingAction(null);
  };

  const autorizarPagamento = async (payment) => {

    const validation = getNFValidation(payment);

    if (!validation) {
      toast.error('NF não validada');
      return;
    }

    if (validation.status === 'divergente') {
      toast.error('NF divergente');
      return;
    }

    setLoadingAction(payment.id);

    try {

      let purchaseId = payment.purchase_id;

      if (!purchaseId) {
        const purchase = await base44.entities.PurchaseRequest.create({
          descricao_item: `Pagamento equipe - ${member.user_name}`,
          valor_solicitado: payment.valor,
          status: 'SOLICITADO',
          origem: 'TEAM_PAYMENT',
          team_payment_id: payment.id,
          created_by: member.user_email,
        });

        purchaseId = purchase.id;

        await base44.entities.TeamPayment.update(payment.id, {
          purchase_id: purchaseId
        });
      }

      await base44.functions.invoke('purchaseActions', {
        purchaseId,
        action: 'aprovar'
      });

      toast.success('Pagamento enviado ao financeiro');
      await queryClient.invalidateQueries();

    } catch (e) {
      toast.error(e.message);
    }

    setLoadingAction(null);
  };

  const criarNovoPagamento = async () => {
    try {
      await base44.entities.TeamPayment.create({
        team_member_id: member.id,
        user_email: member.user_email,
        status: 'AGUARDANDO_APROVACAO'
      });

      toast.success('Novo pagamento criado');
      await queryClient.invalidateQueries();

    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{member.user_name}</DialogTitle>
        </DialogHeader>

        {/* 🔥 TABS INTERNAS */}
        <div className="flex gap-2 border-b pb-2">
          <Button
            size="sm"
            variant={mode === 'docs' ? 'default' : 'outline'}
            onClick={() => setMode('docs')}
          >
            Documentos
          </Button>

          <Button
            size="sm"
            variant={mode === 'payment' ? 'default' : 'outline'}
            onClick={() => setMode('payment')}
          >
            Pagamentos
          </Button>
        </div>

        {/* 🔥 MODO PAGAMENTO */}
        {mode === 'payment' && (
          <div className="space-y-4">

            <Button size="sm" onClick={criarNovoPagamento}>
              <Plus className="w-3 h-3 mr-1"/>
              Novo pagamento
            </Button>

            {enrichedPayments.map((p, i) => (
              <div key={p.id} className="border rounded-lg p-3">
                Parcela {i + 1} • {formatBRL(p.valor)}
              </div>
            ))}
          </div>
        )}

        {/* 🔥 MODO DOCUMENTOS */}
        {mode === 'docs' && (
          <div className="space-y-4">
            {enrichedPayments.map((p, i) => {

              const divergente = p.nfValidation?.status === 'divergente';

              return (
                <div key={p.id} className="border rounded-lg p-4 space-y-3">

                  <div className="flex justify-between">
                    <p>Parcela {i + 1}</p>

                    <Badge className={
                      divergente
                        ? 'bg-red-100 text-red-700'
                        : p.ready
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                    }>
                      {divergente ? 'DIVERGENTE' : p.ready ? 'PRONTO' : 'PENDENTE'}
                    </Badge>
                  </div>

                  {p.nfValidation && (
                    <div className={`text-xs p-2 rounded ${
                      divergente ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                    }`}>
                      NF: {formatBRL(p.nfValidation.valor)}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <label>
                      <Button size="sm" variant="outline">
                        <Upload className="w-3 h-3 mr-1"/> NF PDF
                      </Button>
                      <input type="file" hidden onChange={(e)=>uploadNF(p,e.target.files[0],'pdf')} />
                    </label>

                    <label>
                      <Button size="sm" variant="outline">
                        XML
                      </Button>
                      <input type="file" hidden onChange={(e)=>uploadNF(p,e.target.files[0],'xml')} />
                    </label>
                  </div>

                  {isCoordenador && (
                    <Button
                      size="sm"
                      onClick={() => autorizarPagamento(p)}
                      disabled={!p.ready || loadingAction === p.id}
                    >
                      Autorizar pagamento
                    </Button>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
