import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

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
  if (!value) return 0;
  return Number(
    String(value)
      .replace('R$', '')
      .replace(/\./g, '')
      .replace(',', '.')
  ) || 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getRubricaNome(r) {
  return r?.rubrica || r?.nome || r?.descricao || '';
}

function normalizeForm(prefill) {
  if (!prefill) return EMPTY;

  return {
    ...EMPTY,
    ...prefill,

    descricao_item:
      prefill.descricao_item ||
      prefill.descricao_servico ||
      prefill.descricao ||
      '',

    fornecedor_nome:
      prefill.fornecedor_nome ||
      prefill.nf_emitente_nome ||
      prefill.razao_social ||
      '',

    fornecedor_cnpj:
      prefill.fornecedor_cnpj ||
      prefill.nf_emitente_cpf_cnpj ||
      prefill.cnpj ||
      '',

    valor_solicitado:
      prefill.valor_solicitado ??
      prefill.valor_total ??
      prefill.valor ??
      prefill.valor_nf ??
      '',

    rubrica_id:
      prefill.rubrica_id ||
      '',

    rubrica_nome:
      prefill.rubrica_nome ||
      '',

    budgetline_id:
      prefill.budgetline_id ||
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
    queryFn: () => base44.entities.Rubrica.list('-created_date', 3000),
  });

  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budgetLines'],
    queryFn: () => base44.entities.BudgetLine.list('', 3000),
  });

  const [form, setForm] = useState(() => normalizeForm(prefill));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(normalizeForm(prefill));
  }, [prefill]);

  // 🔥 resolve rubrica automaticamente
  const selectedRubrica = useMemo(() => {
    if (!form.rubrica_id && !form.rubrica_nome) return null;

    const byId = rubricas.find(r => r.id === form.rubrica_id);
    if (byId) return byId;

    const nome = normalizeText(form.rubrica_nome);

    return rubricas.find(r => {
      const rNome = normalizeText(getRubricaNome(r));
      return rNome.includes(nome) || nome.includes(rNome);
    }) || null;
  }, [form.rubrica_id, form.rubrica_nome, rubricas]);

  // 🔥 corrige rubrica automaticamente
  useEffect(() => {
    if (!selectedRubrica) return;

    setForm(prev => ({
      ...prev,
      rubrica_id: selectedRubrica.id,
      rubrica_nome: getRubricaNome(selectedRubrica),
    }));
  }, [selectedRubrica]);

  // 🔥 resolve budgetline automaticamente
  const resolvedBudgetLine = useMemo(() => {
    if (form.budgetline_id) return form.budgetline_id;

    const rubricaId = selectedRubrica?.id;

    const byRubrica = budgetLines.find(b =>
      b.rubrica_id === rubricaId ||
      b.rubricaId === rubricaId
    );

    if (byRubrica) return byRubrica.id;

    return budgetLines[0]?.id || '';
  }, [budgetLines, selectedRubrica, form.budgetline_id]);

  useEffect(() => {
    if (!resolvedBudgetLine) return;

    setForm(prev => ({
      ...prev,
      budgetline_id: resolvedBudgetLine
    }));
  }, [resolvedBudgetLine]);

  const handleSave = async () => {
    setSaving(true);

    try {
      const valor = toNumber(form.valor_solicitado);

      const payload = {
        ...form,
        rubrica_id: selectedRubrica?.id,
        rubrica_nome: getRubricaNome(selectedRubrica),
        budgetline_id: resolvedBudgetLine,
        valor_solicitado: valor,
        valor_total: valor,
        valor,
        created_by: currentUser?.email,
      };

      if (prefill?.id) {
        await base44.entities.PurchaseRequest.update(prefill.id, payload);
      } else {
        await base44.entities.PurchaseRequest.create(payload);
      }

      onSuccess?.();
      onClose?.();
    } catch (e) {
      console.error(e);
    }

    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl">

        <div className="p-4 border-b flex justify-between">
          <h2>{prefill?.id ? 'Editar compra' : 'Nova compra'}</h2>
          <Button variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="p-4 space-y-4">

          <Textarea
            value={form.descricao_item}
            onChange={(e) => setForm({ ...form, descricao_item: e.target.value })}
          />

          <Input
            value={form.fornecedor_nome}
            onChange={(e) => setForm({ ...form, fornecedor_nome: e.target.value })}
          />

          <Input
            value={form.fornecedor_cnpj}
            onChange={(e) => setForm({ ...form, fornecedor_cnpj: e.target.value })}
          />

          <Select
            value={form.centro_custo}
            onValueChange={(v) => setForm({ ...form, centro_custo: v })}
          >
            <SelectTrigger><SelectValue placeholder="Centro de custo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MUMO">MUMO</SelectItem>
              <SelectItem value="MIS">MIS</SelectItem>
              <SelectItem value="MHAB">MHAB</SelectItem>
              <SelectItem value="Geral">Geral</SelectItem>
            </SelectContent>
          </Select>

          {/* 🔥 TODAS AS RUBRICAS */}
          <Select
            value={form.rubrica_id || ''}
            onValueChange={(v) => {
              const r = rubricas.find(x => x.id === v);

              setForm({
                ...form,
                rubrica_id: v,
                rubrica_nome: getRubricaNome(r),
              });
            }}
          >
            <SelectTrigger><SelectValue placeholder="Rubrica" /></SelectTrigger>
            <SelectContent>
              {rubricas.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  {getRubricaNome(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            value={form.valor_solicitado}
            onChange={(e) => setForm({ ...form, valor_solicitado: e.target.value })}
          />

          <Textarea
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />

        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : 'Salvar'}
          </Button>
        </div>

      </div>
    </div>
  );
}
