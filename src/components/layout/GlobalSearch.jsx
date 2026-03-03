import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, FileText, Building2, Clock, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Buscar relatórios
  const { data: reports = [] } = useQuery({
    queryKey: ['search-reports', query],
    queryFn: () => {
      if (!query || query.length < 2) return [];
      return base44.entities.Report.list('-created_date', 10).then(reports =>
        reports.filter(r =>
          r.numero_protocolo?.toLowerCase().includes(query.toLowerCase()) ||
          r.author_name?.toLowerCase().includes(query.toLowerCase()) ||
          r.mes_referencia?.toLowerCase().includes(query.toLowerCase())
        )
      );
    },
    enabled: query.length >= 2,
  });

  // Buscar museus
  const { data: museus = [] } = useQuery({
    queryKey: ['search-museus', query],
    queryFn: () => {
      if (!query || query.length < 2) return [];
      return base44.entities.Museu.list().then(museus =>
        museus.filter(m =>
          m.nome?.toLowerCase().includes(query.toLowerCase()) ||
          m.sigla?.toLowerCase().includes(query.toLowerCase())
        )
      );
    },
    enabled: query.length >= 2,
  });

  // Buscar atividades
  const { data: activities = [] } = useQuery({
    queryKey: ['search-activities', query],
    queryFn: () => {
      if (!query || query.length < 2) return [];
      return base44.entities.Activity.list('-created_date', 10).then(activities =>
        activities.filter(a =>
          a.titulo?.toLowerCase().includes(query.toLowerCase()) ||
          a.descricao?.toLowerCase().includes(query.toLowerCase())
        )
      );
    },
    enabled: query.length >= 2,
  });

  const hasResults = query.length >= 2 && (reports.length > 0 || museus.length > 0 || activities.length > 0);

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Buscar relatórios, museus, atividades..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          className="pl-10 pr-8 h-9 text-sm bg-gray-50 border-gray-200"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {query.length < 2 ? (
            <div className="p-4 text-center text-sm text-gray-400">
              Digite pelo menos 2 caracteres para buscar
            </div>
          ) : hasResults ? (
            <div className="divide-y divide-gray-100">
              {reports.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50">Relatórios</p>
                  {reports.map(r => (
                    <Link
                      key={r.id}
                      to={createPageUrl(`ReportEditor?id=${r.id}`)}
                      onClick={() => { setOpen(false); setQuery(''); }}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-sm"
                    >
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{r.numero_protocolo}</p>
                        <p className="text-xs text-gray-500">{r.author_name}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {museus.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50">Museus</p>
                  {museus.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-sm cursor-default"
                    >
                      <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{m.nome}</p>
                        <p className="text-xs text-gray-500">{m.sigla}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activities.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50">Atividades</p>
                  {activities.map(a => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-sm cursor-default"
                    >
                      <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{a.titulo}</p>
                        <p className="text-xs text-gray-500 truncate">{a.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-gray-400">
              Nenhum resultado encontrado
            </div>
          )}
        </div>
      )}
    </div>
  );
}