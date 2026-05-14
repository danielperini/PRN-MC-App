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
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text === 'mis' || text.includes('imagem e som') || text.includes('museu da imagem')) return 'MIS';
  if (text === 'mhab' || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text === 'mumo' || text.includes('moda')) return 'MUMO';
  if (text.includes('noturno')) return 'NOTURNO';
  return String(value || '').trim().toUpperCase();
}

function getNome(rubrica = {}) {
  return String(rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '');
}

function getCategoria(rubrica = {}, fallback = '') {
  return String(rubrica?.categoria || rubrica?.categoria_key || rubrica?.grupo || rubrica?.grupo_nome || fallback || '');
}

function getTexto(rubrica = {}) {
  return normalizeText([
    getNome(rubrica),
    getCategoria(rubrica),
    rubrica?.grupo,
    rubrica?.centro_custo,
    rubrica?.museu,
    rubrica?.museu_codigo,
    rubrica?.unidade,
    rubrica?.observacao_uso,
  ].filter(Boolean).join(' '));
}

function hasMuseu(texto, museu) {
  if (museu === 'MIS') return texto.includes('mis') || texto.includes('imagem e som') || texto.includes('museu da imagem');
  if (museu === 'MHAB') return texto.includes('mhab') || texto.includes('abilio') || texto.includes('historico');
  if (museu === 'MUMO') return texto.includes('mumo') || texto.includes('moda');
  return false;
}

function museusNoTexto(texto) {
  return MUSEUS.filter((m) => hasMuseu(texto, m));
}

function isNoturno(rubrica = {}) {
  const texto = getTexto(rubrica);
  const categoria = normalizeText(getCategoria(rubrica));
  return (
    categoria.includes('noturno') ||
    texto.includes('noturno') ||
    texto.includes('limpeza') ||
    texto.includes('van') ||
    texto.includes('vans')
  );
}

function isAdminGeral(rubrica = {}) {
  const texto = getTexto(rubrica);
  const categoria = normalizeText(getCategoria(rubrica));
  if (['equipe', 'consultorias', 'despesas_gerais', 'despesas gerais'].includes(categoria)) return true;
  return [
    'coordenador geral',
    'coordenador de comunicacao',
    'coordenador de comunicação',
    'assistente administrativo',
    'assistente de coordenacao',
    'assistente de coordenação',
    'analista adm',
    'analista administrativo',
    'assessor de imprensa',
    'rede social',
    'marketing cultural',
    'consultoria',
    'consultorias',
    'contador',
    'contabilidade',
    'juridico',
    'jurídico',
    'energia eletrica',
    'energia elétrica',
    'transporte',
  ].some((termo) => texto.includes(normalizeText(termo)));
}

function isCompartilhada(rubrica = {}) {
  const texto = getTexto(rubrica);
  return (
    texto.includes('mis / mumo / mhab') ||
    texto.includes('mis/mumo/mhab') ||
    texto.includes('mhab / mis / mumo') ||
    texto.includes('mhab/mis/mumo') ||
    museusNoTexto(texto).length >= 2
  );
}

function isEspecificaMuseu(rubrica = {}, museu = '') {
  const texto = getTexto(rubrica);
  const mencionados = museusNoTexto(texto);
  const centro = normalizeMuseu(rubrica?.centro_custo || rubrica?.museu || rubrica?.museu_codigo || rubrica?.unidade || '');

  if (centro && MUSEUS.includes(centro) && centro !== museu) return false;
  if (centro === museu && mencionados.length <= 1) return true;
  return mencionados.length === 1 && mencionados[0] === museu;
}

function deveContarNoMuseu(rubrica = {}, museu = '') {
  if (!MUSEUS.includes(museu)) return false;
  if (rubrica?.ativo === false) return false;
  if (isNoturno(rubrica)) return false;
  if (isAdminGeral(rubrica)) return false;
  if (isCompartilhada(rubrica)) return true;
  return isEspecificaMuseu(rubrica, museu);
}

function resumoVazio() {
  return MUSEUS.reduce((acc, museu) => {
    acc[museu] = {
      museu,
      totalOrcado: 0,
      totalUtilizado: 0,
      totalPago: 0,
      totalLancamentos: 0,
      totalSaldo: 0,
      pct: 0,
    };
    return acc;
  }, {});
}

