import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Zap, Users, FileText, DollarSign, Activity, Link2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function StatCard({ icon: Icon, label, value, sub, color = 'slate' }) {
  const colors = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-70" />
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PainelDadosPeriodo({ relatorioId, dataInicio, dataFim, filtroMuseu, onPreenchido }) {
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [links, setLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  async function preencherAutomatico() {
    if (!relatorioId) {
      toast.error('Gere o relatório primeiro antes de preencher com dados.');
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
        toast.success(
          `✅ Preenchimento concluído! ${result.resumo.total_atividades} atividades • ${result.resumo.total_metas_identificadas} metas • ${result.resumo.total_links_documentos} documentos vinculados`
        );
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

  async function carregarLinks() {
    setLoadingLinks(true);
    try {
      const relatorio = await base44.entities.RelatorioExecucaoObjeto.get(relatorioId);
      setLinks(relatorio?._links_documentos || []);
    } catch (e) { /* silencioso */ }
    finally { setLoadingLinks(false); }
  }

  useEffect(() => {
    if (expanded && relatorioId && links.length === 0) {
      carregarLinks();
    }
  }, [expanded, relatorioId]);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-200">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-sm text-indigo-800">Preenchimento Automático com Dados do Sistema</span>
        </div>
        <Button
          size="sm"
          onClick={preencherAutomatico}
          disabled={loading || !relatorioId}
          className="bg-indigo-700 text-white hover:bg-indigo-800 gap-2"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {loading ? 'Preenchendo...' : 'Preencher com Dados'}
        </Button>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs text-indigo-700 mb-3">
          Busca automaticamente atividades, rubricas, equipe e documentos (NF PDF, XML, comprovantes, Drive) do período selecionado e preenche o cronograma de metas, público-alvo e equipe de trabalho.
        </p>

        {resumo && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <StatCard icon={Activity} label="Atividades" value={resumo.total_atividades} color="blue" />
              <StatCard icon={FileText} label="Metas" value={resumo.total_metas_identificadas} color="green" />
              <StatCard icon={Users} label="Participantes" value={(resumo.publico_total || 0).toLocaleString('pt-BR')} color="purple" />
              <StatCard icon={Users} label="Equipe" value={resumo.total_equipe} color="slate" />
              <StatCard icon={FileText} label="Compras" value={resumo.total_compras} color="amber" />
              <StatCard icon={Link2} label="Docs Vinculados" value={resumo.total_links_documentos} sub={resumo.total_financeiro_fmt} color="green" />
            </div>

            {resumo.total_links_documentos > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {expanded ? 'Ocultar' : 'Ver'} documentos vinculados ({resumo.total_links_documentos})
              </button>
            )}

            {expanded && (
              <div className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
                {loadingLinks ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 text-slate-500 font-medium">NF</th>
                          <th className="text-left py-2 px-2 text-slate-500 font-medium">Fornecedor</th>
                          <th className="text-left py-2 px-2 text-slate-500 font-medium">Descrição</th>
                          <th className="text-right py-2 px-2 text-slate-500 font-medium">Valor</th>
                          <th className="text-center py-2 px-2 text-slate-500 font-medium">Links</th>
                        </tr>
                      </thead>
                      <tbody>
                        {links.map((doc, i) => (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-mono text-slate-500">{doc.nf_numero || '—'}</td>
                            <td className="py-1.5 px-2 max-w-[120px] truncate">{doc.fornecedor}</td>
                            <td className="py-1.5 px-2 max-w-[160px] truncate text-slate-600">{doc.descricao}</td>
                            <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{fmtBRL(doc.valor)}</td>
                            <td className="py-1.5 px-2">
                              <div className="flex items-center justify-center gap-1">
                                {doc.nf_pdf_url && (
                                  <a href={doc.nf_pdf_url} target="_blank" rel="noopener noreferrer"
                                    className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-200">PDF</a>
                                )}
                                {doc.nf_xml_url && (
                                  <a href={doc.nf_xml_url} target="_blank" rel="noopener noreferrer"
                                    className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100">XML</a>
                                )}
                                {doc.comprovante_url && (
                                  <a href={doc.comprovante_url} target="_blank" rel="noopener noreferrer"
                                    className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 hover:bg-green-100">COMP</a>
                                )}
                                {(doc.drive_folder_url || doc.drive_pdf_url) && (
                                  <a href={doc.drive_folder_url || doc.drive_pdf_url} target="_blank" rel="noopener noreferrer"
                                    className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100">Drive</a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Dados preenchidos automaticamente. Revise e edite cada seção conforme necessário.
            </div>
          </div>
        )}

        {!resumo && (
          <div className="text-xs text-slate-500">
            {relatorioId
              ? 'Clique em "Preencher com Dados" para buscar atividades, rubricas, equipe e documentos do período.'
              : '⚠️ Gere o relatório com IA primeiro usando o botão "Gerar Relatório" acima.'}
          </div>
        )}
      </div>
    </div>
  );
}