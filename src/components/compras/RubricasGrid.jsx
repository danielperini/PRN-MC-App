import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, TrendingUp, ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RubricasGrid({ budgetLines, purchases }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setategoryFilter] = useState('all');

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

  // Calcular valor utilizado por rubrica
  const getValorUtilizado = (rubricaId) => {
    return purchases
      .filter(p => p.rubrica_id === rubricaId && ['APROVADO_COORD', 'PAGO'].includes(p.status))
      .reduce((sum, p) => sum + (p.valor_total || 0), 0);
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
              const valorUtilizado = getValorUtilizado(line.id);
              const saldo = line.valor_total - valorUtilizado;
              const percentualUtilizado = line.valor_total > 0 ? (valorUtilizado / line.valor_total * 100).toFixed(2) : 0;

              return (
                <Card key={line.id} className="border-2 border-gray-200 hover:border-gray-400 transition-all">
                  <CardContent className="p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-black text-sm">{line.nome}</h3>
                        <p className="text-xs text-gray-500 mt-1">{line.codigo}</p>
                      </div>
                      <div className={`text-xs font-medium px-2 py-1 rounded-full ${
                        percentualUtilizado > 80 ? 'bg-red-100 text-red-700' :
                        percentualUtilizado > 50 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {percentualUtilizado}%
                      </div>
                    </div>

                    {/* Descrição */}
                    <p className="text-xs text-gray-600">{line.descricao}</p>

                    {/* Grid de valores */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 p-2 rounded">
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Parcelas/Un.</p>
                        <p className="text-sm font-bold text-black">{line.parcelas_ou_unidades}</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Valor</p>
                        <p className="text-sm font-bold text-black">R$ {line.valor_total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="bg-blue-50 p-2 rounded">
                        <p className="text-[10px] text-blue-600 uppercase font-medium">Utilizado</p>
                        <p className="text-sm font-bold text-blue-700">R$ {valorUtilizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className={`p-2 rounded ${saldo < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                        <p className={`text-[10px] uppercase font-medium ${saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>Saldo</p>
                        <p className={`text-sm font-bold ${saldo < 0 ? 'text-red-700' : 'text-green-700'}`}>
                          R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Progresso */}
                    <div className="space-y-1">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
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

                    {/* Observação */}
                    {line.observacao && (
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-600 italic">{line.observacao}</p>
                      </div>
                    )}
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