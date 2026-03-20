import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  X,
  Sparkles,
  AlertTriangle,
  Loader2,
  Link as LinkIcon,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import FormDocumentsField from './FormDocumentsField';
import { METAS_3_ADITIVO } from '@/components/planoTrabalho';
import { useBudgetLines } from './useBudgetLines';
import { useQuery } from '@tanstack/react-query';

const METAS = METAS_3_ADITIVO.map((m) => ({
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

const CENTROS = [
  'MUMO',
  'MIS',
  'MHAB',
  'Noturno nos Museus 2026',
  'Publicações',
  'Geral',
];

const PAGAMENTOS = ['PIX', 'TED/Transferência', 'Boleto', 'Cartão', 'Dinheiro'];
const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

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

const MUSEUS_BASE = ['MIS', 'MHAB', 'MUMO'];

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCentro(value) {
  const raw = normalizeString(value);

  if (!raw) return '';
  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';
  if (raw === 'geral') return 'Geral';
  if (raw === 'publicacoes') return 'Publicações';
  if (raw === 'noturno nos museus 2026') return 'Noturno nos Museus 2026';
  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';

  return String(value || '').trim();
}

function isGlobalCentro(value) {
  const centro = normalizeCentro(value);
  return !centro || centro === 'Geral';
}

function isMuseuCentro(value) {
  return MUSEUS_BASE.includes(normalizeCentro(value));
}

function getEntityCentro(entity) {
  return normalizeCentro(
    entity?.centro_custo ||
      entity?.museu ||
      entity?.museu_codigo ||
      entity?.unidade ||
      ''
  );
}

function isCentroCompativel(selectedCentro, entityCentro) {
  const centroSelecionado = normalizeCentro(selectedCentro);
  const centroEntidade = normalizeCentro(entityCentro);

  if (!centroSelecionado) return true;
  if (!centroEntidade) return true;
  if (centroEntidade === centroSelecionado) return true;
  if (centroEntidade === 'Geral') return true;

  if (isMuseuCentro(centroSelecionado)) {
    return centroEntidade === centroSelecionado || centroEntidade === 'Geral';
  }

  return centroEntidade === centroSelecionado;
}

function getRubricaLabel(rubrica) {
  const nome = rubrica?.rubrica || rubrica?.nome || 'Rubrica';
  const grupo = rubrica?.grupo ? ` (${rubrica.grupo})` : '';
  const centro = getEntityCentro(rubrica);
  const centroLabel = centro ? ` — ${centro}` : '';
  return `${nome}${grupo}${centroLabel}`;
}

function getBudgetLineLabel(line) {
  const codigo = line?.codigo ? `[${line.codigo}] ` : '';
  const descricao = line?.descricao || line?.rubrica || line?.nome || 'Linha orçamentária';
  const centro = getEntityCentro(line);
  const centroLabel = centro ? ` — ${centro}` : '';
  return `${codigo}${descricao}${centroLabel}`;
}

export default function PurchaseFormDialog({
  currentUser,
  onClose,
  onSuccess,
  prefill,
  initialData = null,
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
  const [ano, setAno] = useState(initialData?.ano || prefill?.ano || new Date().getFullYear());

  const [rubricaSugestao, setRubricaSugestao] = useState(null);
  const [loadingRubricaSugestao, setLoadingRubricaSugestao] = useState(false);

  const isFromActivity = !!prefill?.activity_id;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (currentUser?.email) {
      base44.entities.Activity.list('-created_date', 100)
        .then((allActivities) => {
          const today = new Date().toISOString().split('T')[0];
          const openActivities = allActivities.filter((a) => {
            if (!a.data_realizacao) return true;
            return a.data_realizacao >= today;
          });
          setActivities(openActivities);
        })
        .catch(() => {});
    }
  }, [currentUser]);

  const centroSelecionado = normalizeCentro(form.centro_custo);

  const rubricasFiltradas = useMemo(() => {
    return (rubricas || [])
      .filter((r) => r?.ativo !== false)
      .filter((r) => isCentroCompativel(centroSelecionado, getEntityCentro(r)));
  }, [rubricas, centroSelecionado]);

  const budgetLinesFiltradas = useMemo(() => {
    return (budgetLines || []).filter((line) =>
      isCentroCompativel(centroSelecionado, getEntityCentro(line))
    );
  }, [budgetLines, centroSelecionado]);

  const selectedLine = useMemo(
    () => budgetLines.find((l) => l.id === form.budgetline_id) || null,
    [budgetLines, form.budgetline_id]
  );

  const selectedRubrica = useMemo(
    () => rubricas.find((r) => r.id === form.rubrica_id) || null,
    [rubricas, form.rubrica_id]
  );

  useEffect(() => {
    if (!centroSelecionado) return;

    const rubricaAtualCompativel =
      !form.rubrica_id ||
      rubricasFiltradas.some((r) => r.id === form.rubrica_id);

    const budgetLineAtualCompativel =
      !form.budgetline_id ||
      budgetLinesFiltradas.some((l) => l.id === form.budgetline_id);

    if (rubricaAtualCompativel && budgetLineAtualCompativel) return;

    setForm((prev) => ({
      ...prev,
      rubrica_id: rubricaAtualCompativel ? prev.rubrica_id : '',
      budgetline_id: budgetLineAtualCompativel ? prev.budgetline_id : '',
    }));

    setRubricaSugestao(null);

    toast.warning('Rubrica ou linha orçamentária anterior removida por incompatibilidade com o centro de custo.');
  }, [centroSelecionado, form.rubrica_id, form.budgetline_id, rubricasFiltradas, budgetLinesFiltradas]);

  const findCompatibleBudgetLineForRubrica = (rubricaId, centro) => {
    return (
      budgetLinesFiltradas.find((line) => {
        const lineRubricaId =
          line?.rubrica_id ||
          line?.rubrica?.id ||
          '';

        return (
          lineRubricaId === rubricaId &&
          isCentroCompativel(centro, getEntityCentro(line))
        );
      }) || null
    );
  };

  const handleRubricaChange = (value) => {
    if (!centroSelecionado) {
      toast.error('Selecione primeiro o centro de custo.');
      return;
    }

    if (value.startsWith('BL-')) {
      const lineId = value.replace('BL-', '');
      const line = budgetLines.find((l) => l.id === lineId);

      if (!line) {
        toast.error('Linha orçamentária não encontrada.');
        return;
      }

      const lineCentro = getEntityCentro(line);
      if (!isCentroCompativel(centroSelecionado, lineCentro)) {
        toast.error('Essa linha orçamentária não pertence ao centro de custo selecionado.');
        return;
      }

      setForm((f) => ({
        ...f,
        budgetline_id: lineId,
        rubrica_id: line?.rubrica_id || line?.rubrica?.id || '',
      }));
      setRubricaSugestao(null);
      return;
    }

    const rubrica = rubricas.find((r) => r.id === value);
    if (!rubrica) {
      toast.error('Rubrica não encontrada.');
      return;
    }

    const rubricaCentro = getEntityCentro(rubrica);
    if (!isCentroCompativel(centroSelecionado, rubricaCentro)) {
      toast.error('Essa rubrica não pertence ao centro de custo selecionado.');
      return;
    }

    const linkedBudgetLine = findCompatibleBudgetLineForRubrica(value, centroSelecionado);

    setForm((f) => ({
      ...f,
      rubrica_id: value,
      budgetline_id: linkedBudgetLine?.id || '',
    }));
    setRubricaSugestao(null);
  };

  const analyzeWithAI = async () => {
    if (
      !form.descricao_item ||
      !form.meta_id ||
      !form.categoria ||
      !form.tipo_gasto
    ) {
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

  const sugerirRubricaIA = async () => {
    if (
      !centroSelecionado ||
      !form.descricao_item ||
      form.descricao_item.trim().length < 6 ||
      !form.categoria ||
      !form.tipo_gasto
    ) {
      return;
    }

    try {
      setLoadingRubricaSugestao(true);

      const res = await base44.functions.invoke('suggestRubrica', {
        descricao: form.descricao_item,
        fornecedor: form.fornecedor_nome,
        categoria: form.categoria,
        tipo_gasto: form.tipo_gasto,
        centro_custo: centroSelecionado,
      });

      const suggestion = res?.suggestion || null;

      if (!suggestion?.rubrica_id) {
        setRubricaSugestao(null);
        return;
      }

      const rubricaEncontrada = rubricas.find((r) => r.id === suggestion.rubrica_id);
      if (!rubricaEncontrada) {
        setRubricaSugestao(null);
        return;
      }

      if (!isCentroCompativel(centroSelecionado, getEntityCentro(rubricaEncontrada))) {
        setRubricaSugestao(null);
        return;
      }

      setRubricaSugestao({
        ...suggestion,
        rubrica_nome:
          suggestion.rubrica_nome ||
          rubricaEncontrada.rubrica ||
          rubricaEncontrada.nome ||
          'Rubrica sugerida',
      });
    } catch {
      setRubricaSugestao(null);
    } finally {
      setLoadingRubricaSugestao(false);
    }
  };

  useEffect(() => {
    if (!centroSelecionado) {
      setRubricaSugestao(null);
      return;
    }

    const canSuggest =
      (form.descricao_item || '').trim().length >= 6 &&
      !!form.categoria &&
      !!form.tipo_gasto;

    if (!canSuggest) {
      setRubricaSugestao(null);
      return;
    }

    const timer = setTimeout(() => {
      sugerirRubricaIA();
    }, 900);

    return () => clearTimeout(timer);
  }, [
    centroSelecionado,
    form.descricao_item,
    form.categoria,
    form.tipo_gasto,
    form.fornecedor_nome,
  ]);

  const handleApplySuggestion = () => {
    if (!rubricaSugestao?.rubrica_id) return;
    handleRubricaChange(rubricaSugestao.rubrica_id);
    toast.success('Sugestão de rubrica aplicada.');
  };

  const handleSave = async (submeter = false) => {
    if (
      !form.descricao_item ||
      !form.meta_id ||
      !form.categoria ||
      !form.tipo_gasto ||
      !form.valor_solicitado ||
      !centroSelecionado
    ) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    if (!form.rubrica_id && !form.budgetline_id) {
      toast.error('Selecione uma rubrica ou linha orçamentária.');
      return;
    }

    if (form.rubrica_id) {
      const rubrica = rubricas.find((r) => r.id === form.rubrica_id);
      if (!rubrica) {
        toast.error('Rubrica selecionada não encontrada.');
        return;
      }

      if (!isCentroCompativel(centroSelecionado, getEntityCentro(rubrica))) {
        toast.error('A rubrica selecionada não é compatível com o centro de custo.');
        return;
      }
    }

    if (form.budgetline_id) {
      const budgetLine = budgetLines.find((line) => line.id === form.budgetline_id);
      if (!budgetLine) {
        toast.error('Linha orçamentária selecionada não encontrada.');
        return;
      }

      if (!isCentroCompativel(centroSelecionado, getEntityCentro(budgetLine))) {
        toast.error('A linha orçamentária selecionada não é compatível com o centro de custo.');
        return;
      }
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
        centro_custo: centroSelecionado,
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
        ai_rubrica_score: rubricaSugestao?.score || null,
        ai_rubrica_sugerida: rubricaSugestao?.rubrica_nome || null,
        ai_rubrica_justificativa: rubricaSugestao?.justificativa || null,
        ai_rubrica_source: rubricaSugestao?.source || null,
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

        await base44.functions
          .invoke('notifyCoordinatorOnPurchaseSubmitted', {
            purchase_id: purchaseIdToSubmit,
            purchase_description: form.descricao_item,
            requester_name: currentUser?.full_name || 'Usuário',
            requester_email: currentUser?.email || '',
            amount: parseFloat(form.valor_solicitado) || 0,
          })
          .catch(() => {});

        toast.success('✅ Solicitação de compra enviada para aprovação!', {
          description: `Item: ${form.descricao_item}\nValor: R$ ${(
            parseFloat(form.valor_solicitado) || 0
          ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          duration: 5000,
        });
      } else {
        toast.success(
          isEditing ? '✅ Alterações salvas com sucesso!' : '✅ Rascunho salvo com sucesso!',
          {
            description: isEditing
              ? 'A compra foi atualizada.'
              : 'Você pode continuar editando ou enviar para aprovação depois.',
            duration: 5000,
          }
        );
      }

      onSuccess?.();
    } catch (e) {
      toast.error('❌ Erro ao salvar: ' + e.message, { duration: 5000 });
    }
    setSaving(false);
  };

  const saldoDisponivel = selectedLine
    ? (selectedLine.saldo_inicial || 0) - (selectedLine.saldo_comprometido || 0)
    : null;

  const valorNum = parseFloat(form.valor_solicitado) || 0;
  const saldoOk = saldoDisponivel === null || saldoDisponivel >= valorNum;
  const hasOrcamentoVinculado = !!form.budgetline_id || !!form.rubrica_id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-6">
          <div>
            <h2 className="text-lg font-bold text-black">
              {isEditing ? 'Editar Solicitação de Compra' : 'Nova Solicitação de Compra'}
            </h2>
            <p className="text-xs text-gray-500">3º Termo Aditivo — Museus Centro</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-gray-600">Mês de referência</Label>
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-gray-600">Ano</Label>
              <Input
                type="number"
                value={ano}
                onChange={(e) =>
                  setAno(parseInt(e.target.value, 10) || new Date().getFullYear())
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="mb-1 block text-xs text-gray-600">
                Descrição da compra/serviço *
              </Label>
              <Textarea
                placeholder="Descreva detalhadamente o que será adquirido ou contratado..."
                value={form.descricao_item}
                onChange={(e) => set('descricao_item', e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-gray-600">Tipo de gasto *</Label>
                <Select value={form.tipo_gasto} onValueChange={(v) => set('tipo_gasto', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Produto ou serviço?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Produto">Produto</SelectItem>
                    <SelectItem value="Serviço">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs text-gray-600">Categoria *</Label>
                <Select value={form.categoria} onValueChange={(v) => set('categoria', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-gray-600">Centro de custo *</Label>
              <Select
                value={form.centro_custo}
                onValueChange={(v) => {
                  set('centro_custo', v);
                  setRubricaSugestao(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {CENTROS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!centroSelecionado && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  Selecione o centro de custo antes de escolher rubrica e enviar a compra.
                </div>
              )}
            </div>

            <div>
              <Label className="mb-1 block text-xs text-gray-600">
                Atividade vinculada{' '}
                {isFromActivity && (
                  <span className="font-normal text-blue-600">(herdada)</span>
                )}
              </Label>
              {isFromActivity ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <LinkIcon className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    {prefill?._activity_titulo || form.activity_id?.slice(0, 12) + '…'}
                  </span>
                </div>
              ) : (
                <Select
                  value={form.activity_id || '__NONE__'}
                  onValueChange={(v) => set('activity_id', v === '__NONE__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione ou deixar sem vínculo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Sem vínculo com atividade</SelectItem>
                    {activities.length > 0 && (
                      <>
                        <div className="bg-gray-100 px-2 py-1.5 text-xs font-semibold text-gray-600">
                          Atividades em aberto
                        </div>
                        {activities.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.titulo}{' '}
                            {a.data_realizacao &&
                              `— ${new Date(a.data_realizacao).toLocaleDateString('pt-BR')}`}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {activities.length === 0 && (
                      <div className="px-2 py-2 text-xs text-gray-500">
                        Nenhuma atividade em aberto
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Vinculação à Meta 3º Aditivo
            </Label>
            <Select
              value={form.meta_id}
              onValueChange={(v) => {
                set('meta_id', v);
                setAiAnalysis(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a meta..." />
              </SelectTrigger>
              <SelectContent>
                {METAS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {form.meta_id === 'MC3A-EXTRA' && (
              <Textarea
                placeholder="Descreva a justificativa para meta extra..."
                value={form.meta_extra_descricao}
                onChange={(e) => set('meta_extra_descricao', e.target.value)}
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
                {analyzingMeta ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Analisar correspondência com a meta (IA)
              </Button>
            )}

            {aiAnalysis && (
              <div
                className={`rounded-lg border p-3 ${
                  aiAnalysis.score >= 80
                    ? 'border-green-200 bg-green-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold">Score de correspondência</span>
                  <span
                    className={`text-lg font-bold ${
                      aiAnalysis.score >= 80 ? 'text-green-700' : 'text-amber-700'
                    }`}
                  >
                    {aiAnalysis.score}/100
                  </span>
                </div>
                <p className="mb-2 text-xs text-gray-700">{aiAnalysis.justificativa}</p>
                {aiAnalysis.alerta && aiAnalysis.meta_sugerida !== form.meta_id && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-100 p-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                    <p className="text-xs text-amber-800">
                      <strong>Sugestão da IA:</strong> Esta compra pode se encaixar melhor em{' '}
                      <strong>{aiAnalysis.meta_sugerida}</strong>. Considere alterar a meta
                      selecionada.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="mb-1 block text-xs text-gray-600">Rubrica orçamentária *</Label>
            <Select
              value={form.rubrica_id || (form.budgetline_id ? `BL-${form.budgetline_id}` : '')}
              onValueChange={handleRubricaChange}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    centroSelecionado
                      ? 'Selecione a rubrica...'
                      : 'Selecione primeiro o centro de custo...'
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {rubricasFiltradas.length > 0 && (
                  <>
                    <div className="bg-gray-100 px-2 py-1.5 text-xs font-semibold text-gray-600">
                      Rubricas compatíveis com {centroSelecionado || 'o centro selecionado'}
                    </div>
                    {rubricasFiltradas.map((r) => (
                      <SelectItem key={`rub-${r.id}`} value={r.id}>
                        {getRubricaLabel(r)}
                      </SelectItem>
                    ))}
                  </>
                )}

                {budgetLinesFiltradas.length > 0 && (
                  <>
                    <div className="bg-gray-100 px-2 py-1.5 text-xs font-semibold text-gray-600">
                      Linhas Orçamentárias Herdadas
                    </div>
                    {budgetLinesFiltradas.map((l) => (
                      <SelectItem key={l.id} value={`BL-${l.id}`}>
                        {getBudgetLineLabel(l)}
                      </SelectItem>
                    ))}
                  </>
                )}

                {centroSelecionado &&
                  rubricasFiltradas.length === 0 &&
                  budgetLinesFiltradas.length === 0 && (
                    <div className="px-2 py-2 text-xs text-gray-500">
                      Nenhuma rubrica ou linha compatível encontrada para este centro.
                    </div>
                  )}
              </SelectContent>
            </Select>

            {!hasOrcamentoVinculado && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                Selecione uma rubrica ou linha orçamentária para continuar.
              </div>
            )}

            {loadingRubricaSugestao && centroSelecionado && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analisando rubrica provável para {centroSelecionado}...
              </div>
            )}

            {rubricaSugestao && !form.rubrica_id && (
              <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
                <div className="font-medium text-blue-900">
                  🤖 Sugestão de rubrica: {rubricaSugestao.rubrica_nome}
                </div>
                <div className="mt-1 text-blue-800">
                  Centro: <strong>{centroSelecionado}</strong> • Confiança:{' '}
                  <strong>{rubricaSugestao.score || 0}%</strong>
                </div>
                {!!rubricaSugestao.justificativa && (
                  <div className="mt-1 text-slate-600">{rubricaSugestao.justificativa}</div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-2"
                  onClick={handleApplySuggestion}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Aplicar sugestão
                </Button>
              </div>
            )}

            {selectedRubrica && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700">
                Rubrica selecionada: <strong>{selectedRubrica.rubrica || selectedRubrica.nome}</strong>
                {selectedRubrica.grupo ? <> — {selectedRubrica.grupo}</> : null}
                {getEntityCentro(selectedRubrica)
                  ? <> — Centro: <strong>{getEntityCentro(selectedRubrica)}</strong></>
                  : null}
              </div>
            )}

            {selectedLine && (
              <div
                className={`rounded-lg p-2 text-xs ${
                  saldoOk
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {saldoOk ? (
                  <span>
                    ✓ Saldo disponível:{' '}
                    <strong>
                      R$ {saldoDisponivel?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                    {getEntityCentro(selectedLine)
                      ? <> — Centro: <strong>{getEntityCentro(selectedLine)}</strong></>
                      : null}
                  </span>
                ) : (
                  <span>
                    ⚠️ Saldo insuficiente! Disponível: R${' '}
                    {saldoDisponivel?.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-gray-600">Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={form.qtd}
                onChange={(e) => {
                  const qtd = parseFloat(e.target.value) || 1;
                  const vUnit = parseFloat(form.valor_unitario) || 0;
                  setForm((f) => ({
                    ...f,
                    qtd: e.target.value,
                    valor_solicitado:
                      qtd * vUnit ? (qtd * vUnit).toFixed(2) : f.valor_solicitado,
                  }));
                }}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-gray-600">Unidade</Label>
              <Select value={form.unidade} onValueChange={(v) => set('unidade', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
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
              <Label className="mb-1 block text-xs text-gray-600">
                Valor por unidade (R$)
              </Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.valor_unitario || ''}
                onChange={(e) => {
                  const vUnit = parseFloat(e.target.value) || 0;
                  const qtd = parseFloat(form.qtd) || 1;
                  setForm((f) => ({
                    ...f,
                    valor_unitario: e.target.value,
                    valor_solicitado: (qtd * vUnit).toFixed(2),
                  }));
                }}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-gray-600">Valor total (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.valor_solicitado}
                onChange={(e) => set('valor_solicitado', e.target.value)}
              />
            </div>
          </div>

          {isFromActivity && (
            <div className="space-y-1 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs">
              <p className="font-semibold text-blue-800">
                🔗 Rastreabilidade herdada automaticamente
              </p>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-blue-700">
                {form.report_id && (
                  <span>
                    Relatório:{' '}
                    <code className="rounded bg-blue-100 px-1">
                      {form.report_id.slice(0, 8)}…
                    </code>
                  </span>
                )}
                {form.activity_id && (
                  <span>
                    Atividade:{' '}
                    <code className="rounded bg-blue-100 px-1">
                      {form.activity_id.slice(0, 8)}…
                    </code>
                  </span>
                )}
                {form.meta_id && (
                  <span>
                    Meta: <strong>{form.meta_id}</strong>
                  </span>
                )}
                {prefill?.meta_codigo && (
                  <span>
                    Cód. Meta: <strong>{prefill.meta_codigo}</strong>
                  </span>
                )}
                {prefill?.classificacao && (
                  <span>
                    Classif.: <strong>{prefill.classificacao}</strong>
                  </span>
                )}
                {prefill?.tipo_equipe && (
                  <span>
                    Equipe: <strong>{prefill.tipo_equipe}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-gray-100 p-4">
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Fornecedor
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-gray-600">Nome do fornecedor</Label>
                <Input
                  placeholder="Empresa ou pessoa"
                  value={form.fornecedor_nome}
                  onChange={(e) => set('fornecedor_nome', e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-gray-600">CNPJ/CPF</Label>
                <Input
                  placeholder="00.000.000/0001-00"
                  value={form.fornecedor_cnpj}
                  onChange={(e) => set('fornecedor_cnpj', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-gray-600">Contato</Label>
                <Input
                  placeholder="Telefone ou e-mail"
                  value={form.fornecedor_contato}
                  onChange={(e) => set('fornecedor_contato', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs text-gray-600">Meio de pagamento</Label>
              <Select value={form.meio_pagamento} onValueChange={(v) => set('meio_pagamento', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {PAGAMENTOS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-gray-600">Dados para pagamento</Label>
              <Input
                placeholder="Chave PIX, dados bancários..."
                value={form.detalhe_pagamento}
                onChange={(e) => set('detalhe_pagamento', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3 rounded-xl border border-gray-100 p-4">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                📋 Orçamentos do Fornecedor
              </Label>
              <FormDocumentsField
                documents={form.orcamentos_docs || []}
                onDocumentsChange={(docs) => set('orcamentos_docs', docs)}
                type="orcamento"
                label="Orçamentos"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-gray-100 p-4">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-700">
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
            <Label className="mb-1 block text-xs text-gray-600">Observações</Label>
            <Textarea
              placeholder="Informações adicionais..."
              value={form.observacoes}
              onChange={(e) => set('observacoes', e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between rounded-b-2xl border-t bg-gray-50 p-6">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              {isEditing ? 'Salvar Alterações' : 'Salvar Rascunho'}
            </Button>
            <Button
              className="bg-black text-white hover:bg-gray-800"
              onClick={() => handleSave(true)}
              disabled={saving || !saldoOk || !hasOrcamentoVinculado || !centroSelecionado}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing ? 'Salvar e Enviar' : 'Enviar para Aprovação'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}const EMPTY = {
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
  const selectedRubrica = rubricas.find(r => r.id === form.rubrica_id);

  const saldoDisponivel = selectedLine
    ? (selectedLine.saldo_inicial || 0) - (selectedLine.saldo_comprometido || 0)
    : null;

  const valorNum = parseFloat(form.valor_solicitado) || 0;
  const saldoOk = saldoDisponivel === null || saldoDisponivel >= valorNum;
  const hasOrcamentoVinculado = !!form.budgetline_id || !!form.rubrica_id;

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

            {!hasOrcamentoVinculado && (
              <div className="p-2 rounded-lg text-xs bg-red-50 text-red-700 border border-red-200">
                Selecione uma rubrica ou linha orçamentária para continuar.
              </div>
            )}

            {selectedRubrica && (
              <div className="p-2 rounded-lg text-xs bg-blue-50 text-blue-700 border border-blue-200">
                Rubrica selecionada: <strong>{selectedRubrica.rubrica}</strong>
                {selectedRubrica.grupo ? <> — {selectedRubrica.grupo}</> : null}
              </div>
            )}

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
              disabled={saving || !saldoOk || !hasOrcamentoVinculado}
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
