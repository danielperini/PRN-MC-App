import React, { useMemo } from 'react';
import { MapPin, Zap } from 'lucide-react';

const MUSEU_COORDS = {
  MHAB: { lat: -19.9191, lng: -43.9385, nome: 'MHAB' },
  MIS: { lat: -19.9280, lng: -43.9447, nome: 'MIS' },
  MUMO: { lat: -19.9244, lng: -43.9432, nome: 'MUMO' }
};

const getCategoryColor = (tipo) => {
  const tipos = {
    ESCOLA_PUBLICA: '#3b82f6',
    ESCOLA_PRIVADA: '#60a5fa',
    ESCOLA_TECNICA: '#0ea5e9',
    UNIVERSIDADE: '#0284c7',
    CENTRO_CULTURA: '#1d4ed8',
    LAR_IDOSOS: '#2563eb',
    ASSOCIACAO: '#3b82f6',
    HOTEL: '#f59e0b',
    LOJA_FERRAMENTA: '#d97706',
    FOTOGRAFIA: '#ea580c',
    VIDEO: '#dc2626',
    CENOTECNIA: '#be123c',
    ELETRICISTA: '#ea580c',
    PINTOR: '#f97316',
    SERVICO_PRODUCAO: '#ea580c',
  };
  return tipos[tipo] || '#6b7280';
};

const getMapBounds = (museuId) => {
  const coords = MUSEU_COORDS[museuId];
  const raio = 0.05; // ~5km
  return {
    minLat: coords.lat - raio,
    maxLat: coords.lat + raio,
    minLng: coords.lng - raio,
    maxLng: coords.lng + raio,
    width: (coords.lng + raio) - (coords.lng - raio),
    height: (coords.lat + raio) - (coords.lat - raio)
  };
};

