import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';

const MUSEUS = ['MIS', 'MHAB', 'MUMO', 'Noturno nos Museus', 'Geral'];

const MUSEU_ALIASES = {
  'MIS': ['MIS', 'MIS BH', 'Museu da Imagem e do Som'],
  'MHAB': ['MHAB', 'Museu Histórico Abílio Barreto', 'Abílio Barreto'],
  'MUMO': ['MUMO', 'Museu da Moda'],
  'Noturno nos Museus': ['Noturno nos Museus', 'Noturno'],
  'Geral': ['Museus Centro', 'Viaduto das Artes', 'Museus Centro BH'],
};

function normalizeText(v = '') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function countForMuseu(museu, items) {
  const aliases = MUSEU_ALIASES[museu] || [museu];
  return items.filter(item => {
    const text = normalizeText([
      item.title, item.summary, item.sourceName,
      ...(item.relatedTo || [])
    ].join(' '));
    return aliases.some(alias => text.includes(normalizeText(alias)));
  }).length;
}

export default function ImpactoMuseu({ clippingItems = [], driveItems = [] }) {
  const data = useMemo(() => {
    return MUSEUS.map(museu => {
      const clipping = countForMuseu(museu, clippingItems);
      const posts = driveItems.filter(f => {
        const text = normalizeText(f.name + ' ' + (f.sourceFolderName || ''));
        const aliases = MUSEU_ALIASES[museu] || [museu];
        return aliases.some(a => text.includes(normalizeText(a)));
      }).length;

      return { museu, clipping, posts, total: clipping + posts };
    }).sort((a, b) => b.total - a.total);
  }, [clippingItems, driveItems]);

  const max = data[0]?.total || 1;

  return (
    <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-black" />
          <h2 className="text-lg font-semibold text-black">Impacto por Museu</h2>
        </div>

        <div className="space-y-3">
          {data.map(({ museu, clipping, posts, total }) => (
            <div key={museu} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{museu}</span>
                <div className="flex gap-2 items-center">
                  <Badge variant="outline" className="text-[10px] bg-white">{clipping} clipping</Badge>
                  <Badge variant="outline" className="text-[10px] bg-gray-50">{posts} arquivos</Badge>
                  <span className="text-xs font-bold text-black w-8 text-right">{total}</span>
                </div>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-black rounded-full transition-all"
                  style={{ width: `${Math.max(4, Math.round((total / max) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-gray-400">Menções detectadas automaticamente com base nos dados de clipping e acervo Drive.</p>
      </CardContent>
    </Card>
  );
}