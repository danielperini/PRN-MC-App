import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertCircle, AlertTriangle, Info, CheckCircle, Loader2, Zap, Copy } from 'lucide-react';
import { toast } from 'sonner';

const severityConfig = {
  critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: '🔴 Crítico' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: '🟡 Aviso' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: '🔵 Info' }
};

const qualityConfig = {
  'Excelente': { color: 'text-green-700', bg: 'bg-green-100', emoji: '✅' },
  'Bom': { color: 'text-emerald-700', bg: 'bg-emerald-100', emoji: '👍' },
  'Adequado': { color: 'text-yellow-700', bg: 'bg-yellow-100', emoji: '⚠️' },
  'Precisa Melhorar': { color: 'text-red-700', bg: 'bg-red-100', emoji: '❌' }
};

export default function DebugPanel({ reportId, report, onClose }) {
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleRunDebug = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('autoDebugReport', { reportId });
      if (response.data.success) {
        setDebug(response.data.debug);
        toast.success('Análise concluída!');
      }
    } catch (error) {
      toast.error('Erro na análise: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySuggestion = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  if (!debug) {
    return (
      <div className="border-2 border-slate-200 rounded-xl p-6 bg-slate-50">
        <div className="flex items-start gap-4">
          <Zap className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 mb-2">🔍 Análise Automática de Qualidade</h3>
            <p className="text-sm text-slate-600 mb-4">
              Claude analisará o relatório e identificará: dados ausentes, inconsistências, qualidade do texto e oportunidades de melhoria.
            </p>
            <Button
              onClick={handleRunDebug}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? 'Analisando...' : 'Iniciar Análise'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { issues = [], summary = '', overallQuality = 'Adequado' } = debug;
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const qualityStyle = qualityConfig[overallQuality] || qualityConfig['Adequado'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-2 border-slate-200 rounded-xl p-6 bg-white">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-bold text-lg text-slate-900 mb-1">📊 Resultado da Análise</h3>
            <p className="text-sm text-slate-600">{summary}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-lg font-medium text-sm ${qualityStyle.bg} ${qualityStyle.color}`}>
            {qualityStyle.emoji} {overallQuality}
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
            <div className="text-lg font-bold text-red-700">{criticalCount}</div>
            <div className="text-xs text-red-600">Críticos</div>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
            <div className="text-lg font-bold text-amber-700">{warningCount}</div>
            <div className="text-xs text-amber-600">Avisos</div>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="text-lg font-bold text-blue-700">{infoCount}</div>
            <div className="text-xs text-blue-600">Informativos</div>
          </div>
        </div>
      </div>

      {/* Issues */}
      {issues.length === 0 ? (
        <div className="p-6 bg-green-50 border-2 border-green-200 rounded-xl text-center">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="font-bold text-green-900">Perfeito! Nenhum problema encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue, idx) => {
            const cfg = severityConfig[issue.severity];
            const Icon = cfg.icon;

            return (
              <div key={idx} className={`border-2 rounded-xl overflow-hidden ${cfg.border} ${cfg.bg}`}>
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }))}
                  className="w-full p-4 flex items-start justify-between hover:opacity-90 transition-opacity text-left"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <Icon className={`w-5 h-5 ${cfg.color} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1">
                      <div className="font-bold text-slate-900">{cfg.label}: {issue.section}</div>
                      <div className="text-sm text-slate-700 mt-1">{issue.problem}</div>
                    </div>
                  </div>
                  <div className="text-2xl flex-shrink-0 ml-2">
                    {expanded[idx] ? '▼' : '▶'}
                  </div>
                </button>

                {expanded[idx] && (
                  <div className="border-t-2 inherit px-4 py-4 bg-white space-y-3">
                    <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
                      <div className="text-xs font-bold text-blue-900 mb-2">💡 SUGESTÃO DE CORREÇÃO:</div>
                      <div className="text-sm text-blue-900 mb-3">{issue.suggestion}</div>
                      <Button
                        onClick={() => handleCopySuggestion(issue.suggestion, idx)}
                        size="sm"
                        variant="outline"
                        className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        {copiedIdx === idx ? '✓ Copiado' : <><Copy className="w-3 h-3 mr-1" /> Copiar Sugestão</>}
                      </Button>
                    </div>

                    {/* Ação rápida */}
                    <div className="p-3 bg-slate-100 rounded-lg text-xs text-slate-700 font-medium">
                      <div className="mb-2">🎯 AÇÃO:</div>
                      <div className="space-y-1">
                        {issue.severity === 'critical' ? (
                          <div>✅ Rejeitar relatório até corrigir</div>
                        ) : issue.severity === 'warning' ? (
                          <div>⚠️ Pedir ajustes específicos</div>
                        ) : (
                          <div>ℹ️ Deixar como comentário opcional</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleRunDebug}
          disabled={loading}
          variant="outline"
          className="text-blue-600 border-blue-300 hover:bg-blue-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
          Re-analisar
        </Button>
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1"
        >
          Fechar
        </Button>
      </div>
    </div>
  );
}