import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toastMessages } from '@/lib/toastMessages';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const CENTROS = [
  'MUMO',
  'MIS',
  'MHAB',
  'Noturno nos Museus 2026',
  'Publicações',
  'Geral',
  'Atuação Geral',
];

const EMPTY = {
  descricao_item: '',
  centro_custo: '',
  rubrica_id: '',
  rubrica_nome: '',
  budgetline_id: '',
  valor_solicitado: '',
  fornecedor_nome: '',
  fornecedor_cnpj: '',
  observacoes: '',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') return value;

  const clean = String(value)
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeCentroCusto(value) {
  const raw = normalizeText(value);

  if (!raw) return '';
  if (raw.includes('mis')) return 'MIS';
  if (raw.includes('mhab')) return 'MHAB';
  if (raw.includes('mumo')) return 'MUMO';
  if (raw.includes('noturno')) return 'NOTURNO NOS MUSEUS 2026';
  if (raw.includes('publica')) return 'PUBLICAÇÕES';
  if (raw.includes('geral') || raw.includes('atuacao')) return 'GLOBAL';

  return String(value || '').toUpperCase();
}

function sameCentroOrGlobal(entityCentro, selectedCentro) {
  const entity = normalizeCentroCusto(entityCentro);
  const selected = normalizeCentroCusto(selectedCentro);

  if (!selected) return true;
  if (!entity) return true;
  if (entity === 'GLOBAL') return true;
  if (selected === 'GLOBAL') return true;

  return entity === selected;
}

function getRubricaCentroCusto(rubrica) {
  return normalizeCentroCusto(
    rubrica?.centro_custo ||
    rubrica?.museu ||
    rubrica?.unidade ||
    ''
  );
}

function getRubricaNome(rubrica) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '';
}

function normalizeFormFromPrefill(prefill) {
  if (!prefill) return EMPTY;

  return {
    ...EMPTY,
    ...prefill,

    descricao_item:
      prefill.descricao_item ||
      prefill.descricao_servico ||
      prefill.descricao ||
      prefill.observacoes ||
      '',

    fornecedor_nome:
      prefill.fornecedor_nome ||
      prefill.nf_emitente_nome ||
      prefill.emitente_nome ||
      prefill.razao_social ||
      '',

    fornecedor_cnpj:
      prefill.fornecedor_cnpj ||
      prefill.nf_emitente_cpf_cnpj ||
      prefill.cnpj ||
      prefill.cpf_cnpj ||
      '',

    valor_solicitado:
      prefill.valor_solicitado ??
      prefill.valor_total ??
      prefill.valor ??
      prefill.nf_valor_total ??
      '',

    centro_custo:
      prefill.centro_custo ||
      prefill.museu ||
      prefill.unidade ||
      'Geral',

    rubrica_id:
      prefill.rubrica_id ||
      prefill.rubricaId ||
      '',

    rubrica_nome:
      prefill.rubrica_nome ||
      prefill.rubrica ||
      prefill.rubrica_descricao ||
      '',

    budgetline_id:
      prefill.budgetline_id ||
      prefill.budgetLineId ||
      prefill.budget_line_id ||
      '',

    observacoes:
      prefill.observacoes ||
      prefill.comentarios ||
      '',
  };
}

