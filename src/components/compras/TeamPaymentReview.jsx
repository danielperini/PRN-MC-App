import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  ClipboardCheck,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const STATUS_COLORS = {
  AGUARDANDO_APROVACAO: 'bg-blue-100 text-blue-700',
  EM_ANALISE_COORD: 'bg-yellow-100 text-yellow-700',
  DEVOLVIDO_REVISAO: 'bg-orange-100 text-orange-700',
  APROVADO_COORD: 'bg-green-100 text-green-700',
  REVISAO: 'bg-orange-100 text-orange-700',
  PAGO: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS = {
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  EM_ANALISE_COORD: 'Em Análise',
  DEVOLVIDO_REVISAO: 'Devolvido',
  APROVADO_COORD: 'Aprovado',
  REVISAO: 'Em Revisão',
  PAGO: 'Pago',
};

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(value) {
  return `R$ ${toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
  })}`;
}

function ChecklistItem({ ok, label, href }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
        ok
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            <ExternalLink className="w-3 h-3" />
            Abrir
          </a>
        )}
        <span className="flex items-center gap-1">
          {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {ok ? 'OK' : 'Pendente'}
        </span>
      </div>
    </div>
  );
}

function getDefaultCompetencia(payment) {
  const monthIndex = MONTHS.findIndex((m) => m === payment?.mes_referencia);
  if (monthIndex <= 0) {
    return {
      mes: payment?.mes_referencia || '',
      ano: payment?.ano || new Date().getFullYear(),
    };
  }
  return {
    mes: MONTHS[monthIndex - 1],
    ano: payment?.ano || new Date().getFullYear(),
  };
}

