import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle, Sparkles, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

export default function SociologicalLanguageEnhancer({
  atividades = [],
  onApplySintese,
  onApplyDetalhes,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleEnhance = async () => {
    if (!Array.isArray(atividades) || atividades.length === 0) {
      toast.error('Adicione atividades primeiro');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resp = await base44.functions.invoke('enriquecerComLenguagemSociologica', {
        reportId: crypto.randomUUID(),
        atividades,
        patterns: null,
      });

      if (!resp.data?.success) {
        throw new Error(resp.data?.error || 'Erro ao enriquecer');
      }

      setResultado(resp.data);
      toast.success('Linguagem sociológica enriquecida!');
    } catch (err) {
      setError(err.message);
      toast.error('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, index = null) => {
    await navigator.clipboard.writeText(text);
    if (index !== null) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
    toast.success('Copiado!');
  };

  if (!resultado) {
    return (
      <Card className="p-4 border border-indigo-200 bg-indigo-50">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-indigo-900 mb-2">
              Enriquecimento Linguístico Sociológico
            </h3>
            <p className="text-sm text-indigo-800 mb-3">
              Incorporar linguagem de participação, mediação cultural e pertencimento territorial nas narrativas.
            </p>
            <Button
              onClick={handleEnhance}
              disabled={loading || atividades.length === 0}
              variant="outline"
              size="sm"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? 'Processando...' : 'Enriquecer Linguagem'}
            </Button>
            {atividades.length === 0 && (
              <p className="text-xs text-indigo-700 mt-2">ℹ️ Nenhuma atividade para análise</p>
            )}
          </div>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded text-sm text-red-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </Card>
    );
  }

  const { sinteseSociologica, atividadesDestacadas, totalAtividades, totalParticipantes } =
    resultado;

  return (
    <Card className="p-4 border-2 border-indigo-200 bg-indigo-50 space-y-4">
      {/* Síntese Geral */}
      <div className="bg-white p-4 rounded-lg border border-indigo-200">
        <h4 className="font-semibold text-indigo-900 mb-3">📖 Síntese Sociológica Integrada</h4>
        <p className="text-sm text-indigo-800 leading-relaxed italic mb-3">
          {sinteseSociologica}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => copyToClipboard(sinteseSociologica)}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            <Copy className="w-3 h-3 mr-1" /> Copiar Síntese
          </Button>
          {onApplySintese && (
            <Button
              onClick={() => {
                onApplySintese(sinteseSociologica);
                toast.success('Síntese aplicada ao relatório');
              }}
              variant="outline"
              size="sm"
              className="text-xs bg-indigo-100 border-indigo-300"
            >
              ✓ Usar no Relatório
            </Button>
          )}
        </div>
      </div>

      {/* Atividades Destacadas */}
      {atividadesDestacadas && atividadesDestacadas.length > 0 && (
        <div>
          <h4 className="font-semibold text-indigo-900 mb-3">💡 Narrativas por Atividade</h4>
          <div className="space-y-3">
            {atividadesDestacadas.map((item, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-indigo-200">
                <p className="font-medium text-indigo-900 text-sm mb-2">{item.titulo}</p>
                <p className="text-sm text-indigo-800 italic mb-2">{item.frase}</p>
                <Button
                  onClick={() => copyToClipboard(item.frase, i)}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  {copiedIndex === i ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedIndex === i ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estatísticas */}
      <div className="text-xs text-indigo-700 pt-2 border-t border-indigo-200 space-y-1">
        <p>📊 {totalAtividades} atividades analisadas</p>
        <p>👥 {totalParticipantes.toLocaleString('pt-BR')} participantes mapeados</p>
      </div>

      {/* Botão de Regenerar */}
      <Button
        onClick={() => setResultado(null)}
        variant="outline"
        size="sm"
        className="text-xs w-full"
      >
        Gerar Novo Enriquecimento
      </Button>
    </Card>
  );
}