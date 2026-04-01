import React, { useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AtividadeCamposBasicos from './AtividadeCamposBasicos';
import ActivityPhotoLinker from './ActivityPhotoLinker';
import ActivityAttachments from './ActivityAttachments';

export default function AtividadesSection({
  atividades = [],
  setAtividades,
  canEdit = true,
  museusOptions = [],
  tiposAcaoOptions = [],
  mesReferencia = '',
  ano = 2026,
  reportId = null,
}) {

  // 🔥 BUSCAR PROGRAMAÇÃO REAL (ProgramacaoEspelho)
  const { data: programacaoItems = [] } = useQuery({
    queryKey: ['programacao-espelho'],
    queryFn: async () => {
      const res = await base44.entities.Programacao.list('-data_inicio', 1000);
      return res || [];
    },
    staleTime: 60000,
  });

  // 🔥 BUSCAR EQUIPE
  const { data: equipe = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      return await base44.entities.TeamMember.list('-created_at', 1000);
    }
  });

  // 🔥 BUSCAR METAS
  const { data: metas = [] } = useQuery({
    queryKey: ['metas'],
    queryFn: async () => {
      return await base44.entities.Meta.list('-created_at', 1000);
    }
  });

  const updateAtividade = useCallback((index, field, value) => {
    setAtividades((prev) => {
      const list = [...prev];
      list[index] = { ...list[index], [field]: value };
      return list;
    });
  }, [setAtividades]);

  const addAtividade = useCallback(() => {
    setAtividades((prev) => [
      ...prev,
      {
        classificacao: '',
        nome: '',
        descricao: '',
        museu_lista: [],
        tipo_acao_lista: [],
        equipe_participante_ids: [],
        meta_vinculada_ids: [],
      }
    ]);
  }, [setAtividades]);

  const removeAtividade = useCallback((index) => {
    setAtividades((prev) => {
      const list = [...prev];
      list.splice(index, 1);
      return list;
    });
  }, [setAtividades]);

  return (
    <div className="space-y-6">

      {/* IMPORTAR DA PROGRAMAÇÃO */}
      {canEdit && (
        <div className="bg-blue-50 p-4 rounded border">
          <Select onValueChange={(id) => {
            const item = programacaoItems.find(p => p.id === id);
            if (!item) return;

            addAtividade();

            setTimeout(() => {
              setAtividades(prev => {
                const last = prev.length - 1;
                prev[last] = {
                  ...prev[last],
                  nome: item.titulo,
                  descricao: item.sinopse,
                  museu_lista: [item.museu],
                  tipo_acao_lista: [item.tipo],
                  programacao_id: item.id
                };
                return [...prev];
              });
            }, 50);
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Importar da programação" />
            </SelectTrigger>
            <SelectContent>
              {programacaoItems.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(atividades || []).map((atividade, index) => (
        <div key={index} className="border p-4 rounded space-y-4">

          <div className="flex justify-between">
            <b>Atividade {index + 1}</b>

            {canEdit && (
              <Button size="icon" variant="ghost" onClick={() => removeAtividade(index)}>
                <Trash2 className="text-red-500 w-4 h-4" />
              </Button>
            )}
          </div>

          <AtividadeCamposBasicos
            atividade={atividade}
            onChange={(field, value) => updateAtividade(index, field, value)}
            museus={museusOptions}
            tiposAcao={tiposAcaoOptions}
            teamOptions={equipe}
            metaOptions={metas}
            programacaoOptions={programacaoItems}
            canEdit={canEdit}
          />

          {/* Evidências (upload de arquivos vinculados à atividade) */}
          {reportId && (
            <ActivityAttachments
              reportId={reportId}
              activityIndex={index}
              activityId={atividade?.id || atividade?._id}
              activityName={atividade?.nome || atividade?.titulo || `Atividade ${index + 1}`}
              canEdit={canEdit}
            />
          )}

          {/* Vínculo de fotos da galeria */}
          {atividade?.id && (
            <ActivityPhotoLinker
              activityId={atividade.id}
              onPhotosChange={(fotos) => updateAtividade(index, 'fotos', fotos)}
              disabled={!canEdit}
            />
          )}

        </div>
      ))}

      {canEdit && (
        <Button onClick={addAtividade} variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Adicionar atividade
        </Button>
      )}

    </div>
  );
}