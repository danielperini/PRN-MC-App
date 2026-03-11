import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw, MapPin, Zap } from 'lucide-react';
import MapaMobilizacaoMapa from '@/components/mobilizacao/MapaMobilizacaoMapa';

const MUSEUS = [
  { id: 'MHAB', nome: 'MHAB', label: 'Museu Histórico Abílio Barreto' },
  { id: 'MIS', nome: 'MIS', label: 'Museu da Imagem e do Som' },
  { id: 'MUMO', nome: 'MUMO', label: 'Museu de Mineralogia' }
];

export default function MapaMobilizacao() {
  const [museuAtivo, setMuseuAtivo] = useState('MHAB');
  const [carregando, setCarregando] = useState(false);

  // Carregar/atualizar dados de uma museu
  const handleAtualizarMapa = async (museu) => {
    setCarregando(true);
    try {
      await base44.functions.invoke('generateMobilizationMapData', { museu });
      // Refetch de dados
      refetch();
    } catch (error) {
      console.error('Erro ao atualizar mapa:', error);
    } finally {
      setCarregando(false);
    }
  };

  // Buscar oportunidades para museu ativo
  const { data: oportunidades = [], isLoading, refetch } = useQuery({
    queryKey: ['mobilizacao', museuAtivo],
    queryFn: () => base44.entities.MobilizationOpportunity.filter({ museu: museuAtivo }),
  });

  // Separar por categoria
  const mobilizacao = oportunidades.filter(o => o.categoria === 'MOBILIZACAO');
  const producao = oportunidades.filter(o => o.categoria === 'PRODUCAO');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Mapa de Oportunidades de Mobilização</h1>
          <p className="text-slate-600">Visualize escolas, universidades, serviços e infraestrutura ao redor de cada museu</p>
        </div>

        {/* Tabs de Museus */}
        <Tabs value={museuAtivo} onValueChange={setMuseuAtivo} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            {MUSEUS.map(m => (
              <TabsTrigger key={m.id} value={m.id} className="text-sm md:text-base">
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {MUSEUS.map(m => (
            <TabsContent key={m.id} value={m.id} className="space-y-6">
              {/* Mapa */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="aspect-video bg-slate-100">
                  {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-slate-500">Carregando mapa...</div>
                    </div>
                  ) : (
                    <MapaMobilizacaoMapa 
                      museu={m.id} 
                      oportunidades={oportunidades}
                    />
                  )}
                </div>
                <div className="p-4 border-t flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    <span className="font-semibold">{oportunidades.length}</span> oportunidades mapeadas
                  </div>
                  <Button
                    onClick={() => handleAtualizarMapa(m.id)}
                    disabled={carregando}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Atualizar Análise
                  </Button>
                </div>
              </div>

              {/* Seção Mobilização */}
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  Mobilização de Público ({mobilizacao.length})
                </h2>
                <div className="grid gap-3">
                  {mobilizacao.length === 0 ? (
                    <div className="text-slate-500 text-center py-8">Nenhuma oportunidade de mobilização encontrada</div>
                  ) : (
                    mobilizacao.slice(0, 6).map(opp => (
                      <div key={opp.id} className="bg-white p-4 rounded-lg border border-blue-100 hover:border-blue-300 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-slate-900">{opp.nome}</h3>
                            <p className="text-sm text-slate-500">{opp.bairro} • {opp.tipo_instituicao.replace(/_/g, ' ')}</p>
                            <div className="mt-2 flex gap-2 flex-wrap">
                              {opp.temas_afinidade?.slice(0, 3).map(t => (
                                <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-blue-600 mb-1">
                              Interesse: <span className="text-lg">{opp.score_interesse}</span>
                            </div>
                            <div className="text-xs text-slate-500">
                              Proximidade: {opp.score_proximidade}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Seção Produção */}
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-600" />
                  Infraestrutura & Produção ({producao.length})
                </h2>
                <div className="grid gap-3">
                  {producao.length === 0 ? (
                    <div className="text-slate-500 text-center py-8">Nenhum serviço de produção encontrado</div>
                  ) : (
                    producao.slice(0, 6).map(opp => (
                      <div key={opp.id} className="bg-white p-4 rounded-lg border border-amber-100 hover:border-amber-300 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-slate-900">{opp.nome}</h3>
                            <p className="text-sm text-slate-500">{opp.bairro} • {opp.tipo_instituicao.replace(/_/g, ' ')}</p>
                            <p className="text-sm text-slate-700 mt-2">{opp.insights_claude?.substring(0, 100)}...</p>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-amber-600 mb-1">
                              Score: <span className="text-lg">{opp.score_interesse}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}