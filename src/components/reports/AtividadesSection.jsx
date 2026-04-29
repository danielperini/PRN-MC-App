import React, { useCallback, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save, FileDown, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import AtividadeCamposBasicos from './AtividadeCamposBasicos';
import ActivityPhotoLinker from './ActivityPhotoLinker';
import ActivityAttachments from './ActivityAttachments';

function createActivityId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `atividade_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getTeamMemberId(member) {
  return member?.id || member?.user_email || member?.email || member?.email_pessoal || '';
}

function getTeamMemberName(member) {
  return (
    member?.user_name ||
    member?.nome ||
    member?.nome_completo ||
    member?.name ||
    member?.full_name ||
    member?.email ||
    member?.user_email ||
    member?.email_pessoal ||
    'Sem nome'
  );
}

function dedupeAtividades(list) {
  const seen = new Set();

  return (Array.isArray(list) ? list : []).filter((atividade) => {
    const key = atividade?.id || atividade?._id || JSON.stringify(atividade || {});
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    setExportingPdf(true);

    try {
      if (onSave) {
        await onSave();
        toast.success('✅ Atividades salvas com sucesso!', { duration: 3000 });
      }

      if (onExportPdf) {
        await onExportPdf();
        toast.success('📄 PDF gerado com sucesso!', { duration: 3000 });
      }
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
    queryKey: ['team-members-for-report-activities'],
    queryFn: async () => {
      const res = await base44.entities.TeamMember.list('', 1000);
      const map = new Map();

      for (const member of res || []) {
        const id = getTeamMemberId(member);
        const label = getTeamMemberName(member);
        const dedupKey = normalizeText(
          member?.user_email || member?.email || member?.email_pessoal || label
        );

        if (!id || !label || !dedupKey) continue;

        if (!map.has(dedupKey)) {
          map.set(dedupKey, { id, label });
        }
      }

      return Array.from(map.values()).sort((a, b) =>
        String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR')
      );
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

  const updateAtividade = useCallback(
    (index, field, value) => {
      if (typeof setAtividades !== 'function') return;

      setAtividades((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [...(atividades || [])];

        const normalizedValue =
          field === 'equipe_participante_ids' && Array.isArray(value)
            ? Array.from(new Set(value.filter(Boolean)))
            : field === 'meta_vinculada_ids' && Array.isArray(value)
              ? Array.from(new Set(value.filter(Boolean)))
              : value;

        list[index] = {
          ...(list[index] || {}),
          id: list[index]?.id || createActivityId(),
          [field]: normalizedValue,
        };

        return dedupeAtividades(list);
      });
    },
    [setAtividades, atividades]
  );

  const addAtividade = useCallback(() => {
    if (typeof setAtividades !== 'function') return;

    setAtividades((prev) => {
      const listaAtual = Array.isArray(prev) ? prev : Array.isArray(atividades) ? atividades : [];

      const novaAtividade = {
        id: createActivityId(),
        classificacao: '',
        nome: '',
        descricao: '',
        museu_lista: museu ? [museu] : [],
        tipo_acao_lista: [],
        equipe_participante_ids: [],
        meta_vinculada_ids: [],
        quantas_vezes_ocorreu: 1,
        publico_medio_sessao: 0,
        publico_estimado: 0,
        quantidade_produtos: 0,
        total_produtos: 0,
      };

      return dedupeAtividades([...listaAtual, novaAtividade]);
    });
  }, [setAtividades, atividades, museu]);

  const removeAtividade = useCallback(
    (index) => {
      if (typeof setAtividades !== 'function') return;

      setAtividades((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [...(atividades || [])];
        list.splice(index, 1);
        return dedupeAtividades(list);
      });
    },
    [setAtividades, atividades]
  );

  const importarDaProgramacao = useCallback(
    (id) => {
      const item = programacaoItems.find((p) => p.id === id);
      if (!item || typeof setAtividades !== 'function') return;

      setAtividades((prev) => {
        const listaAtual = Array.isArray(prev) ? prev : Array.isArray(atividades) ? atividades : [];

        const novaAtividade = {
          id: createActivityId(),
          classificacao: '',
          nome: item.titulo || item.nome || '',
          descricao: item.sinopse || item.descricao || '',
          museu_lista: item.museu ? [item.museu] : [],
          tipo_acao_lista: item.tipo ? [item.tipo] : [],
          equipe_participante_ids: [],
          meta_vinculada_ids: [],
          programacao_id: item.id,
          quantas_vezes_ocorreu: 1,
          publico_medio_sessao: 0,
          publico_estimado: 0,
          quantidade_produtos: 0,
          total_produtos: 0,
        };

        return dedupeAtividades([...listaAtual, novaAtividade]);
      });
    },
    [programacaoItems, setAtividades, atividades]
  );

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
            onImportProgramacao={importarDaProgramacao}
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
