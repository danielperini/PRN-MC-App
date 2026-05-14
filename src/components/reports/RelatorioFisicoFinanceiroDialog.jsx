import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileDown, Loader2, Eye, AlertCircle, Paperclip, Sparkles } from 'lucide-react';

import buildRelatorioFisicoFinanceiroContext from '@/utils/buildRelatorioFisicoFinanceiroContext';
import montarHtmlRelatorioFisicoFinanceiro from '@/utils/relatorioFisicoFinanceiroTemplate';
import gerarTextosRelatorioFisicoFinanceiro from '@/services/relatorioIAService';

const SECOES = [
  { id: 'capa', label: 'Capa editorial' },
  { id: 'introducao', label: 'Introdução e território' },
  { id: 'resumo_geral', label: 'Resumo e indicadores' },
  { id: 'publico', label: 'Público alcançado' },
  { id: 'atividades', label: 'Atividades por eixo' },
  { id: 'financeiro', label: 'Execução financeira' },
  { id: 'prestacao', label: 'Prestação de contas' },
  { id: 'memoria', label: 'Memória institucional' },
  { id: 'conclusao', label: 'Conclusão' },
];

const MUSEUS_OPTIONS = [
  { value: 'todos', label: 'Todos os museus' },
  { value: 'MIS', label: 'MIS' },
  { value: 'MHAB', label: 'MHAB' },
  { value: 'MUMO', label: 'MUMO' },
];

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
    console.warn('Não foi possível salvar prévia no sessionStorage:', error);
  }
}

function abrirPreview(html) {
  salvarPreview(html);

  const previewUrl = '/RelatorioPreview';
  const opened = window.open(previewUrl, '_blank', 'width=1200,height=900');

  if (opened) return;

  const w = window.open('', '_blank', 'width=1200,height=900');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}

export default function RelatorioFisicoFinanceiroDialog({ open, onClose }) {
   const [dateFrom, setDateFrom] = useState('2026-02-02');
   const [dateTo, setDateTo] = useState('2026-04-30');
   const [museu, setMuseu] = useState('todos');
   const [secoes, setSecoes] = useState(Object.fromEntries(SECOES.map((s) => [s.id, true])));
   const [modoEntrega, setModoEntrega] = useState(true);
   const [introIA, setIntroIA] = useState(true);
   const [editorialFase3Ativo, setEditorialFase3Ativo] = useState(true);
   const [loadingPrevia, setLoadingPrevia] = useState(false);
   const [loadingPDF, setLoadingPDF] = useState(false);
   const [previa, setPrevia] = useState(null);

  const toggleSecao = (id) => setSecoes((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = (val) => setSecoes(Object.fromEntries(SECOES.map((s) => [s.id, val])));

  const secoesSelecionadas = Object.entries(secoes).filter(([, v]) => v).map(([k]) => k);

  async function coletarDados() {
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
        museu,
        modoEntrega,
      },
    });

    const textos = await gerarTextosRelatorioFisicoFinanceiro(contexto, introIA);

    return { contexto, textos };
  }

  async function gerarHtml() {
    const { contexto, textos } = await coletarDados();
    setPrevia(contexto);

    return montarHtmlRelatorioFisicoFinanceiro({
      contexto,
      textos,
      secoesSelecionadas,
      filtros: {
        dateFrom,
        dateTo,
        museu: museu === 'todos' ? 'Todos os museus' : museu,
      },
    });
  }

  async function handlePrevia() {
    if (!dateFrom || !dateTo) {
      toast.error('Informe as datas');
      return;
    }

    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos uma seção');
      return;
    }

    setLoadingPrevia(true);

    try {
      const html = await gerarHtml();
      abrirPreview(html);
      toast.success('Prévia editorial aberta.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar prévia: ' + (error?.message || 'tente novamente'));
    } finally {
      setLoadingPrevia(false);
    }
  }

  async function handlePDF() {
    if (!dateFrom || !dateTo) {
      toast.error('Informe as datas');
      return;
    }

    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos uma seção');
      return;
    }

    setLoadingPDF(true);

    try {
      const html = await gerarHtml();
      salvarPreview(html);

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

  const isLoading = loadingPrevia || loadingPDF;
  const secoesCount = secoesSelecionadas.length;
  const tempoEstimado = modoEntrega ? '3 a 5 min' : '1 a 2 min';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Relatório Editorial Institucional</DialogTitle>
          <p className="text-sm text-gray-500 mt-0.5">Museus Centro — publicação cultural consolidada com curadoria IA</p>
        </DialogHeader>

        <div className="space-y-5 py-2">
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
                    Reorganiza relatórios aprovados, fotos, atividades, execução financeira e prestação de contas.
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
                    Redigir e auditar textos com IA
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    A IA usa os relatórios aprovados, programação e base de conhecimento para escrever textos longos e técnicos.
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
                  <Label htmlFor="editorialFase3" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    ✨ Editorial Fase 3 — Consolidação
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Integra releases, programação e atividades para gerar narrativa institucional única.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Seções do relatório</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => toggleAll(true)} className="text-blue-600 hover:underline">Todas</button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={() => toggleAll(false)} className="text-gray-500 hover:underline">Nenhuma</button>
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
                  <Label htmlFor={s.id} className="text-sm cursor-pointer text-gray-700">{s.label}</Label>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              {secoesCount} de {SECOES.length} seções selecionadas
            </p>
          </div>

          {previa && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2 text-sm">
              <p className="font-semibold text-blue-800">Prévia — métricas extraídas</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-blue-900">
                <span>Relatórios: <strong>{previa.total_relatorios ?? '—'}</strong></span>
                <span>Atividades: <strong>{previa.total_atividades ?? '—'}</strong></span>
                <span>Público total: <strong>{Number(previa.publico_total || 0).toLocaleString('pt-BR')}</strong></span>
                <span>Compras: <strong>{previa.total_compras ?? '—'}</strong></span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              O relatório usa somente dados registrados no sistema. A IA reorganiza, audita e redige, mas não altera nenhum dado original. Tempo estimado: <strong>{tempoEstimado}</strong>.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>

          <Button
            variant="outline"
            className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={handlePrevia}
            disabled={isLoading}
          >
            {loadingPrevia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {loadingPrevia ? 'Gerando prévia...' : 'Gerar prévia'}
          </Button>

          <Button
            className="bg-black hover:bg-gray-800 text-white gap-2"
            onClick={handlePDF}
            disabled={isLoading}
          >
            {loadingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {loadingPDF ? 'Gerando PDF...' : 'Gerar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}