export default function PurchaseFormDialog({
  currentUser,
  onClose,
  onSuccess,
  prefill,
}) {
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('-created_date', 999),
  });

  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget-lines-purchase-form'],
    queryFn: () => base44.entities.BudgetLine.list('', 2000),
  });

  const [form, setForm] = useState(() => normalizeFormFromPrefill(prefill));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(normalizeFormFromPrefill(prefill));
  }, [prefill]);

  const rubricasAtivas = useMemo(() => {
    return (rubricas || []).filter((r) => r?.ativo !== false);
  }, [rubricas]);

  const resolvedRubrica = useMemo(() => {
    if (!form.rubrica_id && !form.rubrica_nome) return null;

    const byId = rubricasAtivas.find((r) => r.id === form.rubrica_id);
    if (byId) return byId;

    const nomeAtual = normalizeText(form.rubrica_nome);

    if (!nomeAtual) return null;

    return rubricasAtivas.find((r) => {
      const nomeRubrica = normalizeText(getRubricaNome(r));

      return (
        nomeRubrica === nomeAtual ||
        nomeRubrica.includes(nomeAtual) ||
        nomeAtual.includes(nomeRubrica)
      );
    }) || null;
  }, [rubricasAtivas, form.rubrica_id, form.rubrica_nome]);

  useEffect(() => {
    if (!resolvedRubrica) return;

    setForm((prev) => {
      if (prev.rubrica_id === resolvedRubrica.id && prev.rubrica_nome) return prev;

      return {
        ...prev,
        rubrica_id: resolvedRubrica.id,
        rubrica_nome: getRubricaNome(resolvedRubrica),
      };
    });
  }, [resolvedRubrica]);

  const filteredRubricas = useMemo(() => {
    return rubricasAtivas.filter((r) =>
      sameCentroOrGlobal(getRubricaCentroCusto(r), form.centro_custo)
    );
  }, [rubricasAtivas, form.centro_custo]);

  const selectedRubrica = useMemo(() => {
    return resolvedRubrica || rubricasAtivas.find((r) => r.id === form.rubrica_id) || null;
  }, [resolvedRubrica, rubricasAtivas, form.rubrica_id]);

  const resolvedBudgetLineId = useMemo(() => {
    if (form.budgetline_id) return form.budgetline_id;

    const rubricaId = selectedRubrica?.id || form.rubrica_id;
    const rubricaNome = normalizeText(form.rubrica_nome || getRubricaNome(selectedRubrica));

    const byRubricaId = (budgetLines || []).find((b) =>
      b?.rubrica_id === rubricaId ||
      b?.rubricaId === rubricaId ||
      b?.rubrica_ref_id === rubricaId ||
      b?.id === rubricaId
    );

    if (byRubricaId?.id) return byRubricaId.id;

    if (rubricaNome) {
      const byName = (budgetLines || []).find((b) => {
        const nomes = [
          b?.rubrica_nome,
          b?.rubrica,
          b?.nome,
          b?.descricao,
          b?.item,
          b?.titulo,
        ].map(normalizeText);

        return nomes.some((nome) =>
          nome &&
          (nome === rubricaNome ||
            nome.includes(rubricaNome) ||
            rubricaNome.includes(nome))
        );
      });

      if (byName?.id) return byName.id;
    }

    const byCentro = (budgetLines || []).find((b) =>
      sameCentroOrGlobal(b?.centro_custo, form.centro_custo)
    );

    if (byCentro?.id) return byCentro.id;

    return '';
  }, [
    budgetLines,
    form.budgetline_id,
    form.rubrica_id,
    form.rubrica_nome,
    form.centro_custo,
    selectedRubrica,
  ]);

  useEffect(() => {
    if (!resolvedBudgetLineId) return;

    setForm((prev) => {
      if (prev.budgetline_id === resolvedBudgetLineId) return prev;
      return { ...prev, budgetline_id: resolvedBudgetLineId };
    });
  }, [resolvedBudgetLineId]);

  const validateFinanceiro = () => {
    if (!form.centro_custo) return 'Selecione o centro de custo.';
    if (!form.rubrica_id && !form.rubrica_nome) return 'Selecione a rubrica.';
    if (!selectedRubrica) return 'Rubrica inválida.';
    if (!resolvedBudgetLineId) return 'Linha orçamentária obrigatória não localizada para esta rubrica.';

    const rubricaCentro = getRubricaCentroCusto(selectedRubrica);

    if (!sameCentroOrGlobal(rubricaCentro, form.centro_custo)) {
      return `Rubrica incompatível com centro ${form.centro_custo}`;
    }

    return null;
  };

  const handleSave = async () => {
    const erro = validateFinanceiro();

    if (erro) {
      toastMessages.validationError(erro);
      return;
    }

    setSaving(true);

    try {
      const rubricaNome = getRubricaNome(selectedRubrica) || form.rubrica_nome;

      const payload = {
        ...form,
        rubrica_id: selectedRubrica?.id || form.rubrica_id,
        rubrica_nome: rubricaNome,
        budgetline_id: resolvedBudgetLineId,
        valor_solicitado: toNumber(form.valor_solicitado),
        valor_total: toNumber(form.valor_solicitado),
        valor: toNumber(form.valor_solicitado),
        created_by: form.created_by || currentUser?.email,
      };

      if (prefill?.id) {
        await base44.entities.PurchaseRequest.update(prefill.id, payload);
      } else {
        await base44.entities.PurchaseRequest.create(payload);
      }

      toastMessages.createSuccess();
      onSuccess();
    } catch (e) {
      toastMessages.saveFailed(e?.message);
    }

    setSaving(false);
  };

  const financeiroError = validateFinanceiro();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl">

        <div className="p-4 border-b flex justify-between">
          <h2>{prefill?.id ? 'Editar compra' : 'Nova compra'}</h2>
          <Button variant="ghost" onClick={onClose}><X /></Button>
        </div>

        <div className="p-4 space-y-4">

          <Textarea
            placeholder="Descrição do item"
            value={form.descricao_item}
            onChange={(e) => setForm({ ...form, descricao_item: e.target.value })}
          />

          <Input
            placeholder="Fornecedor"
            value={form.fornecedor_nome}
            onChange={(e) => setForm({ ...form, fornecedor_nome: e.target.value })}
          />

          <Input
            placeholder="CNPJ"
            value={form.fornecedor_cnpj}
            onChange={(e) => setForm({ ...form, fornecedor_cnpj: e.target.value })}
          />

          <Select
            value={form.centro_custo}
            onValueChange={(v) => setForm({ ...form, centro_custo: v, rubrica_id: '', rubrica_nome: '', budgetline_id: '' })}
          >
            <SelectTrigger><SelectValue placeholder="Centro de custo" /></SelectTrigger>
            <SelectContent>
              {CENTROS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={form.rubrica_id || ''}
            onValueChange={(v) => {
              const rubrica = rubricasAtivas.find((r) => r.id === v);

              setForm({
                ...form,
                rubrica_id: v,
                rubrica_nome: getRubricaNome(rubrica),
                budgetline_id: '',
              });
            }}
            disabled={!form.centro_custo}
          >
            <SelectTrigger><SelectValue placeholder="Rubrica" /></SelectTrigger>
            <SelectContent>
              {filteredRubricas.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {r.rubrica || r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            placeholder="Valor"
            value={form.valor_solicitado}
            onChange={(e) => setForm({ ...form, valor_solicitado: e.target.value })}
          />

          <Textarea
            placeholder="Observações"
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />

          {financeiroError && (
            <div className="text-xs text-red-600">{financeiroError}</div>
          )}

        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !!financeiroError}>
            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : 'Salvar'}
          </Button>
        </div>

      </div>
    </div>
  );
}
