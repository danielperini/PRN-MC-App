import React, { useState, useMemo } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function RubricaTable({ rubricas, onSelectRubrica }) {
  const [search, setSearch] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('all');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const grupos = [...new Set(rubricas?.map(r => r.grupo) || [])];

  const filtered = useMemo(() => {
    return (rubricas || []).filter(r => {
      const matchSearch = !search || r.rubrica?.toLowerCase().includes(search.toLowerCase());
      const matchGrupo = filtroGrupo === 'all' || r.grupo === filtroGrupo;
      
      let matchStatus = true;
      if (filtroStatus !== 'all') {
        const percent = r.percentual_utilizado || 0;
        if (filtroStatus === 'sem-uso') matchStatus = percent === 0;
        if (filtroStatus === 'em-uso') matchStatus = percent > 0 && percent < 80;
        if (filtroStatus === 'alerta') matchStatus = percent >= 80 && percent < 100;
        if (filtroStatus === 'excedida') matchStatus = percent >= 100;
      }
      
      return matchSearch && matchGrupo && matchStatus;
    });
  }, [rubricas, search, filtroGrupo, filtroStatus]);

  const getStatusIcon = (percent) => {
    if (percent >= 100) return <AlertTriangle className="w-4 h-4 text-red-600" />;
    if (percent >= 80) return <AlertCircle className="w-4 h-4 text-amber-600" />;
    return <CheckCircle className="w-4 h-4 text-green-600" />;
  };

  const getStatusColor = (percent) => {
    if (percent >= 100) return 'bg-red-50';
    if (percent >= 80) return 'bg-amber-50';
    return 'bg-green-50';
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <Input
            placeholder="Buscar rubrica..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filtrar por grupo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {grupos.map(g => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="sem-uso">Sem uso</SelectItem>
            <SelectItem value="em-uso">Em uso (0-80%)</SelectItem>
            <SelectItem value="alerta">Atenção (80-100%)</SelectItem>
            <SelectItem value="excedida">Excedida (100%+)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Rubrica</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Grupo</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Parcelas</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Valor Total</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Utilizado</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">Saldo</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-700">%</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(rubrica => (
              <React.Fragment key={rubrica.id}>
                <tr className={`border-b hover:${getStatusColor(rubrica.percentual_utilizado || 0)} cursor-pointer`} onClick={() => setExpandedId(expandedId === rubrica.id ? null : rubrica.id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === rubrica.id ? 'rotate-180' : ''}`} />
                      <span className="font-medium text-black">{rubrica.rubrica}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{rubrica.grupo}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{rubrica.numero_parcelas_unidades || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    R$ {(rubrica.valor_rubrica || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    R$ {(rubrica.valor_utilizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${(rubrica.saldo || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    R$ {(rubrica.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {getStatusIcon(rubrica.percentual_utilizado || 0)}
                      <span className="font-bold">{(rubrica.percentual_utilizado || 0).toFixed(2)}%</span>
                    </div>
                  </td>
                </tr>

                {expandedId === rubrica.id && (
                  <tr className="bg-gray-50">
                    <td colSpan="7" className="px-4 py-4">
                      <div className="space-y-4">
                        {rubrica.observacao_uso && (
                          <div>
                            <span className="text-xs font-semibold text-gray-600">Observações:</span>
                            <p className="text-sm text-gray-700 mt-1">{rubrica.observacao_uso}</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button className="bg-black hover:bg-gray-800 text-white text-xs" onClick={() => onSelectRubrica(rubrica)}>
                            Ver Detalhes
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          Nenhuma rubrica encontrada
        </div>
      )}
    </div>
  );
}