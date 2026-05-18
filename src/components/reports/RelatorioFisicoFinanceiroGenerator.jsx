import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileText, Download, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import buildRelatorioFisicoFinanceiroContext from '@/utils/buildRelatorioFisicoFinanceiroContext';
import montarHtmlRelatorioFisicoFinanceiro from '@/utils/relatorioFisicoFinanceiroTemplate';
import gerarTextosRelatorioFisicoFinanceiro from '@/services/relatorioIAService';
import { montarHtmlRelatorioPremium } from '@/components/reports/premium/PremiumReportLayout';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];

const CAPITULOS_RELATORIO = [
  { id: 'capa', label: 'Capa editorial' },
  { id: 'sumario_executivo', label: 'Sumário executivo editorial' },
  { id: 'introducao', label: 'Introdução institucional' },
  { id: 'territorio', label: 'Território e contexto cultural' },
  { id: 'indicadores_premium', label: 'Indicadores editoriais' },
  { id: 'resumo_geral', label: 'Resumo geral' },
  { id: 'publico', label: 'Público alcançado' },
  { id: 'metas', label: 'Metas do 3º Aditivo' },
  { id: 'programacao', label: 'Programação' },
  { id: 'agenda_programacao', label: 'Agenda de programação' },
  { id: 'timeline_premium', label: 'Linha do tempo editorial' },
  { id: 'atividades_museu', label: 'Atividades por museu' },
  { id: 'museus_premium', label: 'Páginas por museu' },
  { id: 'noturno_premium', label: 'Seção especial Noturno nos Museus' },
  { id: 'relatorios_completos', label: 'Relatórios integrais das equipes' },
  { id: 'galeria_evidencias', label: 'Galeria e evidências' },
  { id: 'galeria_premium', label: 'Galeria com créditos e GPS' },
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'comunicacao_premium', label: 'Comunicação editorial' },
  { id: 'financeiro', label: 'Execução financeira' },
  { id: 'rubricas', label: 'Rubricas e orçamento por grupo' },
  { id: 'prestacao', label: 'Prestação de contas' },
  { id: 'app_museu_centro', label: 'Museu Centro APP' },
  { id: 'sistema_governanca', label: 'Sistema, dados e governança' },
  { id: 'conclusao', label: 'Conclusão' },
];

const SECOES_RELATORIO = CAPITULOS_RELATORIO.map((capitulo) => capitulo.id);

async function safeList(entity, order = '-created_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const res = await entity.list(order, limit);
    return Array.isArray(res) ? res : [];
  } catch (error) {
    console.warn('Falha ao listar entidade do relatório:', error);
    return [];
  }
}

async function carregarBaseConhecimento() {
  const candidatos = [
    base44?.entities?.BaseConhecimento,
    base44?.entities?.KnowledgeBase,
    base44?.entities?.KnowledgeItem,
    base44?.entities?.ProjectKnowledge,
  ].filter(Boolean);

  for (const entity of candidatos) {
    const lista = await safeList(entity, '-updated_date', 500);
    if (lista.length > 0) return lista;
  }

  return [];
}

function salvarPreview(html) {
  try {
    sessionStorage.setItem('relatorio_fisico_financeiro_html', html);
  } catch (error) {
    console.warn('Não foi possível salvar a prévia do relatório:', error);
  }
}

async function gerarRelatorioDoApp(museu, { premium = false, secoesSelecionadas = SECOES_RELATORIO } = {}) {
  const dateFrom = '2026-02-02';
  const dateTo = '2026-04-30';
  const museuFiltro = museu === 'Todos' ? 'todos' : museu;

  const [
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    attachmentsRaw,
    programacaoRaw,
    conhecimentoRaw,
  ] = await Promise.all([
    safeList(base44.entities.Report, '-updated_date', 2000),
    safeList(base44.entities.Rubrica, 'ordem_exibicao', 2000),
    safeList(base44.entities.PurchaseRequest, '-created_date', 2000),
    safeList(base44.entities.Attachment, '-created_date', 3000),
    safeList(base44.entities.Programacao, '-data_inicio', 3000),
    carregarBaseConhecimento(),
  ]);

  const contexto = buildRelatorioFisicoFinanceiroContext({
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    attachmentsRaw,
    programacaoRaw,
    conhecimentoRaw,
    filtros: {
      dateFrom,
      dateTo,
      museu: museuFiltro,
      capitulos: secoesSelecionadas,
    },
  });

  const contextoComEstrategia = {
    ...contexto,
    capitulos_relatorio: CAPITULOS_RELATORIO,
    secoesSelecionadas,
  };

  const textos = await gerarTextosRelatorioFisicoFinanceiro(
    contextoComEstrategia,
    true
  );

  const filtros = {
    dateFrom,
    dateTo,
    museu: museu === 'Todos' ? 'Todos os museus' : museu,
  };

  const html = premium ? montarHtmlRelatorioPremium({
    contexto: contextoComEstrategia,
    textos,
    filtros,
    secoesSelecionadas,
  }) : montarHtmlRelatorioFisicoFinanceiro({
    contexto: contextoComEstrategia,
    textos,
    secoesSelecionadas,
    filtros,
  });

  return { html, contexto: contextoComEstrategia };
}

