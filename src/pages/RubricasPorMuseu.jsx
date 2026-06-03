import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, RefreshCw, LayoutGrid, Plus } from 'lucide-react';
import { toast } from 'sonner';
import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';
import RubricasMuseuEditor from '@/components/rubricas/RubricasMuseuEditor';
import CardRubricaEditor from '@/components/rubricas/CardRubricaEditor';
import NovaRubricaDialog from '@/components/rubricas/NovaRubricaDialog';
import NoturnoPampulhaCard from '@/components/compras/NoturnoPampulhaCard';
import { recalculateAllRubricasFromPurchases } from '@/components/compras/AutoRubricasSync';
import { canManageRubricas } from '@/components/auth/permissions';
import { getRubricasOficiais3Aditivo } from '@/lib/rubricasOficiais3Aditivo';

const CENTROS_CUSTO = ['MHAB', 'MIS', 'MUMO', 'Noturno Centro', 'Noturno Pampulha', 'Coordenação', 'Comunicação', 'Educação', 'Produção', 'Administrativo-financeiro', 'Publicações', 'Consultorias', 'Despesas Gerais'];

// Grupos de rubrica que representam pessoal/equipe — excluídos dos TOTAIS dos cards de museu
// (continuam aparecendo no detalhamento das rubricas, mas não somam nos KPIs dos cards)
// Centros afetados: MHAB, MIS, MUMO
const GRUPOS_PESSOAL = new Set([
  'Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação',
  'Contratação da equipe de educadores',
  'Contratação de educadores',
  'Contratação de monitores',
  'Educador',
  'Educadores',
  'Monitor',
  'Monitores',
  'Coordenação',
  'Equipe de coordenação',
  'Equipe principal',
]);

// Centros de custo onde a exclusão de pessoal se aplica (museus "físicos", não Noturno)
const CENTROS_EXCLUIR_PESSOAL = new Set(['MHAB', 'MIS', 'MUMO']);

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}



