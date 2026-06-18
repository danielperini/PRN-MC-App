import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, ListChecks, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Fallback robusto de metas com código
const METAS_FALLBACK = [
  { id: null, nome: 'Meta 01 - Equipe principal', codigo: 'META 01' },
  { id: null, nome: 'Meta 02 - Comunicação', codigo: 'META 02' },
  { id: null, nome: 'Meta 03 - Manutenção das exposições', codigo: 'META 03' },
  { id: null, nome: 'Meta 04 - Alteração de núcleos e salas expositivas', codigo: 'META 04' },
  { id: null, nome: 'Meta 05 - Atividades Educativas e Culturais', codigo: 'META 05' },
  { id: null, nome: 'Meta 06 - Formação', codigo: 'META 06' },
  { id: null, nome: 'Meta 07 - Contratação de educadores', codigo: 'META 07' },
  { id: null, nome: 'Meta 08 - Mobilização de público', codigo: 'META 08' },
  { id: null, nome: 'Meta 09 - Território e entorno', codigo: 'META 09' },
  { id: null, nome: 'Meta 10 - Mostras e exposições', codigo: 'META 10' },
  { id: null, nome: 'Meta 11 - Noturno nos Museus', codigo: 'META 11' },
  { id: null, nome: 'Meta 12 - Exposição MHAB', codigo: 'META 12' },
  { id: null, nome: 'Meta 12B - Exposição MUMO', codigo: 'META 12B' },
  { id: null, nome: 'Meta 13 - Ações educativas itinerantes', codigo: 'META 13' },
  { id: null, nome: 'Meta 14 - Acessibilidade', codigo: 'META 14' },
  { id: null, nome: 'Meta 15 - Diárias de educadores', codigo: 'META 15' },
  { id: null, nome: 'Meta 16 - Publicações e catálogos', codigo: 'META 16' },
  { id: null, nome: 'Meta 17 - Custeio das atividades', codigo: 'META 17' },
  { id: null, nome: 'Meta 18 - Gestão e administração', codigo: 'META 18' },
];

function toNumber(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function extractMetaCodigo(activity) {
  // Extrai código da meta: "META 05" ou "05"
  const codigo = activity.meta_codigo || '';
  if (codigo) return codigo.trim().toUpperCase();

  // Tenta extrair do meta_id se for um ID numérico
  const metaId = activity.meta_id || '';
  return metaId ? `META ${metaId}` : null;
}

export default function ResumoAtividadesPorMeta() {
  // Busca atividades
  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['resumo-atividades-por-meta'],
    queryFn: async () => {
      try {
        const data = await base44.entities.Activity.list('-created_date', 2000);
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 3,
    refetchOnWindowFocus: false,
  });

  // Busca metas cadastradas
  const { data: projectMetas = [] } = useQuery({
    queryKey: ['resumo-project-metas'],
    queryFn: async () => {
      try {
        const data = await base44.entities.ProjectMeta.list('ordem', 50);
        return Array.isArray(data) ? data.filter((m) => m.ativo !== false) : [];
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const resumo = useMemo(() => {
    // Mapa de código da meta → nome
    const codigoParaNome = {};
    METAS_FALLBACK.forEach((m) => {
      codigoParaNome[normalize(m.codigo)] = m.nome;
    });
    projectMetas.forEach((m) => {
      const nome = m.nome || '';
      const match = nome.match(/(META\s*\d+[A-Za-z]?)/i);
      if (match) {
        codigoParaNome[normalize(match[1])] = nome;
      }
    });

    // Agrupa atividades por código da meta
    const grupos = {};
    let semMeta = { atividades: 0, publico: 0 };

    activities.forEach((a) => {
      const codigo = extractMetaCodigo(a);
      const publico = toNumber(a.publico_total || a.publico_estimado || 0);

      if (codigo && codigo !== 'META ') {
        const key = normalize(codigo);
        if (!grupos[key]) {
          grupos[key] = { codigo, atividades: 0, publico: 0 };
        }
        grupos[key].atividades += 1;
        grupos[key].publico += publico;
      } else {
        // Classificação ROTINA ou EXTRA (sem meta)
        semMeta.atividades += 1;
        semMeta.publico += publico;
      }
    });

    // Ordena por código da meta
    const ordenado = Object.values(grupos).sort((a, b) => {
      const numA = parseInt((a.codigo.match(/\d+/) || ['99'])[0], 10);
      const numB = parseInt((b.codigo.match(/\d+/) || ['99'])[0], 10);
      return numA - numB;
    });

    // Enriquece com nome da meta
    const resultado = ordenado.map((g) => {
      const key = normalize(g.codigo);
      return {
        ...g,
        nome: codigoParaNome[key] || g.codigo,
      };
    });

    return { metas: resultado, semMeta, totalAtividades: activities.length };
  }, [activities, projectMetas]);

  if (loadingActivities) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Carregando resumo por meta...</span>
        </div>
      </div>
    );
  }

  if (resumo.metas.length === 0 && resumo.semMeta.atividades === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500 text-center">Nenhuma atividade cadastrada ainda.</p>
      </div>
    );
  }

  const totalPublico = resumo.metas.reduce((s, m) => s + m.publico, 0) + resumo.semMeta.publico;
  const totalAtividades = resumo.totalAtividades;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-lg font-semibold text-slate-900">Atividades e Público por Meta</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Consolidação para conferência dos relatórios mensais
        </p>
      </div>

      {/* Totais gerais */}
      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <ListChecks className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Total de Atividades</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalAtividades}</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Público Total</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {totalPublico.toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      {/* Tabela por meta */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/30">
              <th className="text-left px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Meta</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Atividades</th>
              <th className="text-right px-6 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Público</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {resumo.metas.map((meta, idx) => (
              <tr
                key={meta.codigo}
                className={cn(
                  'hover:bg-slate-50/50 transition-colors',
                  idx % 2 === 0 && 'bg-white',
                  idx % 2 === 1 && 'bg-slate-50/20'
                )}
              >
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                      {meta.codigo.replace('META ', '')}
                    </span>
                    <span className="text-slate-700 truncate">{meta.nome}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={cn(
                    'font-semibold tabular-nums',
                    meta.atividades > 0 ? 'text-slate-800' : 'text-slate-300'
                  )}>
                    {meta.atividades}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <span className={cn(
                    'font-semibold tabular-nums',
                    meta.publico > 0 ? 'text-slate-800' : 'text-slate-300'
                  )}>
                    {meta.publico.toLocaleString('pt-BR')}
                  </span>
                </td>
              </tr>
            ))}

            {/* Linha para atividades sem meta (ROTINA/EXTRA) */}
            {resumo.semMeta.atividades > 0 && (
              <tr className="bg-amber-50/30 hover:bg-amber-50/50 transition-colors">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                      ROTINA / EXTRA
                    </span>
                    <span className="text-slate-500 text-xs">Sem meta vinculada</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-amber-700 tabular-nums">
                  {resumo.semMeta.atividades}
                </td>
                <td className="px-6 py-3 text-right font-semibold text-amber-700 tabular-nums">
                  {resumo.semMeta.publico.toLocaleString('pt-BR')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}