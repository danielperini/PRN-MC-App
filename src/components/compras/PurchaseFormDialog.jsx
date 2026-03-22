import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
imporimport React, { useMemo, useState } from 'react';
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
import { toast } from 'sonner';
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

function normalizeCentroCusto(value) {
  const raw = String(value || '').toLowerCase();

  if (!raw) return '';
  if (raw.includes('mis')) return 'MIS';
  if (raw.includes('mhab')) return 'MHAB';
  if (raw.includes('mumo')) return 'MUMO';
  if (raw.includes('noturno')) return 'NOTURNO NOS MUSEUS 2026';
  if (raw.includes('publica')) return 'PUBLICAÇÕES';
  if (raw.includes('geral')) return 'GLOBAL';

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

  const rubricasAtivas = useMemo(() => {
    return (rubricas || []).filter((r) => r?.ativo !== false);
  }, [rubricas]);

  const filteredRubricas = useMemo(() => {
    return rubricasAtivas.filter((r) =>
      sameCentroOrGlobal(getRubricaCentroCusto(r), form.centro_custo)
    );
  }, [rubricasAtivas, form.centro_custo]);

  const selectedRubrica = useMemo(() => {
    return rubricasAtivas.find((r) => r.id === form.rubrica_id) || null;
  }, [rubricasAtivas, form.rubrica_id]);

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
      toast.error(erro);
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

      toast.success('Compra salva com sucesso');
      onSuccess();

    } catch (e) {
      toast.error(e.message);
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
            onValueChange={(v) => setForm({ ...form, centro_custo: v, rubrica_id: '' })}
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
            onValueChange={(v) => setForm({ ...form, rubrica_id: v })}
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
}t { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Loader2,
  Sparkles,
  Link as LinkIcon,
  X,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import PurchaseDocumentUpload from './PurchaseDocumentUpload';
import { METAS_3_ADITIVO } from '@/components/planoTrabalho';
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
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
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

  if (raw === 'geral' || raw === 'global' || raw.includes('todos')) return 'GLOBAL';

  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';

  if (raw.includes('noturno')) return 'NOTURNO NOS MUSEUS 2026';
  if (raw.includes('publica')) return 'PUBLICAÇÕES';

  return String(value || '').trim().toUpperCase();
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
      rubrica?.museu_codigo ||
      rubrica?.unidade ||
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
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('-created_date', 999),
  });

  const [form, setForm] = useState(() =>
    prefill ? { ...EMPTY, ...prefill, budgetline_id: '' } : EMPTY
  );

  const [saving, setSaving] = useState(false);

  const rubricasAtivas = useMemo(() => {
    return (rubricas || []).filter((r) => r?.ativo !== false);
  }, [rubricas]);

  const filteredRubricas = useMemo(() => {
    return rubricasAtivas.filter((r) =>
      sameCentroOrGlobal(getRubricaCentroCusto(r), form.centro_custo)
    );
  }, [rubricasAtivas, form.centro_custo]);

  const selectedRubrica = useMemo(() => {
    return rubricasAtivas.find((r) => r.id === form.rubrica_id) || null;
  }, [rubricasAtivas, form.rubrica_id]);

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

  const handleSave = async (submeter = false) => {
    const financeiroError = validateFinanceiro();
    if (financeiroError) {
      toast.error(financeiroError);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...form,
        valor_solicitado: toNumber(form.valor_solicitado),
        valor_unitario: toNumber(form.valor_unitario),
        qtd: toNumber(form.qtd),
      };

      if (prefill?.id) {
        await base44.entities.PurchaseRequest.update(prefill.id, payload);
      } else {
        await base44.entities.PurchaseRequest.create(payload);
      }

      toast.success('Salvo com sucesso');
      onSuccess();

    } catch (e) {
      toast.error(e.message);
    }

    setSaving(false);
  };

  const financeiroError = validateFinanceiro();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl">

        <div className="p-4 border-b flex justify-between">
          <h2>{prefill?.id ? 'Editar' : 'Nova compra'}</h2>
          <Button variant="ghost" onClick={onClose}><X/></Button>
        </div>

        <div className="p-4 space-y-4">

          <Textarea
            placeholder="Descrição"
            value={form.descricao_item}
            onChange={(e)=>setForm({...form,descricao_item:e.target.value})}
          />

          <Select
            value={form.centro_custo}
            onValueChange={(v)=>setForm({...form,centro_custo:v,rubrica_id:''})}
          >
            <SelectTrigger><SelectValue placeholder="Centro"/></SelectTrigger>
            <SelectContent>
              {CENTROS.map(c=>(
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={form.rubrica_id || ''}
            onValueChange={(v)=>setForm({...form,rubrica_id:v})}
            disabled={!form.centro_custo}
          >
            <SelectTrigger><SelectValue placeholder="Rubrica"/></SelectTrigger>
            <SelectContent>
              {filteredRubricas.map(r=>(
                <SelectItem key={r.id} value={r.id}>
                  {r.rubrica || r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {financeiroError && (
            <div className="text-xs text-red-600">{financeiroError}</div>
          )}

          <Input
            type="number"
            value={form.valor_solicitado}
            onChange={(e)=>setForm({...form,valor_solicitado:e.target.value})}
          />

        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={()=>handleSave(true)} disabled={saving || !!financeiroError}>
            {saving ? <Loader2 className="animate-spin w-4 h-4"/> : 'Salvar'}
          </Button>
        </div>

      </div>
    </div>
  );
}
