import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, Settings, RefreshCw } from 'lucide-react';
import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';
import RubricasMuseuEditor from '@/components/rubricas/RubricasMuseuEditor';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

export default function RubricasPorMuseu() {
  const [museuAtivo, setMuseuAtivo] = useState('MHAB');
  const [showGerenciar, setShowGerenciar] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (user) => {
      setCurrentUser(user);
      if (user?.email) {
        const perms = await base44.entities.UserPermission.filter({ user_email: user.email });
        setUserPermission(perms?.[0] || null);
      }
    }).catch(() => {});
  }, []);

  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);
  const canEdit = isCoordenador || userPermission?.pode_gerenciar_rubricas || userPermission?.gestao_compras;
  const canView = canEdit || userPermission?.pode_ver_saude_orcamentaria;

  // Resumo por museu para os tabs
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 300),
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: () => base44.entities.RubricaMuseuConfig.list(),
  });

  const resumoPorMuseu = React.useMemo(() => {
    return MUSEUS.map(m => {
      const configsMuseu = configs.filter(c => c.museu === m);
      const rubricaIds = new Set(configsMuseu.map(c => c.rubrica_id));
      const rubs = rubricas.filter(r => rubricaIds.has(r.id) && r.ativo !== false);
      const totalOrcado = rubs.reduce((s, r) => {
        const config = configsMuseu.find(c => c.rubrica_id === r.id);
        return s + (r.valor_rubrica || 0) / (config?.divisor || 1);
      }, 0);
      const totalUtilizado = rubs.reduce((s, r) => {
        const config = configsMuseu.find(c => c.rubrica_id === r.id);
        return s + (r.valor_utilizado || 0) / (config?.divisor || 1);
      }, 0);
      const saldo = totalOrcado - totalUtilizado;
      const pct = totalOrcado > 0 ? (totalUtilizado / totalOrcado) * 100 : 0;
      return { museu: m, totalOrcado, totalUtilizado, saldo, pct: parseFloat(pct.toFixed(1)) };
    });
  }, [rubricas, configs]);

  const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await base44.functions.invoke('recalculateAllRubricas', {});
    } catch (e) {
      console.error('Erro ao recalcular:', e);
    }
    await queryClient.invalidateQueries();
    setIsRefreshing(false);
  };

  if (!canView && currentUser) {
    return (
      <div className="max-w-3xl mx-auto mt-20 text-center">
        <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Acesso Restrito</h2>
        <p className="text-gray-500 text-sm">Você não tem permissão para visualizar as rubricas orçamentárias.</p>
        <p className="text-gray-400 text-xs mt-2">Solicite ao coordenador a permissão "Saúde Orçamentária" ou "Gerenciar Rubricas".</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-gray-600" />
            Rubricas por Museu
          </h1>
          <p className="text-sm text-gray-500 mt-1">Acompanhamento orçamentário centralizado</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>
          {isCoordenador && (
            <Button variant="outline" className="gap-2" onClick={() => setShowGerenciar(true)}>
              <Settings className="w-4 h-4" />
              Gerenciar Rubricas
            </Button>
          )}
        </div>
      </div>

      {/* Cards resumo por museu */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {resumoPorMuseu.map(({ museu, totalOrcado, totalUtilizado, saldo, pct }) => (
          <Card
            key={museu}
            className={`cursor-pointer transition-all border-2 ${museuAtivo === museu ? 'border-gray-800' : 'border-gray-200 hover:border-gray-400'}`}
            onClick={() => setMuseuAtivo(museu)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-base text-gray-900">{museu}</span>
                <span className={`text-sm font-bold ${pct >= 80 ? 'text-red-600' : 'text-gray-500'}`}>{pct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                <div
                  className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-400' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Orçado</span>
                  <span className="font-medium">{fmt(totalOrcado)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Utilizado</span>
                  <span className="font-medium text-amber-600">{fmt(totalUtilizado)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="font-semibold text-gray-700">Saldo</span>
                  <span className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(saldo)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs detalhadas */}
      <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          {MUSEUS.map(m => (
            <TabsTrigger key={m} value={m} className="font-semibold">{m}</TabsTrigger>
          ))}
        </TabsList>

        {MUSEUS.map(m => (
          <TabsContent key={m} value={m} className="mt-4">
            <RubricasMuseuEditor museu={m} canEdit={canEdit} />
          </TabsContent>
        ))}
      </Tabs>

      <GerenciarRubricasMuseuDialog
        open={showGerenciar}
        onClose={() => setShowGerenciar(false)}
      />
    </div>
  );
}