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

export default function RadialMap({ opportunities, selectedOpportunity, onSelectOpportunity, nomeMuseu }) {
  // Responsivo
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
  const maxRadius = Math.min(180, width / 4);

  // Agrupar por prioridade para criar anéis
  const anisPorPrioridade = {
    'Alta': 60,
    'Média': 120,
    'Baixa': 180,
  };

  const posicionadas = useMemo(() => {
    const grouped = { 'Alta': [], 'Média': [], 'Baixa': [] };
    opportunities.forEach(opp => {
      grouped[opp.prioridade || 'Média'].push(opp);
    });

    const resultado = [];
    Object.entries(grouped).forEach(([prioridade, opps]) => {
      const radius = anisPorPrioridade[prioridade];
      const angleSlice = (2 * Math.PI) / Math.max(opps.length, 1);

      opps.forEach((opp, idx) => {
        const angle = angleSlice * idx - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        resultado.push({ ...opp, x, y, radius, angle });
      });
    });

    return resultado;
  }, [opportunities]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <svg width={width} height={height} className="drop-shadow-lg" style={{ maxWidth: '100%', height: 'auto' }}>
        {/* Anéis de prioridade */}
        {Object.entries(anisPorPrioridade).map(([prioridade, radius]) => (
          <circle
            key={`ring-${prioridade}`}
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="2"
            strokeDasharray="4,4"
            opacity="0.5"
          />
        ))}

        {/* Labels dos anéis */}
        <text x={centerX} y={centerY + 65} textAnchor="middle" className="text-xs font-semibold fill-slate-400">
          ALTA PRIORIDADE
        </text>
        <text x={centerX} y={centerY + 125} textAnchor="middle" className="text-xs font-semibold fill-slate-400">
          MÉDIA PRIORIDADE
        </text>
        <text x={centerX} y={centerY + 185} textAnchor="middle" className="text-xs font-semibold fill-slate-400">
          BAIXA PRIORIDADE
        </text>

        {/* Conexões do centro aos nós */}
        {posicionadas.map((opp) => (
          <line
            key={`line-${opp.id}`}
            x1={centerX}
            y1={centerY}
            x2={opp.x}
            y2={opp.y}
            stroke="#CBD5E1"
            strokeWidth="1"
            opacity="0.3"
          />
        ))}

        {/* Nós de oportunidades */}
        {posicionadas.map((opp) => (
          <g
            key={opp.id}
            onClick={() => onSelectOpportunity(opp)}
            className="cursor-pointer transition-all"
          >
            <circle
              cx={opp.x}
              cy={opp.y}
              r={selectedOpportunity?.id === opp.id ? 10 : 7}
              fill={categoryColors[opp.categoria] || '#6B7280'}
              stroke={selectedOpportunity?.id === opp.id ? '#000' : '#FFF'}
              strokeWidth={selectedOpportunity?.id === opp.id ? 3 : 2}
              className="transition-all duration-200"
            />
            {selectedOpportunity?.id === opp.id && (
              <circle cx={opp.x} cy={opp.y} r={15} fill="none" stroke="#000" strokeWidth="1" opacity="0.2" />
            )}
          </g>
        ))}

        {/* Centro - Museu */}
        <g>
          <circle cx={centerX} cy={centerY} r={20} fill="#1F2937" stroke="#FFF" strokeWidth="2" />
          <circle cx={centerX} cy={centerY} r={18} fill="#111827" />
          <text
            x={centerX}
            y={centerY + 6}
            textAnchor="middle"
            className="text-xs font-bold fill-white"
            dominantBaseline="middle"
          >
            {nomeMuseu?.substring(0, 3)}
          </text>
        </g>
      </svg>

      {/* Legenda */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-lg p-3 text-xs">
        <div className="flex gap-4">
          {['Alta', 'Média', 'Baixa'].map(p => (
            <div key={p} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full border border-slate-300"
                style={{ borderColor: '#94A3B8', borderDasharray: '2,2' }}
              />
              <span className="text-slate-600">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}