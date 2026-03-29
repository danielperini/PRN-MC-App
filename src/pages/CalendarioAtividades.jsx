import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';

function formatDate(value) {
  if (!value) return 'Sem data';

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  return String(value);
}

function getAtividade(item) {
  return item?.atividade || item?.titulo || item?.nome || 'Sem atividade';
}

function getResumo(item) {
  return item?.resumo || item?.sinopse || item?.descricao || '';
}

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
        sort: { data_inicio: 'asc' },
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar programação:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const museus = useMemo(() => {
    return Array.from(
      new Set(items.map((item) => item?.museu).filter(Boolean))
    );
  }, [items]);

  const filtrados = useMemo(() => {
    const base = [...items].sort((a, b) => {
      const da = new Date(a?.data_inicio || a?.data || 0).getTime();
      const db = new Date(b?.data_inicio || b?.data || 0).getTime();
      return da - db;
    });

    if (museuFiltro === 'todos') return base;
    return base.filter((item) => item?.museu === museuFiltro);
  }, [items, museuFiltro]);

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Calendário de Atividades</h1>
        <p className="text-sm text-gray-600">
          Programação sincronizada a partir da planilha cadastrada na Base de Conhecimento.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMuseuFiltro('todos')}
          className={`px-4 py-2 rounded-lg border ${museuFiltro === 'todos' ? 'bg-black text-white' : 'bg-white'}`}
        >
          Todos
        </button>

        {museus.map((museu) => (
          <button
            key={museu}
            type="button"
            onClick={() => setMuseuFiltro(museu)}
            className={`px-4 py-2 rounded-lg border ${museuFiltro === museu ? 'bg-black text-white' : 'bg-white'}`}
          >
            {museu}
          </button>
        ))}

        <button
          type="button"
          onClick={carregar}
          className="px-4 py-2 rounded-lg border bg-white"
        >
          Atualizar
        </button>
      </div>

      {loading && <p>Carregando...</p>}

      {!loading && filtrados.length === 0 && (
        <p>Nenhuma atividade encontrada.</p>
      )}

      {!loading && filtrados.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((item) => (
            <div key={item.id} className="border p-5 rounded-2xl bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {item?.museu || 'Museu não informado'}
                </div>

                {item?.tipo_atividade ? (
                  <div className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    {item.tipo_atividade}
                  </div>
                ) : null}
              </div>

              <div className="font-semibold text-lg leading-tight">
                {getAtividade(item)}
              </div>

              <div className="mt-3 space-y-1 text-sm text-gray-600">
                <div>
                  <span className="font-medium text-gray-800">Data:</span>{' '}
                  {formatDate(item?.data_inicio || item?.data)}
                </div>

                {item?.horario ? (
                  <div>
                    <span className="font-medium text-gray-800">Horário:</span>{' '}
                    {item.horario}
                  </div>
                ) : null}

                {item?.publico_alvo ? (
                  <div>
                    <span className="font-medium text-gray-800">Público-alvo:</span>{' '}
                    {item.publico_alvo}
                  </div>
                ) : null}

                {item?.vagas ? (
                  <div>
                    <span className="font-medium text-gray-800">Vagas:</span>{' '}
                    {item.vagas}
                  </div>
                ) : null}

                {item?.local ? (
                  <div>
                    <span className="font-medium text-gray-800">Local:</span>{' '}
                    {item.local}
                  </div>
                ) : null}
              </div>

              {getResumo(item) ? (
                <div className="text-sm mt-4 text-gray-700 leading-6">
                  {getResumo(item)}
                </div>
              ) : null}

              {item?.inscricao_acesso ? (
                <a
                  href={item.inscricao_acesso}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-blue-600 text-sm mt-4"
                >
                  Inscrição/acesso
                </a>
              ) : item?.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-blue-600 text-sm mt-4"
                >
                  Inscrição/acesso
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
