import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Wallet,
  TrendingUp,
  Calculator,
  Building2,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCentro(value) {
  const raw = normalizeString(value);

  if (!raw) return '';
  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';
  if (raw === 'geral') return 'Geral';
  if (raw === 'publicacoes') return 'Publicações';
  if (raw === 'noturno nos museus 2026') return 'Noturno nos Museus 2026';
  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';

  return String(value || '').trim();
}

function percentualSeguro(utilizado, previsto) {
  const vPrev = toNumber(previsto);
  const vUtil = toNumber(utilizado);
  return vPrev > 0 ? (vUtil / vPrev) * 100 : 0;
}

function getDetalhamentoMuseus(rubrica) {
  if (Array.isArray(rubrica?.detalhamento_por_museu)) {
    return rubrica.detalhamento_por_museu;
  }

  if (Array.isArray(rubrica?.distribuicao_por_museu)) {
    return rubrica.distribuicao_por_museu;
  }

  return [];
}

function hasMuseuMatch(rubrica, museuFilter) {
  if (museuFilter === 'all') return true;

  const centroRubrica = normalizeCentro(rubrica?.centro_custo);
  if (centroRubrica === museuFilter) return true;

  return getDetalhamentoMuseus(rubrica).some((item) => {
    if (normalizeCentro(item?.museu) !== museuFilter) return false;

    return (
      toNumber(item?.valor_planejado) > 0 ||
      toNumber(item?.valor_utilizado) > 0 ||
      toNumber(item?.valor_pago) > 0 ||
      toNumber(item?.valor_comprometido) > 0 ||
      toNumber(item?.valor_lancamentos) > 0 ||
      toNumber(item?.saldo) !== 0
    );
  });
}

