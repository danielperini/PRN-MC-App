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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isRubricaValida(rubrica = {}) {
  const texto = normalizeText([
    rubrica?.rubrica,
    rubrica?.nome,
    rubrica?.descricao,
    rubrica?.grupo,
    rubrica?.categoria,
    rubrica?.centro_custo,
    rubrica?.meta_id,
  ].filter(Boolean).join(' '));

  if (
    texto.includes('coordenador') ||
    texto.includes('coordenacao') ||
    texto.includes('coord ') ||
    texto.includes('coord.') ||
    texto.includes('assistente') ||
    texto.includes('analista') ||
    texto.includes('equipe') ||
    texto.includes('gestao') ||
    texto.includes('administrativo') ||
    texto.includes('adm ') ||
    texto.includes('adm.') ||
    texto.includes('consultoria') ||
    texto.includes('consultorias') ||
    texto.includes('juridico') ||
    texto.includes('contador') ||
    texto.includes('contabilidade') ||
    texto.includes('energia eletrica') ||
    texto.includes('material escritorio')
  ) {
    return false;
  }

  return (
    texto.includes('mis') ||
    texto.includes('mhab') ||
    texto.includes('mumo') ||
    texto.includes('3 museus') ||
    texto.includes('museus pbh') ||
    texto.includes('producao') ||
    texto.includes('programacao') ||
    texto.includes('oficina') ||
    texto.includes('educativ') ||
    texto.includes('educador') ||
    texto.includes('mediacao') ||
    texto.includes('monitor') ||
    texto.includes('recepcao') ||
    texto.includes('mostra') ||
    texto.includes('exposicao') ||
    texto.includes('apresentac') ||
    texto.includes('cache') ||
    texto.includes('cultural') ||
    texto.includes('montagem') ||
    texto.includes('desmontagem') ||
    texto.includes('locacao') ||
    texto.includes('equipamento') ||
    texto.includes('som') ||
    texto.includes('iluminacao') ||
    texto.includes('infraestrutura') ||
    texto.includes('cenografia') ||
    texto.includes('expografia') ||
    texto.includes('material') ||
    texto.includes('impressao') ||
    texto.includes('sinalizacao') ||
    texto.includes('lanche') ||
    texto.includes('buffet') ||
    texto.includes('alimentacao') ||
    texto.includes('transporte') ||
    texto.includes('vans') ||
    texto.includes('comunicacao') ||
    texto.includes('imprensa') ||
    texto.includes('rede social') ||
    texto.includes('redes sociais') ||
    texto.includes('marketing') ||
    texto.includes('designer') ||
    texto.includes('fotografo') ||
    texto.includes('video') ||
    texto.includes('grafico') ||
    texto.includes('graficos') ||
    texto.includes('servicos graficos') ||
    texto.includes('seguranca') ||
    texto.includes('limpeza')
  );
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
        pct: dados?.pct !== undefined && dados?.pct !== null ? toNumber(dados.pct) : null
      };
    });
  }

  const sumarioPorMuseu = source?.sumario_por_museu || source?.sumario?.sumario_por_museu || [];

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
        pct: toNumber(item?.valor_orcado) > 0
          ? Number(((toNumber(item?.valor_utilizado) / toNumber(item?.valor_orcado)) * 100).toFixed(2))
          : 0
      };
    });
  }

  return result;
}

function KpiCard({ label, value, helper, dark = false }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm min-w-0 ${
        dark
          ? 'bg-black border-black text-white shadow-md'
          : 'bg-white border-gray-200 text-black hover:shadow-md transition-shadow'
      }`}
    >
      <p className={`text-[11px] uppercase tracking-wide font-semibold ${dark ? 'text-gray-300' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className={`text-3xl font-bold mt-3 leading-tight truncate ${dark ? 'text-white' : 'text-black'}`}>
        {value}
      </p>
      {helper && (
        <p className={`text-xs mt-1 truncate ${dark ? 'text-gray-300' : 'text-gray-500'}`}>
          {helper}
        </p>
      )}
    </div>
  );
}

