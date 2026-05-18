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
import { recalculateAllRubricasFromPurchases } from '@/components/compras/AutoRubricasSync';
import { canManageRubricas } from '@/components/auth/permissions';

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
  if (text === 'mis' || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text === 'mhab' || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text === 'mumo' || text.includes('moda')) return 'MUMO';
  if (text.includes('noturno')) return 'NOTURNO';
  return String(value || '').trim().toUpperCase();
}

function getNome(r = {}) {
  return String(r?.rubrica || r?.nome || r?.descricao || 'Rubrica sem nome');
}

function getValorOrcado(r = {}) {
  return toNumber(r?.totalOrcado ?? r?.valorOrcado ?? r?.valor_rubrica ?? r?.valor_total ?? r?.orcado ?? r?.previsto);
}

function getValorUtilizado(r = {}) {
  return toNumber(r?.valorUtilizado ?? r?.valor_utilizado ?? r?.utilizado ?? r?.realizado);
}

function getValorPago(r = {}) {
  return toNumber(r?.valorPago ?? r?.valor_pago ?? r?.pago);
}

function getValorLancamentos(r = {}) {
  return toNumber(r?.valorLancamentos ?? r?.valor_lancamentos ?? r?.lancamentos);
}

function getSearchText(r = {}, includeGeneratedOrigin = false) {
  return normalizeText([
    r?.rubrica,
    r?.nome,
    r?.descricao,
    r?.grupo,
    r?.categoria,
    r?.categoria_key,
    r?.centro_custo,
    r?.museu,
    r?.museu_codigo,
    r?.unidade,
    includeGeneratedOrigin ? r?.museu_origem : '',
    r?.observacao_uso,
  ].filter(Boolean).join(' '));
}

function isHiddenRubrica(text = '') {
  return (
    text.includes('transporte') ||
    text.includes('assessoria juridica') ||
    text.includes('assessor juridico') ||
    text.includes('juridico') ||
    text.includes('contador') ||
    text.includes('contabilidade') ||
    text.includes('energia eletrica') ||
    text.includes('formacao sobre ambiente seguro') ||
    text.includes('ambiente seguro') ||
    text.includes('diversidade') ||
    text.includes('inclusao') ||
    text.includes('material escritorio') ||
    text.includes('material de escritorio') ||
    text.includes('fornecimento de som e iluminacao') ||
    text.includes('fornecimento de som') ||
    text.includes('coordenador') ||
    text.includes('coordenacao') ||
    text.includes('assistente') ||
    text.includes('analista') ||
    text.includes('equipe') ||
    text.includes('gestao') ||
    text.includes('administrativo') ||
    text.includes('consultoria') ||
    text.includes('consultorias') ||
    text.includes('despesas gerais') ||
    text.includes('despesa geral') ||
    text.includes('educador') ||
    text.includes('educadora') ||
    text.includes('diaria educador') ||
    text.includes('diarias educador')
  );
}

function isNoturno(r = {}) {
  return getSearchText(r, true).includes('noturno');
}

function hasMuseuToken(text = '', museu = '') {
  if (museu === 'MIS') return text.includes('mis') || text.includes('imagem') || text.includes('som');
  if (museu === 'MHAB') return text.includes('mhab') || text.includes('abilio') || text.includes('historico');
  if (museu === 'MUMO') return text.includes('mumo') || text.includes('moda');
  return false;
}

function countMuseuTokens(text = '') {
  return MUSEUS.filter((museu) => hasMuseuToken(text, museu)).length;
}

function matchRubricaMuseu(r = {}, museu = '') {
  const normalizedMuseu = normalizeMuseu(museu);
  const explicitText = getSearchText(r, false);
  if (!normalizedMuseu || normalizedMuseu === 'GERAL') return false;
  if (isHiddenRubrica(explicitText)) return false;
  if (normalizedMuseu === 'NOTURNO') return isNoturno(r) && !isHiddenRubrica(explicitText);
  if (isNoturno(r)) return false;
  if (countMuseuTokens(explicitText) !== 1) return false;
  return hasMuseuToken(explicitText, normalizedMuseu);
}

function isAlimentacao(r = {}) {
  const text = getSearchText(r);
  return text.includes('alimentacao') || text.includes('alimentacoes');
}

