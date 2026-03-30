import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

function parseJSON(str, fallback = []) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

export default function ConformidadeBadge({ tp, expanded: externalExpanded }) {
  const [expanded, setExpanded] = useState(false);

  if (!tp) return null;

  const pct = tp.conformidade_percentual;
  const status = tp.conformidade_status;
  const resumo = tp.conformidade_resumo;
  const checklist = parseJSON(tp.conformidade_checklist, []);
  const duvidas = parseJSON(tp.conformidade_duvidas, []);

  if (pct === undefined || pct === null) return null;

  const isExpanded = externalExpanded !== undefined ? externalExpanded : expanded;

  const colorMap = {
    CONFORME: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2, iconColor: 'text-green-500', pctColor: 'text-green-700' },
    ATENCAO:  { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700',  icon: AlertTriangle, iconColor: 'text-amber-500',  pctColor: 'text-amber-700' },
    CRITICO:  { bg: 'bg-red-50 border-red-200',   text: 'text-red-700',   icon: XCircle,      iconColor: 'text-red-500',   pctColor: 'text-red-700' },
  };

  const cfg = colorMap[status] || colorMap.ATENCAO;
  const Icon = cfg.icon;

  const statusChecklistColor = { OK: 'text-green-600', ATENCAO: 'text-amber-600', CRITICO: 'text-red-600' };
  const statusChecklistIcon = { OK: '✓', ATENCAO: '⚠', CRITICO: '✗' };

  return (
    <div className={`rounded-lg border ${cfg.bg} p-3 text-xs`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${cfg.iconColor} flex-shrink-0`} />
          <span className={`font-semibold ${cfg.pctColor} text-sm`}>{pct}% conformidade</span>
          {status === 'CONFORME' && <span className="text-green-600">— NF OK</span>}
          {status === 'ATENCAO' && <span className="text-amber-600">— Revisar antes de aprovar</span>}
          {status === 'CRITICO' && <span className="text-red-600">— Pendências críticas</span>}
        </div>
        {externalExpanded === undefined && (
          <button onClick={() => setExpanded(e => !e)} className={`${cfg.text} hover:opacity-70`}>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {resumo && <p className={`mt-1 ${cfg.text}`}>{resumo}</p>}

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {checklist.length > 0 && (
            <div className="space-y-1">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`font-bold flex-shrink-0 ${statusChecklistColor[item.status] || 'text-gray-500'}`}>
                    {statusChecklistIcon[item.status] || '?'}
                  </span>
                  <div>
                    <span className="font-medium text-gray-700">{item.ponto}</span>
                    {item.observacao && <p className="text-gray-500">{item.observacao}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {duvidas.length > 0 && (
            <div className="mt-2 rounded bg-amber-100 border border-amber-200 p-2">
              <p className="font-semibold text-amber-800 mb-1">⚠ Dúvidas para o aprovador verificar:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                {duvidas.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}