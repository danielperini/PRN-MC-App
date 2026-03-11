import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Zap, MapPin, List } from 'lucide-react';
import RadialMap from '@/components/maps/RadialMap';
import NetworkMap from '@/components/maps/NetworkMap';
import HeatMap from '@/components/maps/HeatMap';
import OpportunityPanel from '@/components/maps/OpportunityPanel';
import FilterBar from '@/components/maps/FilterBar';
import CurationPanel from '@/components/maps/CurationPanel';
import MobilizationSummaryCard from '@/components/maps/MobilizationSummaryCard';
import RequireAuth from '@/components/auth/RequireAuth';

function MhaabMapInner() {
  const [tipoMapa, setTipoMapa] = useState('radial');
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroPublico, setFiltroPublico] = useState('');
  const [filtroPrioridade, setFiltroPrioridade] = useState('');
  const [showCuration, setShowCuration] = useState(false);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);

  const { data: opportunities = [], refetch: refetchOps } = useQuery({
    queryKey: ['territorial-opportunities', 'MHAB'],
    queryFn: async () => {
      const res = await base44.functions.invoke('enrichOpportunitiesWithProgramacoes', {
        museu_sigla: 'MHAB',
      });
      return res.data.opportunities || [];
    },
  });

  const filtradas = opportunities.filter(opp => {
    if (filtroCategoria && opp.categoria !== filtroCategoria) return false;
    if (filtroPublico && !opp.publicos_alvo?.includes(filtroPublico)) return false;
    if (filtroPrioridade && opp.prioridade !== filtroPrioridade) return false;
    return true;
  });

  const handleRefreshAnalysis = async () => {
    setIsLoadingAnalysis(true);
    try {
      const res = await base44.functions.invoke('analyzeTerritorialActivity', {
        museu_sigla: 'MHAB',
      });
      if (res.data) {
        await refetchOps();
      }
    } catch (err) {
      console.error('Erro na análise:', err);
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  const handleReset = () => {
    setFiltroCategoria('');
    setFiltroPublico('');
    setFiltroPrioridade('');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                <MapPin className="w-4 h-4" />
                MHAB
              </div>
              <h1 className="text-3xl font-bold text-slate-900">
                Museu Histórico Abílio Barreto
              </h1>
              <p className="text-slate-600 mt-1">
                Patrimônio, memória e educação — articulação territorial
              </p>
            </div>
          </div>

          {/* Controles */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 uppercase">Visualização:</span>
              {['radial', 'rede', 'calor'].map(tipo => (
                <Button
                  key={tipo}
                  size="sm"
                  variant={tipoMapa === tipo ? 'default' : 'outline'}
                  onClick={() => setTipoMapa(tipo)}
                  className="capitalize"
                >
                  {tipo === 'radial' ? 'Radial' : tipo === 'rede' ? 'Rede' : 'Calor'}
                </Button>
              ))}
            </div>

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCuration(!showCuration)}
              className="gap-2"
            >
              <List className="w-4 h-4" />
              {showCuration ? 'Ocultar' : 'Ver'} Curadoria
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleRefreshAnalysis}
              disabled={isLoadingAnalysis}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Zap className="w-4 h-4" />
              {isLoadingAnalysis ? 'Analisando...' : 'Atualizar IA'}
            </Button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <FilterBar
        filtroCategoria={filtroCategoria}
        setFiltroCategoria={setFiltroCategoria}
        filtroPublico={filtroPublico}
        setFiltroPublico={setFiltroPublico}
        filtroPrioridade={filtroPrioridade}
        setFiltroPrioridade={setFiltroPrioridade}
        onReset={handleReset}
      />

      {/* Conteúdo */}
      <div className="relative max-w-7xl mx-auto px-6 py-8 flex gap-8">
        {/* Mapa */}
        <div className="flex-1 min-h-[600px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {tipoMapa === 'radial' && (
            <RadialMap
              opportunities={filtradas}
              selectedOpportunity={selectedOpp}
              onSelectOpportunity={setSelectedOpp}
              nomeMuseu="MHAB"
            />
          )}
          {tipoMapa === 'rede' && (
            <NetworkMap
              opportunities={filtradas}
              selectedOpportunity={selectedOpp}
              onSelectOpportunity={setSelectedOpp}
              nomeMuseu="MHAB"
            />
          )}
          {tipoMapa === 'calor' && (
            <HeatMap
              opportunities={filtradas}
              selectedOpportunity={selectedOpp}
              onSelectOpportunity={setSelectedOpp}
              nomeMuseu="MHAB"
            />
          )}

          {/* Painel de Oportunidade */}
          {selectedOpp && (
            <OpportunityPanel
              opportunity={selectedOpp}
              onClose={() => setSelectedOpp(null)}
            />
          )}
        </div>

        {/* Painel de Curadoria */}
        {showCuration && (
          <div className="w-96 max-h-[calc(100vh-200px)] overflow-y-auto">
            <CurationPanel
              opportunities={filtradas}
              onRefreshAnalysis={handleRefreshAnalysis}
              isLoadingAnalysis={isLoadingAnalysis}
              nomeMuseu="MHAB"
            />
          </div>
        )}
      </div>

      {/* Resumo de Mobilização */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <MobilizationSummaryCard museu_sigla="MHAB" title="Museu Histórico Abílio Barreto" />
      </div>
    </div>
  );
}

export default function MhaabMap() {
  return <RequireAuth><MhaabMapInner /></RequireAuth>;
}