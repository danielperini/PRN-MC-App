import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const categoryColors = {
  'Escolas Municipais': '#3B82F6',
  'Escolas Estaduais': '#60A5FA',
  'Escolas Secundaristas': '#93C5FD',
  'EJA': '#DBEAFE',
  'Escolas Técnicas': '#0EA5E9',
  'Universidades e Faculdades': '#0284C7',
  'Centros Culturais': '#7C3AED',
  'Bibliotecas': '#A855F7',
  'Lares de Idosos e Centros de Convivência': '#D946EF',
  'Associações e Coletivos': '#EC4899',
  'Grupos de Fotografia': '#F43F5E',
  'Grupos de Cinema e Audiovisual': '#F97316',
  'Grupos de Moda': '#FFA500',
  'Grupos de Patrimônio, Memória e Museologia': '#EAB308',
  'Oportunidades de Formação e Mobilização': '#84CC16',
};

function MapBounds({ opportunities }) {
  const map = useMap();

  useEffect(() => {
    if (!map || opportunities.length === 0) return;
    
    const validPoints = opportunities.filter(o => o.coordenadas_lat && o.coordenadas_lon);
    if (validPoints.length === 0) return;

    const bounds = L.latLngBounds(
      validPoints.map(o => [o.coordenadas_lat, o.coordenadas_lon])
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [opportunities, map]);

  return null;
}

function createCustomIcon(categoria) {
  const color = categoryColors[categoria] || '#6B7280';
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 8px;
          height: 8px;
          background-color: white;
          border-radius: 50%;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    className: 'custom-icon'
  });
}

export default function GeoMap({ opportunities, selectedOpportunity, onSelectOpportunity, nomeMuseu }) {
  const [mapReady, setMapReady] = useState(false);

  // Centro padrão: Belo Horizonte
  const defaultCenter = [-19.9191, -43.9386];
  const defaultZoom = 13;

  useEffect(() => {
    // Fixar ícone padrão do Leaflet
    if (L.Icon?.Default?.prototype) {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
      });
    }
    setMapReady(true);
  }, []);

  if (!mapReady) {
    return <div className="w-full h-full bg-gray-100 flex items-center justify-center">Carregando mapa...</div>;
  }

  const center = defaultCenter;

  return (
    <div className="w-full h-full relative">
      <MapContainer 
        center={center} 
        zoom={defaultZoom} 
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%', zIndex: 1 }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        
        {opportunities.filter(o => o.coordenadas_lat && o.coordenadas_lon).map((opp) => (
          <Marker
            key={opp.id}
            position={[opp.coordenadas_lat, opp.coordenadas_lon]}
            icon={createCustomIcon(opp.categoria)}
            eventHandlers={{
              click: () => onSelectOpportunity(opp),
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold text-gray-900">{opp.nome}</p>
                <p className="text-xs text-gray-600">{opp.categoria}</p>
                <p className="text-xs text-gray-600">Aderência: {opp.nivel_aderencia}%</p>
              </div>
            </Popup>
          </Marker>
        ))}

        <MapBounds opportunities={opportunities} />
      </MapContainer>
    </div>
  );
}