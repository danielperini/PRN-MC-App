import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileDown, Loader2, AlertCircle, Paperclip, Sparkles } from 'lucide-react';
import LoadingDataNotice from '@/components/ui/LoadingDataNotice';
import {
  REPORT_CHAPTERS,
  REPORT_CHAPTER_IDS,
  buildReportChapterSelectionState,
  getSelectedReportChapterIds,
} from '@/config/reportChapters';

import buildRelatorioFisicoFinanceiroContext from '@/utils/buildRelatorioFisicoFinanceiroContext';
import { validateReportBeforeExport } from '@/utils/reportDataNormalizer';
import { normalizeHtmlForReport } from '@/utils/reportTextHelpers';
import montarHtmlRelatorioFisicoFinanceiro from '@/utils/relatorioFisicoFinanceiroTemplate';
import gerarTextosRelatorioFisicoFinanceiro from '@/services/relatorioIAService';
import { montarHtmlRelatorioPremium } from '@/components/reports/premium/PremiumReportLayout';
import { saveSingleReportPreview } from '@/services/reportExportPipeline';
const SECOES = REPORT_CHAPTERS;

const MUSEUS_OPTIONS = [
  { value: 'todos', label: 'Todos os museus' },
  { value: 'MIS', label: 'MIS' },
  { value: 'MHAB', label: 'MHAB' },
  { value: 'MUMO', label: 'MUMO' },
];

const REPORT_GENERATOR_STRATEGY = {
  nome: 'Gerador de Relatório',
  idioma: 'pt-BR',
  tom: 'institucional, técnico, cultural e analítico',
  atividades: {
    agrupamento: 'por_museu',
    museus: ['MIS', 'MHAB', 'MUMO'],
    reproduzir_textos_integrais: true,
    fotos_por_atividade: 2,
    renderizar_fotos_apenas_quando_existirem: true,
    grade_arquivos_drive: '3_colunas',
    link_drive_generico: true,
  },
  ia: {
    redigir_introducao_institucional: true,
    redigir_conclusao: true,
    sugerir_capitulos: true,
    interpretar_metas: true,
    interpretar_execucao_financeira: true,
    pode_usar_web_no_base44: true,
  },
  capitulos_removidos: ['memoria_institucional'],
};

