import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, Sparkles, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function DepoimentosSection({ depoimentos = [], onChange, canEdit, museu }) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const MAX_DEPOIMENTOS = 5;

  const addDepoimento = () => {
    if (depoimentos.length >= MAX_DEPOIMENTOS) {
      toast.error(`Máximo de ${MAX_DEPOIMENTOS} depoimentos permitidos`);
      return;
    }
    onChange([...depoimentos, { texto: '', autor: '', data_criacao: new Date().toISOString() }]);
  };

  const updateDepoimento = (idx, field, value) => {
    const updated = [...depoimentos];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  const removeDepoimento = (idx) => {
    onChange(depoimentos.filter((_, i) => i !== idx));
  };

  const generateNews = async (idx) => {
    const dep = depoimentos[idx];
    if (!dep.texto) {
      toast.error('Preencha o texto do depoimento');
      return;
    }

    setGeneratingId(idx);
    try {
      const response = await base44.functions.invoke('transformDepoimentoEmNoticia', {
        texto: dep.texto,
        autor: dep.autor || 'Anônimo',
        museu: museu
      });

      if (response.data?.noticia) {
        toast.success('Notícia gerada! Verifique na curadoria IA');
        // Aqui integraria com o sistema de curadoria
      }
    } catch (error) {
      toast.error('Erro ao gerar notícia: ' + error.message);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-black pb-2 border-b border-gray-100 flex-1">
          Depoimentos ou Fatos Marcantes
        </h2>
        <span className="text-xs text-gray-500 ml-3">
          {depoimentos.length}/{MAX_DEPOIMENTOS}
        </span>
      </div>

      {depoimentos.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800">
            Depoimentos preenchidos serão transformados em notícias via Claude IA, mantendo citações exatas.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {depoimentos.map((dep, idx) => (
          <div key={idx} className="p-4 border border-gray-200 rounded-lg space-y-3 bg-gray-50">
            <div className="space-y-2">
              <Label className="text-xs text-gray-700">Depoimento/Fato Marcante</Label>
              <Textarea
                placeholder="Digite o depoimento ou fato marcante (citações exatas mantidas)..."
                value={dep.texto || ''}
                onChange={(e) => updateDepoimento(idx, 'texto', e.target.value)}
                disabled={!canEdit}
                className="resize-none"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-700">Autor/Fonte (opcional)</Label>
              <Input
                placeholder="Nome da pessoa ou fonte"
                value={dep.autor || ''}
                onChange={(e) => updateDepoimento(idx, 'autor', e.target.value)}
                disabled={!canEdit}
              />
            </div>

            {canEdit && (
              <div className="flex justify-between items-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateNews(idx)}
                  disabled={!dep.texto || generatingId === idx}
                  className="gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {generatingId === idx ? 'Gerando...' : 'Gerar Notícia'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDepoimento(idx)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remover
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canEdit && depoimentos.length < MAX_DEPOIMENTOS && (
        <Button variant="outline" onClick={addDepoimento} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Depoimento
        </Button>
      )}
    </section>
  );
}