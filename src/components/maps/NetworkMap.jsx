import React, { useMemo } from 'react';

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

// Simular força de atração com base em aderência
function calcularPosicoes(opportunities) {
  const width = 800;
  const height = 600;
  const centerX = width / 2;
  const centerY = height / 2;

  // Usar modelo de força simples: nós com aderência alta mais próximos
  return opportunities.map((opp, idx) => {
    const angle = (idx / opportunities.length) * Math.PI * 2;
    const distancia = 80 + (1 - opp.nivel_aderencia / 100) * 60; // Mais aderência = mais próximo
    const x = centerX + distancia * Math.cos(angle);
    const y = centerY + distancia * Math.sin(angle);
    return { ...opp, x, y };
  });
}

export default function NetworkMap({ opportunities, selectedOpportunity, onSelectOpportunity, nomeMuseu }) {
  const containerRef = React.useRef(null);
  const [size, setSize] = React.useState({ width: 800, height: 600 });
  
  React.useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setSize({
          width: Math.min(800, containerRef.current.clientWidth - 40),
          height: 600
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const width = size.width;
  const height = size.height;
  const centerX = width / 2;
  const centerY = height / 2;

  const posicionadas = useMemo(() => calcularPosicoes(opportunities), [opportunities]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <svg width={width} height={height} className="drop-shadow-lg" style={{ maxWidth: '100%', height: 'auto' }}>
        {/* Conexões (espessura baseada em aderência) */}
        {posicionadas.map((opp) => {
          const strokeWidth = Math.max(0.5, (opp.nivel_aderencia / 100) * 3);
          return (
            <line
              key={`line-${opp.id}`}
              x1={centerX}
              y1={centerY}
              x2={opp.x}
              y2={opp.y}
              stroke={categoryColors[opp.categoria] || '#6B7280'}
              strokeWidth={strokeWidth}
              opacity={0.3 + (opp.nivel_aderencia / 100) * 0.5}
            />
          );
        })}

        {/* Nós de oportunidades */}
        {posicionadas.map((opp) => {
          const raio = 4 + (opp.nivel_aderencia / 100) * 4;
          return (
            <g
              key={opp.id}
              onClick={() => onSelectOpportunity(opp)}
              className="cursor-pointer transition-all"
            >
              <circle
                cx={opp.x}
                cy={opp.y}
                r={raio}
                fill={categoryColors[opp.categoria] || '#6B7280'}
                stroke={selectedOpportunity?.id === opp.id ? '#000' : '#FFF'}
                strokeWidth={selectedOpportunity?.id === opp.id ? 2.5 : 1.5}
                className="transition-all duration-200"
              />
              {selectedOpportunity?.id === opp.id && (
                <circle
                  cx={opp.x}
                  cy={opp.y}
                  r={raio + 6}
                  fill="none"
                  stroke="#000"
                  strokeWidth="1"
                  opacity="0.2"
                />
              )}
            </g>
          );
        })}

        {/* Centro - Museu */}
        <g>
          <circle cx={centerX} cy={centerY} r={24} fill="#1F2937" stroke="#FFF" strokeWidth="2" />
          <circle cx={centerX} cy={centerY} r={22} fill="#111827" />
          <text
            x={centerX}
            y={centerY + 6}
            textAnchor="middle"
            className="text-sm font-bold fill-white"
            dominantBaseline="middle"
          >
            {nomeMuseu?.substring(0, 3)}
          </text>
        </g>
      </svg>

      {/* Legenda */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-lg p-3 text-xs">
        <p className="text-slate-700 font-semibold mb-2">Tamanho: Volume | Espessura: Aderência</p>
        <div className="flex gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-slate-600">Baixa</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-slate-600" />
            <span className="text-slate-600">Alta</span>
          </div>
        </div>
      </div>
    </div>
  );
}