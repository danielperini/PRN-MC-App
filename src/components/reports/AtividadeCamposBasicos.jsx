import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FilterMultiSelectAdvanced from '@/components/ui/filter-multi-select-advanced';

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
  teamOptions = []
}) {

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

      {/* 🔥 AGORA SIM: sem multiplicador */}
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
