import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, Plus, Database } from 'lucide-react';
import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';
import RubricasMuseuEditor from '@/components/rubricas/RubricasMuseuEditor';
import NovaRubricaDialog from '@/components/rubricas/NovaRubricaDialog';
import NoturnoPampulhaCard from '@/components/compras/NoturnoPampulhaCard';
import CentrosCustoCards from '@/components/compras/CentrosCustoCards';
import { canManageRubricas } from '@/components/auth/permissions';
import OrcamentoPorGrupoSection from '@/components/compras/OrcamentoPorGrupoSection';

// ─── Tokens de museu para classificação por nome ───
const MUSEU_TOKENS = {
  MHAB: ['mhab', 'abilio barreto', 'histórico municipal', 'museu histórico', 'mhab'],
  MIS: ['mis', 'imagem e som', 'imagem do som', 'mis bh'],
  MUMO: ['mumo', 'moda', 'museu da moda', 'mumu'],
};

// ─── Centros de custo da UI ───
const CENTROS_CUSTO = [
  'MHAB',
  'MIS',
  'MUMO',
  'Noturno 2026',
  'Noturno Pampulha',
  'Monitores',
  'Coordenação',
  'Comunicação',
  'Educação',
  'Produção',
  'Administrativo-financeiro',
  'Publicações',
  'Consultorias',
  'Despesas Gerais',
];

// Grupos de rubrica que representam pessoal/equipe — excluídos dos TOTAIS dos cards de museu
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
  'Produção',
  'Equipe de produção',
  'Pagamento para produção',
]);

// Helper: detecta se rubrica é de Monitores
function isMonitor(rubrica) {
  const grupo = normalizeText(rubrica.grupo || '');
  const nome = normalizeText(rubrica.rubrica || rubrica.nome || '');
  return grupo.includes('monitor') || nome.includes('monitor');
}

const CENTROS_EXCLUIR_PESSOAL = new Set(['MHAB', 'MIS', 'MUMO', 'Noturno 2026', 'Noturno Pampulha']);

// ─── Helpers numéricos e textuais ───
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

// ─── Classificação de rubrica por museu ───

/** Verifica se o texto contém tokens de um museu específico */
function hasMuseuToken(texto, museu) {
  const tokens = MUSEU_TOKENS[museu] || [];
  return tokens.some(t => texto.includes(t));
}

/** Conta quantos museus diferentes são mencionados no texto */
function countMuseuTokens(texto) {
  return ['MHAB', 'MIS', 'MUMO'].filter(m => hasMuseuToken(texto, m)).length;
}

/** Detecta se a rubrica é do Noturno (3º ou 4º Aditivo) */
function isNoturno(texto) {
  return texto.includes('noturno');
}

function isNoturnoPampulha(texto) {
  return texto.includes('noturno') && (texto.includes('pampulha') || texto.includes('4º') || texto.includes('4 aditivo'));
}

/** Detecta se é rubrica de alimentação/lanches */
function isAlimentacao(texto) {
  return /lanche|alimenta|buffet|coffee|café|refeição|lanchonete/i.test(texto);
}

/** Rubricas que NÃO devem ser rateadas (exclusivas de um museu) */
function isExcludedFromRateio(texto) {
  const excluir = ['bilheteria', 'ingresso', 'bilhete', 'entrada franca', 'gratuidade'];
  return excluir.some(t => texto.includes(t));
}

