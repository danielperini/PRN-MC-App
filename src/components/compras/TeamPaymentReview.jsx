import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  ClipboardCheck,
  Upload,
  FileCheck,
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

const STATUS_COLORS = {
  AGUARDANDO_APROVACAO: 'bg-blue-100 text-blue-700',
  EM_ANALISE_COORD: 'bg-yellow-100 text-yellow-700',
  DEVOLVIDO_REVISAO: 'bg-orange-100 text-orange-700',
  APROVADO_COORD: 'bg-green-100 text-green-700',
  REVISAO: 'bg-orange-100 text-orange-700',
};

const STATUS_LABELS = {
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  EM_ANALISE_COORD: 'Em Análise',
  DEVOLVIDO_REVISAO: 'Devolvido',
  APROVADO_COORD: 'Aprovado',
  REVISAO: 'Em Revisão',
};

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(value) {
  return `R$ ${toNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
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
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
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

export default function TeamPaymentReview({ members = [], budgetLines = [] }) {
  const queryClient = useQueryClient();
  const [reviewingPayment, setReviewingPayment] = useState(null);
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingContractFor, setUploadingContractFor] = useState(null);
  const [competenciaMes, setCompetenciaMes] = useState('');
  const [competenciaAno, setCompetenciaAno] = useState(String(new Date().getFullYear()));

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['team-payments-pending-review'],
    queryFn: () => base44.entities.TeamPayment.filter({ status: 'AGUARDANDO_APROVACAO' }, '-created_date', 100),
  });

  const getMember = (payment) =>
    members.find((m) => m.id === payment.team_member_id || m.user_email === payment.user_email);

  const getBudgetLine = (payment) => {
    const member = getMember(payment);
    return budgetLines.find((b) => b.id === member?.budgetline_id);
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

    const parcelasPrevistas = Math.max(1, parseInt(member?.numero_parcelas, 10) || 1);
    const parcelasPagas = Math.max(0, parseInt(member?.parcelas_pagas, 10) || 0);
    const parcelasRestantes = Math.max(parcelasPrevistas - parcelasPagas, 0);

    const valorParcela =
      toNumber(member?.valor_parcela) ||
      (parcelasPrevistas > 0 ? toNumber(member?.valor_total) / parcelasPrevistas : 0);

    const valorSolicitado = toNumber(payment?.valor_nf) || valorParcela;
    const saldoLinha =
      budgetLine
        ? toNumber(budgetLine?.saldo_inicial) - toNumber(budgetLine?.saldo_comprometido)
        : 0;

    const hasDocs = checklist.contrato.ok && checklist.nfPdf.ok && checklist.nfXml.ok;
    const hasParcelas = parcelasRestantes > 0;
    const hasSaldo = !!budgetLine && saldoLinha >= valorSolicitado;
    const canApprove = hasDocs && hasParcelas && hasSaldo;

    return {
      member,
      budgetLine,
      checklist,
      parcelasPrevistas,
      parcelasPagas,
      parcelasRestantes,
      valorParcela,
      valorSolicitado,
      saldoLinha,
      hasDocs,
      hasParcelas,
      hasSaldo,
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
      toast.error('Não é possível aprovar');
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
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString(),
      });

      if (action === 'approve' && validation.member?.id) {
        await base44.entities.TeamMember.update(validation.member.id, {
          parcelas_pagas: validation.parcelasPagas + 1,
        });
      }

      await base44.integrations.Core.SendEmail({
        to: reviewingPayment.user_email,
        subject: action === 'approve' ? 'Pagamento aprovado' : 'Pagamento devolvido',
        body: observacaoFinal,
      });

      toast.success(action === 'approve' ? 'Aprovado' : 'Devolvido');

      queryClient.invalidateQueries(['team-payments-pending-review']);
      queryClient.invalidateQueries(['team-payments']);
      queryClient.invalidateQueries(['team-members']);

      closeDialog();
    } catch (e) {
      toast.error(e.message);
    }

    setSaving(false);
  };

  if (isLoading) {
    return <div className="py-10 text-center"><Loader2 className="animate-spin mx-auto" /></div>;
  }

  if (payments.length === 0) {
    return <div className="text-center text-gray-500 py-10">Sem envios</div>;
  }

  return (
    <div className="space-y-4">
      {payments.map((payment) => {
        const validation = getValidation(payment);
        const { member, checklist } = validation;

        return (
          <div key={payment.id} className="border p-4 rounded-xl space-y-3">
            <div className="flex justify-between">
              <div>
                <p className="font-semibold">{member?.user_name}</p>
                <p className="text-xs text-gray-500">{payment.mes_referencia}/{payment.ano}</p>
              </div>
              <Badge>{STATUS_LABELS[payment.status]}</Badge>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <ChecklistItem ok={checklist.contrato.ok} label="Contrato" href={checklist.contrato.href} />
              <ChecklistItem ok={checklist.nfPdf.ok} label="NF PDF" href={checklist.nfPdf.href} />
              <ChecklistItem ok={checklist.nfXml.ok} label="XML" href={checklist.nfXml.href} />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={() => openReviewDialog(payment, 'approve')} disabled={!validation.canApprove}>
                Aprovar
              </Button>
              <Button size="sm" variant="outline" onClick={() => openReviewDialog(payment, 'return')}>
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
              <DialogTitle>{action === 'approve' ? 'Aprovar' : 'Devolver'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {action === 'approve' && (
                <div className="grid grid-cols-2 gap-2">
                  <Select value={competenciaMes} onValueChange={setCompetenciaMes}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Input
                    value={competenciaAno}
                    onChange={(e) => setCompetenciaAno(e.target.value)}
                  />
                </div>
              )}

              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Observação"
              />
            </div>

            <DialogFooter>
              <Button onClick={closeDialog}>Cancelar</Button>
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
