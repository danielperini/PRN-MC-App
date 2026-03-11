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

export default function HeatMap({ opportunities, selectedOpportunity, onSelectOpportunity, nomeMuseu }) {
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
  const cellSize = 40;
  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);

  // Distribuir oportunidades em grid com intensidade
  const grid = useMemo(() => {
    const resultado = Array(rows).fill(null).map(() => Array(cols).fill(0));

    opportunities.forEach(opp => {
      const col = Math.floor(Math.random() * cols);
      const row = Math.floor(Math.random() * rows);
      // Intensidade baseada em aderência
      resultado[row][col] += opp.nivel_aderencia / 100;
    });

    return resultado;
  }, [opportunities]);

  // Normalizar para 0-1
  const maxIntensity = Math.max(...grid.map(r => Math.max(...r)));

  // Função de cor baseada em intensidade (gradiente azul -> vermelho)
  function getColorForIntensity(intensity) {
    const normalized = intensity / maxIntensity;
    if (normalized < 0.33) {
      return `rgb(100, 150, 255)`; // Azul
    } else if (normalized < 0.66) {
      return `rgb(255, 200, 100)`; // Laranja
    } else {
      return `rgb(255, 100, 100)`; // Vermelho
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <svg width={width} height={height} className="drop-shadow-lg" style={{ maxWidth: '100%', height: 'auto' }}>
        {/* Grid de calor */}
        {grid.map((row, r) =>
          row.map((intensity, c) => (
            <rect
              key={`cell-${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill={getColorForIntensity(intensity)}
              opacity={Math.min(0.7, intensity / maxIntensity + 0.1)}
              stroke="#E2E8F0"
              strokeWidth="0.5"
            />
          ))
        )}

        {/* Centro - Museu */}
        <g>
          <circle
            cx={width / 2}
            cy={height / 2}
            r={28}
            fill="#1F2937"
            stroke="#FFF"
            strokeWidth="3"
          />
          <circle cx={width / 2} cy={height / 2} r={26} fill="#111827" />
          <text
            x={width / 2}
            y={height / 2 + 7}
            textAnchor="middle"
            className="text-sm font-bold fill-white"
            dominantBaseline="middle"
          >
            {nomeMuseu?.substring(0, 3)}
          </text>
        </g>
      </svg>

      {/* Legenda de intensidade */}
      <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur rounded-lg p-3 text-xs">
        <p className="text-slate-700 font-semibold mb-2">Potencial de Mobilização</p>
        <div className="space-y-1.5">
          {[
            { cor: 'rgb(100, 150, 255)', label: 'Baixo' },
            { cor: 'rgb(255, 200, 100)', label: 'Médio' },
            { cor: 'rgb(255, 100, 100)', label: 'Alto' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: item.cor, opacity: 0.7 }} />
              <span className="text-slate-600">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}