import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Building2, TrendingUp, Settings, RefreshCw } from 'lucide-react';
import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';
import RubricasMuseuEditor from '@/components/rubricas/RubricasMuseuEditor';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await base44.functions.invoke('recalculateAllRubricas', {});
    } catch (e) {
      console.error('Erro ao recalcular rubricas:', e);
    }
    await queryClient.invalidateQueries({ queryKey: ['rubricas-all'] });
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
             Acompanhamento orçamentário centralizado
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

      <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          {MUSEUS.map(m => (
            <TabsTrigger key={m} value={m} className="font-semibold">{m}</TabsTrigger>
          ))}
        </TabsList>

        {MUSEUS.map(m => (
          <TabsContent key={m} value={m} className="mt-4">
            <RubricasMuseuEditor museu={m} />
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