import React, { useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AtividadeCamposBasicos from './AtividadeCamposBasicos';
import ActivityPhotoLinker from './ActivityPhotoLinker';

export function validateAtividade(atividade = {}) {
  const errors = [];
  if (!atividade || typeof atividade !== 'object') return ['Atividade inválida'];
  if (!atividade.classificacao || !String(atividade.classificacao).trim()) errors.push('Classificação é obrigatória');
  if (!atividade.nome || !String(atividade.nome).trim()) errors.push('Nome da atividade é obrigatório');
  return errors;
}

const MESES_NUM = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const NUMERIC_FIELDS = new Set([
  'publico_estimado',
  'quantidade_ocorrencias',
  'quantidade_produtos_gerados',
  'total_produtos_gerados',
  'publico_total',
  'total_atividades',
]);

function toMonthKey(mes, ano) {
  const idx = MESES_NUM.indexOf(mes);
  if (idx === -1 || !ano) return null;
  return `${ano}-${String(idx + 1).padStart(2, '0')}`;
}

function prevMonthKey(mes, ano) {
  const idx = MESES_NUM.indexOf(mes);
  if (idx === -1 || !ano) return null;
  if (idx === 0) return `${Number(ano) - 1}-12`;
  return `${ano}-${String(idx).padStart(2, '0')}`;
}

function normalizeFieldValue(field, value) {
  if (!NUMERIC_FIELDS.has(field)) return value;
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

export default function AtividadesSection({
  atividades = [],
  setAtividades,
  canEdit = true,
  museusOptions = [],
  tiposAcaoOptions = [],
  mesReferencia = '',
  ano = 2026,
}) {
  const museus = useMemo(
    () => Array.from(new Set((museusOptions || []).filter(Boolean))),
    [museusOptions]
  );

  const tiposAcao = useMemo(
    () => Array.from(new Set((tiposAcaoOptions || []).filter(Boolean))),
    [tiposAcaoOptions]
  );

  const currentKey = toMonthKey(mesReferencia, ano);
  const prevKey = prevMonthKey(mesReferencia, ano);

  const { data: programacaoItems = [] } = useQuery({
    queryKey: ['programacao-cronograma', currentKey, prevKey],
    queryFn: async () => {
      if (!currentKey && !prevKey) return [];
      const all = await base44.entities.Programacao.list('-data_inicio', 1000);
      return (all || []).filter((item) => {
        const k = item.month_key || '';
        return k === currentKey || k === prevKey;
      });
    },
    enabled: !!currentKey || !!prevKey,
    staleTime: 60000,
  });

  const updateAtividade = useCallback(
    (index, field, value) => {
      setAtividades((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        const current = { ...(list[index] || {}) };

        current[field] = normalizeFieldValue(field, value);
        list[index] = current;

        return list;
      });
    },
    [setAtividades]
  );

  const addAtividade = useCallback(
    (base = {}) => {
      setAtividades((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];

        list.push({
          classificacao: '',
          justificativa_tecnica: '',
          nome: '',
          descricao: '',
          data_inicio: '',
          data_fim: '',
          publico_estimado: '',
          quantidade_ocorrencias: '',
          quantidade_produtos_gerados: '',
          total_produtos_gerados: '',
          publico_total: '',
          total_atividades: '',
          museu: '',
          museu_lista: [],
          tipo_acao: '',
          tipo_acao_lista: [],
          produto_realizado: '',
          ...base,
        });

        return list;
      });
    },
    [setAtividades]
  );

  function importFromCronograma(value) {
    if (!value) return;
    const item = programacaoItems.find((p) => p.id === value);
    if (!item) return;

    addAtividade({
      nome: item.titulo || item.nome_acao || '',
      descricao: item.sinopse || item.descricao || '',
      museu: item.museu || '',
      tipo_acao: item.tipo || item.tipo_atividade || '',
      data_inicio: item.data_inicio || '',
      programacao_id: item.id,
    });
  }

  const removeAtividade = useCallback(
    (index) => {
      setAtividades((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        list.splice(index, 1);
        return list;
      });
    },
    [setAtividades]
  );

  return (
    <div className="space-y-6">
      {canEdit && programacaoItems.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
            <CalendarDays className="w-4 h-4" />
            Importar atividade da Programação (mês atual + anterior)
          </div>

          <Select onValueChange={importFromCronograma}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Selecione uma atividade do cronograma..." />
            </SelectTrigger>
            <SelectContent>
              {programacaoItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <span className="font-medium">
                    {item.museu ? `[${item.museu}] ` : ''}
                  </span>
                  {item.titulo || item.nome_acao || item.id}
                  {item.data || item.data_inicio ? ` — ${item.data || item.data_inicio}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-xs text-blue-700">
            Ao selecionar, uma nova atividade será criada automaticamente.
          </p>
        </div>
      )}

      {(atividades || []).map((atividade, index) => (
        <div
          key={atividade?.id ?? index}
          className="rounded-lg border bg-white p-4 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">
              Atividade {index + 1}
            </h3>

            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAtividade(index)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            )}
          </div>

          <AtividadeCamposBasicos
            atividade={atividade}
            canEdit={canEdit}
            museus={museus}
            tiposAcao={tiposAcao}
            onChange={(field, value) => updateAtividade(index, field, value)}
          />

          {atividade?.id && (
            <div className="border-t pt-4 mt-4">
              <ActivityPhotoLinker
                activityId={atividade.id}
                onPhotosChange={(fotos) => updateAtividade(index, 'fotos', fotos)}
                disabled={!canEdit}
              />
            </div>
          )}
        </div>
      ))}

      {canEdit && (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => addAtividade()}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Adicionar atividade
          </Button>
        </div>
      )}
    </div>
  );
}
