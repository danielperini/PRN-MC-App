import React, { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import AtividadeCamposBasicos from './AtividadeCamposBasicos';

export function validateAtividade(atividade = {}) {
  const errors = [];

  if (!atividade || typeof atividade !== 'object') {
    return ['Atividade inválida'];
  }

  if (!atividade.classificacao || !String(atividade.classificacao).trim()) {
    errors.push('Classificação é obrigatória');
  }

  if (!atividade.nome || !String(atividade.nome).trim()) {
    errors.push('Nome da atividade é obrigatório');
  }

  return errors;
}

export default function AtividadesSection({
  atividades = [],
  setAtividades,
  canEdit = true,
  museusOptions = [],
  tiposAcaoOptions = [],
}) {
  const museus = useMemo(() => {
    return Array.from(new Set((museusOptions || []).filter(Boolean)));
  }, [museusOptions]);

  const tiposAcao = useMemo(() => {
    return Array.from(new Set((tiposAcaoOptions || []).filter(Boolean)));
  }, [tiposAcaoOptions]);

  const updateAtividade = useCallback(
    (index, field, value) => {
      setAtividades((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        const current = { ...(list[index] || {}) };

        current[field] = value;

        list[index] = current;
        return list;
      });
    },
    [setAtividades]
  );

  const addAtividade = useCallback(() => {
    setAtividades((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      list.push({
        classificacao: '',
        justificativa_tecnica: '',
        nome: '',
        data_inicio: '',
        data_fim: '',
        publico_estimado: 0,
        quantas_vezes_ocorreu: 1,
        total_atividades: 0,
        museu: '',
        museu_lista: [],
        tipo_acao: '',
        tipo_acao_lista: [],
        produto_realizado: '',
        quantidade_produtos: 0,
        total_produtos_gerados: 0,
      });
      return list;
    });
  }, [setAtividades]);

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
      {atividades.map((atividade, index) => (
        <div
          key={index}
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
        </div>
      ))}

      {canEdit && (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={addAtividade}
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
