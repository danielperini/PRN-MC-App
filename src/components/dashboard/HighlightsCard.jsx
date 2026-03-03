import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HighlightsCard() {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHighlights = async () => {
      try {
        setLoading(true);
        const reports = await base44.entities.Report.list('-created_date', 100);
        
        const allHighlights = [];
        reports.forEach(report => {
          const atividades = Array.isArray(report.atividades) ? report.atividades : [];
          atividades.forEach(ativ => {
            if (ativ.depoimento_participantes && ativ.depoimento_participantes.trim()) {
              allHighlights.push({
                id: `${report.id}-${ativ.nome}`,
                mes: report.mes_referencia,
                ano: report.ano,
                museu: report.museu,
                atividade: ativ.nome,
                depoimento: ativ.depoimento_participantes,
                autor: report.author_name,
                data: report.created_date,
              });
            }
          });
        });

        // Ordenar por data decrescente e pegar os 5 mais recentes
        const recent = allHighlights.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
        setHighlights(recent);
      } catch (error) {
        console.error('Erro ao carregar fatos marcantes:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHighlights();
  }, []);

  if (loading) {
    return (
      <div className="p-6 border border-gray-100 rounded-2xl bg-gradient-to-br from-purple-50 to-white">
        <p className="text-sm text-gray-400">Carregando...</p>
      </div>
    );
  }

  if (highlights.length === 0) {
    return (
      <div className="p-6 border border-gray-100 rounded-2xl bg-gradient-to-br from-purple-50 to-white">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-black">Fatos Marcantes</h3>
        </div>
        <p className="text-sm text-gray-500">Nenhum fato marcante registrado ainda</p>
      </div>
    );
  }

  return (
    <div className="p-6 border border-purple-100 rounded-2xl bg-gradient-to-br from-purple-50 to-white">
      <div className="flex items-center gap-3 mb-5">
        <Sparkles className="w-5 h-5 text-purple-600" />
        <h3 className="font-semibold text-black">Fatos Marcantes</h3>
      </div>

      <div className="space-y-4">
        {highlights.map((item, idx) => (
          <div key={item.id} className="pb-4 border-b border-purple-100 last:border-b-0 last:pb-0">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-purple-500 mt-2" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-black line-clamp-2">
                  {item.atividade}
                </p>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                  {item.depoimento}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                    {item.mes} {item.ano}
                  </span>
                  <span className="text-[11px] text-gray-500">{item.museu}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}