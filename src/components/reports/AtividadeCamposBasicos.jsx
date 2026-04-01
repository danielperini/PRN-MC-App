import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FilterMultiSelect from '@/components/ui/filter-multi-select';
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

function normalizeOptionList(options = []) {
  return (options || []).map((item) => {
    if (typeof item === 'string') {
      return { id: item, label: item };
    }
    return {
      id: String(item?.id ?? item?.value ?? item?.label ?? ''),
      label: String(item?.label ?? item?.name ?? item?.titulo ?? item?.nome ?? item?.id ?? ''),
      ...item,
    };
  }).filter((item) => item.id && item.label);
}

export default function AtividadeCamposBasicos({
  atividade,
  onChange,
  museus = [],
  tiposAcao = [],
  canEdit = true,
  classificacaoOptions = [],
  produtoRealizadoOptions = [],
  teamOptions = [],
  metaOptions = [],
  programacaoOptions = [],
}) {
  const museuLista = normalizeArray(atividade?.museu_lista ?? atividade?.museu);
  const tipoAcaoLista = normalizeArray(atividade?.tipo_acao_lista ?? atividade?.tipo_acao);
  const equipeLista = normalizeArray(atividade?.equipe_participante_ids);
  const metasLista = normalizeArray(atividade?.meta_vinculada_ids);

  const classificacoes = normalizeOptionList(classificacaoOptions);
  const produtosRealizados = normalizeOptionList(produtoRealizadoOptions);
  const equipeOptions = normalizeOptionList(teamOptions);
  const metasOptions = normalizeOptionList(metaOptions);
  const programacoes = normalizeOptionList(programacaoOptions);

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

  function handleEquipeChange(nextValues) {
    const lista = Array.isArray(nextValues) ? nextValues : [];
    const nomes = equipeOptions
      .filter((item) => lista.includes(item.id))
      .map((item) => item.label);

    onChange('equipe_participante_ids', lista);
    onChange('equipe_participante_nomes', nomes.join(', '));
  }

  function handleMetasChange(nextValues) {
    const lista = Array.isArray(nextValues) ? nextValues : [];
    const nenhumaSelecionada = lista.includes('nenhuma-meta');

    if (nenhumaSelecionada) {
      onChange('meta_vinculada_ids', ['nenhuma-meta']);
      onChange('meta_vinculada_titulos', 'Nenhuma meta');
      return;
    }

    const titulos = metasOptions
      .filter((item) => lista.includes(item.id))
      .map((item) => item.label);

    onChange('meta_vinculada_ids', lista);
    onChange('meta_vinculada_titulos', titulos.join(', '));
  }

  function handleProgramacaoChange(value) {
    const selected = programacoes.find((item) => item.id === value);

    onChange('programacao_id', value);

    if (!selected) return;

    if (selected.sinopse) {
      onChange('descricao', selected.sinopse);
    }

    if (selected.museu) {
      onChange('museu_lista', [selected.museu]);
      onChange('museu', selected.museu);
    }

    if (selected.tipo) {
      onChange('tipo_acao_lista', [selected.tipo]);
      onChange('tipo_acao', selected.tipo);
    }

    if (selected.data_inicio && !atividade?.data_inicio) {
      onChange('data_inicio', selected.data_inicio);
    }

    if (!atividade?.nome && selected.label) {
      onChange('nome', selected.label);
    }
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
          <Select
            value={toInputValue(atividade?.classificacao, '')}
            onValueChange={(value) => onChange('classificacao', value)}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a classificação" />
            </SelectTrigger>
            <SelectContent>
              {classificacoes.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Nome da atividade *">
          <Input
            value={toInputValue(atividade?.nome, '')}
            onChange={(e) => onChange('nome', e.target.value)}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Ação da programação">
          <Select
            value={toInputValue(atividade?.programacao_id, '')}
            onValueChange={handleProgramacaoChange}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Nenhuma ação vinculada" />
            </SelectTrigger>
            <SelectContent>
              {programacoes.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.museu ? `[${item.museu}] ` : ''}
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Produto realizado">
          <Select
            value={toInputValue(atividade?.produto_realizado, '')}
            onValueChange={(value) => onChange('produto_realizado', value)}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o produto realizado" />
            </SelectTrigger>
            <SelectContent>
              {produtosRealizados.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Descrição">
        <Textarea
          value={toInputValue(atividade?.descricao, '')}
          onChange={(e) => onChange('descricao', e.target.value)}
          rows={4}
          disabled={!canEdit}
        />
      </Field>

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

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Membros da equipe participantes">
          <FilterMultiSelect
            options={equipeOptions.map((item) => item.label)}
            values={equipeOptions.filter((item) => equipeLista.includes(item.id)).map((item) => item.label)}
            onChange={(selectedLabels) => {
              const ids = equipeOptions
                .filter((item) => selectedLabels.includes(item.label))
                .map((item) => item.id);
              handleEquipeChange(ids);
            }}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Metas vinculadas">
          <FilterMultiSelect
            options={metasOptions.map((item) => item.label)}
            values={metasOptions.filter((item) => metasLista.includes(item.id)).map((item) => item.label)}
            onChange={(selectedLabels) => {
              const ids = metasOptions
                .filter((item) => selectedLabels.includes(item.label))
                .map((item) => item.id);
              handleMetasChange(ids);
            }}
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

        <Field label="Equipe selecionada">
          <Input
            value={toInputValue(atividade?.equipe_participante_nomes, '')}
            readOnly
            className="bg-gray-50"
          />
        </Field>
      </div>
    </>
  );
}
