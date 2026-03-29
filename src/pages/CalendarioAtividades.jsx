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

function getTitulo(item) {
  return item?.titulo || item?.nome_acao || item?.nome || 'Sem título';
}

function getMuseu(item) {
  return item?.museu || item?.equipamento || 'Museu não informado';
}

function getDescricao(item) {
  return item?.sinopse || item?.descricao || '';
}

function getLink(item) {
  return (
    item?.link_inscricao ||
    item?.inscricao ||
    item?.material_divulgacao_aprovado ||
    item?.link ||
    ''
  );
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
      const data = await base44.entities.Programacao.list('-data_inicio', 500);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar programação:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const museus = useMemo(() => {
    const values = Array.from(
      new Set(
        items
          .map((item) => getMuseu(item))
          .filter(Boolean)
      )
    );
    return values;
  }, [items]);

  const filtrados = useMemo(() => {
    let data = [...items];

    data.sort((a, b) => {
      const da = new Date(a?.data_inicio || a?.data || 0).getTime();
      const db = new Date(b?.data_inicio || b?.data || 0).getTime();
      return da - db;
    });

    if (museuFiltro === 'todos') return data;
    return data.filter((item) => getMuseu(item) === museuFiltro);
  }, [items, museuFiltro]);

  return (
    <div className="p-6 space-y-6">
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
          className={`px-4 py-2 rounded-lg border text-sm ${
            museuFiltro === 'todos' ? 'bg-black text-white border-black' : 'bg-white'
          }`}
        >
          Todos
        </button>

        {museus.map((museu) => (
          <button
            key={museu}
            type="button"
            onClick={() => setMuseuFiltro(museu)}
            className={`px-4 py-2 rounded-lg border text-sm ${
              museuFiltro === museu ? 'bg-black text-white border-black' : 'bg-white'
            }`}
          >
            {museu}
          </button>
        ))}

        <button
          type="button"
          onClick={carregar}
          className="px-4 py-2 rounded-lg border text-sm bg-white"
        >
          Atualizar
        </button>
      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border bg-white p-6">Nenhuma atividade encontrada.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((item) => {
            const titulo = getTitulo(item);
            const museu = getMuseu(item);
            const descricao = getDescricao(item);
            const link = getLink(item);

            return (
              <div
                key={item.id}
                className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {museu}
                  </div>
                  {item?.tipo_atividade ? (
                    <div className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                      {item.tipo_atividade}
                    </div>
                  ) : null}
                </div>

                <h2 className="text-lg font-semibold leading-tight text-gray-900">
                  {titulo}
                </h2>

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

                  {item?.local ? (
                    <div>
                      <span className="font-medium text-gray-800">Local:</span>{' '}
                      {item.local}
                    </div>
                  ) : null}

                  {item?.vagas ? (
                    <div>
                      <span className="font-medium text-gray-800">Vagas:</span>{' '}
                      {item.vagas}
                    </div>
                  ) : null}
                </div>

                {descricao ? (
                  <p className="mt-4 text-sm leading-6 text-gray-700">
                    {descricao}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {item?.formato ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                      {item.formato}
                    </span>
                  ) : null}

                  {item?.publico ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                      {item.publico}
                    </span>
                  ) : null}
                </div>

                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-5 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50"
                  >
                    Saiba mais
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