async function safeList(entity, order = '-created_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const res = await entity.list(order, limit);
    return Array.isArray(res) ? res : [];
  } catch (error) {
    console.warn('Falha ao listar entidade:', error);
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadDialogReportEntities() {
  const loaders = [
    ['reportsRaw', () => safeList(base44.entities.Report, '-updated_date', 2000)],
    ['rubricasRaw', () => safeList(base44.entities.Rubrica, 'ordem_exibicao', 2000)],
    ['comprasRaw', () => safeList(base44.entities.PurchaseRequest, '-created_date', 2000)],
    ['teamPaymentsRaw', () => safeList(base44.entities.TeamPayment, '-created_date', 2000)],
    ['documentIntakeRaw', () => safeList(base44.entities.DocumentIntake, '-created_date', 2000)],
    ['attachmentsRaw', () => safeList(base44.entities.Attachment, '-created_date', 3000)],
    ['programacaoRaw', () => safeList(base44.entities.Programacao, '-data_inicio', 3000)],
    ['conhecimentoRaw', () => carregarBaseConhecimento()],
  ];
  const data = {};

  for (const [key, loader] of loaders) {
    data[key] = await loader();
    await sleep(250);
  }

  return data;
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

async function salvarPreview(html, meta = {}) {
  try {
    sessionStorage.setItem('relatorio_fisico_financeiro_html', html);
  } catch (error) {
    console.warn('Não foi possível salvar prévia no sessionStorage:', error);
  }

  await saveSingleReportPreview({
    html,
    meta: {
      ...meta,
    },
  });
}

export default function RelatorioFisicoFinanceiroDialog({ open, onClose }) {
   const [dateFrom, setDateFrom] = useState('2026-02-02');
   const [dateTo, setDateTo] = useState('2026-04-30');
   const [museu, setMuseu] = useState('todos');
   const [secoes, setSecoes] = useState(buildReportChapterSelectionState());
   const [modoEntrega, setModoEntrega] = useState(true);
   const [introIA, setIntroIA] = useState(true);
   const [editorialFase3Ativo, setEditorialFase3Ativo] = useState(true);
   const [modoPremium, setModoPremium] = useState(true);
   const [loadingPDF, setLoadingPDF] = useState(false);
   const [previa, setPrevia] = useState(null);

  const toggleSecao = (id) => setSecoes((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = (val) => setSecoes(buildReportChapterSelectionState(val ? REPORT_CHAPTER_IDS : []));

  const secoesSelecionadas = getSelectedReportChapterIds(secoes);

  async function coletarDados() {
    const {
      reportsRaw,
      rubricasRaw,
      comprasRaw,
      teamPaymentsRaw,
      documentIntakeRaw,
      attachmentsRaw,
      programacaoRaw,
      conhecimentoRaw,
    } = await loadDialogReportEntities();

    const contexto = buildRelatorioFisicoFinanceiroContext({
      reportsRaw,
      rubricasRaw,
      comprasRaw,
      teamPaymentsRaw,
      documentIntakeRaw,
      attachmentsRaw,
      programacaoRaw,
      conhecimentoRaw,
      filtros: {
        dateFrom,
        dateTo,
        museu,
        modoEntrega,
        capitulos: secoesSelecionadas,
        reportGeneratorStrategy: REPORT_GENERATOR_STRATEGY,
      },
    });

    const contextoComEstrategia = {
      ...contexto,
      report_generator_strategy: REPORT_GENERATOR_STRATEGY,
      capitulos_relatorio: REPORT_CHAPTERS,
      secoesSelecionadas,
    };

    const textos = await gerarTextosRelatorioFisicoFinanceiro(contextoComEstrategia, introIA);

    return { contexto: contextoComEstrategia, textos };
  }

  async function gerarHtml() {
    const { contexto, textos } = await coletarDados();
    setPrevia(contexto);

    const filtros = {
      dateFrom,
      dateTo,
      museu: museu === 'todos' ? 'Todos os museus' : museu,
      reportGeneratorStrategy: REPORT_GENERATOR_STRATEGY,
    };

    const html = normalizeHtmlForReport(modoPremium
      ? montarHtmlRelatorioPremium({
        contexto,
        textos,
        filtros,
        secoesSelecionadas,
      })
      : montarHtmlRelatorioFisicoFinanceiro({
        contexto,
        textos,
        secoesSelecionadas,
        filtros,
      }));

    const validation = validateReportBeforeExport(contexto, html, secoesSelecionadas);
    if (!validation.valid) {
      throw new Error(`Validação editorial bloqueou a exportação: ${validation.errors.join(' ')}`);
    }
    if (validation.warnings.length > 0) {
      console.warn('Alertas editoriais antes da exportação:', validation.warnings);
    }

    return html;
  }

  async function handlePDF() {
    if (!dateFrom || !dateTo) {
      toast.error('Informe as datas');
      return;
    }

    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos um capítulo');
      return;
    }

    try {
      sessionStorage.setItem('relatorio_fisico_financeiro_selected_chapters', JSON.stringify(secoesSelecionadas));
      sessionStorage.setItem('relatorio_fisico_financeiro_export_mode', 'single');
    } catch {}

    setLoadingPDF(true);

    try {
      const html = await gerarHtml();
      await salvarPreview(html, {
        selectedChapters: secoesSelecionadas,
      });

      const w = window.open('/RelatorioPreview', '_blank', 'width=1200,height=900');
      if (w) {
        setTimeout(() => {
          try {
            w.focus();
          } catch {}
        }, 500);
      } else {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'width=1200,height=900');
      }

      toast.success('Relatório aberto. Use “Salvar como PDF”.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar relatório: ' + (error?.message || 'tente novamente'));
    } finally {
      setLoadingPDF(false);
    }
  }

  const isLoading = loadingPDF;
  const secoesCount = secoesSelecionadas.length;
  const tempoEstimado = modoEntrega ? '3 a 5 min' : '1 a 2 min';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Gerador de Relatório</DialogTitle>
          <p className="text-sm text-gray-500 mt-0.5">Museus Centro - relatório editorial, programático, financeiro e de prestação de contas</p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {isLoading && (
            <LoadingDataNotice
              title="Carregando dados do relatório"
              message="O app está consolidando relatórios, programação, rubricas, compras, anexos e textos. A prévia será aberta automaticamente ao final."
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Data inicial</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border-gray-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Data final</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border-gray-200"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Museu</Label>
            <Select value={museu} onValueChange={setMuseu}>
              <SelectTrigger className="border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MUSEUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Opções de geração</Label>
            <div className="space-y-2.5 p-4 bg-gray-50 border border-gray-100 rounded-xl">
              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${modoPremium ? 'border-black bg-black/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                onClick={() => setModoPremium((p) => !p)}
              >
                <Checkbox
                  id="modoPremium"
                  checked={modoPremium}
                  onCheckedChange={(v) => setModoPremium(!!v)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="modoPremium" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Catálogo-livro institucional
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Usa o novo layout editorial A4 com capa full bleed, timeline, páginas por museu, Noturno, comunicação, galeria e tabelas prontas para PDF profissional.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${modoEntrega ? 'border-black bg-black/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                onClick={() => setModoEntrega((p) => !p)}
              >
                <Checkbox
                  id="modoEntrega"
                  checked={modoEntrega}
                  onCheckedChange={(v) => setModoEntrega(!!v)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="modoEntrega" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    Entrega / Prestação de Contas
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Reorganiza relatórios aprovados, atividades por museu, fotos, execução financeira e documentos.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${introIA ? 'border-black bg-black/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                onClick={() => setIntroIA((p) => !p)}
              >
                <Checkbox
                  id="introIA"
                  checked={introIA}
                  onCheckedChange={(v) => setIntroIA(!!v)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="introIA" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Redigir textos em português BR com IA
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    A IA organiza introdução, metas, programação, dados financeiros, conclusão e análises dos registros.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${editorialFase3Ativo ? 'border-black bg-black/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                onClick={() => setEditorialFase3Ativo((p) => !p)}
              >
                <Checkbox
                  id="editorialFase3"
                  checked={editorialFase3Ativo}
                  onCheckedChange={(v) => setEditorialFase3Ativo(!!v)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="editorialFase3" className="text-sm font-medium cursor-pointer">
                    Consolidação editorial
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Integra programação, metas, relatórios das equipes, galeria, dashboards e prestação de contas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Capítulos do relatório</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => toggleAll(true)} className="text-blue-600 hover:underline">Todos</button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={() => toggleAll(false)} className="text-gray-500 hover:underline">Nenhum</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 border border-gray-100 rounded-xl">
              {SECOES.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5">
                  <Checkbox
                    id={s.id}
                    checked={!!secoes[s.id]}
                    onCheckedChange={() => toggleSecao(s.id)}
                  />
                  <Label htmlFor={s.id} className="text-sm cursor-pointer text-gray-700">{s.title}</Label>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              {secoesCount} de {SECOES.length} capítulos selecionados
            </p>
          </div>

          {previa && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2 text-sm">
              <p className="font-semibold text-blue-800">Prévia - métricas extraídas</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-blue-900">
                <span>Relatórios: <strong>{previa.total_relatorios ?? '-'}</strong></span>
                <span>Atividades: <strong>{previa.total_atividades ?? '-'}</strong></span>
                <span>Público total: <strong>{Number(previa.publico_total || 0).toLocaleString('pt-BR')}</strong></span>
                <span>Compras: <strong>{previa.total_compras ?? '-'}</strong></span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              O relatório usa somente dados registrados no sistema. A IA organiza, trata os dados e redige, mas não altera nenhum dado original. Tempo estimado: <strong>{tempoEstimado}</strong>.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>

          <Button
            className="bg-black hover:bg-gray-800 text-white gap-2"
            onClick={handlePDF}
            disabled={isLoading}
          >
            {loadingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {loadingPDF ? 'Gerando relatório...' : 'Gerar relatório'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
