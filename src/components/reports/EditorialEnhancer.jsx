import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function EditorialEnhancer({ reportId, mes, ano, museu, onEnhance }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const handleEnhance = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const resp = await base44.functions.invoke('enriquecerRelatorioEditorial', {
        reportId,
        mes,
        ano,
        museu
      });

      if (!resp.data?.success) {
        throw new Error(resp.data?.error || 'Erro ao enriquecer relatório');
      }

      setResultado(resp.data.editorial);
      if (onEnhance) onEnhance(resp.data.editorial);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!resultado) {
    return (
      <Card className="p-4 border border-blue-200 bg-blue-50">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-2">
              Enriquecimento Editorial
            </h3>
            <p className="text-sm text-blue-800 mb-3">
              Integrar releases, atividades e programação para criar narrativa editorial sofisticada.
            </p>
            <Button 
              onClick={handleEnhance} 
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? 'Processando...' : 'Enriquecer Relatório'}
            </Button>
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

  return (
    <Card className="p-4 border-2 border-green-200 bg-green-50">
      <div className="space-y-4">
        {resultado.introducao && (
          <div>
            <h4 className="font-semibold text-green-900 mb-2">Introdução Editorial</h4>
            <p className="text-sm text-green-800 italic">{resultado.introducao}</p>
          </div>
        )}

        {resultado.resumoExecutivo && (
          <div>
            <h4 className="font-semibold text-green-900 mb-2">Destaques do Período</h4>
            <div className="text-sm text-green-800 space-y-2">
              {resultado.resumoExecutivo.split('\n\n').map((item, i) => (
                <p key={i}>{item}</p>
              ))}
            </div>
          </div>
        )}

        {resultado.narrativaMetas && (
          <div>
            <h4 className="font-semibold text-green-900 mb-2">Metas Alcançadas</h4>
            <p className="text-sm text-green-800">{resultado.narrativaMetas}</p>
          </div>
        )}

        {resultado.releases && resultado.releases.length > 0 && (
          <div>
            <h4 className="font-semibold text-green-900 mb-2">
              Releases Relevantes ({resultado.totalReleases})
            </h4>
            <div className="space-y-2">
              {resultado.releases.map((r, i) => (
                <div key={i} className="text-sm bg-white p-2 rounded border border-green-200">
                  <p className="font-medium text-green-900">{r.titulo}</p>
                  {r.atividades_relacionadas && r.atividades_relacionadas.length > 0 && (
                    <p className="text-xs text-green-700 mt-1">
                      Vinculado a: {r.atividades_relacionadas.map(a => a.titulo).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-green-700 pt-2 border-t border-green-200">
          📊 {resultado.totalAtividades} atividades aprovadas • {resultado.totalProgramacoes} programações
        </div>
      </div>
    </Card>
  );
}