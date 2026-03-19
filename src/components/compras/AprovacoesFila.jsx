import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function AprovacoesFila({
  purchases,
  budgetLines,
  statusConfig,
  onRefresh,
  currentUser,
  hasGestaoCompras,
  podeAprovarSolicitacoes
}) {
  const [loading, setLoading] = useState({});
  const [comentarios, setComentarios] = useState({});
  const [saldos, setSaldos] = useState({});

  const isCoordenador = [
    'admin',
    'ADMIN',
    'COORDENADOR',
    'COORD_COMUNICACAO',
    'COORD_ADMINISTRATIVA',
    'COORD_PRODUCAO'
  ].includes(currentUser?.role);

  const podeAprovar =
    isCoordenador ||
    hasGestaoCompras === true ||
    podeAprovarSolicitacoes === true;

  const pendentes_coord = purchases.filter(p => p.status === 'SOLICITADO');

  const getBudgetLine = (id) => budgetLines.find(l => l.id === id);

  const getSaldo = async (purchase) => {
    if (saldos[purchase.budgetline_id]) return saldos[purchase.budgetline_id];

    const res = await base44.functions.invoke('purchaseActions', {
      action: 'check_budget',
      budgetline_id: purchase.budgetline_id,
      valor: purchase.valor_solicitado,
    });

    const info = res?.data || res;
    setSaldos(s => ({ ...s, [purchase.budgetline_id]: info }));
    return info;
  };

  const handleAction = async (purchase, action) => {
    if ((action === 'approve_coord' || action === 'reject') && !podeAprovar) {
      toast.error('Você não tem permissão para processar solicitações.');
      return;
    }

    setLoading(l => ({ ...l, [purchase.id]: true }));

    try {
      const comentario = comentarios[purchase.id] || '';

      if (action === 'approve_coord') {
        const saldoInfo = await getSaldo(purchase);

        if (!saldoInfo?.aprovavel) {
          toast.error(
            `Saldo insuficiente! Disponível: R$ ${(saldoInfo?.saldo_disponivel || 0).toLocaleString('pt-BR', {
              minimumFractionDigits: 2
            })}`
          );
          setLoading(l => ({ ...l, [purchase.id]: false }));
          return;
        }
      }

      await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: action === 'approve_coord' ? 'aprovar' : 'reject',
        comentario,
      });

      if (action === 'approve_coord') {
        toast.success('✅ Solicitação aprovada com sucesso e saldo comprometido!', {
          duration: 4000,
          icon: '✅',
        });
      } else {
        toast.success('❌ Solicitação recusada.', {
          duration: 3000,
        });
      }

      onRefresh?.();
    } catch (e) {
      toast.error('❌ Erro ao processar: ' + (e?.message || 'Erro desconhecido'));
    }

    setLoading(l => ({ ...l, [purchase.id]: false }));
  };

  const META_LABELS = {
    'MC3A-20': 'Ações Educativas',
    'MC3A-21': 'Exposição / Produção Cultural',
    'MC3A-22': 'Comunicação e Divulgação',
    'MC3A-23': 'Noturno nos Museus 2026',
    'MC3A-24': 'Emenda Parlamentar',
    'MC3A-25': 'Outras Ações',
    'MC3A-EXTRA': 'Ações Extras',
  };

  const renderCard = (purchase) => {
    const line = getBudgetLine(purchase.budgetline_id);
    const saldoDisponivel = line
      ? (line.saldo_inicial || 0) - (line.saldo_comprometido || 0)
      : null;

    const saldoOk =
      saldoDisponivel === null || saldoDisponivel >= (purchase.valor_solicitado || 0);

    const isLoading = loading[purchase.id];

    return (
      <div
        key={purchase.id}
        className="border border-gray-100 rounded-xl p-5 space-y-4 hover:border-gray-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {META_LABELS[purchase.meta_id] || purchase.meta_id}
              </span>

              {purchase.tipo_gasto && (
                <span className="text-xs border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                  {purchase.tipo_gasto}
                </span>
              )}

              {purchase.ai_meta_score !== undefined &&
                purchase.ai_meta_score !== null && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      purchase.ai_meta_score >= 80
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    Score IA: {purchase.ai_meta_score}%
                  </span>
                )}
            </div>

            <p className="font-semibold text-black">{purchase.descricao_item}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {purchase.fornecedor_nome}
              {purchase.fornecedor_cnpj ? ` — ${purchase.fornecedor_cnpj}` : ''}
            </p>
          </div>

          <div className="text-right flex-shrink-0">
            <p className="text-xl font-bold text-black">
              R$ {(purchase.valor_solicitado || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 2
              })}
            </p>
            <p className="text-xs text-gray-500">{purchase.categoria}</p>
          </div>
        </div>

        {purchase.ai_meta_score < 80 && purchase.ai_analise && (
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs">
            <p className="font-semibold text-amber-800 flex items-center gap-1 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Atenção — Score IA baixo ({purchase.ai_meta_score}%)
            </p>
            <p className="text-amber-700">{purchase.ai_analise}</p>
            {purchase.ai_meta_sugerida &&
              purchase.ai_meta_sugerida !== purchase.meta_id && (
                <p className="mt-1 font-medium text-amber-800">
                  Meta sugerida: {purchase.ai_meta_sugerida}
                </p>
              )}
          </div>
        )}

        {line && (
          <div
            className={`p-3 rounded-lg text-xs ${
              saldoOk
                ? 'bg-green-50 border border-green-100'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <p className="font-semibold mb-1">
              [{line.codigo}] {line.descricao}
            </p>

            <div className="flex gap-4 flex-wrap">
              <span>
                Saldo inicial:{' '}
                <strong>
                  R$ {(line.saldo_inicial || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2
                  })}
                </strong>
              </span>

              <span>
                Comprometido:{' '}
                <strong>
                  R$ {(line.saldo_comprometido || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2
                  })}
                </strong>
              </span>

              <span className={saldoOk ? 'text-green-700' : 'text-red-700'}>
                Disponível:{' '}
                <strong>
                  R$ {(saldoDisponivel || 0).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2
                  })}
                </strong>
              </span>
            </div>

            {!saldoOk && (
              <p className="text-red-700 font-semibold mt-1">
                ⚠️ Saldo insuficiente para aprovação!
              </p>
            )}
          </div>
        )}

        <Textarea
          placeholder="Comentário (opcional)..."
          rows={2}
          value={comentarios[purchase.id] || ''}
          onChange={e =>
            setComentarios(c => ({ ...c, [purchase.id]: e.target.value }))
          }
        />

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => handleAction(purchase, 'reject')}
            disabled={isLoading || !podeAprovar}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <XCircle className="w-4 h-4 mr-1" />
            )}
            Recusar
          </Button>

          <Button
            className="bg-black hover:bg-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleAction(purchase, 'approve_coord')}
            disabled={isLoading || !saldoOk || !podeAprovar}
            title={!podeAprovar ? 'Você não tem permissão para aprovar' : ''}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-1" />
            )}
            Aprovar e Comprometer
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
            {pendentes_coord.length}
          </span>
          Aguardando Aprovação da Coordenação
        </h2>

        {pendentes_coord.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
            Nenhuma solicitação pendente
          </p>
        ) : (
          <div className="space-y-4">{pendentes_coord.map(p => renderCard(p))}</div>
        )}
      </section>
    </div>
  );
}