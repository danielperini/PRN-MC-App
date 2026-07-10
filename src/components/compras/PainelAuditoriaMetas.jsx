import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Wrench, ChevronDown, ChevronUp, Loader2, BarChart3
} from 'lucide-react';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

function StatCard({ label, value, sub, color = 'gray' }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    gray: 'bg-gray-50 border-gray-200 text-gray-900',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <div className="text-xs font-semibold opacity-70 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function IssueSection({ title, count, color, items, renderItem, expanded, onToggle }) {
  const styles = {
    red: { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
    amber: { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
    blue: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  };
  const s = styles[color] || styles.amber;

  if (count === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <p className="text-sm text-green-700">{title} — <strong>Nenhum problema encontrado</strong></p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${s.border} overflow-hidden`}>
      <button onClick={onToggle} className={`w-full flex items-center justify-between px-4 py-3 ${s.bg}`}>
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${s.text} shrink-0`} />
          <span className={`text-sm font-semibold ${s.text}`}>{title}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.badge}`}>{count}</span>
        </div>
        {expanded ? <ChevronUp className={`h-4 w-4 ${s.text}`} /> : <ChevronDown className={`h-4 w-4 ${s.text}`} />}
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

export default function PainelAuditoriaMetas({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const toggle = (key) => setExpanded(prev => prev === key ? null : key);

  async function executarAuditoria() {
    setLoading(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('auditarVinculosMetasNotasFiscais', { action: 'auditar' });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || 'Erro na auditoria');
      setResultado(data);
    } catch (e) {
      toast.error('Erro ao auditar: ' + (e?.message || 'desconhecido'));
    } finally {
      setLoading(false);
    }
  }

  async function corrigirProblemas() {
    if (!window.confirm('Corrigir automaticamente os vínculos de NFs com rubricas incompatíveis?\nApenas casos com ambiguidade mínima serão corrigidos. Os demais serão marcados para revisão.')) return;
    setCorrigindo(true);
    try {
      const res = await base44.functions.invoke('auditarVinculosMetasNotasFiscais', { action: 'corrigir', auto_corrigir: true });
      const data = res?.data || res;
      if (data?.success) {
        toast.success(`${data.resumo?.corrigidas_auto || 0} registros corrigidos!`);
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

  const r = resultado?.resumo;
  const problemas = r ? (r.sem_meta + r.rubrica_incompativel) : 0;

  // Agrupar detalhes por status
  const detalhes = resultado?.detalhes || [];
  const semMeta = detalhes.filter(d => d.status === 'revisao_necessaria');
  const incompativeis = detalhes.filter(d => d.status === 'rubrica_incompativel');
  const duplicatas = detalhes.filter(d => d.status === 'duplicata');

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-600" />
            Auditoria de Metas e Notas Fiscais
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Verifica vínculos NF → Rubrica → Meta · 3º e 4º Aditivos
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {r && problemas > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={corrigirProblemas}
              disabled={corrigindo}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 text-xs"
            >
              {corrigindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
              {corrigindo ? 'Corrigindo...' : `Corrigir ${problemas} problema(s)`}
            </Button>
          )}
          <Button
            size="sm"
            onClick={executarAuditoria}
            disabled={loading}
            className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loading ? 'Auditando...' : 'Executar Auditoria'}
          </Button>
        </div>
      </div>

      {!resultado && !loading && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">Clique em <strong>"Executar Auditoria"</strong> para verificar todos os vínculos de NFs com metas</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10 gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Auditando NFs, rubricas, metas e aditivos...</span>
        </div>
      )}

      {resultado && r && (
        <div className="space-y-4">
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Auditadas" value={r.total_auditadas} color="gray" />
            <StatCard label="Vinculadas Correto" value={r.vinculadas_correto} color="green" sub={`${Math.round((r.vinculadas_correto / Math.max(r.total_auditadas, 1)) * 100)}%`} />
            <StatCard label="Sem Meta" value={r.sem_meta} color={r.sem_meta > 0 ? 'red' : 'green'} />
            <StatCard label="Rubrica Incompatível" value={r.rubrica_incompativel} color={r.rubrica_incompativel > 0 ? 'amber' : 'green'} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Duplicatas Ignoradas" value={r.duplicatas_ignoradas} color={r.duplicatas_ignoradas > 0 ? 'amber' : 'green'} sub={fmtBRL(r.valor_ignorado_duplicidade)} />
            <StatCard label="Valor 3º Aditivo" value={fmtBRL(r.valor_3_aditivo)} color="blue" />
            <StatCard label="Valor 4º Aditivo" value={fmtBRL(r.valor_4_aditivo)} color="indigo" />
            <StatCard label="Fora de Meta" value={fmtBRL(r.valor_fora_de_meta)} color={r.valor_fora_de_meta > 0 ? 'red' : 'green'} />
          </div>

          {problemas === 0 && r.duplicatas_ignoradas === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-4">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <p className="text-sm font-semibold text-green-700">Tudo certo! Todas as NFs estão vinculadas corretamente às metas.</p>
            </div>
          )}

          {/* Seções de problemas */}
          <IssueSection
            title="NFs sem Meta (sem centro ou sem rubrica)"
            count={semMeta.length}
            color="red"
            items={semMeta.slice(0, 50)}
            expanded={expanded === 'semMeta'}
            onToggle={() => toggle('semMeta')}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">{item.motivo}</p>
                  <p className="text-xs text-gray-400">CC: {item.ccNorm || '—'} · Aditivo: {item.aditivo}</p>
                </div>
                <span className="font-semibold text-gray-900 shrink-0">{fmtBRL(item.valor)}</span>
              </div>
            )}
          />

          <IssueSection
            title="NFs com Rubrica Incompatível (Noturno vs 3º Aditivo)"
            count={incompativeis.length}
            color="amber"
            items={incompativeis.slice(0, 50)}
            expanded={expanded === 'incompativel'}
            onToggle={() => toggle('incompativel')}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 text-xs truncate">{item.rubrica_nome}</p>
                  <p className="text-xs">
                    <span className="text-gray-500">CC NF:</span> <span className="font-medium text-red-600">{item.ccNorm}</span>
                    <span className="mx-1 text-gray-400">→</span>
                    <span className="text-gray-500">CC Rubrica:</span> <span className="font-medium text-amber-700">{item.rubrica_cc}</span>
                  </p>
                </div>
                <span className="font-semibold text-gray-900 shrink-0">{fmtBRL(item.valor)}</span>
              </div>
            )}
          />

          <IssueSection
            title="Duplicatas Ignoradas no Somatório"
            count={duplicatas.length}
            color="blue"
            items={duplicatas.slice(0, 50)}
            expanded={expanded === 'duplicatas'}
            onToggle={() => toggle('duplicatas')}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-gray-500">{item.motivo}</p>
                <span className="font-semibold text-gray-900 shrink-0">{fmtBRL(item.valor)}</span>
              </div>
            )}
          />

          {/* Por meta */}
          {resultado.por_meta?.length > 0 && (
            <div>
              <button onClick={() => toggle('porMeta')} className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                <BarChart3 className="h-4 w-4" />
                Valor utilizado por Meta
                {expanded === 'porMeta' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {expanded === 'porMeta' && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {resultado.por_meta.map((m, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-gray-800">{m.meta}</p>
                        <p className="text-xs text-gray-500">{m.aditivo === '4_aditivo' ? '4º Aditivo' : '3º Aditivo'} · {m.qtd_notas} NFs</p>
                      </div>
                      <span className="font-semibold text-gray-900 text-sm">{fmtBRL(m.valor_utilizado)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400 text-right">Auditado em: {new Date(resultado.auditado_em).toLocaleString('pt-BR')}</p>
        </div>
      )}
    </Card>
  );
}