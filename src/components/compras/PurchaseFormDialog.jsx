import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Sparkles, AlertTriangle, Loader2, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import FormDocumentsField from './FormDocumentsField';
import { METAS_3_ADITIVO } from '@/components/planoTrabalho';
import { useBudgetLines } from './useBudgetLines';
import { useQuery } from '@tanstack/react-query';

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
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const EMPTY = {
  meta_id: '',
  meta_extra_descricao: '',
  budgetline_id: '',
  rubrica_id: '',
  categoria: '',
  tipo_gasto: '',
  centro_custo: '',
  descricao_item: '',
  qtd: 1,
  unidade: 'un',
  valor_unitario: '',
  valor_solicitado: '',
  fornecedor_nome: '',
  fornecedor_cnpj: '',
  fornecedor_contato: '',
  meio_pagamento: '',
  detalhe_pagamento: '',
  observacoes: '',
  activity_id: '',
  report_id: '',
  orcamentos_docs: [],
  notas_fiscais_docs: [],
};

export default function PurchaseFormDialog({
  currentUser,
  onClose,
  onSuccess,
  prefill,
  initialData = null
}) {
  const { budgetLines } = useBudgetLines();

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('-created_date', 999),
  });

  const isEditing = !!initialData?.id;

  const [form, setForm] = useState(() =>
    initialData
      ? { ...EMPTY, ...initialData }
      : prefill
      ? { ...EMPTY, ...prefill }
      : EMPTY
  );

  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzingMeta, setAnalyzingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activities, setActivities] = useState([]);
  const [mes, setMes] = useState(
    initialData?.mes_referencia || prefill?.mes_referencia || MESES[new Date().getMonth()]
  );
  const [ano, setAno] = useState(
    initialData?.ano || prefill?.ano || new Date().getFullYear()
  );

  const isFromActivity = !!prefill?.activity_id;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (currentUser?.email) {
      base44.entities.Activity.list('-created_date', 100)
        .then(allActivities => {
          const today = new Date().toISOString().split('T')[0];
          const openActivities = allActivities.filter(a => {
            if (!a.data_realizacao) return true;
            return a.data_realizacao >= today;
          });
          setActivities(openActivities);
        })
        .catch(() => {});
    }
  }, [currentUser]);

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
    } catch {
      toast.error('Erro na análise da IA');
    }
    setAnalyzingMeta(false);
  };

  const handleSave = async (submeter = false) => {
    if (
      !form.descricao_item ||
      !form.meta_id ||
      (!form.budgetline_id && !form.rubrica_id) ||
      !form.categoria ||
      !form.tipo_gasto ||
      !form.valor_solicitado
    ) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const reportRes = await base44.functions.invoke('purchaseActions', {
        action: 'ensure_report',
        mes_referencia: mes,
        ano,
      });
      const report_id = reportRes.data.report_id;

      const orcamento_url = form.orcamentos_docs?.[0]?.url || null;
      const nota_fiscal_url = form.notas_fiscais_docs?.[0]?.url || null;

      const payload = {
        ...form,
        report_id,
        mes_referencia: mes,
        ano,
        valor_solicitado: parseFloat(form.valor_solicitado) || 0,
        valor_unitario: parseFloat(form.valor_unitario) || 0,
        qtd: parseFloat(form.qtd) || 1,
        orcamento_url,
        nota_fiscal_url,
        ai_meta_score: aiAnalysis?.score,
        ai_meta_sugerida: aiAnalysis?.meta_sugerida,
        ai_analise: aiAnalysis?.justificativa,
      };

      let created;

      if (isEditing) {
        created = await base44.entities.PurchaseRequest.update(initialData.id, payload);
      } else {
        created = await base44.entities.PurchaseRequest.create({
          ...payload,
          status: 'RASCUNHO',
        });
      }

      if (submeter) {
        const purchaseIdToSubmit = isEditing ? initialData.id : created.id;

        await base44.functions.invoke('purchaseActions', {
          action: 'submeter',
          purchaseId: purchaseIdToSubmit,
        });

        await base44.functions.invoke('notifyCoordinatorOnPurchaseSubmitted', {
          purchase_id: purchaseIdToSubmit,
          purchase_description: form.descricao_item,
          requester_name: currentUser?.full_name || 'Usuário',
          requester_email: currentUser?.email || '',
          amount: parseFloat(form.valor_solicitado) || 0,
        }).catch(() => {});

        toast.success('✅ Solicitação de compra enviada para aprovação!', {
          description: `Item: ${form.descricao_item}\nValor: R$ ${parseFloat(form.valor_solicitado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          duration: 5000
        });
      } else {
        toast.success(
          isEditing ? '✅ Alterações salvas com sucesso!' : '✅ Rascunho salvo com sucesso!',
          {
            description: isEditing
              ? 'A compra foi atualizada.'
              : 'Você pode continuar editando ou enviar para aprovação depois.',
            duration: 5000
          }
        );
      }

      onSuccess?.();
    } catch (e) {
      toast.error('❌ Erro ao salvar: ' + e.message, { duration: 5000 });
    }
    setSaving(false);
  };

  const selectedLine = budgetLines.find(l => l.id === form.budgetline_id);
  const saldoDisponivel = selectedLine
    ? (selectedLine.saldo_inicial || 0) - (selectedLine.saldo_comprometido || 0)
    : null;
  const valorNum = parseFloat(form.valor_solicitado) || 0;
  const saldoOk = saldoDisponivel === null || saldoDisponivel >= valorNum;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-black">
              {isEditing ? 'Editar Solicitação de Compra' : 'Nova Solicitação de Compra'}
            </h2>
            <p className="text-xs text-gray-500">3º Termo Aditivo — Museus Centro</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Mês de referência</Label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Ano</Label>
              <Input type="number" value={ano} onChange={e => setAno(parseInt(e.target.value) || new Date().getFullYear())} />
            </div>
          </div>

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
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4 border border-gray-100 rounded-xl bg-gray-50">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Vinculação à Meta 3º Aditivo
            </Label>
            <Select value={form.meta_id} onValueChange={v => { set('meta_id', v); setAiAnalysis(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecione a meta..." /></SelectTrigger>
              <SelectContent>
                {METAS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {form.meta_id === 'MC3A-EXTRA' && (
              <Textarea
                placeholder="Descreva a justificativa para meta extra..."
                value={form.meta_extra_descricao}
                onChange={e => set('meta_extra_descricao', e.target.value)}
                rows={2}
              />
            )}

            {form.meta_id && form.descricao_item && form.categoria && form.tipo_gasto && (
              <Button
                variant="outline"
                size="sm"
                onClick={analyzeWithAI}
                disabled={analyzingMeta}
                className="w-full gap-2"
              >
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

          <div className="space-y-2">
            <Label className="text-xs text-gray-600 mb-1 block">Rubrica orçamentária *</Label>
            <Select
              value={form.rubrica_id || (form.budgetline_id ? `BL-${form.budgetline_id}` : '')}
              onValueChange={(v) => {
                if (v.startsWith('BL-')) {
                  setForm(f => ({
                    ...f,
                    budgetline_id: v.replace('BL-', ''),
                    rubrica_id: ''
                  }));
                } else {
                  setForm(f => ({
                    ...f,
                    rubrica_id: v,
                    budgetline_id: ''
                  }));
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione a rubrica..." /></SelectTrigger>
              <SelectContent className="max-h-64">
                {rubricas.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100">
                      Rubricas Orçamentárias
                    </div>
                    {rubricas.filter(r => r.ativo !== false).map(r => (
                      <SelectItem key={`rub-${r.id}`} value={r.id}>
                        {r.rubrica} ({r.grupo})
                      </SelectItem>
                    ))}
                  </>
                )}

                {budgetLines.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100">
                      Linhas Orçamentárias Herdadas
                    </div>
                    {budgetLines.map(l => (
                      <SelectItem key={l.id} value={`BL-${l.id}`}>
                        [{l.codigo}] {l.descricao}
                      </SelectItem>
                    ))}
                  </>
                )}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={form.qtd}
                onChange={e => {
                  const qtd = parseFloat(e.target.value) || 1;
                  const vUnit = parseFloat(form.valor_unitario) || 0;
                  setForm(f => ({
                    ...f,
                    qtd: e.target.value,
                    valor_solicitado: qtd * vUnit ? (qtd * vUnit).toFixed(2) : f.valor_solicitado
                  }));
                }}
              />
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
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.valor_unitario || ''}
                onChange={e => {
                  const vUnit = parseFloat(e.target.value) || 0;
                  const qtd = parseFloat(form.qtd) || 1;
                  setForm(f => ({
                    ...f,
                    valor_unitario: e.target.value,
                    valor_solicitado: (qtd * vUnit).toFixed(2)
                  }));
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Valor total (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.valor_solicitado}
                onChange={e => set('valor_solicitado', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Centro de custo</Label>
              <Select value={form.centro_custo} onValueChange={v => set('centro_custo', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CENTROS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">
                Atividade vinculada {isFromActivity && <span className="text-blue-600 font-normal">(herdada)</span>}
              </Label>
              {isFromActivity ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800 h-9">
                  <LinkIcon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{prefill?._activity_titulo || form.activity_id?.slice(0, 12) + '…'}</span>
                </div>
              ) : (
                <Select
                  value={form.activity_id || '__NONE__'}
                  onValueChange={v => set('activity_id', v === '__NONE__' ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione ou deixar sem vínculo..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Sem vínculo com atividade</SelectItem>
                    {activities.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100">
                          Atividades em aberto
                        </div>
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

          {isFromActivity && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs space-y-1">
              <p className="font-semibold text-blue-800">🔗 Rastreabilidade herdada automaticamente</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-blue-700 mt-1">
                {form.report_id && <span>Relatório: <code className="bg-blue-100 px-1 rounded">{form.report_id.slice(0, 8)}…</code></span>}
                {form.activity_id && <span>Atividade: <code className="bg-blue-100 px-1 rounded">{form.activity_id.slice(0, 8)}…</code></span>}
                {form.meta_id && <span>Meta: <strong>{form.meta_id}</strong></span>}
                {prefill?.meta_codigo && <span>Cód. Meta: <strong>{prefill.meta_codigo}</strong></span>}
                {prefill?.classificacao && <span>Classif.: <strong>{prefill.classificacao}</strong></span>}
                {prefill?.tipo_equipe && <span>Equipe: <strong>{prefill.tipo_equipe}</strong></span>}
              </div>
            </div>
          )}

          <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Fornecedor</Label>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Meio de pagamento</Label>
              <Select value={form.meio_pagamento} onValueChange={v => set('meio_pagamento', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {PAGAMENTOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Dados para pagamento</Label>
              <Input
                placeholder="Chave PIX, dados bancários..."
                value={form.detalhe_pagamento}
                onChange={e => set('detalhe_pagamento', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                📋 Orçamentos do Fornecedor
              </Label>
              <FormDocumentsField
                documents={form.orcamentos_docs || []}
                onDocumentsChange={(docs) => set('orcamentos_docs', docs)}
                type="orcamento"
                label="Orçamentos"
              />
            </div>

            <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                🧾 Notas Fiscais
              </Label>
              <FormDocumentsField
                documents={form.notas_fiscais_docs || []}
                onDocumentsChange={(docs) => set('notas_fiscais_docs', docs)}
                type="nota_fiscal"
                label="Notas Fiscais"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Observações</Label>
            <Textarea
              placeholder="Informações adicionais..."
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-between items-center p-6 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              {isEditing ? 'Salvar Alterações' : 'Salvar Rascunho'}
            </Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={() => handleSave(true)}
              disabled={saving || !saldoOk}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isEditing ? 'Salvar e Enviar' : 'Enviar para Aprovação'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}