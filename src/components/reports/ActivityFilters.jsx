import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Filter } from 'lucide-react';

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];

export default function ActivityFilters({ 
  teams = [], 
  onFilter = () => {},
  onClear = () => {}
}) {
  const [filters, setFilters] = useState({
    team: '',
    museum: '',
    dateStart: '',
    dateEnd: ''
  });

  const hasFilters = Object.values(filters).some(Boolean);

  const handleChange = (key, value) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    onFilter(updated);
  };

  const handleClear = () => {
    setFilters({ team: '', museum: '', dateStart: '', dateEnd: '' });
    onClear();
  };

  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-black">Filtros de Atividades</h3>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs ml-auto h-7 gap-1"
            onClick={handleClear}
          >
            <X className="w-3 h-3" />
            Limpar
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Equipe</Label>
          <Select value={filters.team} onValueChange={v => handleChange('team', v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todas</SelectItem>
              {teams.map(team => (
                <SelectItem key={team} value={team}>{team}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Museu</Label>
          <Select value={filters.museum} onValueChange={v => handleChange('museum', v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todos</SelectItem>
              {MUSEUS.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Data Início</Label>
          <Input
            type="date"
            value={filters.dateStart}
            onChange={e => handleChange('dateStart', e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-gray-700">Data Fim</Label>
          <Input
            type="date"
            value={filters.dateEnd}
            onChange={e => handleChange('dateEnd', e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}