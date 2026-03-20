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

export default function RubricasGrid({
  rubricas = [],
  onSelectRubrica,
  onRefresh,
  isCoordenador = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [recalculando, setRecalculando] = useState(false);

  const rubricasNormalizadas = useMemo(() => {
    if (!Array.isArray(rubricas)) return [];

    return rubricas
      .filter(Boolean)
      .map((r, index) => ({
        id: r?.id || `rubrica-${index}`,
        rubrica: r?.rubrica || r?.nome || 'Sem nome',
        grupo: r?.grupo || 'Sem grupo',
        codigo: r?.codigo || '',
        ativo: r?.ativo,
        valor_rubrica: toNumber(r?.valor_rubrica),
        valor_utilizado: toNumber(r?.valor_utilizado),
        saldo:
          r?.saldo !== undefined && r?.saldo !== null
            ? toNumber(r?.saldo)
            : toNumber(r?.valor_rubrica) - toNumber(r?.valor_utilizado),
      }));
  }, [rubricas]);

  const rubricasVisiveis = useMemo(() => {
    // mais seguro: só oculta se vier explicitamente false
    return rubricasNormalizadas.filter((r) => r.ativo !== false);
  }, [rubricasNormalizadas]);

  const grupos = useMemo(() => {
    const unicos = new Set(
      rubricasVisiveis.map((r) => String(r.grupo || 'Sem grupo').trim())
    );
    return Array.from(unicos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rubricasVisiveis]);

  const filtradas = useMemo(() => {
    return rubricasVisiveis.filter((r) => {
      const matchGrupo =
        groupFilter === 'all' || String(r.grupo || 'Sem grupo') === groupFilter;

      const texto =
        `${r.rubrica || ''} ${r.grupo || ''} ${r.codigo || ''}`.toLowerCase();

      const matchBusca =
        !searchTerm || texto.includes(searchTerm.trim().toLowerCase());

      return matchGrupo && matchBusca;
    });
  }, [rubricasVisiveis, groupFilter, searchTerm]);

  const agrupadas = useMemo(() => {
    const mapa = {};

    for (const rubrica of filtradas) {
      const grupo = String(rubrica.grupo || 'Sem grupo').trim();
      if (!mapa[grupo]) mapa[grupo] = [];
      mapa[grupo].push(rubrica);
    }

    return Object.fromEntries(
      Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    );
  }, [filtradas]);

  const resumo = useMemo(() => {
    const totalRubricas = rubricasVisiveis.length;
    const totalPrevisto = rubricasVisiveis.reduce(
      (sum, r) => sum + toNumber(r.valor_rubrica),
      0
    );
    const totalUtilizado = rubricasVisiveis.reduce(
      (sum, r) => sum + toNumber(r.valor_utilizado),
      0
    );
    const saldoTotal = rubricasVisiveis.reduce(
      (sum, r) => sum + toNumber(r.saldo),
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
  }, [rubricasVisiveis]);

  async function handleRecalcular() {
    setRecalculando(true);
    try {
      const res = await base44.functions.invoke('recalcularRubricas3Aditivo', {});
      const payload = res?.data || res;

      if (!payload?.success) {
        throw new Error(payload?.error || 'Falha ao recalcular rubricas');
      }

      toast.success('Rubricas recalculadas com sucesso');
      if (onRefresh) await onRefresh();
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total de Rubricas</p>
            <p className="text-2xl font-bold text-black mt-1">{resumo.totalRubricas}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Previsto</p>
            <p className="text-xl font-bold text-black mt-1">
              R$ {moeda(resumo.totalPrevisto)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Utilizado</p>
            <p className="text-xl font-bold text-blue-700 mt-1">
              R$ {moeda(resumo.totalUtilizado)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Saldo Total</p>
            <p
              className={`text-xl font-bold mt-1 ${
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
            <p className="text-2xl font-bold text-black mt-1">
              {resumo.percentualGeral.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
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
        </div>

        {isCoordenador && (
          <Button
            onClick={handleRecalcular}
            disabled={recalculando}
            className="bg-black hover:bg-gray-800 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculando ? 'animate-spin' : ''}`} />
            Recalcular rubricas
          </Button>
        )}
      </div>

      {rubricasNormalizadas.length === 0 ? (
        <div className="border-2 border-dashed border-red-200 bg-red-50 rounded-2xl p-12 text-center">
          <p className="text-red-700 font-medium">Nenhuma rubrica recebida pela tela</p>
          <p className="text-red-600 text-sm mt-2">
            O problema agora está na query da página Compras.jsx ou na function listAllRubricas.
          </p>
        </div>
      ) : Object.keys(agrupadas).length === 0 ? (
        <div className="border-2 border-dashed border-yellow-200 bg-yellow-50 rounded-2xl p-12 text-center">
          <p className="text-yellow-700 font-medium">As rubricas chegaram, mas foram filtradas.</p>
          <p className="text-yellow-600 text-sm mt-2">
            Revise grupo, busca e campo ativo.
          </p>
        </div>
      ) : (
        Object.entries(agrupadas).map(([grupo, itens]) => (
          <div key={grupo} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-black">{grupo}</h2>
              <span className="text-xs text-gray-500">{itens.length} rubrica(s)</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {itens.map((rubrica) => {
                const valorRubrica = toNumber(rubrica.valor_rubrica);
                const valorUtilizado = toNumber(rubrica.valor_utilizado);
                const saldo = toNumber(rubrica.saldo);
                const percentual =
                  valorRubrica > 0 ? (valorUtilizado / valorRubrica) * 100 : 0;
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
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => onSelectRubrica?.(rubrica)}
                            className="text-left"
                          >
                            <h3 className="font-bold text-black text-sm hover:underline">
                              {rubrica.rubrica}
                            </h3>
                          </button>

                          {rubrica.codigo && (
                            <p className="text-xs text-gray-500 mt-1">{rubrica.codigo}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {alerta && <AlertCircle className="w-4 h-4 text-red-600" />}
                          <span
                            className={`text-xs font-bold px-3 py-1.5 rounded-full ${
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
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">
                            Previsto
                          </p>
                          <p className="text-sm font-bold text-black mt-1">
                            R$ {moeda(valorRubrica)}
                          </p>
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                          <p className="text-[10px] text-blue-600 uppercase font-semibold tracking-wide">
                            Utilizado
                          </p>
                          <p className="text-sm font-bold text-blue-700 mt-1">
                            R$ {moeda(valorUtilizado)}
                          </p>
                        </div>

                        <div
                          className={`p-3 rounded-lg border ${
                            saldo < 0
                              ? 'bg-red-50 border-red-100'
                              : 'bg-green-50 border-green-100'
                          }`}
                        >
                          <p
                            className={`text-[10px] uppercase font-semibold tracking-wide ${
                              saldo < 0 ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            Saldo
                          </p>
                          <p
                            className={`text-sm font-bold mt-1 ${
                              saldo < 0 ? 'text-red-700' : 'text-green-700'
                            }`}
                          >
                            R$ {moeda(saldo)}
                          </p>
                        </div>

                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                          <p className="text-[10px] text-purple-600 uppercase font-semibold tracking-wide">
                            Disponível
                          </p>
                          <p className="text-sm font-bold text-purple-700 mt-1">
                            {valorRubrica > 0 && saldo > 0
                              ? `${((saldo / valorRubrica) * 100).toFixed(1)}%`
                              : '0.0%'}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
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
                        <div className="pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                              <Calculator className="w-3.5 h-3.5" />
                              <span className="font-medium">Percentual</span>
                            </div>
                            <p className="font-bold text-black">{percentual.toFixed(2)}%</p>
                          </div>

                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span className="font-medium">Grupo</span>
                            </div>
                            <p className="font-bold text-black">{rubrica.grupo || 'Sem grupo'}</p>
                          </div>

                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-gray-600 mb-1">
                              <Wallet className="w-3.5 h-3.5" />
                              <span className="font-medium">Status</span>
                            </div>
                            <p
                              className={`font-bold ${
                                rubrica.ativo === false ? 'text-red-700' : 'text-green-700'
                              }`}
                            >
                              {rubrica.ativo === false ? 'Inativa' : 'Ativa'}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => toggleExpand(rubrica.id)}
                          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              Ocultar detalhes
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
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