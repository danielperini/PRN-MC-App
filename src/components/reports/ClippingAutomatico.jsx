import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, ExternalLink, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function ClippingAutomatico({ atividade, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [clipping, setClipping] = useState(atividade?.clipping_automatico || null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const searchClipping = async () => {
    if (!atividade.nome) {
      toast.warning('Informe o nome da atividade para buscar notícias');
      return;
    }

    setLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Procure por notícias, posts em redes sociais e matérias em jornais relacionadas a: "${atividade.nome}"${atividade.museu ? ` no ${atividade.museu}` : ''}. Forneça os 3 melhores resultados encontrados com título, resumo (máx 100 caracteres) e URL.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            clippings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  resumo: { type: 'string' },
                  url: { type: 'string' },
                  fonte: { type: 'string' }
                }
              }
            }
          }
        }
      });

      if (result?.clippings && result.clippings.length > 0) {
        setClipping(result.clippings);
        onUpdate('clipping_automatico', result.clippings);
        toast.success('Clipping encontrado!', { description: `${result.clippings.length} notícia(s) localizadas` });
      } else {
        toast.info('Nenhuma notícia encontrada para esta atividade');
        setClipping(null);
      }
    } catch (error) {
      toast.error('Erro ao buscar clipping', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success('Copiado!');
  };

  const clearClipping = () => {
    setClipping(null);
    onUpdate('clipping_automatico', null);
  };

  return (
    <div className="p-4 border border-blue-100 bg-blue-50/30 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">📰 Clipping Automático</p>
        {clipping?.length > 0 && (
          <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
            {clipping.length} resultado(s)
          </Badge>
        )}
      </div>

      {!clipping || clipping.length === 0 ? (
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={searchClipping}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Buscando notícias...' : 'Buscar Notícias e Redes Sociais'}
          </Button>
          {clipping !== null && clipping.length === 0 && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-xs text-gray-500">Não foram localizadas notícias ou posts relacionados a esta atividade</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {clipping.map((item, idx) => (
            <div key={idx} className="p-3 bg-white border border-blue-100 rounded-lg space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-black leading-tight">{item.titulo}</p>
                  <p className="text-xs text-gray-600 mt-1">{item.resumo}</p>
                  {item.fonte && (
                    <Badge variant="outline" className="text-xs mt-2">
                      {item.fonte}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver link
                  </a>
                )}
                <button
                  onClick={() => copyToClipboard(`${item.titulo}\n${item.resumo}\n${item.url || ''}`, idx)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={searchClipping}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
              Buscar Novamente
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700"
              onClick={clearClipping}
            >
              Limpar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}