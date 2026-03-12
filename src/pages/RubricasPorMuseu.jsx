import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Building2, TrendingUp, AlertTriangle, CheckCircle, Settings, RefreshCw } from 'lucide-react';
import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';
import RubricasGrid from '@/components/compras/RubricasGrid';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
}

export default function RubricasPorMuseu() {
   const [museuAtivo, setMuseuAtivo] = useState('MHAB');
   const [showGerenciar, setShowGerenciar] = useState(false);
   const [currentUser, setCurrentUser] = useState(null);
   const [isRefreshing, setIsRefreshing] = useState(false);
   const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const { data: rubricas = [], isLoading: loadingRubricas } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 200),
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: () => base44.entities.RubricaMuseuConfig.list(),
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  // Subscrição em tempo real para Rubricas
  useEffect(() => {
    const unsubscribe = base44.entities.Rubrica.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['rubricas-all'] });
    });
    return unsubscribe;
  }, [queryClient]);

  // Subscrição em tempo real para Configurações
  useEffect(() => {
    const unsubscribe = base44.entities.RubricaMuseuConfig.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['rubrica-museu-configs'] });
    });
    return unsubscribe;
  }, [queryClient]);

  const isLoading = loadingRubricas || loadingConfigs;

  const mapa = useMemo(() => {
    const rubricasAtivas = rubricas.filter(r => r.ativo !== false);
    if (!rubricasAtivas.length) return null;
    return mapearPorConfig(rubricasAtivas, configs);
  }, [rubricas, configs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!mapa) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Recalcular valores das rubricas antes de atualizar
      await base44.functions.invoke('recalculateAllRubricas', {});
    } catch (e) {
      console.error('Erro ao recalcular rubricas:', e);
    }
    await queryClient.invalidateQueries({ queryKey: ['rubricas-all'] });
    await queryClient.invalidateQueries({ queryKey: ['rubrica-museu-configs'] });
    setIsRefreshing(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
       <div className="flex items-center justify-between">
         <div>
           <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
             <TrendingUp className="w-6 h-6 text-gray-600" />
             Rubricas por Museu
           </h1>
           <p className="text-sm text-gray-500 mt-1">
             Acompanhamento orçamentário por museu
             {configs.length > 0 && <span className="ml-2 text-gray-400">· {configs.length} rubrica(s) configurada(s)</span>}
           </p>
         </div>
         <div className="flex gap-2">
           <Button variant="outline" className="gap-2" onClick={handleRefresh} disabled={isRefreshing}>
             <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
             Atualizar
           </Button>
           {isCoordenador && (
             <Button variant="outline" className="gap-2" onClick={() => setShowGerenciar(true)}>
               <Settings className="w-4 h-4" />
               Gerenciar Rubricas
             </Button>
           )}
         </div>
       </div>

      <ResumoGeral mapa={mapa} />

      <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          {MUSEUS.map(m => (
            <TabsTrigger key={m} value={m} className="font-semibold">{m}</TabsTrigger>
          ))}
        </TabsList>

        {MUSEUS.map(m => (
          <TabsContent key={m} value={m} className="mt-4">
            <MuseuPanel museu={m} mapa={mapa} />
          </TabsContent>
        ))}
      </Tabs>

      {showGerenciar && (
        <GerenciarRubricasMuseuDialog
          open={showGerenciar}
          onClose={() => setShowGerenciar(false)}
        />
      )}
    </div>
  );
}