import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Activity,
  Users,
  Receipt,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

const fmtInt = (v) => Math.round(Number(v || 0)).toLocaleString('pt-BR');
const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function safeList(entityName, sort = '-created_date', limit = 2000) {
  try {
    const entity = base44.entities?.[entityName];
    if (!entity?.list) return [];
    const result = await entity.list(sort, limit);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

function StatusBadge({ status }) {
  if (status === 'ok') return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3" />Validado</span>;
  if (status === 'divergencia') return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><AlertTriangle className="w-3 h-3" />Divergência</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5"><XCircle className="w-3 h-3" />Crítico</span>;
}

function MetricCard({ icon: Icon, label, total, validado, divergencia, critico, extra, color = 'blue' }) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    purple: 'border-purple-200 bg-purple-50',
    rose: 'border-rose-200 bg-rose-50',
  };
  const iconColors = {
    blue: 'text-blue-600',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
    rose: 'text-rose-600',
  };

  return (
    <div className={`rounded-2xl border ${colors[color]} p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${iconColors[color]}`} />
          <span className="text-sm font-semibold text-slate-700">{label}</span>
        </div>
        <span className="text-2xl font-bold text-slate-900">{fmtInt(total)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-white border border-emerald-200 p-2 text-center">
          <p className="text-emerald-700 font-bold text-base">{fmtInt(validado)}</p>
          <p className="text-slate-500 mt-0.5">Validados</p>
        </div>
        <div className="rounded-lg bg-white border border-amber-200 p-2 text-center">
          <p className="text-amber-700 font-bold text-base">{fmtInt(divergencia)}</p>
          <p className="text-slate-500 mt-0.5">Divergências</p>
        </div>
        <div className="rounded-lg bg-white border border-red-200 p-2 text-center">
          <p className="text-red-700 font-bold text-base">{fmtInt(critico)}</p>
          <p className="text-slate-500 mt-0.5">Críticos</p>
        </div>
      </div>
      {extra && <p className="text-xs text-slate-500 border-t border-white/60 pt-2">{extra}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-slate-800">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100 p-5">{children}</div>}
    </div>
  );
}

function IssueRow({ label, status, detalhe }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
      <div className="mt-0.5"><StatusBadge status={status} /></div>
      <div className="flex-1">
        <p className="text-sm text-slate-800">{label}</p>
        {detalhe && <p className="text-xs text-slate-500 mt-0.5">{detalhe}</p>}
      </div>
    </div>
  );
}

