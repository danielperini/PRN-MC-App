// 🔴 ARQUIVO COMPLETO CORRIGIDO

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FilterMultiSelect from '@/components/ui/filter-multi-select';
import FilterMultiSelectAdvanced from '@/components/ui/filter-multi-select-advanced';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

// 🔥 NOVO: dedupe robusto
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
  museus = [],
  tiposAcao = [],
  canEdit = true,
  teamOptions = [],
  metaOptions = [],
  programacaoOptions = [],
}) {

  // 🔥 CORREÇÃO PRINCIPAL: lista TODOS os membros + selecionados
  const equipeOptions = dedupeOptions(teamOptions);
  const rawEquipeIds = normalizeArray(atividade?.equipe_participante_ids);

  // Garante que TODOS aparecem: opções base + selecionados que não estão na base
  const equipeSelecionada = [
    ...equipeOptions,
    ...rawEquipeIds
      .filter(id => !equipeOptions.some(opt => opt.id === id))
      .map(id => ({ id, label: id })) // fallback com o ID como label
  ];

  const equipeSelecionadaLabels = Array.from(new Set(
    equipeSelecionada
      .filter(opt => rawEquipeIds.includes(opt.id))
      .map(opt => opt.label)
  ));

  function handleEquipeChange(selectedLabels) {
    if (!Array.isArray(selectedLabels)) {
      onChange('equipe_participante_ids', []);
      onChange('equipe_participante_nomes', '');
      return;
    }

    // 🔥 remove duplicados
    const uniqueLabels = Array.from(new Set(selectedLabels));

    const selecionados = equipeOptions.filter(opt =>
      uniqueLabels.includes(opt.label)
    );

    const ids = Array.from(new Set(selecionados.map(s => s.id)));
    const nomes = Array.from(new Set(selecionados.map(s => s.label)));

    onChange('equipe_participante_ids', ids);
    onChange('equipe_participante_nomes', nomes.join(', '));
  }

  const ocorrencias = safeNumber(atividade?.quantidade_ocorrencias, 0);
  const publicoEstimado = safeNumber(atividade?.publico_estimado, 0);
  const produtosGerados = safeNumber(atividade?.quantidade_produtos_gerados, 0);

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

      {/* 🔥 CAMPO CORRIGIDO: lista TODOS + nunca perde seleção */}
       <Field label="Membros da equipe participantes">
         <FilterMultiSelectAdvanced
           options={equipeSelecionada}
           values={equipeSelecionadaLabels}
           onChange={handleEquipeChange}
           disabled={!canEdit}
         />
       </Field>

      <div className="grid md:grid-cols-3 gap-4">

        <Field label="Quantas vezes ocorreu?">
          <Input
            type="number"
            value={toInputValue(atividade?.quantidade_ocorrencias)}
            onChange={(e) => onChange('quantidade_ocorrencias', Number(e.target.value))}
          />
        </Field>

        <Field label="Público estimado">
          <Input
            type="number"
            value={toInputValue(atividade?.publico_estimado)}
            onChange={(e) => onChange('publico_estimado', Number(e.target.value))}
          />
        </Field>

        <Field label="Público total">
          <Input value={publicoEstimado * ocorrencias} readOnly />
        </Field>

      </div>

      <div className="grid md:grid-cols-2 gap-4">

        <Field label="Produtos gerados">
          <Input
            type="number"
            value={toInputValue(atividade?.quantidade_produtos_gerados)}
            onChange={(e) => onChange('quantidade_produtos_gerados', Number(e.target.value))}
          />
        </Field>

        <Field label="Total produtos">
          <Input value={produtosGerados * ocorrencias} readOnly />
        </Field>

      </div>
    </>
  );
}