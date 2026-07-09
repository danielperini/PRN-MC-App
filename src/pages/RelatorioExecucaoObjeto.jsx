import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { FileText, Loader2, CheckCircle2, AlertTriangle, Eye, Edit3, Download, FileSpreadsheet, FileCode, AlertCircle, ClipboardCheck } from 'lucide-react';
import { exportarRelatorioExecucaoPDF } from '@/components/relatorio/ExportarRelatorioExecucaoPDF';
import PainelDadosPeriodo from '@/components/relatorio/PainelDadosPeriodo';
import RevisaoFinalDialog from '@/components/relatorio/RevisaoFinalDialog';

const SECOES = [
  { key: 'identificacao', label: '1. Identificação do Projeto', icone: FileText, rapida: true },
  { key: 'endereco_execucao', label: '2. Endereço de Execução', icone: FileText },
  { key: 'divulgacao', label: '3. Divulgação da Parceria', icone: FileText },
  { key: 'descricao_acoes', label: '4. Descrição das Ações', icone: FileText },
  { key: 'publico_alvo', label: '5. Público Alvo', icone: FileText },
  { key: 'pesquisa_satisfacao', label: '6. Pesquisa de Satisfação', icone: FileText, rapida: true },
  { key: 'cronograma_metas', label: '7. Cronograma de Metas', icone: FileText },
  { key: 'equipe_trabalho', label: '8. Equipe de Trabalho', icone: FileText, rapida: true },
  { key: 'impactos', label: '9. Impactos Econômicos e Sociais', icone: FileText },
  { key: 'sustentabilidade', label: '10. Sustentabilidade', icone: FileText },
  { key: 'avaliacao', label: '11. Avaliação da Parceria', icone: FileText },
  { key: 'assinatura', label: '12. Assinatura', icone: FileText, rapida: true },
  { key: 'anexos', label: '13. Anexos - Evidências', icone: FileText, rapida: true },
];

