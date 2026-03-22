import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Link2,
  Undo2,
  ExternalLink,
  FileCheck,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

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
        <span>{ok ? 'OK' : 'Pendente'}</span>
      </div>
    </div>
  );
}

export default function AprovacoesFila({
  purchases = [],
  budgetLines = [],
  onRefresh,
  currentUser,
  hasGestaoCompras,
  podeAprovarSolicitacoes,
}) {
  const [loading, setLoading] = useState({});
  const [comentarios, setComentarios] = useState({});
  const [teamPayments, setTeamPayments] = useState({});

  const isCoordenador = [
    'ADMIN',
    'admin',
    'COORDENADOR',
    'COORD_COMUNICACAO',
    'COORD_ADMINISTRATIVA',
    'COORD_PRODUCAO',
  ].includes(currentUser?.role);

  const podeAprovar =
    isCoordenador ||
    hasGestaoCompras === true ||
    podeAprovarSolicitacoes === true;

  const pendentes = (purchases || []).filter((p) => p.status === 'SOLICITADO');

  const getBudgetLineId = (p) =>
    p?.budgetline_id ||
    p?.budget_line_id ||
    p?.linha_orcamentaria_id ||
    null;

  const getBudgetLine = (p) =>
    (budgetLines || []).find(
      (b) =>
        b.id === p.budgetline_id ||
        b.id === p.budget_line_id ||
        b.id === p.linha_orcamentaria_id
    ) || null;

  const isTeam = (p) =>
    p?.origem === 'TEAM_PAYMENT' || !!p?.team_payment_id;

  const hasOrcamentoVinculado = (p) =>
    !!p?.rubrica_id || !!getBudgetLineId(p);

  const getChecklist = (purchase, tp) => {
    const contractUrl =
      tp?.contract_url ||
      purchase?.contract_url ||
      purchase?.contrato_url ||
      purchase?.team_contract_url ||
      '';

    const nfPdfUrl =
      tp?.nota_fiscal_url ||
      purchase?.nota_fiscal_url ||
      purchase?.nf_pdf_url ||
      purchase?.nota_fiscal_pdf_url ||
      '';

    const nfXmlUrl =
      tp?.xml_url ||
      purchase?.xml_url ||
      purchase?.nf_xml_url ||
      purchase?.nota_fiscal_xml_url ||
      '';

    return {
      contrato: { ok: !!contractUrl, href: contractUrl || null },
      nfPdf: { ok: !!nfPdfUrl, href: nfPdfUrl || null },
      nfXml: { ok: !!nfXmlUrl, href: nfXmlUrl || null },
    };
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      const map = {};
      for (const p of purchases || []) {
        if (p?.team_payment_id) {
          try {
            const tp = await base44.entities.TeamPayment.get(p.team_payment_id);
            if (tp) map[p.id] = tp;
          } catch {}
        }
      }
      if (active) setTeamPayments(map);
    };

    load();
    return () => {
      active = false;
    };
  }, [purchases]);

  const handleAction = async (purchase, action) => {
    if (!podeAprovar) {
      toast.error('Você não tem permissão para processar solicitações.');
      return;
    }

    const comentario = comentarios[purchase.id] || '';
    const tp = teamPayments[purchase.id];
    const teamPurchase = isTeam(purchase);

    if (action === 'approve_coord') {
      if (!hasOrcamentoVinculado(purchase)) {
        toast.error('Vincule uma rubrica ou linha orçamentária antes de aprovar.');
        return;
      }

      if (teamPurchase && tp && tp.nf_valida === false) {
        toast.error('NF inválida. Não pode aprovar.');
        return;
      }
    }

    if (action === 'return_to_user' && !comentario.trim()) {
      toast.error('Informe um comentário para devolver ao usuário.');
      return;
    }

    setLoading((l) => ({ ...l, [purchase.id]: true }));

    try {
      let backendAction = 'reject';
      if (action === 'approve_coord') backendAction = 'aprovar';
      if (action === 'return_to_user') backendAction = 'devolver_usuario';

      await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: backendAction,
        comentario,
      });

      if (action === 'approve_coord') {
        toast.success('Solicitação aprovada.');
      } else if (action === 'return_to_user') {
        toast.success('Solicitação devolvida ao usuário.');
      } else {
        toast.success('Solicitação recusada.');
      }

      await onRefresh?.();
    } catch (e) {
      toast.error('Erro ao processar: ' + (e?.message || 'Erro desconhecido'));
    } finally {
      setLoading((l) => ({ ...l, [purchase.id]: false }));
    }
  };

  if (pendentes.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-8 border-2 border-dashed border-gray-100 rounded-xl">
        Nenhuma solicitação pendente
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendentes.map((p) => {
        const tp = teamPayments[p.id];
        const budgetLine = getBudgetLine(p);
        const vinculoOk = hasOrcamentoVinculado(p);
        const checklist = getChecklist(p, tp);

        const saldoDisponivel = budgetLine
          ? toNumber(budgetLine.saldo_inicial) - toNumber(budgetLine.saldo_comprometido)
          : null;

        const saldoOk =
          saldoDisponivel === null ||
          saldoDisponivel >= toNumber(p.valor_solicitado);

        return (
          <div key={p.id} className="border p-4 rounded-xl space-y-4">
            <div className="flex justify-between gap-4">
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  {isTeam(p) && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      👤 Equipe
                    </span>
                  )}

                  {vinculoOk ? (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      Com vínculo orçamentário
                    </span>
                  ) : (
                    <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Sem vínculo orçamentário
                    </span>
                  )}
                </div>

                <p className="font-semibold">{p.descricao_item}</p>

                {isTeam(p) && tp && (
                  <p className="text-xs text-purple-700">
                    Parcela {tp.numero_parcela || '-'} • {tp.mes_referencia || '-'} / {tp.ano || '-'}
                  </p>
                )}

                {p.fornecedor_nome && (
                  <p className="text-xs text-gray-500">
                    {p.fornecedor_nome}
                    {p.fornecedor_cnpj ? ` — ${p.fornecedor_cnpj}` : ''}
                  </p>
                )}
              </div>

              <div className="text-right">
                <p className="font-bold">{formatBRL(p.valor_solicitado || 0)}</p>
                {budgetLine && (
                  <p className="text-xs text-gray-500 mt-1">
                    {budgetLine.codigo} — {budgetLine.descricao}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
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

            {!vinculoOk && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>Esta solicitação não deve ser aprovada enquanto não houver vínculo orçamentário.</div>
              </div>
            )}

            {budgetLine && (
              <div
                className={`p-3 rounded-lg text-xs ${
                  saldoOk
                    ? 'bg-green-50 border border-green-100 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                <div className="flex flex-wrap gap-4">
                  <span>Saldo inicial: <strong>{formatBRL(budgetLine.saldo_inicial)}</strong></span>
                  <span>Comprometido: <strong>{formatBRL(budgetLine.saldo_comprometido)}</strong></span>
                  <span>Disponível: <strong>{formatBRL(saldoDisponivel)}</strong></span>
                </div>
                {!saldoOk && (
                  <p className="mt-1 font-semibold">Saldo insuficiente para aprovação.</p>
                )}
              </div>
            )}

            <Textarea
              placeholder="Comentário"
              value={comentarios[p.id] || ''}
              onChange={(e) =>
                setComentarios((prev) => ({ ...prev, [p.id]: e.target.value }))
              }
            />

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                className="border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => handleAction(p, 'return_to_user')}
                disabled={loading[p.id] || !podeAprovar}
              >
                {loading[p.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Undo2 className="w-4 h-4 mr-1" />
                )}
                Devolver ao Usuário
              </Button>

              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => handleAction(p, 'reject')}
                disabled={loading[p.id] || !podeAprovar}
              >
                {loading[p.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <XCircle className="w-4 h-4 mr-1" />
                )}
                Recusar
              </Button>

              <Button
                className="bg-black hover:bg-gray-800 text-white disabled:opacity-50"
                onClick={() => handleAction(p, 'approve_coord')}
                disabled={
                  loading[p.id] ||
                  !podeAprovar ||
                  !vinculoOk ||
                  !saldoOk ||
                  (isTeam(p) && tp && tp.nf_valida === false)
                }
                title={
                  !podeAprovar
                    ? 'Você não tem permissão para aprovar'
                    : !vinculoOk
                      ? 'Vincule rubrica ou linha orçamentária antes de aprovar'
                      : !saldoOk
                        ? 'Saldo insuficiente'
                        : isTeam(p) && tp && tp.nf_valida === false
                          ? 'NF inválida'
                          : ''
                }
              >
                {loading[p.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-1" />
                )}
                Aprovar Pagamento
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
