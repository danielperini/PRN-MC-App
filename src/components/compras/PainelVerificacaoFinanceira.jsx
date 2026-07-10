import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Wrench, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

function ScoreBadge({ score }) {
  const color = score >= 90 ? 'text-green-700 bg-green-50 border-green-200'
    : score >= 70 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${color}`}>
      <ShieldCheck className="h-4 w-4" />
      Score de integridade: {score}/100
    </div>
  );
}

function IssueSection({ title, count, color, items, renderItem, expanded, onToggle }) {
  const borderColor = color === 'red' ? 'border-red-200' : color === 'amber' ? 'border-amber-200' : 'border-blue-200';
  const bgColor = color === 'red' ? 'bg-red-50' : color === 'amber' ? 'bg-amber-50' : 'bg-blue-50';
  const textColor = color === 'red' ? 'text-red-700' : color === 'amber' ? 'text-amber-700' : 'text-blue-700';
  const badgeBg = color === 'red' ? 'bg-red-100 text-red-700' : color === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';

  if (count === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <p className="text-sm text-green-700">{title} — <span className="font-semibold">Nenhum problema encontrado</span></p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 ${bgColor} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${textColor} shrink-0`} />
          <span className={`text-sm font-semibold ${textColor}`}>{title}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badgeBg}`}>{count}</span>
        </div>
        {expanded ? <ChevronUp className={`h-4 w-4 ${textColor}`} /> : <ChevronDown className={`h-4 w-4 ${textColor}`} />}
      </button>

      {expanded && items?.length > 0 && (
        <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {items.map((item, i) => (
            <div key={item.id || i} className="px-4 py-2.5 text-sm">
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PainelVerificacaoFinanceira({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);

  async function executarAuditoria() {
    setLoading(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('auditarVinculosFinanceiros', { action: 'auditar' });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || 'Erro na auditoria');
      setResultado(data);
    } catch (e) {
      toast.error('Erro ao auditar: ' + (e?.message || 'desconhecido'));
    } finally {
      setLoading(false);
    }
  }

  async function corrigirSaldos() {
    if (!window.confirm('Corrigir automaticamente os saldos divergentes?\nEsta ação recalcula valor_utilizado e saldo de cada rubrica com base nas NFs aprovadas/pagas vinculadas.')) return;
    setCorrigindo(true);
    try {
      const res = await base44.functions.invoke('auditarVinculosFinanceiros', { action: 'corrigir_saldos' });
      const data = res?.data || res;
      if (data?.success) {
        toast.success(data.message || 'Saldos corrigidos!');
        if (onSuccess) onSuccess();
        await executarAuditoria();
      } else {
        toast.error(data?.error || 'Erro ao corrigir.');
      }
    } catch (e) {
      toast.error('Erro: ' + (e?.message || 'desconhecido'));
    } finally {
      setCorrigindo(false);
    }
  }

  const toggle = (key) => setExpandedSection(prev => prev === key ? null : key);

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            Verificação de Integridade Financeira
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Verifica vínculos de NFs, centros de custo e saldos de rubricas
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {resultado?.saldosDivergentes?.count > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={corrigirSaldos}
              disabled={corrigindo}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 text-xs"
            >
              {corrigindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
              {corrigindo ? 'Corrigindo...' : `Corrigir ${resultado.saldosDivergentes.count} saldo(s)`}
            </Button>
          )}
          <Button
            size="sm"
            onClick={executarAuditoria}
            disabled={loading}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loading ? 'Verificando...' : 'Executar Verificação'}
          </Button>
        </div>
      </div>

      {!resultado && !loading && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">Clique em <strong>"Executar Verificação"</strong> para auditar os vínculos financeiros</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10 gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Analisando NFs, centros de custo e rubricas...</span>
        </div>
      )}

      {resultado && (
        <div className="space-y-4">
          {/* Score e resumo */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <ScoreBadge score={resultado.score} />
            <p className="text-xs text-gray-500">
              {resultado.stats?.total_purchases} solicitações · {resultado.stats?.total_rubricas} rubricas · {resultado.stats?.centros_com_rubrica} centros com rubrica
            </p>
          </div>

          {resultado.totalIssues === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-4">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <p className="text-sm font-semibold text-green-700">Tudo certo! Nenhum problema encontrado nos vínculos financeiros.</p>
            </div>
          )}

          {/* Seção 1: Sem centro de custo */}
          <IssueSection
            title="Solicitações sem Centro de Custo"
            count={resultado.semCentro.count}
            color="red"
            items={resultado.semCentro.items}
            expanded={expandedSection === 'semCentro'}
            onToggle={() => toggle('semCentro')}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{item.descricao}</p>
                  <p className="text-xs text-gray-500">Fornecedor: {item.fornecedor} · NF: {item.nf_numero}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-gray-900">{fmtBRL(item.valor)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    item.status === 'PAGO' ? 'bg-emerald-100 text-emerald-700' :
                    item.status?.includes('APROVADO') ? 'bg-green-100 text-green-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{item.status}</span>
                </div>
              </div>
            )}
          />

          {/* Seção 2: Sem rubrica */}
          <IssueSection
            title="Solicitações sem Rubrica vinculada"
            count={resultado.semRubrica.count}
            color="red"
            items={resultado.semRubrica.items}
            expanded={expandedSection === 'semRubrica'}
            onToggle={() => toggle('semRubrica')}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{item.descricao}</p>
                  <p className="text-xs text-gray-500">CC: {item.centro_custo} · NF: {item.nf_numero}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-gray-900">{fmtBRL(item.valor)}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{item.status}</span>
                </div>
              </div>
            )}
          />

          {/* Seção 3: Centros sem rubrica */}
          <IssueSection
            title="Centros de Custo sem Rubrica cadastrada"
            count={resultado.centrosSemRubrica.count}
            color="amber"
            items={resultado.centrosSemRubrica.items}
            expanded={expandedSection === 'centrosSemRubrica'}
            onToggle={() => toggle('centrosSemRubrica')}
            renderItem={(item) => (
              <p className="text-gray-700 font-medium">{item}</p>
            )}
          />

          {/* Seção 4: Saldos divergentes */}
          <IssueSection
            title="Rubricas com saldo divergente"
            count={resultado.saldosDivergentes.count}
            color="amber"
            items={resultado.saldosDivergentes.items}
            expanded={expandedSection === 'saldosDivergentes'}
            onToggle={() => toggle('saldosDivergentes')}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{item.rubrica}</p>
                  <p className="text-xs text-gray-500">CC: {item.centro_custo} · {item.qtd_compras} compras</p>
                </div>
                <div className="text-right shrink-0 text-xs space-y-0.5">
                  <p><span className="text-gray-500">No banco:</span> <span className="font-semibold">{fmtBRL(item.utilizado_banco)}</span></p>
                  <p><span className="text-gray-500">Calculado:</span> <span className="font-semibold text-amber-700">{fmtBRL(item.utilizado_real)}</span></p>
                  <p><span className="text-gray-500">Dif:</span> <span className={`font-bold ${item.diferenca > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmtBRL(item.diferenca)}</span></p>
                </div>
              </div>
            )}
          />

          {/* Seção 5: CC divergente entre NF e rubrica */}
          <IssueSection
            title="Solicitações com Centro de Custo diferente da Rubrica"
            count={resultado.ccDivergente.count}
            color="amber"
            items={resultado.ccDivergente.items}
            expanded={expandedSection === 'ccDivergente'}
            onToggle={() => toggle('ccDivergente')}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{item.descricao}</p>
                  <p className="text-xs text-gray-500">Rubrica: {item.rubrica_nome}</p>
                  <p className="text-xs">
                    <span className="text-gray-500">CC NF:</span> <span className="font-medium text-red-600">{item.cc_solicitacao}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="text-gray-500">CC Rubrica:</span> <span className="font-medium text-green-700">{item.cc_rubrica}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-gray-900">{fmtBRL(item.valor)}</p>
                  <span className="text-xs text-gray-500">{item.status}</span>
                </div>
              </div>
            )}
          />
        </div>
      )}
    </Card>
  );
}