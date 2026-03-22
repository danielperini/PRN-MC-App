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
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
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
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            <ExternalLink className="w-3 h-3" />
            Abrir
          </a>
        ) : null}
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
  const [action, setAction] = useState(null); // 'approve' | 'return'
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

    const nfPdfUrl =
      payment?.nota_fiscal_url ||
      payment?.nf_pdf_url ||
      payment?.nota_fiscal_pdf_url ||
      '';

    const nfXmlUrl =
      payment?.xml_url ||
      payment?.nf_xml_url ||
      payment?.nota_fiscal_xml_url ||
      '';

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
      toast.error('Não é possível aprovar: verifique documentos, parcelas disponíveis e saldo da rubrica.');
      return;
    }

    if (action === 'return' && !comment.trim()) {
      toast.error('Informe o motivo da devolução.');
      return;
    }

    if (action === 'approve' && (!competenciaMes || !competenciaAno)) {
      toast.error('Selecione a competência autorizada.');
      return;
    }

    setSaving(true);
    try {
      const user = await base44.auth.me();
      const isApprove = action === 'approve';

      const observacaoFinal = isApprove
        ? [
            comment?.trim() || '',
            `Competência autorizada: ${competenciaMes}/${competenciaAno}`,
            `Parcelas: ${validation.parcelasPagas}/${validation.parcelasPrevistas} pagas antes desta aprovação`,
            `Saldo da rubrica/linha no momento da aprovação: ${formatBRL(validation.saldoLinha)}`,
          ]
            .filter(Boolean)
            .join('\n')
        : comment.trim();

      await base44.entities.TeamPayment.update(reviewingPayment.id, {
        status: isApprove ? 'APROVADO_COORD' : 'DEVOLVIDO_REVISAO',
        observacoes: observacaoFinal || null,
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString(),
      });

      if (isApprove && validation.member?.id) {
        await base44.entities.TeamMember.update(validation.member.id, {
          parcelas_pagas: validation.parcelasPagas + 1,
        });
      }

      try {
        await base44.integrations.Core.SendEmail({
          to: reviewingPayment.user_email,
          subject: isApprove ? '✅ Envio financeiro aprovado' : '↩️ Envio financeiro devolvido para revisão',
          body: isApprove
            ? `Olá! Seu pagamento de ${reviewingPayment.mes_referencia}/${reviewingPayment.ano} foi aprovado pelo coordenador.

Competência autorizada: ${competenciaMes}/${competenciaAno}
Valor: ${formatBRL(reviewingPayment.valor_nf)}
${comment?.trim() ? `Observação: ${comment.trim()}` : ''}

Acesse o pagamento na plataforma para acompanhamento.`
            : `Olá! Seu envio financeiro de ${reviewingPayment.mes_referencia}/${reviewingPayment.ano} foi devolvido para revisão.

Observação do coordenador: ${comment.trim()}

Acesse o pagamento na plataforma, corrija os documentos e reenvie.`,
        });
      } catch {}

      toast.success(isApprove ? 'Envio aprovado com sucesso!' : 'Devolvido para revisão');
      queryClient.invalidateQueries(['team-payments-pending-review']);
      queryClient.invalidateQueries(['team-payments-pending']);
      queryClient.invalidateQueries(['team-payments']);
      queryClient.invalidateQueries(['team-members']);
      closeDialog();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAttachContract = async (paymentId, file) => {
    if (!file) return;
    setUploadingContractFor(paymentId);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.TeamPayment.update(paymentId, { contract_url: file_url });
      toast.success('Contrato anexado');
      queryClient.invalidateQueries(['team-payments-pending-review']);
    } catch (e) {
      toast.error('Erro ao anexar: ' + e.message);
    } finally {
      setUploadingContractFor(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-2xl p-14 text-center">
        <ClipboardCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Nenhum envio aguardando revisão</p>
        <p className="text-sm text-gray-400 mt-1">Quando membros enviarem documentos financeiros, aparecerão aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 font-medium">{payments.length} envio(s) aguardando revisão</p>

      {payments.map((payment) => {
        const validation = getValidation(payment);
        const { member, budgetLine, checklist } = validation;

        return (
          <div key={payment.id} className="border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {(member?.user_name || payment.user_email)?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-semibold text-black">{member?.user_name || payment.user_email}</p>
                  {member?.funcao && <p className="text-xs text-gray-500">{member.funcao}</p>}
                  <p className="text-xs text-gray-400">{payment.mes_referencia} / {payment.ano}</p>
                  {budgetLine && (
                    <p className="text-xs text-gray-400">
                      {budgetLine.codigo} — {budgetLine.descricao?.substring(0, 50)}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-black text-lg">
                  {payment.valor_nf ? formatBRL(payment.valor_nf) : '—'}
                </p>
                {payment.numero_nf && <p className="text-xs text-gray-500">NF nº {payment.numero_nf}</p>}
                <Badge className={STATUS_COLORS[payment.status] || 'bg-gray-100 text-gray-700'}>
                  {STATUS_LABELS[payment.status] || payment.status}
                </Badge>
              </div>
            </div>

            {(payment.nf_valor_extraido || payment.nf_razao_social || payment.nf_competencia) && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-blue-800 mb-1.5">📊 Dados extraídos da NF (IA)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-700">
                  {payment.nf_razao_social && <span><span className="text-blue-500">Emitente:</span> {payment.nf_razao_social}</span>}
                  {payment.nf_valor_extraido && (
                    <span>
                      <span className="text-blue-500">Valor NF:</span> {formatBRL(payment.nf_valor_extraido)}
                      {toNumber(payment.nf_valor_extraido) !== toNumber(payment.valor_nf) && toNumber(payment.valor_nf) > 0 && (
                        <span className="text-orange-600 ml-1">⚠️ difere do declarado</span>
                      )}
                    </span>
                  )}
                  {payment.nf_competencia && <span><span className="text-blue-500">Competência:</span> {payment.nf_competencia}</span>}
                  {payment.nf_cnpj_emitente && <span><span className="text-blue-500">CNPJ:</span> {payment.nf_cnpj_emitente}</span>}
                  {payment.nf_data_emissao && <span><span className="text-blue-500">Emissão:</span> {payment.nf_data_emissao}</span>}
                  {payment.nf_numero_extraido && <span><span className="text-blue-500">Nº NF:</span> {payment.nf_numero_extraido}</span>}
                </div>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2 mb-3">
              <div className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                <FileCheck className="w-3.5 h-3.5" />
                Checklist documental
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <ChecklistItem ok={checklist.contrato.ok} label="Contrato" href={checklist.contrato.href} />
                <ChecklistItem ok={checklist.nfPdf.ok} label="NF PDF" href={checklist.nfPdf.href} />
                <ChecklistItem ok={checklist.nfXml.ok} label="NF XML" href={checklist.nfXml.href} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4 text-xs">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-gray-500">Parcelas Previstas</p>
                <p className="font-semibold text-black">{validation.parcelasPrevistas}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-gray-500">Pagas / Restantes</p>
                <p className="font-semibold text-black">
                  {validation.parcelasPagas}/{validation.parcelasPrevistas}
                  <span className="text-gray-400 font-normal"> • restam {validation.parcelasRestantes}</span>
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-gray-500">Valor da Parcela</p>
                <p className="font-semibold text-black">{formatBRL(validation.valorParcela)}</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-gray-500">Saldo da Rubrica / Linha</p>
                <p className={`font-semibold ${validation.hasSaldo ? 'text-black' : 'text-red-600'}`}>
                  {budgetLine ? formatBRL(validation.saldoLinha) : 'Sem vínculo'}
                </p>
              </div>
            </div>

            {(!validation.hasDocs || !validation.hasParcelas || !validation.hasSaldo) && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {!validation.hasDocs && <p>Faltam documentos obrigatórios: contrato, NF PDF e/ou NF XML.</p>}
                  {!validation.hasParcelas && <p>Não há parcelas disponíveis para este membro.</p>}
                  {!validation.hasSaldo && <p>Saldo insuficiente ou rubrica/linha não vinculada.</p>}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-4">
              {payment.nota_fiscal_url && (
                <a href={payment.nota_fiscal_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    PDF da NF
                  </Button>
                </a>
              )}
              {payment.xml_url && (
                <a href={payment.xml_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    XML da NF
                  </Button>
                </a>
              )}
              {payment.xlsx_url && (
                <a href={payment.xlsx_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Planilha XLSX
                  </Button>
                </a>
              )}
              {checklist.contrato.href ? (
                <a href={checklist.contrato.href} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="text-xs h-7 border-green-300 text-green-700">
                    <FileCheck className="w-3 h-3 mr-1" />
                    Contrato
                  </Button>
                </a>
              ) : (
                <label className="cursor-pointer">
                  <div className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-dashed border-gray-300 rounded-md hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer">
                    {uploadingContractFor === payment.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    Anexar Contrato
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleAttachContract(payment.id, e.target.files[0])}
                  />
                </label>
              )}
            </div>

            <div className="flex gap-2 pt-3 border-t border-gray-100">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white text-xs h-8 gap-1.5 disabled:opacity-50"
                onClick={() => openReviewDialog(payment, 'approve')}
                disabled={!validation.canApprove}
                title={!validation.canApprove ? 'Verifique checklist, parcelas e saldo antes de aprovar' : ''}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Autorizar Pagamento
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 gap-1.5 text-orange-600 border-orange-300 hover:bg-orange-50"
                onClick={() => openReviewDialog(payment, 'return')}
              >
                <XCircle className="w-3.5 h-3.5" />
                Devolver para Revisão
              </Button>
            </div>
          </div>
        );
      })}

      {reviewingPayment && (
        <Dialog open onOpenChange={closeDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {action === 'approve' ? '✅ Confirmar Autorização de Pagamento' : '↩️ Devolver para Revisão'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="font-semibold text-black">
                  {getMember(reviewingPayment)?.user_name || reviewingPayment.user_email}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  Envio: {reviewingPayment.mes_referencia} / {reviewingPayment.ano}
                </p>
                {reviewingPayment.valor_nf > 0 && (
                  <p className="font-bold text-black mt-2">{formatBRL(reviewingPayment.valor_nf)}</p>
                )}
              </div>

              {action === 'approve' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Mês da competência *</Label>
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
                      <Label className="text-xs">Ano da competência *</Label>
                      <Input
                        type="number"
                        value={competenciaAno}
                        onChange={(e) => setCompetenciaAno(e.target.value)}
                        min="2024"
                      />
                    </div>
                  </div>

                  {reviewingValidation && !reviewingValidation.canApprove && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        {!reviewingValidation.hasDocs && <p>Checklist documental incompleto.</p>}
                        {!reviewingValidation.hasParcelas && <p>Não há parcelas restantes para autorizar.</p>}
                        {!reviewingValidation.hasSaldo && <p>Saldo insuficiente ou sem vínculo de rubrica/linha.</p>}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  {action === 'approve' ? 'Observação (opcional)' : 'Motivo da devolução *'}
                </label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    action === 'approve'
                      ? 'Observações do coordenador...'
                      : 'Descreva o que precisa ser corrigido ou reapresentado...'
                  }
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                className={
                  action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }
                onClick={handleConfirmAction}
                disabled={
                  saving ||
                  (action === 'return' && !comment.trim()) ||
                  (action === 'approve' && (!reviewingValidation?.canApprove || !competenciaMes || !competenciaAno))
                }
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {action === 'approve' ? 'Confirmar Autorização' : 'Devolver'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
