import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, RefreshCw, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';
import RubricasMuseuEditor from '@/components/rubricas/RubricasMuseuEditor';
import CardRubricaEditor from '@/components/rubricas/CardRubricaEditor';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMuseu(value) {
  const raw = String(value || '').trim().toUpperCase();

  if (!raw) return '';
  if (raw === 'MIS') return 'MIS';
  if (raw === 'MHAB') return 'MHAB';
  if (raw === 'MUMO') return 'MUMO';

  return raw;
}

function extractResumoMapFromSource(source) {
  const result = {};

  if (!source) return result;

  const totaisPorMuseu = source?.totais_por_museu;
  if (totaisPorMuseu && typeof totaisPorMuseu === 'object' && !Array.isArray(totaisPorMuseu)) {
    Object.entries(totaisPorMuseu).forEach(([key, dados]) => {
      const museu = normalizeMuseu(key);
      if (!MUSEUS.includes(museu)) return;

      result[museu] = {
        museu,
        totalOrcado: toNumber(dados?.totalOrcado),
        totalUtilizado: toNumber(dados?.totalUtilizado),
        totalPago: toNumber(dados?.totalPago),
        totalLancamentos: toNumber(dados?.totalLancamentos),
        totalSaldo: toNumber(dados?.totalSaldo),
        pct:
          dados?.pct !== undefined && dados?.pct !== null
            ? toNumber(dados.pct)
            : null
      };
    });
  }

  const sumarioPorMuseu =
    source?.sumario_por_museu ||
    source?.sumario?.sumario_por_museu ||
    [];

  if (Array.isArray(sumarioPorMuseu)) {
    sumarioPorMuseu.forEach((item) => {
      const museu = normalizeMuseu(item?.museu);
      if (!MUSEUS.includes(museu)) return;

      result[museu] = {
        museu,
        totalOrcado: toNumber(item?.valor_orcado),
        totalUtilizado: toNumber(item?.valor_utilizado),
        totalPago: toNumber(item?.valor_pago),
        totalLancamentos: toNumber(item?.valor_lancamentos),
        totalSaldo: toNumber(item?.saldo),
        pct:
          toNumber(item?.valor_orcado) > 0
            ? Number(
                (
                  (toNumber(item?.valor_utilizado) / toNumber(item?.valor_orcado)) *
                  100
                ).toFixed(2)
              )
            : 0
      };
    });
  }

  return result;
}

