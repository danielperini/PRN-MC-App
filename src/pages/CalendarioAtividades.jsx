import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function CalendarioAtividades() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [museuFiltro, setMuseuFiltro] = useState('todos');

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);

      const data = await base44.entities.Programacao.list({
        sort: { data: 'asc' },
      });

      setItems(data || []);
    } catch (err) {
      console.error('Erro ao carregar programação:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const filtrados = items.filter((item) => {
    if (museuFiltro === 'todos') return true;
    return item.museu === museuFiltro;
  });

  return (
    <div className="space-y-4">

      <h1 className="text-2xl font-semibold">Agenda</h1>

      <div className="flex gap-2">
        <button onClick={() => setMuseuFiltro('todos')}>Todos</button>
        <button onClick={() => setMuseuFiltro('MIS')}>MIS</button>
        <button onClick={() => setMuseuFiltro('MHAB')}>MHAB</button>
        <button onClick={() => setMuseuFiltro('MUMO')}>MUMO</button>
      </div>

      {loading && <p>Carregando...</p>}

      {!loading && filtrados.length === 0 && (
        <p>Nenhuma atividade encontrada.</p>
      )}

      <div className="grid gap-4">
        {filtrados.map((item, i) => (
          <div key={i} className="border p-4 rounded-xl bg-white">

            <div className="font-semibold text-lg">
              {item.nome || item.titulo || 'Sem título'}
            </div>

            <div className="text-sm text-gray-600">
              {item.data || 'Sem data'} • {item.horario || ''}
            </div>

            <div className="text-sm">
              {item.museu || 'Museu não informado'}
            </div>

            {item.local && (
              <div className="text-sm">{item.local}</div>
            )}

            {item.descricao && (
              <div className="text-sm mt-2">{item.descricao}</div>
            )}

            {item.link && (
              <a
                href={item.link}
                target="_blank"
                className="text-blue-600 text-sm mt-2 inline-block"
              >
                Saiba mais
              </a>
            )}

          </div>
        ))}
      </div>
    </div>
  );
}