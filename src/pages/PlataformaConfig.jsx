import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, BookOpen, Brain, Save, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const DEFAULT_CONFIG = {
  usar_no_assistente_ajuda: true,
  permitir_salarios: true,
  max_chunks_por_resposta: 5,
  prompt_base_assistente: `Você é o assistente oficial da plataforma Museus Centro.
Responda sempre com base na Biblioteca de Conhecimento ativa.
Nunca invente informações.
Se não encontrar a resposta na base, informe isso claramente.
Priorize contratos, salários, pagamentos, cargos, metas, regras operacionais e documentos oficiais.`,
};

function PlataformaConfigInner() {
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState(DEFAULT_CONFIG);

  const { data: config = null, isLoading } = useQuery({
    queryKey: ['knowledge-config'],
    queryFn: async () => {
      const data = await base44.entities.KnowledgeLibrarySettings.list('-created_date', 20);
      return data?.[0] || null;
    },
  });

  useEffect(() => {
    if (config) {
      setLocalConfig({
        usar_no_assistente_ajuda:
          config?.usar_no_assistente_ajuda !== undefined
            ? config.usar_no_assistente_ajuda
            : DEFAULT_CONFIG.usar_no_assistente_ajuda,
        permitir_salarios:
          config?.permitir_salarios !== undefined
            ? config.permitir_salarios
            : DEFAULT_CONFIG.permitir_salarios,
        max_chunks_por_resposta:
          Number(config?.max_chunks_por_resposta) > 0
            ? Number(config.max_chunks_por_resposta)
            : DEFAULT_CONFIG.max_chunks_por_resposta,
        prompt_base_assistente:
          config?.prompt_base_assistente || DEFAULT_CONFIG.prompt_base_assistente,
      });
    } else {
      setLocalConfig(DEFAULT_CONFIG);
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        nome: 'Configuração Biblioteca IA',
        ativo: true,
      };

      if (config?.id) {
        return base44.entities.KnowledgeLibrarySettings.update(config.id, payload);
      }

      return base44.entities.KnowledgeLibrarySettings.create(payload);
    },
    onSuccess: () => {
      toast.success('Configuração salva');
      queryClient.invalidateQueries({ queryKey: ['knowledge-config'] });
    },
    onError: (error) => {
      toast.error('Erro ao salvar: ' + (error?.message || 'erro desconhecido'));
    },
  });

  const save = () => {
    updateMutation.mutate({
      ...localConfig,
      max_chunks_por_resposta:
        Number(localConfig?.max_chunks_por_resposta) > 0
          ? Number(localConfig.max_chunks_por_resposta)
          : DEFAULT_CONFIG.max_chunks_por_resposta,
    });
  };

  const restoreDefaults = () => {
    setLocalConfig(DEFAULT_CONFIG);
    toast.success('Valores padrão restaurados na tela');
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Configuração da Plataforma
        </h1>
        <p className="text-gray-500 text-sm">
          Gerencie o comportamento da Biblioteca de Conhecimento e do Assistente IA
        </p>
      </div>

      <div className="border rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            <h2 className="font-semibold">Assistente Inteligente</h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={localConfig?.usar_no_assistente_ajuda ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
              {localConfig?.usar_no_assistente_ajuda ? 'IA ativa na base' : 'IA sem base ativa'}
            </Badge>

            <Badge className={localConfig?.permitir_salarios ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}>
              {localConfig?.permitir_salarios ? 'Salários permitidos' : 'Salários restritos'}
            </Badge>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Usar Biblioteca de Conhecimento nas respostas</Label>
              <p className="text-xs text-gray-500 mt-1">
                Quando ativo, o assistente consulta os documentos indexados antes de responder.
              </p>
            </div>
            <Switch
              checked={!!localConfig?.usar_no_assistente_ajuda}
              onCheckedChange={(v) =>
                setLocalConfig((prev) => ({ ...prev, usar_no_assistente_ajuda: v }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Permitir respostas com salários e pagamentos</Label>
              <p className="text-xs text-gray-500 mt-1">
                Quando ativo, a IA pode responder com valores encontrados nos documentos.
              </p>
            </div>
            <Switch
              checked={!!localConfig?.permitir_salarios}
              onCheckedChange={(v) =>
                setLocalConfig((prev) => ({ ...prev, permitir_salarios: v }))
              }
            />
          </div>

          <div>
            <Label>Quantidade máxima de trechos por resposta</Label>
            <p className="text-xs text-gray-500 mt-1 mb-2">
              Define quantos chunks da Biblioteca de Conhecimento podem ser usados no contexto do assistente.
            </p>
            <Input
              type="number"
              min="1"
              max="20"
              value={localConfig?.max_chunks_por_resposta || 5}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  max_chunks_por_resposta: parseInt(e.target.value || '5', 10),
                }))
              }
            />
          </div>

          <div>
            <Label>Prompt base do assistente</Label>
            <p className="text-xs text-gray-500 mt-1 mb-2">
              Instruções principais que serão combinadas com os documentos ativos da base.
            </p>
            <Textarea
              value={localConfig?.prompt_base_assistente || ''}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  prompt_base_assistente: e.target.value,
                }))
              }
              placeholder="Instruções principais para a IA..."
              className="min-h-[180px]"
            />
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t flex-wrap gap-3">
          <Link to={createPageUrl('BaseConhecimento')}>
            <Button variant="outline" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Gerenciar Biblioteca
            </Button>
          </Link>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={restoreDefaults}
              className="gap-2"
              disabled={isLoading || updateMutation.isPending}
            >
              <RefreshCw className="w-4 h-4" />
              Restaurar padrão
            </Button>

            <Button
              onClick={save}
              className="bg-black text-white gap-2"
              disabled={isLoading || updateMutation.isPending}
            >
              <Save className="w-4 h-4" />
              {updateMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlataformaConfig() {
  return (
    <RequireAuth requireRole="COORDENADOR">
      <PlataformaConfigInner />
    </RequireAuth>
  );
}