/** Classifica uma rubrica por nome: retorna array de museus (vazio = não classificado) */
function classificarPorNomeMuseu(rubrica) {
  const nome = normalizeText(rubrica.rubrica || rubrica.nome || '');
  const grupo = normalizeText(rubrica.grupo || '');
  const meta = normalizeText(rubrica.meta || '');
  const desc = normalizeText(rubrica.descricao || '');
  const texto = [nome, grupo, meta, desc].join(' ');

  // Verificar Noturno primeiro (palavra-chave forte)
  if (isNoturnoPampulha(texto)) return ['Noturno Pampulha'];
  if (isNoturno(texto)) return ['Noturno 2026'];

  // Verificar museus físicos
  const museus = [];
  if (hasMuseuToken(texto, 'MHAB')) museus.push('MHAB');
  if (hasMuseuToken(texto, 'MIS')) museus.push('MIS');
  if (hasMuseuToken(texto, 'MUMO')) museus.push('MUMO');

  // Se menciona múltiplos museus e não é excluída, é compartilhada (rateio)
  if (museus.length > 1 && !isExcludedFromRateio(texto)) {
    return museus; // ratear entre todos os mencionados
  }

  return museus;
}

// ─── Normalização de centro_custo para UI ───
function normalizarCentroCustoParaUI(centroCusto) {
  const raw = String(centroCusto || '').trim();
  const up = raw.toUpperCase();
  if (!up) return null;

  if (up === 'MIS BH' || up === 'MIS') return 'MIS';
  if (up === 'MHAB' || up === 'MAB') return 'MHAB';
  if (up === 'MUMO' || up === 'MUMU') return 'MUMO';

  const low = raw.toLowerCase();
  if (low.includes('noturno') && (low.includes('pampulha') || low.includes('4'))) return 'Noturno Pampulha';
  if (low.includes('noturno')) return 'Noturno 2026';
  if (up.includes('NOTURNO')) return 'Noturno 2026';

  if (up.includes('GERAL') || up.includes('TRANSVERSAL')) return 'Geral/Transversal';
  if (up === 'COORDENAÇÃO' || up === 'COORDENACAO' || up.startsWith('COORDENA')) return 'Coordenação';
  if (up === 'COMUNICAÇÃO' || up === 'COMUNICACAO' || up.startsWith('COMUNICA')) return 'Comunicação';
  if (up === 'EDUCAÇÃO' || up === 'EDUCACAO' || up.startsWith('EDUCA')) return 'Educação';
  if (up === 'PRODUÇÃO' || up === 'PRODUCAO' || up.startsWith('PRODU')) return 'Produção';
  if (up.includes('ADMIN') || up.includes('FINANC')) return 'Administrativo-financeiro';
  if (up.includes('PUBLICA')) return 'Publicações';
  if (up.includes('CONSULTO')) return 'Consultorias';
  if (up.includes('DESPESA')) return 'Despesas Gerais';

  const match = CENTROS_CUSTO.find(c => c.toUpperCase() === up);
  return match || null;
}

// ─── Classificação híbrida: centro_custo → nome → rateio ───
const MUSEUS_FISICOS = ['MHAB', 'MIS', 'MUMO'];
const MUSEUS_TODOS = ['MHAB', 'MIS', 'MUMO', 'Noturno 2026', 'Noturno Pampulha', 'Monitores'];

/**
 * Retorna um array de {museu, peso} para rateio.
 * Se peso = 1 e array tem 1 item → rubrica exclusiva daquele museu.
 * Se array tem múltiplos itens → rubrica compartilhada, ratear igualmente.
 */