function KpiCard({ label, value, helper, dark = false }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm min-w-0 ${dark ? 'bg-black border-black text-white shadow-md' : 'bg-white border-gray-200 text-black hover:shadow-md transition-shadow'}`}>
      <p className={`text-[11px] uppercase tracking-wide font-semibold ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-3xl font-bold mt-3 leading-tight truncate ${dark ? 'text-white' : 'text-black'}`}>{value}</p>
      {helper && <p className={`text-xs mt-1 truncate ${dark ? 'text-gray-300' : 'text-gray-500'}`}>{helper}</p>}
    </div>
  );
}

const CENTROS_MUSEU_FISICO = new Set(['MHAB', 'MIS', 'MUMO']);
const CENTROS_NOTURNO = new Set(['Noturno Centro', 'Noturno Pampulha']);

function MuseuCard({ item, active, onClick, fmt, fmtPct }) {
  const progressWidth = `${Math.min(toNumber(item.pct), 100)}%`;
  const isMuseuFisico = CENTROS_MUSEU_FISICO.has(item.museu);
  const isNoturno = CENTROS_NOTURNO.has(item.museu);
  const label = isNoturno ? (item.museu === 'Noturno Pampulha' ? '4º Aditivo' : '3º Aditivo') : 'Museu';
  return (
    <Card className={`cursor-pointer transition-all rounded-2xl shadow-sm ${active ? 'border-black bg-black text-white shadow-md' : 'border-gray-200 bg-white hover:border-black hover:shadow-md'}`} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-gray-300' : 'text-gray-500'}`}>{label}</p>
            <h2 className={`text-2xl font-bold leading-tight mt-1 ${active ? 'text-white' : 'text-black'}`}>{item.museu}</h2>
            {isMuseuFisico && <p className={`text-[10px] mt-1 ${active ? 'text-gray-400' : 'text-gray-400'}`}>Excl. pessoal/equipe</p>}
          </div>
          <div className="text-right">
            <p className={`text-[11px] uppercase tracking-wide font-semibold ${active ? 'text-gray-300' : 'text-gray-500'}`}>Execução</p>
            <p className={`text-2xl font-bold mt-1 ${active ? 'text-white' : 'text-black'}`}>{fmtPct(item.pct)}</p>
          </div>
        </div>
        <div className={`w-full h-1 rounded-full overflow-hidden mb-4 ${active ? 'bg-white/20' : 'bg-gray-100'}`}>
          <div className={`h-1 rounded-full transition-all ${active ? 'bg-white' : 'bg-black'}`} style={{ width: progressWidth }} />
        </div>
        <div className="space-y-3 text-xs">
          <div className={`flex justify-between ${active ? 'text-gray-300' : 'text-gray-500'}`}><span>Previsto</span><span className={`font-semibold ${active ? 'text-white' : 'text-black'}`}>{fmt(item.totalOrcado)}</span></div>
          <div className={`flex justify-between ${active ? 'text-gray-300' : 'text-gray-500'}`}><span>Pago</span><span className={`font-semibold ${active ? 'text-white' : 'text-black'}`}>{fmt(item.totalPago)}</span></div>
          <div className={`flex justify-between ${active ? 'text-gray-300' : 'text-gray-500'}`}><span>Utilizado</span><span className={`font-semibold ${active ? 'text-white' : 'text-black'}`}>{fmt(item.totalUtilizado)}</span></div>
          <div className={`flex justify-between border-t pt-3 mt-3 ${active ? 'border-white/20 text-gray-300' : 'border-gray-100 text-gray-500'}`}><span className="font-semibold">Saldo</span><span className={`font-bold ${active ? 'text-white' : item.totalSaldo < 0 ? 'text-red-600' : 'text-black'}`}>{fmt(item.totalSaldo)}</span></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RubricasPorMuseu() {
  const [museuAtivo, setMuseuAtivo] = useState(CENTROS_CUSTO[0]);
  const [showGerenciar, setShowGerenciar] = useState(false);
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [showNovaRubrica, setShowNovaRubrica] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(async (user) => {
      setCurrentUser(user);
      if (user?.email) {
        const perms = await base44.entities.UserPermission.filter({ user_email: user.email.toLowerCase() });
        setUserPermission(perms?.[0] || null);
      }
    }).catch(() => {});
  }, []);

  const userRole = String(userPermission?.base_role || currentUser?.role || '').toUpperCase();
  const isSponsor = userRole === 'PATROCINADOR' || userRole === 'OBSERVADOR';
  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);
  const canEdit = !isSponsor && (isCoordenador || userPermission?.pode_gerenciar_rubricas || userPermission?.gestao_compras || canManageRubricas(currentUser, userPermission));

  // Carrega rubricas do banco para pegar valor_utilizado real
  const { data: rubricasBanco, refetch: refetchRubricas } = useQuery({
    queryKey: ['rubricas-banco', refreshNonce],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 1000),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  // Carrega compras aprovadas para calcular utilizado por rubrica
  const { data: comprasAprovadas, refetch: refetchCompras } = useQuery({
    queryKey: ['compras-aprovadas-resumo', refreshNonce],
    queryFn: () => base44.entities.PurchaseRequest.filter({
      status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] }
    }, '-created_date', 2000),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  /**
   * Agrupa rubricas do banco pelo campo centro_custo.
   * Soma valor_rubrica (previsto) e valor_utilizado para cada centro.
   */
  const resumoPorMuseu = useMemo(() => {
    const banco = Array.isArray(rubricasBanco) ? rubricasBanco.filter(r => r?.ativo !== false) : [];
    const compras = Array.isArray(comprasAprovadas) ? comprasAprovadas : [];

    // Valor utilizado por rubrica_id (compras aprovadas)
    const utilizadoPorRubricaId = {};
    for (const c of compras) {
      const rid = c.rubrica_id;
      if (!rid) continue;
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      utilizadoPorRubricaId[rid] = (utilizadoPorRubricaId[rid] || 0) + val;
    }

    // Agrupamento por centro_custo
    const mapa = {};
    for (const centro of CENTROS_CUSTO) {
      mapa[centro] = { museu: centro, totalOrcado: 0, totalUtilizado: 0, totalSaldo: 0, pct: 0, totalPago: 0 };
    }

    for (const r of banco) {
      const centro = String(r?.centro_custo || '').trim();
      if (!centro || !mapa[centro]) continue;

      // Excluir rubricas de pessoal dos totais dos cards de museus físicos
      const grupo = String(r?.grupo || '').trim();
      if (CENTROS_EXCLUIR_PESSOAL.has(centro) && GRUPOS_PESSOAL.has(grupo)) continue;

      const previsto = toNumber(r.valor_rubrica || r.valor_total);
      const utilCompras = utilizadoPorRubricaId[r.id] || 0;
      const utilRubrica = toNumber(r.valor_utilizado);
      const utilizado = utilCompras > 0 ? utilCompras : utilRubrica;

      mapa[centro].totalOrcado += previsto;
      mapa[centro].totalUtilizado += utilizado;
    }

    return CENTROS_CUSTO
      .map((centro) => {
        const d = mapa[centro];
        const totalOrcado = Number(d.totalOrcado.toFixed(2));
        const totalUtilizado = Number(d.totalUtilizado.toFixed(2));
        const totalSaldo = Number((totalOrcado - totalUtilizado).toFixed(2));
        const pct = totalOrcado > 0 ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(2)) : 0;
        return { ...d, totalOrcado, totalUtilizado, totalSaldo, pct };
      })
      .filter(d => d.totalOrcado > 0 || d.totalUtilizado > 0); // só mostra centros com dados
  }, [rubricasBanco, comprasAprovadas]);

  const fmt = (v) => toNumber(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

  const totaisGerais = useMemo(() => {
    const totalOrcado = resumoPorMuseu.reduce((acc, item) => acc + toNumber(item.totalOrcado), 0);
    const totalUtilizado = resumoPorMuseu.reduce((acc, item) => acc + toNumber(item.totalUtilizado), 0);
    const totalSaldo = Number((totalOrcado - totalUtilizado).toFixed(2));
    return { totalOrcado, totalUtilizado, totalPago: 0, totalLancamentos: 0, totalSaldo };
  }, [resumoPorMuseu]);

  const percentualGeral = totaisGerais.totalOrcado > 0 ? (totaisGerais.totalUtilizado / totaisGerais.totalOrcado) * 100 : 0;

  const refreshAllRubricaData = async () => {
    await Promise.all([
      refetchRubricas(),
      refetchCompras(),
    ]);
    setRefreshNonce((prev) => prev + 1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await recalculateAllRubricasFromPurchases();
      await refreshAllRubricaData();
      toast.success('Dados atualizados com base nas compras aprovadas');
    } catch (e) {
      await refreshAllRubricaData();
      toast.success('Tela atualizada');
    }
    setIsRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-2"><TrendingUp className="w-6 h-6 text-black" />Orçamento por Museu e Noturno</h1>
            <p className="text-gray-500 mt-1 text-sm">Acompanhamento orçamentário consolidado por museu — 3º e 4º Aditivo.</p>
          </div>
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl" onClick={() => setShowNovaRubrica(true)}><Plus className="w-4 h-4" />Nova Rubrica</Button>
              <Button variant="outline" className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl" onClick={handleRefresh} disabled={isRefreshing}><RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />Recalcular</Button>
              {isCoordenador && <Button variant="outline" className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl" onClick={() => setShowCardEditor(true)}><LayoutGrid className="w-4 h-4" />Editor de Cards</Button>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Execução geral" value={fmtPct(percentualGeral)} helper="utilizado sobre previsto" dark />
          <KpiCard label="Previsto" value={fmt(totaisGerais.totalOrcado)} helper="soma real dos museus" />
          <KpiCard label="Utilizado" value={fmt(totaisGerais.totalUtilizado)} helper="rubricas específicas por museu" />
          <KpiCard label="Saldo" value={fmt(totaisGerais.totalSaldo)} helper="saldo disponível" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {resumoPorMuseu.map((item) => <MuseuCard key={item.museu} item={item} active={museuAtivo === item.museu} onClick={() => setMuseuAtivo(item.museu)} fmt={fmt} fmtPct={fmtPct} />)}
        </div>

        {resumoPorMuseu.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-semibold text-black">Detalhamento — {museuAtivo}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Rubricas vinculadas ao centro de custo selecionado.</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {resumoPorMuseu.map((item) => (
                  <button
                    key={item.museu}
                    onClick={() => setMuseuAtivo(item.museu)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${museuAtivo === item.museu ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {item.museu}
                  </button>
                ))}
              </div>
            </div>

            <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
              {resumoPorMuseu.map((item) => (
                <TabsContent key={`${item.museu}-${refreshNonce}`} value={item.museu} className="m-0 p-4 bg-white">
                  <RubricasMuseuEditor
                    key={`${item.museu}-${refreshNonce}`}
                    museu={item.museu}
                    canEdit={canEdit}
                    refreshKey={refreshNonce}
                    rubricas={Array.isArray(rubricasBanco) ? rubricasBanco : []}
                    compras={Array.isArray(comprasAprovadas) ? comprasAprovadas : []}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        {/* Card específico do 4º Aditivo — Noturno Pampulha */}
        <NoturnoPampulhaCard />

        <GerenciarRubricasMuseuDialog open={showGerenciar} onClose={() => setShowGerenciar(false)} />
        <CardRubricaEditor open={showCardEditor} onClose={() => setShowCardEditor(false)} />
        <NovaRubricaDialog
          open={showNovaRubrica}
          currentUser={currentUser}
          onClose={async () => {
            setShowNovaRubrica(false);
            await refreshAllRubricaData();
          }}
        />
      </div>
    </div>
  );
}