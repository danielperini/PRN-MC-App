import React from 'react';

const severityClass = {
  error: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function AuditIssueList({ issues = [] }) {
  if (!issues.length) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        Nenhuma inconsistência encontrada no recorte atual.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-foreground">Inconsistências e conciliações</h2>
        <p className="text-xs text-muted-foreground mt-1">Registros detectados pelo motor central de auditoria.</p>
      </div>
      <div className="divide-y divide-border max-h-[520px] overflow-auto">
        {issues.map((issue, index) => (
          <div key={`${issue.type}-${issue.entityId || index}`} className="px-5 py-4 flex gap-3 items-start">
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${severityClass[issue.severity] || severityClass.info}`}>
              {issue.severity || 'info'}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{issue.message}</p>
              <p className="text-xs text-muted-foreground mt-1">{issue.type}{issue.entityId ? ` · ${issue.entityId}` : ''}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
