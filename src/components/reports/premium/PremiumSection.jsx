import React from 'react';
import { sanitizeReportText, splitParagraphs } from './premiumReportUtils';
import PremiumInternalPageHeader from './PremiumInternalPageHeader';

export default function PremiumSection({
  eyebrow,
  title,
  subtitle,
  text,
  children,
  tone = 'light',
  breakBefore = false,
  chapterId,
  chapterIds,
  chapterTitle,
}) {
  const paragraphs = splitParagraphs(text, 8);
  const normalizedChapterIds = Array.isArray(chapterIds)
    ? chapterIds.filter(Boolean)
    : chapterId
      ? [chapterId]
      : [];

  return (
    <section
      className={`premium-section premium-section-${tone} ${breakBefore ? 'premium-page-break' : ''}`}
      data-report-chapter-id={chapterId || normalizedChapterIds[0] || undefined}
      data-report-chapter-ids={normalizedChapterIds.join(' ') || undefined}
      data-report-chapter-title={chapterTitle || title || undefined}
    >
      <PremiumInternalPageHeader />

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
