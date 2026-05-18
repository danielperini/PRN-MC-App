import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { RUBRICA_SPECIAL_TYPES, RUBRICA_STATUS, calculateRubricaBalance, isCreditRubrica, toMoneyNumber } from '@/utils/finance/exceptionalRubricas';

const GRUPOS = [
  'Equipe e gestão',
  'Manutenção e operação',
  'Despesas gerais',
  'Rubricas Extraordinárias',
  'Créditos do Projeto',
  'Reposições Financeiras',
  'Ajustes Operacionais',
];

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'NOTURNO', 'Publicações', 'Geral'];

const TIPOS = [
  { value: RUBRICA_SPECIAL_TYPES.NORMAL, label: 'Rubrica normal' },
  { value: RUBRICA_SPECIAL_TYPES.EXCEPCIONAL, label: 'Rubrica excepcional' },
  { value: RUBRICA_SPECIAL_TYPES.CREDITO_PROJETO, label: 'Crédito do projeto' },
  { value: RUBRICA_SPECIAL_TYPES.REPOSICAO_FINANCEIRA, label: 'Reposição financeira' },
  { value: RUBRICA_SPECIAL_TYPES.AJUSTE_FINANCEIRO, label: 'Ajuste financeiro' },
  { value: RUBRICA_SPECIAL_TYPES.AJUDA_CUSTO, label: 'Ajuda de custo' },
  { value: RUBRICA_SPECIAL_TYPES.CORRECAO, label: 'Correção' },
  { value: RUBRICA_SPECIAL_TYPES.DEVOLUCAO, label: 'Devolução' },
  { value: RUBRICA_SPECIAL_TYPES.COMPENSACAO, label: 'Compensação' },
];

const EMPTY = {
  nome_rubrica: '',
  descricao: '',
  codigo_interno: '',
  observacoes: '',
  grupo: 'Rubricas Extraordinárias',
  categoria: '',
  tipo_especial: RUBRICA_SPECIAL_TYPES.NORMAL,
  subtipo: '',
  centro_custo: 'Geral',
  museu: '',
  natureza: '',
  meta_id: '',
  meta_nome: '',
  atividade_vinculada: '',
  relatorio_vinculado: '',
  valor_total: '',
  valor_utilizado: '0',
  valor_creditado: '',
  valor_reposto: '',
  status_rubrica: RUBRICA_STATUS.ATIVA,
  motivo_criacao: '',
  motivo_ajuste: '',
  origem: 'manual',
};

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-700 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
      >
        {options.map((option) => (
          <option key={option.value || option} value={option.value || option}>
            {option.label || option}
          </option>
        ))}
      </select>
    </div>
  );
}

async function logRubricaAudit(payload) {
  try {
    if (base44.entities.RubricaAuditLog?.create) {
      await base44.entities.RubricaAuditLog.create(payload);
      return;
    }
    await base44.entities.AuditLog?.create?.({
      action: payload.acao,
      entity_type: 'Rubrica',
      entity_id: payload.rubrica_id,
      actor_email: payload.responsavel_email,
      actor_name: payload.responsavel_nome,
      details: payload.justificativa || payload.motivo || '',
      metadata: payload,
    });
  } catch (error) {
    console.warn('Auditoria de rubrica não registrada:', error);
  }
}

