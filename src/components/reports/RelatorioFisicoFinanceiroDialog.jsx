import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileDown, Loader2, Eye, AlertCircle } from 'lucide-react';

const SECOES = [
  { id: 'capa',            label: 'Capa' },
  { id: 'introducao',      label: 'Introdução executiva' },
  { id: 'resumo_geral',    label: 'Resumo geral do período' },
  { id: 'atividades',      label: 'Atividades realizadas' },
  { id: 'resumo_museu',    label: 'Resumo por museu' },
  { id: 'publico',         label: 'Público alcançado' },
  { id: 'comunicacao',     label: 'Comunicação' },
  { id: 'fotos',           label: 'Fotos' },
  { id: 'financeiro',      label: 'Execução financeira' },
  { id: 'notas_fiscais',   label: 'Notas fiscais e compras' },
  { id: 'prestacao',       label: 'Prestação de contas' },
  { id: 'conclusao',       label: 'Conclusão' },
];

const MUSEUS_OPTIONS = [
  { value: 'todos', label: 'Todos os museus' },
  { value: 'MIS',   label: 'MIS' },
  { value: 'MHAB',  label: 'MHAB' },
  { value: 'MUMO',  label: 'MUMO' },
];

export default function RelatorioFisicoFinanceiroDialog({ open, onClose }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const inicioAno = `${new Date().getFullYear()}-01-01`;

  const [dateFrom, setDateFrom]   = useState(inicioAno);
  const [dateTo, setDateTo]       = useState(hoje);
  const [museu, setMuseu]         = useState('todos');
  const [secoes, setSecoes]       = useState(
    Object.fromEntries(SECOES.map(s => [s.id, true]))
  );
  const [loadingPrevia, setLoadingPrevia] = useState(false);
  const [loadingPDF,    setLoadingPDF]    = useState(false);
  const [previa,        setPrevia]        = useState(null);

  const toggleSecao = (id) =>
    setSecoes(p => ({ ...p, [id]: !p[id] }));

  const toggleAll = (val) =>
    setSecoes(Object.fromEntries(SECOES.map(s => [s.id, val])));

  const payload = {
    dateFrom,
    dateTo,
    museu: museu === 'todos' ? null : museu,
    secoes: Object.entries(secoes).filter(([, v]) => v).map(([k]) => k),
  };

  const handlePrevia = async () => {
    if (!dateFrom || !dateTo) { toast.error('Informe as datas'); return; }
    if (payload.secoes.length === 0) { toast.error('Selecione ao menos uma seção'); return; }
    setLoadingPrevia(true);
    setPrevia(null);
    try {
      const res = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
        ...payload, modo: 'previa'
      });
      if (res.data?.error) { toast.error(res.data.error); return; }
      setPrevia(res.data);
      toast.success('Prévia gerada!');
    } catch (err) {
      toast.error('Erro ao gerar prévia: ' + (err?.message || 'tente novamente'));
    } finally {
      setLoadingPrevia(false);
    }
  };

  const handlePDF = async () => {
    if (!dateFrom || !dateTo) { toast.error('Informe as datas'); return; }
    if (payload.secoes.length === 0) { toast.error('Selecione ao menos uma seção'); return; }
    setLoadingPDF(true);
    try {
      const res = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
        ...payload, modo: 'pdf'
      });
      if (res.data?.error) { toast.error(res.data.error); return; }
      const url = res.data?.pdf_url || res.data?.url;
      const html = res.data?.html;
      if (url) {
        window.open(url, '_blank');
        toast.success('PDF gerado com sucesso!');
        onClose();
      } else if (html) {
        const w = window.open('', '_blank', 'width=1100,height=800');
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
        toast.success('Relatório aberto — use Ctrl+P para salvar em PDF.');
        onClose();
      } else {
        toast.error('O servidor não retornou o PDF.');
      }
    } catch (err) {
      toast.error('Erro ao gerar PDF: ' + (err?.message || 'tente novamente'));
    } finally {
      setLoadingPDF(false);
    }
  };

  const isLoading = loadingPrevia || loadingPDF;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Relatório Físico-Financeiro</DialogTitle>
          <p className="text-sm text-gray-500 mt-0.5">Projeto Museus Centro — gerado com IA</p>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Período */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Data inicial</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border-gray-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Data final</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border-gray-200" />
            </div>
          </div>

          {/* Museu */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Museu</Label>
            <Select value={museu} onValueChange={setMuseu}>
              <SelectTrigger className="border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MUSEUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seções */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Seções do relatório</Label>
              <div className="flex gap-2 text-xs">
                <button onClick={() => toggleAll(true)}  className="text-blue-600 hover:underline">Todas</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => toggleAll(false)} className="text-gray-500 hover:underline">Nenhuma</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 border border-gray-100 rounded-xl">
              {SECOES.map(s => (
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
              {Object.values(secoes).filter(Boolean).length} de {SECOES.length} seções selecionadas
            </p>
          </div>

          {/* Prévia */}
          {previa && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2 text-sm">
              <p className="font-semibold text-blue-800">Prévia — métricas extraídas</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-blue-900">
                <span>Relatórios: <strong>{previa.total_relatorios ?? '—'}</strong></span>
                <span>Aprovados: <strong>{previa.total_aprovados ?? '—'}</strong></span>
                <span>Atividades: <strong>{previa.total_atividades ?? '—'}</strong></span>
                <span>Público total: <strong>{(previa.publico_total ?? 0).toLocaleString('pt-BR')}</strong></span>
                <span>Orçamento: <strong>R$ 1.320.000,00</strong></span>
                <span>Utilizado: <strong>{previa.valor_utilizado != null ? `R$ ${Number(previa.valor_utilizado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</strong></span>
                <span>Notas fiscais: <strong>{previa.total_nf ?? '—'}</strong></span>
                <span>Compras pagas: <strong>{previa.total_compras ?? '—'}</strong></span>
              </div>
              {previa.alertas?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {previa.alertas.map((a, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-amber-700 text-xs">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" /> {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aviso IA */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>A IA gera textos com base nos dados reais. Nenhum dado será alterado. A geração pode levar 1–2 minutos.</span>
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