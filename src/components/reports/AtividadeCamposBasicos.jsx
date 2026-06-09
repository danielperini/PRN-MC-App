import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FilterMultiSelectAdvanced from '@/components/ui/filter-multi-select-advanced';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const METAS_FALLBACK = [
  { id: 'Meta 05 - Atividades educativas e culturais', label: 'Meta 05 - Atividades educativas e culturais' },
  { id: 'Metas 10/12 - Mostras e exposições', label: 'Metas 10/12 - Mostras e exposições' },
  { id: 'Meta 14 - Acessibilidade', label: 'Meta 14 - Acessibilidade' },
  { id: 'Meta de comunicação institucional', label: 'Meta de comunicação institucional' },
  { id: 'Rotina', label: 'Rotina' },
  { id: 'Extra', label: 'Extra' },
];

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      {children}
    </div>
  );
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    if (!value) return [];
    return String(value).split(',').map(i => i.trim()).filter(Boolean);
  }
  return Array.from(new Set(value.filter(Boolean)));
}

function toInputValue(value, fallback = '') {
  return value === null || value === undefined ? fallback : value;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dedupeOptions(options = []) {
  const map = new Map();

  for (const item of options || []) {
    const id = String(item.id || '').trim();
    const label = String(item.label || '').trim();
    if (!id || !label) continue;

    const key = `${id}::${label.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, { id, label });
    }
  }

  return Array.from(map.values());
}

export default function AtividadeCamposBasicos({
  atividade,
  onChange,
  canEdit = true,
  teamOptions = [],
  metaOptions = [],
}) {
  const metasDisponiveis = metaOptions.length > 0 ? metaOptions : METAS_FALLBACK;

  function handleMetaChange(value) {
    const meta = metasDisponiveis.find((m) => m.id === value);
    onChange('meta_id', value);
    onChange('meta_codigo', meta?.label || meta?.nome || value);
    if (value && value !== 'Rotina' && value !== 'Extra') {
      onChange('classificacao', 'META');
    }
  }

  function handleDataInicioChange(value) {
    onChange('data_inicio', value);
    if (atividade?.data_fim && value && atividade.data_fim < value) {
      onChange('data_fim', value);
    }
  }

  const equipeOptions = dedupeOptions(teamOptions);
  const rawEquipeIds = normalizeArray(atividade?.equipe_participante_ids);

  const equipeSelecionada = [
    ...equipeOptions,
    ...rawEquipeIds
      .filter(id => !equipeOptions.some(opt => opt.id === id))
      .map(id => ({ id, label: id }))
  ];

  const equipeSelecionadaLabels = Array.from(new Set(
    equipeSelecionada
      .filter(opt => rawEquipeIds.includes(opt.id))
      .map(opt => opt.label)
  ));

  function handleEquipeChange(selectedLabels) {
    if (!Array.isArray(selectedLabels)) {
      onChange('equipe_participante_ids', []);
      return;
    }

    const selecionados = equipeOptions.filter(opt =>
      selectedLabels.includes(opt.label)
    );

    const ids = Array.from(new Set(selecionados.map(s => s.id)));

    onChange('equipe_participante_ids', ids);
  }

  const publicoTotal = safeNumber(atividade?.publico_total, 0);
  const produtosTotal = safeNumber(atividade?.total_produtos, 0);

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Nome da atividade *">
          <Input
            value={toInputValue(atividade?.nome)}
            onChange={(e) => onChange('nome', e.target.value)}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <Field label="Descrição">
        <Textarea
          value={toInputValue(atividade?.descricao)}
          onChange={(e) => onChange('descricao', e.target.value)}
          disabled={!canEdit}
        />
      </Field>

      <Field label="Membros da equipe participantes">
        <FilterMultiSelectAdvanced
          options={equipeSelecionada}
          values={equipeSelecionadaLabels}
          onChange={handleEquipeChange}
          disabled={!canEdit}
        />
      </Field>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Data de início">
          <Input
            type="date"
            value={toInputValue(atividade?.data_inicio)}
            onChange={(e) => handleDataInicioChange(e.target.value)}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Data de fim">
          <Input
            type="date"
            value={toInputValue(atividade?.data_fim)}
            min={atividade?.data_inicio || undefined}
            onChange={(e) => onChange('data_fim', e.target.value)}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <Field label="Meta vinculada">
        <Select
          value={toInputValue(atividade?.meta_id)}
          onValueChange={handleMetaChange}
          disabled={!canEdit}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione a meta do projeto..." />
          </SelectTrigger>
          <SelectContent>
            {metasDisponiveis.map((meta) => (
              <SelectItem key={meta.id} value={meta.id}>
                {meta.label || meta.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid md:grid-cols-2 gap-4">

        <Field label="Público total">
          <Input
            type="number"
            value={toInputValue(publicoTotal)}
            onChange={(e) => onChange('publico_total', Number(e.target.value))}
          />
        </Field>

        <Field label="Total produtos">
          <Input
            type="number"
            value={toInputValue(produtosTotal)}
            onChange={(e) => onChange('total_produtos', Number(e.target.value))}
          />
        </Field>

      </div>
    </>
  );
}