function MuseuCard({ item, active, onClick, fmt, fmtPct }) {
  const progressWidth = `${Math.min(toNumber(item.pct), 100)}%`;

  return (
    <Card
      className={`cursor-pointer transition-all rounded-2xl shadow-sm ${
        active
          ? 'border-black bg-black text-white shadow-md'
          : 'border-gray-200 bg-white hover:border-black hover:shadow-md'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-gray-300' : 'text-gray-500'}`}>
              Museu
            </p>
            <h2 className={`text-3xl font-bold leading-tight mt-1 ${active ? 'text-white' : 'text-black'}`}>
              {item.museu}
            </h2>
          </div>

          <div className="text-right">
            <p className={`text-[11px] uppercase tracking-wide font-semibold ${active ? 'text-gray-300' : 'text-gray-500'}`}>
              Execução
            </p>
            <p className={`text-2xl font-bold mt-1 ${active ? 'text-white' : 'text-black'}`}>
              {fmtPct(item.pct)}
            </p>
          </div>
        </div>

        <div className={`w-full h-1 rounded-full overflow-hidden mb-4 ${active ? 'bg-white/20' : 'bg-gray-100'}`}>
          <div
            className={`h-1 rounded-full transition-all ${active ? 'bg-white' : 'bg-black'}`}
            style={{ width: progressWidth }}
          />
        </div>

        <div className="space-y-3 text-xs">
          <div className={`flex justify-between ${active ? 'text-gray-300' : 'text-gray-500'}`}>
            <span>Previsto</span>
            <span className={`font-semibold ${active ? 'text-white' : 'text-black'}`}>{fmt(item.totalOrcado)}</span>
          </div>

          <div className={`flex justify-between ${active ? 'text-gray-300' : 'text-gray-500'}`}>
            <span>Pago</span>
            <span className={`font-semibold ${active ? 'text-white' : 'text-black'}`}>{fmt(item.totalPago)}</span>
          </div>

          <div className={`flex justify-between ${active ? 'text-gray-300' : 'text-gray-500'}`}>
            <span>Utilizado</span>
            <span className={`font-semibold ${active ? 'text-white' : 'text-black'}`}>{fmt(item.totalUtilizado)}</span>
          </div>

          <div className={`flex justify-between border-t pt-3 mt-3 ${active ? 'border-white/20 text-gray-300' : 'border-gray-100 text-gray-500'}`}>
            <span className="font-semibold">Saldo</span>
            <span className={`font-bold ${active ? 'text-white' : item.totalSaldo < 0 ? 'text-red-600' : 'text-black'}`}>
              {fmt(item.totalSaldo)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
          const perms = await base44.entities.UserPermission.filter({ user_email: user.email });
          setUserPermission(perms?.[0] || null);
        }
      })
      .catch(() => {});
  }, []);

  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const canEdit =
    isCoordenador ||
    userPermission?.pode_gerenciar_rubricas ||
    userPermission?.gestao_compras;

  const { data: consolidado, refetch: refetchConsolidado } = useQuery({
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

      return { museu: m, totalOrcado, totalUtilizado, totalPago, totalLancamentos, totalSaldo, pct };
    });
  }, [consolidado, lastRecalcResponse]);

  const fmt = (v) =>
    toNumber(v).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    });

  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

  const totaisGerais = useMemo(() => {
    return resumoPorMuseu.reduce(
      (acc, item) => {
        acc.totalOrcado += toNumber(item.totalOrcado);
        acc.totalUtilizado += toNumber(item.totalUtilizado);
        acc.totalPago += toNumber(item.totalPago);
        acc.totalLancamentos += toNumber(item.totalLancamentos);
        acc.totalSaldo += toNumber(item.totalSaldo);
        return acc;
      },
      { totalOrcado: 0, totalUtilizado: 0, totalPago: 0, totalLancamentos: 0, totalSaldo: 0 }
    );
  }, [resumoPorMuseu]);

  const percentualGeral =
    totaisGerais.totalOrcado > 0
      ? (totaisGerais.totalUtilizado / totaisGerais.totalOrcado) * 100
      : 0;

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
        toast.warning(`Recalculo concluído com ${inconsistencias} inconsistência(s) detectada(s)`);
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
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-black" />
              Rubricas por Museu
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Acompanhamento orçamentário consolidado por museu.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Recalcular
            </Button>

            {isCoordenador && (
              <Button
                variant="outline"
                className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl"
                onClick={() => setShowCardEditor(true)}
              >
                <LayoutGrid className="w-4 h-4" />
                Editor de Cards
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Execução geral"
            value={fmtPct(percentualGeral)}
            helper="utilizado sobre previsto"
            dark
          />
          <KpiCard label="Previsto" value={fmt(totaisGerais.totalOrcado)} helper="soma dos museus" />
          <KpiCard label="Utilizado" value={fmt(totaisGerais.totalUtilizado)} helper="pagos e lançamentos" />
          <KpiCard label="Saldo" value={fmt(totaisGerais.totalSaldo)} helper="saldo disponível" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {resumoPorMuseu.map((item) => (
            <MuseuCard
              key={item.museu}
              item={item}
              active={museuAtivo === item.museu}
              onClick={() => setMuseuAtivo(item.museu)}
              fmt={fmt}
              fmtPct={fmtPct}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-black">Detalhamento por Museu</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Visualização e edição das rubricas operacionais, específicas e rateáveis.
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

          <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
            {MUSEUS.map((m) => (
              <TabsContent key={`${m}-${refreshNonce}`} value={m} className="m-0 p-4 bg-white">
                <RubricasMuseuEditor
                  key={`${m}-${refreshNonce}`}
                  museu={m}
                  canEdit={canEdit}
                  refreshKey={refreshNonce}
                  rubricaFilter={isRubricaValida}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <GerenciarRubricasMuseuDialog open={showGerenciar} onClose={() => setShowGerenciar(false)} />
        <CardRubricaEditor open={showCardEditor} onClose={() => setShowCardEditor(false)} />
      </div>
    </div>
  );
}
