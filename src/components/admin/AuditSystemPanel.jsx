import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Clock, Loader2, AlertTriangle, Bug } from 'lucide-react';
import { toast } from 'sonner';

export default function AuditSystemPanel() {
  const [loading, setLoading] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);

  async function runAudit() {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('auditSystemConsistency', {});
      const data = result?.data || result || {};

      setAuditResult(data);

      if (data.audit_summary?.critical_error_count > 0) {
        toast.error(`❌ Auditoria identificou ${data.audit_summary.critical_error_count} erros críticos!`);
      } else if (data.audit_summary?.medium_error_count > 0) {
        toast.warning(`⚠️ Auditoria identificou ${data.audit_summary.medium_error_count} erros médios`);
      } else {
        toast.success('✅ Auditoria concluída - Sistema OK');
      }
    } catch (e) {
      toast.error(`Erro ao executar auditoria: ${e.message}`);
      console.error('Audit error:', e);
    } finally {
      setLoading(false);
    }
  }

  if (!auditResult) {
    return (
      <div className="space-y-4">
        <Card className="p-6 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900">Auditoria do Sistema</h3>
          </div>
          <p className="text-sm text-amber-800 mb-4">
            Execute uma auditoria completa para verificar:
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              <li>Duplicação de pagamentos</li>
              <li>Consistência de rubricas</li>
              <li>Documentos órfãos</li>
              <li>Inconsistências financeiras</li>
              <li>Integridade de dados</li>
            </ul>
          </p>
          <Button onClick={runAudit} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executando auditoria...
              </>
            ) : (
              '🔍 Executar Auditoria Completa'
            )}
          </Button>
        </Card>
      </div>
    );
  }

  const { audit_summary = {}, audit = {} } = auditResult;

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-gradient-to-r from-slate-50 to-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-slate-600" />
            <div>
              <h3 className="font-semibold">Resultado da Auditoria</h3>
              <p className="text-xs text-slate-500">{audit_summary.timestamp}</p>
            </div>
          </div>
          <Button onClick={runAudit} disabled={loading} size="sm" variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔄 Re-auditar'}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`rounded-lg p-3 ${audit_summary.critical_error_count > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="text-xs text-slate-600 font-medium">Erros Críticos</div>
            <div className={`text-2xl font-bold ${audit_summary.critical_error_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {audit_summary.critical_error_count || 0}
            </div>
          </div>

          <div className={`rounded-lg p-3 ${audit_summary.medium_error_count > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
            <div className="text-xs text-slate-600 font-medium">Erros Médios</div>
            <div className={`text-2xl font-bold ${audit_summary.medium_error_count > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {audit_summary.medium_error_count || 0}
            </div>
          </div>

          <div className="rounded-lg p-3 bg-blue-50 border border-blue-200">
            <div className="text-xs text-slate-600 font-medium">Riscos Financeiros</div>
            <div className="text-2xl font-bold text-blue-600">{audit_summary.financial_risks || 0}</div>
          </div>

          <div className="rounded-lg p-3 bg-purple-50 border border-purple-200">
            <div className="text-xs text-slate-600 font-medium">Inconsistências</div>
            <div className="text-2xl font-bold text-purple-600">{audit_summary.inconsistencies_found || 0}</div>
          </div>
        </div>
      </Card>

      {/* ESTATÍSTICAS */}
      {audit.stats && (
        <Card className="p-6">
          <h4 className="font-semibold mb-3">📊 Estatísticas do Sistema</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <span className="text-xs text-slate-600">Total TeamPayment</span>
              <div className="font-semibold">{audit.stats.team_payments_total}</div>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <span className="text-xs text-red-600">Pagamentos Duplicados</span>
              <div className="font-semibold text-red-600">{audit.stats.team_payments_duplicated}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <span className="text-xs text-slate-600">Total Relatórios</span>
              <div className="font-semibold">{audit.stats.reports_total}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <span className="text-xs text-slate-600">Total Documentos</span>
              <div className="font-semibold">{audit.stats.documents_total}</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <span className="text-xs text-amber-600">Documentos Órfãos</span>
              <div className="font-semibold text-amber-600">{audit.stats.documents_orphan}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <span className="text-xs text-slate-600">Logs de Auditoria</span>
              <div className="font-semibold">{audit.stats.audit_logs_total}</div>
            </div>
          </div>
        </Card>
      )}

      {/* ERROS CRÍTICOS */}
      {audit.critical_errors && audit.critical_errors.length > 0 && (
        <Card className="p-6 border-red-200 bg-red-50">
          <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            🚨 Erros Críticos ({audit.critical_errors.length})
          </h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {audit.critical_errors.map((err, i) => (
              <div key={i} className="rounded-lg bg-white p-3 border border-red-100 text-sm">
                <div className="font-mono text-xs text-red-600 mb-1">{err.type}</div>
                <div className="text-slate-700">{err.message}</div>
                {err.payment_ids && (
                  <div className="text-xs text-red-600 mt-2">
                    IDs: {err.payment_ids.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ERROS MÉDIOS */}
      {audit.medium_errors && audit.medium_errors.length > 0 && (
        <Card className="p-6 border-amber-200 bg-amber-50">
          <h4 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            ⚠️ Erros Médios ({audit.medium_errors.length})
          </h4>
          <button
            onClick={() => setExpandedSection(expandedSection === 'medium' ? null : 'medium')}
            className="text-sm text-amber-700 hover:underline mb-2"
          >
            {expandedSection === 'medium' ? '▼ Ocultar' : '▶ Expandir'}
          </button>
          {expandedSection === 'medium' && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {audit.medium_errors.map((err, i) => (
                <div key={i} className="rounded-lg bg-white p-3 border border-amber-100 text-sm">
                  <div className="font-mono text-xs text-amber-600 mb-1">{err.type}</div>
                  <div className="text-slate-700">{err.message}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* RISCOS FINANCEIROS */}
      {audit.financial_risks && audit.financial_risks.length > 0 && (
        <Card className="p-6 border-blue-200 bg-blue-50">
          <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Bug className="w-5 h-5" />
            💰 Riscos Financeiros ({audit.financial_risks.length})
          </h4>
          <button
            onClick={() => setExpandedSection(expandedSection === 'financial' ? null : 'financial')}
            className="text-sm text-blue-700 hover:underline mb-2"
          >
            {expandedSection === 'financial' ? '▼ Ocultar' : '▶ Expandir'}
          </button>
          {expandedSection === 'financial' && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {audit.financial_risks.map((risk, i) => (
                <div key={i} className="rounded-lg bg-white p-3 border border-blue-100 text-sm">
                  <div className="font-mono text-xs text-blue-600 mb-1">{risk.type}</div>
                  <div className="text-slate-700 mb-1">{risk.message}</div>
                  <div className="text-xs text-slate-600">
                    {risk.rubrica_nome && <div>Rubrica: {risk.rubrica_nome}</div>}
                    {risk.saldo_calculado && <div>Saldo: R$ {risk.saldo_calculado}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* SUGESTÕES */}
      {audit.suggestions && audit.suggestions.length > 0 && (
        <Card className="p-6 border-green-200 bg-green-50">
          <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            💡 Sugestões de Correção
          </h4>
          <ul className="space-y-2">
            {audit.suggestions.map((sugg, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-green-900">
                <span className="text-green-600 mt-1">✓</span>
                <span>{sugg}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!audit.critical_errors?.length && !audit.medium_errors?.length && (
        <Card className="p-6 border-green-200 bg-green-50">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <div>
              <h4 className="font-semibold text-green-900">✅ Sistema OK</h4>
              <p className="text-sm text-green-700">Nenhum erro crítico ou médio identificado</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}