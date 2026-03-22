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
        prompt: `Leia esta nota fiscal e valide com rigor:

Empresa:
Viaduto das Artes
CNPJ: 23.843.648/0001-25

Regras:
- Deve mencionar "Museus Centro"
- Deve conter serviço prestado
- Deve conter mês/competência
- Deve conter dados bancários
- Deve ter CPF OU CNPJ (não ambos)

Retorne JSON:
{
 "valida": true/false,
 "valor": number,
 "mes": "texto",
 "descricao": "texto",
 "erros": []
}`,
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
    } catch (e) {
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
          nf_nome_arquivo: buildNFFileName(
            member,
            payment.parcela,
            payment.valor_nf || payment.valor_parcela_previsto || payment.valorEsperado || 0
          )
        });

        await processNFIA(payment.id, file_url);
      }

      if (tipo === 'xml') {
        await base44.entities.TeamPayment.update(payment.id, {
          xml_url: file_url
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-payments-member', member.id] }),
        queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['team-payments-pending'] }),
        queryClient.invalidateQueries({ queryKey: ['team-payments-pending-review'] }),
      ]);
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
      await base44.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD',
        aprovado_em: new Date().toISOString()
      });

      try {
        await base44.functions.invoke('sendApprovedTeamInvoiceEmail', {
          to: 'notasfiscais@viadutodasartes.org.br',
          subject: `NF aprovada - ${member.user_name}`,
          member_name: member.user_name,
          valor: payment.valor_nf || payment.valorEsperado || 0,
          competencia: payment.mes_referencia,
          descricao: payment.descricao_nf,
          file_url: payment.nota_fiscal_url
        });
      } catch (e) {
        console.warn('Erro envio email (não bloqueante)', e);
      }

      toast.success('Pagamento aprovado');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-payments-member', member.id] }),
        queryClient.invalidateQueries({ queryKey: ['team-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['team-payments-pending'] }),
        queryClient.invalidateQueries({ queryKey: ['team-payments-pending-review'] }),
        queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
      ]);
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
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === 'docs' ? 'default' : 'outline'}
              className={mode === 'docs' ? 'bg-black text-white' : ''}
              onClick={() => setMode('docs')}
            >
              Documentos
            </Button>
            <Button
              size="sm"
              variant={mode === 'payment' ? 'default' : 'outline'}
              className={mode === 'payment' ? 'bg-black text-white' : ''}
              onClick={() => setMode('payment')}
            >
              Pagamento
            </Button>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <span className="text-gray-500">Função:</span>{' '}
                <strong>{member.funcao || '—'}</strong>
              </div>
              <div>
                <span className="text-gray-500">Parcelas:</span>{' '}
                <strong>{toNumber(member.parcelas_pagas)}/{toNumber(member.numero_parcelas)}</strong>
              </div>
              <div>
                <span className="text-gray-500">Valor total:</span>{' '}
                <strong>{formatBRL(member.valor_total)}</strong>
              </div>
              <div>
                <span className="text-gray-500">Saldo linha:</span>{' '}
                <strong>{budgetLine ? formatBRL(saldoBudgetLine) : 'Sem vínculo'}</strong>
              </div>
            </div>
          </div>

          {enrichedPayments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
              Nenhum envio financeiro encontrado para este membro
            </div>
          ) : (
            enrichedPayments.map((p) => {
              const badge = getStatusBadge(p.status, p._ready);

              return (
                <div key={p.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-semibold">
                        Parcela {p.parcela} • {p.mes_referencia || '—'} / {p.ano || '—'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Valor NF: {formatBRL(p.valor_nf || 0)}
                        {p.valorEsperado > 0 ? ` • Previsto: ${formatBRL(p.valorEsperado)}` : ''}
                      </p>
                      {p.numero_nf ? (
                        <p className="text-xs text-gray-500">NF nº {p.numero_nf}</p>
                      ) : null}
                    </div>

                    <Badge className={badge.className}>
                      {badge.label}
                    </Badge>
                  </div>

                  <div className="text-xs space-y-1">
                    <div>{p.checklist.contrato ? '✅' : '❌'} Contrato</div>
                    <div>{p.checklist.nf ? '✅' : '❌'} NF PDF</div>
                    <div>{p.checklist.xml ? '✅' : '❌'} XML</div>
                    <div>{p.checklist.saldoOk ? '✅' : '❌'} Saldo suficiente</div>
                  </div>

                  {(mode === 'docs' || mode === 'payment') && (
                    <div className="flex gap-2 flex-wrap">
                      {p.contract_url_resolved && (
                        <a href={p.contract_url_resolved} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline">
                            <FileCheck className="w-4 h-4 mr-1" />
                            Contrato
                          </Button>
                        </a>
                      )}

                      {p.nota_fiscal_url && (
                        <a href={p.nota_fiscal_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Ver NF PDF
                          </Button>
                        </a>
                      )}

                      {p.xml_url && (
                        <a href={p.xml_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Ver XML
                          </Button>
                        </a>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    <label className="cursor-pointer">
                      <Button size="sm" variant="outline" asChild>
                        <span>
                          <Upload className="w-4 h-4 mr-1" /> NF PDF
                        </span>
                      </Button>
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => uploadNF(p, e.target.files?.[0], 'pdf')}
                      />
                    </label>

                    <label className="cursor-pointer">
                      <Button size="sm" variant="outline" asChild>
                        <span>
                          <Upload className="w-4 h-4 mr-1" /> XML
                        </span>
                      </Button>
                      <input
                        type="file"
                        accept=".xml,text/xml,application/xml"
                        className="hidden"
                        onChange={(e) => uploadNF(p, e.target.files?.[0], 'xml')}
                      />
                    </label>
                  </div>

                  {p.nf_validada && (
                    <div className="text-xs space-y-1">
                      {p.nf_valida ? (
                        <div className="text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          NF válida
                        </div>
                      ) : (
                        <div className="text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          NF inválida
                        </div>
                      )}

                      {Array.isArray(p.nf_erros) && p.nf_erros.length > 0 && (
                        <div className="text-red-600">
                          {p.nf_erros.map((erro, idx) => (
                            <div key={idx}>• {erro}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isCoordenador && mode === 'payment' && (
                    <Button
                      size="sm"
                      className="bg-black text-white"
                      onClick={() => autorizarPagamento(p)}
                      disabled={
                        !p._ready ||
                        !p.nf_valida ||
                        loadingAction === p.id ||
                        p.status === 'PAGO'
                      }
                    >
                      {loadingAction === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : p.status === 'PAGO' ? (
                        'Pagamento concluído'
                      ) : p.status === 'APROVADO_COORD' ? (
                        'Já autorizado'
                      ) : (
                        'Autorizar pagamento'
                      )}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
