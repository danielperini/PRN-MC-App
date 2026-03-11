import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw, Filter } from 'lucide-react';

const categorias = [
  'Escolas Municipais',
  'Escolas Estaduais',
  'Escolas Secundaristas',
  'EJA',
  'Escolas Técnicas',
  'Universidades e Faculdades',
  'Centros Culturais',
  'Bibliotecas',
  'Lares de Idosos e Centros de Convivência',
  'Associações e Coletivos',
  'Grupos de Fotografia',
  'Grupos de Cinema e Audiovisual',
  'Grupos de Moda',
  'Grupos de Patrimônio, Memória e Museologia',
  'Oportunidades de Formação e Mobilização',
];

const publicos = [
  'Infantil',
  'Juvenil',
  'Secundaristas',
  'Universitários',
  'Professores',
  'Idosos',
  'Turistas',
  'Profissionais da Cultura',
  'Designers',
  'Fotógrafos',
  'Cineastas',
  'Educadores',
  'Pesquisadores',
  'Coletivos Comunitários',
  'Artistas Locais',
];

export default function FilterBar({
  filtroCategoria,
  setFiltroCategoria,
  filtroPublico,
  setFiltroPublico,
  filtroPrioridade,
  setFiltroPrioridade,
  onReset,
}) {
  const temFiltros = filtroCategoria || filtroPublico || filtroPrioridade;

  return (
    <div className="bg-white border-b border-slate-200 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-4 h-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900">Filtros</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Categoria */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">
            Categoria
          </label>
          <Select value={filtroCategoria || ''} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="text-sm h-9">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todas as categorias</SelectItem>
              {categorias.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Público */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">
            Público
          </label>
          <Select value={filtroPublico || ''} onValueChange={setFiltroPublico}>
            <SelectTrigger className="text-sm h-9">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todos os públicos</SelectItem>
              {publicos.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prioridade */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">
            Prioridade
          </label>
          <Select value={filtroPrioridade || ''} onValueChange={setFiltroPrioridade}>
            <SelectTrigger className="text-sm h-9">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todas as prioridades</SelectItem>
              <SelectItem value="Alta">Alta</SelectItem>
              <SelectItem value="Média">Média</SelectItem>
              <SelectItem value="Baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Botão Reset */}
      {temFiltros && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-slate-600 hover:text-slate-900 gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}