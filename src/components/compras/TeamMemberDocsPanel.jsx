import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ExternalLink,
  Receipt,
  FileText,
  BookOpen,
  Upload,
  CheckCircle2,
  Loader2,
  XCircle,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';

const PAYMENT_STATUS_COLORS = {
  RASCUNHO: 'bg-gray-100 text-gray-700',
  AGUARDANDO_APROVACAO: 'bg-blue-100 text-blue-700',
  EM_ANALISE_COORD: 'bg-yellow-100 text-yellow-700',
  DEVOLVIDO_REVISAO: 'bg-orange-100 text-orange-700',
  REVISAO: 'bg-orange-100 text-orange-700',
  APROVADO_COORD: 'bg-green-100 text-green-700',
  APROVADO: 'bg-green-100 text-green-700',
  ENCAMINHADO_COORD_ADMIN: 'bg-purple-100 text-purple-700',
  PAGO: 'bg-emerald-100 text-emerald-700',
  RECUSADO: 'bg-red-100 text-red-700',
  FINALIZADO: 'bg-gray-100 text-gray-500',
};

const PAYMENT_STATUS_LABELS = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  EM_ANALISE_COORD: 'Em Análise',
  DEVOLVIDO_REVISAO: 'Devolvido',
  REVISAO: 'Em Revisão',
  APROVADO_COORD: 'Aprovado Coord.',
  APROVADO: 'Aprovado',
  ENCAMINHADO_COORD_ADMIN: 'Enc. Adm.',
  PAGO: 'Pago',
  RECUSADO: 'Recusado',
  FINALIZADO: 'Finalizado',
};

const REPORT_STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  IN_REVIEW: 'bg-yellow-100 text-yellow-700',
  RETURNED: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
};

const REPORT_STATUS_LABELS = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviado',
  IN_REVIEW: 'Em Revisão',
  RETURNED: 'Devolvido',
  APPROVED: 'Aprovado',
  ARCHIVED: 'Arquivado',
};

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

function buildNotaFiscalSuggestedName(payment, member) {
  const parcela = payment?.numero_parcela || '?';
  const cargo = (member?.funcao || 'SEM CARGO').toUpperCase();
  const nome = (member?.user_name || member?.nome || payment?.user_email || 'SEM NOME').toUpperCase();
  const valor = formatBRL(payment?.valor_nf || 0);
  return `NF ${parcela} ${cargo} - ${nome} - MUSEUS CENTRO - ${valor}`;
}

