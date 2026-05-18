import React from 'react';
import { sanitizeReportText, splitParagraphs } from './premiumReportUtils';

export default function PremiumSection({
  eyebrow,
  title,
  subtitle,
  text,
  children,
  tone = 'light',
  breakBefore = false,
}) {
  const paragraphs = splitParagraphs(text, 8);

  return (
    <section className={`premium-section premium-section-${tone} ${breakBefore ? 'premium-page-break' : ''}`}>
      <div className="premium-section-heading">
        {eyebrow && <p className="premium-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {subtitle && <p className="premium-section-subtitle">{subtitle}</p>}
      </div>

      {paragraphs.length > 0 && (
        <div className="premium-prose">
          {paragraphs.map((paragraph, index) => (
            <p key={`${title}-p-${index}`}>{sanitizeReportText(paragraph)}</p>
          ))}
        </div>
      )}

      {children}
    </section>
  );
}
