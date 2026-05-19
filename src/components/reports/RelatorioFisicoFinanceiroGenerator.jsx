import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileText, Download, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import LoadingDataNotice from '@/components/ui/LoadingDataNotice';
import buildRelatorioFisicoFinanceiroContext from '@/utils/buildRelatorioFisicoFinanceiroContext';
import montarHtmlRelatorioFisicoFinanceiro from '@/utils/relatorioFisicoFinanceiroTemplate';
import gerarTextosRelatorioFisicoFinanceiro from '@/services/relatorioIAService';
import { montarHtmlRelatorioPremium } from '@/components/reports/premium/PremiumReportLayout';
import { revisarHtmlRelatorioAntesDaExportacao } from '@/services/reportEditorialReview';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];
const MAX_EXPORT_PART_SIZE_BYTES = 200 * 1024 * 1024;
const EXPORT_FILENAME_BASE = 'Relatorio_Museus_Centro';

const CAPITULOS_RELATORIO = [
  { id: 'capa', label: 'Capa editorial' },
  { id: 'expediente', label: 'Expediente institucional' },
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
function getCapituloLabel(sectionId) {
  return CAPITULOS_RELATORIO.find((item) => item.id === sectionId)?.label || sectionId;
}

function buildPartFileName(partNumber, extension = 'html') {
  return `${EXPORT_FILENAME_BASE}_parte_${String(partNumber).padStart(2, '0')}.${extension}`;
}

function buildDivisionSummary(parts = []) {
  if (!Array.isArray(parts) || parts.length <= 1) return '';

  const linhas = parts.map((part) => {
    const titulos = (part.sectionLabels || []).join(', ');
    return `Parte ${String(part.partNumber).padStart(2, '0')} — ${titulos}`;
  });

  return `
    <section style="max-width:210mm;margin:0 auto 18px;padding:0 24px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#333;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:16px 18px;background:#fff;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;">Relatório dividido em ${parts.length} arquivos</p>
        <ul style="margin:0;padding-left:18px;font-size:11.5px;line-height:1.55;">
          ${linhas.map((linha) => `<li>${linha}</li>`).join('')}
        </ul>
      </div>
    </section>
  `;
}

function injectPartMetadata(html, { partNumber, totalParts, sectionLabels = [], summaryHtml = '' } = {}) {
  if (!html) return html;

  const header = `
    <section style="max-width:210mm;margin:0 auto 18px;padding:0 24px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#333;">
      <div style="border:1px solid rgba(23,23,23,.16);padding:14px 18px;background:#fff;">
        <p style="margin:0;font-size:13px;font-weight:700;">Relatório Museus Centro — Parte ${String(partNumber).padStart(2, '0')} de ${String(totalParts).padStart(2, '0')}</p>
        <p style="margin:6px 0 0;font-size:11.5px;line-height:1.5;">Período do relatório: fevereiro a abril de 2026</p>
        <p style="margin:4px 0 0;font-size:11.5px;line-height:1.5;">Capítulos desta parte: ${sectionLabels.join(', ')}</p>
      </div>
    </section>
  `;

  const content = `${partNumber === 1 && summaryHtml ? summaryHtml : ''}${header}`;

  if (html.includes('<body>')) {
    return html.replace('<body>', `<body>${content}`);
  }

  return `${content}${html}`;
}

function buildPartsFromMeasuredSections(sectionMeasures = []) {
  const orderedMeasures = Array.isArray(sectionMeasures) ? sectionMeasures.filter(Boolean) : [];
  const parts = [];
  let currentSections = [];
  let currentSize = 0;

  orderedMeasures.forEach((measure) => {
    if (measure.sizeBytes > MAX_EXPORT_PART_SIZE_BYTES) {
      if (currentSections.length > 0) {
        parts.push({ secoes: currentSections, estimatedSizeBytes: currentSize, oversizedSingleChapter: false });
        currentSections = [];
        currentSize = 0;
      }

      parts.push({
        secoes: [measure.sectionId],
        estimatedSizeBytes: measure.sizeBytes,
        oversizedSingleChapter: true,
      });
      return;
    }

    const wouldExceedLimit =
      currentSections.length > 0 &&
      currentSize + measure.sizeBytes > MAX_EXPORT_PART_SIZE_BYTES;

    if (wouldExceedLimit) {
      parts.push({ secoes: currentSections, estimatedSizeBytes: currentSize, oversizedSingleChapter: false });
      currentSections = [];
      currentSize = 0;
    }

    currentSections.push(measure.sectionId);
    currentSize += measure.sizeBytes;
  });

  if (currentSections.length > 0) {
    parts.push({ secoes: currentSections, estimatedSizeBytes: currentSize, oversizedSingleChapter: false });
  }

  return parts;
}

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

async function gerarRelatorioDoApp(museu, { premium = false, secoesSelecionadas = SECOES_RELATORIO, splitContext = null } = {}) {
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
      split_context: splitContext || undefined,
    },
  });

  const contextoComEstrategia = {
    ...contexto,
    capitulos_relatorio: CAPITULOS_RELATORIO,
    secoesSelecionadas,
    split_context: splitContext || undefined,
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

  const htmlInicial = premium ? montarHtmlRelatorioPremium({
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
  const html = revisarHtmlRelatorioAntesDaExportacao(htmlInicial, { modo: premium ? 'premium' : 'fisico_financeiro' });

  return { html, contexto: contextoComEstrategia };
}

export default function RelatorioFisicoFinanceiroGenerator() {
  const [museu, setMuseu] = useState('Todos');
  const [loading, setLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [modoPremium, setModoPremium] = useState(true);
  const [exportMode, setExportMode] = useState('single');
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

  const downloadNamedHtml = (html, fileName) => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHtml = (html) => {
    downloadNamedHtml(html, `relatorio-museus-centro-${Date.now()}.html`);
  };

  const updateProgress = (percent, label, detail = '') => {
    setExportProgress({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      label,
      detail,
    });
  };

  const handleGerar = async () => {
    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos um capítulo.');
      return;
    }

    setLoading(true);
    updateProgress(4, 'Iniciando geração do relatório', `${secoesSelecionadas.length} capítulos selecionados`);
    setResultado(null);
    setErro(null);

    try {
      toast.info(exportMode === 'split' ? 'Preparando exportação dividida...' : 'Preparando exportação em arquivo único...');

      let data = null;
      let fonte = modoPremium ? 'premium_app' : 'backend';

      if (!modoPremium) {
        try {
          updateProgress(12, 'Consultando geração principal', 'Tentando usar a função evoluída do backend');
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
        updateProgress(28, 'Consolidando dados e capítulos', 'Montando o relatório com dados reais do app');
        const local = await gerarRelatorioDoApp(museu, { premium: modoPremium, secoesSelecionadas });
        data = { html: local.html, contexto: local.contexto };
        fonte = modoPremium ? 'premium_app' : 'frontend_ia';
      }

      const htmlSize = new Blob([data.html], { type: 'text/html;charset=utf-8' }).size;

      if (exportMode === 'single' || htmlSize <= MAX_EXPORT_PART_SIZE_BYTES) {
        updateProgress(88, 'Finalizando arquivo único', 'Preparando prévia e download');
        if (exportMode === 'split' && htmlSize <= MAX_EXPORT_PART_SIZE_BYTES) {
          toast.info('O relatório ficou abaixo de 200 MB e foi mantido em arquivo único.');
        }

        setResultado({
          ...data,
          fonte,
          exportMode: 'single',
          htmlSize,
        });
        updateProgress(100, 'Relatório concluído', 'Arquivo único pronto');
        openPreview(data.html);
      } else {
        const measuredSections = [];

        for (let index = 0; index < secoesSelecionadas.length; index += 1) {
          const sectionId = secoesSelecionadas[index];
          const percent = 30 + ((index + 1) / Math.max(1, secoesSelecionadas.length)) * 28;
          updateProgress(percent, 'Medindo capítulos para divisão', `${index + 1} de ${secoesSelecionadas.length} capítulos analisados`);
          const chapterResult = await gerarRelatorioDoApp(museu, {
            premium: modoPremium,
            secoesSelecionadas: [sectionId],
          });
          const chapterSize = new Blob([chapterResult.html], { type: 'text/html;charset=utf-8' }).size;
          measuredSections.push({
            sectionId,
            sizeBytes: chapterSize,
            label: getCapituloLabel(sectionId),
          });
        }

        const builtParts = buildPartsFromMeasuredSections(measuredSections);

        if (builtParts.length === 0) {
          builtParts.push({
            secoes: secoesSelecionadas,
            estimatedSizeBytes: htmlSize,
            oversizedSingleChapter: false,
          });
        }

        const totalParts = builtParts.length;
        const summaryHtml = buildDivisionSummary(
          builtParts.map((part, index) => ({
            partNumber: index + 1,
            sectionLabels: part.secoes.map(getCapituloLabel),
          }))
        );

        const finalParts = [];
        for (let index = 0; index < builtParts.length; index += 1) {
          const part = builtParts[index];
          const partNumber = index + 1;
          const percent = 62 + (partNumber / Math.max(1, totalParts)) * 30;
          updateProgress(percent, 'Gerando partes do relatório', `${partNumber} de ${totalParts} partes em preparação`);
          if (part.oversizedSingleChapter && part.secoes.length === 1) {
            toast.info(`O capítulo ${getCapituloLabel(part.secoes[0])} excede 200 MB e foi exportado em arquivo próprio para preservar a integridade do PDF.`);
          }
          const splitContext = {
            enabled: true,
            partNumber,
            totalParts,
            sectionLabels: part.secoes.map(getCapituloLabel),
            subdivisionOf: null,
          };

          const localPart = await gerarRelatorioDoApp(museu, {
            premium: modoPremium,
            secoesSelecionadas: part.secoes,
            splitContext,
          });

          const htmlPart = injectPartMetadata(localPart.html, {
            partNumber,
            totalParts,
            sectionLabels: splitContext.sectionLabels,
            summaryHtml,
          });

          finalParts.push({
            partNumber,
            totalParts,
            fileName: buildPartFileName(partNumber),
            html: htmlPart,
            sizeBytes: new Blob([htmlPart], { type: 'text/html;charset=utf-8' }).size,
            sectionLabels: splitContext.sectionLabels,
            secoes: part.secoes,
          });

          toast.success(`Parte ${String(partNumber).padStart(2, '0')} preparada com ${splitContext.sectionLabels.join(', ')}.`);
        }

        setResultado({
          ...data,
          fonte,
          exportMode: 'split',
          htmlSize,
          parts: finalParts,
        });
        updateProgress(100, 'Relatório concluído', `${finalParts.length} partes prontas para visualização e download`);
        openPreview(finalParts[0]?.html || data.html);
      }

      setDialogAberto(false);
      toast.success(
        fonte === 'premium_app'
          ? 'Relatório institucional gerado.'
          : fonte === 'backend'
            ? 'Relatório gerado pela função evoluída.'
            : 'Relatório gerado com dados reais do app e IA.'
      );
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Não foi possível gerar o relatório.');
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setLoading(false);
      setTimeout(() => setExportProgress(null), 1200);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gerar Relatório</h2>
          <p className="text-sm text-slate-500">Catálogo-livro institucional com fotos, gráficos, metas, programação e execução financeira.</p>
        </div>
      </div>

      {exportProgress && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Progresso da Exportação</p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-4xl font-bold leading-none text-slate-900 tabular-nums">{exportProgress.percent}%</span>
                <span className="pb-1 text-sm text-slate-500">concluído</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{exportProgress.label}</p>
              <p className="text-xs text-slate-500">{exportProgress.detail}</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-300"
              style={{ width: `${exportProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      <Button onClick={() => setDialogAberto(true)} disabled={loading} className="w-full h-12">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
        Gerar Relatório
      </Button>

      {loading && (
        <LoadingDataNotice
          className="mt-4"
          title="Relatório carregando dados"
          message="O app está recuperando relatórios, programação, rubricas, compras, anexos e textos de apoio. A prévia será aberta quando a consolidação terminar."
        />
      )}

      {erro && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Não foi possível gerar o relatório</p>
            <p className="text-xs text-amber-700 mt-1">{erro}</p>
          </div>
        </div>
      )}

      {resultado && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Relatório gerado com sucesso!</p>
              <p className="text-xs text-green-700 mt-1">
                {resultado.fonte === 'premium_app'
                  ? 'Gerado no modo catálogo-livro institucional, usando dados reais do app e refinamento textual por IA.'
                  : resultado.fonte === 'backend'
                    ? 'Gerado pela função gerarRelatorioFisicoFinanceiro.'
                    : 'Gerado no frontend com dados reais do app, fotos vinculadas e refinamento textual por IA.'}
              </p>
              {resultado.exportMode === 'split' && Array.isArray(resultado.parts) && resultado.parts.length > 1 && (
                <p className="text-xs text-green-700 mt-1">
                  Exportação preparada em {resultado.parts.length} partes, respeitando a ordem dos capítulos selecionados.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            {resultado.exportMode === 'split' && Array.isArray(resultado.parts) && resultado.parts.length > 1 ? (
              <>
                <Button variant="outline" size="sm" onClick={() => openPreview(resultado.parts[0]?.html || resultado.html)}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir Parte 01
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resultado.parts.forEach((part) => downloadNamedHtml(part.html, part.fileName))}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar todas as partes
                </Button>
                {resultado.parts.map((part) => (
                  <Button
                    key={part.fileName}
                    variant="outline"
                    size="sm"
                    onClick={() => downloadNamedHtml(part.html, part.fileName)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {`Parte ${String(part.partNumber).padStart(2, '0')}`}
                  </Button>
                ))}
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => openPreview(resultado.html)}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir Relatório
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadHtml(resultado.html)}>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar HTML
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escolha os capítulos do relatório</DialogTitle>
            <p className="text-sm text-slate-500">Selecione o formato, o museu, o modo de exportação e os capítulos que entram na geração.</p>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {loading && (
              <LoadingDataNotice
                title="Carregando dados do relatório"
                message="Mantenha esta janela aberta enquanto o sistema consolida dados reais do app e revisa o HTML antes da prévia."
              />
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Museu</Label>
                <Select value={museu} onValueChange={setMuseu}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MUSEUS.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer ${modoPremium ? 'border-black bg-black/5' : 'border-slate-200 bg-slate-50'}`}
                onClick={() => setModoPremium((value) => !value)}
              >
                <Checkbox
                  checked={modoPremium}
                  onCheckedChange={(value) => setModoPremium(!!value)}
                  onClick={(event) => event.stopPropagation()}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Catálogo-livro institucional</p>
                  <p className="text-xs text-slate-500 mt-0.5">Capa full bleed, timeline, museus, Noturno, comunicação, galeria com créditos/GPS e tabelas A4.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Modo de exportação</Label>
              <div className="grid md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setExportMode('single')}
                  className={`rounded-xl border p-4 text-left transition-colors ${exportMode === 'single' ? 'border-black bg-black/5' : 'border-slate-200 bg-white'}`}
                >
                  <p className="text-sm font-semibold text-slate-900">Exportar em arquivo único</p>
                  <p className="text-xs text-slate-500 mt-1">Mantém exatamente o fluxo atual da exportação.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportMode('split')}
                  className={`rounded-xl border p-4 text-left transition-colors ${exportMode === 'split' ? 'border-black bg-black/5' : 'border-slate-200 bg-white'}`}
                >
                  <p className="text-sm font-semibold text-slate-900">Dividir em arquivos de até 200 MB</p>
                  <p className="text-xs text-slate-500 mt-1">Agrupa os capítulos em partes válidas antes da geração final do HTML/PDF.</p>
                </button>
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

            <p className="text-xs text-slate-500">
              {secoesSelecionadas.length} de {CAPITULOS_RELATORIO.length} capítulos selecionados.
            </p>
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
