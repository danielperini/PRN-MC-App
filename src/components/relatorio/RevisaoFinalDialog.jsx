import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { exportarRelatorioExecucaoPDF } from '@/components/relatorio/ExportarRelatorioExecucaoPDF';
import {
  CheckCircle2, XCircle, AlertTriangle, Download, ExternalLink,
  FileText, Users, BarChart2, Link2, ClipboardCheck, X, Loader2,
  CheckSquare, Square
} from 'lucide-react';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function StatusIcon({ ok, warn }) {
  if (ok) return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
  if (warn) return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
}

const CHECKLIST_ITEMS = [
  { id: 'metas', label: 'Metas revisadas e corretas' },
  { id: 'publico', label: 'Totais de público conferidos' },
  { id: 'rubricas', label: 'Valores das rubricas conferidos' },
  { id: 'links', label: 'Links do Drive verificados' },
  { id: 'equipe', label: 'Equipe de trabalho completa' },
  { id: 'assinatura', label: 'Dados de assinatura preenchidos' },
];

export default function RevisaoFinalDialog({ relatorioId, relatorio, onClose }) {
  const [aba, setAba] = useState('resumo');
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [checklist, setChecklist] = useState({});

  useEffect(() => {
    if (!relatorioId) return;
    setLoading(true);
    base44.entities.RelatorioExecucaoObjeto.get(relatorioId)
      .then(r => setDados(r))
      .catch(() => setDados(relatorio))
      .finally(() => setLoading(false));
  }, [relatorioId]);

  const r = dados || relatorio;
  if (!r) return null;

  const links = r._links_documentos || [];
  const rubricas = r._rubricas_periodo || [];
  const metas = r.cronograma_metas || [];
  const equipe = r.equipe_trabalho || [];

  // Análise automática de integridade
  const checks = {
    temMetas: metas.length > 0,
    temEquipe: equipe.length > 0,
    temPublico: (r.publico_alvo?.realizado_direto || 0) > 0,
    temRubricas: rubricas.length > 0,
    temLinks: links.length > 0,
    temAssinatura: !!r.assinatura?.nome_representante,
    linksComDrive: links.filter(l => l.drive_folder_url).length,
    linksSemDrive: links.filter(l => !l.drive_folder_url).length,
    rubricasComSaldo: rubricas.filter(r => (r.saldo || 0) >= 0).length,
    rubricasNegativas: rubricas.filter(r => (r.saldo || 0) < 0).length,
    totalFinanceiro: r._total_financeiro || 0,
  };

  const allChecked = CHECKLIST_ITEMS.every(item => checklist[item.id]);

  function toggleCheck(id) {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleExportar(modo) {
    const dadosExportar = dados || relatorio;
    if (!dadosExportar) return;
    setExportando(true);
    try {
      exportarRelatorioExecucaoPDF(dadosExportar, modo);
      const labels = {
        completo: '3 PDFs gerados (Partes 1, 2 e 3)',
        parte1: 'Parte 1 — Identificação e Público',
        parte2: 'Parte 2 — Metas e Equipe',
        parte3: 'Parte 3 — Impactos, Assinatura e Anexos',
      };
      toast.success(`PDF gerado: ${labels[modo] || modo}`);
      onClose();
    } catch (e) {
      toast.error('Erro ao gerar PDF: ' + e.message);
    } finally {
      setExportando(false);
    }
  }

  const abas = [
    { id: 'resumo', label: 'Resumo', icon: ClipboardCheck },
    { id: 'rubricas', label: `Rubricas (${rubricas.length})`, icon: BarChart2 },
    { id: 'links', label: `Drive (${links.length})`, icon: Link2 },
    { id: 'metas', label: `Metas (${metas.length})`, icon: FileText },
    { id: 'equipe', label: `Equipe (${equipe.length})`, icon: Users },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base">Revisão Final antes do PDF</h2>
              <p className="text-xs text-slate-500">Confira todos os dados antes de exportar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex gap-1 px-4 pt-3 border-b overflow-x-auto">
          {abas.map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                aba === a.id
                  ? 'bg-white border border-b-white text-slate-900 -mb-px border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <a.icon className="w-3.5 h-3.5" />
              {a.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}

          {!loading && aba === 'resumo' && (
            <div className="space-y-5">
              {/* Cards de status */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatusCard ok={checks.temMetas} label="Metas" value={`${metas.length} metas`} warn={metas.length < 3} />
                <StatusCard ok={checks.temPublico} label="Público" value={(r.publico_alvo?.realizado_direto || 0).toLocaleString('pt-BR') + ' pessoas'} />
                <StatusCard ok={checks.temEquipe} label="Equipe" value={`${equipe.length} membros`} warn={equipe.length < 3} />
                <StatusCard ok={checks.temRubricas} label="Rubricas" value={`${rubricas.length} rubricas`} warn={!checks.temRubricas} />
                <StatusCard ok={checks.temLinks} label="Links Drive" value={`${links.length} documentos`} warn={checks.linksSemDrive > 0} />
                <StatusCard ok={checks.temAssinatura} label="Assinatura" value={r.assinatura?.nome_representante || 'Não preenchida'} />
              </div>

              {/* Alertas */}
              <div className="space-y-2">
                {checks.linksSemDrive > 0 && (
                  <AlertItem type="warn">
                    {checks.linksSemDrive} NF(s) sem link de pasta no Drive
                  </AlertItem>
                )}
                {checks.rubricasNegativas > 0 && (
                  <AlertItem type="error">
                    {checks.rubricasNegativas} rubrica(s) com saldo negativo — verifique antes de exportar
                  </AlertItem>
                )}
                {!checks.temMetas && (
                  <AlertItem type="error">
                    Nenhuma meta preenchida. Use "Preencher com Dados" antes de exportar.
                  </AlertItem>
                )}
                {!checks.temAssinatura && (
                  <AlertItem type="warn">
                    Dados de assinatura não preenchidos
                  </AlertItem>
                )}
                {checks.totalFinanceiro > 0 && (
                  <AlertItem type="ok">
                    Total financeiro do período: {fmtBRL(checks.totalFinanceiro)}
                  </AlertItem>
                )}
              </div>

              {/* Checklist de aprovação */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Checklist de Revisão</p>
                </div>
                <div className="divide-y">
                  {CHECKLIST_ITEMS.map(item => {
                    const checked = !!checklist[item.id];
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleCheck(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                          checked ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        {checked
                          ? <CheckSquare className="w-4 h-4 text-green-600 shrink-0" />
                          : <Square className="w-4 h-4 text-slate-300 shrink-0" />}
                        <span className={`text-sm flex-1 ${checked ? 'text-green-800 font-medium' : 'text-slate-700'}`}>
                          {item.label}
                        </span>
                        {checked
                          ? <span className="text-[10px] font-semibold text-green-600 bg-green-100 border border-green-200 rounded px-1.5 py-0.5">✓ Conferido</span>
                          : <span className="text-[10px] text-slate-400">Clique para confirmar</span>
                        }
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!loading && aba === 'rubricas' && (
            <div className="space-y-3">
              {rubricas.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma rubrica carregada. Use "Preencher com Dados" primeiro.</p>
                </div>
              )}
              {rubricas.length > 0 && (
                <>
                  <div className="rounded-lg overflow-hidden border">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-50 border-b">
                        <tr>
                          <th className="text-left py-2.5 px-3 font-semibold text-amber-800">Rubrica</th>
                          <th className="text-left py-2.5 px-2 font-semibold text-amber-800 hidden md:table-cell">Grupo</th>
                          <th className="text-right py-2.5 px-2 font-semibold text-amber-800">Previsto</th>
                          <th className="text-right py-2.5 px-2 font-semibold text-amber-800">Executado</th>
                          <th className="text-right py-2.5 px-2 font-semibold text-amber-800">Saldo</th>
                          <th className="text-center py-2.5 px-2 font-semibold text-amber-800">NFs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {rubricas.map((rb, i) => {
                          const saldo = rb.saldo ?? (rb.valor_previsto - rb.total_gasto_periodo);
                          const negativo = saldo < 0;
                          return (
                            <tr key={i} className={`hover:bg-slate-50 ${negativo ? 'bg-red-50/40' : ''}`}>
                              <td className="py-2 px-3 font-medium max-w-[200px]">
                                <div className="truncate">{rb.rubrica_nome}</div>
                              </td>
                              <td className="py-2 px-2 text-slate-400 hidden md:table-cell truncate max-w-[120px]">{rb.grupo}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-500">{fmtBRL(rb.valor_previsto)}</td>
                              <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtBRL(rb.total_gasto_periodo)}</td>
                              <td className={`py-2 px-2 text-right tabular-nums font-bold ${negativo ? 'text-red-600' : 'text-green-700'}`}>
                                {negativo && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                {fmtBRL(saldo)}
                              </td>
                              <td className="py-2 px-2 text-center text-slate-500">{rb.num_nfs || 0}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t">
                        <tr>
                          <td colSpan={2} className="py-2 px-3 font-semibold text-slate-700 text-xs hidden md:table-cell">Total</td>
                          <td className="py-2 px-3 font-semibold text-slate-700 text-xs md:hidden">Total</td>
                          <td className="py-2 px-2 text-right font-bold tabular-nums">{fmtBRL(rubricas.reduce((s, r) => s + (r.valor_previsto || 0), 0))}</td>
                          <td className="py-2 px-2 text-right font-bold tabular-nums">{fmtBRL(rubricas.reduce((s, r) => s + (r.total_gasto_periodo || 0), 0))}</td>
                          <td className="py-2 px-2 text-right font-bold tabular-nums text-green-700">{fmtBRL(rubricas.reduce((s, r) => s + (r.saldo ?? (r.valor_previsto - r.total_gasto_periodo)), 0))}</td>
                          <td className="py-2 px-2 text-center font-bold">{rubricas.reduce((s, r) => s + (r.num_nfs || 0), 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {checks.rubricasNegativas > 0 && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {checks.rubricasNegativas} rubrica(s) com saldo negativo. Verifique se as NFs estão corretamente vinculadas.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!loading && aba === 'links' && (
            <div className="space-y-3">
              {links.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <Link2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum link carregado. Use "Preencher com Dados" primeiro.</p>
                </div>
              )}
              {links.length > 0 && (
                <div className="rounded-lg overflow-hidden border">
                  <table className="w-full text-xs">
                    <thead className="bg-indigo-50 border-b">
                      <tr>
                        <th className="text-left py-2.5 px-3 font-semibold text-indigo-800">NF</th>
                        <th className="text-left py-2.5 px-2 font-semibold text-indigo-800">Fornecedor / Descrição</th>
                        <th className="text-right py-2.5 px-2 font-semibold text-indigo-800">Valor</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-indigo-800">Documentos</th>
                        <th className="text-center py-2.5 px-2 font-semibold text-indigo-800">Drive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {links.map((doc, i) => {
                        const semDrive = !doc.drive_folder_url;
                        return (
                          <tr key={i} className={`hover:bg-slate-50 ${semDrive ? 'bg-amber-50/40' : ''}`}>
                            <td className="py-2 px-3 font-mono text-slate-500">{doc.nf_numero || '—'}</td>
                            <td className="py-2 px-2 max-w-[180px]">
                              <div className="truncate">{doc.fornecedor || doc.descricao || '—'}</div>
                            </td>
                            <td className="py-2 px-2 text-right font-semibold tabular-nums">{fmtBRL(doc.valor)}</td>
                            <td className="py-2 px-3">
                              <div className="flex items-center justify-center gap-1 flex-wrap">
                                <LinkChip href={doc.nf_pdf_url} label="PDF" color="gray" />
                                <LinkChip href={doc.nf_xml_url} label="XML" color="blue" />
                                <LinkChip href={doc.comprovante_url} label="COMP" color="green" />
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center">
                              {doc.drive_folder_url
                                ? <a href={doc.drive_folder_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium">
                                    <ExternalLink className="w-3 h-3" /> Abrir
                                  </a>
                                : <span className="text-amber-500 font-medium flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Sem link
                                  </span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {checks.linksSemDrive > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {checks.linksSemDrive} NF(s) sem pasta no Drive. Execute o backup de NFs para corrigir.
                </div>
              )}
            </div>
          )}

          {!loading && aba === 'metas' && (
            <div className="space-y-3">
              {metas.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma meta preenchida. Use "Preencher com Dados" primeiro.</p>
                </div>
              )}
              {metas.map((meta, i) => (
                <div key={i} className="rounded-xl border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm text-slate-800">{meta.meta_nome}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px]">{meta.percentual_execucao || 0}%</Badge>
                      <Badge className={`text-[10px] ${
                        (meta.status_meta || '').includes('Integral') ? 'bg-green-100 text-green-700 border-green-200' :
                        (meta.status_meta || '').includes('Parcial') ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        'bg-red-100 text-red-700 border-red-200'
                      }`} variant="outline">{meta.status_meta || '—'}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600">
                    <div><span className="text-slate-400">Ações:</span> {meta.acoes || '—'}</div>
                    <div><span className="text-slate-400">Resultado:</span> {meta.resultado_alcancado || '—'}</div>
                    <div><span className="text-slate-400">Período:</span> {meta.periodo || '—'}</div>
                    {meta.documentos_verificacao?.length > 0 && (
                      <div className="md:col-span-2">
                        <span className="text-slate-400">Docs de verificação:</span>{' '}
                        {meta.documentos_verificacao.map((d, di) => (
                          d.startsWith('http')
                            ? <a key={di} href={d} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline mr-1">
                                <ExternalLink className="w-2.5 h-2.5" />Doc {di + 1}
                              </a>
                            : <span key={di} className="mr-1">{d}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && aba === 'equipe' && (
            <div className="rounded-lg overflow-hidden border">
              {equipe.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum membro importado. Use "Preencher com Dados" primeiro.</p>
                </div>
              )}
              {equipe.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left py-2.5 px-3 font-semibold text-slate-700">Nome</th>
                      <th className="text-left py-2.5 px-2 font-semibold text-slate-700">Cargo</th>
                      <th className="text-left py-2.5 px-2 font-semibold text-slate-700 hidden md:table-cell">Contratação</th>
                      <th className="text-left py-2.5 px-2 font-semibold text-slate-700 hidden md:table-cell">Período</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-slate-700">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {equipe.map((m, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium">{m.nome || '—'}</td>
                        <td className="py-2 px-2 text-slate-500">{m.cargo || '—'}</td>
                        <td className="py-2 px-2 hidden md:table-cell">
                          {m.tipo_contratacao && <Badge variant="outline" className="text-[10px]">{m.tipo_contratacao}</Badge>}
                        </td>
                        <td className="py-2 px-2 text-slate-400 hidden md:table-cell">{m.periodo || '—'}</td>
                        <td className="py-2 px-3 text-right font-semibold tabular-nums">
                          {m.valor > 0 ? fmtBRL(m.valor) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t">
                    <tr>
                      <td colSpan={4} className="py-2 px-3 font-semibold text-xs text-slate-700">Total Equipe</td>
                      <td className="py-2 px-3 text-right font-bold tabular-nums">
                        {fmtBRL(equipe.reduce((s, m) => s + (m.valor || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-slate-50">
          {/* Barra de progresso */}
          <div className="px-5 pt-3 pb-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-600">
                Checklist: {CHECKLIST_ITEMS.filter(i => checklist[i.id]).length} de {CHECKLIST_ITEMS.length} itens revisados
              </span>
              {allChecked
                ? <span className="text-xs font-semibold text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Pronto para exportar</span>
                : <span className="text-xs text-slate-400">Marque todos os itens para liberar a exportação</span>
              }
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${allChecked ? 'bg-green-500' : 'bg-amber-400'}`}
                style={{ width: `${(CHECKLIST_ITEMS.filter(i => checklist[i.id]).length / CHECKLIST_ITEMS.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={onClose}>Voltar</Button>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => handleExportar('parte1')}
                variant="outline"
                className="gap-1 text-xs"
                disabled={!allChecked || exportando}
                title={!allChecked ? 'Conclua o checklist de revisão primeiro' : 'Exportar Parte 1'}
              >
                {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Parte 1
              </Button>
              <Button
                size="sm"
                onClick={() => handleExportar('parte2')}
                variant="outline"
                className="gap-1 text-xs"
                disabled={!allChecked || exportando}
                title={!allChecked ? 'Conclua o checklist de revisão primeiro' : 'Exportar Parte 2'}
              >
                {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                Parte 2
              </Button>
              <Button
                size="sm"
                onClick={() => handleExportar('completo')}
                className={`gap-1 ${allChecked && !exportando ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
                disabled={!allChecked || exportando}
                title={!allChecked ? 'Conclua o checklist de revisão primeiro' : 'Exportar PDF Completo'}
              >
                {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {exportando ? 'Gerando...' : 'PDF Completo'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ ok, warn, label, value }) {
  const bg = ok ? 'bg-green-50 border-green-200' : warn ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">{label}</span>
        <StatusIcon ok={ok} warn={warn && !ok} />
      </div>
      <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
    </div>
  );
}

function AlertItem({ type, children }) {
  const styles = {
    ok: 'bg-green-50 border-green-200 text-green-700',
    warn: 'bg-amber-50 border-amber-200 text-amber-700',
    error: 'bg-red-50 border-red-200 text-red-700',
  };
  const icons = {
    ok: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    warn: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
    error: <XCircle className="w-3.5 h-3.5 shrink-0" />,
  };
  return (
    <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${styles[type]}`}>
      {icons[type]}
      {children}
    </div>
  );
}

function LinkChip({ href, label, color }) {
  if (!href) return null;
  const colors = {
    gray: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
    green: 'bg-green-50 text-green-600 hover:bg-green-100',
  };
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${colors[color]}`}>
      {label}
    </a>
  );
}