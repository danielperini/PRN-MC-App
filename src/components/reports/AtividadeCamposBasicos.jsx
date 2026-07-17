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

// Fallback com apenas metas do 3º e 4º Aditivo (ordem 1-25)
const METAS_FALLBACK = [
  { id: '1 - Contratação da equipe principal', label: '1 - Contratação da equipe principal' },
  { id: '2 - Comunicação nacional', label: '2 - Comunicação nacional' },
  { id: '3 - Manutenção de exposições', label: '3 - Manutenção de exposições' },
  { id: '4 - Alteração núcleos MUMO e MIS', label: '4 - Alteração núcleos MUMO e MIS' },
  { id: '5 - 60 ações educativas', label: '5 - 60 ações educativas' },
  { id: '6 - 36 ações culturais', label: '6 - 36 ações culturais' },
  { id: '7 - Educador', label: '7 - Educador' },
  { id: '8 - Exposição MHAB', label: '8 - Exposição MHAB' },
  { id: '9 - Exposição MIS', label: '9 - Exposição MIS' },
  { id: '10 - 18 pequenas mostras', label: '10 - 18 pequenas mostras' },
  { id: '11 - Noturno nos Museus Ed. 2026', label: '11 - Noturno nos Museus Ed. 2026' },
  { id: '11A - Noturno 2026', label: '11A - Noturno 2026' },
  { id: '11B - Noturno Pampulha', label: '11B - Noturno Pampulha' },
  { id: '12 - Curadoria MHAB', label: '12 - Curadoria MHAB' },
  { id: '13 - Curadoria MUMO', label: '13 - Curadoria MUMO' },
  { id: '14 - Acessibilidade', label: '14 - Acessibilidade' },
  { id: '15 - Leis de Incentivo', label: '15 - Leis de Incentivo' },
  { id: '16 - 101 Diárias', label: '16 - 101 Diárias' },
  { id: '17 - Publicações', label: '17 - Publicações' },
  { id: '18 - Custeios atividades educativas', label: '18 - Custeios atividades educativas' },
  { id: '19 - Presença de Iemanjá', label: '19 - Presença de Iemanjá' },
  { id: '20 - 30 ações educativas e culturais', label: '20 - 30 ações educativas e culturais' },
  { id: '21 - Exposição MUMO', label: '21 - Exposição MUMO' },
  { id: '22 - Consultorias', label: '22 - Consultorias' },
  { id: '23 - Despesas Gerais', label: '23 - Despesas Gerais' },
  { id: '24 - Emenda Parlamentar', label: '24 - Emenda Parlamentar' },
  { id: '25 - Outras Ações', label: '25 - Outras Ações' },
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