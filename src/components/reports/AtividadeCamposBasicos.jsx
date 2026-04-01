import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FilterMultiSelect from '@/components/ui/filter-multi-select';

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
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
  return value === null || value === undefined ? fallback : value;
}

function toNumberOrFallback(value, fallback = 0, { min = 0 } = {}) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return fallback;
  return n;
}

export default function AtividadeCamposBasicos({
  atividade,
  onChange,
  museus = [],
  tiposAcao = [],
  canEdit = true,
}) {
  const museuLista = normalizeArray(atividade?.museu_lista ?? atividade?.museu);
  const tipoAcaoLista = normalizeArray(atividade?.tipo_acao_lista ?? atividade?.tipo_acao);

  const quantidadeOcorrenciasNumero = toNumberOrFallback(
    atividade?.quantidade_ocorrencias,
    1,
    { min: 1 }
  );

  const quantidadeProdutosGeradosNumero = toNumberOrFallback(
    atividade?.quantidade_produtos_gerados,
    0,
    { min: 0 }
  );

  const publicoEstimadoNumero = toNumberOrFallback(
    atividade?.publico_estimado,
    0,
    { min: 0 }
  );

  const publicoTotal = publicoEstimadoNumero * quantidadeOcorrenciasNumero;
  const totalProdutosGerados =
    quantidadeProdutosGeradosNumero * quantidadeOcorrenciasNumero;

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

  function handlePublicoEstimadoChange(e) {
    const raw = e.target.value;

    if (raw === '') {
      onChange('publico_estimado', '');
      onChange('publico_total', 0);
      return;
    }

    const pub = Number(raw);
    if (!Number.isFinite(pub) || pub < 0) return;

    onChange('publico_estimado', pub);
    onChange('publico_total', pub * quantidadeOcorrenciasNumero);
  }

  function handleQuantidadeOcorrenciasChange(e) {
    const raw = e.target.value;

    if (raw === '') {
      onChange('quantidade_ocorrencias', '');
      onChange('publico_total', 0);
      onChange('total_produtos_gerados', 0);
      return;
    }

    const val = Number(raw);
    if (!Number.isFinite(val) || val < 1) return;

    onChange('quantidade_ocorrencias', val);
    onChange('publico_total', publicoEstimadoNumero * val);
    onChange('total_produtos_gerados', quantidadeProdutosGeradosNumero * val);
  }

  function handleTotalAtividadesChange(e) {
    const raw = e.target.value;

    if (raw === '') {
      onChange('total_atividades', '');
      return;
    }

    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0) return;

    onChange('total_atividades', val);
  }

  function handleQuantidadeProdutosGeradosChange(e) {
    const raw = e.target.value;

    if (raw === '') {
      onChange('quantidade_produtos_gerados', '');
      onChange('total_produtos_gerados', 0);
      return;
    }

    const qtd = Number(raw);
    if (!Number.isFinite(qtd) || qtd < 0) return;

    onChange('quantidade_produtos_gerados', qtd);
    onChange('total_produtos_gerados', qtd * quantidadeOcorrenciasNumero);
  }

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Classificação *">
          <Input
            value={toInputValue(atividade?.classificacao, '')}
            onChange={(e) => onChange('classificacao', e.target.value)}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Nome da atividade *">
          <Input
            value={toInputValue(atividade?.nome, '')}
            onChange={(e) => onChange('nome', e.target.value)}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <Field label="Justificativa técnica">
        <Textarea
          value={toInputValue(atividade?.justificativa_tecnica, '')}
          onChange={(e) => onChange('justificativa_tecnica', e.target.value)}
          rows={4}
          disabled={!canEdit}
        />
      </Field>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Data de início">
          <Input
            type="date"
            value={toInputValue(atividade?.data_inicio, '')}
            onChange={(e) => onChange('data_inicio', e.target.value)}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Data de fim">
          <Input
            type="date"
            value={toInputValue(atividade?.data_fim, '')}
            onChange={(e) => onChange('data_fim', e.target.value)}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Público estimado">
          <Input
            type="number"
            min="0"
            value={toInputValue(atividade?.publico_estimado, '')}
            onChange={handlePublicoEstimadoChange}
            disabled={!canEdit}
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
          />
        </Field>

        <Field label="Tipo de ação">
          <FilterMultiSelect
            options={tiposAcao}
            values={tipoAcaoLista}
            onChange={handleTiposAcaoChange}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Quantas vezes ocorreu?">
          <Input
            type="number"
            min="1"
            value={toInputValue(atividade?.quantidade_ocorrencias, '')}
            onChange={handleQuantidadeOcorrenciasChange}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Total de atividades">
          <Input
            type="number"
            min="0"
            value={toInputValue(atividade?.total_atividades, '')}
            onChange={handleTotalAtividadesChange}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Público total">
          <Input value={publicoTotal} readOnly className="bg-gray-50" />
        </Field>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Produto realizado">
          <Input
            value={toInputValue(atividade?.produto_realizado, '')}
            onChange={(e) => onChange('produto_realizado', e.target.value)}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Quantidade de produtos gerados">
          <Input
            type="number"
            min="0"
            value={toInputValue(atividade?.quantidade_produtos_gerados, '')}
            onChange={handleQuantidadeProdutosGeradosChange}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Total produtos gerados">
          <Input value={totalProdutosGerados} readOnly className="bg-gray-50" />
        </Field>
      </div>
    </>
  );
}