export default function RelatorioExecucaoObjeto() {
  const [form, setForm] = useState({
    tipo: 'parcial',
    data_inicio: '2026-01-01',
    data_fim: '2026-06-24',
    filtro_museu: 'todos',
    filtro_versao: 'consolidado',
    filtro_meta_ids: []
  });
  const [relatorioId, setRelatorioId] = useState(null);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: SECOES.length, secaoAtual: '' });
  const [editandoSecao, setEditandoSecao] = useState(null);
  const [textoEditado, setTextoEditado] = useState('');
  const [revisaoAberta, setRevisaoAberta] = useState(false);

  // Carregar relatórios existentes
  const [relatoriosSalvos, setRelatoriosSalvos] = useState([]);
  useEffect(() => {
    carregarRelatorios();
  }, []);

  async function carregarRelatorios() {
    try {
      const lista = await base44.entities.RelatorioExecucaoObjeto.list('-created_date', 20);
      setRelatoriosSalvos(lista || []);
    } catch (e) { /* silencioso */ }
  }

  async function carregarRelatorio(id) {
    try {
      const r = await base44.entities.RelatorioExecucaoObjeto.get(id);
      setRelatorio(r);
      setRelatorioId(id);
    } catch (e) {
      toast.error('Erro ao carregar relatório');
    }
  }

  // Iniciar geração
  async function iniciarGeracao() {
    setLoading(true);
    setProgresso({ atual: 0, total: SECOES.length, secaoAtual: 'Iniciando...' });
    setRelatorio(null);

    try {
      const res = await base44.functions.invoke('iniciarRelatorioExecucao', form);
      const rid = res.data.relatorio_id;
      setRelatorioId(rid);
      await carregarRelatorio(rid);

      // Gerar cada seção
      for (let i = 0; i < SECOES.length; i++) {
        const secao = SECOES[i];
        setProgresso({ atual: i + 1, total: SECOES.length, secaoAtual: secao.label });

        try {
          await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
            relatorio_id: rid,
            secao: secao.key,
            ...form
          });
        } catch (e) {
          console.error(`Erro na seção ${secao.key}:`, e.message);
        }

        await carregarRelatorio(rid);
      }

      // Auditoria e finalização
      try {
        await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
          relatorio_id: rid, secao: 'auditoria', ...form
        });
        await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
          relatorio_id: rid, secao: 'finalizar', ...form
        });
      } catch (e) { console.error('Erro finalização:', e.message); }

      await carregarRelatorio(rid);
      await carregarRelatorios();
      toast.success('Relatório gerado com sucesso!');
    } catch (e) {
      toast.error('Erro ao gerar relatório: ' + e.message);
    } finally {
      setLoading(false);
      setProgresso({ atual: 0, total: SECOES.length, secaoAtual: '' });
    }
  }

  // Salvar edição de seção
  async function salvarEdicaoSecao(secaoKey) {
    try {
      const updateData = {};
      const secaoData = relatorio[secaoKey] || {};

      if (['endereco_execucao', 'divulgacao_parceria', 'descricao_acoes',
           'impactos_economicos_sociais', 'sustentabilidade', 'avaliacao_parceria'].includes(secaoKey)) {
        updateData[secaoKey] = { ...secaoData, texto_editado: textoEditado, modo: 'hibrido' };
      } else if (secaoKey === 'publico_alvo') {
        updateData[secaoKey] = { ...secaoData, texto_interpretativo_editado: textoEditado, modo: 'hibrido' };
      } else if (secaoKey === 'identificacao_projeto') {
        updateData[secaoKey] = { ...secaoData, ...JSON.parse(textoEditado) };
      }

      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, updateData);
      await carregarRelatorio(relatorioId);
      setEditandoSecao(null);
      toast.success('Seção atualizada');
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    }
  }

  function abrirEditor(secaoKey) {
    setEditandoSecao(secaoKey);
    const data = relatorio[secaoKey] || {};
    const txt = data.texto_editado || data.texto_ia || data.texto_interpretativo_editado || data.texto_interpretativo_ia || '';
    setTextoEditado(txt);
  }

  function renderTextoEditavel(secaoKey, textoIa, textoEditado) {
    const texto = textoEditado || textoIa || '';
    return (
      <div className="relative group">
        <div className="text-sm whitespace-pre-wrap text-slate-700 leading-relaxed">
          {texto || <span className="text-slate-400 italic">Não preenchido</span>}
        </div>
        <button
          onClick={() => abrirEditor(secaoKey)}
          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white rounded shadow"
        >
          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
    );
  }

  // Exportação
  function exportarPDF(modo = 'completo') {
    if (!relatorio) return;
    try {
      exportarRelatorioExecucaoPDF(relatorio, modo);
      const labels = {
        completo: '3 PDFs gerados (Partes 1, 2 e 3)',
        parte1: 'Parte 1 — Identificação e Público',
        parte2: 'Parte 2 — Metas e Equipe',
        parte3: 'Parte 3 — Impactos, Assinatura e Anexos',
      };
      toast.success(`PDF gerado: ${labels[modo] || modo}`);
    } catch (e) {
      toast.error('Erro ao gerar PDF: ' + e.message);
    }
  }

  async function exportarHTML() {
    toast.info('Exportação HTML em desenvolvimento');
  }

  async function exportarExcel() {
    toast.info('Exportação Excel em desenvolvimento');
  }

  const percentual = progresso.total > 0 ? Math.round((progresso.atual / progresso.total) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Execução do Objeto</h1>
          <p className="text-sm text-muted-foreground mt-1">Geração automática com IA • Modelo SUCC/PBH</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {relatoriosSalvos.length} relatórios salvos
        </Badge>
      </div>

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configurar Relatório</CardTitle>
          <CardDescription>Selecione tipo, período e filtros para geração</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parcial">Parcial</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Versão</Label>
              <Select value={form.filtro_versao} onValueChange={(v) => setForm({ ...form, filtro_versao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consolidado">Consolidado</SelectItem>
                  <SelectItem value="por_museu">Por Museu</SelectItem>
                  <SelectItem value="por_meta">Por Meta</SelectItem>
                  <SelectItem value="por_periodo">Por Período</SelectItem>
                  <SelectItem value="noturno">Noturno</SelectItem>
                  <SelectItem value="noturno_pampulha">Noturno Pampulha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Museu</Label>
              <Select value={form.filtro_museu} onValueChange={(v) => setForm({ ...form, filtro_museu: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="MHAB">MHAB</SelectItem>
                  <SelectItem value="MIS">MIS</SelectItem>
                  <SelectItem value="MUMO">MUMO</SelectItem>
                  <SelectItem value="Casa Kubitschek">Casa Kubitschek</SelectItem>
                  <SelectItem value="Casa do Baile">Casa do Baile</SelectItem>
                  <SelectItem value="MAP">MAP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1 md:col-span-1 flex items-end">
              <Button
                onClick={iniciarGeracao}
                disabled={loading}
                className="w-full"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                {loading ? 'Gerando...' : 'Gerar Relatório'}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <Label className="text-xs">Data Início</Label>
              <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Data Fim</Label>
              <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Barra de Progresso */}
      {loading && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-700">
                Gerando seções com IA...
              </span>
              <span className="text-xs text-blue-600">{progresso.atual}/{progresso.total}</span>
            </div>
            <Progress value={percentual} className="h-2" />
            <p className="text-xs text-blue-600 mt-1">{progresso.secaoAtual}</p>
          </CardContent>
        </Card>
      )}

      {/* Painel de Preenchimento Automático — visível assim que há um relatorioId */}
      {relatorioId && (
        <PainelDadosPeriodo
          relatorioId={relatorioId}
          dataInicio={form.data_inicio}
          dataFim={form.data_fim}
          filtroMuseu={form.filtro_museu}
          onPreenchido={() => carregarRelatorio(relatorioId)}
        />
      )}

      {/* Relatório Gerado */}
      {relatorio && relatorio.status === 'revisao' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                {relatorio.tipo === 'parcial' ? 'Relatório Parcial' : 'Relatório Final'}
              </CardTitle>
              <CardDescription>
                {relatorio.data_inicio} a {relatorio.data_fim} • {relatorio.filtro_museu === 'todos' ? 'Todos os museus' : relatorio.filtro_museu} • {relatorio.gerado_por_nome}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" onClick={() => setRevisaoAberta(true)} className="bg-indigo-700 text-white hover:bg-indigo-800 gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5" />Revisar e Exportar PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportarPDF('completo')} className="gap-1 text-xs">
                <Download className="w-3 h-3" />Direto (3 partes)
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Seção 1: Identificação */}
            <SecaoCard titulo="1. Identificação do Projeto" editavel onEdit={() => {
              const ident = relatorio.identificacao_projeto || {};
              setEditandoSecao('identificacao_projeto');
              setTextoEditado(JSON.stringify(ident, null, 2));
            }}>
              {relatorio.identificacao_projeto && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <div><span className="text-slate-500">Organização:</span> <strong>{relatorio.identificacao_projeto.organizacao}</strong></div>
                  <div><span className="text-slate-500">Projeto:</span> <strong>{relatorio.identificacao_projeto.projeto}</strong></div>
                  <div><span className="text-slate-500">Responsável:</span> <strong>{relatorio.identificacao_projeto.responsavel}</strong></div>
                  <div><span className="text-slate-500">E-mail:</span> <strong>{relatorio.identificacao_projeto.email}</strong></div>
                  <div><span className="text-slate-500">Instrumento:</span> <strong>{relatorio.identificacao_projeto.instrumento_juridico || '-'}</strong></div>
                  <div><span className="text-slate-500">Processo:</span> <strong>{relatorio.identificacao_projeto.processo_administrativo || '-'}</strong></div>
                </div>
              )}
            </SecaoCard>

            {/* Seção 2: Endereço */}
            <SecaoCard titulo="2. Endereço de Execução" editavel onEdit={() => abrirEditor('endereco_execucao')}>
              {renderTextoEditavel('endereco_execucao', relatorio.endereco_execucao?.texto_ia, relatorio.endereco_execucao?.texto_editado)}
            </SecaoCard>

            {/* Seção 3: Divulgação */}
            <SecaoCard titulo="3. Divulgação da Parceria" editavel onEdit={() => abrirEditor('divulgacao_parceria')}>
              {renderTextoEditavel('divulgacao_parceria', relatorio.divulgacao_parceria?.texto_ia, relatorio.divulgacao_parceria?.texto_editado)}
            </SecaoCard>

            {/* Seção 4: Ações */}
            <SecaoCard titulo="4. Descrição Sucinta das Ações Executadas" editavel onEdit={() => abrirEditor('descricao_acoes')}>
              {renderTextoEditavel('descricao_acoes', relatorio.descricao_acoes?.texto_ia, relatorio.descricao_acoes?.texto_editado)}
            </SecaoCard>

            {/* Seção 5: Público */}
            <SecaoCard titulo="5. Público Alvo" editavel onEdit={() => abrirEditor('publico_alvo')}>
              {relatorio.publico_alvo && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <MetricaCard label="Previsto Direto" valor={relatorio.publico_alvo.previsto_direto} />
                    <MetricaCard label="Realizado Direto" valor={relatorio.publico_alvo.realizado_direto} destaque />
                    <MetricaCard label="Diferença" valor={relatorio.publico_alvo.diferenca_direto} />
                    <MetricaCard label="Previsto Indireto" valor={relatorio.publico_alvo.previsto_indireto} />
                    <MetricaCard label="Realizado Indireto" valor={relatorio.publico_alvo.realizado_indireto} />
                  </div>
                  <div className="text-sm whitespace-pre-wrap text-slate-700">
                    {relatorio.publico_alvo.texto_interpretativo_editado || relatorio.publico_alvo.texto_interpretativo_ia || ''}
                  </div>
                </div>
              )}
            </SecaoCard>

            {/* Seção 6: Satisfação */}
            <SecaoCard titulo="6. Pesquisa de Satisfação" editavel onEdit={() => abrirEditor('pesquisa_satisfacao')}>
              {relatorio.pesquisa_satisfacao && (
                <p className="text-sm text-slate-600">
                  {relatorio.pesquisa_satisfacao.justificativa_editada || relatorio.pesquisa_satisfacao.justificativa_ia || 'Não foram aplicados formulários de pesquisa de satisfação neste período.'}
                </p>
              )}
            </SecaoCard>

            {/* Seção 7: Metas */}
            <SecaoCard titulo="7. Cronograma de Execução e Cumprimento de Metas">
              {relatorio._total_financeiro > 0 && (
                <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-green-700 font-medium">Total financeiro aprovado no período</span>
                  <span className="text-sm font-bold text-green-800">{relatorio._total_financeiro_fmt}</span>
                </div>
              )}
              <div className="space-y-3">
                {(relatorio.cronograma_metas || []).map((meta, idx) => (
                  <Card key={idx} className="border-slate-200">
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-sm">{meta.meta_nome}</span>
                        <Badge variant={
                          (meta.status_meta || '').includes('Integral') ? 'default' :
                          (meta.status_meta || '').includes('Parcial') ? 'secondary' : 'destructive'
                        } className="text-[10px]">{meta.status_meta}</Badge>
                        <Badge variant="outline" className="text-[10px]">{meta.percentual_execucao || 0}%</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600">
                        <div><strong>Resultado Esperado:</strong> {meta.resultado_esperado}</div>
                        <div><strong>Ações:</strong> {meta.acoes}</div>
                        <div><strong>Resultado Alcançado:</strong> {meta.resultado_alcancado}</div>
                        <div><strong>Período:</strong> {meta.periodo}</div>
                        {meta.documentos_verificacao?.length > 0 && (
                          <div><strong>Docs Verificação:</strong> {meta.documentos_verificacao.join(', ')}</div>
                        )}
                        {meta.justificativa && <div className="col-span-2"><strong>Justificativa:</strong> {meta.justificativa}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!relatorio.cronograma_metas || relatorio.cronograma_metas.length === 0) && (
                  <p className="text-sm text-slate-400 italic">Nenhuma meta processada. Use "Preencher com Dados" para importar automaticamente.</p>
                )}
              </div>
            </SecaoCard>

            {/* Seção 8: Equipe */}
            <SecaoCard titulo="8. Equipe de Trabalho">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-1.5 pr-2">Nome</th>
                      <th className="py-1.5 pr-2">Cargo</th>
                      <th className="py-1.5 pr-2">Contratação</th>
                      <th className="py-1.5 pr-2">Período</th>
                      <th className="py-1.5 pr-2">C.H. Semanal</th>
                      <th className="py-1.5 text-right">Valor Mensal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(relatorio.equipe_trabalho || []).slice(0, 30).map((m, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-1.5 pr-2 font-medium">{m.nome || '—'}</td>
                        <td className="py-1.5 pr-2 text-slate-600">{m.cargo || '—'}</td>
                        <td className="py-1.5 pr-2">
                          <Badge variant="outline" className="text-[10px]">{m.tipo_contratacao || '—'}</Badge>
                        </td>
                        <td className="py-1.5 pr-2 text-slate-500">{m.periodo || '—'}</td>
                        <td className="py-1.5 pr-2 text-slate-500">{m.carga_horaria || '—'}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums">
                          {m.valor > 0 ? `R$ ${(m.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                      </tr>
                    ))}
                    {(!relatorio.equipe_trabalho || relatorio.equipe_trabalho.length === 0) && (
                      <tr><td colSpan={6} className="py-4 text-center text-slate-400 italic">Nenhum membro importado. Use "Preencher com Dados" para importar a equipe.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SecaoCard>

            {/* Seção 9: Impactos */}
            <SecaoCard titulo="9. Impactos Econômicos e Sociais" editavel onEdit={() => abrirEditor('impactos_economicos_sociais')}>
              {renderTextoEditavel('impactos_economicos_sociais', relatorio.impactos_economicos_sociais?.texto_ia, relatorio.impactos_economicos_sociais?.texto_editado)}
            </SecaoCard>

            {/* Seção 10: Sustentabilidade */}
            {relatorio.tipo === 'final' && (
              <SecaoCard titulo="10. Sustentabilidade" editavel onEdit={() => abrirEditor('sustentabilidade')}>
                {renderTextoEditavel('sustentabilidade', relatorio.sustentabilidade?.texto_ia, relatorio.sustentabilidade?.texto_editado)}
              </SecaoCard>
            )}

            {/* Seção 11: Avaliação */}
            <SecaoCard titulo={`${relatorio.tipo === 'final' ? '11' : '10'}. Avaliação da Parceria`} editavel onEdit={() => abrirEditor('avaliacao_parceria')}>
              {renderTextoEditavel('avaliacao_parceria', relatorio.avaliacao_parceria?.texto_ia, relatorio.avaliacao_parceria?.texto_editado)}
            </SecaoCard>

            {/* Seção 12: Assinatura */}
            <SecaoCard titulo={`${relatorio.tipo === 'final' ? '12' : '11'}. Assinatura`}>
              {relatorio.assinatura && (
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-slate-500">Nome:</span> <strong>{relatorio.assinatura.nome_representante}</strong></div>
                  <div><span className="text-slate-500">Cargo:</span> <strong>{relatorio.assinatura.cargo}</strong></div>
                  <div><span className="text-slate-500">Data:</span> <strong>{relatorio.assinatura.data}</strong></div>
                </div>
              )}
            </SecaoCard>

            {/* Seção 13: Anexos */}
            <SecaoCard titulo={`${relatorio.tipo === 'final' ? '13' : '12'}. Anexos - Evidências Fotográficas`}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(relatorio.anexos_evidencias || []).slice(0, 12).map((a, i) => (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    {a.foto_url ? (
                      <img src={a.foto_url} alt={a.legenda_ia || ''} className="w-full h-32 object-cover" />
                    ) : (
                      <div className="w-full h-32 bg-slate-100 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                    <div className="p-2 text-[10px] text-slate-600">
                      <p className="font-medium truncate">{a.atividade_nome}</p>
                      {a.atividade_data && <p>{a.atividade_data}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </SecaoCard>

            {/* Painel de Pendências (Auditoria) */}
            {relatorio.auditoria_pendencias && relatorio.auditoria_pendencias.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Painel de Pendências ({relatorio.auditoria_pendencias.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {relatorio.auditoria_pendencias.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-slate-700">{p.descricao}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{p.tipo}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      {/* Relatórios Anteriores */}
      {relatoriosSalvos.length > 0 && !relatorio && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Relatórios Gerados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {relatoriosSalvos.map(r => (
                <div key={r.id}
                  onClick={() => carregarRelatorio(r.id)}
                  className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="font-medium text-sm">{r.tipo === 'parcial' ? 'Relatório Parcial' : 'Relatório Final'}</p>
                      <p className="text-xs text-slate-500">{r.data_inicio} a {r.data_fim} • {r.gerado_por_nome}</p>
                    </div>
                  </div>
                  <Badge variant={r.status === 'revisao' ? 'default' : 'secondary'} className="text-[10px]">
                    {r.status === 'revisao' ? 'Pronto' : r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revisão Final */}
      {revisaoAberta && relatorio && (
        <RevisaoFinalDialog
          relatorioId={relatorioId}
          relatorio={relatorio}
          onExportar={(modo) => { exportarPDF(modo); setRevisaoAberta(false); }}
          onClose={() => setRevisaoAberta(false)}
        />
      )}

      {/* Modal de Edição */}
      {editandoSecao && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Editar Seção</h3>
              <button onClick={() => setEditandoSecao(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <Textarea
                value={textoEditado}
                onChange={(e) => setTextoEditado(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditandoSecao(null)}>Cancelar</Button>
              <Button onClick={() => salvarEdicaoSecao(editandoSecao)}>Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente auxiliar para seções
function SecaoCard({ titulo, children, editavel, onEdit }) {
  return (
    <div className="border rounded-lg p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-slate-800">{titulo}</h3>
        {editavel && onEdit && (
          <button onClick={onEdit} className="text-slate-400 hover:text-slate-600">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function MetricaCard({ label, valor, destaque }) {
  return (
    <div className={`p-2 rounded-lg ${destaque ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50'}`}>
      <p className="text-[10px] text-slate-500 uppercase">{label}</p>
      <p className={`text-lg font-bold ${destaque ? 'text-blue-700' : 'text-slate-800'}`}>
        {(valor || 0).toLocaleString('pt-BR')}
      </p>
    </div>
  );
}