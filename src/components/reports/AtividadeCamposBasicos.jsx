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

// Fallback com metas do 3º e 4º Aditivo (alinhado com METAS_OFICIAIS em metaFinancialMetrics.js)
const METAS_FALLBACK = [
  { id: '1 - Equipe principal', label: '1 - Equipe principal' },
  { id: '2 - Plano de comunicação', label: '2 - Plano de comunicação' },
  { id: '3 - Manutenção das exposições', label: '3 - Manutenção das exposições' },
  { id: '4 - Alteração de núcleos e salas expositivas', label: '4 - Alteração de núcleos e salas expositivas' },
  { id: '7 - Contratação de educadores', label: '7 - Contratação de educadores' },
  { id: '8 - Exposição e evento MHAB', label: '8 - Exposição e evento MHAB' },
  { id: '9 - Exposição e evento MIS', label: '9 - Exposição e evento MIS' },
  { id: '10 - Mostras de baixa/média complexidade (18 mostras)', label: '10 - Mostras de baixa/média complexidade (18 mostras)' },
  { id: '11 - Noturno nos Museus (edições 2024, 2025 e 2026)', label: '11 - Noturno nos Museus (edições 2024, 2025 e 2026)' },
  { id: '11B - Noturno Pampulha (4º Aditivo)', label: '11B - Noturno Pampulha (4º Aditivo)' },
  { id: '12 - Exposição MHAB (pesquisa e curadoria)', label: '12 - Exposição MHAB (pesquisa e curadoria)' },
  { id: '13 - Exposição MUMO (pesquisa e curadoria)', label: '13 - Exposição MUMO (pesquisa e curadoria)' },
  { id: '14 - Acessibilidade', label: '14 - Acessibilidade' },
  { id: '15 - Inscrição em Leis de Incentivo', label: '15 - Inscrição em Leis de Incentivo' },
  { id: '16 - Diárias de educadores (101 diárias)', label: '16 - Diárias de educadores (101 diárias)' },
  { id: '17 - Publicações e catálogos', label: '17 - Publicações e catálogos' },
  { id: '18 - Custeio das atividades educativas e culturais', label: '18 - Custeio das atividades educativas e culturais' },
  { id: '20 - Ações educativas e culturais — MHAB, MIS e MUMO (30 ações)', label: '20 - Ações educativas e culturais — MHAB, MIS e MUMO (30 ações)' },
  { id: '21 - Exposição e evento MUMO', label: '21 - Exposição e evento MUMO' },
  { id: '22 - Consultoria para execução do projeto', label: '22 - Consultoria para execução do projeto' },
  { id: '23 - Despesas Gerais', label: '23 - Despesas Gerais' },
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