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
import PurchaseDocumentUpload from './PurchaseDocumentUpload';
import { METAS_3_ADITIVO } from '@/components/planoTrabalho';

const METAS = METAS_3_ADITIVO.map(m => ({
  id: m.codigo,
  label: `${m.codigo} — ${m.titulo}`,
}));

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
  meio_pagamento: '', detalhe_pagamento: '', observacoes: '', orcamentos: [],
  activity_id: '', report_id: '', orcamentos_docs: [], notas_fiscais_docs: [],
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
  const [fileInputKey, setFileInputKey] = useState(0);
  const [orcamentoAnalysis, setOrcamentoAnalysis] = useState(null);
  const [analisandoOrcamento, setAnalisandoOrcamento] = useState(false);

  // Campos travados quando vem de atividade
  const isFromActivity = !!(prefill?.activity_id);
  const lockedFields = isFromActivity ? ['activity_id', 'report_id', 'meta_id'] : [];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Carregar atividades em aberto do usuário para vincular
  useEffect(() => {
    if (currentUser?.email) {
      base44.entities.Activity.list('-created_date', 100).then(allActivities => {
        // Filtrar apenas atividades em aberto (data_realizacao >= hoje)
        const today = new Date().toISOString().split('T')[0];
        const openActivities = allActivities.filter(a => {
          if (!a.data_realizacao) return true; // Sem data = em aberto
          return a.data_realizacao >= today;
        });
        setActivities(openActivities);
      }).catch(() => {});
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

  const analisarOrcamentoComIA = async () => {
    if (form.orcamentos.length === 0) {
      toast.error('Nenhum orçamento anexado para analisar.');
      return;
    }

    setAnalisandoOrcamento(true);
    try {
      const orcamento = form.orcamentos[form.orcamentos.length - 1];
      
      if (orcamento.url) {
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `Analise este contrato/orçamento e extraia os seguintes campos em JSON:
{
  "fornecedor_nome": "Nome da empresa/pessoa fornecedora",
  "fornecedor_cnpj": "CNPJ ou CPF",
  "fornecedor_contato": "Telefone ou email",
  "fornecedor_cidade": "Cidade",
  "descricao_item": "Descrição detalhada do produto/serviço",
  "valor_solicitado": número do valor total,
  "valor_unitario": número do valor unitário,
  "qtd": quantidade,
  "unidade": "un, diária, serviço, mês, ano, hora, km ou evento",
  "prazo_entrega": "Prazo em dias ou data",
  "garantia": "Período de garantia",
  "condicoes_pagamento": "Condições de pagamento descritas",
  "meios_pagamento": "PIX, TED/Transferência, Boleto, Cartão ou Dinheiro"
}

Retorne APENAS o JSON, sem explicações adicionais.`,
          file_urls: [orcamento.url],
          response_json_schema: {
            type: 'object',
            properties: {
              fornecedor_nome: { type: 'string' },
              fornecedor_cnpj: { type: 'string' },
              fornecedor_contato: { type: 'string' },
              fornecedor_cidade: { type: 'string' },
              descricao_item: { type: 'string' },
              valor_solicitado: { type: 'number' },
              valor_unitario: { type: 'number' },
              qtd: { type: 'number' },
              unidade: { type: 'string' },
              prazo_entrega: { type: 'string' },
              garantia: { type: 'string' },
              condicoes_pagamento: { type: 'string' },
              meios_pagamento: { type: 'string' }
            }
          }
        });

        setOrcamentoAnalysis(res.data);
      } else {
        toast.error('Arquivo não tem URL válido. Tente anexar novamente.');
      }
    } catch (e) {
      toast.error('Erro ao analisar orçamento: ' + e.message);
    }
    setAnalisandoOrcamento(false);
  };

  const preencherComDadosOrcamento = (dados) => {
    if (dados.fornecedor_nome) set('fornecedor_nome', dados.fornecedor_nome);
    if (dados.fornecedor_cnpj) set('fornecedor_cnpj', dados.fornecedor_cnpj);
    if (dados.fornecedor_contato) set('fornecedor_contato', dados.fornecedor_contato);
    if (dados.descricao_item) set('descricao_item', dados.descricao_item);
    if (dados.valor_solicitado) set('valor_solicitado', dados.valor_solicitado.toString());
    if (dados.valor_unitario) set('valor_unitario', dados.valor_unitario.toString());
    if (dados.qtd) set('qtd', dados.qtd.toString());
    if (dados.unidade) set('unidade', dados.unidade);
    if (dados.meios_pagamento) {
      const meio = dados.meios_pagamento.includes('PIX') ? 'PIX' :
                  dados.meios_pagamento.includes('TED') || dados.meios_pagamento.includes('Transferência') ? 'TED/Transferência' :
                  dados.meios_pagamento.includes('Boleto') ? 'Boleto' :
                  dados.meios_pagamento.includes('Cartão') ? 'Cartão' :
                  dados.meios_pagamento.includes('Dinheiro') ? 'Dinheiro' : '';
      if (meio) set('meio_pagamento', meio);
    }

    let obs = form.observacoes || '';
    if (dados.garantia) obs += (obs ? '\n' : '') + `Garantia: ${dados.garantia}`;
    if (dados.condicoes_pagamento) obs += (obs ? '\n' : '') + `Condições: ${dados.condicoes_pagamento}`;
    if (dados.prazo_entrega) obs += (obs ? '\n' : '') + `Prazo: ${dados.prazo_entrega}`;
    if (dados.fornecedor_cidade) obs += (obs ? '\n' : '') + `Cidade: ${dados.fornecedor_cidade}`;
    if (obs) set('observacoes', obs);

    setOrcamentoAnalysis(null);
    toast.success('Formulário preenchido com dados do orçamento!');
  };

  const preencherComIA = async () => {
    if (!orcamentoAnalysis) {
      toast.error('Analise o orçamento primeiro.');
      return;
    }
    preencherComDadosOrcamento(orcamentoAnalysis);
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
        toast.success('✅ Solicitação de compra enviada para aprovação!', {
          description: `Item: ${form.descricao_item}\nValor: R$ ${parseFloat(form.valor_solicitado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          duration: 5000
        });
      } else {
        toast.success('✅ Rascunho salvo com sucesso!', {
          description: `Você pode continuar editando ou enviar para aprovação depois.`,
          duration: 5000
        });
      }
      onSuccess();
    } catch (e) {
      toast.error('❌ Erro ao salvar: ' + e.message, { duration: 5000 });
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
                    [{l.codigo}] {l.descricao}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Quantidade</Label>
              <Input type="number" min="1" value={form.qtd} onChange={e => {
                const qtd = parseFloat(e.target.value) || 1;
                const vUnit = parseFloat(form.valor_unitario) || 0;
                setForm(f => ({ ...f, qtd: e.target.value, valor_solicitado: qtd * vUnit ? (qtd * vUnit).toFixed(2) : f.valor_solicitado }));
              }} />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Unidade</Label>
              <Select value={form.unidade} onValueChange={v => set('unidade', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="un">Unidade (un)</SelectItem>
                  <SelectItem value="diária">Diária</SelectItem>
                  <SelectItem value="serviço">Serviço</SelectItem>
                  <SelectItem value="mês">Mês</SelectItem>
                  <SelectItem value="ano">Ano</SelectItem>
                  <SelectItem value="hora">Hora</SelectItem>
                  <SelectItem value="km">Km</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Valor por unidade (R$)</Label>
              <Input
                type="number" step="0.01" placeholder="0,00"
                value={form.valor_unitario || ''}
                onChange={e => {
                  const vUnit = parseFloat(e.target.value) || 0;
                  const qtd = parseFloat(form.qtd) || 1;
                  setForm(f => ({ ...f, valor_unitario: e.target.value, valor_solicitado: (qtd * vUnit).toFixed(2) }));
                }}
              />
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
                  <SelectTrigger><SelectValue placeholder="Selecione ou deixar sem vínculo..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Sem vínculo com atividade</SelectItem>
                    {activities.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100">Atividades em aberto</div>
                        {activities.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.titulo} {a.data_realizacao && `— ${new Date(a.data_realizacao).toLocaleDateString('pt-BR')}`}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {activities.length === 0 && (
                      <div className="px-2 py-2 text-xs text-gray-500">Nenhuma atividade em aberto</div>
                    )}
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

          {/* Documentos - Orçamentos e Notas Fiscais */}
          <div className="space-y-6">
            {/* Orçamentos */}
            <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">📋 Orçamentos do Fornecedor</Label>
              <PurchaseDocumentUpload 
                documents={form.orcamentos_docs || []}
                onDocumentsChange={(docs) => set('orcamentos_docs', docs)}
                type="orcamento"
              />
            </div>

            {/* Notas Fiscais */}
            <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">🧾 Notas Fiscais</Label>
              <PurchaseDocumentUpload 
                documents={form.notas_fiscais_docs || []}
                onDocumentsChange={(docs) => set('notas_fiscais_docs', docs)}
                type="nota_fiscal"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Observações</Label>
            <Textarea placeholder="Informações adicionais..." value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} />
          </div>

          {/* Análise de Orçamento com IA */}
          {form.orcamentos.length > 0 && !orcamentoAnalysis && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <Button 
                type="button"
                variant="outline" 
                className="w-full gap-2 bg-white hover:bg-blue-50 border-blue-300 text-blue-700"
                onClick={() => analisarOrcamentoComIA()}
                disabled={analisandoOrcamento}
              >
                {analisandoOrcamento ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Analisar Orçamento com IA
              </Button>
              <p className="text-xs text-blue-600 mt-2">A IA lerá o orçamento e exibirá um resumo para revisão</p>
            </div>
          )}

          {/* Resumo da Análise do Orçamento */}
          {orcamentoAnalysis && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-green-800 uppercase">Resumo do Orçamento</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setOrcamentoAnalysis(null)}
                  className="h-6 w-6"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {orcamentoAnalysis.fornecedor_nome && (
                  <div className="bg-white p-2 rounded border border-green-100">
                    <span className="text-gray-600">Fornecedor:</span>
                    <p className="font-semibold text-gray-900">{orcamentoAnalysis.fornecedor_nome}</p>
                  </div>
                )}
                {orcamentoAnalysis.fornecedor_cnpj && (
                  <div className="bg-white p-2 rounded border border-green-100">
                    <span className="text-gray-600">CNPJ/CPF:</span>
                    <p className="font-semibold text-gray-900">{orcamentoAnalysis.fornecedor_cnpj}</p>
                  </div>
                )}
                {orcamentoAnalysis.valor_solicitado && (
                  <div className="bg-white p-2 rounded border border-green-100">
                    <span className="text-gray-600">Valor Total:</span>
                    <p className="font-semibold text-gray-900">R$ {orcamentoAnalysis.valor_solicitado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                {orcamentoAnalysis.prazo_entrega && (
                  <div className="bg-white p-2 rounded border border-green-100">
                    <span className="text-gray-600">Prazo:</span>
                    <p className="font-semibold text-gray-900">{orcamentoAnalysis.prazo_entrega}</p>
                  </div>
                )}
              </div>

              {orcamentoAnalysis.descricao_item && (
                <div className="bg-white p-2 rounded border border-green-100">
                  <span className="text-xs text-gray-600">Descrição:</span>
                  <p className="text-xs text-gray-900 mt-1">{orcamentoAnalysis.descricao_item}</p>
                </div>
              )}

              {orcamentoAnalysis.condicoes_pagamento && (
                <div className="bg-white p-2 rounded border border-green-100">
                  <span className="text-xs text-gray-600">Condições de Pagamento:</span>
                  <p className="text-xs text-gray-900 mt-1">{orcamentoAnalysis.condicoes_pagamento}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button 
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => preencherComDadosOrcamento(orcamentoAnalysis)}
                >
                  Preencher Formulário
                </Button>
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={() => setOrcamentoAnalysis(null)}
                >
                  Revisar
                </Button>
              </div>
            </div>
          )}
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
            set('fornecedor_nome', data.fornecedor_nome || form.fornecedor_nome);
            set('fornecedor_cnpj', data.fornecedor_cnpj || form.fornecedor_cnpj);
            set('fornecedor_contato', data.fornecedor_contato || form.fornecedor_contato);
            
            // Descrição com prioridade
            if (data.descricao_item) set('descricao_item', data.descricao_item);
            
            // Valores
            if (data.valor_solicitado) set('valor_solicitado', data.valor_solicitado.toString());
            if (data.valor_unitario) set('valor_unitario', data.valor_unitario.toString());
            
            // Pagamento
            if (data.meios_pagamento) {
              const meio = data.meios_pagamento.split(',')[0]?.trim() || data.meios_pagamento;
              if (['PIX', 'TED/Transferência', 'Boleto', 'Cartão', 'Dinheiro'].includes(meio)) {
                set('meio_pagamento', meio);
              }
            }
            
            // Observações com informações complementares
            let obs = form.observacoes || '';
            if (data.fornecedor_cidade) obs += `\nCidade: ${data.fornecedor_cidade}`;
            if (data.garantia) obs += `\nGarantia: ${data.garantia}`;
            if (data.condicoes_pagamento) obs += `\nCondições: ${data.condicoes_pagamento}`;
            if (data.prazo_entrega) obs += `\nPrazo: ${data.prazo_entrega}`;
            if (obs) set('observacoes', obs.trim());
            
            // Anexar orçamento como novo arquivo
            if (data.orcamento_url) {
              const newOrc = {
                id: Date.now(),
                nome: data.orcamento_nome || 'Orçamento Anexado',
                arquivo: { name: data.orcamento_nome || 'orcamento.pdf' },
                url: data.orcamento_url
              };
              setForm(f => ({ ...f, orcamentos: [...f.orcamentos, newOrc] }));
            }
            
            setShowOrcamentoDialog(false);
          }}
        />
      </div>
    </div>
  );
}