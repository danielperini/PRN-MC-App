import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Users, FileText, BarChart2, Activity, Link2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

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

export default function PainelDadosPeriodo({ relatorioId, dataInicio, dataFim, filtroMuseu, onPreenchido }) {
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedTab, setExpandedTab] = useState('links'); // 'links' | 'rubricas'
  const [links, setLinks] = useState([]);
  const [rubricas, setRubricas] = useState([]);

  async function preencherAutomatico() {
    if (!relatorioId) {
      toast.error('Gere o relatório com IA primeiro.');
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke('preencherRelatorioComDados', {
        relatorio_id: relatorioId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        filtro_museu: filtroMuseu || 'todos',
      });
      const result = res?.data || res;
      if (result?.success) {
        setResumo(result.resumo);
        setLinks([]);
        setRubricas([]);
        setExpanded(false);
        toast.success(`✅ ${result.resumo.total_atividades} atividades • ${result.resumo.total_metas_identificadas} metas • ${result.resumo.total_links_documentos} documentos vinculados`);
        onPreenchido?.();
      } else {
        toast.error(result?.error || 'Erro ao preencher relatório.');
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-200">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-sm text-indigo-800">Preencher com Dados do Período</span>
          {resumo && (
            <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 bg-green-50">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Preenchido
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={preencherAutomatico}
          disabled={loading || !relatorioId}
          className="bg-indigo-700 text-white hover:bg-indigo-800 gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {loading ? 'Preenchendo...' : resumo ? 'Atualizar Dados' : 'Preencher com Dados'}
        </Button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {!resumo && (
          <p className="text-xs text-indigo-700">
            {relatorioId
              ? 'Importa automaticamente atividades, equipe, compras aprovadas e links do Drive do período → preenche Metas, Público e Equipe.'
              : '⚠️ Gere o relatório com IA primeiro.'}
          </p>
        )}

        {resumo && (
          <>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <StatCard icon={Activity}   label="Atividades"    value={resumo.total_atividades}                                color="blue"   />
              <StatCard icon={FileText}   label="Metas"         value={resumo.total_metas_identificadas}                       color="green"  />
              <StatCard icon={Users}      label="Participantes" value={(resumo.publico_total||0).toLocaleString('pt-BR')}      color="purple" />
              <StatCard icon={Users}      label="Equipe"        value={resumo.total_equipe}                                    color="slate"  />
              <StatCard icon={BarChart2}  label="Rubricas"      value={resumo.total_rubricas || 0}                             color="amber"  />
              <StatCard icon={Link2}      label="Docs Drive"    value={resumo.total_links_documentos} sub={resumo.total_financeiro_fmt} color="green" />
            </div>

            <div className="flex gap-2">
              {resumo.total_links_documentos > 0 && (
                <button onClick={() => toggleExpanded('links')}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  {expanded && expandedTab === 'links' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {expanded && expandedTab === 'links' ? 'Ocultar' : 'Ver'} documentos ({resumo.total_links_documentos})
                </button>
              )}
              {(resumo.total_rubricas || 0) > 0 && (
                <button onClick={() => toggleExpanded('rubricas')}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium">
                  {expanded && expandedTab === 'rubricas' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {expanded && expandedTab === 'rubricas' ? 'Ocultar' : 'Ver'} rubricas ({resumo.total_rubricas})
                </button>
              )}
            </div>

            {expanded && expandedTab === 'links' && links.length > 0 && (
              <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b">
                      <tr>
                        <th className="text-left py-2 px-3 text-slate-500 font-medium">NF</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Fornecedor</th>
                        <th className="text-right py-2 px-2 text-slate-500 font-medium">Valor</th>
                        <th className="text-center py-2 px-2 text-slate-500 font-medium">Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {links.map((doc, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-mono text-slate-500 text-[10px]">{doc.nf_numero || '—'}</td>
                          <td className="py-1.5 px-2 max-w-[140px] truncate">{doc.fornecedor || doc.descricao}</td>
                          <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{fmtBRL(doc.valor)}</td>
                          <td className="py-1.5 px-2">
                            <div className="flex items-center justify-center gap-1">
                              {doc.nf_pdf_url && <a href={doc.nf_pdf_url} target="_blank" rel="noopener noreferrer" className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-600 hover:bg-gray-200">PDF</a>}
                              {doc.nf_xml_url && <a href={doc.nf_xml_url} target="_blank" rel="noopener noreferrer" className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 hover:bg-blue-100">XML</a>}
                              {doc.comprovante_url && <a href={doc.comprovante_url} target="_blank" rel="noopener noreferrer" className="rounded bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold text-green-600 hover:bg-green-100">COMP</a>}
                              {doc.drive_folder_url && <a href={doc.drive_folder_url} target="_blank" rel="noopener noreferrer" className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600 hover:bg-indigo-100">Drive</a>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {expanded && expandedTab === 'rubricas' && rubricas.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-white overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-amber-50 border-b">
                      <tr>
                        <th className="text-left py-2 px-3 text-amber-700 font-medium">Rubrica</th>
                        <th className="text-left py-2 px-2 text-amber-700 font-medium">Grupo</th>
                        <th className="text-right py-2 px-2 text-amber-700 font-medium">Previsto</th>
                        <th className="text-right py-2 px-2 text-amber-700 font-medium">Executado</th>
                        <th className="text-right py-2 px-2 text-amber-700 font-medium">Saldo</th>
                        <th className="text-center py-2 px-2 text-amber-700 font-medium">NFs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rubricas.map((r, i) => {
                        const saldo = r.saldo || (r.valor_previsto - r.valor_utilizado);
                        return (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-medium max-w-[160px] truncate">{r.rubrica_nome}</td>
                            <td className="py-1.5 px-2 text-slate-500 truncate max-w-[100px]">{r.grupo}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmtBRL(r.valor_previsto)}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtBRL(r.total_gasto_periodo)}</td>
                            <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtBRL(saldo)}</td>
                            <td className="py-1.5 px-2 text-center text-slate-500">{r.num_nfs}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="text-[11px] text-green-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Dados preenchidos automaticamente. Revise cada seção e edite se necessário antes de exportar o PDF.
            </p>
          </>
        )}
      </div>
    </div>
  );
}