function getNFValidation(payment) {
  try {
    const raw = payment?.resultado_validacao;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function TeamPaymentReview({ members = [], budgetLines = [] }) {
  const queryClient = useQueryClient();
  const [reviewingPayment, setReviewingPayment] = useState(null);
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [competenciaMes, setCompetenciaMes] = useState('');
  const [competenciaAno, setCompetenciaAno] = useState(String(new Date().getFullYear()));

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['team-payments-pending-review'],
    queryFn: () =>
      base44.entities.TeamPayment.filter(
        { status: 'AGUARDANDO_APROVACAO' },
        '-created_date',
        100
      ),
  });

  const getMember = (payment) =>
    members.find(
      (m) =>
        m.id === payment.team_member_id ||
        (payment.user_email &&
          String(m.user_email || '').toLowerCase() ===
            String(payment.user_email || '').toLowerCase())
    );

  const getBudgetLine = (payment) => {
    const member = getMember(payment);
    const budgetLineId =
      member?.budgetline_id ||
      member?.budget_line_id ||
      payment?.budgetline_id ||
      payment?.budget_line_id ||
      '';
    return budgetLines.find((b) => b.id === budgetLineId) || null;
  };

  const getChecklist = (payment, member) => {
    const contractUrl =
      payment?.contract_url ||
      member?.contract_url ||
      member?.contrato_url ||
      '';

    const nfPdfUrl = payment?.nota_fiscal_url || '';
    const nfXmlUrl = payment?.xml_url || '';

    return {
      contrato: { ok: !!contractUrl, href: contractUrl || null },
      nfPdf: { ok: !!nfPdfUrl, href: nfPdfUrl || null },
      nfXml: { ok: !!nfXmlUrl, href: nfXmlUrl || null },
    };
  };

  const getValidation = (payment) => {
    const member = getMember(payment);
    const budgetLine = getBudgetLine(payment);
    const checklist = getChecklist(payment, member);
    const nfValidation = getNFValidation(payment);

    const parcelasPrevistas = Math.max(1, parseInt(member?.numero_parcelas, 10) || 1);
    const parcelasPagas = Math.max(0, parseInt(member?.parcelas_pagas, 10) || 0);
    const parcelasRestantes = Math.max(parcelasPrevistas - parcelasPagas, 0);

    const valorParcela =
      toNumber(member?.valor_parcela) ||
      (parcelasPrevistas > 0 ? toNumber(member?.valor_total) / parcelasPrevistas : 0);

    const valorSolicitado =
      toNumber(payment?.valor_nf) ||
      toNumber(payment?.valor_pago) ||
      valorParcela;

    const saldoLinha = budgetLine
      ? toNumber(budgetLine?.saldo_inicial) - toNumber(budgetLine?.saldo_comprometido)
      : 0;

    const hasDocs = checklist.contrato.ok && checklist.nfPdf.ok && checklist.nfXml.ok;
    const hasParcelas = parcelasRestantes > 0;
    const hasSaldo = !!budgetLine && saldoLinha >= valorSolicitado;

    const divergente = nfValidation?.status === 'divergente';
    const validacaoAusente = checklist.nfPdf.ok || checklist.nfXml.ok ? !nfValidation : false;
    const nfOk = !divergente && !validacaoAusente;

    const canApprove = hasDocs && hasParcelas && hasSaldo && nfOk;

    return {
      member,
      budgetLine,
      checklist,
      nfValidation,
      parcelasPrevistas,
      parcelasPagas,
      parcelasRestantes,
      valorParcela,
      valorSolicitado,
      saldoLinha,
      hasDocs,
      hasParcelas,
      hasSaldo,
      divergente,
      validacaoAusente,
      nfOk,
      canApprove,
    };
  };

  const reviewingValidation = useMemo(() => {
    if (!reviewingPayment) return null;
    return getValidation(reviewingPayment);
  }, [reviewingPayment, members, budgetLines]);

  const openReviewDialog = (payment, nextAction) => {
    const competenciaDefault = getDefaultCompetencia(payment);
    setReviewingPayment(payment);
    setAction(nextAction);
    setComment('');
    setCompetenciaMes(competenciaDefault.mes);
    setCompetenciaAno(String(competenciaDefault.ano));
  };

  const closeDialog = () => {
    setReviewingPayment(null);
    setAction(null);
    setComment('');
    setCompetenciaMes('');
    setCompetenciaAno(String(new Date().getFullYear()));
  };

  const handleConfirmAction = async () => {
    if (!reviewingPayment) return;

    const validation = getValidation(reviewingPayment);

    if (action === 'approve' && !validation.canApprove) {
      if (validation.divergente) {
        toast.error('NF com divergência. Corrija antes de aprovar.');
      } else if (validation.validacaoAusente) {
        toast.error('A NF ainda não foi validada automaticamente.');
      } else if (!validation.hasDocs) {
        toast.error('Documentação incompleta para aprovação.');
      } else if (!validation.hasParcelas) {
        toast.error('Não há parcelas restantes para aprovar.');
      } else if (!validation.hasSaldo) {
        toast.error('Saldo insuficiente na linha orçamentária.');
      } else {
        toast.error('Não é possível aprovar.');
      }
      return;
    }

    if (action === 'return' && !comment.trim()) {
      toast.error('Informe o motivo');
      return;
    }

    if (action === 'approve' && (!competenciaMes || !competenciaAno)) {
      toast.error('Selecione a competência');
      return;
    }

    setSaving(true);

    try {
      const user = await base44.auth.me();

      const observacaoFinal =
        action === 'approve'
          ? [
              comment?.trim() || '',
              `Competência: ${competenciaMes}/${competenciaAno}`,
            ]
              .filter(Boolean)
              .join('\n')
          : comment.trim();

      await base44.entities.TeamPayment.update(reviewingPayment.id, {
        status: action === 'approve' ? 'APROVADO_COORD' : 'DEVOLVIDO_REVISAO',
        observacoes: observacaoFinal || null,
        aprov_coord_nome: user?.full_name || '',
        aprov_coord_email: user?.email || '',
        aprov_coord_data: new Date().toISOString(),
      });

      if (action === 'approve' && validation.member?.id) {
        await base44.entities.TeamMember.update(validation.member.id, {
          parcelas_pagas: validation.parcelasPagas + 1,
        });
      }

      if (reviewingPayment?.user_email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: reviewingPayment.user_email,
            subject: action === 'approve' ? 'Pagamento aprovado' : 'Pagamento devolvido',
            body: observacaoFinal || (action === 'approve' ? 'Pagamento aprovado.' : 'Pagamento devolvido para revisão.'),
          });
        } catch (error) {
          console.error('Erro ao enviar email:', error);
        }
      }

      toast.success(action === 'approve' ? 'Aprovado' : 'Devolvido');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-payments-pending-review'] }),
        queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['team-members'] }),
      ]);

      closeDialog();
    } catch (e) {
      toast.error(e?.message || 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="animate-spin mx-auto" />
      </div>
    );
  }

  if (payments.length === 0) {
    return <div className="text-center text-gray-500 py-10">Sem envios</div>;
  }

  return (
    <div className="space-y-4">
      {payments.map((payment) => {
        const validation = getValidation(payment);
        const { member, checklist, nfValidation } = validation;

        return (
          <div key={payment.id} className="border p-4 rounded-xl space-y-3">
            <div className="flex justify-between">
              <div>
                <p className="font-semibold">
                  {member?.user_name || member?.nome || payment?.user_email || 'Membro'}
                </p>
                <p className="text-xs text-gray-500">
                  {payment.mes_referencia}/{payment.ano}
                </p>
              </div>

              <Badge className={STATUS_COLORS[payment.status] || 'bg-gray-100 text-gray-700'}>
                {STATUS_LABELS[payment.status] || payment.status}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <ChecklistItem
                ok={checklist.contrato.ok}
                label="Contrato"
                href={checklist.contrato.href}
              />
              <ChecklistItem
                ok={checklist.nfPdf.ok}
                label="NF PDF"
                href={checklist.nfPdf.href}
              />
              <ChecklistItem
                ok={checklist.nfXml.ok}
                label="XML"
                href={checklist.nfXml.href}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                <div className="text-gray-500 mb-1">Valor solicitado</div>
                <div className="font-medium text-gray-800">
                  {formatBRL(validation.valorSolicitado)}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                <div className="text-gray-500 mb-1">Saldo da linha</div>
                <div className={`font-medium ${validation.hasSaldo ? 'text-gray-800' : 'text-red-700'}`}>
                  {validation.budgetLine ? formatBRL(validation.saldoLinha) : 'Sem linha vinculada'}
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                <div className="text-gray-500 mb-1">Parcelas</div>
                <div className={`font-medium ${validation.hasParcelas ? 'text-gray-800' : 'text-red-700'}`}>
                  {validation.parcelasPagas}/{validation.parcelasPrevistas} pagas
                </div>
              </div>
            </div>

            {(nfValidation || validation.validacaoAusente) && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  validation.divergente
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : validation.validacaoAusente
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-green-50 border-green-200 text-green-800'
                }`}
              >
                <p className="font-semibold mb-1 flex items-center gap-1">
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  Validação automática da NF
                </p>

                {nfValidation ? (
                  <>
                    <p>Fornecedor: {nfValidation.fornecedor || '—'}</p>
                    <p>Valor NF: {formatBRL(nfValidation.valor)}</p>
                    <p>Valor esperado: {formatBRL(validation.valorSolicitado)}</p>
                    <p>Confiança: {toNumber(nfValidation.confianca)}%</p>

                    {validation.divergente && (
                      <p className="mt-1 font-semibold">
                        ⚠️ Divergência detectada
                      </p>
                    )}
                  </>
                ) : (
                  <p>NF enviada, mas a validação automática ainda não está disponível.</p>
                )}
              </div>
            )}

            {(!validation.hasDocs ||
              !validation.hasSaldo ||
              !validation.hasParcelas ||
              validation.divergente ||
              validation.validacaoAusente) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  {!validation.hasDocs && <p>Documentação incompleta.</p>}
                  {!validation.hasSaldo && <p>Saldo insuficiente na linha orçamentária.</p>}
                  {!validation.hasParcelas && <p>Não há parcelas restantes para este contrato.</p>}
                  {validation.divergente && <p>NF com divergência detectada.</p>}
                  {validation.validacaoAusente && <p>NF ainda não validada automaticamente.</p>}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!validation.canApprove}
                onClick={() => openReviewDialog(payment, 'approve')}
              >
                Aprovar
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => openReviewDialog(payment, 'return')}
              >
                Devolver
              </Button>
            </div>
          </div>
        );
      })}

      {reviewingPayment && (
        <Dialog open onOpenChange={closeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === 'approve' ? 'Aprovar' : 'Devolver'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {action === 'approve' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-1 block">Competência (mês)</Label>
                    <Select value={competenciaMes} onValueChange={setCompetenciaMes}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o mês" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="mb-1 block">Ano</Label>
                    <Input
                      value={competenciaAno}
                      onChange={(e) => setCompetenciaAno(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Observação"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmAction} disabled={saving}>
                {saving ? <Loader2 className="animate-spin w-4 h-4" /> : 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
