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

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

  const ocorrencias = safeNumber(atividade?.quantidade_ocorrencias, 0);
  const publicoEstimado = safeNumber(atividade?.publico_estimado, 0);
  const produtosGerados = safeNumber(atividade?.quantidade_produtos_gerados, 0);

  const publicoTotal = publicoEstimado * ocorrencias;
  const totalProdutosGerados = produtosGerados * ocorrencias;

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

    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0) return;

    onChange('publico_estimado', val);
    onChange('publico_total', val * ocorrencias);
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
    if (!Number.isFinite(val) || val < 0) return;

    onChange('quantidade_ocorrencias', val);
    onChange('publico_total', publicoEstimado * val);
    onChange('total_produtos_gerados', produtosGerados * val);
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

    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0) return;

    onChange('quantidade_produtos_gerados', val);
    onChange('total_produtos_gerados', val * ocorrencias);
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

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Quantas vezes ocorreu?">
          <Input
            type="number"
            min="0"
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
