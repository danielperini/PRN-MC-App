import React, { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import AtividadeCamposBasicos from './AtividadeCamposBasicos';

function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  return [val];
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

        // 🔒 NÃO ALTERAR: campo Quantas vezes ocorreu?
        // Mantém exatamente como está no sistema atual

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
        nome: '',
        data_inicio: '',
        data_fim: '',
        publico_estimado: 0,
        // 🔒 manter estrutura existente
        quantas_vezes_ocorreu: 1,
        museu: '',
        museu_lista: [],
        tipo_acao: '',
        tipo_acao_lista: [],
        produto_realizado: '',
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
            onChange={(field, value) =>
              updateAtividade(index, field, value)
            }
          />

          {/* 🔒 IMPORTANTE:
              NÃO alterado aqui:
              campo "Quantas vezes ocorreu?"
              permanece no local original do sistema
          */}
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
{/* 🔒 BLOCO COMPLEMENTAR — NÃO ALTERA CAMPOS EXISTENTES */}

{/* Campo existente no sistema — NÃO ALTERAR LÓGICA */}
<div className="grid md:grid-cols-3 gap-4">
  <div className="space-y-1.5">
    <label className="text-sm text-gray-700">
      Quantas vezes ocorreu?
    </label>

    {/* IMPORTANTE: mantém exatamente o binding original */}
    <input
      type="number"
      min="1"
      value={atividade?.quantas_vezes_ocorreu ?? 1}
      onChange={(e) =>
        updateAtividade(index, 'quantas_vezes_ocorreu', e.target.value)
      }
      disabled={!canEdit}
      className="w-full rounded-md border px-3 py-2 text-sm"
    />
  </div>

  <div className="space-y-1.5">
    <label className="text-sm text-gray-700">
      Total de atividades realizadas
    </label>

    <input
      type="number"
      value={atividade?.total_atividades ?? 0}
      onChange={(e) =>
        updateAtividade(index, 'total_atividades', e.target.value)
      }
      disabled={!canEdit}
      className="w-full rounded-md border px-3 py-2 text-sm"
    />
  </div>

  <div className="space-y-1.5">
    <label className="text-sm text-gray-700">
      Quantidade de produtos gerados
    </label>

    <input
      type="number"
      value={atividade?.quantidade_produtos ?? 0}
      onChange={(e) =>
        updateAtividade(index, 'quantidade_produtos', e.target.value)
      }
      disabled={!canEdit}
      className="w-full rounded-md border px-3 py-2 text-sm"
    />
  </div>
</div>

