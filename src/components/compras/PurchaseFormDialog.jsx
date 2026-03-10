import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Sparkles, AlertTriangle, CheckCircle, Loader2, Upload, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import OrcamentoUploadDialog from './OrcamentoUploadDialog';

const METAS = [
  { id: 'MC3A-20', label: 'MC3A-20 — Ações Educativas/Culturais' },
  { id: 'MC3A-21', label: 'MC3A-21 — Exposição e Produção Cultural' },
  { id: 'MC3A-22', label: 'MC3A-22 — Comunicação e Divulgação' },
  { id: 'MC3A-23', label: 'MC3A-23 — Noturno nos Museus 2026' },
  { id: 'MC3A-24', label: 'MC3A-24 — Emenda Parlamentar' },
  { id: 'MC3A-25', label: 'MC3A-25 — Outras Ações' },
  { id: 'MC3A-EXTRA', label: 'MC3A-EXTRA — Ações Extras' },
];

const CATEGORIAS = [
  'Serviços (equipe/coordenação)',
  'Serviços (comunicação: designer, foto, vídeo, imprensa, redes)',
  'Serviços (produção/infraestrutura/expografia)',
  'Serviços (eventos/atrações/artistas)',
  'Serviços (segurança/limpeza)',
  'Logística (transporte/vans)',
  'Alimentação (lanche/café/coffeebreak)',
  'Consultoria / Formação / Acessibilidade',
  'Materiais de consumo',
  'Outros',
];

