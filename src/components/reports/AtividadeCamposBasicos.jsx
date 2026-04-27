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
  if (!Array.isArray(value)) {
    if (!value) return [];
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  
  // Remove null/undefined e duplicados
  const filtered = value.filter(Boolean);
  return Array.from(new Set(filtered));
}

function toInputValue(value, fallback = '') {
  return value === null || value === undefined ? fallback : value;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeOptionList(options = []) {
  return (options || [])
    .map((item) => {
      if (typeof item === 'string') {
        return { id: item, label: item };
      }

      return {
        id: String(
          item?.id ??
          item?.value ??
          item?.user_email ??
          item?.email_pessoal ??
          item?.email ??
          item?.label ??
          item?.nome ??
          item?.titulo ??
          ''
        ),
        label: String(
          item?.label ??
          item?.user_name ??
          item?.nome ??
          item?.full_name ??
          item?.name ??
          item?.titulo ??
          item?.nome_acao ??
          item?.email_pessoal ??
          item?.user_email ??
          item?.email ??
          item?.id ??
          ''
        ),
        ...item,
      };
    })
    .filter((item) => item.id && item.label);
}

const MUSEUS_FIXOS = ['MIS', 'MHAB', 'MUMO', 'Geral'];
const TIPOS_ACAO_FIXOS = ['Meta', 'Extra', 'Rotina'];

const CLASSIFICACAO_OPTIONS_DEFAULT = [
  { id: 'Meta', label: 'Meta' },
  { id: 'Extra', label: 'Extra' },
  { id: 'Rotina', label: 'Rotina' },
];

const PRODUTO_REALIZADO_OPTIONS_DEFAULT = [
  'Oficina',
  'Visita mediada',
  'Palestra',
  'Exposição',
  'Reunião',
  'Roda de Conversa',
  'Ação educativa',
  'Ação cultural',
  'Ação de comunicação',
  'Registro',
  'Relatório',
  'Outro',
];

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

  const classificacoes = normalizeOptionList(
    classificacaoOptions?.length ? classificacaoOptions : CLASSIFICACAO_OPTIONS_DEFAULT
  );

  const produtosRealizados = normalizeOptionList(
    produtoRealizadoOptions?.length ? produtoRealizadoOptions : PRODUTO_REALIZADO_OPTIONS_DEFAULT
  );

  const equipeOptions = (teamOptions || []).every(t => t.id && t.label)
    ? teamOptions
    : normalizeOptionList(teamOptions);
  const metasOptions = normalizeOptionList(metaOptions || []);
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

  function handleEquipeChange(selectedLabels) {
    if (!Array.isArray(selectedLabels)) {
      onChange('equipe_participante_ids', []);
      onChange('equipe_participante_nomes', '');
      return;
    }

    // Remover duplicados dos labels
    const uniqueLabels = Array.from(new Set(selectedLabels.filter(Boolean)));
    
    // Mapear labels para IDs usando equipeOptions
    const selecionados = equipeOptions.filter((item) => uniqueLabels.includes(item.label));
    
    // Remover duplicados de IDs
    const uniqueIds = Array.from(new Set(selecionados.map((item) => item.id)));
    const nomes = selecionados.map((item) => item.label);

    onChange('equipe_participante_ids', uniqueIds);
    onChange('equipe_participante_nomes', nomes.join(', '));
  }

  function handleMetasChange(selectedLabels) {
    if (!Array.isArray(selectedLabels)) {
      onChange('meta_vinculada_ids', []);
      onChange('meta_vinculada_titulos', '');
      return;
    }

    // Remover duplicados dos labels
    const uniqueLabels = Array.from(new Set(selectedLabels.filter(Boolean)));
    
    // Mapear labels para IDs usando metasOptions
    const selecionados = metasOptions.filter((item) => uniqueLabels.includes(item.label));
    
    // Remover duplicados de IDs
    const uniqueIds = Array.from(new Set(selecionados.map((item) => item.id)));
    const titulos = selecionados.map((item) => item.label);

    onChange('meta_vinculada_ids', uniqueIds);
    onChange('meta_vinculada_titulos', titulos.join(', '));
  }

  function handleProgramacaoChange(value) {
    const selected = programacoes.find((item) => item.id === value);

    onChange('programacao_id', value);

    if (!selected) return;

    const selectedLabel =
      selected?.titulo ||
      selected?.nome_acao ||
      selected?.nome ||
      selected?.label ||
      '';

    const sinopse =
      selected?.sinopse ||
      selected?.descricao ||
      '';

    const museu =
      selected?.museu ||
      '';

    const tipo =
      selected?.tipo ||
      selected?.tipo_atividade ||
      '';

    const dataInicio =
      selected?.data_inicio ||
      selected?.data ||
      '';

    if (sinopse) {
      onChange('descricao', sinopse);
    }

    if (museu) {
      onChange('museu_lista', [museu]);
      onChange('museu', museu);
    }

    if (tipo) {
      onChange('tipo_acao_lista', [tipo]);
      onChange('tipo_acao', tipo);
    }

    if (dataInicio && !atividade?.data_inicio) {
      onChange('data_inicio', dataInicio);
    }

    if (!atividade?.nome && selectedLabel) {
      onChange('nome', selectedLabel);
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
                  {item?.museu ? `[${item.museu}] ` : ''}
                  {item?.titulo || item?.nome_acao || item?.nome || item?.label}
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
            options={museus?.length ? museus : MUSEUS_FIXOS}
            values={museuLista}
            onChange={handleMuseusChange}
            disabled={!canEdit}
          />
        </Field>

        <Field label="Tipo de ação">
          <FilterMultiSelect
            options={tiposAcao?.length ? tiposAcao : TIPOS_ACAO_FIXOS}
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
            values={Array.from(new Set(
              equipeOptions
                .filter((item) => equipeLista.includes(item.id))
                .map((item) => item.label)
                .filter(Boolean)
            ))}
            onChange={handleEquipeChange}
            disabled={!canEdit}
          />
        </Field>

        <Field label={atividade?.classificacao === 'Meta' ? 'Metas vinculadas *' : 'Metas vinculadas'}>
          {atividade?.classificacao === 'Meta' && metasLista.length === 0 && (
            <p className="text-xs text-red-500 mb-1">Selecione ao menos uma meta para esta atividade.</p>
          )}
          <FilterMultiSelect
            options={metasOptions.map((item) => item.label)}
            values={Array.from(new Set(
              metasOptions
                .filter((item) => metasLista.includes(item.id))
                .map((item) => item.label)
                .filter(Boolean)
            ))}
            onChange={handleMetasChange}
            disabled={!canEdit}
            placeholder={metasOptions.length === 0 ? 'Carregando metas...' : 'Selecione metas...'}
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


      </div>
    </>
  );
}