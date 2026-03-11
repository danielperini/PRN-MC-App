import React from 'react';
import { MapPin, Zap, Target } from 'lucide-react';

export default function SimplifiedMapViewer({ pontos, museu }) {
  return (
    <div className="w-full bg-gray-50 p-6 rounded-lg">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📍 Pontos de Interesse Mapeados</h3>
        <p className="text-sm text-gray-600 mb-4">
          Total de {pontos.length} {pontos.length === 1 ? 'ponto' : 'pontos'} identificados na região
        </p>
      </div>

      {pontos.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Nenhum ponto mapeado ainda. Execute análise com IA para gerar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pontos.map((ponto, idx) => (
            <div key={ponto.id || idx} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">{ponto.nome}</h4>
                  <p className="text-xs text-gray-500">{ponto.categoria}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                  ponto.prioridade === 'Alta' ? 'bg-red-100 text-red-700' :
                  ponto.prioridade === 'Média' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {ponto.prioridade || 'Média'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin className="w-4 h-4" />
                  <span>{ponto.bairro || 'Não informado'}</span>
                </div>

                {ponto.aderencia_tematica !== undefined && (
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600" />
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 rounded h-2">
                        <div className="bg-blue-600 h-2 rounded" style={{width: `${ponto.aderencia_tematica}%`}} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Aderência: {ponto.aderencia_tematica}%</p>
                    </div>
                  </div>
                )}

                {ponto.oportunidades_sugeridas?.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Oportunidades
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {ponto.oportunidades_sugeridas.slice(0, 3).map((opp, i) => (
                        <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
                          {opp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}