function isLanches(r = {}) {
  const text = getSearchText(r);
  return text.includes('lanche') || text.includes('lanches');
}

function isExcludedFromRateio(r = {}) {
  const text = getSearchText(r);
  if (isLanches(r) || isAlimentacao(r)) return false;
  return isHiddenRubrica(text) || text.includes('producao') || text.includes('producoes') || isNoturno(r);
}

function isRubricaCompartilhada(r = {}) {
  if (isNoturno(r)) return false;
  const text = getSearchText(r);
  const count = countMuseuTokens(text);
  return count === 0 || count >= 2;
}

function flattenAllRubricas(source = {}) {
  const rows = [];
  if (source?.por_museu && typeof source.por_museu === 'object') {
    Object.entries(source.por_museu).forEach(([museuKey, categorias]) => {
      Object.entries(categorias || {}).forEach(([categoriaKey, items]) => {
        (Array.isArray(items) ? items : []).forEach((item) => {
          rows.push({ ...item, categoria_key: item?.categoria_key || categoriaKey, museu_origem: normalizeMuseu(museuKey) });
        });
      });
    });
  }
  return rows;
}

function dedupeRows(rows = []) {
  const seen = new Set();
  return rows.filter((r) => {
    const id = r?.id || normalizeText(getNome(r));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function ensureRubricasFixas(rows = []) {
  const hasAlimentacao = rows.some(isAlimentacao);
  if (hasAlimentacao) return rows;
  return [...rows, {
    id: 'rateio-fixo-alimentacao-acoes-educativas',
    rubrica: 'Alimentação',
    categoria_key: 'Ações educativas',
    valor_rubrica: 3000,
    valor_total: 3000,
    valor_utilizado: 0,
    valor_pago: 0,
    valor_lancamentos: 0,
    ativo: true,
    __synthetic: true,
  }];
}

function buildResumoRealPorMuseu(consolidado = {}) {
  const rows = dedupeRows(flattenAllRubricas(consolidado)).filter((r) => r?.ativo !== false);
  const sharedRows = ensureRubricasFixas(rows)
    .filter((r) => r?.ativo !== false)
    .filter(isRubricaCompartilhada)
    .filter((r) => !isExcludedFromRateio(r));

  return MUSEUS.map((museu) => {
    const specific = rows.filter((r) => matchRubricaMuseu(r, museu));
    const acc = { museu, totalOrcado: 0, totalUtilizado: 0, totalPago: 0, totalLancamentos: 0, totalSaldo: 0, pct: 0 };

    specific.forEach((r) => {
      const orcado = getValorOrcado(r);
      const utilizado = getValorUtilizado(r);
      acc.totalOrcado += orcado;
      acc.totalUtilizado += utilizado;
      acc.totalPago += getValorPago(r);
      acc.totalLancamentos += getValorLancamentos(r);
      acc.totalSaldo += orcado - utilizado;
    });

    sharedRows.forEach((r) => {
      const orcado = getValorOrcado(r) / 3;
      const utilizado = getValorUtilizado(r) / 3;
      acc.totalOrcado += orcado;
      acc.totalUtilizado += utilizado;
      acc.totalPago += getValorPago(r) / 3;
      acc.totalLancamentos += getValorLancamentos(r) / 3;
      acc.totalSaldo += orcado - utilizado;
    });

    acc.totalOrcado = Number(acc.totalOrcado.toFixed(2));
    acc.totalUtilizado = Number(acc.totalUtilizado.toFixed(2));
    acc.totalPago = Number(acc.totalPago.toFixed(2));
    acc.totalLancamentos = Number(acc.totalLancamentos.toFixed(2));
    acc.totalSaldo = Number(acc.totalSaldo.toFixed(2));
    acc.pct = acc.totalOrcado > 0 ? Number(((acc.totalUtilizado / acc.totalOrcado) * 100).toFixed(2)) : 0;
    return acc;
  });
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
  const [showNovaRubrica, setShowNovaRubrica] = useState(false);
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
        const perms = await base44.entities.UserPermission.filter({ user_email: user.email.toLowerCase() });
        setUserPermission(perms?.[0] || null);
      }
    }).catch(() => {});
  }, []);

  const userRole = String(userPermission?.base_role || currentUser?.role || '').toUpperCase();
  const isSponsor = userRole === 'PATROCINADOR' || userRole === 'OBSERVADOR';
  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);
  const canEdit = !isSponsor && (isCoordenador || userPermission?.pode_gerenciar_rubricas || userPermission?.gestao_compras || canManageRubricas(currentUser, userPermission));

  const { data: consolidado, refetch: refetchConsolidado } = useQuery({
    queryKey: ['rubricas-consolidadas', refreshNonce],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('getRubricasConsolidadas', {});
        if (res?.data) return res.data;
      } catch (err) {
        console.warn('getRubricasConsolidadas indisponível:', err);
      }
      const rubricas = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
      return { por_museu: { GERAL: { geral: Array.isArray(rubricas) ? rubricas : [] } } };
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  const resumoPorMuseu = useMemo(() => {
    const source = lastRecalcResponse || consolidado || {};
    return buildResumoRealPorMuseu(source);
  }, [consolidado, lastRecalcResponse]);

  const fmt = (v) => toNumber(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

  const totaisGerais = useMemo(() => resumoPorMuseu.reduce((acc, item) => {
    acc.totalOrcado += toNumber(item.totalOrcado);
    acc.totalUtilizado += toNumber(item.totalUtilizado);
    acc.totalPago += toNumber(item.totalPago);
    acc.totalLancamentos += toNumber(item.totalLancamentos);
    acc.totalSaldo += toNumber(item.totalSaldo);
    return acc;
  }, { totalOrcado: 0, totalUtilizado: 0, totalPago: 0, totalLancamentos: 0, totalSaldo: 0 }), [resumoPorMuseu]);

  const percentualGeral = totaisGerais.totalOrcado > 0 ? (totaisGerais.totalUtilizado / totaisGerais.totalOrcado) * 100 : 0;

  const refreshAllRubricaData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: (query) => String(Array.isArray(query.queryKey) ? query.queryKey.join('|') : query.queryKey || '').toLowerCase().includes('rubrica') }),
      refetchConsolidado(),
    ]);
    setRefreshNonce((prev) => prev + 1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await base44.functions.invoke('recalculateAllRubricas', { trigger: 'manual_refresh_rubricas_por_museu' });
      setLastRecalcResponse(res?.data || null);
      await refreshAllRubricaData();
      toast.success('Rubricas recalculadas e tela atualizada com dados reais');
    } catch (e) {
      console.warn('recalculateAllRubricas indisponível. Recalculando no frontend:', e);
      try {
        const result = await recalculateAllRubricasFromPurchases();
        setLastRecalcResponse(null);
        await refreshAllRubricaData();
        toast.success(`Rubricas atualizadas no app (${result.updated || 0} ajuste${result.updated === 1 ? '' : 's'})`);
      } catch (fallbackError) {
        toast.error('Erro ao recalcular rubricas');
        console.error(fallbackError);
      }
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
          <KpiCard label="Utilizado" value={fmt(totaisGerais.totalUtilizado)} helper="rubricas específicas + rateio" />
          <KpiCard label="Saldo" value={fmt(totaisGerais.totalSaldo)} helper="saldo disponível" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {resumoPorMuseu.map((item) => <MuseuCard key={item.museu} item={item} active={museuAtivo === item.museu} onClick={() => setMuseuAtivo(item.museu)} fmt={fmt} fmtPct={fmtPct} />)}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-black">{museuAtivo === 'NOTURNO' ? 'Rubricas do Noturno' : 'Detalhamento por Museu'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">Visualização e edição das rubricas operacionais, específicas e rateáveis.</p>
            </div>
            <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
              <TabsList className="grid grid-cols-4 bg-gray-100 rounded-xl p-1 w-[340px]">{ABAS.map((m) => <TabsTrigger key={m} value={m} className="text-xs font-semibold rounded-lg data-[state=active]:bg-black data-[state=active]:text-white">{m}</TabsTrigger>)}</TabsList>
            </Tabs>
          </div>

          <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
            {ABAS.map((m) => <TabsContent key={`${m}-${refreshNonce}`} value={m} className="m-0 p-4 bg-white"><RubricasMuseuEditor key={`${m}-${refreshNonce}`} museu={m} canEdit={canEdit} refreshKey={refreshNonce} /></TabsContent>)}
          </Tabs>
        </div>

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
