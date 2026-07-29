import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const CLASSIFICACOES = ['META', 'ROTINA', 'EXTRA'];
const MUSEUS_OPTIONS = ['MIS', 'MHAB', 'MUMO', 'Casa Kubitschek', 'Casa do Baile', 'MAP'];

/**
 * Linha editável de atividade para os Sheets do Dashboard.
 * Props:
 *   activity: objeto da atividade (deve ter .id)
 *   edits: objeto com valores pendentes para esta atividade
 *   onEdit: (field, value) => void
 */
export default function EditableActivityRow({ activity, edits = {}, onEdit }) {
  const isDirty = Object.keys(edits).length > 0;

  const { data: metas = [] } = useQuery({
    queryKey: ['project-metas-3-4-aditivo'],
    queryFn: async () => {
      const res = await base44.entities.ProjectMeta.list('ordem', 100);
      return (Array.isArray(res) ? res : []).filter(m => m.ativo !== false);
    },
    staleTime: 5 * 60 * 1000,
  });

  const currentClassificacao = edits.classificacao ?? activity.classificacao ?? '';
  const currentMeta = edits.meta_codigo ?? activity.meta_codigo ?? activity.meta_id ?? '';
  const currentMuseu = edits.museu ?? activity.museu ?? '';

  const titulo = activity.titulo || activity.nome || activity.descricao || 'Atividade sem título';

  return (
    <div className={`rounded-xl border p-3 transition-all ${isDirty ? 'border-l-4 border-l-yellow-400 border-t-yellow-100 border-r-yellow-100 border-b-yellow-100 bg-yellow-50' : 'border-slate-100 bg-slate-50'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-slate-800 leading-snug flex-1 min-w-0 truncate">{titulo}</p>
        {isDirty && (
          <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400 text-yellow-900">Alterado</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Classificação */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Classificação</label>
          <select
            value={currentClassificacao}
            onChange={e => onEdit('classificacao', e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-300 transition"
          >
            <option value="">— selecione —</option>
            {CLASSIFICACOES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Meta vinculada */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Meta vinculada</label>
          <select
            value={currentMeta}
            onChange={e => onEdit('meta_codigo', e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-300 transition"
          >
            <option value="">— nenhuma —</option>
            {metas.map(m => (
              <option key={m.id} value={m.nome}>{m.nome}</option>
            ))}
          </select>
        </div>

        {/* Museu */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Museu</label>
          <select
            value={currentMuseu}
            onChange={e => onEdit('museu', e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-300 transition"
          >
            <option value="">— selecione —</option>
            {MUSEUS_OPTIONS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}