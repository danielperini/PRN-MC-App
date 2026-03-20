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
import { AlertTriangle, Loader2, Sparkles, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import PurchaseDocumentUpload from './PurchaseDocumentUpload';
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

const CENTROS = ['MUMO', 'MIS', 'MHAB', 'Noturno nos Museus 2026', 'Publicações', 'Geral'];
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

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCentroCusto(value) {
  const raw = normalizeString(value);

  if (!raw) return '';

  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';

  if (raw.includes('museu da imagem e do som')) return 'MIS';
  if (raw.includes('imagem e som')) return 'MIS';

  if (raw.includes('historico abilio barreto')) return 'MHAB';
  if (raw.includes('abilio barreto')) return 'MHAB';

  if (raw.includes('moda')) return 'MUMO';

  if (raw.includes('noturno')) return 'NOTURNO NOS MUSEUS 2026';
  if (raw.includes('publica')) return 'PUBLICAÇÕES';
  if (raw === 'geral') return 'GERAL';

  return String(value || '').trim().toUpperCase();
}

function sameCentroOrGlobal(entityCentro, selectedCentro) {
  const entity = normalizeCentroCusto(entityCentro);
  const selected = normalizeCentroCusto(selectedCentro);

  if (!selected) return true;
  if (!entity) return true;
  return entity === selected;
}

function getRubricaCentroCusto(rubrica) {
  return normalizeCentroCusto(
    rubrica?.centro_custo ||
      rubrica?.museu ||
      rubrica?.museu_codigo ||
      rubrica?.unidade ||
      ''
  );
}

function getBudgetLineCentroCusto(line) {
  return normalizeCentroCusto(
    line?.centro_custo ||
      line?.museu ||
      line?.museu_codigo ||
      line?.unidade ||
      ''
  );
}

function formatMoney(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export default function PurchaseFormDialog({
  currentUser,
  onClose,
  onSuccess,
  prefill,
}) {
  const { budgetLines = [] } = useBudgetLines();

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('-created_date', 999),
  });

  const [form, setForm] = useState(() =>
    prefill ? { ...EMPTY, ...prefill } : EMPTY
  );
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzingMeta, setAnalyzingMeta] = useState(false);
  const [checkingSaldo, setCheckingSaldo] = useState(false);
  const [saldoInfo, setSaldoInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activities, setActivities] = useState([]);
  const [mes, setMes] = useState(
    prefill?.mes_referencia || MESES[new Date().getMonth()]
  );
  const [ano, setAno] = useState(prefill?.ano || new Date().getFullYear());
  const [orcamentoAnalysis, setOrcamentoAnalysis] = useState(null);
  const [analisandoOrcamento, setAnalisandoOrcamento] = useState(false);

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

  const rubricasAtivas = useMemo(() => {
    return (rubricas || []).filter((r) => r?.ativo !== false);
  }, [rubricas]);

  const filteredRubricas = useMemo(() => {
    return rubricasAtivas
      .filter((r) => sameCentroOrGlobal(getRubricaCentroCusto(r), form.centro_custo))
      .sort((a, b) => {
        const ga = String(a?.grupo || '').localeCompare(String(b?.grupo || ''), 'pt-BR');
        if (ga !== 0) return ga;
        return String(a?.rubrica || a?.nome || '').localeCompare(
          String(b?.rubrica || b?.nome || ''),
          'pt-BR'
        );
      });
  }, [rubricasAtivas, form.centro_custo]);

  const selectedRubrica = useMemo(() => {
    return rubricasAtivas.find((r) => r.id === form.rubrica_id) || null;
  }, [rubricasAtivas, form.rubrica_id]);

  const compatibleBudgetLines = useMemo(() => {
    if (!form.rubrica_id) return [];

    return (budgetLines || [])
      .filter((line) => {
        const sameRubrica = String(line?.rubrica_id || '') === String(form.rubrica_id || '');
        const sameCentro = sameCentroOrGlobal(
          getBudgetLineCentroCusto(line),
          form.centro_custo
        );
        return sameRubrica && sameCentro;
      })
      .sort((a, b) =>
        String(a?.descricao || a?.rubrica || '').localeCompare(
          String(b?.descricao || b?.rubrica || ''),
          'pt-BR'
        )
      );
  }, [budgetLines, form.rubrica_id, form.centro_custo]);

  const selectedLine = useMemo(() => {
    return compatibleBudgetLines.find((l) => l.id === form.budgetline_id) || null;
  }, [compatibleBudgetLines, form.budgetline_id]);

  useEffect(() => {
    if (!form.rubrica_id) {
      if (form.budgetline_id) {
        set('budgetline_id', '');
      }
      return;
    }

    const stillCompatible = compatibleBudgetLines.some(
      (line) => line.id === form.budgetline_id
    );

    if (!stillCompatible) {
      if (compatibleBudgetLines.length === 1) {
        set('budgetline_id', compatibleBudgetLines[0].id);
      } else if (form.budgetline_id) {
        set('budgetline_id', '');
      }
    }
  }, [form.rubrica_id, form.budgetline_id, compatibleBudgetLines]);

  useEffect(() => {
    if (!selectedRubrica) return;

    const rubricaCentro = getRubricaCentroCusto(selectedRubrica);
    if (!form.centro_custo && rubricaCentro) {
      set('centro_custo', rubricaCentro);
    }
  }, [selectedRubrica, form.centro_custo]);

  useEffect(() => {
    if (form.budgetline_id && form.valor_solicitado) {
      setCheckingSaldo(true);
      base44.functions
        .invoke('purchaseActions', {
          action: 'check_budget',
          budgetline_id: form.budgetline_id,
          valor: parseFloat(form.valor_solicitado) || 0,
        })
        .then((res) => {
          setSaldoInfo(res?.data || null);
          setCheckingSaldo(false);
        })
        .catch(() => {
          setSaldoInfo(null);
          setCheckingSaldo(false);
        });
      return;
    }

    setSaldoInfo(null);
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
      setAiAnalysis(res?.data?.analysis || null);
    } catch {
      toast.error('Erro na análise da IA');
    }
    setAnalyzingMeta(false);
  };

  const analisarOrcamentoComIA = async () => {
    if ((form.orcamentos_docs || []).length === 0) {
      toast.error('Nenhum orçamento anexado para analisar.');
      return;
    }

    setAnalisandoOrcamento(true);
    try {
      const orcamento = form.orcamentos_docs[form.orcamentos_docs.length - 1];

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
              meios_pagamento: { type: 'string' },
            },
          },
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
    if (dados.valor_solicitado) set('valor_solicitado', String(dados.valor_solicitado));
    if (dados.valor_unitario) set('valor_unitario', String(dados.valor_unitario));
    if (dados.qtd) set('qtd', String(dados.qtd));
    if (dados.unidade) set('unidade', dados.unidade);

    if (dados.meios_pagamento) {
      const meio = dados.meios_pagamento.includes('PIX')
        ? 'PIX'
        : dados.meios_pagamento.includes('TED') ||
            dados.meios_pagamento.includes('Transferência')
          ? 'TED/Transferência'
          : dados.meios_pagamento.includes('Boleto')
            ? 'Boleto'
            : dados.meios_pagamento.includes('Cartão')
              ? 'Cartão'
              : dados.meios_pagamento.includes('Dinheiro')
                ? 'Dinheiro'
                : '';

      if (meio) set('meio_pagamento', meio);
    }

    let obs = form.observacoes || '';
    if (dados.garantia) obs += (obs ? '\n' : '') + `Garantia: ${dados.garantia}`;
    if (dados.condicoes_pagamento) {
      obs += (obs ? '\n' : '') + `Condições: ${dados.condicoes_pagamento}`;
    }
    if (dados.prazo_entrega) obs += (obs ? '\n' : '') + `Prazo: ${dados.prazo_entrega}`;
    if (dados.fornecedor_cidade) {
      obs += (obs ? '\n' : '') + `Cidade: ${dados.fornecedor_cidade}`;
    }
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

  const validateFinanceiro = () => {
    if (!form.centro_custo) {
      return 'Selecione o centro de custo.';
    }

    if (!form.rubrica_id) {
      return 'Selecione a rubrica orçamentária.';
    }

    if (!form.budgetline_id) {
      return 'Selecione a BudgetLine auxiliar vinculada à rubrica.';
    }

    if (!selectedRubrica) {
      return 'Rubrica selecionada não foi encontrada.';
    }

    const rubricaCentro = getRubricaCentroCusto(selectedRubrica);
    if (!sameCentroOrGlobal(rubricaCentro, form.centro_custo)) {
      return `A rubrica pertence ao centro ${rubricaCentro || 'não definido'} e não é compatível com ${form.centro_custo}.`;
    }

    if (!selectedLine) {
      return 'A BudgetLine selecionada não é compatível com a rubrica informada.';
    }

    const lineCentro = getBudgetLineCentroCusto(selectedLine);
    if (!sameCentroOrGlobal(lineCentro, form.centro_custo)) {
      return `A BudgetLine pertence ao centro ${lineCentro || 'não definido'} e não é compatível com ${form.centro_custo}.`;
    }

    if (String(selectedLine?.rubrica_id || '') !== String(form.rubrica_id || '')) {
      return 'A BudgetLine selecionada não está vinculada à rubrica escolhida.';
    }

    return null;
  };

  const handleSave = async (submeter = false) => {
    const missingRequired =
      !form.descricao_item ||
      !form.meta_id ||
      !form.rubrica_id ||
      !form.budgetline_id ||
      !form.centro_custo ||
      !form.categoria ||
      !form.tipo_gasto ||
      !form.valor_solicitado;

    if (missingRequired) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    const financeiroError = validateFinanceiro();
    if (financeiroError) {
      toast.error(financeiroError);
      return;
    }

    if (submeter && !saldoOk) {
      toast.error('Saldo insuficiente para envio da solicitação.');
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

      const created = await base44.entities.PurchaseRequest.create({
        ...form,
        report_id,
        centro_custo: form.centro_custo,
        rubrica_id: form.rubrica_id,
        budgetline_id: form.budgetline_id,
        valor_solicitado: parseFloat(form.valor_solicitado) || 0,
        valor_unitario: parseFloat(form.valor_unitario) || 0,
        qtd: parseFloat(form.qtd) || 1,
        orcamento_url,
        nota_fiscal_url,
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

        await base44.functions
          .invoke('notifyCoordinatorOnPurchaseSubmitted', {
            purchase_id: created.id,
            purchase_description: form.descricao_item,
            requester_name: currentUser?.full_name || 'Usuário',
            requester_email: currentUser?.email || '',
            amount: parseFloat(form.valor_solicitado) || 0,
          })
          .catch(() => {});

        toast.success('✅ Solicitação de compra enviada para aprovação!', {
          description: `Item: ${form.descricao_item}\nValor: R$ ${parseFloat(
            form.valor_solicitado
          ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          duration: 5000,
        });
      } else {
        toast.success('✅ Rascunho salvo com sucesso!', {
          description: 'Você pode continuar editando ou enviar para aprovação depois.',
          duration: 5000,
        });
      }

      onSuccess();
    } catch (e) {
      toast.error('❌ Erro ao salvar: ' + e.message, { duration: 5000 });
    }
    setSaving(false);
  };

  const saldoDisponivel =
    saldoInfo?.saldo_disponivel !== undefined && saldoInfo?.saldo_disponivel !== null
      ? toNumber(saldoInfo.saldo_disponivel)
      : null;

  const valorNum = parseFloat(form.valor_solicitado) || 0;
  const saldoOk = saldoDisponivel === null || saldoDisponivel >= valorNum;
  const financeiroError = validateFinanceiro();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-black">Nova Solicitação de Compra</h2>
            <p className="text-xs text-gray-500">3º Termo Aditivo — Museus Centro</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ×
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Mês de referência</Label>
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
              <Label className="text-xs text-gray-600 mb-1 block">Ano</Label>
              <Input
                type="number"
                value={ano}
                onChange={(e) => setAno(parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">
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
                <Label className="text-xs text-gray-600 mb-1 block">Tipo de gasto *</Label>
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
                <Label className="text-xs text-gray-600 mb-1 block">Categoria *</Label>
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

          <div className="space-y-3 p-4 border border-gray-100 rounded-xl bg-gray-50">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
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
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Analisar correspondência com a meta (IA)
              </Button>
            )}

            {aiAnalysis && (
              <div
                className={`p-3 rounded-lg border ${
                  aiAnalysis.score >= 80
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold">Score de correspondência</span>
                  <span
                    className={`text-lg font-bold ${
                      aiAnalysis.score >= 80 ? 'text-green-700' : 'text-amber-700'
                    }`}
                  >
                    {aiAnalysis.score}/100
                  </span>
                </div>
                <p className="text-xs text-gray-700 mb-2">{aiAnalysis.justificativa}</p>
                {aiAnalysis.alerta && aiAnalysis.meta_sugerida !== form.meta_id && (
                  <div className="flex items-start gap-2 p-2 bg-amber-100 rounded-md">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      <strong>Sugestão da IA:</strong> esta compra pode se encaixar
                      melhor em <strong>{aiAnalysis.meta_sugerida}</strong>.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Enquadramento financeiro
            </Label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Centro de custo *</Label>
                <Select
                  value={form.centro_custo}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      centro_custo: v,
                      rubrica_id: '',
                      budgetline_id: '',
                    }))
                  }
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
              </div>

              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Rubrica orçamentária *</Label>
                <Select
                  value={form.rubrica_id || ''}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      rubrica_id: v,
                      budgetline_id: '',
                    }))
                  }
                  disabled={!form.centro_custo}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        form.centro_custo
                          ? 'Selecione a rubrica...'
                          : 'Selecione primeiro o centro de custo'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {filteredRubricas.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-gray-500">
                        Nenhuma rubrica compatível com o centro selecionado
                      </div>
                    ) : (
                      filteredRubricas.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.rubrica || r.nome} {r.grupo ? `(${r.grupo})` : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-gray-600 mb-1 block">
                BudgetLine auxiliar vinculada *
              </Label>
              <Select
                value={form.budgetline_id || ''}
                onValueChange={(v) => set('budgetline_id', v)}
                disabled={!form.rubrica_id}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      form.rubrica_id
                        ? 'Selecione a BudgetLine compatível...'
                        : 'Selecione primeiro a rubrica'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {compatibleBudgetLines.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-gray-500">
                      Nenhuma BudgetLine compatível com a rubrica selecionada
                    </div>
                  ) : (
                    compatibleBudgetLines.map((line) => (
                      <SelectItem key={line.id} value={line.id}>
                        {line.codigo ? `[${line.codigo}] ` : ''}
                        {line.descricao || line.rubrica || line.nome || 'BudgetLine'}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedRubrica && (
              <div className="p-3 rounded-lg bg-gray-50 border text-xs text-gray-700 space-y-1">
                <div className="font-semibold text-gray-900">
                  {selectedRubrica.rubrica || selectedRubrica.nome}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Grupo: <strong>{selectedRubrica.grupo || '—'}</strong>
                  </span>
                  <span>
                    Centro da rubrica:{' '}
                    <strong>{getRubricaCentroCusto(selectedRubrica) || 'não definido'}</strong>
                  </span>
                  <span>
                    Valor original:{' '}
                    <strong>{formatMoney(selectedRubrica.valor_rubrica)}</strong>
                  </span>
                  <span>
                    Saldo atual: <strong>{formatMoney(selectedRubrica.saldo)}</strong>
                  </span>
                </div>
              </div>
            )}

            {selectedLine && (
              <div
                className={`p-2 rounded-lg text-xs ${
                  saldoOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {checkingSaldo ? (
                  <span>Verificando saldo...</span>
                ) : saldoOk ? (
                  <span>
                    ✓ Saldo disponível: <strong>{formatMoney(saldoDisponivel)}</strong>
                  </span>
                ) : (
                  <span>
                    ⚠️ Saldo insuficiente. Disponível:{' '}
                    <strong>{formatMoney(saldoDisponivel)}</strong>
                  </span>
                )}
              </div>
            )}

            {financeiroError && (
              <div className="p-2 rounded-lg text-xs bg-amber-50 text-amber-800 border border-amber-200">
                {financeiroError}
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
                onChange={(e) => {
                  const qtd = parseFloat(e.target.value) || 1;
                  const vUnit = parseFloat(form.valor_unitario) || 0;
                  setForm((f) => ({
                    ...f,
                    qtd: e.target.value,
                    valor_solicitado: qtd * vUnit ? (qtd * vUnit).toFixed(2) : f.valor_solicitado,
                  }));
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Unidade</Label>
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
              <Label className="text-xs text-gray-600 mb-1 block">
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
              <Label className="text-xs text-gray-600 mb-1 block">Valor total (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.valor_solicitado}
                onChange={(e) => set('valor_solicitado', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-600 mb-1 block">
              Atividade vinculada{' '}
              {isFromActivity && (
                <span className="text-blue-600 font-normal">(herdada)</span>
              )}
            </Label>
            {isFromActivity ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800 h-9">
                <LinkIcon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {prefill._activity_titulo || `${form.activity_id?.slice(0, 12)}…`}
                </span>
              </div>
            ) : (
              <Select
                value={form.activity_id || '__NONE__'}
                onValueChange={(v) => set('activity_id', v === '__NONE__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione ou deixe sem vínculo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">Sem vínculo com atividade</SelectItem>
                  {activities.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100">
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

          {isFromActivity && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs space-y-1">
              <p className="font-semibold text-blue-800">
                🔗 Rastreabilidade herdada automaticamente
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-blue-700 mt-1">
                {form.report_id && (
                  <span>
                    Relatório:{' '}
                    <code className="bg-blue-100 px-1 rounded">
                      {form.report_id.slice(0, 8)}…
                    </code>
                  </span>
                )}
                {form.activity_id && (
                  <span>
                    Atividade:{' '}
                    <code className="bg-blue-100 px-1 rounded">
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

          <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
            <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Fornecedor
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">
                  Nome do fornecedor
                </Label>
                <Input
                  placeholder="Empresa ou pessoa"
                  value={form.fornecedor_nome}
                  onChange={(e) => set('fornecedor_nome', e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">CNPJ/CPF</Label>
                <Input
                  placeholder="00.000.000/0001-00"
                  value={form.fornecedor_cnpj}
                  onChange={(e) => set('fornecedor_cnpj', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Contato</Label>
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
              <Label className="text-xs text-gray-600 mb-1 block">Meio de pagamento</Label>
              <Select
                value={form.meio_pagamento}
                onValueChange={(v) => set('meio_pagamento', v)}
              >
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
              <Label className="text-xs text-gray-600 mb-1 block">
                Dados para pagamento
              </Label>
              <Input
                placeholder="Chave PIX, dados bancários..."
                value={form.detalhe_pagamento}
                onChange={(e) => set('detalhe_pagamento', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  📋 Orçamentos do Fornecedor
                </Label>
                {(form.orcamentos_docs || []).length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={analisarOrcamentoComIA}
                      disabled={analisandoOrcamento}
                    >
                      {analisandoOrcamento ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="w-3 h-3 mr-1" />
                      )}
                      Ler orçamento com IA
                    </Button>
                    {orcamentoAnalysis && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={preencherComIA}
                      >
                        Preencher formulário
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <PurchaseDocumentUpload
                documents={form.orcamentos_docs || []}
                onDocumentsChange={(docs) => set('orcamentos_docs', docs)}
                type="orcamento"
              />
            </div>

            <div className="space-y-3 p-4 border border-gray-100 rounded-xl">
              <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                🧾 Notas Fiscais
              </Label>
              <PurchaseDocumentUpload
                documents={form.notas_fiscais_docs || []}
                onDocumentsChange={(docs) => set('notas_fiscais_docs', docs)}
                type="nota_fiscal"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Observações</Label>
            <Textarea
              placeholder="Informações adicionais..."
              value={form.observacoes}
              onChange={(e) => set('observacoes', e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-between items-center p-6 border-t bg-gray-50 rounded-b-2xl sticky bottom-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              Salvar Rascunho
            </Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={() => handleSave(true)}
              disabled={saving || !saldoOk || !!financeiroError}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enviar para Aprovação
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}function getRubricaCentroCusto(rubrica: any): string {
  return normalizeMuseu(
    rubrica?.centro_custo ||
      rubrica?.museu ||
      rubrica?.museu_codigo ||
      rubrica?.unidade ||
      ''
  );
}

function getBudgetLineCentroCusto(budgetLine: any): string {
  return normalizeMuseu(
    budgetLine?.centro_custo ||
      budgetLine?.museu ||
      budgetLine?.museu_codigo ||
      budgetLine?.unidade ||
      ''
  );
}

function sameMuseuOrGlobal(entityMuseu: string, purchaseMuseu: string): boolean {
  if (!purchaseMuseu) return true;
  if (!entityMuseu) return true;
  return entityMuseu === purchaseMuseu;
}

async function listAll(entityApi: any, orderBy = '', pageSize = 500) {
  let all: any[] = [];
  let page = 0;

  while (true) {
    const batch = await entityApi.list(orderBy, pageSize, page * pageSize);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    page++;
  }

  return all;
}

function resolveRubricaFromPurchase(
  purchase: any,
  rubricas: any[],
  budgetLineById: Record<string, any>
) {
  const purchaseMuseu = getPurchaseCentroCusto(purchase);

  if (purchase?.rubrica_id) {
    const rubrica = rubricas.find((r) => r.id === purchase.rubrica_id);

    if (!rubrica) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'rubrica_id_nao_encontrada',
        motivo: 'rubrica_id informado na compra não foi encontrado',
      };
    }

    const rubricaMuseu = getRubricaCentroCusto(rubrica);

    if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
      return {
        rubricaId: null,
        rubricaMuseu: null,
        purchaseMuseu,
        origem: 'rubrica_id_incompativel_museu',
        motivo: `Rubrica vinculada ao museu ${rubricaMuseu}, mas a compra está em ${purchaseMuseu}`,
      };
    }

    const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

    if (purchaseBudgetlineId) {
      const budgetLine = budgetLineById[purchaseBudgetlineId];

      if (!budgetLine) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_nao_encontrada',
          motivo: 'BudgetLine vinculada na compra não foi encontrada',
        };
      }

      const budgetMuseu = getBudgetLineCentroCusto(budgetLine);

      if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_incompativel_museu',
          motivo: `BudgetLine vinculada ao museu ${budgetMuseu}, mas a compra está em ${purchaseMuseu}`,
        };
      }

      if (budgetLine?.rubrica_id && budgetLine.rubrica_id !== rubrica.id) {
        return {
          rubricaId: null,
          rubricaMuseu: null,
          purchaseMuseu,
          origem: 'budgetline_rubrica_divergente',
          motivo: 'BudgetLine aponta para rubrica diferente da rubrica_id informada na compra',
        };
      }
    }

    return {
      rubricaId: rubrica.id,
      rubricaMuseu,
      purchaseMuseu,
      origem: 'rubrica_id',
      motivo: null,
    };
  }

  const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

  if (!purchaseBudgetlineId) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'sem_rubrica_id_e_sem_budgetline',
      motivo: 'Compra sem rubrica_id e sem BudgetLine vinculada',
    };
  }

  const budgetLine = budgetLineById[purchaseBudgetlineId];

  if (!budgetLine) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_nao_encontrada',
      motivo: 'BudgetLine vinculada na compra não foi encontrada',
    };
  }

  const budgetMuseu = getBudgetLineCentroCusto(budgetLine);

  if (!sameMuseuOrGlobal(budgetMuseu, purchaseMuseu)) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_incompativel_museu',
      motivo: `BudgetLine vinculada ao museu ${budgetMuseu}, mas a compra está em ${purchaseMuseu}`,
    };
  }

  if (!budgetLine?.rubrica_id) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_sem_rubrica_id',
      motivo: 'BudgetLine não possui rubrica_id vinculado',
    };
  }

  const rubrica = rubricas.find((r) => r.id === budgetLine.rubrica_id);

  if (!rubrica) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_rubrica_nao_encontrada',
      motivo: 'rubrica_id da BudgetLine não foi encontrado',
    };
  }

  const rubricaMuseu = getRubricaCentroCusto(rubrica);

  if (!sameMuseuOrGlobal(rubricaMuseu, purchaseMuseu)) {
    return {
      rubricaId: null,
      rubricaMuseu: null,
      purchaseMuseu,
      origem: 'budgetline_rubrica_incompativel_museu',
      motivo: `Rubrica da BudgetLine vinculada ao museu ${rubricaMuseu}, mas a compra está em ${purchaseMuseu}`,
    };
  }

  return {
    rubricaId: rubrica.id,
    rubricaMuseu,
    purchaseMuseu,
    origem: 'budgetline_rubrica_id',
    motivo: null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { action = '', purchaseId, ...data } = payload || {};

    const normalizedAction =
      action === 'approve_coord' || action === 'approve_admin'
        ? 'aprovar'
        : action === 'recusar'
          ? 'reject'
          : action;

    const userPerms = await base44.asServiceRole.entities.UserPermission.filter({
      user_email: user.email,
    });

    const firstPerm = userPerms && userPerms.length > 0 ? userPerms[0] : null;

    const isCoordinator =
      user.role === 'admin' ||
      user.role === 'ADMIN' ||
      user.role === 'COORDENADOR' ||
      user.role === 'COORD_COMUNICACAO' ||
      user.role === 'COORD_ADMINISTRATIVA' ||
      user.role === 'COORD_PRODUCAO' ||
      (!!firstPerm &&
        (firstPerm.can_review_reports === true ||
          firstPerm.pode_aprovar_solicitacoes === true ||
          firstPerm.gestao_compras === true));

    if (normalizedAction === 'analyze_meta') {
      const { descricao_item, meta_id, categoria, tipo_gasto, valor_solicitado } = data;

      const metas = {
        'MC3A-20':
          'Realizar 30 ações educativas e/ou culturais: oficinas, palestras, mesas, filmes, apresentações relacionadas às vocações dos museus.',
        'MC3A-21':
          'Realizar 1 exposição e evento de abertura no MUMO: pesquisa, curadoria, projeto curatorial e expográfico, identidade visual, montagem, divulgação e evento inaugural.',
        'MC3A-22':
          'Consultorias transversais + formação em ambiente seguro e acessibilidade: 2 consultorias em temas transversais + 1 formação.',
        'MC3A-EXTRA':
          'Meta extra: compras que não se vinculam diretamente às metas 20–22.',
      };

      const prompt = `Você é um especialista em gestão de projetos culturais e contratos públicos (Termos de Colaboração).

Analise se a seguinte solicitação de compra/contratação corresponde à meta indicada.

SOLICITAÇÃO:
- Descrição: ${descricao_item || ''}
- Categoria: ${categoria || ''}
- Tipo: ${tipo_gasto || ''}
- Valor: R$ ${valor_solicitado || 0}

META INDICADA (${meta_id || 'não informada'}):
${metas[meta_id] || 'Meta extra sem descrição específica.'}

TODAS AS METAS DISPONÍVEIS:
${Object.entries(metas)
  .map(([k, v]) => `${k}: ${v}`)
  .join('\n')}

Retorne um JSON com:
- score: número de 0 a 100 indicando o grau de correspondência com a meta indicada
- meta_sugerida: código da meta mais adequada (pode ser a mesma se for correta)
- justificativa: texto curto (2-3 frases) explicando o score
- alerta: true se score < 80, false caso contrário`;

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            meta_sugerida: { type: 'string' },
            justificativa: { type: 'string' },
            alerta: { type: 'boolean' },
          },
        },
      });

      return Response.json({ success: true, analysis: result });
    }

    if (normalizedAction === 'check_budget') {
      const { budgetline_id, valor } = data;

      if (!budgetline_id) {
        return Response.json({ error: 'budgetline_id é obrigatório' }, { status: 400 });
      }

      const line = await base44.asServiceRole.entities.BudgetLine.get(budgetline_id);
      if (!line) {
        return Response.json({ error: 'BudgetLine não encontrada' }, { status: 404 });
      }

      let rubrica = null;
      if (line?.rubrica_id) {
        try {
          rubrica = await base44.asServiceRole.entities.Rubrica.get(line.rubrica_id);
        } catch {
          rubrica = null;
        }
      }

      const valorNumerico = toNumber(valor);
      const saldoBudgetLine =
        toNumber(line.saldo_inicial) - toNumber(line.saldo_comprometido);

      const saldoRubrica = rubrica ? toNumber(rubrica.saldo) : null;
      const saldoDisponivel =
        saldoRubrica !== null ? Math.min(saldoBudgetLine, saldoRubrica) : saldoBudgetLine;

      const aprovavel = saldoDisponivel >= valorNumerico;

      return Response.json({
        success: true,
        saldo_disponivel: saldoDisponivel,
        aprovavel,
        linha: line,
        rubrica: rubrica || null,
        criterio: rubrica ? 'min(budgetline, rubrica)' : 'budgetline',
      });
    }

    if (normalizedAction === 'aprovar') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      if (!isCoordinator) {
        return Response.json(
          { error: 'Apenas coordenadores podem aprovar compras' },
          { status: 403 }
        );
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'SOLICITADO') {
        return Response.json(
          {
            error: `Apenas solicitações pendentes podem ser aprovadas. Status atual: ${purchase.status}`,
          },
          { status: 400 }
        );
      }

      const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

      if (!purchaseBudgetlineId) {
        return Response.json(
          { error: 'A compra não possui linha orçamentária vinculada' },
          { status: 400 }
        );
      }

      const budgetLine = await base44.asServiceRole.entities.BudgetLine.get(
        purchaseBudgetlineId
      );
      if (!budgetLine) {
        return Response.json(
          { error: 'Linha orçamentária não encontrada' },
          { status: 404 }
        );
      }

      const allRubricas = await listAll(
        base44.asServiceRole.entities.Rubrica,
        'ordem_exibicao',
        500
      );

      const rubricasMap = new Map<string, any>();
      for (const r of allRubricas) {
        const key = r?.rubrica_key || buildRubricaKey(r);
        if (!rubricasMap.has(key)) {
          rubricasMap.set(key, r);
        }
      }
      const rubricasUnicas = Array.from(rubricasMap.values());

      const allBudgetLines = await listAll(
        base44.asServiceRole.entities.BudgetLine,
        'descricao',
        500
      );

      const budgetLineById: Record<string, any> = {};
      for (const bl of allBudgetLines) {
        if (bl?.id) budgetLineById[bl.id] = bl;
      }

      const resolvedRubrica = resolveRubricaFromPurchase(
        purchase,
        rubricasUnicas,
        budgetLineById
      );

      if (!resolvedRubrica.rubricaId) {
        return Response.json(
          {
            error: 'A compra não possui vínculo financeiro válido para aprovação.',
            motivo: resolvedRubrica.motivo,
            purchase_id: purchaseId,
            centro_custo: resolvedRubrica.purchaseMuseu || null,
            rubrica_id: purchase.rubrica_id || null,
            budgetline_id: purchaseBudgetlineId,
          },
          { status: 400 }
        );
      }

      const rubrica = rubricasUnicas.find((r) => r.id === resolvedRubrica.rubricaId) || null;
      if (!rubrica) {
        return Response.json(
          { error: 'Rubrica vinculada não encontrada' },
          { status: 404 }
        );
      }

      const valorFinal = getPurchaseValue(purchase);
      const saldoDisponivelBudgetLine =
        toNumber(budgetLine.saldo_inicial) - toNumber(budgetLine.saldo_comprometido);
      const saldoDisponivelRubrica = toNumber(rubrica.saldo);
      const saldoDisponivel = Math.min(saldoDisponivelBudgetLine, saldoDisponivelRubrica);

      if (saldoDisponivel < valorFinal) {
        return Response.json(
          {
            error:
              'Saldo insuficiente para aprovação. Disponível: R$ ' +
              saldoDisponivel.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              }),
            saldo_budgetline: saldoDisponivelBudgetLine,
            saldo_rubrica: saldoDisponivelRubrica,
            rubrica_id: rubrica.id,
          },
          { status: 400 }
        );
      }

      const novoStatus = 'APROVADO_COORD';
      const dataAprovacao = new Date().toISOString();

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: novoStatus,
        aprovado_por_email: user.email,
        aprovado_por_nome: user.full_name,
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: dataAprovacao,
        aprov_coord_comentario: data.comentario || '',
        data_aprovacao: dataAprovacao,
        rubrica_id: resolvedRubrica.rubricaId,
      });

      const novoComprometido =
        toNumber(budgetLine.saldo_comprometido) + valorFinal;

      await base44.asServiceRole.entities.BudgetLine.update(purchaseBudgetlineId, {
        saldo_comprometido: novoComprometido,
      });

      try {
        await base44.asServiceRole.functions.invoke('recalculateRubrica', {
          purchaseId,
          rubrica_id: resolvedRubrica.rubricaId,
          budgetline_id: purchaseBudgetlineId,
        });
      } catch (e: any) {
        console.error('Erro ao recalcular rubrica após aprovação:', e?.message || e);
      }

      try {
        await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
          trigger: 'purchase_approved',
          purchaseId,
          rubrica_id: resolvedRubrica.rubricaId,
          budgetline_id: purchaseBudgetlineId,
        });
      } catch (e: any) {
        console.error('Erro ao recalcular todas as rubricas após aprovação:', e?.message || e);
      }

      try {
        const solicitante = await base44.asServiceRole.entities.User.filter({
          email: purchase.created_by,
        });

        if (solicitante && solicitante.length > 0) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: solicitante[0].email,
            subject: '✅ Sua solicitação de compra foi aprovada',
            body: `Olá ${solicitante[0].full_name},

Sua solicitação de compra foi aprovada pelo coordenador ${user.full_name}.

Item: ${purchase.descricao_item || ''}
Valor: R$ ${valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

Atenção: esta compra está pronta para pagamento.

Atenciosamente,
Plataforma — Museus Centro`,
            from_name: 'Museus Centro',
          });
        }
      } catch (e: any) {
        console.error('Erro ao enviar email de aprovação:', e?.message || e);
      }

      return Response.json({
        success: true,
        action: novoStatus,
        budgetline_id: purchaseBudgetlineId,
        rubrica_id: resolvedRubrica.rubricaId,
      });
    }

    if (normalizedAction === 'reject') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      if (!isCoordinator) {
        return Response.json(
          { error: 'Apenas coordenadores podem recusar compras' },
          { status: 403 }
        );
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'SOLICITADO') {
        return Response.json(
          {
            error: `Apenas solicitações pendentes podem ser recusadas. Status atual: ${purchase.status}`,
          },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RECUSADO',
        aprov_coord_nome: user.full_name,
        aprov_coord_email: user.email,
        aprov_coord_data: new Date().toISOString(),
        aprov_coord_comentario: data.comentario || 'Solicitação recusada',
      });

      try {
        await base44.asServiceRole.functions.invoke(
          'notifyUserOnPurchaseStatusChange',
          {
            purchaseId,
            newStatus: 'RECUSADO',
            comentario: data.comentario || '',
          }
        );
      } catch (e: any) {
        console.error('Erro ao notificar mudança de status:', e?.message || e);
      }

      return Response.json({ success: true, action: 'RECUSADO' });
    }

    if (normalizedAction === 'marcar_pago') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      if (!isCoordinator) {
        return Response.json(
          { error: 'Apenas coordenadores podem marcar compras como pagas' },
          { status: 403 }
        );
      }

      const { comprovante_url, data_pagamento } = data;

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (
        purchase.status !== 'APROVADO_COORD' &&
        purchase.status !== 'APROVADO_ADMIN'
      ) {
        return Response.json(
          {
            error: 'A compra precisa estar aprovada antes de ser marcada como paga.',
          },
          { status: 400 }
        );
      }

      const allRubricas = await listAll(
        base44.asServiceRole.entities.Rubrica,
        'ordem_exibicao',
        500
      );

      const rubricasMap = new Map<string, any>();
      for (const r of allRubricas) {
        const key = r?.rubrica_key || buildRubricaKey(r);
        if (!rubricasMap.has(key)) {
          rubricasMap.set(key, r);
        }
      }
      const rubricasUnicas = Array.from(rubricasMap.values());

      const allBudgetLines = await listAll(
        base44.asServiceRole.entities.BudgetLine,
        'descricao',
        500
      );

      const budgetLineById: Record<string, any> = {};
      for (const bl of allBudgetLines) {
        if (bl?.id) budgetLineById[bl.id] = bl;
      }

      const resolvedRubrica = resolveRubricaFromPurchase(
        purchase,
        rubricasUnicas,
        budgetLineById
      );

      if (!resolvedRubrica.rubricaId) {
        return Response.json(
          {
            error: 'Não é permitido marcar a compra como PAGA sem rubrica vinculada.',
            motivo: resolvedRubrica.motivo,
            purchase_id: purchaseId,
            centro_custo: resolvedRubrica.purchaseMuseu || null,
            rubrica_id: purchase.rubrica_id || null,
            budgetline_id: getPurchaseBudgetlineId(purchase),
          },
          { status: 400 }
        );
      }

      const docs = await base44.asServiceRole.entities.PurchaseDocument.filter({
        purchase_id: purchaseId,
      });

      const docsFiscaisAprovados = (docs || []).filter((d) => {
        const tipo = getDocTipo(d);
        const status = getDocStatus(d);
        const tipoValido = tipo === 'nota_fiscal' || tipo === 'xml_nf';
        const statusValido = status === 'aprovado' || status === 'approved';
        return tipoValido && statusValido;
      });

      if (docsFiscaisAprovados.length === 0) {
        return Response.json(
          {
            error: 'É necessário ter uma Nota Fiscal ou XML aprovados antes do pagamento.',
          },
          { status: 400 }
        );
      }

      const paymentDate =
        data_pagamento && String(data_pagamento).trim()
          ? String(data_pagamento).trim()
          : new Date().toISOString().split('T')[0];

      const valorPago = getPurchaseValue(purchase);
      const purchaseBudgetlineId = getPurchaseBudgetlineId(purchase);

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        data_pagamento: paymentDate,
        comprovante_url: comprovante_url || '',
        pago_por: user.email,
        valor_pago: valorPago,
        rubrica_id: resolvedRubrica.rubricaId,
      });

      const syncResults: any[] = [];
      const syncErrors: any[] = [];

      for (const doc of docsFiscaisAprovados) {
        try {
          const syncResult = await base44.asServiceRole.functions.invoke(
            'syncDocumentToRubrica',
            {
              documentId: doc.id,
              purchaseId,
            }
          );

          syncResults.push({
            document_id: doc.id,
            result: syncResult,
          });
        } catch (e: any) {
          console.error(
            'Erro ao sincronizar documento ' + doc.id + ' com a rubrica:',
            e?.message || e
          );
          syncErrors.push({
            document_id: doc.id,
            error: e?.message || String(e),
          });
        }
      }

      try {
        await base44.asServiceRole.functions.invoke('recalculateRubrica', {
          purchaseId,
          rubrica_id: resolvedRubrica.rubricaId,
          budgetline_id: purchaseBudgetlineId,
        });
      } catch (e: any) {
        console.error('Erro ao recalcular rubrica:', e?.message || e);
        syncErrors.push({
          etapa: 'recalculateRubrica',
          error: e?.message || String(e),
        });
      }

      try {
        await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
          trigger: 'purchase_paid',
          purchaseId,
          rubrica_id: resolvedRubrica.rubricaId,
          budgetline_id: purchaseBudgetlineId,
        });
      } catch (e: any) {
        console.error('Erro ao recalcular todas as rubricas:', e?.message || e);
        syncErrors.push({
          etapa: 'recalculateAllRubricas',
          error: e?.message || String(e),
        });
      }

      let solicitanteEmail = purchase.created_by || '';
      let solicitanteNome = 'Solicitante';

      try {
        const solicitante = await base44.asServiceRole.entities.User.filter({
          email: purchase.created_by,
        });

        if (solicitante && solicitante.length > 0) {
          solicitanteEmail = solicitante[0].email || solicitanteEmail;
          solicitanteNome = solicitante[0].full_name || solicitanteNome;
        }
      } catch (e: any) {
        console.error('Erro ao buscar solicitante:', e?.message || e);
      }

      const valorFmt = valorPago.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      });

      if (solicitanteEmail) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: solicitanteEmail,
            subject: 'Sua compra foi marcada como paga',
            body: `Olá ${solicitanteNome},

Sua compra foi marcada como paga.

Item: ${purchase.descricao_item || ''}
Valor: R$ ${valorFmt}
Data do pagamento: ${paymentDate}
${comprovante_url ? `Comprovante: ${comprovante_url}` : ''}

Atenciosamente,
Plataforma — Museus Centro`,
            from_name: 'Museus Centro',
          });
        } catch (e: any) {
          console.error('Erro ao enviar email ao solicitante:', e?.message || e);
        }
      }

      try {
        const allPerms = await base44.asServiceRole.entities.UserPermission.list(
          '',
          9999
        );

        const coordinatorEmails = [
          ...new Set(
            (allPerms || [])
              .filter(
                (p) =>
                  p &&
                  p.user_email &&
                  (p.can_review_reports === true ||
                    p.pode_aprovar_solicitacoes === true ||
                    p.gestao_compras === true)
              )
              .map((p) => p.user_email)
          ),
        ];

        for (const email of coordinatorEmails) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: email,
              subject: 'Compra marcada como paga',
              body: `Olá,

Uma compra foi marcada como paga na plataforma.

Item: ${purchase.descricao_item || ''}
Solicitante: ${solicitanteNome}
E-mail do solicitante: ${solicitanteEmail || 'Não informado'}
Valor: R$ ${valorFmt}
Data do pagamento: ${paymentDate}
${comprovante_url ? `Comprovante: ${comprovante_url}` : ''}

Atenciosamente,
Plataforma — Museus Centro`,
              from_name: 'Museus Centro',
            });
          } catch (e: any) {
            console.error(
              'Erro ao enviar email ao coordenador ' + email + ':',
              e?.message || e
            );
          }
        }
      } catch (e: any) {
        console.error('Erro ao buscar coordenadores:', e?.message || e);
      }

      return Response.json({
        success: true,
        action: 'PAGO',
        purchaseId,
        data_pagamento: paymentDate,
        comprovante_url: comprovante_url || '',
        valor_pago: valorPago,
        rubrica_id: resolvedRubrica.rubricaId,
        budgetline_id: purchaseBudgetlineId,
        docs_fiscais_aprovados: docsFiscaisAprovados.map((d) => d.id),
        sync_results: syncResults,
        sync_errors: syncErrors,
      });
    }

    if (normalizedAction === 'submeter') {
      if (!purchaseId) {
        return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
      }

      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) {
        return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      }

      if (purchase.status !== 'RASCUNHO' && purchase.status !== 'RECUSADO') {
        return Response.json(
          {
            error: `Somente compras em rascunho ou recusadas podem ser submetidas. Status atual: ${purchase.status}`,
          },
          { status: 400 }
        );
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'SOLICITADO',
      });

      try {
        await base44.asServiceRole.functions.invoke(
          'notifyCoordinatorPurchaseSubmitted',
          {
            purchaseId,
          }
        );
      } catch (e: any) {
        console.error('Erro ao notificar coordenador:', e?.message || e);
      }

      return Response.json({ success: true, action: 'SOLICITADO' });
    }

    if (normalizedAction === 'ensure_report') {
      const { mes_referencia, ano } = data;

      const existing = await base44.asServiceRole.entities.Report.filter({
        created_by: user.email,
        mes_referencia,
        ano,
      });

      if (existing && existing.length > 0) {
        return Response.json({
          success: true,
          report_id: existing[0].id,
          created: false,
        });
      }

      const newReport = await base44.asServiceRole.entities.Report.create({
        author_name: user.full_name,
        museu: user.museu || '',
        equipe: user.equipe || '',
        funcao: user.funcao || '',
        mes_referencia,
        ano,
        status: 'DRAFT',
      });

      return Response.json({
        success: true,
        report_id: newReport.id,
        created: true,
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('purchaseActions error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
