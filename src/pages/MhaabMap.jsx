import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import SimplifiedMapViewer from '@/components/maps/SimplifiedMapViewer';
import { Button } from '@/components/ui/button';
import { RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function MhaabMap() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: pontos = [], refetch } = useQuery({
    queryKey: ['pontos-mhab'],
    queryFn: () => base44.entities.PontoEntorno.filter({ museu_sigla: 'MHAB', ativo: true }),
  });

  const handleAnalyzeOpportunities = async () => {
    setIsAnalyzing(true);
    try {
      await base44.functions.invoke('analisarOportunidadesMuseu', {
        museu_sigla: 'MHAB',
      });
      await refetch();
      toast.success('Análise concluída!');
    } catch (error) {
      toast.error('Erro ao analisar: ' + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Análise resumida dos dados
  const analise = {
    total: pontos.length,
    altaPrioridade: pontos.filter(p => p.prioridade === 'Alta').length,
    aderenciaMedia: pontos.length > 0 ? Math.round(pontos.reduce((s, p) => s + (p.aderencia_tematica || 0), 0) / pontos.length) : 0,
    categorias: [...new Set(pontos.map(p => p.categoria).filter(Boolean))],
    bairros: [...new Set(pontos.map(p => p.bairro).filter(Boolean))],
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-black tracking-tight">MHAB - Museu e Território</h1>
            <p className="text-gray-600 mt-2">Avenida Prudente de Morais, 202, Cidade Jardim</p>
          </div>
          <Button
            onClick={handleAnalyzeOpportunities}
            disabled={isAnalyzing}
            className="bg-black hover:bg-gray-800 text-white gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            {isAnalyzing ? 'Analisando...' : 'Analisar com IA'}
          </Button>
        </div>

        {/* Resumo Executivo */}
        {pontos.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <div className="flex items-start gap-3 mb-4">
              <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900 mb-3">📊 Resumo da Análise Territorial</h2>
                <div className="space-y-2 text-sm text-gray-700">
                  <p>
                    <strong>Total de Pontos Identificados:</strong> {analise.total} instituições/locais mapeados na região estratégica do museu
                  </p>
                  <p>
                    <strong>Prioridade Alta:</strong> {analise.altaPrioridade} {analise.altaPrioridade === 1 ? 'ponto' : 'pontos'} com potencial imediato de parceria e mobilização
                  </p>
                  <p>
                    <strong>Aderência Temática Média:</strong> {analise.aderenciaMedia}% de alinhamento com a missão do MHAB (patrimônio, história, memória)
                  </p>
                  {analise.categorias.length > 0 && (
                    <p>
                      <strong>Tipos de Instituições:</strong> {analise.categorias.slice(0, 5).join(', ')}{analise.categorias.length > 5 ? `... (+${analise.categorias.length - 5})` : ''}
                    </p>
                  )}
                  {analise.bairros.length > 0 && (
                    <p>
                      <strong>Bairros Cobertos:</strong> {analise.bairros.slice(0, 5).join(', ')}{analise.bairros.length > 5 ? `... (+${analise.bairros.length - 5})` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mapa Simplificado */}
        <SimplifiedMapViewer pontos={pontos} museu="MHAB" />
      </div>
    </div>
  );
}