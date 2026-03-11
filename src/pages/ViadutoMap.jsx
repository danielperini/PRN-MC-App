import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import GoogleMapViewer from '@/components/maps/GoogleMapViewer';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function ViadutoMap() {
  const [selectedPonto, setSelectedPonto] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: pontos = [], refetch } = useQuery({
    queryKey: ['pontos-viaduto'],
    queryFn: () => base44.entities.PontoEntorno.filter({ museu_sigla: 'Viaduto das Artes', ativo: true }),
  });

  const handleAnalyzeOpportunities = async () => {
    setIsAnalyzing(true);
    try {
      await base44.functions.invoke('analisarOportunidadesMuseu', {
        museu_sigla: 'Viaduto das Artes',
      });
      refetch();
    } catch (error) {
      console.error('Erro ao analisar:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Viaduto das Artes - Análise Territorial</h1>
          <p className="text-sm text-gray-600 mt-1">Avenida Olinto Meireles, 45, Barreiro</p>
        </div>
        <Button
          onClick={handleAnalyzeOpportunities}
          disabled={isAnalyzing}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
          {isAnalyzing ? 'Analisando...' : 'Analisar com IA'}
        </Button>
      </div>

      <div className="flex-1">
        <GoogleMapViewer
          pontos={pontos}
          museKey="Viaduto"
          onSelectPonto={setSelectedPonto}
        />
      </div>

      {selectedPonto && (
        <div className="absolute bottom-0 right-0 w-80 bg-white rounded-tl-lg shadow-lg border-l border-t p-4 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-start mb-4">
            <h2 className="font-bold text-gray-900">{selectedPonto.nome}</h2>
            <button onClick={() => setSelectedPonto(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-gray-600">Categoria</p>
              <p className="font-semibold text-gray-900">{selectedPonto.categoria}</p>
            </div>
            
            <div>
              <p className="text-gray-600">Aderência Temática</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${selectedPonto.aderencia_tematica || 0}%` }}
                />
              </div>
              <p className="text-gray-700 mt-1">{selectedPonto.aderencia_tematica || 0}%</p>
            </div>

            <div>
              <p className="text-gray-600">Prioridade</p>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-1 ${
                selectedPonto.prioridade === 'Alta' ? 'bg-red-100 text-red-800' :
                selectedPonto.prioridade === 'Média' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {selectedPonto.prioridade}
              </span>
            </div>

            {selectedPonto.oportunidades_sugeridas?.length > 0 && (
              <div>
                <p className="text-gray-600 mb-2">Oportunidades Sugeridas</p>
                <div className="flex flex-wrap gap-1">
                  {selectedPonto.oportunidades_sugeridas.map((opp, i) => (
                    <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">
                      {opp}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}