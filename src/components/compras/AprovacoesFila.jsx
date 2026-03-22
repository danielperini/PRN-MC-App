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

/* 🔥 NOVO: leitura da validação IA */
function getNFValidation(tp) {
  try {
    if (!tp?.resultado_validacao) return null;
    return JSON.parse(tp.resultado_validacao);
  } catch {
    return null;
  }
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
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
            <ExternalLink className="w-3 h-3 inline mr-1" />
            Abrir
          </a>
        )}
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

  const handleAction = async (purchase, action) => {

    const tp = teamPayments[purchase.id];
    const validation = getNFValidation(tp);

    if (action === 'approve_coord') {

      if (!hasOrcamentoVinculado(purchase)) {
        toast.error('Sem rubrica vinculada');
        return;
      }

      if (validation?.status === 'divergente') {
        toast.error('NF com divergência detectada');
        return;
      }
    }

    setLoading((l) => ({ ...l, [purchase.id]: true }));

    try {
      await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: action === 'approve_coord' ? 'aprovar' : 'reject',
      });

      toast.success('Atualizado');
      await onRefresh?.();

    } catch (e) {
      toast.error(e.message);
    }

    setLoading((l) => ({ ...l, [purchase.id]: false }));
  };

  if (pendentes.length === 0) {
    return <div className="text-center text-gray-400 py-8">Nenhuma pendente</div>;
  }

  return (
    <div className="space-y-4">
      {pendentes.map((p) => {

        const tp = teamPayments[p.id];
        const validation = getNFValidation(tp);
        const budgetLine = getBudgetLine(p);

        return (
          <div key={p.id} className="border p-4 rounded-xl space-y-3">

            <div className="flex justify-between">
              <div>
                <p className="font-semibold">{p.descricao_item}</p>
                <p className="text-xs text-gray-500">{p.fornecedor_nome}</p>
              </div>

              <p className="font-bold">{formatBRL(p.valor_solicitado)}</p>
            </div>

            {/* 🔥 NOVO BLOCO IA */}
            {validation && (
              <div className={`p-3 rounded-lg text-xs ${
                validation.status === 'divergente'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-green-50 border border-green-200'
              }`}>
                <p>NF: {formatBRL(validation.valor)}</p>
                <p>Confiança: {validation.confianca}%</p>

                {validation.status === 'divergente' && (
                  <p className="text-red-600 font-semibold">
                    Divergência detectada
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => handleAction(p, 'approve_coord')}
                disabled={
                  loading[p.id] ||
                  validation?.status === 'divergente'
                }
              >
                Aprovar
              </Button>

              <Button
                variant="outline"
                onClick={() => handleAction(p, 'reject')}
              >
                Recusar
              </Button>
            </div>

          </div>
        );
      })}
    </div>
  );
}