export default function TeamMemberDocsPanel({
  member,
  initialTab = 'nf',
  onClose,
  isCoordenador,
  budgetLines = [],
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [uploadingContract, setUploadingContract] = useState(false);
  const queryClient = useQueryClient();

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['team-payments-member', member.id],
    queryFn: () => base44.entities.TeamPayment.filter({ team_member_id: member.id }, '-created_date', 50),
  });

  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['reports-member-email', member.user_email],
    queryFn: () => base44.entities.Report.filter({ created_by: member.user_email }, '-created_date', 50),
    enabled: activeTab === 'relatorios',
  });

  const budgetLine = budgetLines.find((b) => b.id === member.budgetline_id);

  const enrichedPayments = useMemo(() => {
    return (payments || []).map((payment) => {
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
        ...payment,
        _checklist: {
          contrato: { ok: !!contractUrl, href: contractUrl || null },
          nfPdf: { ok: !!nfPdfUrl, href: nfPdfUrl || null },
          nfXml: { ok: !!nfXmlUrl, href: nfXmlUrl || null },
        },
        _contract_url: contractUrl,
        _nf_pdf_url: nfPdfUrl,
        _nf_xml_url: nfXmlUrl,
        _suggested_nf_name: buildNotaFiscalSuggestedName(payment, member),
      };
    });
  }, [payments, member]);

  const handleAttachContract = async (paymentId, file) => {
    if (!file) return;
    setUploadingContract(paymentId);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.TeamPayment.update(paymentId, { contract_url: file_url });
      toast.success('Contrato anexado com sucesso');
      queryClient.invalidateQueries(['team-payments-member', member.id]);
    } catch (e) {
      toast.error('Erro ao anexar contrato: ' + e.message);
    } finally {
      setUploadingContract(false);
    }
  };

  const tabs = [
    { id: 'nf', label: 'Notas Fiscais', icon: Receipt },
    { id: 'contrato', label: 'Contrato', icon: FileText },
    { id: 'relatorios', label: 'Relatórios', icon: BookOpen },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {member.user_name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="font-semibold text-black">{member.user_name}</p>
              <p className="text-xs text-gray-500 font-normal">
                {member.funcao || 'Sem cargo'}
                {budgetLine && (
                  <span className="ml-2 text-gray-400">
                    • {budgetLine.codigo} — {budgetLine.descricao?.substring(0, 35)}
                  </span>
                )}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'nf' && (
            <div className="space-y-3">
              {loadingPayments ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : enrichedPayments.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma nota fiscal enviada</p>
                </div>
              ) : (
                enrichedPayments.map((payment) => (
                  <div key={payment.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm text-black">
                          {payment.mes_referencia} / {payment.ano}
                        </p>
                        {payment.numero_nf && <p className="text-xs text-gray-500">NF: {payment.numero_nf}</p>}
                        {payment.valor_nf > 0 && (
                          <p className="text-sm font-bold text-black mt-1">
                            {formatBRL(payment.valor_nf)}
                          </p>
                        )}
                      </div>
                      <Badge className={PAYMENT_STATUS_COLORS[payment.status] || 'bg-gray-100 text-gray-700'}>
                        {PAYMENT_STATUS_LABELS[payment.status] || payment.status}
                      </Badge>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2 mb-3">
                      <div className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                        <FileCheck className="w-3.5 h-3.5" />
                        Checklist documental
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <ChecklistItem
                          ok={payment._checklist.contrato.ok}
                          label="Contrato"
                          href={payment._checklist.contrato.href}
                        />
                        <ChecklistItem
                          ok={payment._checklist.nfPdf.ok}
                          label="NF PDF"
                          href={payment._checklist.nfPdf.href}
                        />
                        <ChecklistItem
                          ok={payment._checklist.nfXml.ok}
                          label="NF XML"
                          href={payment._checklist.nfXml.href}
                        />
                      </div>
                    </div>

                    {(payment.nf_valor_extraido || payment.nf_razao_social || payment.nf_competencia) && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 mb-2 text-xs">
                        <p className="font-semibold text-blue-700 mb-1">Dados extraídos via IA</p>
                        <div className="grid grid-cols-2 gap-1 text-blue-600">
                          {payment.nf_razao_social && <span>Emitente: {payment.nf_razao_social}</span>}
                          {payment.nf_valor_extraido && (
                            <span>Valor NF: {formatBRL(payment.nf_valor_extraido)}</span>
                          )}
                          {payment.nf_competencia && <span>Competência: {payment.nf_competencia}</span>}
                          {payment.nf_cnpj_emitente && <span>CNPJ: {payment.nf_cnpj_emitente}</span>}
                        </div>
                      </div>
                    )}

                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 mb-2 text-xs text-amber-800">
                      <p className="font-semibold mb-1">Nome lógico sugerido para PDF/XML da NF</p>
                      <p>{payment._suggested_nf_name}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {payment._nf_pdf_url && (
                        <a href={payment._nf_pdf_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-xs h-7">
                            <ExternalLink className="w-3 h-3 mr-1" />
                            PDF da NF
                          </Button>
                        </a>
                      )}
                      {payment._nf_xml_url && (
                        <a href={payment._nf_xml_url} target="_blank" rel="noopener noreferrer">
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
                    </div>

                    {payment.observacoes && (
                      <p className="text-xs text-orange-700 bg-orange-50 p-2 rounded mt-2">
                        💬 {payment.observacoes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'contrato' && (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-black mb-3">Contrato Principal</p>
                {member.contrato_url || member.contract_url ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <a
                      href={member.contrato_url || member.contract_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Ver PDF do Contrato
                      </Button>
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Nenhum contrato anexado ao cadastro</p>
                )}

                {member.valor_total > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-gray-50 p-2.5 rounded-lg">
                      <p className="text-gray-500">Valor Total</p>
                      <p className="font-bold text-black">{formatBRL(member.valor_total)}</p>
                    </div>
                    <div className="bg-gray-50 p-2.5 rounded-lg">
                      <p className="text-gray-500">Parcelas</p>
                      <p className="font-bold text-black">{member.numero_parcelas}x</p>
                    </div>
                    <div className="bg-gray-50 p-2.5 rounded-lg">
                      <p className="text-gray-500">Por Parcela</p>
                      <p className="font-bold text-black">{formatBRL(member.valor_parcela)}</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-black mb-2">Contratos por Período de Envio</p>
                {loadingPayments ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : enrichedPayments.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Nenhum envio registrado ainda</p>
                ) : (
                  <div className="space-y-2">
                    {enrichedPayments.map((payment) => (
                      <div
                        key={payment.id}
                        className="border border-gray-100 rounded-lg p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-black">
                            {payment.mes_referencia} / {payment.ano}
                          </p>
                          <p className="text-xs text-gray-400">
                            {payment._checklist.contrato.ok ? 'Contrato presente' : 'Contrato pendente'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {payment._contract_url ? (
                            <a href={payment._contract_url} target="_blank" rel="noopener noreferrer">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 border-green-300 text-green-700"
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Ver Contrato
                              </Button>
                            </a>
                          ) : isCoordenador ? (
                            <label className="cursor-pointer">
                              <div className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                                {uploadingContract === payment.id ? (
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
                          ) : (
                            <span className="text-xs text-gray-400">Não anexado</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'relatorios' && (
            <div className="space-y-3">
              {loadingReports ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : reports.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum relatório encontrado</p>
                </div>
              ) : (
                reports.map((report) => (
                  <div key={report.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm text-black">
                          {report.mes_referencia} / {report.ano}
                        </p>
                        {report.museu && <p className="text-xs text-gray-500 mt-0.5">{report.museu}</p>}
                        {report.equipe && <p className="text-xs text-gray-400">{report.equipe}</p>}
                      </div>
                      <Badge className={REPORT_STATUS_COLORS[report.status] || 'bg-gray-100 text-gray-700'}>
                        {REPORT_STATUS_LABELS[report.status] || report.status}
                      </Badge>
                    </div>
                    {report.resumo_executivo && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                        {report.resumo_executivo}
                      </p>
                    )}
                    {report.status !== 'APPROVED' && (
                      <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                        ⚠️ Relatório não aprovado — envio financeiro bloqueado para este mês
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
