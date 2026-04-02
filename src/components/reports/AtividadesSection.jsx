import React, { useCallback, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save, FileDown, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AtividadeCamposBasicos from './AtividadeCamposBasicos';
import ActivityPhotoLinker from './ActivityPhotoLinker';
import ActivityAttachments from './ActivityAttachments';

function createActivityId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `atividade_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function AtividadesSection({
  atividades = [],
  setAtividades,
  canEdit = true,
  museusOptions = [],
  tiposAcaoOptions = [],
  mesReferencia = '',
  ano = 2026,
  museu = '',
  reportId = null,
  onSave = null,
  onExportPdf = null,
  onBackToReport = null,
}) {
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  async function handleSaveAtividades() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave();
      toast.success('✅ Atividades salvas com sucesso!', { duration: 3000 });
    } catch (e) {
      toast.error(`❌ Erro ao salvar atividades: ${e?.message || 'tente novamente'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPdf() {
    if (!onExportPdf) return;
    setExportingPdf(true);
    try {
      await onExportPdf();
    } catch (e) {
      toast.error(`❌ Erro ao exportar PDF: ${e?.message || 'tente novamente'}`);
    } finally {
      setExportingPdf(false);
    }
  }

  const { data: programacaoItemsRaw = [] } = useQuery({
    queryKey: ['programacao-espelho'],
    queryFn: async () => {
      const res = await base44.entities.Programacao.list('-data_inicio', 1000);
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60000,
  });

  const programacaoItems = useMemo(() => {
    const agora = new Date();
    const limite = new Date();
    limite.setHours(0, 0, 0, 0);
    limite.setDate(agora.getDate() - 45);

    return (programacaoItemsRaw || []).filter((p) => {
      if (!p?.data_inicio) return false;

      const data = new Date(p.data_inicio);
      if (Number.isNaN(data.getTime())) return false;

      return data >= limite && data <= agora;
    });
  }, [programacaoItemsRaw]);

  const { data: equipe = [] } = useQuery({
    queryKey: ['user-permissions-team'],
    queryFn: async () => {
      const res = await base44.entities.UserPermission.list('user_name', 1000);
      return (Array.isArray(res) ? res : []).map((u) => ({
        id: u.user_email,
        label: u.user_name || u.user_email,
      }));
    },
  });

  const { data: metas = [] } = useQuery({
    queryKey: ['project-metas'],
    queryFn: async () => {
      const res = await base44.entities.ProjectMeta.list('nome', 1000);
      return (Array.isArray(res) ? res : [])
        .filter((m) => m.ativo !== false)
        .map((m) => ({
          id: m.id,
          label: m.nome,
          nome: m.nome,
        }));
    },
  });

  const updateAtividade = useCallback((index, field, value) => {
    if (typeof setAtividades !== 'function') return;

    setAtividades((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      list[index] = { ...(list[index] || {}), [field]: value };
      return list;
    });
  }, [setAtividades]);

  const addAtividade = useCallback(() => {
    if (typeof setAtividades !== 'function') return;

    setAtividades((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      {
        id: createActivityId(),
        classificacao: '',
        nome: '',
        descricao: '',
        museu_lista: [],
        tipo_acao_lista: [],
        equipe_participante_ids: [],
        meta_vinculada_ids: [],
      },
    ]);
  }, [setAtividades]);

  const removeAtividade = useCallback((index) => {
    if (typeof setAtividades !== 'function') return;

    setAtividades((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      list.splice(index, 1);
      return list;
    });
  }, [setAtividades]);

  const importarDaProgramacao = useCallback((id) => {
    const item = programacaoItems.find((p) => p.id === id);
    if (!item || typeof setAtividades !== 'function') return;

    setAtividades((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      {
        id: createActivityId(),
        classificacao: '',
        nome: item.titulo || item.nome || '',
        descricao: item.sinopse || item.descricao || '',
        museu_lista: item.museu ? [item.museu] : [],
        tipo_acao_lista: item.tipo ? [item.tipo] : [],
        equipe_participante_ids: [],
        meta_vinculada_ids: [],
        programacao_id: item.id,
      },
    ]);
  }, [programacaoItems, setAtividades]);

  return (
    <div className="space-y-6">
      {onBackToReport && (
        <div className="flex items-center justify-start">
          <Button type="button" variant="outline" onClick={onBackToReport}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retornar para relatório
          </Button>
        </div>
      )}

      {canEdit && (
        <div className="bg-blue-50 p-4 rounded border">
          <Select onValueChange={importarDaProgramacao}>
            <SelectTrigger>
              <SelectValue placeholder="Importar da programação (últimos 45 dias)" />
            </SelectTrigger>
            <SelectContent>
              {programacaoItems
                .filter((p) => !museu || !p.museu || p.museu === museu)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {(p.titulo || p.nome || 'Sem título')} {p.museu ? `(${p.museu})` : ''}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(atividades || []).map((atividade, index) => (
        <div key={atividade?.id || index} className="border p-4 rounded space-y-4">
          <div className="flex justify-between items-center">
            <b>Atividade {index + 1}</b>

            {canEdit && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeAtividade(index)}
              >
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
            mesReferencia={mesReferencia}
            ano={ano}
          />

          {reportId && (
            <ActivityAttachments
              reportId={reportId}
              activityIndex={index}
              activityId={atividade?.id || atividade?._id}
              activityName={atividade?.nome || atividade?.titulo || `Atividade ${index + 1}`}
              canEdit={canEdit}
            />
          )}

          {atividade?.id && (
            <ActivityPhotoLinker
              activityId={atividade.id}
              onPhotosChange={(fotos) => updateAtividade(index, 'fotos', fotos)}
              disabled={!canEdit}
            />
          )}
        </div>
      ))}

      <div className="flex gap-2 flex-wrap">
        {canEdit && (
          <Button type="button" onClick={addAtividade} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar atividade
          </Button>
        )}

        {canEdit && onSave && (
          <Button type="button" onClick={handleSaveAtividades} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar atividades'}
          </Button>
        )}

        {onExportPdf && (
          <Button type="button" variant="outline" onClick={handleExportPdf} disabled={exportingPdf}>
            <FileDown className="w-4 h-4 mr-2" />
            {exportingPdf ? 'Gerando PDF...' : 'Exportar PDF para assinatura'}
          </Button>
        )}
      </div>
    </div>
  );
}
