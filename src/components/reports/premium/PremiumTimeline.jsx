import React from 'react';
import { buildTimelineItems, splitParagraphs } from './premiumReportUtils';

export default function PremiumTimeline({ contexto }) {
  const items = buildTimelineItems(contexto);

  return (
    <div className="premium-timeline">
      {items.map((item, index) => (
        <article className="premium-timeline-item" key={`${item.data}-${item.titulo}-${index}`}>
          <div className="premium-timeline-marker">
            <span>{String(index + 1).padStart(2, '0')}</span>
          </div>
          <div>
            <p className="premium-timeline-meta">{[item.data, item.museu, item.tipo].filter(Boolean).join(' / ')}</p>
            <h3>{item.titulo}</h3>
            {splitParagraphs(item.texto, 1).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
