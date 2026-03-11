import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, XCircle, ExternalLink, Loader2, ClipboardCheck, Upload, FileCheck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

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

export default function TeamPaymentReview({ members = [], budgetLines = [] }) {
  const queryClient = useQueryClient();
  const [reviewingPayment, setReviewingPayment] = useState(null);
  const [action, setAction] = useState(null); // 'approve' | 'return'
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingContractFor, setUploadingContractFor] = useState(null);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['team-payments-pending-review'],
    queryFn: () => base44.entities.TeamPayment.filter({ status: 'AGUARDANDO_APROVACAO' }, '-created_date', 100),
  });

  const getMember = (payment) =>
    members.find(m => m.id === payment.team_member_id || m.user_email === payment.user_email);

  const handleConfirmAction = async () => {
    if (!reviewingPayment) return;
    setSaving(true);
    try {
      const user = await base44.auth.me();
      const isApprove = action === 'approve';

      await base44.entities.TeamPayment.update(reviewingPayment.id, {
        status: isApprove ? 'APROVADO_COORD' : 'DEVOLVIDO_REVISAO',
        observacoes: comment || null,
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString(),
      });

      // Notify user
      try {
        await base44.integrations.Core.SendEmail({
          to: reviewingPayment.user_email,
          subject: isApprove ? '✅ Envio financeiro aprovado' : '↩️ Envio financeiro devolvido para revisão',
          body: isApprove
            ? `Olá! Seu pagamento de ${reviewingPayment.mes_referencia}/${reviewingPayment.ano} foi aprovado pelo coordenador e encaminhado ao Coordenador Administrativo.`
            : `Olá! Seu envio financeiro de ${reviewingPayment.mes_referencia}/${reviewingPayment.ano} foi devolvido para revisão.\n\n${comment ? `Observação do coordenador: ${comment}` : 'Verifique os documentos e reenvie.'}`
        });
      } catch {}

      toast.success(isApprove ? 'Envio aprovado com sucesso!' : 'Devolvido para revisão');
      queryClient.invalidateQueries(['team-payments-pending-review']);
      queryClient.invalidateQueries(['team-payments-pending']);
      setReviewingPayment(null);
      setAction(null);
      setComment('');
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

      {payments.map(payment => {
        const member = getMember(payment);
        const budgetLine = budgetLines.find(b => b.id === member?.budgetline_id);

        return (
          <div key={payment.id} className="border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {(member?.user_name || payment.user_email)?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-semibold text-black">{member?.user_name || payment.user_email}</p>
                  {member?.funcao && <p className="text-xs text-gray-500">{member.funcao}</p>}
                  <p className="text-xs text-gray-400">{payment.mes_referencia} / {payment.ano}</p>
                  {budgetLine && <p className="text-xs text-gray-400">{budgetLine.codigo} — {budgetLine.descricao?.substring(0, 35)}</p>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-black text-lg">
                  R$ {payment.valor_nf?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '—'}
                </p>
                {payment.numero_nf && <p className="text-xs text-gray-500">NF nº {payment.numero_nf}</p>}
                <Badge className={STATUS_COLORS[payment.status] || 'bg-gray-100 text-gray-700'}>
                  {STATUS_LABELS[payment.status] || payment.status}
                </Badge>
              </div>
            </div>

            {/* AI Extracted data */}
            {(payment.nf_valor_extraido || payment.nf_razao_social || payment.nf_competencia) && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-blue-800 mb-1.5">📊 Dados extraídos da NF (IA)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-700">
                  {payment.nf_razao_social && <span><span className="text-blue-500">Emitente:</span> {payment.nf_razao_social}</span>}
                  {payment.nf_valor_extraido && (
                    <span>
                      <span className="text-blue-500">Valor NF:</span> R$ {payment.nf_valor_extraido?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      {payment.nf_valor_extraido !== payment.valor_nf && payment.valor_nf > 0 && (
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

            {/* Documents */}
            <div className="flex flex-wrap gap-2 mb-4">
              {payment.nota_fiscal_url && (
                <a href={payment.nota_fiscal_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    <ExternalLink className="w-3 h-3 mr-1" />PDF da NF
                  </Button>
                </a>
              )}
              {payment.xlsx_url && (
                <a href={payment.xlsx_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    <ExternalLink className="w-3 h-3 mr-1" />Planilha XLSX
                  </Button>
                </a>
              )}
              {payment.contract_url ? (
                <a href={payment.contract_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="text-xs h-7 border-green-300 text-green-700">
                    <FileCheck className="w-3 h-3 mr-1" />Contrato
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
                    onChange={e => handleAttachContract(payment.id, e.target.files[0])}
                  />
                </label>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-gray-100">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white text-xs h-8 gap-1.5"
                onClick={() => { setReviewingPayment(payment); setAction('approve'); setComment(''); }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />Aprovar Envio
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 gap-1.5 text-orange-600 border-orange-300 hover:bg-orange-50"
                onClick={() => { setReviewingPayment(payment); setAction('return'); setComment(''); }}
              >
                <XCircle className="w-3.5 h-3.5" />Devolver para Revisão
              </Button>
            </div>
          </div>
        );
      })}

      {/* Confirmation Dialog */}
      {reviewingPayment && (
        <Dialog open onOpenChange={() => { setReviewingPayment(null); setAction(null); setComment(''); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {action === 'approve' ? '✅ Confirmar Aprovação' : '↩️ Devolver para Revisão'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="font-semibold text-black">
                  {getMember(reviewingPayment)?.user_name || reviewingPayment.user_email}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {reviewingPayment.mes_referencia} / {reviewingPayment.ano}
                </p>
                {reviewingPayment.valor_nf > 0 && (
                  <p className="font-bold text-black mt-2">
                    R$ {reviewingPayment.valor_nf?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>

              {action === 'approve' && !reviewingPayment.contract_url && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Nenhum contrato foi anexado para este período. Recomendamos anexar antes de aprovar.</span>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  {action === 'approve' ? 'Observação (opcional)' : 'Motivo da devolução *'}
                </label>
                <Textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={action === 'approve'
                    ? 'Observações do coordenador...'
                    : 'Descreva o que precisa ser corrigido ou reapresentado...'}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setReviewingPayment(null); setAction(null); }}>
                Cancelar
              </Button>
              <Button
                className={action === 'approve'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'}
                onClick={handleConfirmAction}
                disabled={saving || (action === 'return' && !comment.trim())}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {action === 'approve' ? 'Confirmar Aprovação' : 'Devolver'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}