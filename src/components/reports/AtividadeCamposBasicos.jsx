import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FilterMultiSelect from '@/components/ui/filter-multi-select';

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-gray-700">{label}</Label>
      {children}
    </div>
  );
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AtividadeCamposBasicos({
  atividade,
  canEdit,
  onChange,
  museus = [],
  tiposAcao = [],
}) {
  const museuLista = normalizeArray(atividade?.museu_lista);
  const tipoAcaoLista = normalizeArray(atividade?.tipo_acao_lista || atividade?.tipo_acao ? [atividade.tipo_acao].filter(Boolean) : []);

  function handleMuseusChange(nextValues) {
    const lista = Array.isArray(nextValues) ? nextValues : [];
    onChange('museu_lista', lista);
    onChange('museu', lista.join(', '));
  }

  function handleTiposAcaoChange(nextValues) {
    const lista = Array.isArray(nextValues) ? nextValues : [];
    onChange('tipo_acao_lista', lista);
    onChange('tipo_acao', lista.join(', '));
  }

  return (
    <>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Data de início">
          <Input
            type="date"
            value={atividade?.data_inicio || ''}
            onChange={(e) => onChange('data_inicio', e.target.value)}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Data de fim">
          <Input
            type="date"
            value={atividade?.data_fim || ''}
            onChange={(e) => onChange('data_fim', e.target.value)}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Público estimado (por ocorrência)">
          <Input
            type="number"
            min="0"
            value={atividade?.publico_estimado ?? ''}
            onChange={(e) => onChange('publico_estimado', e.target.value)}
            disabled={!canEdit}
            placeholder="0"
          />
        </Field>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Museu / Local">
          <FilterMultiSelect
            options={museus}
            values={museuLista}
            onChange={handleMuseusChange}
            disabled={!canEdit}
            placeholder="Selecione um ou mais locais"
            searchPlaceholder="Filtrar museus / locais..."
            emptyText="Nenhum local encontrado"
          />
        </Field>

        <Field label="Tipo de ação">
          <FilterMultiSelect
            options={tiposAcao}
            values={tipoAcaoLista}
            onChange={handleTiposAcaoChange}
            disabled={!canEdit}
            placeholder="Selecione um ou mais tipos"
            searchPlaceholder="Filtrar tipos de ação..."
            emptyText="Nenhum tipo encontrado"
          />
        </Field>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Nome da atividade">
          <Input
            value={atividade?.nome || ''}
            onChange={(e) => onChange('nome', e.target.value)}
            disabled={!canEdit}
            placeholder="Digite o nome da atividade"
          />
        </Field>

        <Field label="Produto realizado">
          <Input
            value={atividade?.produto_realizado || ''}
            onChange={(e) => onChange('produto_realizado', e.target.value)}
            disabled={!canEdit}
            placeholder="Ex.: catálogo, vídeo, post, oficina"
          />
        </Field>
      </div>
    </>
  );
}
