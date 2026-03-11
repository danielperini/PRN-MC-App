import React, { useState, useMemo } from 'react';
import { GoogleMap, LoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { X, MapPin } from 'lucide-react';

const MUSEUMS = {
  MHAB: {
    nome: 'MHAB - Museu Histórico Abílio Barreto',
    endereco: 'Avenida Prudente de Morais, 202, Cidade Jardim, Belo Horizonte/MG',
    lat: -19.9533,
    lng: -43.8697,
    color: '#EF4444'
  },
  MIS: {
    nome: 'MIS BH - Museu da Imagem e do Som',
    endereco: 'Avenida Álvares Cabral, 560, Belo Horizonte/MG',
    lat: -19.9320,
    lng: -43.9354,
    color: '#3B82F6'
  },
  MUMO: {
    nome: 'MUMO - Museu de Arte da Moda',
    endereco: 'Rua da Bahia, 1.149, Centro, Belo Horizonte/MG',
    lat: -19.9235,
    lng: -43.9264,
    color: '#8B5CF6'
  },
  Viaduto: {
    nome: 'Viaduto das Artes',
    endereco: 'Avenida Olinto Meireles, 45, Barreiro, Belo Horizonte/MG',
    lat: -19.9802,
    lng: -43.7851,
    color: '#F59E0B'
  }
};

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

export default function GoogleMapViewer({ pontos = [], museKey, onSelectPonto, filtros = {} }) {
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const museum = MUSEUMS[museKey];
  const centerMap = { lat: museum.lat, lng: museum.lng };

  // Filtrar pontos
  const filteredPontos = useMemo(() => {
    return pontos.filter(p => {
      if (categoryFilter && p.categoria !== categoryFilter) return false;
      if (priorityFilter && p.prioridade !== priorityFilter) return false;
      return true;
    });
  }, [pontos, categoryFilter, priorityFilter]);

  // Extrair categorias únicas
  const categories = useMemo(() => {
    return [...new Set(pontos.map(p => p.categoria))].sort();
  }, [pontos]);

  const priorities = ['Alta', 'Média', 'Baixa'];

  return (
    <div className="w-full h-full flex flex-col">
      {/* Filtros */}
      <div className="bg-white border-b p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-sm text-gray-900 mb-2">Filtros</h3>
          <div className="flex gap-2 flex-wrap">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas as categorias</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas as prioridades</option>
              {priorities.map(pri => (
                <option key={pri} value={pri}>{pri}</option>
              ))}
            </select>

            {(categoryFilter || priorityFilter) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCategoryFilter('');
                  setPriorityFilter('');
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-600">
          {filteredPontos.length} de {pontos.length} pontos visíveis
        </p>
      </div>

      {/* Mapa */}
      <div className="flex-1">
        <LoadScript googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={centerMap}
            zoom={13}
            options={{
              styles: [
                { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
                { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
                { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d6d1' }] },
              ]
            }}
          >
            {/* Marcador do museu */}
            <Marker
              position={centerMap}
              title={museum.nome}
              icon={{
                path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z',
                fillColor: museum.color,
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
                scale: 2
              }}
              onClick={() => setSelectedMarker({ type: 'museum', data: museum })}
            />

            {/* Marcadores dos pontos */}
            {filteredPontos.map(ponto => (
              <Marker
                key={ponto.id}
                position={{ lat: ponto.coordenadas_lat, lng: ponto.coordenadas_lon }}
                title={ponto.nome}
                icon={{
                  path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-13c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z',
                  fillColor: ponto.prioridade === 'Alta' ? '#EF4444' : ponto.prioridade === 'Média' ? '#F59E0B' : '#6B7280',
                  fillOpacity: 0.8,
                  strokeColor: '#fff',
                  strokeWeight: 1.5,
                  scale: 1.5
                }}
                onClick={() => {
                  setSelectedMarker({ type: 'ponto', data: ponto });
                  onSelectPonto?.(ponto);
                }}
              />
            ))}

            {/* Info Window */}
            {selectedMarker && (
              <InfoWindow
                position={
                  selectedMarker.type === 'museum'
                    ? { lat: selectedMarker.data.lat, lng: selectedMarker.data.lng }
                    : { lat: selectedMarker.data.coordenadas_lat, lng: selectedMarker.data.coordenadas_lon }
                }
                onCloseClick={() => setSelectedMarker(null)}
              >
                <div className="p-3 max-w-xs">
                  {selectedMarker.type === 'museum' ? (
                    <>
                      <h3 className="font-bold text-sm text-gray-900">{selectedMarker.data.nome}</h3>
                      <p className="text-xs text-gray-600 mt-1">{selectedMarker.data.endereco}</p>
                    </>
                  ) : (
                    <>
                      <h3 className="font-bold text-sm text-gray-900">{selectedMarker.data.nome}</h3>
                      <p className="text-xs text-gray-500 mt-1">{selectedMarker.data.categoria}</p>
                      <p className="text-xs text-gray-500">{selectedMarker.data.bairro}</p>
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="text-xs">
                          <span className="font-semibold">Aderência:</span> {selectedMarker.data.aderencia_tematica || 0}%
                        </p>
                        <p className="text-xs">
                          <span className="font-semibold">Prioridade:</span> {selectedMarker.data.prioridade}
                        </p>
                        {selectedMarker.data.oportunidades_sugeridas?.length > 0 && (
                          <p className="text-xs mt-1">
                            <span className="font-semibold">Oportunidades:</span> {selectedMarker.data.oportunidades_sugeridas.join(', ')}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </LoadScript>
      </div>
    </div>
  );
}