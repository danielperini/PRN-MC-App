import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import { exportarRelatorioExecucaoPDF } from '@/components/relatorio/ExportarRelatorioExecucaoPDF';
import RevisaoFinalDialog from '@/components/relatorio/RevisaoFinalDialog';
import { listarMetasRelatorio, sincronizarRelatorioExecucao } from '@/utils/sincronizarRelatorioExecucao';

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function nomeMeta(meta) {
  return meta?.meta_nome || meta?.nome || meta?.titulo || meta?.descricao || meta?.codigo || 'Meta';
}

function idMeta(meta) {
  return String(meta?.id || meta?.meta_codigo || nomeMeta(meta));
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RelatorioExecucaoObjeto() {
  const [form, setForm] = useState({
    tipo: 'parcial',
    data_inicio: '2026-02-01',
    data_fim: hoje(),
    filtro_museu: 'todos',
    filtro_versao: 'consolidado',
    filtro_meta_ids: [],
  });
  const [metas, setMetas] = useState([]);
  const [carregandoMetas, setCarregandoMetas] = useState(true);
  const [relatorio, setRelatorio] = useState(null);
  const [relatorioId, setRelatorioId] = useState(null);
  const [relatoriosSalvos, setRelatoriosSalvos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState({ valor: 0, texto: '' });
  const [revisaoAberta, setRevisaoAberta] = useState(false);

  useEffect(() => {
    carregarMetas();
    carregarRelatorios();
  }, []);

  async function carregarMetas() {
    setCarregandoMetas(true);
    try {
      const lista = await listarMetasRelatorio();
      setMetas(lista);
      setForm(atual => ({ ...atual, filtro_meta_ids: atual.filtro_meta_ids.filter(id => lista.some(meta => idMeta(meta) === id)) }));
    } catch (error) {
      toast.error('Erro ao carregar metas: ' + (error?.message || String(error)));
    } finally {
      setCarregandoMetas(false);
    }
  }

  async function carregarRelatorios() {
    try {
      const lista = await base44.entities.RelatorioExecucaoObjeto.list('-created_date', 20);
      setRelatoriosSalvos(Array.isArray(lista) ? lista : []);
    } catch {
      setRelatoriosSalvos([]);
    }
  }

  async function carregarRelatorio(id) {
    const atual = await base44.entities.RelatorioExecucaoObjeto.get(id);
    setRelatorio(atual);
    setRelatorioId(id);
    if (Array.isArray(atual?.filtro_meta_ids)) {
      setForm(f => ({ ...f, filtro_meta_ids: atual.filtro_meta_ids }));
    }
  }

  function alternarMeta(id) {
    setForm(atual => {
      const existe = atual.filtro_meta_ids.includes(id);
      return {
        ...atual,
        filtro_meta_ids: existe
          ? atual.filtro_meta_ids.filter(item => item !== id)
          : [...atual.filtro_meta_ids, id],
      };
    });
  }

  function selecionarTodas() {
    setForm(atual => ({ ...atual, filtro_meta_ids: metas.map(idMeta) }));
  }

  function limparSelecao() {
    setForm(atual => ({ ...atual, filtro_meta_ids: [] }));
  }

  async function iniciarGeracao() {
    if (form.filtro_meta_ids.length === 0) {
      toast.error('Selecione ao menos uma meta para gerar o relatório.');
      return;
    }

    setLoading(true);
    setRelatorio(null);
    setProgresso({ valor: 5, texto: 'Criando relatório...' });

    try {
      const res = await base44.functions.invoke('iniciarRelatorioExecucao', {
        ...form,
        aditivos_permitidos: [3, 4],
        excluir_metas_anteriores: true,
      });
      const rid = res?.data?.relatorio_id || res?.relatorio_id;
      if (!rid) throw new Error('O backend não retornou o identificador do relatório.');
      setRelatorioId(rid);

      setProgresso({ valor: 25, texto: 'Buscando atividades, fotos e notas fiscais...' });
      const resultado = await sincronizarRelatorioExecucao({
        relatorioId: rid,
        dataInicio: form.data_inicio,
        dataFim: form.data_fim,
        filtroMuseu: form.filtro_museu,
        filtroVersao: form.filtro_versao,
        filtroMetaIds: form.filtro_meta_ids,
      });

      setProgresso({ valor: 90, texto: 'Atualizando campos e finalizando...' });
      setRelatorio(resultado.relatorio);
      await carregarRelatorios();
      setProgresso({ valor: 100, texto: 'Relatório concluído.' });

      const auditoria = resultado.auditoria || {};
      toast.success(`${auditoria.metas || 0} meta(s), ${auditoria.notas_fiscais || 0} NF(s), ${auditoria.atividades || 0} atividade(s) e ${auditoria.fotos || 0} foto(s) vinculadas.`, { duration: 10000 });
    } catch (error) {
      toast.error('Erro ao gerar relatório: ' + (error?.message || String(error)), { duration: 12000 });
    } finally {
      setLoading(false);
    }
  }

  function exportarPDF() {
    if (!relatorio) return;
    try {
      exportarRelatorioExecucaoPDF(relatorio, 'completo');
      toast.success('PDF gerado em 3 partes.');
    } catch (error) {
      toast.error('Erro ao gerar PDF: ' + (error?.message || String(error)));
    }
  }

  const metasSelecionadas = useMemo(
    () => metas.filter(meta => form.filtro_meta_ids.includes(idMeta(meta))),
    [metas, form.filtro_meta_ids],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Execução do Objeto</h1>
          <p className="text-sm text-muted-foreground mt-1">Geração automática com IA • Modelo SUCC/PBH • Metas do 3º e 4º aditivos</p>
        </div>
        <Badge variant="outline">{relatoriosSalvos.length} relatórios salvos</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configurar relatório</CardTitle>
          <CardDescription>Selecione o período, o museu e exatamente as metas que deverão ser relatadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.tipo} onValueChange={tipo => setForm({ ...form, tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="parcial">Parcial</SelectItem><SelectItem value="final">Final</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Versão</Label>
              <Select value={form.filtro_versao} onValueChange={filtro_versao => setForm({ ...form, filtro_versao })}>
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
              <Select value={form.filtro_museu} onValueChange={filtro_museu => setForm({ ...form, filtro_museu })}>
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
            <div><Label className="text-xs">Data início</Label><Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div><Label className="text-xs">Data fim</Label><Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <Label className="font-semibold">Metas a serem relatadas</Label>
                <p className="text-xs text-slate-500">Somente as metas marcadas entrarão no cronograma, nas atividades, nas fotos e nas notas fiscais.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={selecionarTodas}>Selecionar todas</Button>
                <Button type="button" size="sm" variant="outline" onClick={limparSelecao}>Limpar</Button>
                <Button type="button" size="sm" variant="outline" onClick={carregarMetas}><RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar</Button>
              </div>
            </div>

            {carregandoMetas ? (
              <div className="py-6 text-center text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando metas...</div>
            ) : metas.length === 0 ? (
              <div className="py-6 text-center text-sm text-amber-700">Nenhuma meta do 3º ou 4º aditivo foi localizada.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {metas.map(meta => {
                  const id = idMeta(meta);
                  const checked = form.filtro_meta_ids.includes(id);
                  return (
                    <label key={id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${checked ? 'border-blue-400 bg-blue-50' : 'bg-white'}`}>
                      <input type="checkbox" checked={checked} onChange={() => alternarMeta(id)} className="mt-1" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800">{nomeMeta(meta)}</span>
                        <span className="block text-xs text-slate-500 truncate">{meta.codigo || meta.meta_codigo || `ID ${id}`}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="text-xs text-slate-600">{form.filtro_meta_ids.length} meta(s) selecionada(s).</div>
          </div>

          <Button onClick={iniciarGeracao} disabled={loading || form.filtro_meta_ids.length === 0} className="w-full md:w-auto">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            {loading ? 'Gerando relatório...' : 'Gerar relatório com metas selecionadas'}
          </Button>
        </CardContent>
      </Card>

      {loading && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-4 space-y-2">
            <div className="flex justify-between text-sm text-blue-700"><span>{progresso.texto}</span><span>{progresso.valor}%</span></div>
            <Progress value={progresso.valor} className="h-2" />
          </CardContent>
        </Card>
      )}

      {relatorio && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />Relatório atualizado</CardTitle>
              <CardDescription>{relatorio.data_inicio} a {relatorio.data_fim} • {metasSelecionadas.length} meta(s) selecionada(s)</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setRevisaoAberta(true)}>Revisar e Exportar</Button>
              <Button size="sm" variant="outline" onClick={exportarPDF}><Download className="w-4 h-4 mr-1" />PDF</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Resumo label="Metas" valor={(relatorio.cronograma_metas || []).length} />
              <Resumo label="Notas fiscais" valor={(relatorio._notas_fiscais_metas || []).length} />
              <Resumo label="Atividades" valor={(relatorio._atividades_periodo || []).length} />
              <Resumo label="Total financeiro" valor={formatarMoeda(relatorio._total_financeiro)} />
            </div>

            <Secao titulo="Identificação do projeto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <Campo label="Organização" valor={relatorio.identificacao_projeto?.organizacao} />
                <Campo label="Projeto" valor={relatorio.identificacao_projeto?.projeto} />
                <Campo label="Responsável" valor={relatorio.identificacao_projeto?.responsavel} />
                <Campo label="Instrumento" valor={relatorio.identificacao_projeto?.instrumento_juridico} />
                <Campo label="Processo" valor={relatorio.identificacao_projeto?.processo_administrativo} />
                <Campo label="E-mail" valor={relatorio.identificacao_projeto?.email} />
              </div>
            </Secao>

            <Secao titulo="Metas selecionadas e notas fiscais vinculadas">
              <div className="space-y-3">
                {(relatorio.cronograma_metas || []).map(meta => (
                  <div key={meta.meta_id || meta.meta_nome} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2"><strong className="text-sm">{meta.meta_nome}</strong><Badge variant="outline">{meta.status_meta || 'Em análise'}</Badge></div>
                    <p className="text-xs text-slate-600"><b>Ações:</b> {meta.acoes || '—'}</p>
                    <p className="text-xs text-slate-600"><b>Resultado:</b> {meta.resultado_alcancado || '—'}</p>
                    <p className="text-xs text-slate-600"><b>Período:</b> {meta.periodo || '—'}</p>
                    <div className="space-y-1">
                      {(meta.notas_fiscais || []).map(nota => (
                        <div key={nota.id} className="flex items-center justify-between gap-3 rounded bg-slate-50 px-2 py-1.5 text-xs">
                          <span>NF {nota.numero_nf} — {nota.fornecedor}</span><strong>{formatarMoeda(nota.valor)}</strong>
                        </div>
                      ))}
                      {(!meta.notas_fiscais || meta.notas_fiscais.length === 0) && <p className="text-xs text-slate-400 italic">Nenhuma NF aprovada vinculada a esta meta no período.</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Secao>
          </CardContent>
        </Card>
      )}

      {!relatorio && relatoriosSalvos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Relatórios anteriores</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {relatoriosSalvos.map(item => (
              <button key={item.id} onClick={() => carregarRelatorio(item.id)} className="w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-slate-50">
                <span><span className="block text-sm font-medium">{item.tipo === 'final' ? 'Relatório Final' : 'Relatório Parcial'}</span><span className="block text-xs text-slate-500">{item.data_inicio} a {item.data_fim}</span></span>
                <Badge variant="outline">{(item.filtro_meta_ids || []).length} meta(s)</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {revisaoAberta && relatorio && <RevisaoFinalDialog relatorioId={relatorioId} relatorio={relatorio} onClose={() => setRevisaoAberta(false)} />}
    </div>
  );
}

function Resumo({ label, valor }) {
  return <div className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-bold text-slate-800">{valor}</p></div>;
}

function Secao({ titulo, children }) {
  return <div className="rounded-xl border p-4"><h3 className="font-semibold text-sm mb-3">{titulo}</h3>{children}</div>;
}

function Campo({ label, valor }) {
  return <div><span className="text-slate-500">{label}:</span> <strong>{valor || '—'}</strong></div>;
}
