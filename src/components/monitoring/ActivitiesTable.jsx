import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ActivitiesTable({ activities = [], metas = [] }) {
  const [filteredActivities, setFilteredActivities] = useState(activities);
  const [filters, setFilters] = useState({
    museu: '',
    tipo_atividade: '',
    coordenacao_responsavel: ''
  });
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const museums = ['Museu da Moda', 'Museu da Imagem e do Som', 'Museu Histórico Abílio Barreto'];
  const types = ['educativo', 'oficina', 'atividade cultural', 'exposicao', 'mostra', 'evento'];
  const coordinations = ['Coordenador Geral', 'Programação', 'Comunicação', 'Produção'];

  const handleFilterChange = (filterType, value) => {
    const newFilters = { ...filters, [filterType]: value };
    setFilters(newFilters);

    let filtered = activities;
    Object.keys(newFilters).forEach(key => {
      if (newFilters[key]) {
        filtered = filtered.filter(a => a[key] === newFilters[key]);
      }
    });
    setFilteredActivities(filtered);
    setPage(1);
  };

  const getMetaName = (metaId) => metas.find(m => m.id === metaId)?.nome || 'Meta não encontrada';

  const startIdx = (page - 1) * itemsPerPage;
  const paginatedActivities = filteredActivities.slice(startIdx, startIdx + itemsPerPage);
  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);

  return (
    <Card className="p-5 bg-white border-gray-200">
      <h3 className="font-semibold text-gray-900 mb-4">Atividades Registradas ({filteredActivities.length})</h3>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div>
          <label className="text-xs text-gray-600 mb-1 block">Museu</label>
          <Select value={filters.museu} onValueChange={(val) => handleFilterChange('museu', val)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todos os museus" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todos</SelectItem>
              {museums.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-gray-600 mb-1 block">Tipo</label>
          <Select value={filters.tipo_atividade} onValueChange={(val) => handleFilterChange('tipo_atividade', val)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todos</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-gray-600 mb-1 block">Coordenação</label>
          <Select value={filters.coordenacao_responsavel} onValueChange={(val) => handleFilterChange('coordenacao_responsavel', val)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todas as coordenações" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todas</SelectItem>
              {coordinations.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="border-gray-200">
              <TableHead className="text-gray-600">Meta</TableHead>
              <TableHead className="text-gray-600">Título</TableHead>
              <TableHead className="text-gray-600">Tipo</TableHead>
              <TableHead className="text-gray-600">Museu</TableHead>
              <TableHead className="text-gray-600">Coordenação</TableHead>
              <TableHead className="text-gray-600">Data</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedActivities.length > 0 ? (
              paginatedActivities.map(activity => (
                <TableRow key={activity.id} className="border-gray-200 hover:bg-gray-50">
                  <TableCell className="text-xs text-gray-700">{getMetaName(activity.meta_id)}</TableCell>
                  <TableCell className="text-gray-900 font-medium">{activity.titulo}</TableCell>
                  <TableCell className="text-gray-700">{activity.tipo_atividade}</TableCell>
                  <TableCell className="text-gray-700">{activity.museu}</TableCell>
                  <TableCell className="text-gray-700">{activity.coordenacao_responsavel}</TableCell>
                  <TableCell className="text-gray-700">
                    {activity.data_realizacao ? new Date(activity.data_realizacao).toLocaleDateString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={activity.status === 'realizada' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}>
                      {activity.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan="7" className="text-center py-6 text-gray-500">
                  Nenhuma atividade registrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-600">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}