export default function RubricasGrid({
  rubricas = [],
  onSelectRubrica,
  onRefresh,
  isCoordenador = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [museuFilter, setMuseuFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [recalculando, setRecalculando] = useState(false);

  const rubricasAtivas = useMemo(
    () => (rubricas || []).filter((r) => r?.ativo !== false),
    [rubricas]
  );

  const grupos = useMemo(() => {
    const unicos = new Set(
      rubricasAtivas.map((r) => String(r?.grupo || 'Sem grupo').trim())
    );
    return Array.from(unicos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rubricasAtivas]);

  const museusDisponiveis = useMemo(() => {
    const museus = new Set();

    rubricasAtivas.forEach((rubrica) => {
      const centroRubrica = normalizeCentro(rubrica?.centro_custo);
      if (centroRubrica) museus.add(centroRubrica);

      getDetalhamentoMuseus(rubrica).forEach((item) => {
        const museu = normalizeCentro(item?.museu);
        if (museu) museus.add(museu);
      });
    });

    return Array.from(museus).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rubricasAtivas]);

  const filtradas = useMemo(() => {
    return rubricasAtivas.filter((r) => {
      const matchGrupo =
        groupFilter === 'all' || String(r?.grupo || 'Sem grupo') === groupFilter;

      const texto = `${r?.rubrica || ''} ${r?.grupo || ''} ${r?.codigo || ''} ${
        r?.centro_custo || ''
      }`.toLowerCase();

      const matchBusca =
        !searchTerm || texto.includes(searchTerm.trim().toLowerCase());

      const matchMuseu = hasMuseuMatch(r, museuFilter);

      return matchGrupo && matchBusca && matchMuseu;
    });
  }, [rubricasAtivas, groupFilter, searchTerm, museuFilter]);

  const agrupadas = useMemo(() => {
    const mapa = {};
    for (const rubrica of filtradas) {
      const grupo = String(rubrica?.grupo || 'Sem grupo').trim();
      if (!mapa[grupo]) mapa[grupo] = [];
      mapa[grupo].push(rubrica);
    }
    return Object.fromEntries(
      Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    );
  }, [filtradas]);

  const resumo = useMemo(() => {
    if (museuFilter !== 'all') {
      const rubricasDoMuseu = rubricasAtivas.filter((rubrica) =>
        hasMuseuMatch(rubrica, museuFilter)
      );

      const detalhesFiltrados = rubricasAtivas.flatMap((rubrica) =>
        getDetalhamentoMuseus(rubrica).filter(
          (item) => normalizeCentro(item?.museu) === museuFilter
        )
      );

      const totalRubricas = rubricasDoMuseu.length;

      // Fonte de verdade do previsto geral continua sendo valor_rubrica.
      // No filtro por museu, usa valor_planejado só quando existir detalhamento;
      // se não existir, e a rubrica pertencer diretamente ao centro filtrado,
      // usa valor_rubrica da própria rubrica.
      const totalPrevistoDetalhado = detalhesFiltrados.reduce(
        (sum, item) => sum + toNumber(item?.valor_planejado),
        0
      );

      const totalPrevistoDireto = rubricasDoMuseu.reduce((sum, rubrica) => {
        const detalhes = getDetalhamentoMuseus(rubrica).filter(
          (item) => normalizeCentro(item?.museu) === museuFilter
        );

        if (detalhes.length > 0) return sum;

        const centroRubrica = normalizeCentro(rubrica?.centro_custo);
        if (centroRubrica === museuFilter) {
          return sum + toNumber(rubrica?.valor_rubrica);
        }

        return sum;
      }, 0);

      const totalPrevisto = totalPrevistoDetalhado + totalPrevistoDireto;

      const totalUtilizado = rubricasDoMuseu.reduce((sum, rubrica) => {
        const detalhes = getDetalhamentoMuseus(rubrica).filter(
          (item) => normalizeCentro(item?.museu) === museuFilter
        );

        if (detalhes.length > 0) {
          return (
            sum +
            detalhes.reduce(
              (sub, item) => sub + toNumber(item?.valor_utilizado),
              0
            )
          );
        }

        const centroRubrica = normalizeCentro(rubrica?.centro_custo);
        if (centroRubrica === museuFilter) {
          return sum + toNumber(rubrica?.valor_utilizado);
        }

        return sum;
      }, 0);

      const saldoTotal = rubricasDoMuseu.reduce((sum, rubrica) => {
        const detalhes = getDetalhamentoMuseus(rubrica).filter(
          (item) => normalizeCentro(item?.museu) === museuFilter
        );

        if (detalhes.length > 0) {
          return (
            sum +
            detalhes.reduce((sub, item) => sub + toNumber(item?.saldo), 0)
          );
        }

        const centroRubrica = normalizeCentro(rubrica?.centro_custo);
        if (centroRubrica === museuFilter) {
          return sum + toNumber(rubrica?.saldo);
        }

        return sum;
      }, 0);

      const percentualGeral =
        totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0;

      return {
        totalRubricas,
        totalPrevisto,
        totalUtilizado,
        saldoTotal,
        percentualGeral,
      };
    }

    // No modo geral, SEMPRE usar valor_rubrica como fonte de verdade.
    const totalRubricas = rubricasAtivas.length;
    const totalPrevisto = rubricasAtivas.reduce(
      (sum, r) => sum + toNumber(r?.valor_rubrica),
      0
    );
    const totalUtilizado = rubricasAtivas.reduce(
      (sum, r) => sum + toNumber(r?.valor_utilizado),
      0
    );
    const saldoTotal = rubricasAtivas.reduce(
      (sum, r) => sum + toNumber(r?.saldo),
      0
    );
    const percentualGeral =
      totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0;

    return {
      totalRubricas,
      totalPrevisto,
      totalUtilizado,
      saldoTotal,
      percentualGeral,
    };
  }, [rubricasAtivas, museuFilter]);

  async function handleRecalcular() {
    setRecalculando(true);
    try {
      const res = await base44.functions.invoke('recalculateAllRubricas', {});
      const payload = res?.data || res;

      if (!payload?.success) {
        throw new Error(payload?.error || 'Falha ao recalcular rubricas');
      }

      toast.success('Rubricas recalculadas com sucesso');
      await onRefresh?.();
    } catch (error) {
      toast.error(`Erro ao recalcular: ${error.message}`);
    } finally {
      setRecalculando(false);
    }
  }

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">
              {museuFilter === 'all'
                ? 'Total de Rubricas'
                : `Rubricas em ${museuFilter}`}
            </p>
            <p className="mt-1 text-2xl font-bold text-black">
              {resumo.totalRubricas}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">
              {museuFilter === 'all' ? 'Total Previsto' : `Previsto em ${museuFilter}`}
            </p>
            <p className="mt-1 text-xl font-bold text-black">
              R$ {moeda(resumo.totalPrevisto)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">
              {museuFilter === 'all'
                ? 'Total Utilizado'
                : `Utilizado em ${museuFilter}`}
            </p>
            <p className="mt-1 text-xl font-bold text-blue-700">
              R$ {moeda(resumo.totalUtilizado)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">
              {museuFilter === 'all' ? 'Saldo Total' : `Saldo em ${museuFilter}`}
            </p>
            <p
              className={`mt-1 text-xl font-bold ${
                resumo.saldoTotal < 0 ? 'text-red-700' : 'text-green-700'
              }`}
            >
              R$ {moeda(resumo.saldoTotal)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">% Geral Utilizado</p>
            <p className="mt-1 text-2xl font-bold text-black">
              {resumo.percentualGeral.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar rubrica..."
              className="pl-9"
            />
          </div>

          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Filtrar por grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {grupos.map((grupo) => (
                <SelectItem key={grupo} value={grupo}>
                  {grupo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={museuFilter} onValueChange={setMuseuFilter}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Filtrar por museu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os museus/centros</SelectItem>
              {museusDisponiveis.map((museu) => (
                <SelectItem key={museu} value={museu}>
                  {museu}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCoordenador && (
          <Button
            onClick={handleRecalcular}
            disabled={recalculando}
            className="bg-black text-white hover:bg-gray-800"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${recalculando ? 'animate-spin' : ''}`}
            />
            Recalcular rubricas
          </Button>
        )}
      </div>

      {Object.keys(agrupadas).length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-gray-400">Nenhuma rubrica encontrada</p>
        </div>
      ) : (
        Object.entries(agrupadas).map(([grupo, itens]) => (
          <div key={grupo} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-black">{grupo}</h2>
              <span className="text-xs text-gray-500">
                {itens.length} rubrica(s)
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {itens.map((rubrica) => {
                const detalhesMuseu = getDetalhamentoMuseus(rubrica);
                const detalhesFiltradosMuseu =
                  museuFilter === 'all'
                    ? detalhesMuseu
                    : detalhesMuseu.filter(
                        (item) => normalizeCentro(item?.museu) === museuFilter
                      );

                const centroRubrica = normalizeCentro(rubrica?.centro_custo);
                const usarDetalhamento = museuFilter !== 'all' && detalhesFiltradosMuseu.length > 0;
                const usarValoresDiretosDoCentro =
                  museuFilter !== 'all' &&
                  detalhesFiltradosMuseu.length === 0 &&
                  centroRubrica === museuFilter;

                const valorRubrica =
                  museuFilter === 'all'
                    ? toNumber(rubrica?.valor_rubrica)
                    : usarDetalhamento
                    ? detalhesFiltradosMuseu.reduce(
                        (sum, item) => sum + toNumber(item?.valor_planejado),
                        0
                      )
                    : usarValoresDiretosDoCentro
                    ? toNumber(rubrica?.valor_rubrica)
                    : 0;

                const valorUtilizado =
                  museuFilter === 'all'
                    ? toNumber(rubrica?.valor_utilizado)
                    : usarDetalhamento
                    ? detalhesFiltradosMuseu.reduce(
                        (sum, item) => sum + toNumber(item?.valor_utilizado),
                        0
                      )
                    : usarValoresDiretosDoCentro
                    ? toNumber(rubrica?.valor_utilizado)
                    : 0;

                const saldo =
                  museuFilter === 'all'
                    ? toNumber(rubrica?.saldo)
                    : usarDetalhamento
                    ? detalhesFiltradosMuseu.reduce(
                        (sum, item) => sum + toNumber(item?.saldo),
                        0
                      )
                    : usarValoresDiretosDoCentro
                    ? toNumber(rubrica?.saldo)
                    : 0;

                const percentual = percentualSeguro(valorUtilizado, valorRubrica);
                const alerta = saldo < 0 || percentual >= 80;
                const isExpanded = !!expanded[rubrica.id];

                return (
                  <Card
                    key={rubrica.id}
                    className={`rounded-2xl border-2 transition-all ${
                      saldo < 0
                        ? 'border-red-300 bg-red-50/30'
                        : percentual >= 80
                        ? 'border-yellow-300 bg-yellow-50/30'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onSelectRubrica?.(rubrica)}
                            className="text-left"
                          >
                            <h3 className="text-sm font-bold text-black hover:underline">
                              {rubrica?.rubrica || 'Sem nome'}
                            </h3>
                          </button>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            {rubrica?.codigo && <span>{rubrica.codigo}</span>}
                            {rubrica?.centro_custo && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
                                <Building2 className="h-3 w-3" />
                                {rubrica.centro_custo}
                              </span>
                            )}
                            {rubrica?.distribuicao_mode &&
                              rubrica.distribuicao_mode !== 'global_only' && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">
                                  {rubrica.distribuicao_mode === 'equal_split'
                                    ? 'Rateio igual'
                                    : rubrica.distribuicao_mode === 'explicit'
                                    ? 'Distribuição explícita'
                                    : rubrica.distribuicao_mode === 'single_museu'
                                    ? 'Museu único'
                                    : 'Distribuição'}
                                </span>
                              )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {alerta && <AlertCircle className="h-4 w-4 text-red-600" />}
                          <span
                            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                              percentual >= 80
                                ? 'bg-red-100 text-red-700'
                                : percentual >= 50
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {percentual.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            {museuFilter === 'all' ? 'Previsto' : `Previsto ${museuFilter}`}
                          </p>
                          <p className="mt-1 text-sm font-bold text-black">
                            R$ {moeda(valorRubrica)}
                          </p>
                        </div>

                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                            Utilizado
                          </p>
                          <p className="mt-1 text-sm font-bold text-blue-700">
                            R$ {moeda(valorUtilizado)}
                          </p>
                        </div>

                        <div
                          className={`rounded-lg border p-3 ${
                            saldo < 0
                              ? 'border-red-100 bg-red-50'
                              : 'border-green-100 bg-green-50'
                          }`}
                        >
                          <p
                            className={`text-[10px] font-semibold uppercase tracking-wide ${
                              saldo < 0 ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            Saldo
                          </p>
                          <p
                            className={`mt-1 text-sm font-bold ${
                              saldo < 0 ? 'text-red-700' : 'text-green-700'
                            }`}
                          >
                            R$ {moeda(saldo)}
                          </p>
                        </div>

                        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600">
                            Disponível
                          </p>
                          <p className="mt-1 text-sm font-bold text-purple-700">
                            {valorRubrica > 0 && saldo > 0
                              ? `${((saldo / valorRubrica) * 100).toFixed(1)}%`
                              : '0.0%'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="h-3 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full transition-all ${
                              percentual >= 80
                                ? 'bg-red-500'
                                : percentual >= 50
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(percentual, 100)}%` }}
                          />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="space-y-3 border-t border-gray-200 pt-4">
                          <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="mb-1 flex items-center gap-2 text-gray-600">
                                <Calculator className="h-3.5 w-3.5" />
                                <span className="font-medium">Percentual</span>
                              </div>
                              <p className="font-bold text-black">
                                {percentual.toFixed(2)}%
                              </p>
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="mb-1 flex items-center gap-2 text-gray-600">
                                <TrendingUp className="h-3.5 w-3.5" />
                                <span className="font-medium">Grupo</span>
                              </div>
                              <p className="font-bold text-black">
                                {rubrica?.grupo || 'Sem grupo'}
                              </p>
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="mb-1 flex items-center gap-2 text-gray-600">
                                <Wallet className="h-3.5 w-3.5" />
                                <span className="font-medium">Status</span>
                              </div>
                              <p
                                className={`font-bold ${
                                  rubrica?.ativo === false
                                    ? 'text-red-700'
                                    : 'text-green-700'
                                }`}
                              >
                                {rubrica?.ativo === false ? 'Inativa' : 'Ativa'}
                              </p>
                            </div>
                          </div>

                          {detalhesFiltradosMuseu.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Saldos por museu
                              </div>

                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                {detalhesFiltradosMuseu.map((item) => {
                                  const previstoMuseu = toNumber(item?.valor_planejado);
                                  const utilizadoMuseu = toNumber(item?.valor_utilizado);
                                  const saldoMuseu = toNumber(item?.saldo);
                                  const percentualMuseu = percentualSeguro(
                                    utilizadoMuseu,
                                    previstoMuseu
                                  );

                                  return (
                                    <div
                                      key={`${rubrica.id}-${item?.museu}`}
                                      className="rounded-xl border border-gray-200 bg-gray-50 p-3"
                                    >
                                      <div className="mb-2 flex items-center justify-between">
                                        <div className="font-semibold text-black">
                                          {item?.museu || 'Sem museu'}
                                        </div>
                                        <span
                                          className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                            percentualMuseu >= 80
                                              ? 'bg-red-100 text-red-700'
                                              : percentualMuseu >= 50
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : 'bg-green-100 text-green-700'
                                          }`}
                                        >
                                          {percentualMuseu.toFixed(1)}%
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <p className="text-gray-500">Planejado</p>
                                          <p className="font-bold text-black">
                                            R$ {moeda(previstoMuseu)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-gray-500">Utilizado</p>
                                          <p className="font-bold text-blue-700">
                                            R$ {moeda(utilizadoMuseu)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-gray-500">Saldo</p>
                                          <p
                                            className={`font-bold ${
                                              saldoMuseu < 0
                                                ? 'text-red-700'
                                                : 'text-green-700'
                                            }`}
                                          >
                                            R$ {moeda(saldoMuseu)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-gray-500">Comprometido</p>
                                          <p className="font-bold text-amber-700">
                                            R$ {moeda(item?.valor_comprometido)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-gray-500">Pago</p>
                                          <p className="font-bold text-slate-700">
                                            R$ {moeda(item?.valor_pago)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-gray-500">Lançamentos</p>
                                          <p className="font-bold text-purple-700">
                                            R$ {moeda(item?.valor_lancamentos)}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                        <button
                          type="button"
                          onClick={() => toggleExpand(rubrica.id)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              Ocultar detalhes
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
                              Ver detalhes
                            </>
                          )}
                        </button>

                        {onSelectRubrica && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onSelectRubrica(rubrica)}
                          >
                            Detalhe
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}