export default function PainelAuditoriaInstitucional() {
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [reports, activities, purchases, teamPayments] = await Promise.all([
        safeList('Report', '-created_date', 500),
        safeList('Activity', '-created_date', 2000),
        safeList('PurchaseRequest', '-created_date', 1000),
        safeList('TeamPayment', '-created_date', 500),
      ]);
      setRaw({ reports, activities, purchases, teamPayments });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const audit = useMemo(() => {
    if (!raw) return null;
    const { reports, activities, purchases, teamPayments } = raw;

    // ── RELATÓRIOS ──────────────────────────────────────────
    const relatoriosAprovados = reports.filter(r => r.status === 'APPROVED');
    const relatoriosSubmetidos = reports.filter(r => r.status === 'SUBMITTED' || r.status === 'IN_REVIEW');
    const relatoriosSemAtividades = reports.filter(r => {
      const acts = activities.filter(a => a.report_id === r.id);
      return acts.length === 0;
    });
    const relatoriosDraft = reports.filter(r => r.status === 'DRAFT');

    const relatoriosOk = relatoriosAprovados.filter(r => {
      const acts = activities.filter(a => a.report_id === r.id);
      return acts.length > 0;
    }).length;
    const relatoriosDivergencia = relatoriosSemAtividades.filter(r => r.status === 'APPROVED').length + relatoriosSubmetidos.length;
    const relatoriosCritico = relatoriosDraft.length;

    // ── ATIVIDADES ────────────────────────────────────────────
    const atividadesSemRelatorio = activities.filter(a => !a.report_id || !reports.find(r => r.id === a.report_id));
    const atividadesSemClassificacao = activities.filter(a => !a.classificacao);
    const atividadesComPublico = activities.filter(a => (a.publico_total || 0) > 0);
    const totalPublico = activities.reduce((sum, a) => sum + (a.publico_total || a.publico_estimado || 0), 0);
    const publicoZerado = activities.filter(a => (a.publico_total || 0) === 0 && (a.publico_estimado || 0) === 0);

    const atividadesOk = activities.length - atividadesSemRelatorio.length - atividadesSemClassificacao.length;
    const atividadesDivergencia = atividadesSemClassificacao.length;
    const atividadesCritico = atividadesSemRelatorio.length;

    // ── NOTAS FISCAIS ─────────────────────────────────────────
    const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
    const nfsAtivas = purchases.filter(p => !p.duplicada_financeira && p.incluir_no_somatorio !== false);
    const nfsAprovadas = nfsAtivas.filter(p => STATUS_APROVADOS.has(p.status));
    const nfsSemRubrica = nfsAtivas.filter(p => !p.rubrica_id && !p.rubrica_nome);
    const nfsSemDocumento = nfsAtivas.filter(p => !p.nota_fiscal_url && !p.nf_pdf_url && !p.file_url && !p.arquivo_url);
    const nfsDuplicatas = purchases.filter(p => p.duplicada_financeira === true);
    const totalNFs = nfsAtivas.length;
    const valorTotal = nfsAprovadas.reduce((s, p) => s + (Number(p.valor_pago) || Number(p.valor_aprovado_admin) || Number(p.valor_solicitado) || 0), 0);

    const nfsOk = nfsAtivas.filter(p => STATUS_APROVADOS.has(p.status) && p.rubrica_id && (p.nota_fiscal_url || p.nf_pdf_url || p.file_url)).length;
    const nfsDivergencia = nfsSemDocumento.length + nfsSemRubrica.length;
    const nfsCritico = nfsDuplicatas.length;

    // ── PÚBLICO ───────────────────────────────────────────────
    const publicoOk = atividadesComPublico.length;
    const publicoDivergencia = publicoZerado.length;
    const publicoCritico = atividadesSemRelatorio.filter(a => (a.publico_total || 0) > 0).length;

    // ── ISSUES LIST ───────────────────────────────────────────
    const issues = [];

    if (relatoriosSemAtividades.filter(r => r.status === 'APPROVED').length > 0)
      issues.push({ label: `${relatoriosSemAtividades.filter(r => r.status === 'APPROVED').length} relatório(s) APROVADOS sem nenhuma atividade vinculada`, status: 'divergencia', grupo: 'Relatórios' });

    if (relatoriosDraft.length > 0)
      issues.push({ label: `${relatoriosDraft.length} relatório(s) ainda em rascunho (DRAFT)`, status: 'critico', grupo: 'Relatórios' });

    if (atividadesSemRelatorio.length > 0)
      issues.push({ label: `${atividadesSemRelatorio.length} atividade(s) sem relatório vinculado`, status: 'critico', grupo: 'Atividades' });

    if (atividadesSemClassificacao.length > 0)
      issues.push({ label: `${atividadesSemClassificacao.length} atividade(s) sem classificação (META/ROTINA/EXTRA)`, status: 'divergencia', grupo: 'Atividades' });

    if (publicoZerado.length > 0)
      issues.push({ label: `${publicoZerado.length} atividade(s) com público zerado`, status: 'divergencia', grupo: 'Público' });

    if (nfsSemRubrica.length > 0)
      issues.push({ label: `${nfsSemRubrica.length} NF(s) sem rubrica orçamentária vinculada`, status: 'critico', grupo: 'Notas Fiscais' });

    if (nfsSemDocumento.length > 0)
      issues.push({ label: `${nfsSemDocumento.length} NF(s) sem documento PDF/arquivo anexado`, status: 'divergencia', grupo: 'Notas Fiscais', detalhe: 'Documentos necessários para prestação de contas ao SUCC' });

    if (nfsDuplicatas.length > 0)
      issues.push({ label: `${nfsDuplicatas.length} NF(s) marcada(s) como duplicata financeira (excluídas do total)`, status: 'divergencia', grupo: 'Notas Fiscais' });

    return {
      relatorios: { total: reports.length, ok: relatoriosOk, divergencia: relatoriosDivergencia, critico: relatoriosCritico, aprovados: relatoriosAprovados.length, submetidos: relatoriosSubmetidos.length, semAtividades: relatoriosSemAtividades.length },
      atividades: { total: activities.length, ok: Math.max(0, atividadesOk), divergencia: atividadesDivergencia, critico: atividadesCritico, comPublico: atividadesComPublico.length, semClassificacao: atividadesSemClassificacao.length },
      publico: { total: totalPublico, ok: publicoOk, divergencia: publicoDivergencia, critico: publicoCritico, zerado: publicoZerado.length },
      nfs: { total: totalNFs, ok: nfsOk, divergencia: nfsDivergencia, critico: nfsCritico, aprovadas: nfsAprovadas.length, valor: valorTotal, semRubrica: nfsSemRubrica.length, semDoc: nfsSemDocumento.length, duplicatas: nfsDuplicatas.length },
      issues,
      totalIssues: issues.length,
      criticos: issues.filter(i => i.status === 'critico').length,
    };
  }, [raw]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Auditando dados institucionais...</span>
      </div>
    );
  }

  if (!audit) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Painel de Auditoria Institucional</h2>
          <p className="text-sm text-slate-500 mt-0.5">Totais auditados por categoria — validados vs. divergências e duplicatas</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Reauditar
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{fmtInt(audit.relatorios.aprovados + audit.atividades.ok + audit.nfs.ok)}</p>
          <p className="text-xs text-slate-600 mt-1">Itens validados</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{fmtInt(audit.relatorios.divergencia + audit.atividades.divergencia + audit.nfs.divergencia)}</p>
          <p className="text-xs text-slate-600 mt-1">Divergências</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{fmtInt(audit.criticos)}</p>
          <p className="text-xs text-slate-600 mt-1">Problemas críticos</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{fmtBRL(audit.nfs.valor)}</p>
          <p className="text-xs text-slate-600 mt-1">Total aprovado NFs</p>
        </div>
      </div>

      {/* Cards por categoria */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <MetricCard
          icon={FileText}
          label="Relatórios Mensais"
          total={audit.relatorios.total}
          validado={audit.relatorios.ok}
          divergencia={audit.relatorios.divergencia}
          critico={audit.relatorios.critico}
          extra={`${audit.relatorios.aprovados} aprovados · ${audit.relatorios.submetidos} em revisão`}
          color="blue"
        />
        <MetricCard
          icon={Activity}
          label="Atividades Registradas"
          total={audit.atividades.total}
          validado={audit.atividades.ok}
          divergencia={audit.atividades.divergencia}
          critico={audit.atividades.critico}
          extra={`${audit.atividades.comPublico} com público declarado`}
          color="green"
        />
        <MetricCard
          icon={Users}
          label="Público Declarado"
          total={audit.publico.total}
          validado={audit.publico.ok}
          divergencia={audit.publico.divergencia}
          critico={audit.publico.critico}
          extra={`${audit.publico.zerado} atividades com público zerado`}
          color="purple"
        />
        <MetricCard
          icon={Receipt}
          label="Notas Fiscais"
          total={audit.nfs.total}
          validado={audit.nfs.ok}
          divergencia={audit.nfs.divergencia}
          critico={audit.nfs.critico}
          extra={`${audit.nfs.aprovadas} aprovadas/pagas · ${audit.nfs.duplicatas} duplicatas removidas`}
          color="amber"
        />
      </div>

      {/* Detalhamento por grupo */}
      <Section title="Relatórios — detalhamento" icon={FileText} defaultOpen={audit.relatorios.critico > 0}>
        <div className="space-y-1">
          <IssueRow label={`${audit.relatorios.total} relatórios no total`} status="ok" />
          <IssueRow label={`${audit.relatorios.aprovados} aprovados com atividades`} status={audit.relatorios.aprovados > 0 ? 'ok' : 'divergencia'} />
          <IssueRow label={`${audit.relatorios.semAtividades} sem nenhuma atividade`} status={audit.relatorios.semAtividades > 0 ? 'divergencia' : 'ok'} detalhe="Relatórios aprovados sem atividades precisam de revisão" />
          <IssueRow label={`${audit.relatorios.critico} em rascunho (não submetidos)`} status={audit.relatorios.critico > 0 ? 'critico' : 'ok'} />
        </div>
      </Section>

      <Section title="Atividades e Público — detalhamento" icon={Activity} defaultOpen={audit.atividades.critico > 0}>
        <div className="space-y-1">
          <IssueRow label={`${audit.atividades.total} atividades registradas`} status="ok" />
          <IssueRow label={`${audit.atividades.comPublico} com público declarado`} status={audit.atividades.comPublico > 0 ? 'ok' : 'divergencia'} />
          <IssueRow label={`${audit.publico.zerado} atividades com público zerado`} status={audit.publico.zerado > 0 ? 'divergencia' : 'ok'} />
          <IssueRow label={`${audit.atividades.divergencia} sem classificação META/ROTINA/EXTRA`} status={audit.atividades.divergencia > 0 ? 'divergencia' : 'ok'} />
          <IssueRow label={`${audit.atividades.critico} sem relatório vinculado`} status={audit.atividades.critico > 0 ? 'critico' : 'ok'} detalhe="Atividades órfãs não entram nos totais de nenhum relatório" />
        </div>
      </Section>

      <Section title="Notas Fiscais — detalhamento" icon={Receipt} defaultOpen={audit.nfs.semRubrica > 0}>
        <div className="space-y-1">
          <IssueRow label={`${audit.nfs.total} NFs ativas (excluídas duplicatas)`} status="ok" />
          <IssueRow label={`${audit.nfs.aprovadas} aprovadas/pagas · ${fmtBRL(audit.nfs.valor)}`} status={audit.nfs.aprovadas > 0 ? 'ok' : 'divergencia'} />
          <IssueRow label={`${audit.nfs.semRubrica} sem rubrica vinculada`} status={audit.nfs.semRubrica > 0 ? 'critico' : 'ok'} detalhe="Obrigatório para prestação de contas" />
          <IssueRow label={`${audit.nfs.semDoc} sem documento PDF`} status={audit.nfs.semDoc > 0 ? 'divergencia' : 'ok'} />
          <IssueRow label={`${audit.nfs.duplicatas} duplicatas financeiras removidas`} status={audit.nfs.duplicatas > 0 ? 'divergencia' : 'ok'} detalhe="Já excluídas dos totais orçamentários" />
        </div>
      </Section>

      {/* Pendências consolidadas */}
      {audit.issues.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-slate-800">Todas as pendências ({audit.issues.length})</h3>
          </div>
          <div className="p-5 space-y-1">
            {['Relatórios', 'Atividades', 'Público', 'Notas Fiscais'].map(grupo => {
              const grupIssues = audit.issues.filter(i => i.grupo === grupo);
              if (grupIssues.length === 0) return null;
              return (
                <div key={grupo}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-3 mb-1">{grupo}</p>
                  {grupIssues.map((issue, idx) => (
                    <IssueRow key={idx} label={issue.label} status={issue.status} detalhe={issue.detalhe} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}