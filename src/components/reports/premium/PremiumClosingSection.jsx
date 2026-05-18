import React from 'react';
import { splitParagraphs } from './premiumReportUtils';

export default function PremiumClosingSection({ textos }) {
  const paragraphs = splitParagraphs(textos?.conclusao, 5);

  return (
    <section className="premium-closing premium-page-break">
      <div>
        <p className="premium-eyebrow">Fechamento editorial</p>
        <h2>Continuidade, evidencia e responsabilidade institucional</h2>
      </div>
      <div className="premium-prose premium-prose-invert">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="premium-signature">
        <span>Projeto Museus Centro</span>
        <strong>Viaduto das Artes / Diretoria de Museus / FMC-BH</strong>
      </div>
    </section>
  );
}
