import React from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const ICONES_SECAO = {
  identificacao: '🏛️',
  endereco_execucao: '📍',
  divulgacao_parceria: '📢',
  descricao_acoes: '📝',
  publico_alvo: '👥',
  pesquisa_satisfacao: '⭐',
  cronograma_metas: '🎯',
  equipe_trabalho: '👷',
  impactos_economicos_sociais: '💡',
  sustentabilidade: '🌱',
  avaliacao_parceria: '🤝',
  anexos_evidencias: '📎',
  assinatura: '✍️',
  auditoria: '🔍',
};

// status: 'pendente' | 'processando' | 'concluida' | 'falhou' | 'pulada'
export default function GeracaoProgressoPanel({ secoes, progresso, visible }) {
  if (!visible) return null;

  const concluidas = secoes.filter(s => s.status === 'concluida').length;
  const total = secoes.length;
  const atual = secoes.find(s => s.status === 'processando');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
            <h2 className="font-semibold text-lg">Gerando Relatório de Execução</h2>
          </div>
          <Progress value={progresso.valor} className="h-2 bg-slate-700 [&>div]:bg-yellow-400" />
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>{progresso.texto}</span>
            <span>{progresso.valor}%</span>
          </div>
        </div>

        {/* Resumo */}
        <div className="px-6 py-3 bg-slate-50 border-b flex items-center justify-between text-sm">
          <span className="text-slate-500">{concluidas} de {total} seções concluídas</span>
          {atual && (
            <span className="text-blue-600 font-medium flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {ICONES_SECAO[atual.key] || '⚙️'} {atual.label}
            </span>
          )}
        </div>

        {/* Lista de seções */}
        <div className="px-4 py-3 max-h-72 overflow-y-auto space-y-1">
          {secoes.map(s => (
            <div
              key={s.key}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                s.status === 'processando'
                  ? 'bg-blue-50 border border-blue-200'
                  : s.status === 'concluida'
                  ? 'bg-green-50'
                  : s.status === 'falhou' || s.status === 'pulada'
                  ? 'bg-red-50'
                  : 'bg-white'
              }`}
            >
              <span className="text-base w-6 text-center">{ICONES_SECAO[s.key] || '⚙️'}</span>
              <span className={`flex-1 ${s.status === 'pendente' ? 'text-slate-400' : 'text-slate-700'}`}>
                {s.label}
              </span>
              <StatusIcon status={s.status} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t text-xs text-slate-400 text-center">
          ⏱ Processo automático — não feche esta janela
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'processando') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  if (status === 'concluida')   return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === 'falhou')      return <XCircle className="w-4 h-4 text-red-400" />;
  if (status === 'pulada')      return <XCircle className="w-4 h-4 text-orange-400" />;
  return <Clock className="w-4 h-4 text-slate-300" />;
}