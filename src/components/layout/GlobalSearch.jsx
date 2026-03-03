import React, { useState, useEffect } from 'react';
import { Search, FileText, Building2, History, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [reports, museus, activities] = await Promise.all([
          base44.entities.Report.list('-created_date', 20),
          base44.entities.Museu.list('-created_date', 10),
          base44.entities.Activity.list('-created_date', 20),
        ]);

        const searchLower = query.toLowerCase();
        const filtered = [
          ...reports
            .filter(r =>
              (r.numero_protocolo?.toLowerCase().includes(searchLower) ||
              r.author_name?.toLowerCase().includes(searchLower) ||
              r.museu?.toLowerCase().includes(searchLower))
            )
            .map(r => ({
              type: 'report',
              id: r.id,
              title: `${r.numero_protocolo} - ${r.author_name}`,
              subtitle: `${r.mes_referencia} ${r.ano}`,
              icon: FileText,
            })),
          ...museus
            .filter(m =>
              m.nome?.toLowerCase().includes(searchLower) ||
              m.sigla?.toLowerCase().includes(searchLower)
            )
            .map(m => ({
              type: 'museu',
              id: m.id,
              title: m.nome,
              subtitle: m.sigla,
              icon: Building2,
            })),
          ...activities
            .filter(a =>
              a.titulo?.toLowerCase().includes(searchLower) ||
              a.descricao?.toLowerCase().includes(searchLower)
            )
            .map(a => ({
              type: 'activity',
              id: a.id,
              title: a.titulo,
              subtitle: a.report_id,
              icon: History,
            })),
        ];

        setResults(filtered.slice(0, 10));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result) => {
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Buscar relatórios, museus..."
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="pl-9 text-sm h-9"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && query && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {loading && (
            <div className="p-4 flex items-center justify-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Buscando...</span>
            </div>
          )}

          {!loading && results.length === 0 && query && (
            <div className="p-4 text-center text-gray-500 text-sm">
              Nenhum resultado encontrado
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2 max-h-96 overflow-y-auto">
              {results.map((result, i) => {
                const Icon = result.icon;
                let href = '#';
                if (result.type === 'report') href = createPageUrl(`ReportEditor?id=${result.id}`);
                if (result.type === 'museu') href = '#'; // Sem página dedicada
                if (result.type === 'activity') href = '#'; // Sem página dedicada

                return (
                  <Link
                    key={i}
                    to={href}
                    onClick={() => handleSelect(result)}
                    className="px-4 py-2 hover:bg-gray-50 flex items-start gap-3 cursor-pointer transition-colors"
                  >
                    <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-black">{result.title}</p>
                      <p className="text-xs text-gray-500">{result.subtitle}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}