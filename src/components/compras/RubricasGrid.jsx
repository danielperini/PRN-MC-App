import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, TrendingUp, ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBudgetLines } from './useBudgetLines';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function RubricasGrid({ purchases, filtroMuseu }) {
  const { budgetLines } = useBudgetLines();
  
  // Fetch rubricas e configs se filtroMuseu for fornecido
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 200),
    enabled: !!filtroMuseu,
  });
  
  const { data: configs = [] } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: () => base44.entities.RubricaMuseuConfig.list(),
    enabled: !!filtroMuseu,
  });
  
  // Se filtroMuseu foi fornecido, usar rubricas filtradas, senão usar budgetLines
  const linhasAUsar = useMemo(() => {
    if (!filtroMuseu) return budgetLines;
    
    // Filtrar rubricas por museu através das configs
    const rubricasDoMuseu = new Set();
    configs
      .filter(c => c.museu === filtroMuseu)
      .forEach(c => rubricasDoMuseu.add(c.rubrica_id));
    
    return rubricas.filter(r => rubricasDoMuseu.has(r.id) && r.ativo !== false);
  }, [budgetLines, filtroMuseu, rubricas, configs]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setategoryFilter] = useState('all');
  const [expandedCards, setExpandedCards] = useState({});

  // Agrupar por categoria
  const categorias = useMemo(() => {
    const grupos = {};
    budgetLines.forEach(line => {
      if (!grupos[line.categoria]) grupos[line.categoria] = [];
      grupos[line.categoria].push(line);
    });
    return grupos;
  }, [budgetLines]);

  // Filtrar
  const filtered = useMemo(() => {
    const result = {};
    Object.entries(categorias).forEach(([cat, lines]) => {
      if (categoryFilter !== 'all' && cat !== categoryFilter) return;
      const filtered = lines.filter(line =>
        !searchTerm || line.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
        line.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filtered.length) result[cat] = filtered;
    });
    return result;
  }, [categorias, searchTerm, categoryFilter]);

  // Calcular valores detalhados por rubrica
  const getValoresRubrica = (rubricaId) => {
    const comprasAprovadas = purchases.filter(p => p.budgetline_id === rubricaId && p.status === 'APROVADO_COORD');
    const comprasPagas = purchases.filter(p => p.budgetline_id === rubricaId && p.status === 'PAGO');
    const comprasEmAnalise = purchases.filter(p => p.budgetline_id === rubricaId && p.status === 'SOLICITADO');
    
    const valorAprovado = comprasAprovadas.reduce((sum, p) => sum + (p.valor_total || 0), 0);
    const valorPago = comprasPagas.reduce((sum, p) => sum + (p.valor_total || 0), 0);
    const valorEmAnalise = comprasEmAnalise.reduce((sum, p) => sum + (p.valor_total || 0), 0);
    const valorUtilizado = valorAprovado + valorPago;
    
    return {
      valorAprovado,
      valorPago,
      valorEmAnalise,
      valorUtilizado,
      quantidadeAprovada: comprasAprovadas.length,
      quantidadePaga: comprasPagas.length,
      quantidadeEmAnalise: comprasEmAnalise.length,
    };
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar rubrica..."
            className="pl-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setategoryFilter}>
          <SelectTrigger className="w-full md:w-56">
            <SelectValue placeholder="Filtrar por categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {Object.keys(categorias).sort().map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cards por categoria */}
      {Object.entries(filtered).map(([categoria, lines]) => (
        <div key={categoria}>
          <h2 className="text-lg font-bold text-black mb-4">{categoria}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lines.map(line => {
              const valores = getValoresRubrica(line.id);
              const saldo = line.valor_total - valores.valorUtilizado;
              const percentualUtilizado = line.valor_total > 0 ? (valores.valorUtilizado / line.valor_total * 100).toFixed(2) : 0;
              const isExpanded = expandedCards[line.id];
              const temAlerta = percentualUtilizado > 80 || saldo < 0;

              return (
                <Card 
                  key={line.id} 
                  className={`border-2 transition-all cursor-pointer ${
                    temAlerta ? 'border-red-300 bg-red-50/30' :
                    percentualUtilizado > 50 ? 'border-yellow-300 bg-yellow-50/30' :
                    'border-gray-200 bg-white'
                  } hover:shadow-lg`}
                  onClick={() => setExpandedCards(prev => ({ ...prev, [line.id]: !prev[line.id] }))}
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Header com Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-black text-sm">{line.nome}</h3>
                        <p className="text-xs text-gray-500 mt-1">{line.codigo}</p>
                      </div>
                      <div className="flex gap-2">
                        {temAlerta && <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                        <div className={`text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 ${
                          percentualUtilizado > 80 ? 'bg-red-100 text-red-700' :
                          percentualUtilizado > 50 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {percentualUtilizado}%
                        </div>
                      </div>
                    </div>

                    {/* Descrição */}
                    <p className="text-xs text-gray-600 line-clamp-2">{line.descricao}</p>

                    {/* Grid de valores principais */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Orçamento</p>
                        <p className="text-sm font-bold text-black mt-1">R$ {line.valor_total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <p className="text-[10px] text-blue-600 uppercase font-semibold tracking-wide">Utilizado</p>
                        <p className="text-sm font-bold text-blue-700 mt-1">R$ {valores.valorUtilizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className={`p-3 rounded-lg border ${saldo < 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        <p className={`text-[10px] uppercase font-semibold tracking-wide ${saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>Saldo</p>
                        <p className={`text-sm font-bold mt-1 ${saldo < 0 ? 'text-red-700' : 'text-green-700'}`}>
                          R$ {Math.abs(saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                        <p className="text-[10px] text-purple-600 uppercase font-semibold tracking-wide">Disponível</p>
                        <p className="text-sm font-bold text-purple-700 mt-1">{Math.max(0, saldo > 0 ? ((saldo / line.valor_total) * 100).toFixed(0) : 0)}%</p>
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-3 bg-gray-200 rounded-full flex-1 overflow-hidden relative">
                          <div
                            className={`h-full transition-all ${
                              percentualUtilizado > 80 ? 'bg-red-500' :
                              percentualUtilizado > 50 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(percentualUtilizado, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Detalhes Expandíveis */}
                    {isExpanded && (
                      <div className="pt-4 border-t border-gray-200 space-y-3 animate-in fade-in">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="bg-white border border-gray-200 p-2.5 rounded">
                            <p className="text-gray-600 font-medium mb-1">✓ Aprovadas</p>
                            <p className="text-lg font-bold text-green-700">{valores.quantidadeAprovada}</p>
                            <p className="text-gray-600 text-[10px] mt-1">R$ {valores.valorAprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div className="bg-white border border-gray-200 p-2.5 rounded">
                            <p className="text-gray-600 font-medium mb-1">✓ Pagas</p>
                            <p className="text-lg font-bold text-blue-700">{valores.quantidadePaga}</p>
                            <p className="text-gray-600 text-[10px] mt-1">R$ {valores.valorPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div className="bg-white border border-gray-200 p-2.5 rounded col-span-2">
                            <p className="text-gray-600 font-medium mb-1">⏳ Em Análise</p>
                            <p className="text-lg font-bold text-orange-700">{valores.quantidadeEmAnalise}</p>
                            <p className="text-gray-600 text-[10px] mt-1">R$ {valores.valorEmAnalise.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </div>

                        {/* Avisos */}
                        {saldo < 0 && (
                          <div className="bg-red-50 border border-red-200 p-2.5 rounded">
                            <p className="text-xs font-semibold text-red-700">⚠️ Orçamento excedido!</p>
                            <p className="text-xs text-red-600 mt-1">Saldo: -R$ {Math.abs(saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        )}
                        {percentualUtilizado > 80 && saldo >= 0 && (
                          <div className="bg-yellow-50 border border-yellow-200 p-2.5 rounded">
                            <p className="text-xs font-semibold text-yellow-700">⚠️ Atenção: Orçamento em nível crítico</p>
                            <p className="text-xs text-yellow-600 mt-1">Apenas R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} disponível</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rodapé com dica */}
                    <div className="text-center pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-400">Clique para {isExpanded ? 'ocultar' : 'ver'} detalhes</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Vazio */}
      {Object.keys(filtered).length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">Nenhuma rubrica encontrada</p>
        </div>
      )}
    </div>
  );
}