import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Users, FileText, BarChart2, Activity, Link2, CheckCircle2, ChevronDown, ChevronUp, AlertTriangle, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { sincronizarRelatorioExecucao } from '@/utils/sincronizarRelatorioExecucao';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function StatCard({ icon: Icon, label, value, sub, color = 'slate' }) {
  const styles = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`rounded-xl border p-3 ${styles[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[11px] font-medium opacity-80">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PainelDadosPeriodo({ relatorioId, dataInicio, dataFim, filtroMuseu, filtroVersao = 'consolidado', onPreenchido }) {
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState(null);
  const [auditoria, setAuditoria] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedTab, setExpandedTab] = useState('links');
  const [links, setLinks] = useState([]);
  const [rubricas, setRubricas] = useState([]);

  async function preencherAutomatico() {
    if (!relatorioId) {
      toast.error('Gere o relatório com IA primeiro.');
      return;
    }

    setLoading(true);
    setAuditoria(null);
    try {
      const result = await sincronizarRelatorioExecucao({
        relatorioId,
        dataInicio,
        dataFim,
        filtroMuseu: filtroMuseu || 'todos',
        filtroVersao,
      });

      setResumo(result.resumo || {});
      setAuditoria(result.auditoria);
      setLinks([]);
      setRubricas([]);
      setExpanded(false);

      if (result.success) {
        toast.success(`Dados sincronizados e auditados: ${result.auditoria.totais.atividades} atividades • ${result.auditoria.totais.metas} metas • ${result.auditoria.totais.participantes} participantes`);
      } else {
        toast.warning(`Dados atualizados com ${result.auditoria.inconsistencias.length} alerta(s) de auditoria.`);
      }

      onPreenchido?.(result.relatorio, result.auditoria);
    } catch (e) {
      toast.error('Erro na sincronização: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpanded(tab) {
    if (expanded && expandedTab === tab) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setExpandedTab(tab);
    if (relatorioId) {
      try {
        const r = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
        setLinks(r?._links_documentos || []);
        setRubricas(r?._rubricas_periodo || []);
      } catch (_) {}
    }
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-200">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-sm text-indigo-800">Preencher, Sincronizar e Auditar Dados do Período</span>
          {resumo && (
            <Badge variant="outline" className={`text-[10px] ${auditoria?.inconsistencias?.length ? 'text-amber-700 border-amber-300 bg-amber-50' : 'text-green-700 border-green-300 bg-green-50'}`}>
              {auditoria?.inconsistencias?.length ? <AlertTriangle className="w-3 h-3 mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              {auditoria?.inconsistencias?.length ? 'Revisar auditoria' : '100% sincronizado'}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={preencherAutomatico} disabled={loading || !relatorioId} className="bg-indigo-700 text-white hover:bg-indigo-800 gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {loading ? 'Sincronizando...' : resumo ? 'Atualizar e Auditar' : 'Preencher e Auditar'}
        </Button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {!resumo && (
          <p className="text-xs text-indigo-700">
            {relatorioId
              ? 'Importa atividades, metas, público, equipe, compras, documentos e fotos do período; recalcula as seções com IA e executa auditoria antes da exportação.'
              : '⚠️ Gere o relatório com IA primeiro.'}
          </p>
        )}

        {resumo && (
          <>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
              <StatCard icon={Activity} label="Atividades" value={resumo.total_atividades || 0} color="blue" />
              <StatCard icon={FileText} label="Metas" value={resumo.total_metas_identificadas || 0} color="green" />
              <StatCard icon={Users} label="Participantes" value={(resumo.publico_total || 0).toLocaleString('pt-BR')} color="purple" />
              <StatCard icon={Users} label="Equipe" value={resumo.total_equipe || 0} color="slate" />
              <StatCard icon={Camera} label="Fotos" value={auditoria?.totais?.fotos || 0} color="purple" />
              <StatCard icon={BarChart2} label="Rubricas" value={resumo.total_rubricas || 0} color="amber" />
              <StatCard icon={Link2} label="Docs Drive" value={resumo.total_links_documentos || 0} sub={resumo.total_financeiro_fmt} color="green" />
            </div>

            {auditoria?.inconsistencias?.length > 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-1">
                  <AlertTriangle className="w-4 h-4" /> Auditoria encontrou inconsistências
                </div>
                <ul className="text-xs text-amber-800 space-y-1 list-disc pl-5">
                  {auditoria.inconsistencias.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Período, cálculos, fontes, vínculos operacionais e seções recalculadas sem inconsistências detectadas.
              </div>
            )}

            <div className="flex gap-2">
              {(resumo.total_links_documentos || 0) > 0 && (
                <button onClick={() => toggleExpanded('links')} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  {expanded && expandedTab === 'links' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {expanded && expandedTab === 'links' ? 'Ocultar' : 'Ver'} documentos ({resumo.total_links_documentos})
                </button>
              )}
              {(resumo.total_rubricas || 0) > 0 && (
                <button onClick={() => toggleExpanded('rubricas')} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium">
                  {expanded && expandedTab === 'rubricas' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {expanded && expandedTab === 'rubricas' ? 'Ocultar' : 'Ver'} rubricas ({resumo.total_rubricas})
                </button>
              )}
            </div>

            {expanded && expandedTab === 'links' && links.length > 0 && (
              <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b"><tr><th className="text-left py-2 px-3">NF</th><th className="text-left py-2 px-2">Fornecedor</th><th className="text-right py-2 px-2">Valor</th><th className="text-center py-2 px-2">Links</th></tr></thead>
                  <tbody>{links.map((doc, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1.5 px-3 font-mono text-[10px]">{doc.nf_numero || '—'}</td>
                      <td className="py-1.5 px-2 max-w-[140px] truncate">{doc.fornecedor || doc.descricao}</td>
                      <td className="py-1.5 px-2 text-right font-semibold">{fmtBRL(doc.valor)}</td>
                      <td className="py-1.5 px-2"><div className="flex justify-center gap-1">{doc.nf_pdf_url && <a href={doc.nf_pdf_url} target="_blank" rel="noopener noreferrer" className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px]">PDF</a>}{doc.nf_xml_url && <a href={doc.nf_xml_url} target="_blank" rel="noopener noreferrer" className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-600">XML</a>}{doc.comprovante_url && <a href={doc.comprovante_url} target="_blank" rel="noopener noreferrer" className="rounded bg-green-50 px-1.5 py-0.5 text-[9px] text-green-600">COMP</a>}{doc.drive_folder_url && <a href={doc.drive_folder_url} target="_blank" rel="noopener noreferrer" className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] text-indigo-600">Drive</a>}</div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {expanded && expandedTab === 'rubricas' && rubricas.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-white overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-amber-50 border-b"><tr><th className="text-left py-2 px-3">Rubrica</th><th className="text-left py-2 px-2">Grupo</th><th className="text-right py-2 px-2">Previsto</th><th className="text-right py-2 px-2">Executado</th><th className="text-right py-2 px-2">Saldo</th><th className="text-center py-2 px-2">NFs</th></tr></thead>
                  <tbody>{rubricas.map((r, i) => {
                    const saldo = r.saldo ?? ((r.valor_previsto || 0) - (r.valor_utilizado || 0));
                    return <tr key={i} className="border-b border-slate-50"><td className="py-1.5 px-3 font-medium max-w-[160px] truncate">{r.rubrica_nome}</td><td className="py-1.5 px-2 text-slate-500">{r.grupo}</td><td className="py-1.5 px-2 text-right">{fmtBRL(r.valor_previsto)}</td><td className="py-1.5 px-2 text-right font-semibold">{fmtBRL(r.total_gasto_periodo)}</td><td className={`py-1.5 px-2 text-right font-bold ${saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtBRL(saldo)}</td><td className="py-1.5 px-2 text-center">{r.num_nfs}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