export default function NovaRubricaDialog({ open, onClose, rubrica = null, currentUser = null }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!rubrica?.id;

  useEffect(() => {
    if (!rubrica) {
      setForm(EMPTY);
      return;
    }
    setForm({
      ...EMPTY,
      nome_rubrica: rubrica.nome_rubrica || rubrica.rubrica || rubrica.nome || '',
      descricao: rubrica.descricao || '',
      codigo_interno: rubrica.codigo_interno || rubrica.codigo || '',
      observacoes: rubrica.observacoes || rubrica.observacao_uso || '',
      grupo: rubrica.grupo || EMPTY.grupo,
      categoria: rubrica.categoria || '',
      tipo_especial: rubrica.tipo_especial || rubrica.tipo || RUBRICA_SPECIAL_TYPES.NORMAL,
      subtipo: rubrica.subtipo || '',
      centro_custo: rubrica.centro_custo || rubrica.museu || EMPTY.centro_custo,
      museu: rubrica.museu || '',
      natureza: rubrica.natureza || '',
      meta_id: rubrica.meta_id || rubrica.meta || '',
      meta_nome: rubrica.meta_nome || '',
      atividade_vinculada: rubrica.atividade_vinculada || '',
      relatorio_vinculado: rubrica.relatorio_vinculado || '',
      valor_total: String(rubrica.valor_total ?? rubrica.valor_rubrica ?? ''),
      valor_utilizado: String(rubrica.valor_utilizado ?? 0),
      valor_creditado: String(rubrica.valor_creditado ?? ''),
      valor_reposto: String(rubrica.valor_reposto ?? ''),
      status_rubrica: rubrica.status_rubrica || (rubrica.ativo === false ? RUBRICA_STATUS.INATIVA : RUBRICA_STATUS.ATIVA),
      motivo_criacao: rubrica.motivo_criacao || '',
      motivo_ajuste: '',
      origem: rubrica.origem || 'manual',
    });
  }, [rubrica]);

  if (!open) return null;

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (!form.nome_rubrica.trim()) {
      toast.error('Informe o nome da rubrica.');
      return;
    }

    if (!form.grupo.trim()) {
      toast.error('Informe o grupo.');
      return;
    }

    if (!isEdit && !form.motivo_criacao.trim()) {
      toast.error('Informe o motivo da criação para auditoria.');
      return;
    }

    const total = toMoneyNumber(form.valor_total);
    const utilizado = toMoneyNumber(form.valor_utilizado);
    const creditado = toMoneyNumber(form.valor_creditado);
    const reposto = toMoneyNumber(form.valor_reposto);

    if (total < 0 || utilizado < 0 || creditado < 0 || reposto < 0) {
      toast.error('Valores financeiros não podem ser negativos.');
      return;
    }

    const draft = {
      tipo_especial: form.tipo_especial,
      valor_total: total,
      valor_rubrica: total,
      valor_utilizado: utilizado,
      valor_creditado: creditado,
      valor_reposto: reposto,
    };
    const balance = calculateRubricaBalance(draft);
    const credit = isCreditRubrica(draft) ? Math.max(creditado, reposto, total) : creditado;

    const payload = {
      rubrica: form.nome_rubrica.trim(),
      nome_rubrica: form.nome_rubrica.trim(),
      nome: form.nome_rubrica.trim(),
      descricao: form.descricao,
      codigo_interno: form.codigo_interno,
      codigo: form.codigo_interno,
      observacoes: form.observacoes,
      observacao_uso: form.observacoes || form.descricao,
      grupo: form.grupo,
      categoria: form.categoria,
      tipo: form.tipo_especial,
      tipo_especial: form.tipo_especial,
      subtipo: form.subtipo,
      centro_custo: form.centro_custo,
      museu: form.museu || form.centro_custo,
      natureza: form.natureza,
      meta_id: form.meta_id || '',
      meta: form.meta_id || form.meta_nome || '',
      meta_nome: form.meta_nome || '',
      sem_meta: !form.meta_id && !form.meta_nome,
      meta_opcional: true,
      atividade_vinculada: form.atividade_vinculada,
      relatorio_vinculado: form.relatorio_vinculado,
      valor_total: total,
      valor_rubrica: total,
      valor_utilizado: utilizado,
      valor_creditado: credit,
      valor_reposto: reposto,
      saldo: balance.saldo,
      saldo_real: balance.saldo,
      percentual_utilizado: balance.percentual,
      status_rubrica: form.status_rubrica,
      ativo: ![RUBRICA_STATUS.INATIVA, RUBRICA_STATUS.ARQUIVADA].includes(form.status_rubrica),
      temporaria: form.status_rubrica === RUBRICA_STATUS.TEMPORARIA,
      excepcional: form.status_rubrica === RUBRICA_STATUS.EXCEPCIONAL || form.tipo_especial !== RUBRICA_SPECIAL_TYPES.NORMAL,
      motivo_criacao: form.motivo_criacao,
      motivo_ajuste: form.motivo_ajuste,
      responsavel_email: currentUser?.email || '',
      responsavel_nome: currentUser?.full_name || currentUser?.name || currentUser?.email || '',
      data_ultima_alteracao: new Date().toISOString(),
      origem: form.origem || 'manual',
      ordem_exibicao: rubrica?.ordem_exibicao || 999,
    };

    setSaving(true);
    try {
      const saved = isEdit
        ? await base44.entities.Rubrica.update(rubrica.id, payload)
        : await base44.entities.Rubrica.create({
            ...payload,
            data_criacao_manual: new Date().toISOString(),
          });

      await logRubricaAudit({
        rubrica_id: rubrica?.id || saved?.id,
        acao: isEdit ? 'RUBRICA_EDITADA' : 'RUBRICA_CRIADA',
        tipo_especial: payload.tipo_especial,
        valor_total: payload.valor_total,
        valor_utilizado: payload.valor_utilizado,
        valor_creditado: payload.valor_creditado,
        valor_reposto: payload.valor_reposto,
        saldo: payload.saldo,
        responsavel_email: currentUser?.email || '',
        responsavel_nome: currentUser?.full_name || currentUser?.email || '',
        data: new Date().toISOString(),
        justificativa: form.motivo_ajuste || form.motivo_criacao,
        motivo: form.motivo_ajuste || form.motivo_criacao,
        origem: payload.origem,
      });

      toast.success(isEdit ? 'Rubrica atualizada.' : 'Rubrica criada.');
      onClose?.(saved);
    } catch (error) {
      toast.error(`Erro ao salvar rubrica: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-black">{isEdit ? 'Editar Rubrica' : 'Nova Rubrica'}</h2>
            <p className="text-xs text-gray-500">Meta opcional, rubricas extraordinárias, créditos e reposições.</p>
          </div>
          <button onClick={() => onClose?.()} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-black mb-3">Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Nome da rubrica *</label>
                <Input value={form.nome_rubrica} onChange={(event) => set('nome_rubrica', event.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Código interno</label>
                <Input value={form.codigo_interno} onChange={(event) => set('codigo_interno', event.target.value)} />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Descrição</label>
                <Textarea rows={2} value={form.descricao} onChange={(event) => set('descricao', event.target.value)} />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-black mb-3">Classificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <SelectField label="Tipo especial" value={form.tipo_especial} onChange={(value) => set('tipo_especial', value)} options={TIPOS} />
              <SelectField label="Grupo" value={form.grupo} onChange={(value) => set('grupo', value)} options={GRUPOS} />
              <SelectField label="Centro de custo" value={form.centro_custo} onChange={(value) => set('centro_custo', value)} options={CENTROS} />
              <SelectField label="Status" value={form.status_rubrica} onChange={(value) => set('status_rubrica', value)} options={Object.values(RUBRICA_STATUS)} />
              <Input placeholder="Categoria" value={form.categoria} onChange={(event) => set('categoria', event.target.value)} />
              <Input placeholder="Subtipo" value={form.subtipo} onChange={(event) => set('subtipo', event.target.value)} />
              <Input placeholder="Museu" value={form.museu} onChange={(event) => set('museu', event.target.value)} />
              <Input placeholder="Natureza" value={form.natureza} onChange={(event) => set('natureza', event.target.value)} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-black mb-3">Vínculos opcionais</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input placeholder="Meta ID opcional" value={form.meta_id} onChange={(event) => set('meta_id', event.target.value)} />
              <Input placeholder="Meta nome opcional" value={form.meta_nome} onChange={(event) => set('meta_nome', event.target.value)} />
              <Input placeholder="Atividade vinculada" value={form.atividade_vinculada} onChange={(event) => set('atividade_vinculada', event.target.value)} />
              <Input placeholder="Relatório vinculado" value={form.relatorio_vinculado} onChange={(event) => set('relatorio_vinculado', event.target.value)} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-black mb-3">Financeiro</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Input placeholder="Valor total" value={form.valor_total} onChange={(event) => set('valor_total', event.target.value)} />
              <Input placeholder="Valor utilizado" value={form.valor_utilizado} onChange={(event) => set('valor_utilizado', event.target.value)} />
              <Input placeholder="Valor creditado" value={form.valor_creditado} onChange={(event) => set('valor_creditado', event.target.value)} />
              <Input placeholder="Valor reposto" value={form.valor_reposto} onChange={(event) => set('valor_reposto', event.target.value)} />
              <Input placeholder="Origem" value={form.origem} onChange={(event) => set('origem', event.target.value)} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-black mb-3">Auditoria</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Textarea rows={2} placeholder="Motivo da criação *" value={form.motivo_criacao} onChange={(event) => set('motivo_criacao', event.target.value)} />
              <Textarea rows={2} placeholder="Motivo do ajuste" value={form.motivo_ajuste} onChange={(event) => set('motivo_ajuste', event.target.value)} />
              <div className="md:col-span-2">
                <Textarea rows={2} placeholder="Observações" value={form.observacoes} onChange={(event) => set('observacoes', event.target.value)} />
              </div>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onClose?.()}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-black hover:bg-gray-800 text-white">
            {saving ? 'Salvando...' : isEdit ? 'Atualizar Rubrica' : 'Criar Rubrica'}
          </Button>
        </div>
      </div>
    </div>
  );
}
