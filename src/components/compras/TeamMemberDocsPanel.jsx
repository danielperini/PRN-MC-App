import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Loader2, ExternalLink, FileCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

function toNumber(v) {
  return Number(v) || 0;
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function getBudgetLineId(member) {
  return (
    member?.budgetline_id ||
    member?.budget_line_id ||
    member?.rubrica_id ||
    ''
  );
}

function buildNFFileName(member, parcela, valor) {
  const cargo = (member.funcao || '').toUpperCase();
  const nome = (member.user_name || '').toUpperCase();
  const valorStr = formatBRL(valor);
  return `NF ${parcela} - ${cargo} - ${nome} - MUSEUS CENTRO - ${valorStr}`;
}

function getStatusBadge(status, ready) {
  if (status === 'PAGO') {
    return { label: 'PAGO', className: 'bg-emerald-100 text-emerald-700' };
  }
  if (status === 'APROVADO_COORD') {
    return { label: 'APROVADO', className: 'bg-blue-100 text-blue-700' };
  }
  if (ready) {
    return { label: 'PRONTO', className: 'bg-green-100 text-green-700' };
  }
  return { label: 'PENDENTE', className: 'bg-red-100 text-red-700' };
}

export default function TeamMemberDocsPanel({
  member,
  onClose,
  isCoordenador,
  budgetLines = [],
  initialMode = 'docs',
}) {
  const queryClient = useQueryClient();
  const [loadingAction, setLoadingAction] = useState(null);
  const [mode, setMode] = useState(initialMode || 'docs');

  useEffect(() => {
    setMode(initialMode || 'docs');
  }, [initialMode]);

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
      const contrato =
        p.contract_url ||
        member.contract_url ||
        member.contrato_url ||
        '';

      const nf = p.nota_fiscal_url || '';
      const xml = p.xml_url || '';

      const valorEsperado =
        toNumber(p.valor_parcela_previsto) ||
        toNumber(member.valor_parcela) ||
        (
          toNumber(member.numero_parcelas) > 0
            ? toNumber(member.valor_total) / toNumber(member.numero_parcelas)
            : 0
        );

      const valorConsiderado = toNumber(p.valor_nf) || valorEsperado;
      const completo = !!contrato && !!nf && !!xml;
      const saldoOk = budgetLine ? saldoBudgetLine >= valorConsiderado : true;

      const parcela =
        toNumber(p.numero_parcela) || index + 1;

      return {
        ...p,
        parcela,
        valorEsperado,
        valorConsiderado,
        checklist: {
          contrato: !!contrato,
          nf: !!nf,
          xml: !!xml,
          completo,
          saldoOk,
        },
        contract_url_resolved: contrato || null,
        _ready: completo && saldoOk,
      };
    });
  }, [payments, budgetLine, member, saldoBudgetLine]);

  const processNFIA = async (paymentId, file_url) => {
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Leia esta nota fiscal e valide com rigor...`,
        file_urls: [file_url]
      });

      const data = res?.data || res || {};

      await base44.entities.TeamPayment.update(paymentId, {
        nf_validada: true,
        nf_valida: data.valida,
        nf_erros: Array.isArray(data.erros) ? data.erros : [],
        valor_nf: data.valor,
        mes_referencia: data.mes,
        descricao_nf: data.descricao
      });

      toast.success('NF analisada pela IA');
    } catch {
      toast.error('Erro IA NF');
    }
  };

  const uploadNF = async (payment, file, tipo) => {
    if (!file) return;

    setLoadingAction(payment.id);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      if (tipo === 'pdf') {
        await base44.entities.TeamPayment.update(payment.id, {
          nota_fiscal_url: file_url,
          nf_nome_arquivo: buildNFFileName(member, payment.parcela, payment.valor_nf || payment.valorEsperado)
        });

        await processNFIA(payment.id, file_url);
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
    if (!payment._ready) {
      toast.error('Checklist incompleto');
      return;
    }

    if (!payment.nf_valida) {
      toast.error('NF inválida');
      return;
    }

    setLoadingAction(payment.id);

    try {

      let purchaseId = payment.purchase_id || null;

      if (!purchaseId) {
        const purchase = await base44.entities.PurchaseRequest.create({
          descricao_item: `Pagamento equipe - ${member.user_name}`,
          valor_solicitado: payment.valor_nf || payment.valorEsperado || 0,
          valor_aprovado: payment.valor_nf || payment.valorEsperado || 0,
          status: 'APROVADO_COORD',
          rubrica_id: getBudgetLineId(member),
          budgetline_id: getBudgetLineId(member),
          origem: 'TEAM_PAYMENT',
          team_payment_id: payment.id,
          created_by: member.user_email,
        });

        purchaseId = purchase.id;

        await base44.entities.TeamPayment.update(payment.id, {
          purchase_id: purchaseId
        });
      }

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD',
        aprovado_em: new Date().toISOString()
      });

      toast.success('Pagamento integrado ao financeiro');

      await queryClient.invalidateQueries();

    } catch (e) {
      toast.error(e.message);
    }

    setLoadingAction(null);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{member.user_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {enrichedPayments.map((p) => {
            const badge = getStatusBadge(p.status, p._ready);

            return (
              <div key={p.id} className="border rounded-lg p-4 space-y-3">

                <div className="flex justify-between">
                  <p>Parcela {p.parcela}</p>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </div>

                <div className="flex gap-2">
                  <label>
                    <Button size="sm" variant="outline">NF PDF</Button>
                    <input type="file" hidden onChange={(e)=>uploadNF(p,e.target.files[0],'pdf')} />
                  </label>

                  <label>
                    <Button size="sm" variant="outline">XML</Button>
                    <input type="file" hidden onChange={(e)=>uploadNF(p,e.target.files[0],'xml')} />
                  </label>
                </div>

                {isCoordenador && (
                  <Button
                    size="sm"
                    className="bg-black text-white"
                    onClick={() => autorizarPagamento(p)}
                    disabled={!p._ready || !p.nf_valida}
                  >
                    Autorizar pagamento
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