export default function MapaMobilizacaoMapa({ museu, oportunidades }) {
  const bounds = getMapBounds(museu);
  const museuCoord = MUSEU_COORDS[museu];

  // Normalizar coordenadas para posição no SVG
  const normalizeCoord = (lat, lng) => {
    const x = ((lng - bounds.minLng) / bounds.width) * 100;
    const y = ((bounds.maxLat - lat) / bounds.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  const museuPos = normalizeCoord(museuCoord.lat, museuCoord.lng);
  
  const pontosOps = oportunidades.map(opp => ({
    ...opp,
    pos: normalizeCoord(opp.coordenadas.lat, opp.coordenadas.lng),
    tamanho: (opp.score_interesse / 100) * 12 + 6,
    opacidade: 0.6 + (opp.score_proximidade / 100) * 0.4
  }));

  // Separar por categoria
  const opoMobilizacao = pontosOps.filter(o => o.categoria === 'MOBILIZACAO');
  const opoProducao = pontosOps.filter(o => o.categoria === 'PRODUCAO');

  const [hoveredId, setHoveredId] = React.useState(null);

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full bg-gradient-to-br from-sky-50 to-blue-50">
      {/* Grid de referência */}
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e0e7ff" strokeWidth="0.1"/>
        </pattern>
      </defs>
      <rect width="100" height="100" fill="url(#grid)" opacity="0.3"/>

      {/* Limite de área de atuação (raio) */}
      <circle
        cx={museuPos.x}
        cy={museuPos.y}
        r="25"
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="0.5"
        strokeDasharray="2,1"
        opacity="0.5"
      />

      {/* Pontos de Mobilização */}
      {opoMobilizacao.map(opp => (
        <g
          key={opp.id}
          onMouseEnter={() => setHoveredId(opp.id)}
          onMouseLeave={() => setHoveredId(null)}
          className="cursor-pointer"
        >
          <circle
            cx={opp.pos.x}
            cy={opp.pos.y}
            r={opp.tamanho}
            fill={getCategoryColor(opp.tipo_instituicao)}
            opacity={hoveredId === opp.id ? 1 : opp.opacidade}
            className="transition-all"
          />
          <circle
            cx={opp.pos.x}
            cy={opp.pos.y}
            r={opp.tamanho}
            fill="none"
            stroke={getCategoryColor(opp.tipo_instituicao)}
            strokeWidth="0.3"
            opacity={hoveredId === opp.id ? 1 : 0.5}
          />

          {/* Tooltip */}
          {hoveredId === opp.id && (
            <g>
              <rect
                x={opp.pos.x - 15}
                y={opp.pos.y - 12}
                width="30"
                height="20"
                rx="2"
                fill="#1e293b"
                opacity="0.95"
              />
              <text
                x={opp.pos.x}
                y={opp.pos.y - 6}
                textAnchor="middle"
                fill="white"
                fontSize="1.5"
                fontWeight="bold"
              >
                {opp.nome.substring(0, 15)}
              </text>
              <text
                x={opp.pos.x}
                y={opp.pos.y + 2}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="1"
              >
                Int: {opp.score_interesse}
              </text>
            </g>
          )}
        </g>
      ))}

      {/* Pontos de Produção */}
      {opoProducao.map(opp => (
        <g
          key={opp.id}
          onMouseEnter={() => setHoveredId(opp.id)}
          onMouseLeave={() => setHoveredId(null)}
          className="cursor-pointer"
        >
          {/* Quadrado para infraestrutura */}
          <rect
            x={opp.pos.x - opp.tamanho / 2}
            y={opp.pos.y - opp.tamanho / 2}
            width={opp.tamanho}
            height={opp.tamanho}
            fill={getCategoryColor(opp.tipo_instituicao)}
            opacity={hoveredId === opp.id ? 1 : opp.opacidade}
            className="transition-all"
          />
          <rect
            x={opp.pos.x - opp.tamanho / 2}
            y={opp.pos.y - opp.tamanho / 2}
            width={opp.tamanho}
            height={opp.tamanho}
            fill="none"
            stroke={getCategoryColor(opp.tipo_instituicao)}
            strokeWidth="0.3"
            opacity={hoveredId === opp.id ? 1 : 0.5}
          />

          {/* Tooltip */}
          {hoveredId === opp.id && (
            <g>
              <rect
                x={opp.pos.x - 15}
                y={opp.pos.y - 12}
                width="30"
                height="20"
                rx="2"
                fill="#1e293b"
                opacity="0.95"
              />
              <text
                x={opp.pos.x}
                y={opp.pos.y - 6}
                textAnchor="middle"
                fill="white"
                fontSize="1.5"
                fontWeight="bold"
              >
                {opp.nome.substring(0, 15)}
              </text>
              <text
                x={opp.pos.x}
                y={opp.pos.y + 2}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="1"
              >
                Prod: {opp.score_interesse}
              </text>
            </g>
          )}
        </g>
      ))}

      {/* Museu no Centro */}
      <g>
        <circle
          cx={museuPos.x}
          cy={museuPos.y}
          r="3"
          fill="#dc2626"
          filter="drop-shadow(0 0 1 rgba(220, 38, 38, 0.5))"
        />
        <circle
          cx={museuPos.x}
          cy={museuPos.y}
          r="3"
          fill="none"
          stroke="#dc2626"
          strokeWidth="1"
          opacity="0.5"
        />
        <text
          x={museuPos.x}
          y={museuPos.y + 6}
          textAnchor="middle"
          fill="#7f1d1d"
          fontSize="2"
          fontWeight="bold"
        >
          {museu}
        </text>
      </g>

      {/* Legenda */}
      <g>
        <text x="2" y="8" fontSize="2" fontWeight="bold" fill="#1e293b">Legenda</text>
        
        <circle cx="2.5" cy="12" r="0.8" fill="#3b82f6"/>
        <text x="4.5" y="12.5" fontSize="1.2" fill="#475569">Educação/Cultura</text>

        <rect x="2" y="15" width="1.6" height="1.6" fill="#f59e0b"/>
        <text x="4.5" y="15.8" fontSize="1.2" fill="#475569">Infraestrutura</text>

        <text x="2" y="19" fontSize="0.9" fill="#64748b">Tamanho = Interesse</text>
        <text x="2" y="21" fontSize="0.9" fill="#64748b">Opacidade = Proximidade</text>
      </g>
    </svg>
  );
}