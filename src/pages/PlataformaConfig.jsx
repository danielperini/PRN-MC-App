import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Plus, Trash2, Edit, BookOpen, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function PlataformaConfigInner() {
  const queryClient = useQueryClient();

  const { data: config = {} } = useQuery({
    queryKey: ['knowledge-config'],
    queryFn: async () => {
      const data = await base44.entities.KnowledgeLibrarySettings.list();
      return data[0] || {};
    }
  });

  const [localConfig, setLocalConfig] = useState(config);

  const updateMutation = useMutation({
    mutationFn: (data) => {
      if (config?.id) {
        return base44.entities.KnowledgeLibrarySettings.update(config.id, data);
      }
      return base44.entities.KnowledgeLibrarySettings.create(data);
    },
    onSuccess: () => {
      toast.success('Configuração salva');
      queryClient.invalidateQueries(['knowledge-config']);
    }
  });

  const save = () => {
    updateMutation.mutate(localConfig);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings /> Configuração da Plataforma
        </h1>
        <p className="text-gray-500 text-sm">
          Gerencie permissões e comportamento da IA do sistema
        </p>
      </div>

      {/* BLOCO IA / CONHECIMENTO */}
      <div className="border rounded-xl p-6 space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            <h2 className="font-semibold">Assistente Inteligente</h2>
          </div>

          <Badge>IA Ativa</Badge>
        </div>

        <div className="space-y-4">

          <div className="flex items-center justify-between">
            <Label>Usar Biblioteca de Conhecimento</Label>
            <Switch
              checked={localConfig?.usar_no_assistente_ajuda || false}
              onCheckedChange={(v) =>
                setLocalConfig({ ...localConfig, usar_no_assistente_ajuda: v })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Permitir resposta com salários e pagamentos</Label>
            <Switch
              checked={localConfig?.permitir_salarios || true}
              onCheckedChange={(v) =>
                setLocalConfig({ ...localConfig, permitir_salarios: v })
              }
            />
          </div>

          <div>
            <Label>Quantidade máxima de documentos por resposta</Label>
            <Input
              type="number"
              value={localConfig?.max_chunks_por_resposta || 3}
              onChange={(e) =>
                setLocalConfig({
                  ...localConfig,
                  max_chunks_por_resposta: parseInt(e.target.value)
                })
              }
            />
          </div>

          <div>
            <Label>Prompt base do assistente</Label>
            <Textarea
              value={localConfig?.prompt_base_assistente || ''}
              onChange={(e) =>
                setLocalConfig({
                  ...localConfig,
                  prompt_base_assistente: e.target.value
                })
              }
              placeholder="Instruções principais para a IA..."
            />
          </div>

        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <Link to={createPageUrl('BaseConhecimento')}>
            <Button variant="outline" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Gerenciar Biblioteca
            </Button>
          </Link>

          <Button onClick={save} className="bg-black text-white">
            Salvar Configurações
          </Button>
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
