import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

const MUSEUS = ['Todos', 'MHAB', 'MIS', 'MUMO', 'Externo'];

function parseDateToISO(dataStr) {
  if (!dataStr) return null;

  const parts = String(dataStr).split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const parsed = new Date(dataStr);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeItems(items = []) {
  return items.map((i) => {
    const dataISO = parseDateToISO(i.data_inicio || i.data);

    return {
      id: i.id,
      nome: i.titulo || i.nome || '',
      data: i.data || '',
      data_iso: dataISO,
      museu: i.museu || 'Externo',
      horario: i.horario || '',
      local: i.local || '',
      sinopse: i.sinopse || '',
    };
  });
}

function CalendarioAtividadesInner() {
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');

  const { data = [], isLoading } = useQuery({
    queryKey: ['programacao-clean'],
    queryFn: async () => {
      const res = await base44.entities.Programacao.list('-data_inicio', 500);
      return Array.isArray(res) ? res : [];
    },
  });

  const items = useMemo(() => normalizeItems(data), [data]);

  const filtrados = useMemo(() => {
    return items.filter(
      (i) => filtroMuseu === 'Todos' || i.museu === filtroMuseu
    );
  }, [items, filtroMuseu]);

  return (
    <div className="w-full py-6">
      <div className="max-w-6xl mx-auto px-4 space-y-6">

        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Programação</h1>
          <Badge>{filtrados.length}</Badge>
        </div>

        <div className="flex gap-2 flex-wrap">
          {MUSEUS.map((m) => (
            <Button
              key={m}
              size="sm"
              variant={filtroMuseu === m ? 'default' : 'outline'}
              onClick={() => setFiltroMuseu(m)}
            >
              {m}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div>Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="border p-6 text-gray-500">
            Nenhuma atividade encontrada.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtrados.map((a) => (
              <div key={a.id} className="border p-4 rounded-lg bg-white">
                <div className="font-semibold">{a.nome}</div>

                <div className="text-xs text-gray-500 mt-1">
                  {a.data} {a.horario ? `· ${a.horario}` : ''}
                </div>

                {a.local && (
                  <div className="text-xs text-gray-500">
                    {a.local}
                  </div>
                )}

                {a.sinopse && (
                  <div className="text-sm mt-2 text-gray-700">
                    {a.sinopse}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CalendarioAtividades() {
  return (
    <RequireAuth>
      <CalendarioAtividadesInner />
    </RequireAuth>
  );
}
