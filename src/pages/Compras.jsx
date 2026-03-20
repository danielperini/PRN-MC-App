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
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function RubricasGrid({
  rubricas = [],
  onSelectRubrica,
  onRefresh,
  isCoordenador,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [expandedCards, setExpandedCards] = useState({});
  const [recalculando, setRecalculando] = useState(false);

  const rubricasAtivas = useMemo(() => {
    return (rubricas || []).filter(r => r.ativo !== false);
  }, [rubricas]);

  const grupos = useMemo(() => {
    const unicos = new Set(
      rubricasAtivas.map(r => String(r.grupo || 'Sem grupo'))
    );
    return Array.from(unicos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rubricasAtivas]);

  const filtradas = useMemo(() => {
    return rubricasAtivas.filter(r => {
      const matchGrupo =
        groupFilter === 'all' || String(r.grupo || 'Sem grupo') === groupFilter;

      const texto = `${r.rubrica || ''} ${r.grupo || ''} ${r.codigo || ''}`.toLowerCase();
      const matchBusca =
        !searchTerm || texto.includes(searchTerm.trim().toLowerCase());

      return matchGrupo && matchBusca;
    });
  }, [rubricasAtivas, groupFilter, searchTerm]);

  const agrupadas = useMemo(() => {
    const gruposMap = {};

    filtradas.forEach(r => {
      const grupo = String(r.grupo || 'Sem grupo');
      if (!gruposMap[grupo]) gruposMap[grupo] = [];
      gruposMap[grupo].push(r);
    });

    return Object.entries(gruposMap).sort((a, b) =>
      a[0].localeCompare(b[0], 'pt-BR')
    );
  }, [filtradas]);

  const resumo = useMemo(() => {
    const totalRubricas = rubricasAtivas.length;
    const totalPrevisto = rubricasAtivas.reduce(
      (sum, r) => sum + toNumber(r.valor_rubrica),
      0
    );
    const totalUtilizado = rubricasAtivas.reduce(
      (sum, r) => sum + toNumber(r.valor_utilizado),
      0
    );
    const saldoTotal = rubricasAtivas.reduce(
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
  }, [rubricasAtivas]);

  const toggleCard = (id) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRecalcular = async () => {
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
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total de Rubricas</p>
            <p className="text-2xl font-bold">{resumo.totalRubricas}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Previsto</p>
            <p className="text-xl font-bold">R$ {formatMoney(resumo.totalPrevisto)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Utilizado</p>
            <p className="text-xl font-bold text-blue-700">R$ {formatMoney(resumo.totalUtilizado)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Saldo Total</p>
            <p className={`text-xl font-bold ${resumo.saldoTotal < 0 ? 'text-red-700' : 'text-green-700'}`}>
              R$ {formatMoney(resumo.saldoTotal)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">% Geral Utilizado</p>
            <p className="text-2xl font-bold">{resumo.percentualGeral.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar rubrica..."
              className="pl-9"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Filtrar por grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {grupos.map(grupo => (
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
            className="bg-black text-white hover:bg-gray-800"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculando ? 'animate-spin' : ''}`} />
            Recalcular rubricas
          </Button>
        )}
      </div>

      {agrupadas.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">Nenhuma rubrica encontrada</p>
        </div>
      ) : (
        agrupadas.map(([grupo, itens]) => (
          <div key={grupo} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-black">{grupo}</h2>
              <span className="text-xs text-gray-500">{itens.length} rubrica(s)</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {itens.map(r => {
                const valorRubrica = toNumber(r.valor_rubrica);
                const valorUtilizado = toNumber(r.valor_utilizado);
                const saldo = toNumber(r.saldo);
                const percentual =
                  valorRubrica > 0 ? (valorUtilizado / valorRubrica) * 100 : 0;
                const isExpanded = !!expandedCards[r.id];
                const temAlerta = saldo < 0 || percentual >= 80;

                return (
                  <Card
                    key={r.id}
                    className={`border-2 ${
                      saldo < 0
                        ? 'border-red-300 bg-red-50/30'
                        : percentual >= 80
                        ? 'border-yellow-300 bg-yellow-50/30'
                        : 'border-gray-200'
                    }`}
                  >
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <button
                            type="button"
                            onClick={() => onSelectRubrica && onSelectRubrica(r)}
                            className="text-left"
                          >
                            <h3 className="font-bold text-black text-sm hover:underline">
                              {r.rubrica}
                            </h3>
                          </button>
                          {r.codigo && (
                            <p className="text-xs text-gray-500 mt-1">{r.codigo}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {temAlerta && <AlertCircle className="w-4 h-4 text-red-600" />}
                          <div
                            className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                              percentual >= 80
                                ? 'bg-red-100 text-red-700'
                                : percentual >= 50
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {percentual.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-[10px] text-gray-500 uppercase font-semibold">Previsto</p>
                          <p className="text-sm font-bold mt-1">R$ {formatMoney(valorRubrica)}</p>
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                          <p className="text-[10px] text-blue-600 uppercase font-semibold">Utilizado</p>
                          <p className="text-sm font-bold text-blue-700 mt-1">
                            R$ {formatMoney(valorUtilizado)}
                          </p>
                        </div>

                        <div className={`p-3 rounded-lg border ${saldo < 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                          <p className={`text-[10px] uppercase font-semibold ${saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            Saldo
                          </p>
                          <p className={`text-sm font-bold mt-1 ${saldo < 0 ? 'text-red-700' : 'text-green-700'}`}>
                            R$ {formatMoney(saldo)}
                          </p>
                        </div>

                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                          <p className="text-[10px] text-purple-600 uppercase font-semibold">Disponível</p>
                          <p className="text-sm font-bold text-purple-700 mt-1">
                            {valorRubrica > 0 && saldo > 0
                              ? `${((saldo / valorRubrica) * 100).toFixed(1)}%`
                              : '0.0%'}
                          </p>
                        </div>
                      </div>

                      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            percentual >= 80
                              ? 'bg-red-500'
                              : percentual >= 50
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(percentual, 100)}%` }}
                        />
                      </div>

                      {isExpanded && (
                        <div className="pt-4 border-t border-gray-200">
                          <p className="text-xs text-gray-600">
                            Grupo: <strong>{r.grupo || 'Sem grupo'}</strong>
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            Status: <strong>{r.ativo === false ? 'Inativa' : 'Ativa'}</strong>
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => toggleCard(r.id)}
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
                            onClick={() => onSelectRubrica(r)}
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