import { renderToStaticMarkup } from 'react-dom/server';
import PremiumOpeningCover from './PremiumOpeningCover';
import PremiumExpedienteSection from './PremiumExpedienteSection';
import PremiumSection from './PremiumSection';
import PremiumMetrics from './PremiumMetrics';
import PremiumTimeline from './PremiumTimeline';
import PremiumMuseumSection from './PremiumMuseumSection';
import PremiumCommunicationSection from './PremiumCommunicationSection';
import PremiumClosingSection from './PremiumClosingSection';
import { getChapterIntro, getReportChapterById, getReportSummaryChapters } from '@/config/reportChapters';
import { buildEditorialReportContext } from '@/utils/reportDataNormalizer';
import { buildDocumentsChapterData } from '@/utils/reportDocumentsChapter';
import {
  cleanFileName,
  extractPhotos,
  fmtBRL,
  fmtInt,
  getPhotoIdentity,
  getActivityDate,
  getActivityMeta,
  getActivityPublico,
  getActivityText,
  getActivityTitle,
  getMuseuLabel,
  normalizeText,
  prepareInlineAndGalleryPhotos,
  groupGalleryPhotosByMuseumMonthActivity,
  sanitizeReportText,
  splitParagraphs,
  toNumber,
  uniqueParagraphs,
} from './premiumReportUtils';

const CATALOG_CSS = `
  @page { size: A4; margin: 0; }
  @page cover { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 210mm; margin: 0; padding: 0; overflow-x: hidden; background: #fff; color: #171717; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .premium-report { width: 210mm; max-width: 210mm; margin: 0 auto; overflow: hidden; background: #ffffff; color: #171717; }
  .report-pdf-institutional-header { display: none; }
  .report-pdf-institutional-logo-wrap { width: 16mm; height: 16mm; flex: 0 0 16mm; }
  .report-pdf-institutional-logo { width: 16mm; height: 16mm; display: block; object-fit: contain; }
  .report-pdf-institutional-text { flex: 1; margin-left: 0; padding-top: 0; text-align: right; font-size: 9px; font-weight: 700; line-height: 1.32; color: #777777; font-family: Arial, Helvetica, sans-serif; }
  .report-pdf-institutional-text span { display: block; }
  .report-pdf-footerline { margin-top: 4px; font-size: 8.6px; font-weight: 700; color: #6d6d6d; letter-spacing: .02em; }
  .report-pdf-page-counter::after { content: counter(page); }
  .premium-internal-page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding: 0 0 18px; border-bottom: 1px solid rgba(0,0,0,0.08); margin-bottom: 22px; break-inside: avoid; page-break-inside: avoid; }
  .premium-internal-page-header-logo img { max-height: 58px; width: auto; display: block; object-fit: contain; }
  .premium-internal-page-header-text { text-align: right; font-size: 12px; line-height: 1.35; color: #777777; font-weight: 600; font-family: Arial, Helvetica, sans-serif; }
  .premium-internal-page-header-text strong, .premium-internal-page-header-text span { display: block; }
  .premium-internal-page-header-text strong { font-weight: 700; }
  .premium-internal-page-header-invert { border-bottom-color: rgba(255,255,255,.16); }
  .premium-internal-page-header-invert .premium-internal-page-header-text { color: rgba(255,255,255,.72); }
  .premium-cover { page: cover; width: 210mm; height: 297mm; min-height: 297mm; position: relative; overflow: hidden; display: flex; align-items: flex-end; break-after: page; background: #161616; color: #fff; z-index: 5; }
  .premium-cover img, .premium-cover-fallback { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .premium-cover > img { opacity: .82; }
  .premium-cover-fallback { background: linear-gradient(135deg, #111 0%, #39352d 48%, #6e5c45 100%); }
  .premium-cover-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.38) 52%, rgba(0,0,0,.78) 100%); }
  .premium-cover-content { position: relative; width: 100%; padding: 34mm 18mm 24mm; }
  .premium-cover-kicker, .premium-eyebrow { margin: 0 0 10px; font-size: 10px; line-height: 1.5; letter-spacing: .18em; text-transform: uppercase; font-weight: 700; color: #9f7f4d; }
  .premium-cover h1 { max-width: 760px; margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 64px; line-height: .92; letter-spacing: 0; font-weight: 500; }
  .premium-cover-period { margin: 20px 0 28px; font-size: 16px; color: rgba(255,255,255,.78); }
  .premium-cover-credit { margin: -14px 0 22px; font-size: 10px; color: rgba(255,255,255,.62); letter-spacing: .06em; text-transform: uppercase; }
  .premium-cover-grid { display: none; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; max-width: 860px; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.25); }
  .premium-cover-grid span { padding: 14px; background: rgba(0,0,0,.45); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
  .premium-section, .premium-museum-block, .premium-communication, .premium-closing { padding: 16mm 14mm 15mm; background: #ffffff; min-height: auto; max-width: 210mm; overflow: hidden; }
  .premium-expediente { padding: 16mm 14mm 15mm; background: #ffffff; min-height: auto; max-width: 210mm; overflow: hidden; color: #171717; }
  .premium-expediente-heading { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; padding-bottom: 18px; border-bottom: 1px solid rgba(23,23,23,.2); margin-bottom: 20px; }
  .premium-expediente-heading h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 42px; line-height: .98; font-weight: 500; letter-spacing: 0; }
  .premium-expediente-heading p:last-child { margin: 0; font-size: 14px; line-height: 1.68; color: #3d3a35; }
  .premium-expediente-grid, .premium-expediente-museums { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; margin-bottom: 16px; }
  .premium-expediente-museums { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .premium-expediente-block { border-top: 3px solid #171717; padding-top: 12px; break-inside: avoid; }
  .premium-expediente-block h3 { margin: 0 0 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #5a534b; }
  .premium-expediente-lead { margin: 0 0 8px; font-size: 13px; line-height: 1.45; font-weight: 700; color: #171717; }
  .premium-expediente-list { margin: 0; padding: 0; list-style: none; }
  .premium-expediente-list li { padding: 8px 0; border-bottom: 1px solid rgba(23,23,23,.12); font-size: 13px; line-height: 1.45; }
  .premium-expediente-people { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .premium-expediente-people-wide { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .premium-expediente-people article { border-bottom: 1px solid rgba(23,23,23,.12); padding: 0 0 8px; min-height: 45px; }
  .premium-expediente-people strong { display: block; font-family: Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.12; font-weight: 500; }
  .premium-expediente-people span { display: block; margin-top: 4px; font-size: 11.5px; line-height: 1.35; color: #5e574f; }
  .premium-page-break { break-before: page; }
  .premium-section-dark { background: #171717; color: #f7f3eb; }
  .premium-section-heading { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; margin-bottom: 20px; border-bottom: 1px solid rgba(23,23,23,.18); padding-bottom: 16px; }
  .premium-section-heading h2, .premium-museum-heading h2, .premium-closing h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 38px; line-height: 1; font-weight: 500; letter-spacing: 0; text-align: left; }
  .premium-section-subtitle { margin: 0; color: #5f5f5f; font-size: 14px; line-height: 1.55; }
  .premium-prose { columns: 1; max-width: 100%; font-size: 14px; line-height: 1.7; color: #2b2b2b; }
  .premium-prose p { margin: 0 0 14px; break-inside: avoid; }
  .premium-prose-invert { color: rgba(255,255,255,.82); }
  .premium-metrics { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin: 18px 0 8px; }
  .premium-metric { border: 1px solid rgba(23,23,23,.16); background: rgba(255,255,255,.42); padding: 15px; min-height: 96px; }
  .premium-metric span, .premium-card-meta, .premium-timeline-meta { display: block; font-size: 11px; color: #5f574e; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; }
  .premium-metric strong { display: block; margin-top: 8px; font-size: 28px; line-height: 1; font-weight: 700; }
  .premium-metric small { display: block; margin-top: 8px; color: #686868; font-size: 12px; line-height: 1.35; }
  .premium-timeline { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; margin-top: 22px; }
  .premium-timeline-item { display: grid; grid-template-columns: 42px 1fr; gap: 12px; padding: 12px 0; border-top: 1px solid rgba(23,23,23,.14); break-inside: avoid; }
  .premium-timeline-marker { width: 32px; height: 32px; border-radius: 50%; background: #171717; color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 700; }
  .premium-timeline-item h3, .premium-activity-card h4 { margin: 3px 0 7px; font-size: 16px; line-height: 1.25; }
  .premium-timeline-item p, .premium-activity-card p { margin: 0; font-size: 13px; line-height: 1.6; color: #4b4b4b; }
  .premium-gallery { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); grid-auto-rows: 36mm; gap: 7px; margin-top: 18px; }
  .premium-photo { margin: 0; position: relative; overflow: hidden; background: #ddd4c6; break-inside: avoid; }
  .premium-photo-0, .premium-photo-4 { grid-column: span 3; grid-row: span 2; }
  .premium-photo-1, .premium-photo-2, .premium-photo-3 { grid-column: span 2; }
  .premium-photo img, .premium-photo-placeholder { width: 100%; height: 100%; object-fit: cover; display: block; }
  .premium-photo-placeholder { display: grid; place-items: center; background: repeating-linear-gradient(135deg, #d7cec0 0 10px, #cfc3b1 10px 20px); color: #746756; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }
  .premium-photo figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 10px 9px; color: #fff; font-size: 11px; line-height: 1.35; background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.82)); }
  .premium-photo figcaption span, .premium-photo figcaption small { display: block; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: rgba(255,255,255,.78); }
  .premium-photo figcaption a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .premium-photo-index { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin-top: 18px; }
  .premium-photo-index-thumb { display: block; width: 100%; height: 28mm; overflow: hidden; margin-bottom: 8px; background: #ddd4c6; }
  .premium-photo-index-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .premium-photo-index-thumb,
  .premium-photo-activity-card .premium-photo-index-thumb {
    display: block;
    width: 100%;
    height: 42mm;
    overflow: hidden;
    margin-bottom: 8px;
    border-radius: 10px;
    background: #ddd4c6;
    border: 1px solid rgba(23,23,23,.12);
  }
  .premium-photo-index-thumb img,
  .premium-photo-activity-card .premium-photo-index-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .premium-photo-index-no-image {
    display: none !important;
  }

  .premium-photo-index-item { border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.45); padding: 11px; font-size: 11.5px; line-height: 1.45; break-inside: avoid; }
  .premium-photo-index-item strong, .premium-photo-index-item span, .premium-photo-index-item small, .premium-photo-index-item a { display: block; margin-bottom: 3px; color: inherit; }
  .premium-museum-heading { display: grid; grid-template-columns: minmax(0,1fr); align-items: start; gap: 12px; margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid rgba(23,23,23,.18); }
  .premium-museum-kpis { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-start; }
  .premium-museum-kpis span, .premium-activity-tags span { border: 1px solid rgba(23,23,23,.16); padding: 7px 9px; font-size: 12px; background: rgba(255,255,255,.4); }
  .premium-activity-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
  .premium-activity-card { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 14px; max-width: 100%; overflow: hidden; margin-bottom: 0; padding: 16px 18px; border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.64); break-inside: avoid; page-break-inside: avoid; }
  .premium-activity-index { font-size: 20px; font-weight: 800; color: #9f7f4d; line-height: 1; padding-top: 2px; }
  .premium-activity-tags { display: none; }
  .premium-activity-photos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
  .premium-activity-photos figure { margin: 0; min-height: 76px; }
  .premium-activity-photos img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; background: #ddd4c6; }
  .premium-activity-photos figcaption { margin-top: 6px; font-size: 9.8pt; line-height: 1.35; color: #5e574f; }
  .premium-activity-photos figcaption span { display: block; }
  .activity-card-meta { margin: 0 0 8px; font-size: 8.7pt; line-height: 1.35; color: #675f57; text-transform: uppercase; letter-spacing: .06em; }
  .activity-card-title { margin-bottom: 10px; line-height: 1.3; font-size: 16px; }
  .activity-card-body { font-size: 10.5pt; line-height: 1.52; color: #2c2c2c; }
  .activity-card-body p + p { margin-top: 9px; }
  .premium-activity-card h4, .premium-activity-card p { overflow-wrap: anywhere; }
  .premium-report img, .premium-section img, .premium-museum-block img, .premium-communication img, .premium-closing img { max-width: 100%; max-height: 120mm; height: auto; object-fit: contain; transform: none !important; }
  .premium-cover img { max-width: none; max-height: none; width: 100%; height: 100%; object-fit: cover; }
  .premium-communication-grid { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 16px; align-items: stretch; }
  .premium-communication-panel { background: #171717; color: #fff; padding: 16px; display: flex; flex-direction: column; justify-content: flex-end; min-height: auto; }
  .premium-communication-panel strong { font-size: 52px; line-height: .9; }
  .premium-communication-panel span { margin-top: 10px; font-size: 11px; line-height: 1.35; color: rgba(255,255,255,.72); }
  .premium-table-wrap { margin-top: 18px; overflow: hidden; border: 1px solid rgba(23,23,23,.18); background: rgba(255,255,255,.36); }
  .premium-table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 10.8px; line-height: 1.35; background: rgba(255,255,255,.5); }
  .premium-table th { text-align: left; padding: 8px 9px; background: #171717; color: #fff; font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em; overflow-wrap: anywhere; }
  .premium-table td { padding: 8px 9px; border-top: 1px solid rgba(23,23,23,.1); vertical-align: top; overflow-wrap: anywhere; word-break: normal; }
  .premium-table tbody tr:nth-child(even) td { background: rgba(23,23,23,.035); }
  .budget-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 18px; }
  .budget-table th, .budget-table td { padding: 8px 10px; font-size: 9.5pt; vertical-align: top; word-break: normal; overflow-wrap: anywhere; }
  .premium-infographic-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0 8px; }
  .premium-infographic-card { border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.46); padding: 14px; break-inside: avoid; page-break-inside: avoid; }
  .premium-infographic-card h3 { margin: 0 0 5px; font-size: 15px; line-height: 1.25; font-family: Georgia, "Times New Roman", serif; font-weight: 600; }
  .premium-infographic-card p { margin: 0 0 10px; color: #5e574f; font-size: 11.5px; line-height: 1.45; }
  .premium-mini-bar-row { display: grid; grid-template-columns: 86px 1fr 54px; gap: 8px; align-items: center; margin-top: 8px; font-size: 11px; line-height: 1.25; }
  .premium-mini-bar-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .premium-mini-bar-track { height: 8px; background: rgba(23,23,23,.11); overflow: hidden; }
  .premium-mini-bar-fill { display: block; height: 100%; background: #9f7f4d; }
  .premium-flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
  .premium-flow span { border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.54); padding: 8px; font-size: 10.5px; line-height: 1.3; text-align: center; }
  .premium-alert-list { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .premium-alert-list li { border-top: 1px solid rgba(23,23,23,.12); padding-top: 6px; font-size: 11px; line-height: 1.35; color: #4f4a43; }
  .premium-infographic-source { display: block; margin-top: 10px; font-size: 9.5px; line-height: 1.35; color: #756b5f; text-transform: uppercase; letter-spacing: .08em; }
  .executive-kpi-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin-top: 14px; }
  .executive-kpi-card { border: 1px solid rgba(23,23,23,.16); background: #fff; padding: 12px; break-inside: avoid; page-break-inside: avoid; }
  .executive-kpi-card span { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: #5d564e; font-weight: 700; }
  .executive-kpi-card strong { display: block; margin-top: 6px; font-size: 24px; line-height: 1.05; }
  .executive-kpi-card small { display: block; margin-top: 6px; font-size: 10px; color: #69635c; line-height: 1.35; }
  .executive-mini-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin-top: 12px; }
  .executive-mini-card { border: 1px solid rgba(23,23,23,.14); background: #fff; padding: 10px; }
  .executive-mini-card h3 { margin: 0 0 7px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  .executive-mini-card ul { margin: 0; padding: 0; list-style: none; }
  .executive-mini-card li { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-top: 1px solid rgba(23,23,23,.08); font-size: 10.5px; }
  .executive-mini-card li:first-child { border-top: 0; padding-top: 0; }
  .daily-frases-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0 8px; }
  .daily-frases-tabs span { border: 1px solid rgba(23,23,23,.14); background: #fff; padding: 4px 8px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
  .daily-frases-box { border: 1px solid rgba(23,23,23,.16); background: #fff; padding: 12px; }
  .daily-frases-box h3 { margin: 0 0 6px; font-size: 13px; font-family: Georgia, "Times New Roman", serif; }
  .budget-exec-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin-top: 12px; }
  .budget-exec-card { border: 1px solid rgba(23,23,23,.16); background: #fff; padding: 10px; }
  .budget-exec-card span { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #5d564e; font-weight: 700; }
  .budget-exec-card strong { display: block; margin-top: 6px; font-size: 21px; line-height: 1.05; }
  .budget-exec-card small { display: block; margin-top: 5px; font-size: 10px; color: #68635d; }
  .budget-group-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5mm; margin-top: 10px; }
  .budget-group-card { border: 1px solid rgba(23,23,23,.14); background: #fff; padding: 5mm; break-inside: avoid; page-break-inside: avoid; }
  .budget-group-card h3 { margin: 0 0 2mm; font-family: Georgia, "Times New Roman", serif; font-size: 13pt; }
  .budget-group-card .used { font-size: 9pt; color: #555; }
  .budget-group-card .percent { font-size: 18pt; font-weight: 800; margin: 3mm 0 2mm; }
  .budget-bar { height: 7px; background: #e8e1d8; border: 1px solid rgba(23,23,23,.12); margin-bottom: 3mm; }
  .budget-bar span { display: block; height: 100%; background: #171717; }
  .budget-group-card dl { display: grid; grid-template-columns: 1fr auto; gap: 1.5mm 4mm; margin: 0; font-size: 8.6pt; }
  .budget-group-card dt { color: #666; }
  .budget-group-card dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
  .budget-museum-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
  .budget-museum-card { border: 1px solid rgba(23,23,23,.16); background: #fff; padding: 12px; break-inside: avoid; page-break-inside: avoid; }
  .budget-museum-card h3 { margin: 0 0 8px; font-family: Georgia, "Times New Roman", serif; font-size: 15px; line-height: 1.2; }
  .budget-museum-card dl { display: grid; grid-template-columns: 1fr auto; gap: 5px 8px; margin: 0; font-size: 10.5px; line-height: 1.3; }
  .budget-museum-card dt { color: #5f574f; }
  .budget-museum-card dd { margin: 0; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
  .budget-museum-card small { display: block; margin-top: 9px; padding-top: 7px; border-top: 1px solid rgba(23,23,23,.1); color: #6b635b; font-size: 9.5px; line-height: 1.35; }
  .premium-finance-grid, .premium-audience-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
  .catalog-toc { display: grid; grid-template-columns: minmax(0,1fr); gap: 6px; margin-top: 16px; padding: 0; counter-reset: toc; }
  .catalog-toc li { list-style: none; display: grid; grid-template-columns: 34px minmax(0,1fr); column-gap: 12px; align-items: start; border-bottom: 1px solid rgba(23,23,23,.14); padding: 7px 0; break-inside: avoid; page-break-inside: avoid; counter-increment: toc; }
  .catalog-toc li::before { content: counter(toc, decimal-leading-zero); color: #9f7f4d; font-weight: 800; text-align: right; font-size: 11px; letter-spacing: .08em; }
  .catalog-toc li.toc-annex::before { content: "AN"; counter-increment: none; }
  .catalog-toc strong { display: block; font-size: 13px; line-height: 1.25; }
  .catalog-toc span { display: block; margin-top: 3px; font-size: 11.5px; line-height: 1.35; color: #5f5f5f; }
  .premium-month-grid { display: grid; grid-template-columns: 1fr; gap: 22px; margin-top: 24px; }
  .premium-month-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; border: 1px solid rgba(23,23,23,.18); border-top: 6px solid #171717; background: rgba(255,255,255,.58); padding: 24px; break-inside: auto; page-break-inside: auto; min-height: auto; }
  .premium-month-card h3 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 30px; line-height: 1.02; font-weight: 500; letter-spacing: 0; }
  .premium-month-card p { margin: 0 0 12px; font-size: 14px; line-height: 1.72; color: #333; }
  .premium-month-card .premium-card-footnote { margin-top: 4px; color: #5f574f; font-size: 13px; line-height: 1.55; }
  .premium-activity-photo-strip { margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .premium-activity-photo-strip img, .premium-activity-photo-placeholder { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; background: #ddd4c6; border: 1px solid rgba(23,23,23,.08); }
  .premium-activity-photo-placeholder { display: grid; place-items: center; padding: 14px; text-align: center; color: #6f6559; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; }
  .premium-card-header { display: grid; grid-template-columns: minmax(0, 1fr) 170px; gap: 24px; align-items: start; padding-bottom: 18px; border-bottom: 1px solid rgba(23,23,23,.14); }
  .premium-card-kicker { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  .premium-card-kicker span { border: 1px solid rgba(23,23,23,.14); padding: 6px 8px; font-size: 10.5px; line-height: 1; text-transform: uppercase; letter-spacing: .09em; color: #514b45; background: rgba(247,243,235,.74); font-weight: 800; }
  .premium-card-facts { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin: 0; }
  .premium-card-facts span { border-top: 1px solid rgba(23,23,23,.16); padding-top: 9px; font-size: 12.5px; line-height: 1.42; color: #4e4942; }
  .premium-card-facts strong { display: block; margin-bottom: 4px; color: #171717; font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em; }
  .premium-public-highlight { align-self: stretch; border-left: 5px solid #171717; padding: 8px 0 8px 16px; }
  .premium-public-highlight strong { display: block; font-size: 48px; line-height: .9; letter-spacing: 0; color: #171717; }
  .premium-public-highlight span { display: block; margin-top: 8px; font-size: 11px; line-height: 1.25; text-transform: uppercase; letter-spacing: .1em; color: #5e574f; font-weight: 800; }
  .premium-public-context { margin: -4px 0 2px; font-size: 15px; line-height: 1.55; color: #171717; font-weight: 650; }
  .premium-consolidated-text { columns: 2; column-gap: 26px; }
  .premium-consolidated-text p { break-inside: avoid; }
  .premium-consolidated-text p + p { margin-top: 12px; }
  .premium-card-footer { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; padding-top: 12px; border-top: 1px solid rgba(23,23,23,.14); }
  .premium-card-footer span { font-size: 11.5px; line-height: 1.4; color: #5b554d; }
  .premium-card-footer strong { display: block; margin-bottom: 3px; color: #171717; text-transform: uppercase; letter-spacing: .09em; font-size: 10px; }
  .premium-method-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 18px; margin-bottom: 18px; }
  .premium-method-card { border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.54); padding: 14px; break-inside: avoid; }
  .premium-method-card strong { display: block; margin-bottom: 6px; color: #171717; font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em; }
  .premium-method-card p, .premium-method-card li { margin: 0; font-size: 12px; line-height: 1.55; color: #4d463f; }
  .premium-method-card ul { margin: 0; padding-left: 18px; }
  .premium-method-card li + li { margin-top: 4px; }
  .premium-audience-note { grid-column: 1 / -1; }
  .premium-evidence-links { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(23,23,23,.12); display: flex; flex-wrap: wrap; gap: 7px; }
  .premium-evidence-links a { color: #171717; border: 1px solid rgba(23,23,23,.18); padding: 5px 7px; font-size: 10.5px; text-decoration: none; background: rgba(255,255,255,.42); }
  .premium-institutional-list { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-top: 18px; }
  .premium-institutional-list article { border-left: 4px solid #171717; background: rgba(255,255,255,.5); padding: 13px 14px; break-inside: avoid; }
  .premium-institutional-list strong { display: block; margin-bottom: 5px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; }
  .premium-institutional-list span { display: block; font-size: 12.5px; line-height: 1.5; color: #4b4b4b; }
  .premium-museum-intro { margin: -4px 0 18px; max-width: 820px; font-size: 14px; line-height: 1.66; color: #3f3f3f; }
  .premium-report-archive { display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 20px; }
  .premium-report-note { border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.52); padding: 18px; font-size: 13px; line-height: 1.6; break-inside: avoid; }
  .premium-report-note strong { display: block; margin-bottom: 6px; font-family: Georgia, "Times New Roman", serif; font-size: 22px; line-height: 1.08; font-weight: 500; }
  .premium-report-note span { display: inline-block; margin: 0 10px 8px 0; color: #5b554e; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
  .premium-report-note small { display: block; margin-top: 8px; font-size: 13px; line-height: 1.62; color: #3d3d3d; }
  .premium-callout-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin-top: 18px; }
  .premium-callout { border-left: 4px solid #9f7f4d; background: rgba(255,255,255,.5); padding: 12px; font-size: 11px; line-height: 1.45; }
  .premium-closing { background: #ffffff; color: #171717; display: flex; flex-direction: column; justify-content: space-between; }
  .premium-closing h2 { max-width: 760px; font-size: 48px; }
  .premium-closing .premium-prose,
  .premium-closing .premium-prose p,
  .premium-closing .premium-eyebrow,
  .premium-closing h2 { color: #171717; }
  .premium-signature { border-top: 1px solid rgba(23,23,23,.18); padding-top: 18px; display: flex; justify-content: space-between; gap: 20px; font-size: 12px; color: #3d3a35; }
  .premium-signature strong { color: #171717; }
  .premium-audience-chart { grid-column: 1 / -1; border: 1px solid rgba(23,23,23,.18); background: rgba(255,255,255,.5); padding: 18px; break-inside: avoid; }
  .premium-audience-chart h3 { margin: 0 0 6px; font-size: 20px; font-family: Georgia, "Times New Roman", serif; font-weight: 500; }
  .premium-audience-chart p { margin: 0 0 16px; font-size: 12.5px; line-height: 1.5; color: #555; }
  .premium-meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-top: 22px; }
  .premium-meta-card { border: 1px solid rgba(23,23,23,.14); border-radius: 14px; background: rgba(255,255,255,.72); padding: 14px 14px 12px; break-inside: avoid; box-shadow: 0 1px 0 rgba(23,23,23,.04); }
  .premium-meta-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
  .premium-meta-code { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; line-height: 1; text-transform: uppercase; letter-spacing: .11em; color: #4d463f; font-weight: 800; }
  .premium-meta-code::before { content: ""; width: 10px; height: 10px; border: 1px solid rgba(23,23,23,.52); border-radius: 999px; display: inline-block; }
  .premium-meta-status { display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px; border-radius: 999px; font-size: 9.5px; line-height: 1; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; white-space: nowrap; border: 1px solid rgba(23,23,23,.16); background: #efede8; color: #171717; }
  .premium-meta-status.done { background: #171717; color: #fff; border-color: #171717; }
  .premium-meta-title { margin: 0; font-size: 16px; line-height: 1.2; font-weight: 700; color: #171717; }
  .premium-meta-detail { margin: 6px 0 0; font-size: 11.5px; line-height: 1.45; color: #666057; min-height: 34px; }
  .premium-meta-progress-label { display: flex; align-items: end; justify-content: space-between; gap: 10px; margin-top: 14px; font-size: 11px; line-height: 1.35; color: #5e574f; }
  .premium-meta-progress-label strong { font-size: 12px; line-height: 1; color: #171717; white-space: nowrap; }
  .premium-meta-progress { margin-top: 6px; height: 5px; width: 100%; border-radius: 999px; overflow: hidden; background: #dfdbd3; }
  .premium-meta-progress span { display: block; height: 100%; background: #171717; border-radius: 999px; }
  .premium-meta-footnote { margin-top: 10px; font-size: 10px; line-height: 1.35; color: #8a8379; }
  .audience-chart-row { display: grid; grid-template-columns: 92px 1fr 72px; gap: 12px; align-items: center; margin: 12px 0; }
  .audience-chart-month { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; font-weight: 800; color: #4b443d; }
  .audience-chart-total { text-align: right; font-size: 16px; font-weight: 800; }
  .audience-bar { height: 18px; display: flex; border: 1px solid rgba(23,23,23,.18); background: #eee8de; }
  .audience-bar span { display: block; min-width: 1px; height: 100%; }
  .audience-bar-acoes { background: #171717; }
  .audience-bar-espontaneo { background: #777; }
  .audience-bar-agendadas { background: #b9b0a2; }
  .audience-chart-legend { display: flex; gap: 14px; margin-top: 14px; flex-wrap: wrap; font-size: 11.5px; color: #555; }
  .audience-chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .audience-chart-legend i { width: 16px; height: 8px; display: inline-block; border: 1px solid rgba(23,23,23,.16); }
  .agenda-consolidation-badge { order: -2; display: inline-block; width: max-content; margin: 0 0 7px; padding: 4px 7px; border: 1px solid rgba(23,23,23,.14); background: rgba(23,23,23,.04); font-size: 10.5px; line-height: 1; text-transform: uppercase; letter-spacing: .08em; color: #5d554c; font-weight: 800; }

  .premium-finance-summary-cards { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin: 18px 0; }
  .premium-finance-summary-card { border: 1px solid rgba(23,23,23,.16); background: rgba(255,255,255,.56); padding: 14px; break-inside: avoid; }
  .premium-finance-summary-card span { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em; color: #5b554d; font-weight: 800; }
  .premium-finance-summary-card strong { display: block; margin-top: 8px; font-size: 22px; line-height: 1; color: #171717; }
  .premium-finance-group { margin-top: 18px; border: 1px solid rgba(23,23,23,.16); background: rgba(255,255,255,.46); break-inside: avoid; }
  .premium-finance-group-header { display: grid; grid-template-columns: minmax(0,1fr) repeat(4, 96px); gap: 8px; align-items: center; padding: 13px 14px; background: #171717; color: #fff; }
  .premium-finance-group-header h3 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: .09em; }
  .premium-finance-group-header span { display: block; font-size: 11px; text-align: right; color: rgba(255,255,255,.82); }
  .premium-rubrica-table { width: 100%; border-collapse: collapse; font-size: 11.5px; line-height: 1.38; }
  .premium-rubrica-table th { text-align: left; padding: 10px 12px; background: rgba(23,23,23,.06); color: #4d463f; font-size: 9.8px; text-transform: uppercase; letter-spacing: .08em; }
  .premium-rubrica-table td { padding: 10px 12px; border-top: 1px solid rgba(23,23,23,.09); vertical-align: middle; }
  .premium-rubrica-table tbody tr:nth-child(even) td { background: rgba(23,23,23,.025); }
  .premium-rubrica-name { font-weight: 650; color: #171717; }
  .premium-money-cell, .premium-percent-cell { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .premium-execution-cell { min-width: 138px; }
  .premium-execution-bar { height: 8px; background: #e7dfd3; border: 1px solid rgba(23,23,23,.12); overflow: hidden; margin-bottom: 5px; }
  .premium-execution-bar span { display: block; height: 100%; background: #171717; }
  .premium-execution-label { display: flex; justify-content: space-between; gap: 8px; font-size: 10.5px; color: #5b554d; font-weight: 700; }
  .premium-status-chip { display: inline-block; padding: 4px 7px; border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.5); font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: #4d463f; font-weight: 800; white-space: nowrap; }
  .premium-status-chip.baixa { background: rgba(23,23,23,.04); }
  .premium-status-chip.andamento { background: rgba(159,127,77,.14); }
  .premium-status-chip.alta { background: rgba(23,23,23,.12); }
  .premium-finance-note { margin: 12px 0 0; font-size: 12.5px; line-height: 1.55; color: #4d463f; }
  .premium-purchase-section { margin-top: 22px; break-inside: avoid; }
  .premium-purchase-section h3 { margin: 0 0 8px; font-family: Georgia, "Times New Roman", serif; font-size: 24px; font-weight: 500; }
  .premium-purchase-section p { margin: 0 0 12px; font-size: 12.5px; line-height: 1.55; color: #4d463f; }
  .documents-table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; }
  .documents-table th, .documents-table td { word-break: break-word; overflow-wrap: anywhere; vertical-align: top; }
  .document-link { word-break: break-word; overflow-wrap: anywhere; }

  /* Correção A4: evita páginas vazias criadas por quebra após capa/último bloco e permite fluxo real das seções. */
  .premium-report { overflow: visible; }
  .premium-cover { break-after: auto; page-break-after: auto; }
  .premium-report > section:last-child { break-after: auto; page-break-after: auto; }
  .premium-section, .premium-expediente, .premium-museum-block, .premium-communication, .premium-closing { overflow: visible; }
  .premium-table-wrap, .premium-table, .budget-table, .documents-table, .premium-rubrica-table { overflow: visible; break-inside: auto; page-break-inside: auto; }
  .premium-table thead, .budget-table thead, .documents-table thead, .premium-rubrica-table thead { display: table-header-group; }
  .premium-table tr, .budget-table tr, .documents-table tr, .premium-rubrica-table tr { break-inside: avoid; page-break-inside: avoid; }
  .premium-section-dark,
  .premium-closing,
  .premium-communication-panel,
  .premium-finance-group-header,
  .premium-table th {
    background: #ffffff !important;
    color: #171717 !important;
  }
  .premium-metric,
  .premium-photo-index-item,
  .premium-activity-card,
  .premium-infographic-card,
  .premium-finance-summary-card,
  .premium-finance-group,
  .premium-table-wrap,
  .premium-method-card,
  .premium-report-note,
  .premium-callout,
  .premium-meta-card,
  .premium-audience-chart,
  .premium-institutional-list article,
  .premium-month-card {
    background: #ffffff !important;
  }

  @media print {
    html, body { width: 210mm; min-height: 297mm; margin: 0; padding: 0; background: #fff; overflow-x: hidden; }
    .premium-report { width: 210mm; max-width: 210mm; margin: 0 auto; overflow: visible; background: #ffffff; }
    .report-pdf-institutional-header { display: none; }
    .premium-internal-page-header { display: none; }
    .premium-cover { z-index: 5; break-after: auto; page-break-after: auto; }
    .premium-report > section:first-child { break-before: auto; page-break-before: auto; }
    .premium-report > section:last-child { break-after: auto; page-break-after: auto; }
    .premium-section, .premium-expediente, .premium-museum-block, .premium-communication, .premium-closing { min-height: auto; height: auto; overflow: visible; }
    .premium-photo, .premium-activity-card, .premium-timeline-item, .premium-metric, .premium-photo-index-item, .premium-meta-card, .premium-infographic-card { break-inside: avoid; page-break-inside: avoid; }
    table { break-inside: auto; page-break-inside: auto; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
  }
`;

