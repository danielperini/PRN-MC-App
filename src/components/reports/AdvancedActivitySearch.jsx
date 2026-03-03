import React, { useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const TIPOS_ACAO = [
  'Visita Mediada', 'Oficina', 'Exposição', 'Evento', 'Palestra',
  'Reunião', 'Formação', 'Produção de Conteúdo', 'Manutenção', 'Outro'
];

const METAS_3_ADITIVO = [
  'META_01', 'META_02', 'META_03', 'META_04', 'META_05', 'META_06',
  'META_07', 'META_08', 'META_09', 'META_10', 'META_11', 'META_12',
  'META_13', 'META_14', 'META_15', 'META_16', 'META_17', 'META_18',
  'META_19', 'META_20', 'META_21', 'META_22'
];

const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];

function FilterSel({ placeholder, value, onChange, options }) {
  return (
    <Select value={value || 'all'} onValueChange={v => onChange(v === 'all' ? '' : v)}>
      <SelectTrigger className="h-8 text-sm min-w-[140px] border-gray-200">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">— {placeholder} —</SelectItem>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function AdvancedActivitySearch({ 
  activities = [], 
  onFilteredActivities,
  users = []
}) {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    tipoAcao: '',
    equipeResponsavel: '',
    metaCodigo: '',
    coResponsavelEmail: '',
  });

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      tipoAcao: '',
      equipeResponsavel: '',
      metaCodigo: '',
      coResponsavelEmail: '',
    });
    setSearch('');
  };

  // Apply filters
  const filtered = activities.filter(activity => {
    // Text search
    if (search) {
      const q = search.toLowerCase();
      const matchNome = (activity.nome || '').toLowerCase().includes(q);
      const matchDescricao = (activity.descricao_executado || '').toLowerCase().includes(q);
      const matchObjetivo = (activity.objetivo || '').toLowerCase().includes(q);
      if (!matchNome && !matchDescricao && !matchObjetivo) return false;
    }

    // Date range filter
    if (filters.dateFrom && activity.data_inicio) {
      if (new Date(activity.data_inicio) < new Date(filters.dateFrom)) return false;
    }
    if (filters.dateTo && activity.data_inicio) {
      if (new Date(activity.data_inicio) > new Date(filters.dateTo)) return false;
    }

    // Activity type filter
    if (filters.tipoAcao && activity.tipo_acao !== filters.tipoAcao) return false;

    // Team filter
    if (filters.equipeResponsavel && activity.equipe_responsavel !== filters.equipeResponsavel) return false;

    // Meta code filter
    if (filters.metaCodigo && activity.meta_codigo !== filters.metaCodigo) return false;

    // Co-responsible filter
    if (filters.coResponsavelEmail && activity.co_responsavel_email !== filters.coResponsavelEmail) return false;

    return true;
  });

  // Call parent callback with filtered activities
  React.useEffect(() => {
    onFilteredActivities(filtered);
  }, [filtered, onFilteredActivities]);

  const hasActiveFilters = 
    Object.values(filters).some(Boolean) || !!search;

  const coRespUsers = users.filter(u => 
    activities.some(a => a.co_responsavel_email === u.email)
  );

  return (
    <div className="mb-6 space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome, descrição ou objetivo da atividade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 border-gray-200"
          />
          {search && (
            <button 
              onClick={() => setSearch('')} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          className={`gap-2 h-10 ${showFilters ? 'border-black bg-gray-50' : 'border-gray-200'}`}
          onClick={() => setShowFilters(p => !p)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filtros
          {hasActiveFilters && (
            <span className="w-4 h-4 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-semibold">
              {Object.values(filters).filter(Boolean).length + (search ? 1 : 0)}
            </span>
          )}
        </Button>
        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-gray-400 gap-1 h-10" 
            onClick={clearFilters}
          >
            <X className="w-3 h-3" /> Limpar
          </Button>
        )}
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Date range */}
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Data Inicial
              </label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={e => setFilter('dateFrom', e.target.value)}
                className="h-8 text-sm border-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Data Final
              </label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={e => setFilter('dateTo', e.target.value)}
                className="h-8 text-sm border-gray-200"
              />
            </div>

            {/* Activity type */}
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Tipo de Ação
              </label>
              <FilterSel 
                placeholder="Tipo"
                value={filters.tipoAcao}
                onChange={v => setFilter('tipoAcao', v)}
                options={TIPOS_ACAO.map(t => ({ value: t, label: t }))}
              />
            </div>

            {/* Team */}
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Equipe Responsável
              </label>
              <FilterSel
                placeholder="Equipe"
                value={filters.equipeResponsavel}
                onChange={v => setFilter('equipeResponsavel', v)}
                options={EQUIPES.map(e => ({ value: e, label: e }))}
              />
            </div>

            {/* Meta code */}
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Código de Meta
              </label>
              <FilterSel
                placeholder="Meta"
                value={filters.metaCodigo}
                onChange={v => setFilter('metaCodigo', v)}
                options={METAS_3_ADITIVO.map(m => ({ value: m, label: m }))}
              />
            </div>

            {/* Co-responsible */}
            {coRespUsers.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                  Co-responsável
                </label>
                <FilterSel
                  placeholder="Co-responsável"
                  value={filters.coResponsavelEmail}
                  onChange={v => setFilter('coResponsavelEmail', v)}
                  options={coRespUsers.map(u => ({ 
                    value: u.email, 
                    label: u.full_name || u.email 
                  }))}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active filters badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {search && (
            <Badge variant="outline" className="gap-1">
              Busca: "{search}"
              <button onClick={() => setSearch('')}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.dateFrom && (
            <Badge variant="outline" className="gap-1">
              De: {new Date(filters.dateFrom).toLocaleDateString('pt-BR')}
              <button onClick={() => setFilter('dateFrom', '')}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.dateTo && (
            <Badge variant="outline" className="gap-1">
              Até: {new Date(filters.dateTo).toLocaleDateString('pt-BR')}
              <button onClick={() => setFilter('dateTo', '')}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.tipoAcao && (
            <Badge variant="outline" className="gap-1">
              {filters.tipoAcao}
              <button onClick={() => setFilter('tipoAcao', '')}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.equipeResponsavel && (
            <Badge variant="outline" className="gap-1">
              {filters.equipeResponsavel}
              <button onClick={() => setFilter('equipeResponsavel', '')}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.metaCodigo && (
            <Badge variant="outline" className="gap-1">
              {filters.metaCodigo}
              <button onClick={() => setFilter('metaCodigo', '')}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.coResponsavelEmail && (
            <Badge variant="outline" className="gap-1">
              Co: {users.find(u => u.email === filters.coResponsavelEmail)?.full_name || filters.coResponsavelEmail}
              <button onClick={() => setFilter('coResponsavelEmail', '')}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Results counter */}
      <div className="text-xs text-gray-500">
        {filtered.length} atividade{filtered.length !== 1 ? 's' : ''} encontrada{filtered.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}