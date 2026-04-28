import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Loader2,
  Brain,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import ConformidadeBadge from '@/components/compras/ConformidadeBadge';

function toNumber(v) {
  return Number(v || 0);
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function parseJSON(str, fb = []) {
  try {
    return str ? JSON.parse(str) : fb;
  } catch {
    return fb;
  }
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function getValorPurchase(p) {
  return p?.valor_solicitado || p?.valor_total || p?.valor_aprovado || p?.valor_pago || 0;
}

function getTituloPurchase(p) {
  return p?.descricao_item || p?.descricao_servico || p?.nf_numero || 'Solicitação sem descrição';
}

function getFornecedorPurchase(p) {
  return (
    p?.fornecedor_nome ||
    p?.nf_emitente_nome ||
    p?.fornecedor_cnpj ||
    p?.nf_emitente_cpf_cnpj ||
    'Fornecedor não informado'
  );
}

function hasRubrica(p) {
  return !!p?.rubrica_id;
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
  const [comentarios, setComentarios] = useState({});

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

  const pendentes = (purchases || []).filter(
    (p) => normalizeStatus(p?.status) === 'SOLICITADO'
  );

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

  async function localizarDocumentIntake(purchase) {
    if (purchase?.documento_intake_id) {
      try {
        return await base44.entities.DocumentIntake.get(purchase.documento_intake_id);
      } catch {}
    }

    try {
      const list = await base44.entities.DocumentIntake.filter({
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: purchase.id,
      });

      return list?.[0] || null;
    } catch {
      return null;
    }
  }

  async function atualizarDocumentIntake(purchase, payload) {
    try {
      const intake = await localizarDocumentIntake(purchase);

      if (intake?.id) {
        await base44.entities.DocumentIntake.update(intake.id, payload);
      }
    } catch (e) {
      console.warn('Não foi possível atualizar DocumentIntake:', e);
    }
  }

  async function handleAprovar(purchase) {
    if (!podeAprovar) {
      toast.error('Sem permissão', { duration: 3000 });
      return;
    }

    if (loading[purchase.id]) return;

    const tp = teamPayments[purchase.id];
    const duvidas = parseJSON(tp?.conformidade_duvidas, []);
    const temDuvidas = duvidas.length > 0;

    if (!hasRubrica(purchase)) {
      toast.error('Vincule uma rubrica antes de aprovar.', { duration: 3000 });
      return;
    }

    if (temDuvidas && !cientesDuvidas[purchase.id]) {
      toast.warning('Confirme ciência das dúvidas da IA.', { duration: 3000 });
      return;
    }

    setLoading((l) => ({ ...l, [purchase.id]: true }));

    try {
      const response = await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: 'aprovar',
        comentario: comentarios[purchase.id] || null,
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao aprovar solicitação.');
      }

      await atualizarDocumentIntake(purchase, {
        status_processamento: 'APROVADO',
        team_payment_id: result?.team_payment_id || result?.teamPaymentId || null,
      });

      toast.success('Aprovado com sucesso', { duration: 3000 });

      await onRefresh?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao aprovar', { duration: 4000 });
    } finally {
      setLoading((l) => ({ ...l, [purchase.id]: false }));
    }
  }

  async function handleDevolver(purchase) {
    if (!podeAprovar) {
      toast.error('Sem permissão', { duration: 3000 });
      return;
    }

    if (loading[purchase.id]) return;

    setLoading((l) => ({ ...l, [purchase.id]: true }));

    try {
      const response = await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: 'rejeitar',
        comentario: comentarios[purchase.id] || 'Devolvido pela coordenação.',
      });

      const result = response?.data || response;

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao devolver solicitação.');
      }

      await atualizarDocumentIntake(purchase, {
        status_processamento: 'DEVOLVIDO',
        comentario_devolucao: comentarios[purchase.id] || 'Devolvido pela coordenação.',
      });

      toast.success('Solicitação devolvida', { duration: 3000 });

      await onRefresh?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao devolver', { duration: 4000 });
    } finally {
      setLoading((l) => ({ ...l, [purchase.id]: false }));
    }
  }

  async function handleExcluir(purchase) {
    if (!podeAprovar) {
      toast.error('Sem permissão', { duration: 3000 });
      return;
    }

    if (loading[purchase.id]) return;

    setLoading((l) => ({ ...l, [purchase.id]: true }));

    try {
      await atualizarDocumentIntake(purchase, {
        status_processamento: 'EXCLUIDO_APROVACAO',
        comentario_exclusao: comentarios[purchase.id] || 'Solicitação excluída pela coordenação.',
      });

      await base44.entities.PurchaseRequest.delete(purchase.id);

      toast.success('Solicitação excluída', { duration: 3000 });

      await onRefresh?.();
    } catch (e) {
      toast.error(e?.message || 'Erro ao excluir', { duration: 4000 });
    } finally {
      setLoading((l) => ({ ...l, [purchase.id]: false }));
    }
  }

  if (pendentes.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-gray-400">
        Nenhuma solicitação pendente de aprovação
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendentes.map((p) => {
        const tp = teamPayments[p.id];
        const duvidas = parseJSON(tp?.conformidade_duvidas, []);
        const temDuvidas = duvidas.length > 0;
        const isLoading = !!loading[p.id];

        return (
          <div key={p.id} className="space-y-4 rounded-xl border bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {getTituloPurchase(p)}
                </p>

                <p className="text-xs text-gray-500">
                  {getFornecedorPurchase(p)}
                </p>

                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                  {p?.nf_numero && (
                    <span className="rounded-full bg-gray-100 px-2 py-1">
                      NF {p.nf_numero}
                    </span>
                  )}

                  {p?.centro_custo && (
                    <span className="rounded-full bg-gray-100 px-2 py-1">
                      {p.centro_custo}
                    </span>
                  )}

                  {p?.rubrica_nome && (
                    <span className="rounded-full bg-gray-100 px-2 py-1">
                      {p.rubrica_nome}
                    </span>
                  )}

                  {p?.meta_nome && (
                    <span className="rounded-full bg-gray-100 px-2 py-1">
                      {p.meta_nome}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm font-bold text-gray-900">
                {formatBRL(getValorPurchase(p))}
              </p>
            </div>

            {tp && (
              <div className="space-y-2">
                {tp.conformidade_percentual ? (
                  <ConformidadeBadge tp={tp} />
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      setAnalisando((a) => ({ ...a, [p.id]: true }));

                      try {
                        await base44.functions.invoke('analisarConformidadeNF', {
                          team_payment_id: tp.id,
                          purchase_id: p.id,
                        });

                        toast.success('Análise concluída', { duration: 3000 });

                        await onRefresh?.();
                      } catch {
                        toast.error('Erro na análise', { duration: 3000 });
                      } finally {
                        setAnalisando((a) => ({ ...a, [p.id]: false }));
                      }
                    }}
                    disabled={analisando[p.id]}
                    className="flex items-center gap-2 text-xs text-purple-600"
                  >
                    {analisando[p.id] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Brain className="h-3 w-3" />
                    )}
                    Analisar NF
                  </button>
                )}

                {temDuvidas && (
                  <label className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!cientesDuvidas[p.id]}
                      onChange={(e) =>
                        setCientesDuvidas((c) => ({
                          ...c,
                          [p.id]: e.target.checked,
                        }))
                      }
                    />
                    Estou ciente das dúvidas da IA
                  </label>
                )}
              </div>
            )}

            {!hasRubrica(p) && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                <AlertTriangle className="h-4 w-4" />
                Sem rubrica vinculada. A aprovação fica bloqueada até vincular rubrica.
              </div>
            )}

            <Textarea
              value={comentarios[p.id] || ''}
              onChange={(e) =>
                setComentarios((c) => ({
                  ...c,
                  [p.id]: e.target.value,
                }))
              }
              placeholder="Comentário da coordenação para aprovação, devolução ou exclusão"
              className="min-h-20"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleAprovar(p)}
                disabled={
                  isLoading ||
                  !hasRubrica(p) ||
                  (temDuvidas && !cientesDuvidas[p.id])
                }
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Aprovar
              </Button>

              <Button
                variant="outline"
                onClick={() => handleDevolver(p)}
                disabled={isLoading}
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Devolver
              </Button>

              <Button
                variant="destructive"
                onClick={() => handleExcluir(p)}
                disabled={isLoading}
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Excluir
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