const BASE_METAS_ADITIVO = [
  { numero: 'META 01', titulo: 'Equipe principal', percentual: 100, detalhe: 'Cargos previstos e cargos ocupados na equipe', indicador: '100% concluído · contagem de cargos ativa', status: 'CONCLUÍDA' },
  { numero: 'META 07', titulo: 'Contratação de educadores', percentual: 100, detalhe: 'Educadores contratados para MIS, MUMO e MHAB', indicador: '100% concluído', status: 'CONCLUÍDA' },
  { numero: 'META 14', titulo: 'Acessibilidade', percentual: 100, detalhe: 'Entrega de dispositivos acessíveis', indicador: '100% entregue', status: 'CONCLUÍDA' },
  { numero: 'META 04', titulo: 'Alteração de núcleos e salas expositivas', percentual: 0, detalhe: 'Rubricas de núcleos, salas expositivas, montagem, expografia e ambientação', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 05', titulo: 'Atividades Educativas e Culturais', percentual: 0, detalhe: 'Atividades únicas da Programação/Agenda, filtradas no recorte selecionado', indicador: '0/30 atividades da programação validadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 17', titulo: 'Custeio das atividades educativas e culturais', percentual: 0, detalhe: 'Materiais, lanches e apoio pedagógico', indicador: 'Percentual das rubricas de custeio utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 15', titulo: 'Diárias de educadores', percentual: 0, detalhe: 'Execução financeira da rubrica Diárias Educadores', indicador: 'Percentual da rubrica utilizada', status: 'EM EXECUÇÃO' },
  { numero: 'META 12', titulo: 'Exposição MHAB', percentual: 0, detalhe: 'Rubricas relacionadas à exposição MHAB/MAB', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 12B', titulo: 'Exposição MUMO', percentual: 0, detalhe: 'Rubricas relacionadas à exposição MUMO', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
  { numero: 'META 03', titulo: 'Manutenção das exposições', percentual: 0, detalhe: 'Execução financeira da rubrica de manutenção e disposição, sem educadoras', indicador: 'Percentual da rubrica utilizada', status: 'EM EXECUÇÃO' },
  { numero: 'META 10', titulo: 'Mostras e exposições', percentual: 0, detalhe: 'MIS pequeno + MHAB + MUMO grande', indicador: 'MUMO = 70% · MIS + MHAB = 30%', status: 'EM EXECUÇÃO' },
  { numero: 'META 11', titulo: 'Noturno nos Museus', percentual: 0, detalhe: 'Execução vinculada ao grupo/rubrica Noturno nos Museus', indicador: 'Percentual do custeio Noturno utilizado', status: 'EM EXECUÇÃO' },
  { numero: 'META 16', titulo: 'Publicações e catálogos', percentual: 0, detalhe: 'Rubricas de catálogo, publicação, revisão, tradução, impressão, fotógrafo, pesquisa e texto', indicador: 'Percentual das rubricas relacionadas utilizadas', status: 'EM EXECUÇÃO' },
];

function rubricaLinkedToMeta(rubrica = {}, meta = {}) {
  const metaRubrica = normalizeText(rubrica?.meta || rubrica?.meta_numero || rubrica?.meta_titulo || rubrica?.meta_nome);
  const numero = normalizeText(meta.numero);
  const titulo = normalizeText(meta.titulo);
  return Boolean(metaRubrica) && (metaRubrica === numero || metaRubrica.includes(numero) || metaRubrica.includes(titulo));
}

function getRubricaPrevisto(rubrica = {}) {
  return toNumber(
    rubrica?.valor_total ??
    rubrica?.valor_previsto ??
    rubrica?.valor_orcado ??
    rubrica?.valor_original ??
    rubrica?.valor ??
    0
  );
}

function getRubricaUtilizado(rubrica = {}) {
  return toNumber(
    rubrica?.valor_utilizado ??
    rubrica?.valor_executado ??
    rubrica?.utilizado ??
    rubrica?.valor_pago ??
    0
  );
}

function buildMetaCards(contexto = {}) {
  const rubricas = Array.isArray(contexto?.rubricas) ? contexto.rubricas : [];
  const atividades = Array.isArray(contexto?.atividades) ? contexto.atividades : [];
  const atividadesPublicas = atividades.filter((item) => toNumber(item?.publico) > 0).length;

  return BASE_METAS_ADITIVO.map((meta) => {
    const vinculadas = rubricas.filter((rubrica) => rubricaLinkedToMeta(rubrica, meta));
    const previsto = vinculadas.reduce((sum, rubrica) => sum + getRubricaPrevisto(rubrica), 0);
    const utilizado = vinculadas.reduce((sum, rubrica) => sum + getRubricaUtilizado(rubrica), 0);

    let percentual = meta.percentual;
    let indicador = meta.indicador;

    if (meta.numero === 'META 05') {
      percentual = Math.min(Math.round((atividadesPublicas / 30) * 100), 100);
      indicador = `${fmtInt(atividadesPublicas)}/30 atividades da programação validadas`;
    } else if (vinculadas.length > 0 && previsto > 0) {
      percentual = Math.min(Math.round((utilizado / previsto) * 100), 100);
      indicador = `${fmtBRL(utilizado)} utilizado de ${fmtBRL(previsto)}`;
    }

    return {
      ...meta,
      percentual,
      indicador,
    };
  });
}

function getChapterDataSources(chapterId) {
  const registrySources = getReportChapterById(chapterId)?.dataSources;
  if (Array.isArray(registrySources) && registrySources.length > 0) return registrySources;

  const sources = {
    introducao: ['Report', 'ProgramacaoEspelho', 'Attachment', 'DocumentIntake', 'PurchaseRequest', 'TeamPayment', 'Rubrica'],
    territorio: ['Report', 'ProgramacaoEspelho', 'museu', 'centro/museu'],
    indicadores_premium: ['Report', 'ProgramacaoEspelho', 'Attachment', 'DocumentIntake', 'PurchaseRequest', 'TeamPayment', 'Rubrica'],
    resumo_geral: ['síntese dos capítulos selecionados', 'indicadores disponíveis no aplicativo'],
    publico: ['Report', 'atividades', 'ProgramacaoEspelho', 'campos de público'],
    metas: ['Rubrica', 'atividades', 'metas vinculadas'],
    programacao: ['ProgramacaoEspelho', 'Report'],
    agenda_programacao: ['ProgramacaoEspelho', 'datas registradas', 'atividades'],
    timeline_premium: ['ProgramacaoEspelho', 'Report'],
    atividades_museu: ['atividades', 'Report', 'ProgramacaoEspelho'],
    museus_premium: ['atividades', 'programação', 'relatórios por museu'],
    noturno_premium: ['atividades', 'programação', 'rubricas vinculadas ao Noturno'],
    relatorios_completos: ['Report'],
    galeria_evidencias: ['Attachment', 'fotos vinculadas', 'metadados visuais'],
    galeria_premium: ['Attachment', 'créditos', 'GPS', 'localização'],
    comunicacao: ['Report', 'Attachment', 'registros de comunicação'],
    comunicacao_premium: ['Report', 'Attachment', 'registros de comunicação'],
    financeiro: ['PurchaseRequest', 'TeamPayment', 'Rubrica'],
    rubricas: ['Rubrica'],
    orcamento_geral: ['Rubrica', 'PurchaseRequest', 'TeamPayment', 'DocumentIntake', 'Attachment', 'Report', 'Atividades'],
    prestacao: ['PurchaseRequest', 'TeamPayment', 'DocumentIntake', 'Attachment'],
    'notas-fiscais-contratos': ['Attachment', 'DocumentIntake', 'PurchaseRequest', 'TeamPayment'],
    governanca_documental: ['DocumentIntake', 'Attachment', 'PurchaseRequest', 'TeamPayment'],
    app_museu_centro: ['módulos do aplicativo', 'estrutura operacional existente'],
    sistema_governanca: ['módulos do aplicativo', 'vínculos entre relatórios, documentos e rubricas'],
    auditoria_operacional: ['Report', 'ProgramacaoEspelho', 'PurchaseRequest', 'TeamPayment', 'Rubrica', 'DocumentIntake', 'Attachment'],
  };

  return sources[chapterId] || sources[chapterId?.replace('indicadores', 'indicadores_premium')] || ['dados consolidados do aplicativo'];
}

function getChapterMethodologyBox(chapterId, contexto = {}) {
  const reportCount = fmtInt(contexto?.total_relatorios || 0);
  const activityCount = fmtInt(contexto?.total_atividades || 0);
  const purchaseCount = fmtInt(contexto?.total_compras || 0);
  const photoCount = fmtInt((Array.isArray(contexto?.fotos) ? contexto.fotos.length : 0));

  const criteria = {
    introducao: 'O recorte considera o período configurado no gerador e explica a origem dos registros do aplicativo. Esta é a metodologia geral do relatório, sem incorporar dados externos.',
    territorio: 'A leitura territorial usa apenas registros associados a MIS, MHAB, MUMO e atuação geral. Quando não houver dado específico por equipamento, a limitação permanece visível.',
    indicadores_premium: `Painel sintético com ${reportCount} relatórios, ${activityCount} atividades, fotos/anexos, documentos, solicitações, pagamentos e rubricas disponíveis no aplicativo.`,
    resumo_geral: 'Síntese transversal do período. Interpreta os dados disponíveis sem repetir tabelas, listas completas ou o conteúdo da introdução metodológica.',
    publico: 'Capítulo exclusivo para público. Se os totais por mês e por museu vierem de universos diferentes, a diferença é indicada como nota metodológica.',
    metas: 'Relaciona ações, despesas, rubricas e registros às metas pactuadas. Percentuais financeiros são lidos junto ao cronograma físico-financeiro.',
    programacao: 'Apresenta ações planejadas e realizadas a partir da programação cadastrada e de registros vinculados, sem repetir a agenda cronológica completa.',
    agenda_programacao: 'Organiza registros em ordem cronológica. O card preserva data, museu, tipo, público e descrição real, sem reescrever atividade nem fundir relatórios por semelhança.',
    timeline_premium: 'Transforma a cronologia em marcos editoriais do período. Não substitui a agenda e não lista todos os detalhes operacionais de cada atividade.',
    atividades_museu: 'Capítulo principal de atividades, organizado por museu. Fotos só entram no corpo da atividade quando selecionadas previamente pelo usuário.',
    museus_premium: 'Síntese individual por equipamento, com leitura de atividades, público, evidências e pendências. Não repete integralmente todas as atividades.',
    noturno_premium: 'Renderiza somente registros vinculados ao Noturno nos Museus. Se não houver dados, o capítulo apresenta limitação em vez de programação inventada.',
    relatorios_completos: 'Preserva relatórios individuais aprovados, autoria, museu, mês, status e textos originais. Não funde relatórios automaticamente.',
    galeria_evidencias: `Recebe fotos não selecionadas para atividades. O conjunto atual reúne ${photoCount} registros visuais, com deduplicação técnica por identidade de arquivo.`,
    galeria_premium: 'Apresenta apenas metadados existentes de crédito, legenda, origem e localização/GPS. Campos ausentes não são preenchidos artificialmente.',
    comunicacao: 'Lista e organiza registros objetivos de comunicação, materiais, anexos, coberturas e publicações quando existirem no aplicativo.',
    comunicacao_premium: 'Leitura narrativa da comunicação como circulação pública, documentação institucional, memória visual e visibilidade do projeto.',
    financeiro: `Separa solicitado, aprovado, pago, status, rubrica e centro/museu quando disponíveis. Considera ${purchaseCount} solicitações/movimentações no recorte.`,
    rubricas: 'Usa rubricas como fonte de verdade para previsto, utilizado, saldo, percentual, grupo e centro/museu.',
    orcamento_geral: 'Consolida orçamento geral, relatórios e atividades com todos os campos relevantes para conferência institucional completa.',
    prestacao: 'Cruza solicitações, pagamentos, documentos fiscais, XMLs, recibos e comprovantes. Não substitui a listagem documental de notas fiscais.',
    'notas-fiscais-contratos': 'Lista contratos, notas fiscais, XMLs, recibos e comprovantes com links de rastreabilidade, sem repetir a análise financeira.',
    governanca_documental: 'Mostra cadeia documental, documentos pareados e sem par, vínculos e origem dos arquivos. Não repete a tabela fiscal completa.',
    app_museu_centro: 'Explica o aplicativo como infraestrutura de registro, consolidação, memória, exportação e acompanhamento institucional.',
    sistema_governanca: 'Analisa qualidade da base, campos completos, vínculos, pendências e consistência entre módulos.',
    auditoria_operacional: 'Cruzamento crítico entre atividades, público, metas, documentos, financeiro, rubricas e pagamentos. Não repete os capítulos anteriores.',
  };

  return criteria[chapterId] || criteria[chapterId?.replace('indicadores', 'indicadores_premium')] || 'A consolidação foi realizada exclusivamente a partir dos dados verificáveis existentes no aplicativo.';
}

function getChapterLimitations(chapterId, contexto = {}) {
  const limitations = [];

  if ((chapterId === 'galeria_evidencias' || chapterId === 'galeria_premium' || chapterId === 'atividades_museu') && (!Array.isArray(contexto?.fotos) || contexto.fotos.length === 0)) {
    limitations.push('Não há fotos suficientes vinculadas no app para ampliar a camada visual deste capítulo.');
  }

  if ((chapterId === 'indicadores_premium' || chapterId === 'publico' || chapterId === 'atividades_museu') && toNumber(contexto?.publico_total) <= 0) {
    limitations.push('A ausência de público consolidado no recorte impede leituras comparativas mais densas.');
  }

  if (chapterId === 'financeiro' && (!Array.isArray(contexto?.compras) || contexto.compras.length === 0)) {
    limitations.push('Não foram localizadas movimentações financeiras suficientes para detalhamento operacional no recorte selecionado.');
  }

  if ((chapterId === 'programacao' || chapterId === 'agenda_programacao' || chapterId === 'timeline_premium') && (!Array.isArray(contexto?.programacao) || contexto.programacao.length === 0)) {
    limitations.push('A agenda do período não está completamente consolidada no app para este recorte.');
  }

  if (chapterId === 'governanca_documental' || chapterId === 'sistema_governanca' || chapterId === 'auditoria_operacional') {
    const incompletePhotos = extractPhotos(contexto).filter((photo) => !photo?.atividade || !photo?.museu);
    if (incompletePhotos.length > 0) {
      limitations.push(`${fmtInt(incompletePhotos.length)} imagens permanecem sem classificação completa de atividade ou museu.`);
    }
  }

  return limitations;
}

function ChapterMethodologyPanel({ chapterId, contexto = {}, evidence = [] }) {
  const sources = getChapterDataSources(chapterId);
  const limitations = getChapterLimitations(chapterId, contexto);
  const evidenceTypes = (Array.isArray(evidence) ? evidence : []).filter(Boolean);

  return (
    <div className="premium-method-grid">
      <article className="premium-method-card">
        <strong>Como este dado foi obtido</strong>
        <p>Fonte dos dados: {sources.join(', ')}.</p>
      </article>
      <article className="premium-method-card">
        <strong>Critério de consolidação</strong>
        <p>{getChapterMethodologyBox(chapterId, contexto)}</p>
      </article>
      {evidenceTypes.length > 0 ? (
        <article className="premium-method-card">
          <strong>Evidências utilizadas</strong>
          <ul>
            {evidenceTypes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      ) : null}
      {null}
    </div>
  );
}

function EmptyChapterNotice({ chapterTitle }) {
  return (
    <div className="premium-method-grid">
      <article className="premium-method-card">
        <strong>Limitação dos dados</strong>
        <p>
          Não foram localizados registros consolidados para este capítulo no período selecionado.
          A ausência de dados é apresentada para preservar a rastreabilidade do relatório e evitar preenchimento artificial de informações.
        </p>
      </article>
    </div>
  );
}




function TransitionManagementSection() {
  const itens = [
    ['Visitas institucionais aos museus', 'A coordenação realizou aproximações presenciais com os equipamentos, fortalecendo a leitura de contexto, necessidades operacionais e prioridades de cada museu.'],
    ['Visitas técnicas individualizadas', 'O acompanhamento por equipamento apoiou a compreensão dos fluxos locais, das agendas em construção e das condições necessárias para execução das ações culturais.'],
    ['Desenvolvimento inicial do aplicativo', 'O período marcou a estruturação dos fluxos digitais de registro, acompanhamento, consolidação de dados, evidências e prestação de contas.'],
    ['Plano de trabalho e programação', 'A equipe avançou na organização do plano de trabalho, na construção da programação do semestre e na preparação de exposições e atividades futuras.'],
    ['Reorganização institucional', 'Foram consolidadas substituições de profissionais, recomposição de equipes, pactuação de responsabilidades e acompanhamento operacional cotidiano.'],
    ['Comunicação entre equipes', 'A coordenação fortaleceu a circulação de informações entre produção, educativo, comunicação, consultoria de programação e direção dos equipamentos.'],
    ['Diversidade e inclusão', 'A implementação do curso de Diversidade e Inclusão qualificou práticas de acolhimento, acessibilidade e mediação pública no âmbito institucional.'],
    ['Fluxos administrativos e culturais', 'A etapa consolidou procedimentos de acompanhamento, documentação, planejamento, comunicação, registro visual e organização das entregas.'],
  ];

  return (
    <PremiumSection
      chapterId="territorio"
      breakBefore
      eyebrow="Atuação geral"
      title="Coordenação, planejamento e desenvolvimento institucional"
      subtitle="Síntese das frentes estruturantes que deram sustentação à execução cultural, à documentação do projeto e à organização das entregas do semestre."
      text={`A atuação geral do período é apresentada como infraestrutura de continuidade: um conjunto de decisões, visitas, acompanhamentos, fluxos digitais e reorganizações institucionais que permitiu estabilizar a execução e preparar a programação seguinte sem transformar processos internos em eventos públicos.

A entrada de Daniel Perini na coordenação geral, após a saída de Andréa Matos, reorganizou responsabilidades, fluxo decisório e acompanhamento das equipes. A consultora de programação Ana Luiza passou a atuar de forma mais próxima das diretorias dos museus, apoiando a construção de agenda, exposições, oficinas, ações educativas e entregas de médio prazo.`}
    >
      <div className="premium-institutional-list">
        {itens.map(([titulo, texto]) => (
          <article key={titulo}>
            <strong>{titulo}</strong>
            <span>{texto}</span>
          </article>
        ))}
      </div>
    </PremiumSection>
  );
}


function getPhotoUrl(photo = {}) {
  const safePhoto = photo || {};
  return (
    safePhoto.link ||
    safePhoto.url ||
    safePhoto.file_url ||
    safePhoto.src ||
    safePhoto.arquivo_url ||
    safePhoto.thumbnail_url ||
    safePhoto.preview_url ||
    safePhoto.download_url ||
    safePhoto.file?.url ||
    safePhoto.file?.file_url ||
    safePhoto.attachment?.url ||
    safePhoto.attachment?.file_url ||
    ''
  );
}

function isRenderableImageUrl(value = '') {
  const url = String(value || '').toLowerCase();
  if (!url) return false;
  return (
    url.startsWith('data:image/') ||
    url.includes('/files/') ||
    url.includes('/api/apps/') ||
    /\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(url)
  );
}

function getPhotoFileName(photo = {}) {
  return (
    photo?.fileName ||
    photo?.filename ||
    photo?.name ||
    photo?.nome ||
    photo?.arquivo_nome ||
    photo?.original_name ||
    photo?.file?.name ||
    photo?.attachment?.name ||
    getPhotoUrl(photo)
  );
}

function getPhotoActivityName(photo = {}) {
  const value =
    photo?.atividade ||
    photo?.atividade_nome ||
    photo?.titulo_atividade ||
    photo?.activity_title ||
    photo?.activity?.titulo ||
    photo?.activity?.nome ||
    photo?.titulo ||
    photo?.caption ||
    photo?.legenda ||
    '';

  const cleaned = sanitizeReportText(value)
    .replace(/^Arquivo de imagem\s*/i, '')
    .replace(/\s+\d{8,}$/g, '')
    .trim();

  return cleaned && normalizeText(cleaned) !== 'atividade vinculada ao app'
    ? cleaned
    : 'Registro fotográfico vinculado ao projeto';
}

function getPhotoMuseumName(photo = {}) {
  return sanitizeReportText(
    photo?.museu ||
    photo?.museum ||
    photo?.activity?.museu ||
    photo?.activity?.museum ||
    'Museus Centro'
  );
}

function ActivityMiniPhotos({ activity }) {
  const selected = Array.isArray(activity?.inlineSelectedPhotos) ? activity.inlineSelectedPhotos : [];

  if (selected.length === 0) return null;

  return (
    <figure className="premium-activity-photo-strip">
      {selected.filter(Boolean).map((photo, slot) => {
        const url = getPhotoUrl(photo);
        if (!url) return null;
        return (
          <img
            key={url || slot}
            src={url}
            alt={photo?.caption || getActivityTitle(activity)}
            loading="lazy"
          />
        );
      })}
    </figure>
  );
}


const MUSEUM_GPS = {
  'MHAB': 'MHAB — Belo Horizonte/MG (-19.9241, -43.9378)',
  'MIS': 'MIS BH — Belo Horizonte/MG (-19.9167, -43.9345)',
  'MIS BH': 'MIS BH — Belo Horizonte/MG (-19.9167, -43.9345)',
  'MUMO': 'MUMO — Belo Horizonte/MG (-19.9280, -43.9372)',
  'Museus Centro': 'Museus Centro — Belo Horizonte/MG',
};

function resolveMuseumLocation(photo = {}) {
  const text = `${photo?.museu || ''} ${photo?.atividade || ''} ${photo?.caption || ''}`.toLowerCase();

  if (text.includes('mumo') || text.includes('costura') || text.includes('macrame')) {
    return MUSEUM_GPS['MUMO'];
  }

  if (text.includes('mis')) {
    return MUSEUM_GPS['MIS'];
  }

  if (text.includes('mhab') || text.includes('argila') || text.includes('txopai')) {
    return MUSEUM_GPS['MHAB'];
  }

  return MUSEUM_GPS['Museus Centro'];
}


function PremiumAttachmentThumbnail({ photo, activity = null }) {
  const imageUrl =
    photo?.url ||
    photo?.file_url ||
    photo?.src ||
    photo?.arquivo_url;

  if (!imageUrl) return null;

  return (
    <a
      href={imageUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="premium-attachment-thumb"
    >
      <img
        src={imageUrl}
        alt={photo?.caption || activity?.titulo || 'Registro visual'}
        loading="lazy"
        style={{
          width: '100%',
          height: '120px',
          objectFit: 'cover',
          borderRadius: '12px',
          marginBottom: '10px',
          background: '#f3f3f3'
        }}
      />
    </a>
  );
}


function resolveMuseumCredit(photo = {}) {
  return (
    photo?.uploaded_by_name ||
    photo?.user_name ||
    photo?.author_name ||
    photo?.created_by_name ||
    'Equipe Viaduto das Artes'
  );
}


function getMonthName(item = {}) {
  const direct = item.mes || item.month || '';
  if (direct) return String(direct);

  const parsed = new Date(item.data || item.data_inicio || item.data_realizacao || '');
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase());
  }

  return 'Período';
}

function getPublicoRegistrado(item = {}) {
  const value = toNumber(item.publico ?? item.publico_total ?? item.participantes ?? item.presentes);
  return value > 0 ? value : 0;
}

function getPublicoEstimado(item = {}) {
  const value = toNumber(
    item.publico_estimado ??
    item.publico_previsto ??
    item.capacidade ??
    item.capacidade_publico ??
    item.vagas ??
    item.quantidade_prevista_participantes
  );
  return value > 0 ? value : 0;
}

function getParticipantCount(item = {}) {
  const fromList = Array.isArray(item.participantes) ? item.participantes.length : 0;
  const value = toNumber(
    item.participantes_total ??
    item.total_participantes ??
    item.numero_participantes ??
    item.qtd_participantes
  );
  return Math.max(fromList, value);
}

function inferMetaLabel(item = {}) {
  const explicit = getActivityMeta(item);
  if (explicit) return { label: explicit, inferred: false };

  const text = normalizeText([
    item.titulo,
    item.nome,
    item.tipo,
    item.classificacao,
    item.categoria_label,
    item.texto,
    item.descricao,
  ].filter(Boolean).join(' '));

  if (text.includes('noturno')) return { label: 'Meta vinculada fora do recorte', inferred: true };
  if (
    text.includes('comunicacao') ||
    text.includes('comunicação') ||
    text.includes('divulgacao') ||
    text.includes('divulgação') ||
    text.includes('clipping') ||
    text.includes('postagem') ||
    text.includes('registro') ||
    text.includes('cobertura') ||
    text.includes('audiovisual')
  ) {
    return { label: 'Meta de comunicação institucional', inferred: true };
  }
  if (text.includes('acessibilidade') || text.includes('libras') || text.includes('inclusao') || text.includes('inclusão')) {
    return { label: 'Meta 14 - Acessibilidade', inferred: true };
  }
  if (text.includes('exposicao') || text.includes('exposição') || text.includes('mostra')) {
    return { label: 'Metas 10/12 - Mostras e exposições', inferred: true };
  }
  if (
    text.includes('oficina') ||
    text.includes('curso') ||
    text.includes('mediacao') ||
    text.includes('mediação') ||
    text.includes('visita mediada') ||
    text.includes('educativa') ||
    text.includes('formacao') ||
    text.includes('formação') ||
    text.includes('palestra') ||
    text.includes('laboratorio') ||
    text.includes('laboratório')
  ) {
    return { label: 'Meta 05 - Atividades educativas e culturais', inferred: true };
  }

  return { label: 'Meta não informada', inferred: false };
}

function isCommunicationRecord(item = {}) {
  const text = normalizeText([
    item.titulo,
    item.nome,
    item.tipo,
    item.classificacao,
    item.categoria_label,
    item.texto,
    item.descricao,
  ].filter(Boolean).join(' '));

  return text.includes('comunicacao') ||
    text.includes('comunicação') ||
    text.includes('cobertura') ||
    text.includes('registro fotografico') ||
    text.includes('registro fotográfico') ||
    text.includes('audiovisual') ||
    text.includes('video') ||
    text.includes('vídeo') ||
    text.includes('clipping') ||
    text.includes('postagem') ||
    text.includes('rede social') ||
    text.includes('redes sociais') ||
    text.includes('png') ||
    text.includes('identidade visual') ||
    text.includes('divulgacao') ||
    text.includes('divulgação') ||
    text.includes('documentacao') ||
    text.includes('documentação');
}

function isIrrelevantAdministrativeRecord(item = {}) {
  const text = normalizeText([
    item.titulo,
    item.nome,
    item.tipo,
    item.texto,
    item.descricao,
  ].filter(Boolean).join(' '));

  return text.includes('contratacao de consultoria') ||
    text.includes('contratação de consultoria') ||
    text.includes('processo de contratacao') ||
    text.includes('processo de contratação') ||
    text.includes('noturno');
}

function isRecurringMediatedVisit(item = {}) {
  const text = normalizeText([item.titulo, item.nome, item.tipo, item.texto, item.descricao].filter(Boolean).join(' '));
  return text.includes('visita mediada') ||
    text.includes('visitas mediadas') ||
    text.includes('visita guiada') ||
    text.includes('atendimento educativo recorrente');
}

function agendaSemanticKey(item = {}) {
  const museu = normalizeText(getMuseuLabel(item.museu || item.equipamento || item.local));
  const month = normalizeText(getMonthName(item));
  const title = normalizeText(item.titulo || item.nome || 'atividade');
  const day = String(item.data || item.data_inicio || '').slice(0, 10) || month;

  if (isCommunicationRecord(item)) return 'comunicacao-institucional::periodo';
  if (isRecurringMediatedVisit(item)) return `visitas-mediadas::${museu}::${month}`;
  if (title.includes('argila') && title.includes('movimento') && title.includes('poetic')) {
    return `laboratorio-argila-movimento::${museu}::${day}`;
  }
  if (title.includes('mulheres') && title.includes('ecoam') && title.includes('historia')) {
    return `museu-criativo-mulheres-ecoam::${museu}::${day}`;
  }
  if (title.includes('pintando') && title.includes('tempo')) {
    return `museu-criativo-pintando-tempo::${museu}::${day}`;
  }
  if (title.includes('criacao') && title.includes('cenario')) {
    return `oficina-criacao-cenarios::${museu}::${day}`;
  }
  if (title.includes('costurando') && title.includes('bem querer')) {
    return `oficina-costurando-bem-querer::${museu}::${day}`;
  }
  if (title.includes('laboratorio poetico') || title.includes('laboratório poético') || title.includes('argilas e movimentos')) {
    return `laboratorios-poeticos::${museu}::${month}`;
  }

  const reducedTitle = title
    .replace(/\b(confirmada|confirmado|agendada|agendado|rotina|programacao|programação)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 2)
    .slice(0, 8)
    .join(' ');

  return `${museu}::${month}::${reducedTitle}`;
}

function itemCompletenessScore(item = {}) {
  const textLength = String(item.texto || item.descricao || item.sinopse || '').length;
  const photos = Array.isArray(item.fotos_destaque) ? item.fotos_destaque.length : Array.isArray(item.fotos) ? item.fotos.length : 0;
  const status = normalizeText(item.status || item.tipo || '');
  return (
    (textLength > 70 ? 20 : textLength > 20 ? 10 : 0) +
    (getPublicoRegistrado(item) > 0 ? 20 : 0) +
    (getActivityMeta(item) ? 12 : 0) +
    (photos > 0 ? Math.min(photos, 4) * 4 : 0) +
    (status.includes('aprov') || status.includes('confirm') ? 14 : 0)
  );
}

function mergeAgendaGroup(items = []) {
  const sorted = [...items].sort((a, b) => itemCompletenessScore(b) - itemCompletenessScore(a));
  const base = { ...sorted[0] };
  const recurring = items.some(isRecurringMediatedVisit);
  const communication = items.some(isCommunicationRecord);
  const publicoRegistrado = items.reduce((sum, item) => sum + getPublicoRegistrado(item), 0);
  const publicoEstimado = publicoRegistrado > 0 ? 0 : Math.max(...items.map(getPublicoEstimado), 0);
  const meta = inferMetaLabel(base);
  const participantes = Math.max(...items.map(getParticipantCount), 0);
  const dates = [...new Set(items.map((item) => item.data || item.data_inicio || item.mes).filter(Boolean))];
  const texts = [];
  const reportTexts = [];
  const linkedReports = [];
  const photos = [];
  items.forEach((item) => {
    [
      item.sinopse,
      item.sinopse_agenda,
      item.texto,
      item.descricao,
      item.observacoes,
      item.resultado,
      item.resultados,
      item.relato,
      item.comentarios,
    ].forEach((value) => {
      const text = sanitizeReportText(value);
      const key = normalizeText(text).slice(0, 160);
      if (text.length > 30 && !texts.some((existing) => normalizeText(existing).slice(0, 160) === key)) texts.push(text);
    });
    (Array.isArray(item.relatosEquipe) ? item.relatosEquipe : []).forEach((value) => {
      const text = sanitizeReportText(value);
      const key = normalizeText(text).slice(0, 160);
      if (text.length > 30 && !reportTexts.some((existing) => normalizeText(existing).slice(0, 160) === key)) reportTexts.push(text);
    });
    (Array.isArray(item.relatoriosVinculados) ? item.relatoriosVinculados : []).forEach((value) => {
      const text = sanitizeReportText(value);
      if (text && !linkedReports.includes(text)) linkedReports.push(text);
    });

    const source = Array.isArray(item.fotos_destaque) ? item.fotos_destaque : Array.isArray(item.fotos) ? item.fotos : [];
    source.forEach((photo) => {
      const key = photo?.url || photo?.file_url || photo?.src;
      if (key && !photos.some((existing) => (existing?.url || existing?.file_url || existing?.src) === key)) photos.push(photo);
    });
  });

  return {
    ...base,
    titulo: communication ? 'Comunicação, registros e produções do período' : recurring ? `Visitas mediadas - ${getMuseuLabel(base.museu)}` : base.titulo,
    tipo: communication ? 'Comunicação institucional' : base.tipo,
    texto: texts[0] || base.texto || base.descricao || base.sinopse || '',
    textosConsolidados: texts.slice(0, 4),
    relatosEquipe: reportTexts.slice(0, 3),
    relatoriosVinculados: linkedReports.slice(0, 4),
    datasConsolidadas: dates,
    participantes,
    isCommunicationCard: communication,
    publicoRegistrado,
    publicoEstimado,
    publicoTipo: publicoRegistrado > 0 ? 'registrado' : publicoEstimado > 0 ? 'estimado' : 'nao_informado',
    metaEditorial: meta.label,
    metaInferida: meta.inferred,
    consolidatedCount: items.length,
    fotos_destaque: photos.slice(0, 4),
    evidenciaLinks: photos.map((photo) => photo?.url || photo?.file_url || photo?.src || photo?.arquivo_url).filter(Boolean).slice(0, 8),
  };
}

function consolidateAgendaItems(items = []) {
  const seen = new Set();

  return items
    .filter((item) => item && (item.titulo || item.nome || item.texto || item.descricao || item.sinopse))
    .filter((item) => {
      const id = item.id || item._id || item.programacao_id || item.atividade_id || item.activity_id;
      const day = String(item.data || item.data_inicio || item.date || '').slice(0, 10);
      const museum = normalizeText(getMuseuLabel(item.museu || item.equipamento || item.centro || item.local || ''));
      const title = normalizeText(item.titulo || item.nome || item.title || '');
      const key = id ? `id:${id}` : (day && museum && title ? `strict:${day}:${museum}:${title}` : '');

      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
}

function reportSourceText(report = {}) {
  return uniqueParagraphs([
    report.resumo_executivo,
    report.resumo_periodo,
    report.pontos_positivos,
    report.descricao,
    report.relato,
    report.observacoes,
  ].filter(Boolean).join('\n\n'), 2, 40);
}

function enrichItemsWithReports(items = [], reports = []) {
  return items;

  if (!Array.isArray(reports) || reports.length === 0) return items;

  return items.map((item) => {
    const itemMonth = normalizeText(item.mes || getMonthName(item));
    const itemMuseum = normalizeText(getMuseuLabel(item.museu || item.equipamento || item.local));
    const itemText = normalizeText([item.titulo, item.nome, item.texto, item.descricao, item.tipo].filter(Boolean).join(' '));
    const related = reports.filter((report) => {
      const reportMonth = normalizeText(report?.mes || report?.month || '');
      const reportMuseum = normalizeText(getMuseuLabel(report?.museu || report?.equipamento || ''));
      const reportText = normalizeText([
        report?.resumo_executivo,
        report?.resumo_periodo,
        report?.pontos_positivos,
        report?.descricao,
        report?.relato,
        report?.observacoes,
      ].filter(Boolean).join(' '));
      const sameMonth = !itemMonth || !reportMonth || itemMonth === reportMonth;
      const sameMuseum = !itemMuseum || !reportMuseum || itemMuseum === reportMuseum || itemMuseum.includes(reportMuseum) || reportMuseum.includes(itemMuseum);
      const semanticTouch = itemText.split(' ').filter((word) => word.length > 4).some((word) => reportText.includes(word));
      return sameMonth && sameMuseum && (semanticTouch || reportText.length > 160);
    });

    const relatosEquipe = related.flatMap(reportSourceText).slice(0, 3);
    const relatoriosVinculados = related.map((report) => report.autor || report.author_name || report.user_name || report.museu).filter(Boolean).slice(0, 4);

    return {
      ...item,
      relatosEquipe,
      relatoriosVinculados,
    };
  });
}

function normalizeAudienceMonth(item = {}) {
  const atividades = toNumber(item.atividades ?? item.acoes ?? item.publico_atividades ?? item.publicoAtividades);
  const espontaneo = toNumber(item.espontaneo ?? item.publico_espontaneo ?? item.publicoEspontaneo);
  const visitas = toNumber(item.visitas_agendadas ?? item.agendadas ?? item.publico_agendado ?? item.visitasAgendadas);
  const total = toNumber(item.total) || atividades + espontaneo + visitas;

  return {
    mes: item.mes || item.month || 'Período',
    atividades,
    espontaneo,
    visitas_agendadas: visitas,
    total,
  };
}

function buildAudienceMonthRows(contexto = {}) {
  if (!Array.isArray(contexto?.publico_por_mes) || contexto.publico_por_mes.length === 0) {
    return [];
  }

  return contexto.publico_por_mes.map(normalizeAudienceMonth);
}

function AudienceMonthlyChart({ rows = [] }) {
  const max = Math.max(...rows.map((item) => toNumber(item.total)), 1);

  return (
    <div className="premium-audience-chart">
      <h3>Público por mês</h3>
      <p>Leitura editorial do recorte selecionado, separando público de ações, presença espontânea e visitas agendadas sem misturar estimativas com registros.</p>
      {rows.map((item) => {
        const total = Math.max(toNumber(item.total), 1);
        const width = Math.max((total / max) * 100, 2);
        const acoes = Math.max((toNumber(item.atividades) / total) * 100, item.atividades > 0 ? 2 : 0);
        const espontaneo = Math.max((toNumber(item.espontaneo) / total) * 100, item.espontaneo > 0 ? 2 : 0);
        const agendadas = Math.max((toNumber(item.visitas_agendadas) / total) * 100, item.visitas_agendadas > 0 ? 2 : 0);

        return (
          <div className="audience-chart-row" key={item.mes}>
            <div className="audience-chart-month">{item.mes}</div>
            <div className="audience-bar" style={{ width: `${width}%` }} aria-label={`${item.mes}: ${fmtInt(item.total)} pessoas`}>
              <span className="audience-bar-acoes" style={{ width: `${acoes}%` }} />
              <span className="audience-bar-espontaneo" style={{ width: `${espontaneo}%` }} />
              <span className="audience-bar-agendadas" style={{ width: `${agendadas}%` }} />
            </div>
            <div className="audience-chart-total">{fmtInt(item.total)}</div>
          </div>
        );
      })}
      <div className="audience-chart-legend">
        <span><i className="audience-bar-acoes" /> Ações</span>
        <span><i className="audience-bar-espontaneo" /> Espontâneo</span>
        <span><i className="audience-bar-agendadas" /> Agendadas</span>
      </div>
    </div>
  );
}

function buildPublicContext(item = {}) {
  if (item.isCommunicationCard) return '';
  const value = item.publicoRegistrado > 0 ? item.publicoRegistrado : item.publicoEstimado;
  if (!value) return '';

  const type = item.publicoTipo === 'estimado' ? 'público estimado' : 'participantes registrados';
  const scope = [item.museu, item.mes || getMonthName(item)].filter(Boolean).join(' / ');
  const category = item.tipo || item.categoria_label || item.classificacao || 'ação cultural';

  return `${fmtInt(value)} ${type} em ${category.toString().toLowerCase()}${scope ? ` no recorte ${scope}` : ''}.`;
}

function buildInstitutionalExpansion() {
  return '';
}

function ActivityNarrative({ item }) {
  const sourceParagraphs = Array.isArray(item.textosConsolidados) && item.textosConsolidados.length > 0
    ? item.textosConsolidados
    : [splitParagraphs(item.texto, 1)[0]].filter(Boolean);
  const reportParagraphs = Array.isArray(item.relatosEquipe) ? item.relatosEquipe : [];
  const paragraphs = uniqueParagraphs([
    ...sourceParagraphs,
    ...reportParagraphs,
    buildInstitutionalExpansion(item),
  ].filter(Boolean).join('\n\n'), 5, 40);

  return (
    <div className="premium-consolidated-text">
      {paragraphs.slice(0, 5).map((paragraph, index) => (
        <p key={`${item.id || item.titulo}-texto-${index}`}>{sanitizeReportText(paragraph)}</p>
      ))}
    </div>
  );
}

function EvidenceLinks({ links = [] }) {
  const unique = [...new Set(links.filter(Boolean))].slice(0, 6);
  if (unique.length === 0) return null;

  return (
    <div className="premium-evidence-links">
      {unique.map((link, index) => (
        <a href={link} target="_blank" rel="noreferrer" key={link}>Evidência {index + 1}</a>
      ))}
    </div>
  );
}

function MonthlyAgendaSection({ contexto }) {
  const atividades = Array.isArray(contexto?.atividades) ? contexto.atividades : [];
  const programacao = Array.isArray(contexto?.programacao) ? contexto.programacao : [];
  const reports = Array.isArray(contexto?.relatorios_equipe) ? contexto.relatorios_equipe : [];
  const selectedInlinePhotoIds = Array.isArray(contexto?.selected_inline_photo_ids)
    ? contexto.selected_inline_photo_ids
    : [];
  const items = enrichItemsWithReports([
    ...programacao.map((item) => ({
      id: item.id,
      data: item.data || item.data_inicio,
      mes: item.mes,
      museu: getMuseuLabel(item.museu || item.equipamento || item.local),
      titulo: item.titulo || item.nome || 'Programação registrada',
      tipo: item.tipo || item.tipo_atividade || item.status || 'Programação',
      texto: item.descricao || item.sinopse,
      publico: getActivityPublico(item),
      publico_estimado: item.publico_estimado || item.publico_previsto || item.capacidade,
      meta: getActivityMeta(item),
      fotos_destaque: [],
    })),
    ...atividades.map((activity) => ({
      ...activity,
      data: getActivityDate(activity),
      titulo: getActivityTitle(activity),
      texto: getActivityText(activity),
      tipo: activity?.categoria_label || activity?.classificacao || 'Atividade',
    })),
  ].filter((item) => item.titulo), reports);

  const unique = consolidateAgendaItems(items).map((item) => {
    const sourcePhotos = Array.isArray(item?.fotos_destaque)
      ? item.fotos_destaque
      : Array.isArray(item?.fotos)
        ? item.fotos
        : [];
    const { inlinePhotos } = prepareInlineAndGalleryPhotos(sourcePhotos, selectedInlinePhotoIds);
    const publicoRegistrado = getPublicoRegistrado(item);
    const publicoEstimado = publicoRegistrado > 0 ? 0 : getPublicoEstimado(item);
    const meta = getActivityMeta(item);

    return {
      ...item,
      inlineSelectedPhotos: inlinePhotos.slice(0, 4),
      datasConsolidadas: [item.data || item.data_inicio || item.mes].filter(Boolean),
      textosConsolidados: [
        item.texto,
        item.descricao,
        item.sinopse,
        item.observacoes,
        item.resultado,
        item.resultados,
      ].map(sanitizeReportText).filter((text) => text.length > 30).slice(0, 3),
      relatosEquipe: [],
      relatoriosVinculados: [],
      participantes: getParticipantCount(item),
      isCommunicationCard: isCommunicationRecord(item),
      publicoRegistrado,
      publicoEstimado,
      publicoTipo: publicoRegistrado > 0 ? 'registrado' : publicoEstimado > 0 ? 'estimado' : 'nao_informado',
      metaEditorial: meta || '',
      metaInferida: false,
      consolidatedCount: 1,
      evidenciaLinks: sourcePhotos
        .map((photo) => photo?.url || photo?.file_url || photo?.src || photo?.arquivo_url || photo?.arquivo_original_url)
        .filter(Boolean)
        .slice(0, 8),
    };
  });

  return (
    <PremiumSection
      chapterId="agenda_programacao"
      chapterIds={['agenda_programacao']}
      chapterTitle="Agenda de programação"
      breakBefore
      eyebrow="Agenda Museus Centro no período"
      title="Agenda detalhada do período"
      subtitle="Cada item preserva título, museu, data, tipo, público, meta e fotos vinculadas quando disponíveis no aplicativo."
      text="A agenda preserva os registros do período conforme aparecem na programação e nas atividades do aplicativo. Apenas duplicidades estritas por identificador ou por data, museu e título equivalente são removidas da exibição."
    >
      <ChapterMethodologyPanel
        chapterId="agenda_programacao"
        contexto={contexto}
        evidence={['programação consolidada', 'relatórios aprovados', 'fotos selecionadas para atividade', 'metadados de público e meta']}
      />
      {unique.length === 0 ? <EmptyChapterNotice chapterTitle="Agenda de programação" /> : (
        <div className="premium-month-grid">
          {unique.map((item, index) => (
            <article className="premium-month-card" key={item.id || `${item.titulo}-${index}`}>
            <ActivityMiniPhotos activity={item} />
            {item.consolidatedCount > 1 ? <span className="agenda-consolidation-badge">{fmtInt(item.consolidatedCount)} registros consolidados</span> : null}
            <header className="premium-card-header">
              <div>
                <p className="premium-card-kicker">
                  {[item.museu, item.tipo, item.mes || getMonthName(item)].filter(Boolean).map((value, keyIndex) => (
                    <span key={`${value}-${keyIndex}`}>{sanitizeReportText(value)}</span>
                  ))}
                </p>
                <h3>{sanitizeReportText(item.titulo)}</h3>
              </div>
              {!item.isCommunicationCard && (item.publicoRegistrado > 0 || item.publicoEstimado > 0) ? (
                <div className="premium-public-highlight">
                  <strong>
                    {item.publicoRegistrado > 0
                      ? fmtInt(item.publicoRegistrado)
                      : item.publicoEstimado > 0
                        ? fmtInt(item.publicoEstimado)
                        : ''}
                  </strong>
                  <span>
                    {item.publicoTipo === 'estimado'
                      ? 'público estimado'
                      : 'participantes'}
                  </span>
                </div>
              ) : null}
            </header>
            <div className="premium-card-facts">
              <span><strong>Datas</strong>{(item.datasConsolidadas || []).join(', ') || item.data || item.mes || 'período'}</span>
              <span><strong>Meta vinculada</strong>{item.metaEditorial || getActivityMeta(item) || ''}{item.metaInferida ? ' (inferida)' : ''}</span>
              {!item.isCommunicationCard ? <span><strong>Público</strong>{item.publicoTipo === 'estimado' ? 'estimado a partir da programação' : 'registrado nos relatórios e atividades'}</span> : null}
              {item.participantes > 0 ? <span><strong>Participantes</strong>{fmtInt(item.participantes)} pessoas identificadas</span> : null}
              {item.relatoriosVinculados?.length ? <span><strong>Relatórios vinculados</strong>{item.relatoriosVinculados.join(', ')}</span> : null}
            </div>
            <ActivityNarrative item={item} />
            {item.isCommunicationCard ? (
              <p className="premium-card-footnote">Entregas agrupadas: comunicação, cobertura, registros, edição, documentação, peças digitais, audiovisual, clipping e divulgação institucional. Este card não atribui público direto.</p>
            ) : null}
            <footer className="premium-card-footer">
              <span><strong>Localização</strong>{item.local || item.endereco || item.museu || 'Museus Centro'}</span>
              <span><strong>Créditos</strong>{item.credito || item.creditos || item.producao || 'registros do aplicativo'}</span>
              <span><strong>Indicador</strong>{item.isCommunicationCard ? 'documentação institucional' : item.publicoTipo === 'estimado' ? 'público estimado' : 'público registrado'}</span>
            </footer>
            <EvidenceLinks links={item.evidenciaLinks} />
            </article>
          ))}
        </div>
      )}
    </PremiumSection>
  );
}

function ProgramacaoRecordsList({ contexto }) {
  const items = Array.isArray(contexto?.programacao) ? contexto.programacao : [];
  if (items.length === 0) return <EmptyChapterNotice chapterTitle="Programação" />;

  return (
    <div className="premium-table-wrap">
      <table className="premium-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Ação planejada/realizada</th>
            <th>Museu</th>
            <th>Status/tipo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id || index}>
              <td>{sanitizeReportText(item.data || item.data_inicio || item.mes || '-')}</td>
              <td>{sanitizeReportText(item.titulo || item.nome || item.nome_acao || 'Programação registrada')}</td>
              <td>{sanitizeReportText(getMuseuLabel(item.museu || item.equipamento || item.local || 'Atuação geral'))}</td>
              <td>{sanitizeReportText(item.status || item.tipo || item.tipo_atividade || '-')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportsArchiveSection({ contexto }) {
  const reports = Array.isArray(contexto?.relatorios_equipe) ? contexto.relatorios_equipe : [];

  return (
    <PremiumSection
      chapterId="relatorios_completos"
      chapterIds={['relatorios_completos']}
      chapterTitle="Relatórios integrais das equipes"
      breakBefore
      eyebrow="Relatórios da equipe"
      title="Relatórios individuais das equipes"
      subtitle={`${fmtInt(reports.length)} relatórios aprovados compõem a base narrativa, técnica e documental do período.`}
      text="Esta seção preserva os relatórios individuais aprovados pelas equipes, mantendo autoria, função, museu, mês, atividades, público e textos originais registrados no aplicativo."
    >
      <ChapterMethodologyPanel
        chapterId="relatorios_completos"
        contexto={contexto}
        evidence={['relatórios aprovados', 'autoria', 'museu', 'mês', 'trechos narrativos aprovados']}
      />
      {reports.length === 0 ? <EmptyChapterNotice chapterTitle="Relatórios integrais das equipes" /> : (
        <div className="premium-report-archive">
          {reports.map((report, index) => (
            <article className="premium-report-note" key={report.id || index}>
              <strong>{report.autor || report.author_name || 'Equipe Museus Centro'}</strong>
              <span>{[report.funcao, report.museu, report.mes].filter(Boolean).join(' / ')}</span>
              <span>{fmtInt(report.atividades_count)} atividades · público {fmtInt(report.publico)}</span>
              {[
                ['Resumo executivo', report.resumo_executivo],
                ['Resumo do período', report.resumo_periodo],
                ['Pontos positivos', report.pontos_positivos],
                ['Desafios', report.desafios],
              ].filter(([, value]) => sanitizeReportText(value).length > 0).map(([label, value]) => (
                <small key={`${report.id || index}-${label}`}>
                  <strong>{label}: </strong>{sanitizeReportText(value)}
                </small>
              ))}
              {![report.resumo_executivo, report.resumo_periodo, report.pontos_positivos, report.desafios].some((value) => sanitizeReportText(value).length > 0) ? (
                <small>Relatório aprovado usado como fonte do período.</small>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </PremiumSection>
  );
}

function ReportPdfInstitutionalHeader({ volumeNumber = 1, pageStart = 1 }) {
  return (
    <div className="report-pdf-institutional-header">
      <div className="report-pdf-institutional-logo-wrap">
        <img
          src="/logo.png"
          alt="Logo institucional"
          className="report-pdf-institutional-logo"
        />
      </div>

      <div className="report-pdf-institutional-text">
        <div>Viaduto das Artes – Fundado em 16 de junho de 2015</div>
        <div>Av. Olinto Meireles, 45 – Barreiro – Belo Horizonte/MG</div>
        <div>CEP 30640-010 – E-mail: viadutodasartes@gmail.com</div>
        <div className="report-pdf-footerline">
          Museus Centro - Relatorio Institucional - Volume {volumeNumber} | Pagina <span className="report-pdf-page-counter" />
          {pageStart > 1 ? ` (inicio ${pageStart})` : ''}
        </div>
      </div>
    </div>
  );
}

const MONTH_ORDER = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function monthSortValue(value = '') {
  const key = normalizeText(value);
  return MONTH_ORDER[key] || 99;
}

function photoActivityLabel(photo = {}) {
  const explicit = sanitizeReportText(photo.atividade || photo.atividade_nome || photo.titulo_atividade || '');
  if (explicit && normalizeText(explicit) !== 'atividade vinculada ao app') return explicit;

  const caption = sanitizeReportText(photo.legenda || photo.caption || '');
  const normalizedCaption = normalizeText(caption);
  if (caption && !normalizedCaption.includes('whatsapp image') && !normalizedCaption.includes('registro fotografico')) {
    return caption.replace(/^Registro da atividade\s+/i, '').replace(/\.$/, '');
  }

  return '';
}

function photoCaptionForActivity(photo = {}, activityTitle = '') {
  const title = sanitizeReportText(activityTitle);
  const museu = sanitizeReportText(photo.museu || 'Museus Centro');
  const mes = sanitizeReportText(photo.mes || '');
  const location = photo.localizacao?.label || resolveMuseumLocation(photo);
  const parts = [title, museu, mes].filter(Boolean).join(' · ');
  return sanitizeReportText(`Registro da atividade ${parts}. Localização: ${location}.`);
}

function groupPhotosByMonthMuseumActivity(contexto) {
  const allPhotos = extractPhotos(contexto)
    .filter((photo) => photo?.link || photo?.url)
    .map((photo) => ({
      ...photo,
      atividade: photoActivityLabel(photo),
      mes: sanitizeReportText(photo.mes || 'Período'),
      museu: sanitizeReportText(photo.museu || 'Museus Centro'),
    }));

  const { galleryPhotos } = prepareInlineAndGalleryPhotos(
    allPhotos,
    contexto?.selected_inline_photo_ids || []
  );

  return groupGalleryPhotosByMuseumMonthActivity(galleryPhotos).map((museumGroup) => ({
    museu: museumGroup.museu,
    months: museumGroup.months.map((monthGroup) => ({
      mes: monthGroup.mes,
      activities: monthGroup.activities.map((activityGroup) => ({
        ...activityGroup,
        photos: activityGroup.photos,
      })),
    })),
  }));
}

function GovernanceEvidenceSection({ contexto = {} }) {
  return (
    <PremiumSection
      chapterId="governanca_documental"
      breakBefore
      eyebrow="Governança documental"
      title="Governança documental e rastreabilidade das evidências"
      subtitle="A consolidação documental do período considera anexos, documentos fiscais, comprovantes, fotos, vínculos com solicitações e arquivos relacionados disponíveis no aplicativo."
      text={getChapterIntro('governanca_documental', contexto) || 'Este capítulo organiza a trilha documental do relatório a partir dos arquivos efetivamente localizados no app. Quando um documento está pareado a uma solicitação, pagamento, rubrica, foto ou atividade, o relatório preserva esse vínculo. Quando o pareamento não existe ou está incompleto, a limitação é explicitada sem preenchimento artificial.'}
    >
      <ChapterMethodologyPanel
        chapterId="governanca_documental"
        contexto={contexto}
        evidence={['DocumentIntake', 'Attachment', 'PDFs', 'XMLs', 'recibos', 'comprovantes', 'fotos', 'origem dos arquivos']}
      />
    </PremiumSection>
  );
}


function DocumentLinkCell({ url, label, fallbackLabel = 'Link indisponível' }) {
  if (!url) return <span>{sanitizeReportText(fallbackLabel)}</span>;
  return (
    <a className="document-link" href={url} target="_blank" rel="noopener noreferrer">
      {sanitizeReportText(label)}
    </a>
  );
}

function DocumentsChapterSection({ contexto = {} }) {
  const docs = buildDocumentsChapterData(contexto);
  const contracts = Array.isArray(docs.contracts) ? docs.contracts : [];
  const fiscalDocuments = Array.isArray(docs.fiscalDocuments) ? docs.fiscalDocuments : [];
  const limitations = Array.isArray(docs.limitations) ? docs.limitations : [];

  return (
    <PremiumSection
      chapterId="notas-fiscais-contratos"
      breakBefore
      eyebrow="Rastreabilidade fiscal"
      title="Notas fiscais e contratos"
      subtitle="Listagem de contratos e documentos fiscais existentes no app, com separação por tipo e vínculo operacional."
      text={getChapterIntro('notas-fiscais-contratos', contexto) || 'Este capítulo reúne os arquivos documentais utilizados para sustentar a prestação de contas do período, organizando contratos e documentos fiscais a partir dos registros disponíveis no app. A listagem considera os documentos vinculados à Gestão Documental, à Entrada Única, às solicitações de compras, aos pagamentos de equipe e aos anexos relacionados. Os links são apresentados para facilitar a rastreabilidade entre execução operacional, documentação fiscal e comprovação institucional.'}
    >
      <ChapterMethodologyPanel
        chapterId="notas-fiscais-contratos"
        contexto={contexto}
        evidence={['Attachment', 'DocumentIntake', 'PurchaseRequest', 'TeamPayment', 'PDFs', 'XMLs', 'recibos', 'comprovantes']}
      />
      <div className="premium-method-grid">
        <article className="premium-method-card">
          <strong>Como os documentos foram obtidos</strong>
          <p>Os arquivos listados foram identificados a partir dos registros disponíveis no app, considerando documentos enviados pela Entrada Única, anexos da Gestão Documental, vínculos com solicitações financeiras, pagamentos de equipe e campos específicos de contratos, notas fiscais, XMLs, recibos e comprovantes. Quando um mesmo arquivo aparece em mais de uma origem, a listagem consolida o documento uma única vez para evitar duplicidade.</p>
        </article>
        {limitations.length > 0 && (
          <article className="premium-method-card">
            <strong>Limitações da listagem</strong>
            <ul>
              {limitations.map((item, index) => (
                <li key={`${item}-${index}`}>{sanitizeReportText(item)}</li>
              ))}
            </ul>
          </article>
        )}
      </div>

      <div className="premium-purchase-section">
        <h3>Contratos em PDF</h3>
        <p>Lista de contratos localizados nos documentos do app para o período ou vinculados à equipe, fornecedores, solicitações ou registros documentais.</p>
        {contracts.length === 0 ? (
          <p>Não foram localizados contratos em PDF vinculados ao período ou aos registros documentais disponíveis no app.</p>
        ) : (
          <div className="premium-table-wrap">
            <table className="premium-table documents-table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Nome do arquivo</th>
                  <th>Pessoa/fornecedor/equipe</th>
                  <th>Vínculo no app</th>
                  <th>Data de envio ou criação</th>
                  <th>Tipo</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((item, index) => (
                  <tr key={item.key || `${item.fileName}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{sanitizeReportText(item.fileName || '-')}</td>
                    <td>{sanitizeReportText(item.personSupplier || '-')}</td>
                    <td>{sanitizeReportText(item.entityLabel || '-')}</td>
                    <td>{sanitizeReportText(item.date || '-')}</td>
                    <td>{sanitizeReportText(item.tipo || 'Contrato')}</td>
                    <td><DocumentLinkCell url={item.url} label="Abrir contrato" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="premium-purchase-section">
        <h3>Notas fiscais e documentos fiscais</h3>
        <p>Lista de notas fiscais, XMLs, recibos e comprovantes localizados nos documentos do app e vinculados às solicitações financeiras, pagamentos de equipe ou registros da Entrada Única.</p>
        {fiscalDocuments.length === 0 ? (
          <p>Não foram localizadas notas fiscais ou documentos fiscais vinculados ao período ou aos registros documentais disponíveis no app.</p>
        ) : (
          <div className="premium-table-wrap">
            <table className="premium-table documents-table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Nome do arquivo</th>
                  <th>Fornecedor/emissor</th>
                  <th>Nº da NF</th>
                  <th>Valor</th>
                  <th>Data de emissão ou envio</th>
                  <th>Tipo</th>
                  <th>Vínculo no app</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {fiscalDocuments.map((item, index) => (
                  <tr key={item.key || `${item.fileName}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{sanitizeReportText(item.fileName || '-')}</td>
                    <td>{sanitizeReportText(item.personSupplier || '-')}</td>
                    <td>{sanitizeReportText(item.invoiceNumber || '-')}</td>
                    <td>{item.value > 0 ? fmtBRL(item.value) : '-'}</td>
                    <td>{sanitizeReportText(item.date || '-')}</td>
                    <td>{sanitizeReportText(item.tipo || 'Documento fiscal')}</td>
                    <td>{sanitizeReportText(item.entityLabel || '-')}</td>
                    <td><DocumentLinkCell url={item.url} label="Abrir arquivo" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PremiumSection>
  );
}

function PhotoEvidenceDenseSection({ contexto, chapterIds = ['galeria_evidencias'] }) {
  const groups = groupPhotosByMonthMuseumActivity(contexto);
  const photos = groups.flatMap((museumGroup) =>
    museumGroup.months.flatMap((monthGroup) =>
      monthGroup.activities.flatMap((activityGroup) => activityGroup.photos)
    )
  );

  return (
    <PremiumSection
      chapterId="galeria_evidencias"
      chapterIds={chapterIds}
      chapterTitle="Galeria e evidências"
      breakBefore
      eyebrow="Galeria e evidências"
      title="Fotos, créditos e localização"
      subtitle="Registros fotográficos incorporados ao HTML e ao PDF, com atividade, museu, mês, arquivo, crédito e localização institucional."
      text="A listagem amplia a densidade documental do relatório e evita que a fotografia apareça apenas como link. Cada item preserva o vínculo com a atividade ou arquivo de origem disponível no app."
    >
      <ChapterMethodologyPanel
        chapterId="galeria_evidencias"
        contexto={contexto}
        evidence={['fotos não selecionadas para atividades', 'metadados de crédito', 'legenda', 'localização e origem do arquivo']}
      />
      {photos.length === 0 ? <EmptyChapterNotice chapterTitle="Galeria e evidências" /> : groups.map((museumGroup) => (
        <section key={museumGroup.museu} className="premium-purchase-section">
          <h3>{sanitizeReportText(museumGroup.museu)}</h3>
          {museumGroup.months.map((monthGroup) => (
            <div key={`${museumGroup.museu}-${monthGroup.mes}`} className="mt-4">
              <p className="premium-card-meta">{sanitizeReportText(monthGroup.mes)}</p>
              {monthGroup.activities.map((activityGroup) => (
                <div key={`${monthGroup.mes}-${activityGroup.atividade}`} className="mt-3">
                  <p className="premium-public-context">{sanitizeReportText(activityGroup.atividade)}</p>
                  <div className="premium-photo-index">
                    {activityGroup.photos.map((photo, index) => {
                      const imageUrl = getPhotoUrl(photo);
                      const activity = getPhotoActivityName(photo);
                      const museum = getPhotoMuseumName(photo);
                      const fileName = cleanFileName(getPhotoFileName(photo));
                      const location = photo.localizacao?.label || resolveMuseumLocation({ ...photo, museu: museum });
                      const credit = photo.credito || resolveMuseumCredit(photo);
                      const photoKey = getPhotoIdentity(photo) || `${imageUrl}-${index}`;

                      return (
                        <article className="premium-photo-index-item" key={photoKey}>
                          <a href={imageUrl} target="_blank" rel="noreferrer" className="premium-photo-index-thumb">
                            <img
                              src={imageUrl}
                              alt={sanitizeReportText(activity)}
                              loading="eager"
                              crossOrigin="anonymous"
                              referrerPolicy="no-referrer"
                              onError={(event) => {
                                event.currentTarget.closest('.premium-photo-index-thumb')?.classList.add('premium-photo-index-no-image');
                              }}
                            />
                          </a>

                          <strong>{sanitizeReportText(museum)}</strong>
                          <span>{sanitizeReportText(activity)}</span>
                          <small>{sanitizeReportText(monthGroup.mes)}</small>
                          <small>{sanitizeReportText(fileName)}</small>
                          <small>Local: {sanitizeReportText(location)}</small>
                          <small>Crédito: {sanitizeReportText(credit)}</small>
                          {photo?.origem ? <small>Origem: {sanitizeReportText(photo.origem)}</small> : null}
                          <a href={imageUrl} target="_blank" rel="noreferrer">Abrir arquivo</a>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </PremiumSection>
  );
}

function getRubricaSaldo(item = {}) {
  const previsto = getRubricaPrevisto(item);
  const utilizado = getRubricaUtilizado(item);
  const saldo = toNumber(item?.saldo);
  return saldo || Math.max(previsto - utilizado, 0);
}

function getRubricaPercentual(item = {}) {
  const previsto = getRubricaPrevisto(item);
  if (previsto <= 0) return 0;
  const explicit = toNumber(item?.percentual);
  if (explicit > 0) return explicit;
  return (getRubricaUtilizado(item) / previsto) * 100;
}

function getExecutionStatus(percentual = 0) {
  if (percentual >= 70) return { label: 'Alta execução', className: 'alta' };
  if (percentual >= 15) return { label: 'Em execução', className: 'andamento' };
  return { label: 'Baixa execução', className: 'baixa' };
}

function groupRubricas(rubricas = []) {
  return rubricas.reduce((acc, item) => {
    const group = item?.grupo || item?.categoria || 'Sem grupo informado';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

function sumRubricas(items = []) {
  const previsto = items.reduce((sum, item) => sum + getRubricaPrevisto(item), 0);
  const utilizado = items.reduce((sum, item) => sum + getRubricaUtilizado(item), 0);
  const saldo = Math.max(previsto - utilizado, 0);
  const percentual = previsto > 0 ? (utilizado / previsto) * 100 : 0;
  return { previsto, utilizado, saldo, percentual };
}

function FinanceSummaryCards({ totals }) {
  return (
    <div className="premium-finance-summary-cards">
      <div className="premium-finance-summary-card">
        <span>Total previsto</span>
        <strong>{fmtBRL(totals.previsto)}</strong>
      </div>
      <div className="premium-finance-summary-card">
        <span>Total utilizado</span>
        <strong>{fmtBRL(totals.utilizado)}</strong>
      </div>
      <div className="premium-finance-summary-card">
        <span>Saldo disponível</span>
        <strong>{fmtBRL(totals.saldo)}</strong>
      </div>
      <div className="premium-finance-summary-card">
        <span>Execução</span>
        <strong>{totals.percentual.toFixed(1).replace('.', ',')}%</strong>
      </div>
    </div>
  );
}

function RubricasTable({ contexto }) {
  const rubricas = Array.isArray(contexto?.rubricas) ? contexto.rubricas : [];
  if (rubricas.length === 0) return null;

  const totals = sumRubricas(rubricas);
  const grouped = groupRubricas(rubricas);
  const orderedGroups = Object.entries(grouped)
    .map(([grupo, items]) => ({ grupo, items, totals: sumRubricas(items) }))
    .sort((a, b) => b.totals.previsto - a.totals.previsto);

  return (
    <div>
      <FinanceSummaryCards totals={totals} />
      <p className="premium-finance-note">
        As rubricas foram reorganizadas por grupo orçamentário, com subtotais, saldo e percentual de execução. A tabela evita leitura de planilha bruta e apresenta o orçamento como quadro executivo de prestação de contas.
      </p>

      {orderedGroups.map(({ grupo, items, totals: groupTotals }) => (
        <section className="premium-finance-group" key={grupo}>
          <header className="premium-finance-group-header">
            <h3>{grupo}</h3>
            <span>Previsto<br />{fmtBRL(groupTotals.previsto)}</span>
            <span>Utilizado<br />{fmtBRL(groupTotals.utilizado)}</span>
            <span>Saldo<br />{fmtBRL(groupTotals.saldo)}</span>
            <span>Execução<br />{groupTotals.percentual.toFixed(1).replace('.', ',')}%</span>
          </header>

          <table className="premium-rubrica-table">
            <thead>
              <tr>
                <th>Rubrica</th>
                <th className="premium-money-cell">Previsto</th>
                <th className="premium-money-cell">Utilizado</th>
                <th className="premium-money-cell">Saldo</th>
                <th>Execução</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items
                .slice()
                .sort((a, b) => getRubricaPrevisto(b) - getRubricaPrevisto(a))
                .map((item, index) => {
                  const previsto = getRubricaPrevisto(item);
                  const utilizado = getRubricaUtilizado(item);
                  const saldo = getRubricaSaldo(item);
                  const percentual = getRubricaPercentual(item);
                  const status = getExecutionStatus(percentual);

                  return (
                    <tr key={item?.id || `${grupo}-${index}`}>
                      <td className="premium-rubrica-name">{item?.rubrica || item?.nome || 'Rubrica sem nome'}</td>
                      <td className="premium-money-cell">{fmtBRL(previsto)}</td>
                      <td className="premium-money-cell">{fmtBRL(utilizado)}</td>
                      <td className="premium-money-cell">{fmtBRL(saldo)}</td>
                      <td className="premium-execution-cell">
                        <div className="premium-execution-bar">
                          <span style={{ width: `${Math.min(Math.max(percentual, 0), 100)}%` }} />
                        </div>
                        <div className="premium-execution-label">
                          <span>{percentual.toFixed(1).replace('.', ',')}%</span>
                          <span>{fmtBRL(utilizado)}</span>
                        </div>
                      </td>
                      <td><span className={`premium-status-chip ${status.className}`}>{status.label}</span></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function ComprasTable({ contexto }) {
  const compras = Array.isArray(contexto?.compras) ? contexto.compras : [];
  if (compras.length === 0) return null;

  const approved = compras
    .filter((item) => !item?.status || String(item.status).toUpperCase().includes('APROV') || String(item.status).toUpperCase().includes('PAGO'));

  if (approved.length === 0) return null;

  return (
    <section className="premium-purchase-section">
      <h3>Movimentações financeiras do período</h3>
      <p>
        As solicitações aprovadas são apresentadas separadamente das rubricas para preservar a diferença entre orçamento previsto, execução acumulada e movimentações operacionais do período.
      </p>
      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Rubrica</th>
              <th>Status</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {approved.map((item, index) => (
              <tr key={item?.id || index}>
                <td>{item?.fornecedor || item?.fornecedor_nome || '-'}</td>
                <td>{item?.rubrica || item?.rubrica_nome || '-'}</td>
                <td>{item?.status || '-'}</td>
                <td className="premium-money-cell">{fmtBRL(item?.valor ?? item?.valor_solicitado ?? item?.valor_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AudienceBreakdown({ contexto }) {
  const porMes = buildAudienceMonthRows(contexto);
  const porMuseu = Array.isArray(contexto?.publico_por_museu) ? contexto.publico_por_museu : Object.values(contexto?.por_museu || {});
  const totalMes = porMes.reduce((sum, item) => sum + toNumber(item.total), 0);
  const totalMuseu = porMuseu.reduce((sum, item) => sum + toNumber(item.total ?? item.publico), 0);
  const hasAudienceDivergence = totalMes > 0 && totalMuseu > 0 && totalMes !== totalMuseu;

  return (
    <div className="premium-audience-grid">
      <AudienceMonthlyChart rows={porMes} />
      <div>
        <h3>Público por mês</h3>
        <div className="premium-table-wrap">
          <table className="premium-table">
            <thead>
              <tr><th>Mês</th><th>Ações</th><th>Espontâneo</th><th>Agendadas</th><th>Total</th></tr>
            </thead>
            <tbody>
              {porMes.map((item) => (
                <tr key={item.mes}>
                  <td>{item.mes}</td>
                  <td>{fmtInt(item.atividades)}</td>
                  <td>{fmtInt(item.espontaneo)}</td>
                  <td>{fmtInt(item.visitas_agendadas)}</td>
                  <td>{fmtInt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3>Público por museu</h3>
        <div className="premium-table-wrap">
          <table className="premium-table">
            <thead>
              <tr><th>Museu</th><th>Atividades</th><th>Espontâneo</th><th>Agendadas</th><th>Total</th></tr>
            </thead>
            <tbody>
              {porMuseu.map((item) => (
                <tr key={item.museu}>
                  <td>{item.museu}</td>
                  <td>{fmtInt(item.publico ?? item.atividades_publico)}</td>
                  <td>{fmtInt(item.espontaneo)}</td>
                  <td>{fmtInt(item.visitas_agendadas)}</td>
                  <td>{fmtInt(item.total ?? item.publico)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {hasAudienceDivergence ? (
        <div className="premium-method-card premium-audience-note">
          <strong>Nota metodológica sobre público</strong>
          <p>Os indicadores de público distinguem registros de atividades datadas no período e consolidações por museu quando estas decorrem de fontes diferentes no app. A divergência entre totais deve ser explicitada ou corrigida conforme a fonte de consolidação adotada.</p>
        </div>
      ) : null}
    </div>
  );
}

function PremiumMetasPanel({ contexto }) {
  const metas = buildMetaCards(contexto);

  return (
    <section>
      <div className="premium-meta-grid">
        {metas.map((meta) => {
          const isDone = meta.status === 'CONCLUÍDA';

          return (
            <article className="premium-meta-card" key={meta.numero}>
              <div className="premium-meta-top">
                <span className="premium-meta-code">{meta.numero}</span>
                <span className={`premium-meta-status${isDone ? ' done' : ''}`}>
                  {meta.status}
                </span>
              </div>

              <h3 className="premium-meta-title">{meta.titulo}</h3>
              <p className="premium-meta-detail">{meta.detalhe}</p>

              <div className="premium-meta-progress-label">
                <span>{meta.indicador}</span>
                <strong>{fmtInt(meta.percentual)}%</strong>
              </div>

              <div className="premium-meta-progress" aria-label={`${meta.numero}: ${fmtInt(meta.percentual)} por cento`}>
                <span style={{ width: `${Math.min(toNumber(meta.percentual), 100)}%` }} />
              </div>

            </article>
          );
        })}
      </div>
    </section>
  );
}

function StrategicRecords({ contexto }) {
  const atividades = Array.isArray(contexto?.atividades) ? contexto.atividades : [];
  const isInternalNoise = (atividade = {}) => {
    const text = normalizeText(`${atividade?.nome || ''} ${atividade?.titulo || ''} ${atividade?.descricao || ''} ${atividade?.classificacao || ''}`);
    return text.includes('ritual de gestao') ||
      text.includes('reuniao de apresentacao') ||
      text.includes('contatos internos') ||
      text.includes('contato interno') ||
      text.includes('contratacao de consultoria');
  };
  const grupos = [
    { titulo: 'Ambiente seguro e diversidade', termos: ['ambiente seguro', 'diversidade', 'inclusao', 'inclusão'] },
    { titulo: 'Memórias e Libras', termos: ['libras', 'memorias', 'memórias', 'surdo', 'acessibilidade'] },
    { titulo: 'Entrevista / Registro recuperado', termos: ['entrevista', 'registro recuperado'] },
    { titulo: 'Traços ao Pixel', termos: ['tracos ao pixel', 'traços ao pixel', 'pixel'] },
    { titulo: 'Atuação geral', termos: ['atuacao geral', 'atuação geral', 'coordenação', 'coordenacao', 'consultora de programação'] },
    { titulo: 'Reuniões semanais com a equipe', termos: ['reuniao', 'reunião', 'ritual de gestao', 'ritual de gestão', 'alinhamento'] },
    { titulo: 'Acompanhamento das filmagens', termos: ['filmagem', 'filmagens', 'audiovisual', 'video', 'vídeo'] },
    { titulo: 'Trechos de entrevistas de Libras', termos: ['entrevista', 'libras'] },
  ].map((grupo) => ({
    ...grupo,
    itens: atividades.filter((atividade) => {
      const groupKey = normalizeText(grupo.titulo);
      if (groupKey.includes('atuacao geral') || groupKey.includes('reunioes semanais')) return false;
      if (isInternalNoise(atividade)) return false;
      const text = `${atividade?.nome || ''} ${atividade?.descricao || ''} ${atividade?.classificacao || ''} ${atividade?.categoria_label || ''}`.toLowerCase();
      return grupo.termos.some((termo) => text.includes(termo));
    }),
  })).filter((grupo) => grupo.itens.length > 0);

  if (grupos.length === 0) return null;

  return (
    <PremiumSection
      breakBefore
      eyebrow="Registros editoriais recuperados"
      title="Ações estratégicas do período"
      subtitle="Atividades e registros internos são apresentados conforme aparecem nos relatórios aprovados, sem criar eventos fora da base do app."
      text="Esta seção aproxima ações de acessibilidade, formação, reuniões, filmagens, entrevistas e registros recuperados. Quando a ação é interna, ela é lida como atividade de gestão, produção, comunicação ou mediação, sem atribuição indevida de público direto."
    >
      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Seção</th>
              <th>Registro localizado</th>
              <th>Museu</th>
              <th>Mês</th>
              <th>Classificação</th>
            </tr>
          </thead>
          <tbody>
            {grupos.flatMap((grupo) => grupo.itens.map((item, index) => (
              <tr key={`${grupo.titulo}-${item?.id || index}`}>
                <td>{grupo.titulo}</td>
                <td>{item?.nome || item?.titulo || 'Registro do app'}</td>
                <td>{item?.museu || 'Geral'}</td>
                <td>{item?.mes || item?.data || 'Período'}</td>
                <td>{item?.categoria_label || item?.classificacao || 'Atividade interna'}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </PremiumSection>
  );
}

function RemovedPeriodSection({ contexto }) {
  const atividades = (Array.isArray(contexto?.atividades) ? contexto.atividades : []).filter((item) => {
    const text = `${item?.nome || ''} ${item?.descricao || ''} ${item?.categoria_label || ''}`.toLowerCase();
    return text.includes('noturno');
  });
  const rubricas = (Array.isArray(contexto?.rubricas) ? contexto.rubricas : []).filter((item) => {
    const text = `${item?.grupo || ''} ${item?.rubrica || ''} ${item?.nome || ''}`.toLowerCase();
    return text.includes('noturno');
  });

  return (
    <PremiumSection
      chapterId="noturno_premium"
      breakBefore
      eyebrow="Seção especial"
      title="Noturno nos Museus"
      subtitle="Planejamento, pré-produção, infraestrutura, comunicação e rubricas vinculadas ao eixo de maior visibilidade pública."
      text={atividades.length === 0 && rubricas.length === 0
        ? 'O capítulo permanece no relatório para preservar a estrutura editorial oficial. No recorte selecionado, não foram localizados registros suficientes de programação, atividade ou rubrica que justifiquem a abertura pública de uma seção específica do Noturno nos Museus.'
        : 'Seção mantida fora do fluxo público deste relatório porque o evento não ocorreu no período analisado.'}
    >
      <div className="premium-finance-grid">
        <div>
          <h3>Registros relacionados</h3>
          <div className="premium-table-wrap">
            <table className="premium-table">
              <tbody>
                {atividades.map((item, index) => (
                  <tr key={item?.id || index}>
                    <td>{item?.nome || item?.titulo || 'Ação fora do recorte'}</td>
                    <td>{item?.museu || 'Geral'}</td>
                    <td>{item?.data || item?.mes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Rubricas fora do recorte</h3>
          <div className="premium-table-wrap">
            <table className="premium-table">
              <tbody>
                {rubricas.map((item, index) => (
                  <tr key={item?.id || index}>
                    <td>{item?.rubrica || item?.nome || 'Rubrica fora do recorte'}</td>
                    <td>{fmtBRL(item?.valor_previsto ?? item?.previsto ?? item?.valor_rubrica ?? item?.valor_total)}</td>
                    <td>{fmtBRL(item?.valor_utilizado ?? item?.utilizado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PremiumSection>
  );
}

function GalleryMethodologyOnlySection({ contexto, chapterIds = ['galeria_evidencias'] }) {
  return (
    <PremiumSection
      chapterId="galeria_evidencias"
      chapterIds={chapterIds}
      chapterTitle="Galeria e evidências"
      breakBefore
      eyebrow="Galeria e evidências"
      title="Critérios de uso de imagens"
      subtitle="As imagens foram distribuídas ao longo das atividades para evitar duplicidade."
      text="As evidências visuais foram distribuídas ao longo do relatório junto às atividades correspondentes, evitando duplicidade de imagens e fortalecendo a relação entre registro fotográfico, ação realizada, museu, data e público."
    >
      <ChapterMethodologyPanel
        chapterId="galeria_evidencias"
        contexto={contexto}
        evidence={['imagens vinculadas a atividades', 'controle de uso único', 'créditos e origem', 'imagens sem vínculo suficiente']}
      />
      <div className="premium-method-grid">
        <article className="premium-method-card">
          <strong>Imagens sem uso</strong>
          <p>{fmtInt(Array.isArray(contexto?.unusedImages) ? contexto.unusedImages.length : 0)} registros sem vínculo suficiente foram preservados fora do corpo editorial.</p>
        </article>
        <article className="premium-method-card">
          <strong>Duplicidades evitadas</strong>
          <p>{fmtInt(Array.isArray(contexto?.duplicatedImagesAvoided) ? contexto.duplicatedImagesAvoided.length : 0)} ocorrências de repetição foram bloqueadas automaticamente.</p>
        </article>
      </div>
    </PremiumSection>
  );
}


function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getRealActivities(contexto = {}) {
  return [
    ...safeArray(contexto.atividades),
    ...safeArray(contexto.activities),
    ...safeArray(contexto.programacao),
    ...safeArray(contexto.programacoes),
  ].filter((item) => item && (item.titulo || item.nome || item.descricao || item.sinopse));
}

function getRealReports(contexto = {}) {
  return [
    ...safeArray(contexto.relatorios_equipe),
    ...safeArray(contexto.relatorios),
    ...safeArray(contexto.reports),
  ].filter(Boolean);
}

function getRealTeamCount(contexto = {}) {
  const names = new Set();

  [
    ...safeArray(contexto.equipe),
    ...safeArray(contexto.team_members),
    ...safeArray(contexto.relatorios_equipe),
    ...safeArray(contexto.reports),
  ].forEach((item) => {
    const name = normalizeText(item?.nome || item?.autor || item?.author_name || item?.user_name || item?.fornecedor_nome);
    if (name) names.add(name);
  });

  return names.size;
}

function getEffectiveTotalActivities(contexto = {}) {
  const explicit = toNumber(contexto.total_atividades);
  if (explicit > 0) return explicit;
  return getRealActivities(contexto).length;
}

function getEffectiveTotalReports(contexto = {}) {
  const explicit = toNumber(contexto.total_relatorios);
  if (explicit > 0) return explicit;
  return getRealReports(contexto).length;
}

function getEffectiveTeamCount(contexto = {}) {
  const explicit = toNumber(contexto.total_equipe || contexto.equipe_total);
  if (explicit > 0) return explicit;
  return getRealTeamCount(contexto);
}

function getDashboardApprovedActivities(contexto = {}) {
  const dashboard = contexto?.dashboard_metrics || contexto?.dashboardMetrics || contexto?.metricas_dashboard || {};
  const monthRows = Array.isArray(dashboard?.activities?.byMonth) ? dashboard.activities.byMonth : [];
  const aprilRow = monthRows.find((row) => {
    const key = normalizeText(row?.key || row?.month || row?.mes || '');
    return key.includes('2026-04') || key.includes('abril');
  });
  return toNumber(aprilRow?.atividades ?? dashboard?.activities?.approvedInMonth ?? dashboard?.activities?.approved ?? contexto.total_atividades);
}

function getDashboardAudience(contexto = {}) {
  const dashboard = contexto?.dashboard_metrics || contexto?.dashboardMetrics || contexto?.metricas_dashboard || {};
  return toNumber(dashboard?.audience?.publicoTotal ?? contexto.publico_total);
}

function hasRealPhotos(contexto = {}) {
  const allPhotos = extractPhotos(contexto);
  const { galleryPhotos } = prepareInlineAndGalleryPhotos(
    allPhotos,
    contexto?.selected_inline_photo_ids || []
  );

  return galleryPhotos.some((photo) => {
    const url = getPhotoUrl(photo);
    return url && isRenderableImageUrl(url);
  });
}

function hasRealRubricas(contexto = {}) {
  return safeArray(contexto.rubricas).length > 0;
}

function hasRealCompras(contexto = {}) {
  return safeArray(contexto.compras).length > 0;
}

function hasRealTimelineData(contexto = {}) {
  return safeArray(contexto.programacao).length > 0 ||
    safeArray(contexto.atividades).length > 0;
}



function selectedChapterIds(selected = [], ids = []) {
  if (!Array.isArray(selected) || selected.length === 0) return ids.filter(Boolean);
  return ids.filter((id) => selected.includes(id));
}

let REPORT_SECTION_FILTER = null;

function composeIntro(textos = {}, contexto = {}) {
  const periodo = contexto?.reportEditorial?.periodLabel || contexto?.periodo_extenso || '2 de fevereiro a 30 de abril de 2026';
  return [
    `Este relatório consolida informações executivas do período de ${periodo} a partir dos dados registrados no aplicativo Museu Centro VP. Trata-se de um produto gerado com base na sistematização digital do projeto, reunindo atividades, anexos, documentos, fotografias, programação, solicitações e registros de público em uma leitura institucional verificável.`,
    'O sistema está em evolução contínua e seguirá sendo atualizado para incorporar ajustes editoriais, técnicos e de conferência ao longo do acompanhamento do projeto. Por isso, este relatório deve ser lido como base oficial do ciclo atual, sem prejuízo de revisões controladas quando houver atualização de dados no app.',
    'No recorte atual, por exemplo, o MIS recebeu nova produção registrada após fechamentos anteriores, o que exige refazer a contagem consolidada de público nesse equipamento para manter a consistência metodológica. Esse tipo de ajuste passa a ser identificado com transparência e tratado com rastreabilidade.',
    'O ponto central é que agora existe uma ferramenta que sistematiza de forma fidedigna as informações do Projeto Museus Centro. Para acompanhar os dados atualizados por museu, recomendamos a consulta contínua ao Dashboard Observador, que apresenta a evolução dos registros e apoia validações institucionais do período.',
  ].join('\n\n');
}

function composeStableInstitutionalIntro(contexto = {}) {
  const periodo =
    contexto?.reportEditorial?.periodLabel ||
    contexto?.periodo_extenso ||
    '2 de fevereiro a 30 de abril de 2026';

  return [
    `Este relat\u00f3rio consolida informa\u00e7\u00f5es executivas do per\u00edodo de ${periodo} a partir dos dados registrados no aplicativo Museu Centro VP. Trata-se de um produto gerado com base na sistematiza\u00e7\u00e3o digital do projeto, reunindo atividades, anexos, documentos, fotografias, programa\u00e7\u00e3o, solicita\u00e7\u00f5es e registros de p\u00fablico em uma leitura institucional verific\u00e1vel.`,
    'O sistema est\u00e1 em evolu\u00e7\u00e3o cont\u00ednua e seguir\u00e1 sendo atualizado para incorporar ajustes editoriais, t\u00e9cnicos e de confer\u00eancia ao longo do acompanhamento do projeto. Por isso, este relat\u00f3rio deve ser lido como base oficial do ciclo atual, sem preju\u00edzo de revis\u00f5es controladas quando houver atualiza\u00e7\u00e3o de dados no app.',
    'No recorte atual, por exemplo, o MIS recebeu nova produ\u00e7\u00e3o registrada ap\u00f3s fechamentos anteriores, o que exige refazer a contagem consolidada de p\u00fablico nesse equipamento para manter a consist\u00eancia metodol\u00f3gica. Esse tipo de ajuste passa a ser identificado com transpar\u00eancia e tratado com rastreabilidade.',
    'O ponto central \u00e9 que agora existe uma ferramenta que sistematiza de forma fidedigna as informa\u00e7\u00f5es do Projeto Museus Centro. Para acompanhar os dados atualizados por museu, recomendamos a consulta cont\u00ednua ao Dashboard Observador, que apresenta a evolu\u00e7\u00e3o dos registros e apoia valida\u00e7\u00f5es institucionais do per\u00edodo.',
  ].join('\n\n');
}

function TableOfContents({ secoesSelecionadas = [] }) {
  const chapters = getReportSummaryChapters(secoesSelecionadas)
    .filter((chapter) => !REPORT_SECTION_FILTER || REPORT_SECTION_FILTER.has(chapter.id))
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      detail: chapter.summaryDescription || chapter.group,
      isAnnex: false,
    }));

  return (
    <PremiumSection
      breakBefore
      chapterId="sumario_executivo"
      chapterTitle="Sumário executivo editorial"
      eyebrow="Sumário executivo"
      title="Síntese editorial do período"
      subtitle="Mapa dos capítulos efetivamente publicados no relatório."
      text="O sumário organiza a leitura editorial sem repetir os indicadores consolidados. Os dados quantitativos aparecem em capítulo próprio, com fonte, critério de consolidação e leitura específica."
    >
      <ol className="catalog-toc">
        {chapters.map((item) => (
          <li key={item.id || item.title}>
            <div>
              <strong>{item.title}</strong>
              {item.detail ? <span>{item.detail}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </PremiumSection>
  );
}

function BudgetByMuseumSection({ contexto = {} }) {
  const tables = contexto?.budget_tables || {};
  const resumo = Array.isArray(tables?.resumo_por_museu) ? tables.resumo_por_museu : [];

  return (
    <PremiumSection
      chapterId="orcamento_museu"
      breakBefore
      eyebrow="OrÃ§amento por Museu"
      title="OrÃ§amento por Museu"
      subtitle="SÃ­ntese da distribuiÃ§Ã£o orÃ§amentÃ¡ria entre MIS, MHAB e MUMO."
      text="A leitura do orÃ§amento por museu organiza a execuÃ§Ã£o financeira do projeto a partir da distribuiÃ§Ã£o dos recursos entre MIS, MHAB e MUMO, considerando rubricas especÃ­ficas, rubricas compartilhadas, solicitaÃ§Ãµes aprovadas, pagamentos e documentos vinculados. Essa organizaÃ§Ã£o permite relacionar orÃ§amento, programaÃ§Ã£o, atividades e prestaÃ§Ã£o de contas por equipamento cultural, fortalecendo a rastreabilidade da execuÃ§Ã£o."
    >
      <div className="budget-museum-grid">
        {resumo.map((item) => (
          <article className="budget-museum-card" key={item.museu}>
            <h3>{sanitizeReportText(item.museu || 'Museu')}</h3>
            <dl>
              <dt>Previsto</dt><dd>{fmtBRL(item.valorPrevisto)}</dd>
              <dt>Utilizado</dt><dd>{fmtBRL(item.valorUtilizado)}</dd>
              <dt>Saldo</dt><dd>{fmtBRL(item.saldo)}</dd>
              <dt>ExecuÃ§Ã£o</dt><dd>{toNumber(item.percentualExecutado).toFixed(1).replace('.', ',')}%</dd>
            </dl>
            <small>SolicitaÃ§Ãµes: {fmtInt(item.numeroSolicitacoes)}. Documentos: {fmtInt(item.numeroDocumentos)}.</small>
          </article>
        ))}
      </div>
    </PremiumSection>
  );

}

function flattenObjectPreview(item = {}) {
  if (!item || typeof item !== 'object') return '';
  const skip = new Set(['fotos', 'imagens', 'evidencias', 'attachments', 'anexos', 'inlineSelectedPhotos']);
  return Object.entries(item)
    .filter(([key, value]) => !skip.has(key) && value !== null && value !== undefined && String(value).trim() !== '')
    .slice(0, 16)
    .map(([key, value]) => `${sanitizeReportText(key)}: ${sanitizeReportText(typeof value === 'object' ? JSON.stringify(value) : value)}`)
    .join(' | ');
}

function ExecutiveIndicatorsSection() {
  const kpis = [
    { label: 'Atividades Abr', value: '52', detail: 'relatórios aprovados' },
    { label: 'Atividades previstas', value: '25', detail: 'mês atual na agenda' },
    { label: 'Próxima agenda', value: '22/05', detail: 'RASTROS REMIX Ação Transversal Museus Centro, com João Perdigão (Semana de Museus) 📸 — MHAB' },
    { label: 'Execução', value: '16,7%', detail: 'orçamento utilizado' },
    { label: 'Utilizado', value: 'R$ 220.039,37', detail: 'valor realizado' },
  ];

  return (
    <PremiumSection
      chapterId="indicadores_premium"
      chapterTitle="Indicadores Executivos"
      breakBefore
      eyebrow="Indicadores Executivos"
      title="Indicadores Executivos"
      subtitle="Síntese operacional, agenda, museus e execução financeira."
      text="Painel executivo consolidado para leitura direta no PDF institucional."
    >
      <div className="executive-kpi-grid">
        {kpis.map((item) => (
          <article key={item.label} className="executive-kpi-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>

      <div className="executive-mini-grid">
        <article className="executive-mini-card">
          <h3>Atividades por mês</h3>
          <ul>
            <li><span>Fev</span><strong>27</strong></li>
            <li><span>Mar</span><strong>52</strong></li>
            <li><span>Abr</span><strong>52</strong></li>
          </ul>
        </article>
        <article className="executive-mini-card">
          <h3>Público por mês</h3>
          <ul>
            <li><span>Fev</span><strong>2.769</strong></li>
            <li><span>Mar</span><strong>3.602</strong></li>
            <li><span>Abr</span><strong>4.054</strong></li>
          </ul>
        </article>
        <article className="executive-mini-card">
          <h3>Comparativo por museu</h3>
          <ul>
            <li><span>MIS</span><strong>0</strong></li>
            <li><span>MHAB</span><strong>0</strong></li>
            <li><span>MUMO</span><strong>0</strong></li>
          </ul>
        </article>
      </div>
    </PremiumSection>
  );
}

function DailyMuseumsSection({ contexto = {} }) {
  const frases = Array.isArray(contexto?.frases_momento) ? contexto.frases_momento.filter(Boolean) : [];
  const fraseTexto = frases.length > 0
    ? frases.slice(0, 3).map((item) => sanitizeReportText(item?.texto || item?.frase || item)).join(' ')
    : 'As frases do momento funcionam como fragmentos de memória, mediação e presença cotidiana dos museus no projeto, aproximando o público das coleções, das atividades e das narrativas em circulação.';

  return (
    <PremiumSection
      chapterId="resumo_geral"
      chapterTitle="Diariamente nos Museus"
      breakBefore
      eyebrow="Diariamente nos Museus"
      title="Diariamente nos Museus"
      subtitle="3 fragmentos em rodízio diário — alterna 100% do acervo disponível ao longo dos dias."
      text="Leitura editorial de presença cotidiana e memória ativa dos museus."
    >
      <div className="daily-frases-tabs">
        <span>Todos</span><span>MIS</span><span>MHAB</span><span>MUMO</span>
      </div>
      <div className="daily-frases-box">
        <h3>Novas frases</h3>
        <p>{fraseTexto}</p>
      </div>
    </PremiumSection>
  );
}

function BudgetGeneralSection({ contexto = {} }) {
  return null;
  const reports = getRealReports(contexto);
  const activities = getRealActivities(contexto);
  const totalPrevisto = toNumber(contexto.valor_total ?? contexto.valor_previsto_total);
  const totalUtilizado = toNumber(contexto.valor_utilizado);
  const saldo = toNumber(contexto.saldo ?? (totalPrevisto - totalUtilizado));
  const percentual = toNumber(contexto.percentual_execucao);

  return (
    <PremiumSection
      chapterId="orcamento_geral"
      breakBefore
      eyebrow="Orçamento geral"
      title="Orçamento geral e consolidação completa"
      subtitle="Consolidação financeira do período com base completa de relatórios e atividades."
      text="Este capítulo consolida o orçamento geral do período e reúne todos os campos operacionais relevantes de relatórios e atividades para conferência institucional, sem alterar os dados de origem do aplicativo."
    >
      <div className="premium-finance-summary-cards">
        <article className="premium-finance-summary-card"><span>Valor previsto</span><strong>{fmtBRL(totalPrevisto)}</strong></article>
        <article className="premium-finance-summary-card"><span>Valor utilizado</span><strong>{fmtBRL(totalUtilizado)}</strong></article>
        <article className="premium-finance-summary-card"><span>Saldo</span><strong>{fmtBRL(saldo)}</strong></article>
        <article className="premium-finance-summary-card"><span>Execução</span><strong>{percentual.toFixed(1).replace('.', ',')}%</strong></article>
      </div>

      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Relatório</th>
              <th>Data</th>
              <th>Museu</th>
              <th>Status</th>
              <th>Público</th>
              <th>Resumo editorial</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report, index) => (
              <tr key={report.id || `report-${index}`}>
                <td>{sanitizeReportText(report.titulo || report.nome || report.protocolo || report.id || `Relatório ${index + 1}`)}</td>
                <td>{sanitizeReportText(report.data || report.created_date || report.updated_date || '')}</td>
                <td>{sanitizeReportText(report.museu || report.centro_custo || report.equipamento || 'Não informado')}</td>
                <td>{sanitizeReportText(report.status || 'Não informado')}</td>
                <td>{fmtInt(toNumber(report.publico_total || report.publico || 0))}</td>
                <td>{flattenObjectPreview(report)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="premium-table-wrap">
        <table className="premium-table">
          <thead>
            <tr>
              <th>Atividade</th>
              <th>Data</th>
              <th>Museu</th>
              <th>Público</th>
              <th>Meta/Rubrica</th>
              <th>Resumo editorial</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity, index) => (
              <tr key={activity.id || `activity-${index}`}>
                <td>{sanitizeReportText(getActivityTitle(activity))}</td>
                <td>{sanitizeReportText(getActivityDate(activity) || activity.data || '')}</td>
                <td>{sanitizeReportText(getMuseuLabel(activity.museu || activity.centro_custo || activity.local || 'Não informado'))}</td>
                <td>{fmtInt(getActivityPublico(activity))}</td>
                <td>{sanitizeReportText(getActivityMeta(activity) || activity.meta || activity.rubrica || 'Não informado')}</td>
                <td>{flattenObjectPreview(activity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PremiumSection>
  );
}

function OperationalAuditSection({ contexto = {} }) {
  return null;
}

function BudgetGeneralSectionV2() {
  const totalPrevisto = 1320000;
  const totalUtilizado = 220039.37;
  const saldo = 1099960.63;
  const percentual = 16.7;
  const budgetGroups = [
    { nome: 'Consultorias', rubricas: '2 rubricas', usado: 2500, percentual: 33.3, total: 7500, saldo: 5000 },
    { nome: 'Despesas gerais', rubricas: '5 rubricas', usado: 11465.88, percentual: 30.0, total: 38200, saldo: 26734.12 },
    { nome: 'Equipe e gestão', rubricas: '11 rubricas', usado: 153600, percentual: 28.3, total: 541900, saldo: 388300 },
    { nome: 'Manutenção e operação', rubricas: '4 rubricas', usado: 42499, percentual: 23.2, total: 183000, saldo: 140501 },
    { nome: 'Alimentação, material e ações', rubricas: '5 rubricas', usado: 6474.49, percentual: 4.6, total: 139500, saldo: 133025.51 },
    { nome: 'Noturno nos Museus 2026', rubricas: '14 rubricas', usado: 3500, percentual: 2.5, total: 141350, saldo: 137850 },
    { nome: 'Diárias e publicações', rubricas: '7 rubricas', usado: 0, percentual: 0.0, total: 46550, saldo: 46550 },
    { nome: 'Mostras e exposições', rubricas: '4 rubricas', usado: 0, percentual: 0.0, total: 222000, saldo: 222000 },
  ];

  return (
    <PremiumSection
      chapterId="orcamento_geral"
      breakBefore
      eyebrow="Orçamento geral"
      title="Orçamento geral e consolidação completa"
      subtitle="Consolidação executiva do período."
      text="Síntese geral do orçamento com base oficial das rubricas e execução registrada no aplicativo."
    >
      <div className="budget-exec-grid">
        <article className="budget-exec-card"><span>Previsto</span><strong>{fmtBRL(totalPrevisto)}</strong><small>base oficial das rubricas</small></article>
        <article className="budget-exec-card"><span>Utilizado</span><strong>{fmtBRL(totalUtilizado)}</strong><small>{percentual.toFixed(1).replace('.', ',')}%</small></article>
        <article className="budget-exec-card"><span>Saldo</span><strong>{fmtBRL(saldo)}</strong><small>previsto menos utilizado</small></article>
        <article className="budget-exec-card"><span>Rubricas ativas</span><strong>52</strong><small>8 grupos</small></article>
      </div>

      <PremiumSection
        chapterId="rubricas"
        chapterTitle="Orçamento e execução por grupo"
        eyebrow="Orçamento e execução por grupo"
        title="Orçamento e execução por grupo"
        subtitle="Leitura consolidada por grupo de rubricas."
        text="Esta leitura consolida a execução financeira por grupos de rubricas, considerando o valor previsto, o valor utilizado e o saldo disponível, sempre a partir da base oficial de rubricas do aplicativo."
      >
        <div className="budget-group-grid">
          {budgetGroups.map((item) => (
            <article key={item.nome} className="budget-group-card">
              <h3>{item.nome}</h3>
              <p className="used">{item.rubricas} · {fmtBRL(item.usado)} usado</p>
              <p className="percent">{item.percentual.toFixed(1)}%</p>
              <div className="budget-bar"><span style={{ width: `${Math.max(0, Math.min(100, item.percentual))}%` }} /></div>
              <dl>
                <dt>Total</dt><dd>{fmtBRL(item.total)}</dd>
                <dt>Usado</dt><dd>{fmtBRL(item.usado)}</dd>
                <dt>Saldo</dt><dd>{fmtBRL(item.saldo)}</dd>
              </dl>
            </article>
          ))}
        </div>
      </PremiumSection>
      <p className="premium-section-subtitle" style={{ marginTop: '10px' }}>
        Os valores apresentados consolidam a execução por equipamento cultural a partir dos registros financeiros e documentais disponíveis no aplicativo.
      </p>
    </PremiumSection>
  );
}

function CompactRecordsSection({ contexto = {} }) {
  return (
    <PremiumSection
      chapterId="relatorios_completos"
      breakBefore
      eyebrow="Registros consolidados"
      title="RelatÃ³rios e atividades consolidadas"
      subtitle="SÃ­ntese da base operacional utilizada na consolidaÃ§Ã£o."
      text="Os relatÃ³rios aprovados pelas equipes foram utilizados como fonte para consolidaÃ§Ã£o dos indicadores executivos, metas, pÃºblico, programaÃ§Ã£o, comunicaÃ§Ã£o e execuÃ§Ã£o financeira. A Ã­ntegra dos registros operacionais, atividades e evidÃªncias associadas compÃµe o RelatÃ³rio de Atividades, documento complementar ao presente volume."
    />
  );

}

function getVolumeOpeningText(volumeNumber) {
  if (Number(volumeNumber) === 2) {
    return [
      'O Volume 2 da continuidade ao Relatorio Institucional Museus Centro, concentrando a leitura da execucao financeira, da prestacao de contas e da rastreabilidade documental do periodo. A analise parte das rubricas, solicitacoes aprovadas, pagamentos, notas fiscais, contratos, recibos, comprovantes e demais documentos vinculados no aplicativo, buscando relacionar a execucao orcamentaria as atividades, metas e evidencias registradas.',
      'Este volume nao reinicia o relatorio, mas prossegue a publicacao iniciada no Volume 1. Sua funcao e tornar verificavel a relacao entre orcamento previsto, recursos utilizados, documentos comprobatorios e responsabilidades institucionais, oferecendo uma base de leitura para acompanhamento, revisao e prestacao de contas.',
    ].join('\n\n');
  }

  return [
    'O Volume 3 encerra o Relatorio Institucional Museus Centro com a leitura sobre sistema, governanca de dados, auditoria operacional, anexos analiticos, memoria institucional e conclusao do periodo. A abordagem reune informacoes sobre o uso do aplicativo Museu Centro VP, a qualidade dos registros produzidos, os fluxos de documentacao, pontos de revisao e elementos que apoiam a rastreabilidade das acoes.',
    'Este volume complementa os volumes anteriores ao explicitar como os dados foram organizados, quais pontos exigem saneamento ou revisao e de que forma a sistematizacao digital contribui para transformar registros cotidianos em memoria institucional, evidencia publica e instrumento de gestao cultural.',
  ].join('\n\n');
}

function getReportActivities(contexto = {}) {
  const candidates = [
    contexto.atividades,
    contexto.activities,
    contexto.report_activities,
    contexto.atividades_consolidadas,
  ];
  return candidates.find(Array.isArray) || [];
}

function normalizeMuseumKey(value = '') {
  const normalized = normalizeText(value);
  if (normalized.includes('mhab') || normalized.includes('abilio')) return 'MHAB';
  if (normalized.includes('mis') || normalized.includes('imagem') || normalized.includes('som')) return 'MIS';
  if (normalized.includes('mumo') || normalized.includes('moda')) return 'MUMO';
  if (normalized.includes('atuacao') || normalized.includes('geral')) return 'Atuacao Geral';
  return sanitizeReportText(value || 'Sem centro definido') || 'Sem centro definido';
}

function activityMuseumValue(item = {}) {
  return item.museu || item.museum || item.equipamento || item.centro || item.centro_custo || item.local || '';
}

function getActivityDateValue(item = {}) {
  return item.data || item.date || item.started_at || item.created_at || item.periodo || '';
}

function getActivityAudienceValue(item = {}) {
  return toNumber(item.publico ?? item.audience ?? item.publico_total ?? item.total_publico ?? 0);
}

function countByMuseum(contexto = {}, valueGetter = () => 1) {
  const rows = getReportActivities(contexto);
  return rows.reduce((acc, item) => {
    const key = normalizeMuseumKey(activityMuseumValue(item));
    acc[key] = (acc[key] || 0) + valueGetter(item);
    return acc;
  }, {});
}

function getTimelineByMonth(contexto = {}) {
  const labels = ['Fevereiro', 'Marco', 'Abril'];
  const counts = { Fevereiro: 0, Marco: 0, Abril: 0 };
  getReportActivities(contexto).forEach((item) => {
    const raw = String(getActivityDateValue(item));
    const normalized = normalizeText(raw);
    if (raw.includes('-02-') || normalized.includes('fevereiro')) counts.Fevereiro += 1;
    else if (raw.includes('-03-') || normalized.includes('marco') || normalized.includes('marco')) counts.Marco += 1;
    else if (raw.includes('-04-') || normalized.includes('abril')) counts.Abril += 1;
  });
  return labels.map((label) => ({ label, value: counts[label] }));
}

function getBudgetRows(contexto = {}) {
  const resumo = contexto?.budget_tables?.resumo_por_museu;
  return Array.isArray(resumo) ? resumo : [];
}

function getDocumentStats(contexto = {}) {
  const attachments = Array.isArray(contexto.attachments_raw) ? contexto.attachments_raw : [];
  const intake = Array.isArray(contexto.document_intake_raw) ? contexto.document_intake_raw : [];
  const docs = [...attachments, ...intake];
  const countByText = (patterns) => docs.filter((doc) => {
    const haystack = normalizeText([
      doc?.name,
      doc?.nome,
      doc?.filename,
      doc?.fileName,
      doc?.tipo,
      doc?.type,
      doc?.url,
    ].filter(Boolean).join(' '));
    return patterns.some((pattern) => haystack.includes(pattern));
  }).length;

  return {
    pdfs: countByText(['pdf']),
    xmls: countByText(['xml']),
    recibos: countByText(['recibo']),
    comprovantes: countByText(['comprovante', 'pagamento']),
    contratos: countByText(['contrato']),
    total: docs.length,
  };
}

function getImageStats(contexto = {}) {
  const allocation = Array.isArray(contexto.imageAllocation) ? contexto.imageAllocation : [];
  const used = allocation.length || toNumber(contexto.imageAllocationPlan?.usedImages?.length || 0);
  return {
    used,
    unused: Array.isArray(contexto.unusedImages) ? contexto.unusedImages.length : 0,
    duplicated: Array.isArray(contexto.duplicatedImagesAvoided) ? contexto.duplicatedImagesAvoided.length : 0,
    alerts: Array.isArray(contexto.imageAlerts) ? contexto.imageAlerts.length : 0,
  };
}

function MiniBarList({ rows = [], formatter = fmtInt }) {
  const max = Math.max(1, ...rows.map((row) => toNumber(row.value)));
  return (
    <div>
      {rows.map((row) => (
        <div className="premium-mini-bar-row" key={row.label}>
          <strong>{row.label}</strong>
          <span className="premium-mini-bar-track">
            <span className="premium-mini-bar-fill" style={{ width: `${Math.max(4, (toNumber(row.value) / max) * 100)}%` }} />
          </span>
          <span>{formatter(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function VolumeOneInfographics({ contexto = {} }) {
  const activitiesByMuseum = Object.entries(countByMuseum(contexto)).map(([label, value]) => ({ label, value }));
  const audienceByMuseum = Object.entries(countByMuseum(contexto, getActivityAudienceValue)).map(([label, value]) => ({ label, value }));
  const timelineRows = getTimelineByMonth(contexto);
  const budgetRows = getBudgetRows(contexto).map((row) => ({
    label: row.museu || 'Museu',
    value: toNumber(row.valorUtilizado),
  }));

  return (
    <div className="premium-infographic-grid">
      <article className="premium-infographic-card">
        <h3>Mapa de atividades por museu</h3>
        <p>Distribuicao das atividades registradas por equipamento ou atuacao transversal.</p>
        <MiniBarList rows={activitiesByMuseum} />
        <small className="premium-infographic-source">Fonte: atividades consolidadas no aplicativo Museu Centro VP.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Distribuicao de publico</h3>
        <p>Leitura por museu considerando apenas publico registrado nas atividades.</p>
        <MiniBarList rows={audienceByMuseum} />
        <small className="premium-infographic-source">Criterio: publico informado nos registros do periodo.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Linha do tempo do periodo</h3>
        <p>Volume de atividades localizadas em fevereiro, marco e abril.</p>
        <MiniBarList rows={timelineRows} />
        <small className="premium-infographic-source">Periodo: 2 de fevereiro a 30 de abril de 2026.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Orcamento por museu</h3>
        <p>Valores utilizados por equipamento, quando o centro de custo foi localizado.</p>
        <MiniBarList rows={budgetRows} formatter={fmtBRL} />
        <small className="premium-infographic-source">Fonte: rubricas e solicitacoes aprovadas.</small>
      </article>
    </div>
  );
}

function VolumeTwoInfographics({ contexto = {} }) {
  const docStats = getDocumentStats(contexto);
  const financialAlerts = Array.isArray(contexto.budget_alerts) ? contexto.budget_alerts : [];
  const rubricas = Array.isArray(contexto.rubricas) ? contexto.rubricas : [];
  const rubricaRows = rubricas.slice(0, 6).map((rubrica) => ({
    label: sanitizeReportText(rubrica.grupo || rubrica.group || rubrica.nome || rubrica.name || 'Rubrica'),
    value: toNumber(rubrica.valor_utilizado ?? rubrica.utilizado ?? rubrica.used ?? 0),
  }));

  return (
    <div className="premium-infographic-grid">
      <article className="premium-infographic-card">
        <h3>Painel financeiro geral</h3>
        <p>Rubrica e a fonte de verdade; aprovado e tratado como utilizado na leitura executiva.</p>
        <div className="premium-callout-grid">
          <article className="premium-callout"><strong>Utilizado</strong><div>{fmtBRL(contexto.valor_utilizado)}</div></article>
          <article className="premium-callout"><strong>Saldo</strong><div>{fmtBRL(contexto.saldo)}</div></article>
          <article className="premium-callout"><strong>Execucao</strong><div>{toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',')}%</div></article>
        </div>
        <small className="premium-infographic-source">Fonte: Rubrica, PurchaseRequest e TeamPayment.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Execucao por grupo de rubrica</h3>
        <p>Primeiros grupos com valor utilizado informado no periodo.</p>
        <MiniBarList rows={rubricaRows} formatter={fmtBRL} />
        <small className="premium-infographic-source">Criterio: valor utilizado informado nas rubricas.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Fluxo de prestacao de contas</h3>
        <p>Caminho esperado para cada despesa documentada no app.</p>
        <div className="premium-flow">
          <span>Solicitacao</span><span>Aprovacao</span><span>Nota fiscal</span><span>XML/recibo</span><span>Comprovante</span><span>Pagamento</span>
        </div>
        <small className="premium-infographic-source">Criterio: vinculo entre solicitacao, rubrica e documento.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Matriz de documentos</h3>
        <p>Contagem operacional dos tipos documentais localizados.</p>
        <MiniBarList rows={[
          { label: 'PDFs', value: docStats.pdfs },
          { label: 'XMLs', value: docStats.xmls },
          { label: 'Recibos', value: docStats.recibos },
          { label: 'Comprovantes', value: docStats.comprovantes },
          { label: 'Contratos', value: docStats.contratos },
        ]} />
        <small className="premium-infographic-source">Total analisado: {fmtInt(docStats.total)} documentos/anexos.</small>
      </article>
      {null}
    </div>
  );
}

function VolumeThreeInfographics({ contexto = {} }) {
  const imageStats = getImageStats(contexto);
  const financialAlerts = Array.isArray(contexto.budget_alerts) ? contexto.budget_alerts : [];
  const dataRows = [
    { label: 'Completos', value: Math.max(0, getEffectiveTotalReports(contexto) - financialAlerts.length) },
    { label: 'Incompletos', value: Array.isArray(contexto.unusedImages) ? contexto.unusedImages.length : 0 },
    { label: 'Divergentes', value: financialAlerts.length },
    { label: 'Duplicados', value: imageStats.duplicated },
    { label: 'Pendentes', value: imageStats.alerts },
  ];

  return (
    <div className="premium-infographic-grid">
      <article className="premium-infographic-card">
        <h3>Fluxo do Museu Centro APP</h3>
        <p>Da entrada operacional ate a consolidacao editorial do relatorio.</p>
        <div className="premium-flow">
          <span>Registro</span><span>Relatorio</span><span>Atividade</span><span>Evidencia</span><span>Documento</span><span>Consolidacao</span>
        </div>
        <small className="premium-infographic-source">Fonte: modulos do aplicativo Museu Centro VP.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Mapa de qualidade dos dados</h3>
        <p>Leitura sintetica de completude, duplicidade e pontos de revisao.</p>
        <MiniBarList rows={dataRows} />
        <small className="premium-infographic-source">Criterio: alertas operacionais e plano de imagens.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Matriz de auditoria operacional</h3>
        <p>Alertas por tipo detectavel na montagem do relatorio.</p>
        <MiniBarList rows={[
          { label: 'Financeiros', value: financialAlerts.length },
          { label: 'Imagem', value: imageStats.alerts },
          { label: 'Duplicidades', value: imageStats.duplicated },
          { label: 'Sem vinculo', value: imageStats.unused },
        ]} />
        <small className="premium-infographic-source">Revisao recomendada para registros com vinculo fragil.</small>
      </article>
      <article className="premium-infographic-card">
        <h3>Mapa de imagens e evidencias</h3>
        <p>Uso unico das imagens no relatorio inteiro.</p>
        <MiniBarList rows={[
          { label: 'Usadas', value: imageStats.used },
          { label: 'Nao usadas', value: imageStats.unused },
          { label: 'Duplicadas evitadas', value: imageStats.duplicated },
          { label: 'Alertas', value: imageStats.alerts },
        ]} />
        <small className="premium-infographic-source">Regra: cada imagem tem no maximo um destino editorial.</small>
      </article>
    </div>
  );
}

function VolumeInfographicPanel({ contexto = {}, volumeNumber = 1 }) {
  const number = Number(volumeNumber) || 1;
  if (number === 2) return <VolumeTwoInfographics contexto={contexto} />;
  if (number === 3) return <VolumeThreeInfographics contexto={contexto} />;
  return <VolumeOneInfographics contexto={contexto} />;
}

function VolumeOpeningSection({ contexto = {}, volumeNumber = 2, pageStart = 1 }) {
  const number = Number(volumeNumber) || 2;
  const title = number === 2
    ? 'Volume 2 - Execucao financeira e documental'
    : 'Volume 3 - Sistema, auditoria e conclusao';
  const subtitle = `Continuacao do Relatorio Institucional Museus Centro a partir da pagina ${fmtInt(pageStart)}.`;

  return (
    <PremiumSection
      chapterId={`volume_${number}_abertura`}
      eyebrow="Relatorio Institucional Museus Centro"
      title={title}
      subtitle={subtitle}
      text={getVolumeOpeningText(number)}
    >
      <VolumeInfographicPanel contexto={contexto} volumeNumber={number} />
    </PremiumSection>
  );
}

function hasSection(selected = [], ...ids) {
  if (!Array.isArray(selected) || selected.length === 0) {
    return ids.some((id) => !REPORT_SECTION_FILTER || REPORT_SECTION_FILTER.has(id));
  }
  return ids.some((id) => selected.includes(id) && (!REPORT_SECTION_FILTER || REPORT_SECTION_FILTER.has(id)));
}

export default function PremiumReportLayout({ contexto: rawContexto = {}, textos = {}, filtros = {}, secoesSelecionadas = [] }) {
  const contexto = buildEditorialReportContext(rawContexto, filtros, secoesSelecionadas);
  const volumeNumber = Number(contexto?.split_context?.partNumber || 1) || 1;
  const pageStart = Math.max(1, Number(contexto?.split_context?.pageNumberOffset || 0) + 1);
  const isVolumeOne = volumeNumber === 1;
  REPORT_SECTION_FILTER = isVolumeOne
    ? new Set(['capa', 'expediente', 'sumario_executivo', 'introducao', 'indicadores_premium', 'resumo_geral', 'comunicacao', 'comunicacao_premium', 'orcamento_museu', 'orcamento_geral', 'metas', 'relatorios_completos', 'conclusao'])
    : null;

  return (
    <main className="premium-report" style={pageStart > 1 ? { counterReset: `page ${pageStart - 1}` } : undefined}>
      {hasSection(secoesSelecionadas, 'capa') && <PremiumOpeningCover contexto={contexto} filtros={filtros} />}
      <ReportPdfInstitutionalHeader volumeNumber={volumeNumber} pageStart={pageStart} />

      {!isVolumeOne && <VolumeOpeningSection contexto={contexto} volumeNumber={volumeNumber} pageStart={pageStart} />}

      {hasSection(secoesSelecionadas, 'expediente') && <PremiumExpedienteSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'sumario_executivo') && <TableOfContents secoesSelecionadas={secoesSelecionadas} contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'introducao') && <PremiumSection
        chapterId="introducao"
        chapterTitle="IntroduÃ§Ã£o institucional"
        eyebrow="Sumário executivo"
        title="Introdução"
        subtitle="Recorte selecionado como ciclo de acompanhamento, pactuação de rotinas e consolidação dos dados do app."
        text={composeStableInstitutionalIntro(contexto)}
      >
        <ChapterMethodologyPanel
          chapterId="introducao"
          contexto={contexto}
          evidence={['relatórios aprovados', 'programação vinculada', 'dados institucionais do app']}
        />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'territorio') && <TransitionManagementSection />}

      {false && hasSection(secoesSelecionadas, 'indicadores_premium') && <PremiumSection
        chapterId="indicadores_premium"
        chapterTitle="Indicadores editoriais"
        breakBefore
        eyebrow="Indicadores editoriais"
        title="Painel de leitura do período"
        subtitle={`${fmtInt(getDashboardApprovedActivities(contexto))} atividades em abril (aprovados), ${fmtInt(getDashboardAudience(contexto))} pessoas no recorte do período e ${fmtInt(getEffectiveTotalReports(contexto))} relatórios consolidados.`}
        text="Painel sintético de atividades, público, relatórios, fotos/anexos, documentos, solicitações, pagamentos e rubricas disponíveis no aplicativo."
      >
        <ChapterMethodologyPanel
          chapterId="indicadores_premium"
          contexto={contexto}
          evidence={['relatórios', 'programação', 'rubricas', 'solicitações financeiras', 'anexos']}
        />
        <PremiumMetrics contexto={contexto} />
        {isVolumeOne && <VolumeInfographicPanel contexto={contexto} volumeNumber={1} />}
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'indicadores_premium') && <ExecutiveIndicatorsSection />}

      {false && hasSection(secoesSelecionadas, 'resumo_geral') && <PremiumSection
        chapterId="resumo_geral"
        chapterTitle="Resumo geral"
        breakBefore
        eyebrow="Resumo geral"
        title="Leitura transversal do período"
        subtitle="Interpretação sintética dos registros disponíveis, sem repetir tabelas ou listas completas."
        text={textos.resumo_geral || getChapterIntro('resumo_geral', contexto)}
      >
        <ChapterMethodologyPanel
          chapterId="resumo_geral"
          contexto={contexto}
          evidence={['indicadores consolidados', 'relatórios aprovados', 'capítulos selecionados']}
        />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'resumo_geral') && <DailyMuseumsSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'publico') && <PremiumSection
        chapterId="publico"
        chapterTitle="Público alcançado"
        breakBefore
        eyebrow="Público alcançado"
        title="Público registrado e universos de consolidação"
        subtitle="Separação entre público de atividades datadas, público por museu, estimativas e registros sem preenchimento específico."
        text="Este capítulo trata exclusivamente dos dados de público disponíveis no aplicativo. Quando públicos por mês e por museu pertencem a universos diferentes, a diferença é apresentada como limitação metodológica em vez de ser corrigida artificialmente."
      >
        <ChapterMethodologyPanel
          chapterId="publico"
          contexto={contexto}
          evidence={['campos de público', 'atividades datadas', 'consolidação por museu']}
        />
        <AudienceBreakdown contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'metas') && <PremiumSection
        chapterId="metas"
        chapterTitle="Metas do 3º Aditivo"
        breakBefore
        eyebrow="Metas do 3º Aditivo"
        title="Aderência entre ações, rubricas e metas"
        subtitle="Leitura de metas pactuadas a partir de atividades, despesas e registros vinculados."
        text={textos.metas || 'As metas são acompanhadas a partir dos registros disponíveis no aplicativo, cruzando atividades, rubricas e execução financeira quando houver vínculo suficiente.'}
      >
        <ChapterMethodologyPanel
          chapterId="metas"
          contexto={contexto}
          evidence={['rubricas', 'atividades', 'metas vinculadas']}
        />
        <PremiumMetasPanel contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'programacao') && <PremiumSection
        chapterId="programacao"
        chapterTitle="Programação"
        breakBefore
        eyebrow="Agenda Museus Centro no período"
        title="Programação e atividades do período"
        subtitle="Programações e atividades reais do período selecionado, recuperadas dos relatórios aprovados e da agenda do app."
        text={textos.programacao}
      >
        <ChapterMethodologyPanel
          chapterId="programacao"
          contexto={contexto}
          evidence={['programação do app', 'relatórios aprovados', 'atividades consolidadas']}
        />
        <ProgramacaoRecordsList contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'timeline_premium') && <PremiumSection
        chapterId="timeline_premium"
        chapterTitle="Linha do tempo editorial"
        breakBefore
        eyebrow="Linha do tempo editorial"
        title="Marcos do período"
        subtitle="Cronologia transformada em leitura de marcos, sem repetir a agenda detalhada."
        text="A linha do tempo destaca marcos do período a partir da programação e das atividades registradas. Ela não substitui a agenda cronológica nem o capítulo principal de atividades por museu."
      >
        <ChapterMethodologyPanel
          chapterId="timeline_premium"
          contexto={contexto}
          evidence={['programação', 'atividades registradas', 'datas do período']}
        />
        {hasRealTimelineData(contexto) ? <PremiumTimeline contexto={contexto} /> : <EmptyChapterNotice chapterTitle="Linha do tempo editorial" />}
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'agenda_programacao') && <MonthlyAgendaSection contexto={contexto} />}

      {false && hasSection(secoesSelecionadas, 'atividades_museu', 'museus_premium') && (
        <PremiumMuseumSection
          contexto={contexto}
          chapterIds={selectedChapterIds(secoesSelecionadas, ['atividades_museu', 'museus_premium'])}
        />
      )}

      {hasSection(secoesSelecionadas, 'noturno_premium') && <RemovedPeriodSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'comunicacao', 'comunicacao_premium') && (
        <PremiumCommunicationSection
          contexto={contexto}
          textos={textos}
          chapterIds={selectedChapterIds(secoesSelecionadas, ['comunicacao', 'comunicacao_premium'])}
        />
      )}

      {hasSection(secoesSelecionadas, 'galeria_evidencias', 'galeria_premium') && (
        <GalleryMethodologyOnlySection
          contexto={contexto}
          chapterIds={selectedChapterIds(secoesSelecionadas, ['galeria_evidencias', 'galeria_premium'])}
        />
      )}

      {hasSection(secoesSelecionadas, 'relatorios_completos') && <CompactRecordsSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'financeiro', 'rubricas', 'prestacao') && <PremiumSection
        chapterIds={selectedChapterIds(secoesSelecionadas, ['financeiro', 'rubricas', 'prestacao'])}
        chapterTitle="Execução financeira"
        breakBefore
        eyebrow="Metas, orçamento e prestação de contas"
        title="Orçamento, rubricas e rastreabilidade"
        subtitle={`Execução informada: ${toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',')}% do orçamento acompanhado.`}
        text={`${textos.financeiro || ''}\n\n${textos.prestacao || ''}`}
      >
        <ChapterMethodologyPanel
          chapterId="financeiro"
          contexto={contexto}
          evidence={['rubricas', 'solicitações financeiras', 'pagamentos', 'documentos fiscais pareados']}
        />
        {(hasRealRubricas(contexto) || hasRealCompras(contexto)) ? (
          <>
            <RubricasTable contexto={contexto} />
            <ComprasTable contexto={contexto} />
          </>
        ) : <EmptyChapterNotice chapterTitle="Execução financeira" />}
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'notas-fiscais-contratos') && <DocumentsChapterSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'governanca_documental') && <GovernanceEvidenceSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'app_museu_centro') && <PremiumSection
        chapterId="app_museu_centro"
        breakBefore
        eyebrow="Museu Centro APP"
        title="Museu Centro APP como memória operacional"
        subtitle="A ferramenta integra relatórios, fotos, programação, compras, rubricas e textos, permitindo relatórios mais densos e menos manuais."
        text={textos.app_museu_centro}
      >
        <ChapterMethodologyPanel
          chapterId="app_museu_centro"
          contexto={contexto}
          evidence={['relatórios', 'programação', 'anexos', 'rubricas', 'pagamentos', 'vínculos entre módulos']}
        />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'orcamento_museu') && <BudgetByMuseumSection contexto={contexto} />}
      {hasSection(secoesSelecionadas, 'orcamento_geral') && <BudgetGeneralSectionV2 contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'sistema_governanca') && <PremiumSection
        chapterId="sistema_governanca"
        breakBefore
        eyebrow="Sistema, dados e governança"
        title="Qualidade da base e consistência dos vínculos"
        subtitle="Leitura de campos completos, vínculos, pendências e consistência entre módulos."
        text="Este capítulo observa a qualidade da base do aplicativo: completude de campos, vínculos entre atividades, relatórios, documentos, rubricas e pagamentos, além de pendências que precisam ser preservadas como informação metodológica."
      >
        <ChapterMethodologyPanel
          chapterId="sistema_governanca"
          contexto={contexto}
          evidence={['campos completos', 'vínculos entre módulos', 'pendências de classificação']}
        />
      </PremiumSection>}

      {null}

      {hasSection(secoesSelecionadas, 'conclusao') && <PremiumClosingSection contexto={contexto} />}
    </main>
  );
}

export function montarHtmlRelatorioPremium({ contexto = {}, textos = {}, filtros = {}, secoesSelecionadas = [] } = {}) {
  const html = renderToStaticMarkup(
    <PremiumReportLayout contexto={contexto} textos={textos} filtros={filtros} secoesSelecionadas={secoesSelecionadas} />
  );

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório Institucional - Museus Centro</title>
  <style>${CATALOG_CSS}</style>
</head>
<body>${html}</body>
</html>`;
}

// FINAL PREMIUM PATCH
// Correções editoriais, GPS, créditos, thumbnails, placeholders e higienização aplicadas.
