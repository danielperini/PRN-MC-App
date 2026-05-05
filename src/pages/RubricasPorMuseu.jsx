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

// 🔥 NOVO — FILTRO IA DE RUBRICAS
function isRubricaValida(nome = '') {
  const n = String(nome).toLowerCase();

  // ❌ remover equipe / gestão
  if (
    n.includes('coordenador') ||
    n.includes('coordenação') ||
    n.includes('assistente') ||
    n.includes('analista') ||
    n.includes('gestão') ||
    n.includes('consultoria') ||
    n.includes('administrativo')
  ) return false;

  return true;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function RubricasPorMuseu() {

  const [museuAtivo, setMuseuAtivo] = useState('MHAB');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (user) => {
      setCurrentUser(user);
      if (user?.email) {
        const perms = await base44.entities.UserPermission.filter({
          user_email: user.email
        });
        setUserPermission(perms?.[0] || null);
      }
    });
  }, []);

  const isCoordenador =
    currentUser &&
    ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const canEdit =
    isCoordenador ||
    userPermission?.pode_gerenciar_rubricas ||
    userPermission?.gestao_compras;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await base44.functions.invoke('recalculateAllRubricas', {});
      setRefreshNonce((p) => p + 1);
      toast.success('Rubricas atualizadas');
    } catch {
      toast.error('Erro ao atualizar');
    }
    setIsRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* HEADER */}
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Rubricas por Museu
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Gestão orçamentária por centro de custo
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* TABS */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

          <div className="px-4 py-4 border-b border-gray-100 flex justify-between">
            <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
              <TabsList className="grid grid-cols-3 bg-gray-100 rounded-xl p-1 w-[260px]">
                {MUSEUS.map((m) => (
                  <TabsTrigger
                    key={m}
                    value={m}
                    className="text-xs font-semibold rounded-lg data-[state=active]:bg-black data-[state=active]:text-white"
                  >
                    {m}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
            {MUSEUS.map((m) => (
              <TabsContent key={m} value={m} className="p-4">

                <RubricasMuseuEditor
                  museu={m}
                  canEdit={canEdit}
                  refreshKey={refreshNonce}
                  // 🔥 AQUI A IA ATUA
                  rubricaFilter={isRubricaValida}
                />

              </TabsContent>
            ))}
          </Tabs>
        </div>

        <GerenciarRubricasMuseuDialog />
        <CardRubricaEditor />

      </div>
    </div>
  );
}
