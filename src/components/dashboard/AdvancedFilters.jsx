import React, { useState } from 'react';
import { X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];
const STATUS_OPCOES = [
  { value: 'DRAFT', label: 'Pendente' },
  { value: 'SUBMITTED', label: 'Enviado' },
  { value: 'IN_REVIEW', label: 'Em Revisão' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'RETURNED', label: 'Devolvido' },
  { value: 'ARCHIVED', label: 'Arquivado' },
];

export default function AdvancedFilters({ onFilterChange, activeFilters }) {
  const [showFilters, setShowFilters] = useState(false);
  const [museu, setMuseu] = useState(activeFilters?.museu || '');
  const [status, setStatus] = useState(activeFilters?.status || '');

  const handleApply = () => {
    onFilterChange({ museu, status });
    setShowFilters(false);
  };

  const handleReset = () => {
    setMuseu('');
    setStatus('');
    onFilterChange({ museu: '', status: '' });
  };

  const hasActiveFilters = museu || status;

  return (
    <div className="mb-6">
      <Button
        variant="outline"
        onClick={() => setShowFilters(!showFilters)}
        className={`gap-2 ${hasActiveFilters ? 'border-black bg-black/5' : ''}`}
      >
        <Filter className="w-4 h-4" />
        Filtros Avançados
        {hasActiveFilters && (
          <Badge variant="secondary" className="ml-2">
            {(museu ? 1 : 0) + (status ? 1 : 0)}
          </Badge>
        )}
      </Button>

      {showFilters && (
        <div className="mt-4 p-5 border border-gray-200 rounded-xl bg-gray-50">
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Museu</label>
              <Select value={museu} onValueChange={setMuseu}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os museus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Todos os museus</SelectItem>
                  {MUSEUS.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Todos os status</SelectItem>
                  {STATUS_OPCOES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <X className="w-3 h-3 mr-1" />Limpar
            </Button>
            <Button size="sm" className="bg-black hover:bg-gray-800" onClick={handleApply}>
              Aplicar Filtros
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}