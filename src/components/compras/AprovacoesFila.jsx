import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Loader2,
  Brain,
  AlertTriangle,
  ExternalLink,
  Link2,
} from 'lucide-react';
import ConformidadeBadge from '@/components/compras/ConformidadeBadge';

function toNumber(v) {
  return Number(v || 0);
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function parseJSON(str, fb = []) {
  try { return str ? JSON.parse(str) : fb; } catch { return fb; }
}

export default function AprovacoesFila({
  purchases = [],
  onRefresh,
  currentUser,
  hasGestaoCompras,
  podeAprovarSolicitacoes,
}) {

  const [loading, setLoading] = useState({});
  const [teamPayments, setTeamPayments] = useState({});
  const [cientesDuvidas, setCientesDuvidas] = useState({});
  const [analisando, setAnalisando] = useState({});

  const isCoordenador = [
    'ADMIN','admin','COORDENADOR','COORD_COMUNICACAO','COORD_ADMINISTRATIVA','COORD_PRODUCAO',
  ].includes(currentUser?.role);

  const podeAprovar =
    isCoordenador ||
    hasGestaoCompras === true ||
    podeAprovarSolicitacoes === true;

  const pendentes = (purchases || []).filter(p => p.status === 'SOLICITADO');

  const hasRubrica = (p) => !!p?.rubrica_id;

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

    if (!podeAprovar) {
      toast.error('Sem permissão', { duration: 3000 });
      return;
    }

    if (loading[purchase.id]) return; // 🔒 bloqueia clique duplo

    const tp = teamPayments[purchase.id];
    const duvidas = parseJSON(tp?.conformidade_duvidas, []);

    // 🔒 REGRAS CRÍTICAS
    if (action === 'approve') {

      if (!hasRubrica(purchase)) {
        toast.error('Vincule uma rubrica antes de aprovar.', { duration: 3000 });
        return;
      }

      if (duvidas.length > 0 && !cientesDuvidas[purchase.id]) {
        toast.warning('Confirme ciência das dúvidas da IA.', { duration: 3000 });
        return;
      }
    }

    setLoading(l => ({ ...l, [purchase.id]: true }));

    try {

      await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: action === 'approve' ? 'aprovar' : 'reject',
      });

      // 🔒 GARANTIA: NÃO DEBITAR RUBRICA AQUI
      // (backend deve respeitar regra — aqui só UI)

      if (action === 'approve') {
        toast.success('Aprovado com sucesso', { duration: 3000 });
      } else {
        toast.success('Recusado com sucesso', { duration: 3000 });
      }

      await onRefresh?.();

    } catch (e) {
      toast.error(e?.message || 'Erro na operação', { duration: 3000 });
    }

    setLoading(l => ({ ...l, [purchase.id]: false }));
  };

  if (pendentes.length === 0) {
    return <div className="text-center py-8 text-gray-400">Nenhuma pendente</div>;
  }

  return (
    <div className="space-y-4">
      {pendentes.map((p) => {

        const tp = teamPayments[p.id];
        const duvidas = parseJSON(tp?.conformidade_duvidas, []);
        const temDuvidas = duvidas.length > 0;

        return (
          <div key={p.id} className="border p-4 rounded-xl space-y-4">

            <div className="flex justify-between">
              <div>
                <p className="font-semibold">{p.descricao_item}</p>
                <p className="text-xs text-gray-500">{p.fornecedor_nome}</p>
              </div>
              <p className="font-bold">{formatBRL(p.valor_solicitado)}</p>
            </div>

            {/* 🔎 IA */}
            {tp && (
              <div className="space-y-2">
                {tp.conformidade_percentual ? (
                  <ConformidadeBadge tp={tp} />
                ) : (
                  <button
                    onClick={async () => {
                      setAnalisando(a => ({ ...a, [p.id]: true }));
                      try {
                        await base44.functions.invoke('analisarConformidadeNF', {
                          team_payment_id: tp.id,
                          purchase_id: p.id,
                        });
                        toast.success('Análise concluída', { duration: 3000 });
                        await onRefresh?.();
                      } catch {
                        toast.error('Erro na análise', { duration: 3000 });
                      }
                      setAnalisando(a => ({ ...a, [p.id]: false }));
                    }}
                    disabled={analisando[p.id]}
                    className="flex items-center gap-2 text-xs text-purple-600"
                  >
                    {analisando[p.id]
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Brain className="w-3 h-3" />}
                    Analisar NF
                  </button>
                )}

                {temDuvidas && (
                  <label className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!cientesDuvidas[p.id]}
                      onChange={e =>
                        setCientesDuvidas(c => ({
                          ...c,
                          [p.id]: e.target.checked
                        }))
                      }
                    />
                    Estou ciente das dúvidas
                  </label>
                )}
              </div>
            )}

            {/* ⚠️ ALERTA DE RUBRICA */}
            {!hasRubrica(p) && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertTriangle className="w-4 h-4" />
                Sem rubrica vinculada
              </div>
            )}

            <div className="flex gap-2">

              <Button
                onClick={() => handleAction(p, 'approve')}
                disabled={
                  loading[p.id] ||
                  !hasRubrica(p) ||
                  (temDuvidas && !cientesDuvidas[p.id])
                }
              >
                {loading[p.id]
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : 'Aprovar'}
              </Button>

              <Button
                variant="outline"
                onClick={() => handleAction(p, 'reject')}
                disabled={loading[p.id]}
              >
                {loading[p.id]
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : 'Recusar'}
              </Button>

            </div>
          </div>
        );
      })}
    </div>
  );
}