const CENTROS = ['MUMO', 'MIS', 'MHAB', 'Noturno nos Museus 2026', 'Publicações', 'Geral'];
const PAGAMENTOS = ['PIX', 'TED/Transferência', 'Boleto', 'Cartão', 'Dinheiro'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const EMPTY = {
  meta_id: '', meta_extra_descricao: '', budgetline_id: '', categoria: '',
  tipo_gasto: '', centro_custo: '', descricao_item: '', qtd: 1, unidade: 'un',
  valor_solicitado: '', fornecedor_nome: '', fornecedor_cnpj: '', fornecedor_contato: '',
  link_proposta: '', meio_pagamento: '', detalhe_pagamento: '', observacoes: '',
  activity_id: '', report_id: '',
};

export default function PurchaseFormDialog({ budgetLines, currentUser, onClose, onSuccess, prefill }) {
  const [form, setForm] = useState(() => prefill ? { ...EMPTY, ...prefill } : EMPTY);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzingMeta, setAnalyzingMeta] = useState(false);
  const [checkingSaldo, setCheckingSaldo] = useState(false);
  const [saldoInfo, setSaldoInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [activities, setActivities] = useState([]);
  const [mes, setMes] = useState(prefill?.mes_referencia || MESES[new Date().getMonth()]);
  const [ano, setAno] = useState(prefill?.ano || new Date().getFullYear());
  const [showOrcamentoDialog, setShowOrcamentoDialog] = useState(false);

  // Campos travados quando vem de atividade
  const isFromActivity = !!(prefill?.activity_id);
  const lockedFields = isFromActivity ? ['activity_id', 'report_id', 'meta_id'] : [];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Carregar atividades do usuário para vincular
  useEffect(() => {
    if (currentUser?.email) {
      base44.entities.Activity.filter({}, '-created_date', 30).then(setActivities).catch(() => {});
    }
  }, [currentUser]);

  // Verificar saldo quando rubrica muda
  useEffect(() => {
    if (form.budgetline_id && form.valor_solicitado) {
      setCheckingSaldo(true);
      base44.functions.invoke('purchaseActions', {
        action: 'check_budget',
        budgetline_id: form.budgetline_id,
        valor: parseFloat(form.valor_solicitado) || 0,
      }).then(res => {
        setSaldoInfo(res.data);
        setCheckingSaldo(false);
      }).catch(() => setCheckingSaldo(false));
    }
  }, [form.budgetline_id, form.valor_solicitado]);

  const analyzeWithAI = async () => {
    if (!form.descricao_item || !form.meta_id || !form.categoria || !form.tipo_gasto) {
      toast.error('Preencha: descrição, meta, categoria e tipo antes de analisar.');
      return;
    }
    setAnalyzingMeta(true);
    try {
      const res = await base44.functions.invoke('purchaseActions', {
        action: 'analyze_meta',
        descricao_item: form.descricao_item,
        meta_id: form.meta_id,
        categoria: form.categoria,
        tipo_gasto: form.tipo_gasto,
        valor_solicitado: parseFloat(form.valor_solicitado) || 0,
      });
      setAiAnalysis(res.data.analysis);
    } catch (e) {
      toast.error('Erro na análise da IA');
    }
    setAnalyzingMeta(false);
  };

  const handleSave = async (submeter = false) => {
    if (!form.descricao_item || !form.meta_id || !form.budgetline_id || !form.categoria || !form.tipo_gasto || !form.valor_solicitado) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      // Garantir relatório mensal
      const reportRes = await base44.functions.invoke('purchaseActions', {
        action: 'ensure_report',
        mes_referencia: mes,
        ano,
      });
      const report_id = reportRes.data.report_id;

      const created = await base44.entities.PurchaseRequest.create({
        ...form,
        report_id,
        valor_solicitado: parseFloat(form.valor_solicitado) || 0,
        qtd: parseFloat(form.qtd) || 1,
        ai_meta_score: aiAnalysis?.score,
        ai_meta_sugerida: aiAnalysis?.meta_sugerida,
        ai_analise: aiAnalysis?.justificativa,
        status: 'RASCUNHO',
      });

      if (submeter) {
        await base44.functions.invoke('purchaseActions', {
          action: 'submeter',
          purchaseId: created.id,
        });
        toast.success('Solicitação enviada para aprovação!');
      } else {
        toast.success('Rascunho salvo!');
      }
      onSuccess();
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    }
    setSaving(false);
  };

  const selectedLine = budgetLines.find(l => l.id === form.budgetline_id);
  const saldoDisponivel = selectedLine ? (selectedLine.saldo_inicial || 0) - (selectedLine.saldo_comprometido || 0) : null;
  const valorNum = parseFloat(form.valor_solicitado) || 0;
  const saldoOk = saldoDisponivel === null || saldoDisponivel >= valorNum;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-black">Nova Solicitação de Compra</h2>
            <p className="text-xs text-gray-500">3º Termo Aditivo — Museus Centro</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Período */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Mês de referência</Label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Ano</Label>
              <Input type="number" value={ano} onChange={e => setAno(parseInt(e.target.value))} />
            </div>
          </div>

          {/* Descrição e tipo */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Descrição da compra/serviço *</Label>
              <Textarea
                placeholder="Descreva detalhadamente o que será adquirido ou contratado..."
                value={form.descricao_item}
                onChange={e => set('descricao_item', e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Tipo de gasto *</Label>
                <Select value={form.tipo_gasto} onValueChange={v => set('tipo_gasto', v)}>
                  <SelectTrigger><SelectValue placeholder="Produto ou serviço?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Produto">Produto</SelectItem>
                    <SelectItem value="Serviço">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Categoria *</Label>
                <Select value={form.categoria} onValueChange={v => set('categoria', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="space-y-3 p-4 border border-gray-100 rounded-xl bg-gray-50">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Vinculação à Meta 3º Aditivo</Label>
            <Select value={form.meta_id} onValueChange={v => { set('meta_id', v); setAiAnalysis(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione a meta..." /></SelectTrigger>
              <SelectContent>{METAS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            {form.meta_id === 'MC3A-EXTRA' && (
              <Textarea
                placeholder="Descreva a justificativa para meta extra..."
                value={form.meta_extra_descricao}
                onChange={e => set('meta_extra_descricao', e.target.value)}
                rows={2}
              />
            )}
            {/* Análise IA */}
            {form.meta_id && form.descricao_item && form.categoria && form.tipo_gasto && (
              <Button variant="outline" size="sm" onClick={analyzeWithAI} disabled={analyzingMeta} className="w-full gap-2">
                {analyzingMeta ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Analisar correspondência com a meta (IA)
              </Button>
            )}
            {aiAnalysis && (
              <div className={`p-3 rounded-lg border ${aiAnalysis.score >= 80 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">Score de correspondência</span>
                  <span className={`text-lg font-bold ${aiAnalysis.score >= 80 ? 'text-green-700' : 'text-amber-700'}`}>
                    {aiAnalysis.score}/100
                  </span>
                </div>
                <p className="text-xs text-gray-700 mb-2">{aiAnalysis.justificativa}</p>
                {aiAnalysis.alerta && aiAnalysis.meta_sugerida !== form.meta_id && (
                  <div className="flex items-start gap-2 p-2 bg-amber-100 rounded-md">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      <strong>Sugestão da IA:</strong> Esta compra pode se encaixar melhor em <strong>{aiAnalysis.meta_sugerida}</strong>.
                      Considere alterar a meta selecionada.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rubrica */}
          <div className="space-y-2">
            <Label className="text-xs text-gray-600 mb-1 block">Rubrica orçamentária *</Label>
            <Select value={form.budgetline_id} onValueChange={v => set('budgetline_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione a rubrica..." /></SelectTrigger>
              <SelectContent className="max-h-64">
                {budgetLines.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    [{l.codigo}] {l.descricao} — Saldo: R$ {((l.saldo_inicial || 0) - (l.saldo_comprometido || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLine && (
              <div className={`p-2 rounded-lg text-xs ${saldoOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {saldoOk
                  ? <span>✓ Saldo disponível: <strong>R$ {saldoDisponivel?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                  : <span>⚠️ Saldo insuficiente! Disponível: R$ {saldoDisponivel?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                }
              </div>
            )}
          </div>

          {/* Valores e quantidades */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Quantidade</Label>
              <Input type="number" min="1" value={form.qtd} onChange={e => set('qtd', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Unidade</Label>
              <Input placeholder="un, mês, diária..." value={form.unidade} onChange={e => set('unidade', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Valor total (R$) *</Label>
              <Input type="number" step="0.01" placeholder="0,00" value={form.valor_solicitado} onChange={e => set('valor_solicitado', e.target.value)} />
            </div>
          </div>

          {/* Centro de custo + Atividade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Centro de custo</Label>
              <Select value={form.centro_custo} onValueChange={v => set('centro_custo', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{CENTROS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">
                Atividade vinculada {isFromActivity && <span className="text-blue-600 font-normal">(herdada)</span>}
              </Label>
              {isFromActivity ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800 h-9">
                  <LinkIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{prefill._activity_titulo || form.activity_id?.slice(0,12) + '…'}</span>
                </div>
              ) : (
                <Select value={form.activity_id} onValueChange={v => set('activity_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione atividade..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Sem vínculo</SelectItem>
                    {activities.map(a => <SelectItem key={a.id} value={a.id}>{a.titulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Banner de rastreabilidade */}
          {isFromActivity && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs space-y-1">
              <p className="font-semibold text-blue-800">🔗 Rastreabilidade herdada automaticamente</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-blue-700 mt-1">
                {form.report_id && <span>Relatório: <code className="bg-blue-100 px-1 rounded">{form.report_id.slice(0,8)}…</code></span>}
                {form.activity_id && <span>Atividade: <code className="bg-blue-100 px-1 rounded">{form.activity_id.slice(0,8)}…</code></span>}
                {form.meta_id && <span>Meta: <strong>{form.meta_id}</strong></span>}
                {prefill?.meta_codigo && <span>Cód. Meta: <strong>{prefill.meta_codigo}</strong></span>}
                {prefill?.classificacao && <span>Classif.: <strong>{prefill.classificacao}</strong></span>}
                {prefill?.tipo_equipe && <span>Equipe: <strong>{prefill.tipo_equipe}</strong></span>}
              </div>
            </div>
          )}

          {/* Fornecedor */}
          <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Fornecedor</Label>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowOrcamentoDialog(true)}
                className="gap-2 text-xs"
              >
                <Upload className="w-3 h-3" />
                Extrair de Orçamento
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Nome do fornecedor</Label>
                <Input placeholder="Empresa ou pessoa" value={form.fornecedor_nome} onChange={e => set('fornecedor_nome', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">CNPJ/CPF</Label>
                <Input placeholder="00.000.000/0001-00" value={form.fornecedor_cnpj} onChange={e => set('fornecedor_cnpj', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Contato</Label>
                <Input placeholder="Telefone ou e-mail" value={form.fornecedor_contato} onChange={e => set('fornecedor_contato', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Link da proposta</Label>
                <Input placeholder="https://..." value={form.link_proposta} onChange={e => set('link_proposta', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Meio de pagamento</Label>
              <Select value={form.meio_pagamento} onValueChange={v => set('meio_pagamento', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{PAGAMENTOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Dados para pagamento</Label>
              <Input placeholder="Chave PIX, dados bancários..." value={form.detalhe_pagamento} onChange={e => set('detalhe_pagamento', e.target.value)} />
            </div>
          </div>

          {/* Anexos */}
          <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Anexos</Label>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Link do Orçamento / Proposta</Label>
                <Input placeholder="https://drive.google.com/..." value={form.orcamento_url || ''} onChange={e => set('orcamento_url', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Link da Nota Fiscal</Label>
                <Input placeholder="https://..." value={form.nota_fiscal_url || ''} onChange={e => set('nota_fiscal_url', e.target.value)} />
                <p className="text-[10px] text-gray-400 mt-0.5">Visível apenas para coordenadores após aprovação.</p>
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Link do Comprovante de Pagamento</Label>
                <Input placeholder="https://..." value={form.comprovante_url || ''} onChange={e => set('comprovante_url', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Observações</Label>
            <Textarea placeholder="Informações adicionais..." value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              Salvar Rascunho
            </Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={() => handleSave(true)}
              disabled={saving || !saldoOk}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enviar para Aprovação
            </Button>
          </div>
        </div>

        {/* Orçamento Upload Dialog */}
        <OrcamentoUploadDialog
          open={showOrcamentoDialog}
          onOpenChange={setShowOrcamentoDialog}
          purchaseRequestId={form.id || 'novo'}
          activityTitle={prefill?._activity_titulo || 'Sem Atividade'}
          onSuccess={(data) => {
            // Preencher formulário com dados extraídos
            set('fornecedor_nome', data.fornecedor_nome);
            set('fornecedor_cnpj', data.fornecedor_cnpj);
            set('fornecedor_contato', data.fornecedor_contato);
            if (data.fornecedor_cidade) set('observacoes', `Cidade: ${data.fornecedor_cidade}\n${form.observacoes || ''}`);
            set('descricao_item', data.descricao_item);
            set('valor_solicitado', data.valor_solicitado);
            if (data.garantia) set('observacoes', `Garantia: ${data.garantia}\n${form.observacoes || ''}`);
            if (data.meios_pagamento) set('meio_pagamento', data.meios_pagamento.split(',')[0]?.trim());
            set('orcamento_url', data.orcamento_url);
            setShowOrcamentoDialog(false);
          }}
        />
      </div>
    </div>
  );
}