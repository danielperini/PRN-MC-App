// 🔥 ARQUIVO COMPLETO — COM ABA NOTURNO
// Versão consolidada restaurada

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
const ABAS = ['MHAB', 'MIS', 'MUMO', 'NOTURNO'];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isRubricaNoturno(rubrica = {}) {
  const txt = normalizeText([
    rubrica?.rubrica,
    rubrica?.nome,
    rubrica?.descricao,
    rubrica?.grupo,
    rubrica?.categoria
  ].join(' '));

  return txt.includes('noturno');
}

function KpiCard({ label, value, helper }) {
  return (
    <Card className="rounded-2xl border-gray-200 shadow-sm">
      <CardContent className="p-5">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">
          {label}
        </p>

        <p className="text-3xl font-bold mt-3 leading-tight text-black">
          {value}
        </p>

        {helper && (
          <p className="text-xs mt-1 text-gray-500">
            {helper}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function RubricasPorMuseu() {
  const [abaAtiva, setAbaAtiva] = useState('MHAB');
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isCoordenador =
    currentUser &&
    ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const { data: consolidado = {} } = useQuery({
    queryKey: ['rubricas-consolidadas', refreshNonce],
    queryFn: async () => {
      const res = await base44.functions.invoke(
        'getRubricasConsolidadas',
        {}
      );

      return res?.data || {};
    },
    staleTime: 0,
    gcTime: 0,
  });

  const resumoPorMuseu = useMemo(() => {
    return MUSEUS.map((m) => {
      const categorias = consolidado?.por_museu?.[m] || {};

      let totalOrcado = 0;
      let totalUtilizado = 0;
      let totalSaldo = 0;

      Object.values(categorias).forEach((items) => {
        if (!Array.isArray(items)) return;

        items.forEach((item) => {
          totalOrcado += toNumber(item?.totalOrcado);
          totalUtilizado += toNumber(item?.valorUtilizado);
          totalSaldo += toNumber(item?.saldo);
        });
      });

      const pct =
        totalOrcado > 0
          ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(1))
          : 0;

      return {
        museu: m,
        totalOrcado,
        totalUtilizado,
        totalSaldo,
        pct,
      };
    });
  }, [consolidado]);

  const totaisGerais = useMemo(() => {
    return resumoPorMuseu.reduce(
      (acc, item) => {
        acc.totalOrcado += item.totalOrcado;
        acc.totalUtilizado += item.totalUtilizado;
        acc.totalSaldo += item.totalSaldo;
        return acc;
      },
      {
        totalOrcado: 0,
        totalUtilizado: 0,
        totalSaldo: 0,
      }
    );
  }, [resumoPorMuseu]);

  const percentualGeral =
    totaisGerais.totalOrcado > 0
      ? (totaisGerais.totalUtilizado / totaisGerais.totalOrcado) * 100
      : 0;

  const fmt = (v) =>
    toNumber(v).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });

  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

  const handleRefresh = async () => {
    try {
      await base44.functions.invoke('recalculateAllRubricas', {});
      await queryClient.invalidateQueries();

      setRefreshNonce((prev) => prev + 1);

      toast.success('Rubricas atualizadas');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao recalcular rubricas');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              Rubricas por Museu
            </h1>

            <p className="text-gray-500 text-sm">
              Acompanhamento orçamentário consolidado por museu.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Recalcular
            </Button>

            {isCoordenador && (
              <Button
                variant="outline"
                onClick={() => setShowCardEditor(true)}
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                Editor
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Execução geral"
            value={fmtPct(percentualGeral)}
            helper="utilizado sobre previsto"
          />

          <KpiCard
            label="Previsto"
            value={fmt(totaisGerais.totalOrcado)}
            helper="soma dos museus"
          />

          <KpiCard
            label="Utilizado"
            value={fmt(totaisGerais.totalUtilizado)}
            helper="compras e lançamentos"
          />

          <KpiCard
            label="Saldo"
            value={fmt(totaisGerais.totalSaldo)}
            helper="saldo disponível"
          />
        </div>

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>

          <TabsList className="grid grid-cols-4 bg-gray-100 rounded-xl p-1">
            {ABAS.map((m) => (
              <TabsTrigger
                key={m}
                value={m}
                className="text-xs font-semibold rounded-lg data-[state=active]:bg-black data-[state=active]:text-white"
              >
                {m}
              </TabsTrigger>
            ))}
          </TabsList>

          {MUSEUS.map((m) => (
            <TabsContent key={m} value={m} className="p-4">
              <RubricasMuseuEditor
                museu={m}
                refreshKey={refreshNonce}
              />
            </TabsContent>
          ))}

          <TabsContent value="NOTURNO" className="p-4">
            <RubricasMuseuEditor
              museu="GERAL"
              refreshKey={refreshNonce}
              rubricaFilter={isRubricaNoturno}
            />
          </TabsContent>

        </Tabs>

        <GerenciarRubricasMuseuDialog />
        <CardRubricaEditor
          open={showCardEditor}
          onClose={() => setShowCardEditor(false)}
        />

      </div>
    </div>
  );
}
