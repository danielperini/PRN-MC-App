import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, Settings, RefreshCw, Link, LayoutGrid } from 'lucide-react';
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

export default function RubricasPorMuseu() {
  const [museuAtivo, setMuseuAtivo] = useState('MHAB');
  const [showGerenciar, setShowGerenciar] = useState(false);
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me()
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
    refetchOnWindowFocus: true,
  });

  const resumoPorMuseu = useMemo(() => {
    return MUSEUS.map((m) => {
      const dados = consolidado?.totais_por_museu?.[m] || {};
      const totalOrcado = toNumber(dados.totalOrcado);
      const totalUtilizado = toNumber(dados.totalUtilizado);
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
        totalSaldo,
        pct
      };
    });
  }, [consolidado]);

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
      await base44.functions.invoke('recalculateAllRubricas', {
        trigger: 'manual_refresh_rubricas_por_museu'
      });

      await refreshAllRubricaData();

      toast.success('Rubricas recalculadas e tela atualizada com sucesso');
    } catch (e) {
      toast.error('Erro ao recalcular rubricas');
      console.error(e);
    }
    setIsRefreshing(false);
  };

  const handleSetupVinculos = async () => {
    setIsSetup(true);
    try {
      const res = await base44.functions.invoke('setupRubricasMuseuConfig', {});
      const data = res?.data || {};

      await refreshAllRubricaData();

      toast.success(`${data.criados?.length || 0} vínculos criados automaticamente`);
    } catch (e) {
      toast.error('Erro ao configurar vínculos: ' + (e?.message || 'erro desconhecido'));
      console.error(e);
    }
    setIsSetup(false);
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
            Acompanhamento orçamentário centralizado
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
            <>
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleSetupVinculos}
                disabled={isSetup}
              >
                <Link className="w-4 h-4" />
                {isSetup ? 'Configurando...' : 'Configurar vínculos'}
              </Button>

              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowCardEditor(true)}
              >
                <LayoutGrid className="w-4 h-4" />
                Editor de Cards
              </Button>

              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowGerenciar(true)}
              >
                <Settings className="w-4 h-4" />
                Gerenciar Rubricas
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {resumoPorMuseu.map(
          ({ museu, totalOrcado, totalUtilizado, totalSaldo, pct }) => (
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

                {isLoading ? (
                  <div className="space-y-1.5">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-3 bg-gray-100 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Previsto</span>
                      <span className="font-medium">{fmt(totalOrcado)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Utilizado</span>
                      <span className="font-medium text-amber-600">
                        {fmt(totalUtilizado)}
                      </span>
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