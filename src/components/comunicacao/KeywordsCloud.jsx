import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tag } from 'lucide-react';

const ALL_KEYWORDS = [
  'Museus Centro', 'MIS', 'MHAB', 'MUMO', 'Viaduto das Artes',
  'Noturno nos Museus', 'Semana Nacional de Museus',
  'Formação', 'Educação', 'Cultura', 'Patrimônio', 'Memória',
  'Ação educativa', 'Oficina', 'Exposição', 'Visita mediada',
  'Programação', 'Arte', 'BH', 'Belo Horizonte',
  'Fundação Municipal de Cultura', 'FMC',
];

function normalizeText(v = '') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export default function KeywordsCloud({ clippingItems = [] }) {
  const ranked = useMemo(() => {
    const counts = {};
    ALL_KEYWORDS.forEach(kw => { counts[kw] = 0; });

    clippingItems.forEach(item => {
      const text = normalizeText([
        item.title, item.summary, item.sourceName,
        ...(item.relatedTo || [])
      ].join(' '));

      ALL_KEYWORDS.forEach(kw => {
        if (text.includes(normalizeText(kw)) ||
          (item.relatedTo || []).some(t => normalizeText(t).includes(normalizeText(kw)))) {
          counts[kw] = (counts[kw] || 0) + 1;
        }
      });
    });

    return Object.entries(counts)
      .filter(([, c]) => c > 0)
      .sort(([, a], [, b]) => b - a);
  }, [clippingItems]);

  const max = ranked[0]?.[1] || 1;

  function sizeClass(count) {
    const ratio = count / max;
    if (ratio >= 0.8) return 'text-base font-bold';
    if (ratio >= 0.5) return 'text-sm font-semibold';
    if (ratio >= 0.3) return 'text-xs font-medium';
    return 'text-[11px] font-normal';
  }

  return (
    <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-black" />
          <h2 className="text-lg font-semibold text-black">Palavras-chave mais citadas</h2>
        </div>

        {ranked.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
            Nenhuma palavra-chave detectada ainda.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 items-end">
            {ranked.map(([kw, count]) => (
              <span
                key={kw}
                className={`${sizeClass(count)} inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100 transition-colors cursor-default`}
                title={`${count} menção(ões)`}
              >
                {kw}
                <span className="text-[10px] text-gray-400 tabular-nums">×{count}</span>
              </span>
            ))}
          </div>
        )}

        {ranked.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Ranking Top 5</p>
            <div className="space-y-1">
              {ranked.slice(0, 5).map(([kw, count], i) => (
                <div key={kw} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4 tabular-nums">{i + 1}.</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-black rounded-full"
                      style={{ width: `${Math.round((count / max) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-700 font-medium w-28 truncate">{kw}</span>
                  <Badge variant="outline" className="text-[10px] bg-white">{count}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}