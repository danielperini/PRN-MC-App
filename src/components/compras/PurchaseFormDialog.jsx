import React, { useMemo, useState } from 'react';
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

const CENTROS = ['MUMO', 'MIS', 'MHAB', 'Noturno nos Museus 2026', 'Publicações', 'Geral'];

const EMPTY = {
  descricao_item: '',
  centro_custo: '',
  rubrica_id: '',
  valor_solicitado: '',
  fornecedor_nome: '',
  fornecedor_cnpj: '',
  observacoes: '',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeCentroCusto(value) {
  const raw = String(value || '').toLowerCase();

  if (!raw) return '';
  if (raw.includes('mis')) return 'MIS';
  if (raw.includes('mhab')) return 'MHAB';
  if (raw.includes('mumo')) return 'MUMO';
  if (raw.includes('noturno')) return 'NOTURNO NOS MUSEUS 2026';
  if (raw.includes('publica')) return 'PUBLICAÇÕES';
  if (raw.includes('geral') || raw.includes('global')) return 'GLOBAL';

  return String(value || '').toUpperCase();
}

function sameCentroOrGlobal(entityCentro, selectedCentro) {
  const entity = normalizeCentroCusto(entityCentro);
  const selected = normalizeCentroCusto(selectedCentro);

  if (!selected) return true;
  if (!entity) return true;
  if (entity === 'GLOBAL') return true;

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

function getRubricaTitulo(rubrica) {
  return rubrica?.rubrica || rubrica?.nome || 'Sem nome';
}

function getRubricaGrupo(rubrica) {
  return rubrica?.grupo || 'Sem grupo';
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

  const [form, setForm] = useState(() =>
    prefill ? { ...EMPTY, ...prefill } : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const rubricasAtivas = useMemo(() => {
    return (rubricas || []).filter((r) => r?.ativo !== false);
  }, [rubricas]);

  const rubricasProcessadas = useMemo(() => {
    return rubricasAtivas.map((r) => {
      const valor = toNumber(r?.valor_rubrica || r?.valor_total || r?.valor);
      const utilizado = toNumber(r?.valor_utilizado || r?.utilizado);
      const comprometido = toNumber(r?.saldo_comprometido || r?.valor_comprometido || r?.comprometido);
      const saldo = valor - utilizado - comprometido;
      const perc = valor > 0 ? ((utilizado + comprometido) / valor) * 100 : 0;
      const centroMatch = sameCentroOrGlobal(getRubricaCentroCusto(r), form.centro_custo);

      return {
        ...r,
        valor,
        utilizado,
        comprometido,
        saldo,
        perc,
        centroMatch,
      };
    });
  }, [rubricasAtivas, form.centro_custo]);

  const filteredRubricas = useMemo(() => {
    const termo = String(search || '').trim().toLowerCase();

    return rubricasProcessadas
      .filter((r) => {
        if (!termo) return true;

        const texto = [
          getRubricaGrupo(r),
          getRubricaTitulo(r),
          r?.centro_custo,
          r?.museu,
          r?.unidade,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return texto.includes(termo);
      })
      .sort((a, b) => {
        if (a.centroMatch && !b.centroMatch) return -1;
        if (!a.centroMatch && b.centroMatch) return 1;

        const grupoA = getRubricaGrupo(a).localeCompare(getRubricaGrupo(b), 'pt-BR');
        if (grupoA !== 0) return grupoA;

        return getRubricaTitulo(a).localeCompare(getRubricaTitulo(b), 'pt-BR');
      });
  }, [rubricasProcessadas, search]);

  const selectedRubrica = useMemo(() => {
    return rubricasProcessadas.find((r) => r.id === form.rubrica_id) || null;
  }, [rubricasProcessadas, form.rubrica_id]);

  const validateFinanceiro = () => {
    if (!form.centro_custo) return 'Selecione o centro de custo.';
    if (!form.rubrica_id) return 'Selecione a rubrica.';
    if (!selectedRubrica) return 'Rubrica inválida.';

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
      const payload = {
        ...form,
        valor_solicitado: toNumber(form.valor_solicitado),
        created_by: currentUser?.email,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white">
        <div className="flex justify-between border-b p-4">
          <h2>{prefill?.id ? 'Editar compra' : 'Nova compra'}</h2>
          <Button variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="space-y-4 p-4">
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
            onValueChange={(v) => setForm({ ...form, centro_custo: v, rubrica_id: '' })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Centro de custo" />
            </SelectTrigger>
            <SelectContent>
              {CENTROS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-2">
            <Input
              placeholder="Buscar rubrica..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Select
              value={form.rubrica_id || ''}
              onValueChange={(v) => setForm({ ...form, rubrica_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Rubrica" />
              </SelectTrigger>
              <SelectContent>
                {filteredRubricas.length > 0 ? (
                  filteredRubricas.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {`${getRubricaGrupo(r)} | ${getRubricaTitulo(r)} | Saldo R$ ${moeda(r.saldo)}`}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__sem_resultado__" disabled>
                    Nenhuma rubrica encontrada
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            {selectedRubrica && (
              <div className="rounded border bg-gray-50 p-2 text-xs text-gray-700">
                <div>
                  <strong>Grupo:</strong> {getRubricaGrupo(selectedRubrica)}
                </div>
                <div>
                  <strong>Rubrica:</strong> {getRubricaTitulo(selectedRubrica)}
                </div>
                <div>
                  <strong>Valor:</strong> R$ {moeda(selectedRubrica.valor)}
                </div>
                <div>
                  <strong>Utilizado:</strong> R$ {moeda(selectedRubrica.utilizado)}
                </div>
                <div>
                  <strong>Comprometido:</strong> R$ {moeda(selectedRubrica.comprometido)}
                </div>
                <div>
                  <strong>Saldo real:</strong> R$ {moeda(selectedRubrica.saldo)}
                </div>
              </div>
            )}
          </div>

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

        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !!financeiroError}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
