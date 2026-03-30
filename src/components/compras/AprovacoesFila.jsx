import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toastMessages } from '@/lib/toastMessages';
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
  Brain,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import ConformidadeBadge from '@/components/compras/ConformidadeBadge';

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

function getNFValidation(tp) {
  try {
    if (!tp?.resultado_validacao) return null;
    return JSON.parse(tp.resultado_validacao);
  } catch {
    return null;
  }
}

function parseJSON(str, fb = []) {
  try { return str ? JSON.parse(str) : fb; } catch { return fb; }
}

function ChecklistItem({ ok, label, href }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
      ok
        ? 'border-green-200 bg-green-50 text-green-800'
        : 'border-red-200 bg-red-50 text-red-800'
    }`}>
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
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
  const [expandedConformidade, setExpandedConformidade] = useState({});
  const [cientesDuvidas, setCientesDuvidas] = useState({});
  const [analisando, setAnalisando] = useState({});

  const isCoordenador = [
    'ADMIN','admin','COORDENADOR','COORD_COMUNICACAO','COORD_ADMINISTRATIVA','COORD_PRODUCAO',
  ].includes(currentUser?.role);

  const podeAprovar =
    isCoordenador ||
    hasGestaoCompras === true ||
    podeAprovarSolicitacoes === true;

  const pendentes = (purchases || []).filter((p) => p.status === 'SOLICITADO');

  const getBudgetLineId = (p) =>
    p?.budgetline_id || p?.budget_line_id || p?.linha_orcamentaria_id || null;

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
    return () => { active = false; };
  }, [purchases]);

  const handleAnalisarNF = async (purchase, tp) => {
    setAnalisando(a => ({ ...a, [purchase.id]: true }));
    try {
      await base44.functions.invoke('analisarConformidadeNF', {
        team_payment_id: tp.id,
        purchase_id: purchase.id,
      });
      toastMessages.info('Análise de conformidade concluída!');
      await onRefresh?.();
    } catch (e) {
      toastMessages.warning('Erro ao analisar nota fiscal: ' + (e?.message || e));
    } finally {
      setAnalisando(a => ({ ...a, [purchase.id]: false }));
    }
  };

  const handleAction = async (purchase, action) => {

    if (!podeAprovar) {
      toastMessages.permissionDenied();
      return;
    }

    const comentario = comentarios[purchase.id] || '';
    const tp = teamPayments[purchase.id];
    const validation = getNFValidation(tp);

    if (action === 'approve_coord') {

      if (!hasOrcamentoVinculado(purchase)) {
        toastMessages.validationError('Vincule uma rubrica antes de aprovar.');
        return;
      }

      if (validation?.status === 'divergente') {
        toastMessages.warning('Nota fiscal com divergência detectada. Corrija antes de aprovar.');
        return;
      }

      const tp2 = teamPayments[purchase.id];
      const duvidasTP = parseJSON(tp2?.conformidade_duvidas, []);
      if (duvidasTP.length > 0 && !cientesDuvidas[purchase.id]) {
        toastMessages.warning('Há dúvidas na NF apontadas pela IA. Marque "Estou ciente" para prosseguir.');
        return;
      }
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
        toastMessages.approveSuccess();
      } else if (action === 'return_to_user') {
        toastMessages.info('Solicitação devolvida ao usuário.');
      } else {
        toastMessages.rejectSuccess();
      }
      await onRefresh?.();

    } catch (e) {
      if (action === 'approve_coord') {
        toastMessages.approveFailed(e?.message);
      } else if (action === 'return_to_user') {
        toastMessages.warning('Erro ao devolver: ' + (e?.message || e));
      } else {
        toastMessages.rejectFailed(e?.message);
      }
    }

    setLoading((l) => ({ ...l, [purchase.id]: false }));
  };

  if (pendentes.length === 0) {
    return <div className="text-center py-8 text-gray-400">Nenhuma pendente</div>;
  }

  return (
    <div className="space-y-4">
      {pendentes.map((p) => {

        const tp = teamPayments[p.id];
        const validation = getNFValidation(tp);
        const budgetLine = getBudgetLine(p);
        const duvidasTP = parseJSON(tp?.conformidade_duvidas, []);
        const temDuvidas = duvidasTP.length > 0;
        const isExpConformidade = expandedConformidade[p.id];
        const vinculoOk = hasOrcamentoVinculado(p);

        const saldoDisponivel = budgetLine
          ? toNumber(budgetLine.saldo_inicial) - toNumber(budgetLine.saldo_comprometido)
          : null;

        const saldoOk =
          saldoDisponivel === null ||
          saldoDisponivel >= toNumber(p.valor_solicitado);

        return (
          <div key={p.id} className="border p-4 rounded-xl space-y-4">

            <div className="flex justify-between">
              <div>
                <p className="font-semibold">{p.descricao_item}</p>
                <p className="text-xs text-gray-500">{p.fornecedor_nome}</p>
              </div>
              <p className="font-bold">{formatBRL(p.valor_solicitado)}</p>
            </div>

            {/* BLOCO CONFORMIDADE IA */}
            {tp && (
              <div className="space-y-2">
                {tp.conformidade_percentual !== undefined && tp.conformidade_percentual !== null ? (
                  <div>
                    <button
                      onClick={() => setExpandedConformidade(e => ({ ...e, [p.id]: !e[p.id] }))}
                      className="w-full text-left"
                    >
                      <ConformidadeBadge tp={tp} expanded={isExpConformidade} />
                    </button>

                    {/* Ciência das dúvidas */}
                    {temDuvidas && (
                      <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!cientesDuvidas[p.id]}
                          onChange={e => setCientesDuvidas(c => ({ ...c, [p.id]: e.target.checked }))}
                          className="w-4 h-4"
                        />
                        <span className="text-amber-700 font-medium">
                          Estou ciente das dúvidas apontadas pela IA e verificarei manualmente antes de aprovar
                        </span>
                      </label>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleAnalisarNF(p, tp)}
                    disabled={analisando[p.id]}
                    className="flex items-center gap-2 text-xs text-purple-600 hover:text-purple-800 px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 w-full justify-center"
                  >
                    {analisando[p.id]
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando NF com IA...</>
                      : <><Brain className="w-3.5 h-3.5" /> Analisar conformidade da NF com IA</>}
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => handleAction(p, 'approve_coord')}
                disabled={
                  loading[p.id] ||
                  !vinculoOk ||
                  !saldoOk ||
                  validation?.status === 'divergente' ||
                  (temDuvidas && !cientesDuvidas[p.id])
                }
                title={temDuvidas && !cientesDuvidas[p.id] ? 'Confirme ciência das dúvidas da IA antes de aprovar' : ''}
              >
                {loading[p.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aprovar'}
              </Button>

              <Button
                variant="outline"
                onClick={() => handleAction(p, 'reject')}
                disabled={loading[p.id]}
              >
                {loading[p.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Recusar'}
              </Button>
            </div>

          </div>
        );
      })}
    </div>
  );
}