export default function RelatorioFisicoFinanceiroGenerator() {
  const [museu, setMuseu] = useState('Todos');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [modoPremium, setModoPremium] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [secoes, setSecoes] = useState(Object.fromEntries(CAPITULOS_RELATORIO.map((capitulo) => [capitulo.id, true])));

  const secoesSelecionadas = Object.entries(secoes).filter(([, ativo]) => ativo).map(([id]) => id);
  const toggleSecao = (id) => setSecoes((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleTodas = (value) => setSecoes(Object.fromEntries(CAPITULOS_RELATORIO.map((capitulo) => [capitulo.id, value])));

  const openPreview = (html) => {
    salvarPreview(html);
    const preview = window.open('/RelatorioPreview', '_blank', 'width=1200,height=900');
    if (preview) return null;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return url;
  };

  const downloadHtml = (html) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-museus-centro-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGerar = async () => {
    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos um capítulo.');
      return;
    }

    setLoading(true);
    setResultado(null);
    setErro(null);
    try {
      let data = null;
      let fonte = modoPremium ? 'premium_app' : 'backend';

      if (!modoPremium) {
        try {
          const response = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
            museu: museu === 'Todos' ? null : museu,
            formato: 'abrangente',
            usar_fotos_app: true,
            incluir_relatorios_equipe: true,
            refinar_textos_ia: true,
          });

          if (response?.data?.html) {
            data = response.data;
          }
        } catch (backendError) {
          console.warn(
            'gerarRelatorioFisicoFinanceiro indisponível. Gerando no frontend com dados do app e textos refinados por IA.',
            backendError
          );
        }
      }

      if (!data?.html) {
        const local = await gerarRelatorioDoApp(museu, { premium: modoPremium, secoesSelecionadas });
        data = { html: local.html, contexto: local.contexto };
        fonte = modoPremium ? 'premium_app' : 'frontend_ia';
      }

      setResultado({ ...data, fonte });
      openPreview(data.html);
      setDialogAberto(false);
      toast.success(fonte === 'premium_app' ? 'Relatório institucional gerado.' : fonte === 'backend' ? 'Relatório gerado pela função evoluída.' : 'Relatório gerado com dados reais do app e IA.');
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Não foi possível gerar o relatório.');
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div><div><h2 className="text-lg font-bold text-slate-900">Gerar Relatório</h2><p className="text-sm text-slate-500">Catálogo-livro institucional com fotos, gráficos, metas, programação e execução financeira.</p></div></div>
      <Button onClick={() => setDialogAberto(true)} disabled={loading} className="w-full h-12">{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}Gerar Relatório</Button>
      {erro && <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3"><AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-amber-800">Não foi possível gerar o relatório</p><p className="text-xs text-amber-700 mt-1">{erro}</p></div></div>}
      {resultado && <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4"><div className="flex items-start gap-3 mb-3"><CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-green-800">Relatório gerado com sucesso!</p><p className="text-xs text-green-700 mt-1">{resultado.fonte === 'premium_app' ? 'Gerado no modo catálogo-livro institucional, usando dados reais do app e refinamento textual por IA.' : resultado.fonte === 'backend' ? 'Gerado pela função gerarRelatorioFisicoFinanceiro.' : 'Gerado no frontend com dados reais do app, fotos vinculadas e refinamento textual por IA.'}</p></div></div><div className="flex gap-3 flex-wrap"><Button variant="outline" size="sm" onClick={() => openPreview(resultado.html)}><ExternalLink className="w-4 h-4 mr-2" />Abrir Relatório</Button><Button variant="outline" size="sm" onClick={() => downloadHtml(resultado.html)}><Download className="w-4 h-4 mr-2" />Baixar HTML</Button></div></div>}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escolha os capítulos do relatório</DialogTitle>
            <p className="text-sm text-slate-500">Selecione o formato, o museu e os capítulos que entram na geração.</p>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Museu</Label>
                <Select value={museu} onValueChange={setMuseu}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MUSEUS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer ${modoPremium ? 'border-black bg-black/5' : 'border-slate-200 bg-slate-50'}`} onClick={() => setModoPremium((v) => !v)}>
                <Checkbox checked={modoPremium} onCheckedChange={(v) => setModoPremium(!!v)} onClick={(event) => event.stopPropagation()} className="mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Catálogo-livro institucional</p>
                  <p className="text-xs text-slate-500 mt-0.5">Capa full bleed, timeline, museus, Noturno, comunicação, galeria com créditos/GPS e tabelas A4.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Capítulos</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => toggleTodas(true)} className="text-blue-600 hover:underline">Todos</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={() => toggleTodas(false)} className="text-slate-500 hover:underline">Nenhum</button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {CAPITULOS_RELATORIO.map((capitulo) => (
                <label key={capitulo.id} className="flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-3 py-2 cursor-pointer">
                  <Checkbox checked={!!secoes[capitulo.id]} onCheckedChange={() => toggleSecao(capitulo.id)} />
                  <span className="text-sm text-slate-700">{capitulo.label}</span>
                </label>
              ))}
            </div>

            <p className="text-xs text-slate-500">{secoesSelecionadas.length} de {CAPITULOS_RELATORIO.length} capítulos selecionados.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={handleGerar} disabled={loading || secoesSelecionadas.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              Gerar relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