function arredondarResumo(resumo) {
  MUSEUS.forEach((museu) => {
    const item = resumo[museu];
    item.totalOrcado = Number(toNumber(item.totalOrcado).toFixed(2));
    item.totalUtilizado = Number(toNumber(item.totalUtilizado).toFixed(2));
    item.totalPago = Number(toNumber(item.totalPago).toFixed(2));
    item.totalLancamentos = Number(toNumber(item.totalLancamentos).toFixed(2));
    item.totalSaldo = Number(toNumber(item.totalSaldo).toFixed(2));
    item.pct = item.totalOrcado > 0
      ? Number(((item.totalUtilizado / item.totalOrcado) * 100).toFixed(2))
      : 0;
  });
  return resumo;
}

function resumoFiltrado(source = {}) {
  const resumo = resumoVazio();
  const porMuseu = source?.por_museu;
  if (!porMuseu || typeof porMuseu !== 'object') return resumo;

  MUSEUS.forEach((museu) => {
    const categorias = porMuseu?.[museu];
    if (!categorias || typeof categorias !== 'object') return;

    const seen = new Set();
    Object.entries(categorias).forEach(([categoria, rubricas]) => {
      (Array.isArray(rubricas) ? rubricas : []).forEach((rubricaOriginal) => {
        const rubrica = { ...rubricaOriginal, categoria: rubricaOriginal?.categoria || categoria };
        if (!deveContarNoMuseu(rubrica, museu)) return;

        const key = `${rubrica?.id || getNome(rubrica)}-${getCategoria(rubrica)}-${museu}`;
        if (seen.has(key)) return;
        seen.add(key);

        const totalOrcado = toNumber(rubrica?.totalOrcado ?? rubrica?.valor_rubrica);
        const totalUtilizado = toNumber(rubrica?.valorUtilizado ?? rubrica?.valor_utilizado);
        const totalPago = toNumber(rubrica?.valorPago ?? rubrica?.valor_pago);
        const totalLancamentos = toNumber(rubrica?.valorLancamentos ?? rubrica?.valor_lancamentos);
        const totalSaldo = rubrica?.saldo !== undefined && rubrica?.saldo !== null
          ? toNumber(rubrica.saldo)
          : totalOrcado - totalUtilizado;

        resumo[museu].totalOrcado += totalOrcado;
        resumo[museu].totalUtilizado += totalUtilizado;
        resumo[museu].totalPago += totalPago;
        resumo[museu].totalLancamentos += totalLancamentos;
        resumo[museu].totalSaldo += totalSaldo;
      });
    });
  });

  return arredondarResumo(resumo);
}

function resumoBackend(source = {}) {
  const resumo = resumoVazio();
  const totais = source?.totais_por_museu;
  if (!totais || typeof totais !== 'object') return resumo;

  Object.entries(totais).forEach(([key, dados]) => {
    const museu = normalizeMuseu(key);
    if (!MUSEUS.includes(museu)) return;

    const totalOrcado = toNumber(dados?.totalOrcado);
    const totalUtilizado = toNumber(dados?.totalUtilizado);
    const totalPago = toNumber(dados?.totalPago);
    const totalLancamentos = toNumber(dados?.totalLancamentos);
    const totalSaldo = dados?.totalSaldo !== undefined && dados?.totalSaldo !== null
      ? toNumber(dados.totalSaldo)
      : totalOrcado - totalUtilizado;

    resumo[museu] = { museu, totalOrcado, totalUtilizado, totalPago, totalLancamentos, totalSaldo, pct: 0 };
  });

  return arredondarResumo(resumo);
}

function temValor(resumo = {}) {
  return MUSEUS.some((museu) =>
    toNumber(resumo?.[museu]?.totalOrcado) > 0 ||
    toNumber(resumo?.[museu]?.totalUtilizado) > 0 ||
    toNumber(resumo?.[museu]?.totalPago) > 0
  );
}