function classificarRubrica(rubrica) {
  // 0. Monitores → card próprio (independente do centro_custo)
  if (isMonitor(rubrica)) {
    return [{ museu: 'Monitores', peso: 1 }];
  }

  // 1. Prioridade: centro_custo explícito e válido
  const centroUI = normalizarCentroCustoParaUI(rubrica.centro_custo);
  if (centroUI && MUSEUS_TODOS.includes(centroUI)) {
    return [{ museu: centroUI, peso: 1 }];
  }

  // 2. Classificação por nome (tokens de museu)
  const museusPorNome = classificarPorNomeMuseu(rubrica);
  if (museusPorNome.length > 0) {
    const peso = 1 / museusPorNome.length;
    return museusPorNome.map(m => ({ museu: m, peso }));
  }

  // 3. Se tem centro_custo transversal (Coordenação, Comunicação, etc.) → ratear entre os 3 museus físicos
  if (centroUI && ['Coordenação', 'Comunicação', 'Educação', 'Produção', 'Administrativo-financeiro', 'Publicações', 'Consultorias', 'Despesas Gerais', 'Geral/Transversal'].includes(centroUI)) {
    const nomeTexto = normalizeText(rubrica.rubrica || rubrica.nome || '');
    const grupoTexto = normalizeText(rubrica.grupo || '');
    const texto = `${nomeTexto} ${grupoTexto}`;

    // Se o nome/grupo menciona um museu específico com centro transversal → alocar àquele museu
    for (const m of MUSEUS_FISICOS) {
      if (hasMuseuToken(texto, m)) return [{ museu: m, peso: 1 }];
    }

    // Alimentação/lanches com centro geral → ratear entre os 3 museus
    if (isAlimentacao(texto)) {
      const peso = 1 / 3;
      return MUSEUS_FISICOS.map(m => ({ museu: m, peso }));
    }

    // Outras rubricas transversais → ratear entre os 3 museus
    const peso = 1 / 3;
    return MUSEUS_FISICOS.map(m => ({ museu: m, peso }));
  }

  // 4. Sem centro e sem tokens no nome → ratear entre os 3 museus como fallback
  const peso = 1 / 3;
  return MUSEUS_FISICOS.map(m => ({ museu: m, peso }));
}

// ─── UI Components ───
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
const CENTROS_NOTURNO = new Set(['Noturno 2026', 'Noturno Pampulha']);

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

