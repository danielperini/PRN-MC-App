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
  const n = Number(value || 0);
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

  const { data, refetch } = useQuery({
    queryKey: ['rubricas-consolidadas', refreshNonce],
    queryFn: async () => {
      const res = await base44.functions.invoke('getRubricasConsolidadas', {});
      return res?.data || {};
    },
    staleTime: 0
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await base44.functions.invoke('recalculateAllRubricas', {});
      await refetch();
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

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Recalcular
            </Button>

            {isCoordenador && (
              <Button
                variant="outline"
                onClick={() => setShowCardEditor(true)}
                className="gap-2"
              >
                <LayoutGrid className="w-4 h-4" />
                Editor
              </Button>
            )}
          </div>
        </div>

        {/* 👇 NOVO BLOCO MELHORADO */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

          {/* HEADER INTERNO */}
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-black">
                Detalhamento por Museu
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Visualização e edição das rubricas por unidade
              </p>
            </div>

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

          {/* CONTEÚDO */}
          <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
            {MUSEUS.map((m) => (
              <TabsContent
                key={`${m}-${refreshNonce}`}
                value={m}
                className="m-0 p-4 bg-white"
              >
                <RubricasMuseuEditor
                  key={`${m}-${refreshNonce}`}
                  museu={m}
                  canEdit={canEdit}
                  refreshKey={refreshNonce}
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
