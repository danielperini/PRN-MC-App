import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { useActivityEdits } from '@/hooks/useActivityEdits';

const MUSEUS_OPTIONS = ['MUMO', 'MIS', 'MHAB', 'Casa Kubitschek', 'Casa do Baile', 'MAP'];
const CLASSIFICACAO_OPTIONS = ['META', 'ROTINA', 'EXTRA'];

/**
 * Lista de atividades editável inline para uso nos Sheets do Dashboard.
 *
 * Props:
 *   activities: Array<{ id, titulo, nome, classificacao, meta_codigo, museu, ... }>
 *   renderExtra?: (activity, edits, setEdit) => ReactNode — conteúdo adicional por linha
 *   footerRef?: React.MutableRefObject — para injetar o footerAction no Sheet pai via callback
 *   onFooterAction?: (node: ReactNode) => void — callback que recebe o botão de salvar
 */
export default function EditableActivityList({ activities = [], onFooterAction }) {
  const { edits, setEdit, saveAll, isSaving, dirtyCount } = useActivityEdits(activities);

  // Metas disponíveis
  const { data: metas = [] } = useQuery({
    queryKey: ['project-metas-3-4-aditivo'],
    queryFn: async () => {
      const res = await base44.entities.ProjectMeta.list('ordem', 200);
      return (Array.isArray(res) ? res : []).filter(m => m.ativo !== false);
    },
    staleTime: 60000,
  });

  // Notifica o pai sobre o botão de rodapé sempre que o estado muda
  React.useEffect(() => {
    if (!onFooterAction) return;
    onFooterAction(
      dirtyCount > 0 ? (
        <button
          onClick={saveAll}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSaving ? 'Salvando...' : `Salvar alterações (${dirtyCount})`}
        </button>
      ) : null
    );
  }, [dirtyCount, isSaving, saveAll, onFooterAction]);

  if (activities.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Nenhuma atividade encontrada</p>;
  }

  return (
    <div className="space-y-2">
      {activities.map((act, i) => {
        const id = act?.id;
        const isDirty = !!id && !!edits[id];
        const current = isDirty ? { ...act, ...edits[id] } : act;

        return (
          <div
            key={id || i}
            className={`rounded-xl border bg-slate-50 px-3 py-2.5 transition-all ${
              isDirty ? 'border-l-4 border-yellow-400 border-t border-r border-b border-slate-200' : 'border-slate-100'
            }`}
          >
            {/* Cabeçalho da linha */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                {act.titulo || act.nome || `Atividade ${i + 1}`}
              </p>
              {isDirty && (
                <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300">
                  Alterado
                </span>
              )}
            </div>

            {/* Controles editáveis — apenas se tiver id (entidade salva) */}
            {id ? (
              <div className="grid grid-cols-3 gap-1.5">
                {/* Classificação */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-0.5">Classificação</label>
                  <select
                    value={current.classificacao || ''}
                    onChange={e => setEdit(id, 'classificacao', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">—</option>
                    {CLASSIFICACAO_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* Meta vinculada */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-0.5">Meta</label>
                  <select
                    value={current.meta_codigo || current.meta_id || ''}
                    onChange={e => setEdit(id, 'meta_codigo', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">—</option>
                    {metas.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Museu */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-0.5">Museu</label>
                  <select
                    value={current.museu || ''}
                    onChange={e => setEdit(id, 'museu', e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">—</option>
                    {MUSEUS_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Atividade sem ID — edição não disponível</p>
            )}
          </div>
        );
      })}
    </div>
  );
}