export default function RubricasPorMuseu() {
  const [museuAtivo, setMuseuAtivo] = useState('MHAB');
  const [showGerenciar, setShowGerenciar] = useState(false);
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastRecalcResponse, setLastRecalcResponse] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth
      .me()
      .then(async (user) => {
        setCurrentUser(user);
        if (user?.email) {
          const perms = await base44.entities.UserPermission.filter({
            user_email: user.email
          });
          setUserPermission(perms?.[0] || null);
        }
      })
      .catch(() => {});
  }, []);

  const isCoordenador =
    currentUser &&
    ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const canEdit =
    isCoordenador ||
    userPermission?.pode_gerenciar_rubricas ||
    userPermission?.gestao_compras;

  const {
    data: consolidado,
    isLoading,
    refetch: refetchConsolidado
  } = useQuery({
    queryKey: ['rubricas-consolidadas', refreshNonce],
    queryFn: async () => {
      const res = await base44.functions.invoke('getRubricasConsolidadas', {});
      return res?.data || {};
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true
  });

  const resumoPorMuseu = useMemo(() => {
    const baseMap = extractResumoMapFromSource(consolidado);
    const recalcMap = extractResumoMapFromSource(lastRecalcResponse);

    const merged = { ...baseMap, ...recalcMap };

    return MUSEUS.map((m) => {
      const dados = merged[m] || {};
      const totalOrcado = toNumber(dados.totalOrcado);
      const totalUtilizado = toNumber(dados.totalUtilizado);
      const totalPago = toNumber(dados.totalPago);
      const totalLancamentos = toNumber(dados.totalLancamentos);
      const totalSaldo = toNumber(dados.totalSaldo);

      const pct =
        dados.pct !== undefined && dados.pct !== null
          ? toNumber(dados.pct)
          : totalOrcado > 0
            ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(2))
            : 0;

      return {
        museu: m,
        totalOrcado,
        totalUtilizado,
        totalPago,
        totalLancamentos,
        totalSaldo,
        pct
      };
    });
  }, [consolidado, lastRecalcResponse]);

  const fmt = (v) =>
    toNumber(v).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const refreshAllRubricaData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = Array.isArray(query.queryKey)
            ? query.queryKey.join('|').toLowerCase()
            : String(query.queryKey || '').toLowerCase();

          return (
            key.includes('rubrica') ||
            key.includes('budget') ||
            key.includes('compra') ||
            key.includes('purchase') ||
            key.includes('museu')
          );
        }
      }),
      refetchConsolidado()
    ]);

    setRefreshNonce((prev) => prev + 1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await base44.functions.invoke('recalculateAllRubricas', {
        trigger: 'manual_refresh_rubricas_por_museu'
      });

      const data = res?.data || null;
      setLastRecalcResponse(data);

      await refreshAllRubricaData();

      const inconsistencias =
        toNumber(data?.sumario?.compras_pagas_nao_vinculadas) +
        toNumber(data?.sumario?.compras_inconsistentes_museu) +
        toNumber(data?.sumario?.lancamentos_sem_rubrica) +
        toNumber(data?.sumario?.lancamentos_inconsistentes_museu);

      if (inconsistencias > 0) {
        toast.warning(
          `Recalculo concluído com ${inconsistencias} inconsistência(s) detectada(s)`
        );
      } else {
        toast.success('Rubricas recalculadas e tela atualizada com sucesso');
      }
    } catch (e) {
      toast.error('Erro ao recalcular rubricas');
      console.error(e);
    }
    setIsRefreshing(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-gray-600" />
            Rubricas por Museu
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Acompanhamento orçamentário por museu
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>

          {isCoordenador && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowCardEditor(true)}
            >
              <LayoutGrid className="w-4 h-4" />
              Editor de Cards
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {resumoPorMuseu.map(
          ({
            museu,
            totalOrcado,
            totalUtilizado,
            totalPago,
            totalLancamentos,
            totalSaldo,
            pct
          }) => (
            <Card
              key={museu}
              className={`cursor-pointer transition-all border-2 ${
                museuAtivo === museu
                  ? 'border-gray-800 shadow-md'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              onClick={() => setMuseuAtivo(museu)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base text-gray-900">{museu}</span>
                  <span
                    className={`text-sm font-bold ${
                      pct >= 80 ? 'text-red-600' : 'text-gray-500'
                    }`}
                  >
                    {pct}%
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      pct >= 100
                        ? 'bg-red-500'
                        : pct >= 80
                          ? 'bg-orange-400'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>

                {isLoading && !lastRecalcResponse ? (
                  <div className="space-y-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Previsto</span>
                      <span className="font-medium">{fmt(totalOrcado)}</span>
                    </div>

                    <div className="flex justify-between text-gray-600">
                      <span>✅ Pago</span>
                      <span className="font-medium text-green-700">
                        {fmt(totalPago)}
                      </span>
                    </div>

                    {totalLancamentos > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>🧾 Lançamentos</span>
                        <span className="font-medium text-blue-700">
                          {fmt(totalLancamentos)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-gray-600">
                      <span>Utilizado</span>
                      <span className="font-medium">{fmt(totalUtilizado)}</span>
                    </div>

                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-semibold text-gray-700">Saldo</span>
                      <span
                        className={`font-bold ${
                          totalSaldo < 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {fmt(totalSaldo)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        )}
      </div>

      <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          {MUSEUS.map((m) => (
            <TabsTrigger key={m} value={m} className="font-semibold">
              {m}
            </TabsTrigger>
          ))}
        </TabsList>

        {MUSEUS.map((m) => (
          <TabsContent key={`${m}-${refreshNonce}`} value={m} className="mt-4">
            <RubricasMuseuEditor
              key={`${m}-${refreshNonce}`}
              museu={m}
              canEdit={canEdit}
              refreshKey={refreshNonce}
            />
          </TabsContent>
        ))}
      </Tabs>

      <GerenciarRubricasMuseuDialog
        open={showGerenciar}
        onClose={() => setShowGerenciar(false)}
      />

      <CardRubricaEditor
        open={showCardEditor}
        onClose={() => setShowCardEditor(false)}
      />
    </div>
  );
}