function escolherResumo(consolidado, recalc) {
  const filtradoRecalc = resumoFiltrado(recalc);
  if (temValor(filtradoRecalc)) return filtradoRecalc;

  const filtradoBase = resumoFiltrado(consolidado);
  if (temValor(filtradoBase)) return filtradoBase;

  const backendRecalc = resumoBackend(recalc);
  if (temValor(backendRecalc)) return backendRecalc;

  return resumoBackend(consolidado);
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

function MuseuCard({ item, active, onClick, fmt, fmtPct }) {
  const progressWidth = `${Math.min(toNumber(item.pct), 100)}%`;

  return (
    <Card className={`cursor-pointer transition-all rounded-2xl shadow-sm ${active ? 'border-black bg-black text-white shadow-md' : 'border-gray-200 bg-white hover:border-black hover:shadow-md'}`} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-gray-300' : 'text-gray-500'}`}>Museu</p>
            <h2 className={`text-3xl font-bold leading-tight mt-1 ${active ? 'text-white' : 'text-black'}`}>{item.museu}</h2>
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

  const { data: consolidado, refetch: refetchConsolidado } = useQuery({
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
    const mapa = escolherResumo(consolidado, lastRecalcResponse);
    return MUSEUS.map((m) => mapa[m] || resumoBackend({})[m]);
  }, [consolidado, lastRecalcResponse]);

  const fmt = (v) => toNumber(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

  const totaisGerais = useMemo(() => {
    return resumoPorMuseu.reduce((acc, item) => {
      acc.totalOrcado += toNumber(item.totalOrcado);
      acc.totalUtilizado += toNumber(item.totalUtilizado);
      acc.totalPago += toNumber(item.totalPago);
      acc.totalLancamentos += toNumber(item.totalLancamentos);
      acc.totalSaldo += toNumber(item.totalSaldo);
      return acc;
    }, { totalOrcado: 0, totalUtilizado: 0, totalPago: 0, totalLancamentos: 0, totalSaldo: 0 });
  }, [resumoPorMuseu]);

  const percentualGeral = totaisGerais.totalOrcado > 0 ? (totaisGerais.totalUtilizado / totaisGerais.totalOrcado) * 100 : 0;

  const refreshAllRubricaData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = Array.isArray(query.queryKey) ? query.queryKey.join('|').toLowerCase() : String(query.queryKey || '').toLowerCase();
        return key.includes('rubrica') || key.includes('budget') || key.includes('compra') || key.includes('purchase') || key.includes('museu');
      }}),
      refetchConsolidado(),
    ]);
    setRefreshNonce((prev) => prev + 1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await base44.functions.invoke('recalculateAllRubricas', { trigger: 'manual_refresh_rubricas_por_museu' });
      const data = res?.data || null;
      setLastRecalcResponse(data);
      await refreshAllRubricaData();
      toast.success('Rubricas recalculadas e tela atualizada com sucesso');
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
            <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-2"><TrendingUp className="w-6 h-6 text-black" />Rubricas por Museu</h1>
            <p className="text-gray-500 mt-1 text-sm">Acompanhamento orçamentário consolidado por museu.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl" onClick={handleRefresh} disabled={isRefreshing}><RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />Recalcular</Button>
            {isCoordenador && <Button variant="outline" className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl" onClick={() => setShowCardEditor(true)}><LayoutGrid className="w-4 h-4" />Editor de Cards</Button>}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Execução geral" value={fmtPct(percentualGeral)} helper="utilizado sobre previsto" dark />
          <KpiCard label="Previsto" value={fmt(totaisGerais.totalOrcado)} helper="soma dos museus" />
          <KpiCard label="Utilizado" value={fmt(totaisGerais.totalUtilizado)} helper="pagos e lançamentos" />
          <KpiCard label="Saldo" value={fmt(totaisGerais.totalSaldo)} helper="saldo disponível" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {resumoPorMuseu.map((item) => <MuseuCard key={item.museu} item={item} active={museuAtivo === item.museu} onClick={() => setMuseuAtivo(item.museu)} fmt={fmt} fmtPct={fmtPct} />)}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-black">{museuAtivo === 'NOTURNO' ? 'Rubricas do Noturno' : 'Detalhamento por Museu'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">Visualização das rubricas específicas e compartilhadas filtradas por museu.</p>
            </div>
            <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
              <TabsList className="grid grid-cols-4 bg-gray-100 rounded-xl p-1 w-[340px]">
                {ABAS.map((m) => <TabsTrigger key={m} value={m} className="text-xs font-semibold rounded-lg data-[state=active]:bg-black data-[state=active]:text-white">{m}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>

          <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
            {ABAS.map((m) => (
              <TabsContent key={`${m}-${refreshNonce}`} value={m} className="m-0 p-4 bg-white">
                <RubricasMuseuEditor key={`${m}-${refreshNonce}`} museu={m} canEdit={canEdit} refreshKey={refreshNonce} />
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
