import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

function toInputValue(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return value;
}

function parseNum(value, fallback = 0) {
  const n = parseInt(value, 10);
  return isNaN(n) || n < 0 ? fallback : n;
}

export default function AtividadeCamposBasicos({
  atividade,
  canEdit,
  onChange,
  museus = [],
  tiposAcao = [],
}) {
  const museuLista = normalizeArray(
    atividade?.museu_lista && atividade.museu_lista.length
      ? atividade.museu_lista
      : atividade?.museu
  );

  const tipoAcaoLista = normalizeArray(
    atividade?.tipo_acao_lista && atividade.tipo_acao_lista.length
      ? atividade.tipo_acao_lista
      : atividade?.tipo_acao
  );

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
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Classificação da Atividade">
          <Input
            value={atividade?.classificacao || ''}
            onChange={(e) => onChange('classificacao', e.target.value)}
            disabled={!canEdit}
            placeholder="Ex.: ROTINA"
          />
        </Field>

        <Field label="Nome da atividade">
          <Input
            value={atividade?.nome || ''}
            onChange={(e) => onChange('nome', e.target.value)}
            disabled={!canEdit}
            placeholder="Digite o nome da atividade"
          />
        </Field>
      </div>

      <Field label="Justificativa Técnica">
        <Textarea
          value={atividade?.justificativa_tecnica || ''}
          onChange={(e) => onChange('justificativa_tecnica', e.target.value)}
          disabled={!canEdit}
          placeholder="Descreva a justificativa técnica da atividade"
          rows={4}
        />
      </Field>

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
            value={toInputValue(atividade?.publico_estimado, '')}
            onChange={(e) => {
              const pub = parseNum(e.target.value, 0);
              onChange('publico_estimado', pub);
              const rep = parseNum(atividade?.quantas_vezes_ocorreu, 1) || 1;
              onChange('publico_total', pub * rep);
            }}
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

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Quantas vezes ocorreu?">
          <Input
            type="number"
            min="1"
            value={toInputValue(atividade?.quantas_vezes_ocorreu, 1)}
            onChange={(e) => {
              const val = parseNum(e.target.value, 1) || 1;
              onChange('quantas_vezes_ocorreu', val);
              const pub = parseNum(atividade?.publico_estimado, 0);
              onChange('publico_total', pub * val);
              const qtd = parseNum(atividade?.quantidade_produtos, 0);
              onChange('total_produtos_gerados', qtd * val);
            }}
            disabled={!canEdit}
            placeholder="1"
          />
        </Field>

        <Field label="Total de atividades realizadas">
          <Input
            type="number"
            min="0"
            value={toInputValue(atividade?.total_atividades, 0)}
            onChange={(e) => onChange('total_atividades', parseNum(e.target.value, 0))}
            disabled={!canEdit}
            placeholder="0"
          />
        </Field>

        <Field label="Público total (estimado × ocorrências)">
          <Input
            type="number"
            value={parseNum(atividade?.publico_estimado, 0) * (parseNum(atividade?.quantas_vezes_ocorreu, 1) || 1)}
            readOnly
            disabled
            className="bg-gray-50 font-medium"
          />
        </Field>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Produto realizado">
          <Input
            value={atividade?.produto_realizado || ''}
            onChange={(e) => onChange('produto_realizado', e.target.value)}
            disabled={!canEdit}
            placeholder="Ex.: catálogo, vídeo, post, oficina"
          />
        </Field>

        <Field label="Quantidade de produtos gerados">
          <Input
            type="number"
            min="0"
            value={toInputValue(atividade?.quantidade_produtos, 0)}
            onChange={(e) => {
              const qtd = parseNum(e.target.value, 0);
              onChange('quantidade_produtos', qtd);
              const rep = parseNum(atividade?.quantas_vezes_ocorreu, 1) || 1;
              onChange('total_produtos_gerados', qtd * rep);
            }}
            disabled={!canEdit}
            placeholder="0"
          />
        </Field>

        <Field label="Total de produtos gerados (auto)">
          <Input
            type="number"
            value={parseNum(atividade?.quantidade_produtos, 0) * (parseNum(atividade?.quantas_vezes_ocorreu, 1) || 1)}
            readOnly
            disabled
            className="bg-gray-50 font-medium"
          />
        </Field>
      </div>
    </>
  );
}