// ─── Página principal ───
export default function RubricasPorMuseu() {
  const [museuAtivo, setMuseuAtivo] = useState(CENTROS_CUSTO[0]);
  const [showGerenciar, setShowGerenciar] = useState(false);
  const [showNovaRubrica, setShowNovaRubrica] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userPermission, setUserPermission] = useState(null);

  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    base44.auth.me().then(async (user) => {
      setCurrentUser(user);
      if (user?.email) {
        const perms = await base44.entities.UserPermission.filter({ user_email: user.email.toLowerCase() });
        setUserPermission(perms?.[0] || null);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const unsubRubricas = base44.entities.Rubrica.subscribe(() => setRefreshNonce((prev) => prev + 1));
    const unsubCompras = base44.entities.PurchaseRequest.subscribe(() => setRefreshNonce((prev) => prev + 1));
    return () => { unsubRubricas(); unsubCompras(); };
  }, []);

  const userRole = String(userPermission?.base_role || currentUser?.role || '').toUpperCase();
  const isSponsor = userRole === 'PATROCINADOR' || userRole === 'OBSERVADOR';
  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);
  const canEdit = !isSponsor && (isCoordenador || userPermission?.pode_gerenciar_rubricas || userPermission?.gestao_compras || canManageRubricas(currentUser, userPermission));

  const { data: rubricasBanco, refetch: refetchRubricas } = useQuery({
    queryKey: ['rubricas-banco', refreshNonce],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 1000),
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: true,
  });

  const { data: comprasAprovadas, refetch: refetchCompras } = useQuery({
    queryKey: ['compras-aprovadas-resumo', refreshNonce],
    queryFn: () => base44.entities.PurchaseRequest.filter({
      status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] }
    }, '-created_date', 2000),
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: true,
  });

  /**
   * RESUMO POR MUSEU
   * - Orçado: soma das rubricas classificadas por centro_custo
   * - Utilizado/Pago: soma das COMPRAS aprovadas, usando o centro_custo da PRÓPRIA COMPRA como fonte de verdade
   *   Aliases: "Noturno nos Museus 2026" → "Noturno 2026", "Atuação Geral" → rubricas transversais ignoradas nos cards de museu físico
   */
  const resumoPorMuseu = useMemo(() => {
    // Filtra rubricas: ativas e com grupo preenchido (sem grupo = inválidas, não exibir)
    const banco = Array.isArray(rubricasBanco) ? rubricasBanco.filter(r => r?.ativo !== false && String(r?.grupo || '').trim() !== '') : [];
    const compras = Array.isArray(comprasAprovadas) ? comprasAprovadas : [];

    const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
    const STATUS_PAGO = new Set(['PAGO']);

    // Normaliza centro_custo de uma compra para a chave do mapa (CENTROS_CUSTO)
    function normalizarCCCompra(cc) {
      const raw = String(cc || '').trim();
      const up = raw.toUpperCase();
      if (up === 'MIS BH' || up === 'MIS') return 'MIS';
      if (up === 'MHAB' || up === 'MAB') return 'MHAB';
      if (up === 'MUMO' || up === 'MUMU') return 'MUMO';
      const low = raw.toLowerCase();
      // Noturno Pampulha (4º Aditivo)
      if (low.includes('noturno') && (low.includes('pampulha') || low.includes('4'))) return 'Noturno Pampulha';
      // Todos os aliases de Noturno 2026 (inclui "Noturno nos Museus 2026", "Noturno nos Museus", etc.)
      if (low.includes('noturno')) return 'Noturno 2026';
      // Aliases genéricos → não mapeia para card de museu específico
      return null;
    }

    // Inicializar mapa
    const mapa = {};
    for (const centro of CENTROS_CUSTO) {
      mapa[centro] = { museu: centro, totalOrcado: 0, totalUtilizado: 0, totalSaldo: 0, pct: 0, totalPago: 0 };
    }

    // ── Orçado: vem das rubricas (centro_custo da rubrica) ──
    const seen = new Set();
    const rubricasUnicas = banco.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });

    for (const r of rubricasUnicas) {
      const previsto = toNumber(r.valor_rubrica || r.valor_total);
      const grupo = String(r?.grupo || '').trim();
      const alocacoes = classificarRubrica(r);

      for (const { museu, peso } of alocacoes) {
        if (!mapa[museu]) continue;
        const grupoNormalizado = normalizeText(grupo);
        const ehPessoal = GRUPOS_PESSOAL.has(grupo) ||
          grupoNormalizado.includes('produç') ||
          grupoNormalizado.includes('educador') ||
          grupoNormalizado.includes('coordenador') ||
          grupoNormalizado.includes('monitor') ||
          grupoNormalizado.includes('equipe');
        if (CENTROS_EXCLUIR_PESSOAL.has(museu) && ehPessoal) continue;
        mapa[museu].totalOrcado += previsto * peso;
      }
    }

    // ── Utilizado/Pago: vem das COMPRAS, usando centro_custo da compra como fonte de verdade ──
    for (const c of compras) {
      const status = String(c.status || '').toUpperCase();
      if (!STATUS_APROVADOS.has(status)) continue;
      const museu = normalizarCCCompra(c.centro_custo);
      if (!museu || !mapa[museu]) continue;
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      mapa[museu].totalUtilizado += val;
      if (STATUS_PAGO.has(status)) mapa[museu].totalPago += val;
    }

    return CENTROS_CUSTO
      .map((centro) => {
        const d = mapa[centro];
        const totalOrcado = Number(d.totalOrcado.toFixed(2));
        const totalUtilizado = Number(d.totalUtilizado.toFixed(2));
        const totalPago = Number(d.totalPago.toFixed(2));
        const totalSaldo = Number((totalOrcado - totalUtilizado).toFixed(2));
        const pct = totalOrcado > 0 ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(2)) : 0;
        return { ...d, totalOrcado, totalUtilizado, totalPago, totalSaldo, pct };
      })
      .filter(d => d.totalOrcado > 0 || d.totalUtilizado > 0);
  }, [rubricasBanco, comprasAprovadas]);

  const fmt = (v) => toNumber(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;

  // KPIs gerais = soma EXATA dos cards visíveis na grade (museus físicos + noturno),
  // excluindo centros transversais que são exibidos separadamente em CentrosCustoCards
  const CENTROS_CARDS_GRADE = new Set(['MHAB', 'MIS', 'MUMO', 'Noturno 2026', 'Noturno Pampulha', 'Monitores']);

  const totaisGerais = useMemo(() => {
    const cardsGrade = resumoPorMuseu.filter(item => CENTROS_CARDS_GRADE.has(item.museu));
    const totalOrcado = Number(cardsGrade.reduce((acc, item) => acc + toNumber(item.totalOrcado), 0).toFixed(2));
    const totalUtilizado = Number(cardsGrade.reduce((acc, item) => acc + toNumber(item.totalUtilizado), 0).toFixed(2));
    const totalPago = Number(cardsGrade.reduce((acc, item) => acc + toNumber(item.totalPago), 0).toFixed(2));
    const totalSaldo = Number((totalOrcado - totalUtilizado).toFixed(2));
    return { totalOrcado, totalUtilizado, totalPago, totalLancamentos: 0, totalSaldo };
  }, [resumoPorMuseu]);

  const percentualGeral = totaisGerais.totalOrcado > 0 ? (totaisGerais.totalUtilizado / totaisGerais.totalOrcado) * 100 : 0;

  const refreshAllRubricaData = async () => {
    await Promise.all([refetchRubricas(), refetchCompras()]);
    setRefreshNonce((prev) => prev + 1);
  };

  // Diagnóstico e correção automáticos — roda silenciosamente ao carregar dados
  useEffect(() => {
    base44.functions.invoke('diagnosticarCorrigirNoturno', { confirmar: true }).catch(() => {});
  }, []);


  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight flex items-center gap-2"><TrendingUp className="w-6 h-6 text-black" />Orçamento por Museu e Noturno</h1>
            <p className="text-gray-500 mt-1 text-sm">Dados sincronizados com rubricas específicas por centro de custo — excl. equipe/produção/educadores/coordenadores.</p>
          </div>
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" className="gap-2 border-gray-200 text-black hover:bg-gray-50 rounded-xl" onClick={() => setShowNovaRubrica(true)}><Plus className="w-4 h-4" />Nova Rubrica</Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Execução geral" value={fmtPct(percentualGeral)} helper="utilizado sobre previsto" dark />
          <KpiCard label="Previsto" value={fmt(totaisGerais.totalOrcado)} helper="soma real dos museus" />
          <KpiCard label="Utilizado" value={fmt(totaisGerais.totalUtilizado)} helper="rubricas específicas por museu" />
          <KpiCard label="Saldo" value={fmt(totaisGerais.totalSaldo)} helper="saldo disponível" />
        </div>

        {/* Orçamento por grupo */}
        <OrcamentoPorGrupoSection
          rubricas={Array.isArray(rubricasBanco) ? rubricasBanco : []}
          compras={Array.isArray(comprasAprovadas) ? comprasAprovadas : []}
          onUpdated={refreshAllRubricaData}
        />

        {/* Banner informativo */}
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <Database className="w-3 h-3 text-blue-600" />
          <span>Saldos calculados diretamente das compras aprovadas por rubrica_id — todos os aditivos e centros de custo.</span>
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
                  <button key={item.museu} onClick={() => setMuseuAtivo(item.museu)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${museuAtivo === item.museu ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
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

        {/* Cards de Centros de Custo Transversais */}
        <CentrosCustoCards />

        {/* Card específico do 4º Aditivo — Noturno Pampulha */}
        <NoturnoPampulhaCard isCoordenador={isCoordenador} />

        <GerenciarRubricasMuseuDialog open={showGerenciar} onClose={() => setShowGerenciar(false)} />
        <NovaRubricaDialog open={showNovaRubrica} currentUser={currentUser}
          onClose={async () => { setShowNovaRubrica(false); await refreshAllRubricaData(); }} />
      </div>
    </div>
  );
}