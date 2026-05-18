import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PremiumOpeningCover from './PremiumOpeningCover';
import PremiumExpedienteSection from './PremiumExpedienteSection';
import PremiumSection from './PremiumSection';
import PremiumMetrics from './PremiumMetrics';
import PremiumTimeline from './PremiumTimeline';
import PremiumGallery from './PremiumGallery';
import PremiumMuseumSection from './PremiumMuseumSection';
import PremiumCommunicationSection from './PremiumCommunicationSection';
import PremiumClosingSection from './PremiumClosingSection';
import {
  cleanFileName,
  extractPhotos,
  fmtBRL,
  fmtInt,
  getActivityDate,
  getActivityMeta,
  getActivityPublico,
  getActivityText,
  getActivityTitle,
  getMuseuLabel,
  normalizeText,
  sanitizeReportText,
  splitParagraphs,
  toNumber,
  uniqueParagraphs,
} from './premiumReportUtils';

const CATALOG_CSS = `
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e7e3dc; color: #171717; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .premium-report { background: #f7f3eb; color: #171717; }
  .premium-cover { min-height: 297mm; position: relative; overflow: hidden; display: flex; align-items: flex-end; break-after: page; background: #161616; color: #fff; }
  .premium-cover img, .premium-cover-fallback { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .premium-cover-fallback { background: linear-gradient(135deg, #111 0%, #39352d 48%, #6e5c45 100%); }
  .premium-cover-overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.55) 52%, rgba(0,0,0,.9) 100%); }
  .premium-cover-content { position: relative; width: 100%; padding: 34mm 20mm 24mm; }
  .premium-cover-kicker, .premium-eyebrow { margin: 0 0 10px; font-size: 10px; line-height: 1.5; letter-spacing: .18em; text-transform: uppercase; font-weight: 700; color: #9f7f4d; }
  .premium-cover h1 { max-width: 760px; margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 64px; line-height: .92; letter-spacing: 0; font-weight: 500; }
  .premium-cover-period { margin: 20px 0 28px; font-size: 16px; color: rgba(255,255,255,.78); }
  .premium-cover-credit { margin: -14px 0 22px; font-size: 10px; color: rgba(255,255,255,.62); letter-spacing: .06em; text-transform: uppercase; }
  .premium-cover-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; max-width: 860px; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.25); }
  .premium-cover-grid span { padding: 14px; background: rgba(0,0,0,.45); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
  .premium-section, .premium-museum-block, .premium-communication, .premium-closing { padding: 20mm 18mm; background: #f7f3eb; min-height: 260mm; }
  .premium-expediente { padding: 22mm 18mm; background: #f7f3eb; min-height: 260mm; color: #171717; }
  .premium-expediente-heading { display: grid; grid-template-columns: minmax(0, .8fr) minmax(260px, .55fr); gap: 28px; align-items: end; padding-bottom: 20px; border-bottom: 1px solid rgba(23,23,23,.2); margin-bottom: 22px; }
  .premium-expediente-heading h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 42px; line-height: .98; font-weight: 500; letter-spacing: 0; }
  .premium-expediente-heading p:last-child { margin: 0; font-size: 14px; line-height: 1.68; color: #3d3a35; }
  .premium-expediente-grid, .premium-expediente-museums { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; margin-bottom: 16px; }
  .premium-expediente-museums { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .premium-expediente-block { border-top: 3px solid #171717; padding-top: 12px; break-inside: avoid; }
  .premium-expediente-block h3 { margin: 0 0 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #5a534b; }
  .premium-expediente-list { margin: 0; padding: 0; list-style: none; }
  .premium-expediente-list li { padding: 8px 0; border-bottom: 1px solid rgba(23,23,23,.12); font-size: 13px; line-height: 1.45; }
  .premium-expediente-people { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .premium-expediente-people-wide { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .premium-expediente-people article { border-bottom: 1px solid rgba(23,23,23,.12); padding: 0 0 8px; min-height: 45px; }
  .premium-expediente-people strong { display: block; font-family: Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.12; font-weight: 500; }
  .premium-expediente-people span { display: block; margin-top: 4px; font-size: 11.5px; line-height: 1.35; color: #5e574f; }
  .premium-page-break { break-before: page; }
  .premium-section-dark { background: #171717; color: #f7f3eb; }
  .premium-section-heading { display: grid; grid-template-columns: minmax(0, .95fr) minmax(220px, .55fr); gap: 24px; align-items: end; margin-bottom: 22px; border-bottom: 1px solid rgba(23,23,23,.18); padding-bottom: 18px; }
  .premium-section-heading h2, .premium-museum-heading h2, .premium-closing h2 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 38px; line-height: 1; font-weight: 500; letter-spacing: 0; text-align: left; }
  .premium-section-subtitle { margin: 0; color: #5f5f5f; font-size: 14px; line-height: 1.55; }
  .premium-prose { columns: 2; column-gap: 28px; font-size: 14px; line-height: 1.78; color: #2b2b2b; }
  .premium-prose p { margin: 0 0 14px; break-inside: avoid; }
  .premium-prose-invert { color: rgba(255,255,255,.82); }
  .premium-metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin: 22px 0 8px; }
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
  .premium-photo-index-item { border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.45); padding: 11px; font-size: 11.5px; line-height: 1.45; break-inside: avoid; }
  .premium-photo-index-item strong, .premium-photo-index-item span, .premium-photo-index-item small, .premium-photo-index-item a { display: block; margin-bottom: 3px; color: inherit; }
  .premium-museum-heading { display: flex; justify-content: space-between; align-items: end; gap: 18px; margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid rgba(23,23,23,.18); }
  .premium-museum-kpis { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .premium-museum-kpis span, .premium-activity-tags span { border: 1px solid rgba(23,23,23,.16); padding: 7px 9px; font-size: 12px; background: rgba(255,255,255,.4); }
  .premium-activity-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
  .premium-activity-card { display: grid; grid-template-columns: 44px 1fr; gap: 16px; padding: 18px; border: 1px solid rgba(23,23,23,.14); background: rgba(255,255,255,.52); break-inside: avoid; }
  .premium-activity-index { font-size: 18px; font-weight: 800; color: #9f7f4d; }
  .premium-activity-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
  .premium-activity-photos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 13px; }
  .premium-activity-photos figure { margin: 0; min-height: 76px; }
  .premium-activity-photos img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; background: #ddd4c6; }
  .premium-activity-photos figcaption { margin-top: 5px; font-size: 9.5px; line-height: 1.35; color: #5e574f; }
  .premium-activity-photos figcaption span { display: block; }
  .premium-communication-grid { display: grid; grid-template-columns: minmax(0, 1fr) 210px; gap: 20px; align-items: stretch; }
  .premium-communication-panel { background: #171717; color: #fff; padding: 18px; display: flex; flex-direction: column; justify-content: flex-end; min-height: 130px; }
  .premium-communication-panel strong { font-size: 52px; line-height: .9; }
  .premium-communication-panel span { margin-top: 10px; font-size: 11px; line-height: 1.35; color: rgba(255,255,255,.72); }
  .premium-table-wrap { margin-top: 20px; overflow: hidden; border: 1px solid rgba(23,23,23,.18); background: rgba(255,255,255,.36); }
  .premium-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.45; background: rgba(255,255,255,.5); }
  .premium-table th { text-align: left; padding: 13px 14px; background: #171717; color: #fff; font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em; }
  .premium-table td { padding: 14px; border-top: 1px solid rgba(23,23,23,.1); vertical-align: top; }
  .premium-table tbody tr:nth-child(even) td { background: rgba(23,23,23,.035); }
  .premium-finance-grid, .premium-audience-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
  .catalog-toc { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px 18px; margin-top: 20px; counter-reset: toc; }
  .catalog-toc li { list-style: none; border-bottom: 1px solid rgba(23,23,23,.14); padding: 8px 0; font-size: 12px; display: flex; justify-content: space-between; gap: 12px; counter-increment: toc; }
  .catalog-toc li::before { content: counter(toc, decimal-leading-zero); color: #9f7f4d; font-weight: 800; margin-right: 10px; }
  .premium-month-grid { display: grid; grid-template-columns: 1fr; gap: 22px; margin-top: 24px; }
  .premium-month-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; border: 1px solid rgba(23,23,23,.18); border-top: 6px solid #171717; background: rgba(255,255,255,.58); padding: 24px; break-inside: avoid; min-height: 154mm; }
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
  .premium-closing { background: #171717; color: #f7f3eb; display: flex; flex-direction: column; justify-content: space-between; }
  .premium-closing h2 { max-width: 760px; font-size: 48px; }
  .premium-signature { border-top: 1px solid rgba(255,255,255,.2); padding-top: 18px; display: flex; justify-content: space-between; gap: 20px; font-size: 12px; color: rgba(255,255,255,.62); }
  .premium-signature strong { color: #fff; }
  .premium-audience-chart { grid-column: 1 / -1; border: 1px solid rgba(23,23,23,.18); background: rgba(255,255,255,.5); padding: 18px; break-inside: avoid; }
  .premium-audience-chart h3 { margin: 0 0 6px; font-size: 20px; font-family: Georgia, "Times New Roman", serif; font-weight: 500; }
  .premium-audience-chart p { margin: 0 0 16px; font-size: 12.5px; line-height: 1.5; color: #555; }
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
  @media print {
    body { background: #fff; }
    .premium-report { background: #fff; }
    .premium-section, .premium-expediente, .premium-museum-block, .premium-communication, .premium-closing { min-height: auto; }
    .premium-photo, .premium-activity-card, .premium-timeline-item, .premium-metric, .premium-photo-index-item { break-inside: avoid; }
  }
`;

const INTRODUCAO_PERIODO = `Este relatório abrange fevereiro, março e abril de 2026 e consolida, a partir dos registros do aplicativo, resultados culturais, institucionais, programáticos e de público do projeto Museus Centro / Viaduto das Artes.

O período marca uma transição importante na coordenação geral do projeto, com a saída de Andréa Matos e a entrada de Daniel Perini. Também passa a integrar o processo a consultora de programação Ana Luiza, fortalecendo a interlocução entre planejamento, produção, diretorias dos museus e organização das ações culturais.

O primeiro momento do projeto foi marcado por chegada, aprovação, contratação e estabilização dos fluxos. Além da coordenação geral, houve mudanças de produção nos equipamentos: no MIS, saída de Ana Carolina Galvão e entrada de Isabela; no MUMO, saída de Daniela Isis e entrada de Silvia Coes. Essas transições exigiram pactuação de rotinas, reordenação de responsabilidades e aproximação cotidiana entre coordenação, produção, comunicação, educativo e equipes dos museus.

O relatório apresenta uma leitura integrada dos museus como infraestrutura pública de memória, formação, convivência e fruição cultural. MIS, MHAB e MUMO aparecem como equipamentos complementares, capazes de articular audiovisual, memória urbana, moda, educação, acessibilidade, preservação e presença territorial no centro de Belo Horizonte.`;

function composeIntro(textos = {}) {
  const blocked = [
    'este relatório cobre o período de 2 de fevereiro',
    'o presente relatório cobre o período',
    'o relatório foi produzido com um aplicativo',
    'auditoria técnica dos dados',
  ];
  const extra = uniqueParagraphs([
    textos.introducao,
    textos.contexto_territorial || textos.territorio,
    textos.publico_alcancado,
  ].filter(Boolean).join('\n\n'), 5)
    .filter((paragraph) => {
      const text = paragraph.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return !blocked.some((term) => text.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
    });

  return [INTRODUCAO_PERIODO, ...extra].join('\n\n');
}

function TableOfContents() {
  const chapters = [
    ['Expediente', 'Reconhecimento institucional das equipes, realização e museus participantes'],
    ['Introdução', 'Transição de coordenação, estabilização e leitura institucional'],
    ['Indicadores e público', 'Atividades, público espontâneo, visitas agendadas e metas'],
    ['Programação e atividades do período', 'Agenda completa de fevereiro, março e abril'],
    ['Ações por museu', 'MHAB, MIS, MUMO e atuação geral com fotos vinculadas'],
    ['Comunicação, registros e evidências', 'Notícias, registros, campanhas e documentação'],
    ['Galeria e evidências', 'Fotos em grade, créditos, links e GPS quando disponível'],
    ['Relatórios da equipe', 'Síntese dos relatórios aprovados usados como fonte'],
    ['Metas, orçamento e prestação de contas', 'Rubricas, execução e quadro sintético'],
    ['Sistema e governança', 'Museu Centro APP e tratamento dos dados com apoio de IA'],
  ];

  return (
    <PremiumSection
      breakBefore
      eyebrow="Mapa de leitura"
      title="Sumário"
      subtitle="Capítulos organizados para leitura institucional, conferência técnica e exportação profissional em PDF."
      text="O relatório foi reorganizado como catálogo-livro: começa pela narrativa institucional, passa por indicadores e agenda, aproxima atividades de suas evidências visuais, consolida relatórios de equipe e encerra com orçamento, prestação de contas e governança dos dados."
    >
      <ol className="catalog-toc">
        {chapters.map(([title, detail]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{detail}</span>
          </li>
        ))}
      </ol>
    </PremiumSection>
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

function ActivityMiniPhotos({ activity }) {
  const photos = Array.isArray(activity?.fotos_destaque) ? activity.fotos_destaque : activity?.fotos || [];
  const selected = photos.slice(0, 4);

  return (
    <figure className="premium-activity-photo-strip">
      {[0, 1, 2, 3].map((slot) => {
        const photo = selected[slot];
        const url = photo?.url || photo?.file_url || photo?.src || photo?.arquivo_url;
        return url
          ? <img key={url || slot} src={url} alt={photo.caption || getActivityTitle(activity)} loading="lazy" />
          : <span key={slot} className="premium-activity-photo-placeholder">Registro visual</span>;
      })}
    </figure>
  );
}

const PUBLICO_MES_REFERENCIA = [
  { mes: 'Fevereiro', atividades: 44, espontaneo: 0, visitas_agendadas: 0, total: 44 },
  { mes: 'Março', atividades: 947, espontaneo: 0, visitas_agendadas: 0, total: 947 },
  { mes: 'Abril', atividades: 377, espontaneo: 0, visitas_agendadas: 0, total: 377 },
];

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
    text.includes('rotina') ||
    text.includes('atendimento educativo recorrente');
}

function agendaSemanticKey(item = {}) {
  const museu = normalizeText(getMuseuLabel(item.museu || item.equipamento || item.local));
  const month = normalizeText(getMonthName(item));
  const title = normalizeText(item.titulo || item.nome || 'atividade');

  if (isCommunicationRecord(item)) return 'comunicacao-institucional::periodo';
  if (isRecurringMediatedVisit(item)) return `visitas-mediadas::${museu}::${month}`;
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
  const groups = items.filter((item) => !isIrrelevantAdministrativeRecord(item)).reduce((acc, item) => {
    const key = agendaSemanticKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return Object.values(groups)
    .map(mergeAgendaGroup)
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')))
    .slice(0, 80);
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
  const source = Array.isArray(contexto?.publico_por_mes) && contexto.publico_por_mes.length > 0
    ? contexto.publico_por_mes.map(normalizeAudienceMonth)
    : PUBLICO_MES_REFERENCIA;

  const byMonth = source.reduce((acc, item) => {
    acc[normalizeText(item.mes)] = item;
    return acc;
  }, {});

  return PUBLICO_MES_REFERENCIA.map((fallback) => {
    const found = byMonth[normalizeText(fallback.mes)];
    if (!found) return fallback;
    return found.total > 0 ? found : fallback;
  });
}

function AudienceMonthlyChart({ rows = [] }) {
  const max = Math.max(...rows.map((item) => toNumber(item.total)), 1);

  return (
    <div className="premium-audience-chart">
      <h3>Público por mês</h3>
      <p>Leitura editorial do recorte fevereiro, março e abril, separando público de ações, presença espontânea e visitas agendadas sem misturar estimativas com registros.</p>
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

function buildInstitutionalExpansion(item = {}) {
  const title = getActivityTitle(item);
  const text = normalizeText([
    title,
    item.tipo,
    item.classificacao,
    item.categoria_label,
    item.texto,
    item.descricao,
  ].filter(Boolean).join(' '));
  const museu = item.museu ? ` no ${getMuseuLabel(item.museu)}` : '';
  const month = item.mes || getMonthName(item);
  const meta = item.metaEditorial || getActivityMeta(item);

  if (item.isCommunicationCard) {
    return `Como frente de documentação pública, ${sanitizeReportText(title)} reúne registros, coberturas, materiais visuais e evidências de circulação institucional produzidas no período. A síntese preserva a função documental dessas entregas e explicita sua contribuição para memória visual, prestação de contas e presença pública do Museus Centro.`;
  }

  if (text.includes('estudio aberto') || text.includes('estúdio aberto')) {
    return `A ação ${sanitizeReportText(title)} articula mediação, experimentação e acolhimento de públicos em um formato de permanência educativa. No relatório, ela deve ser lida como parte da construção de vínculo entre museu, visitantes e processos de formação cultural, especialmente quando associada a grupos agendados, oficinas e preparação pedagógica registrada pela equipe.`;
  }

  if (text.includes('visita mediada') || text.includes('visitas mediadas')) {
    return `As visitas mediadas${museu} foram consolidadas como ação de formação de público, aproximando acervos, exposições e repertórios dos visitantes por meio de acompanhamento educativo. A consolidação evita a fragmentação de registros recorrentes e preserva a leitura de público, território e rotina institucional.`;
  }

  if (text.includes('oficina') || text.includes('laboratorio') || text.includes('laboratório') || text.includes('curso')) {
    return `A atividade ${sanitizeReportText(title)} fortalece a dimensão educativa do projeto ao combinar prática, escuta, repertório cultural e participação. Quando vinculada a oficinas, laboratórios ou formações, a ação amplia a relação entre museu e território, criando condições para experimentação, mediação e continuidade pedagógica.`;
  }

  if (text.includes('exposicao') || text.includes('exposição') || text.includes('mostra')) {
    return `No conjunto do relatório, ${sanitizeReportText(title)} aparece como ação de qualificação da experiência expositiva, conectando pesquisa, montagem, mediação e presença pública. O registro permite acompanhar como o planejamento de exposições se articula à programação e às entregas institucionais do período.`;
  }

  if (text.includes('libras') || text.includes('acessibilidade') || text.includes('diversidade')) {
    return `A ação ${sanitizeReportText(title)} reforça o compromisso do projeto com acessibilidade, acolhimento e mediação pública. Sua presença no relatório qualifica a leitura institucional do período ao situar inclusão e diversidade como dimensões práticas da gestão cultural, não apenas como diretrizes abstratas.`;
  }

  return `No recorte de ${month}, ${sanitizeReportText(title)} integra a agenda consolidada do Museus Centro como ação vinculada à programação, aos registros de equipe e às evidências disponíveis no aplicativo${meta ? `, com relação editorial à ${sanitizeReportText(meta)}` : ''}. A leitura consolidada aproxima dados, relatos e documentação visual, ampliando a rastreabilidade sem repetir textos de origem.`;
}

function ActivityNarrative({ item }) {
  const sourceParagraphs = Array.isArray(item.textosConsolidados) && item.textosConsolidados.length > 0
    ? item.textosConsolidados
    : [splitParagraphs(item.texto, 1)[0] || 'Registro recuperado da programação ou dos relatórios aprovados no app.'];
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

  const unique = consolidateAgendaItems(items);

  if (unique.length === 0) return null;

  return (
    <PremiumSection
      breakBefore
      eyebrow="Agenda Museus Centro no período"
      title="Agenda detalhada de fevereiro, março e abril"
      subtitle="Cada item preserva título, museu, data, tipo, público, meta e fotos vinculadas quando disponíveis no app."
      text="A agenda foi consolidada a partir da programação e dos relatórios aprovados. Registros recorrentes, rotinas e visitas mediadas fragmentadas foram agrupados para reduzir duplicidade visual, sem apagar a rastreabilidade: quando houver mais de uma origem, o card informa a quantidade de registros consolidados."
    >
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
              {!item.isCommunicationCard ? (
                <div className="premium-public-highlight">
                  <strong>{item.publicoRegistrado > 0 ? fmtInt(item.publicoRegistrado) : item.publicoEstimado > 0 ? fmtInt(item.publicoEstimado) : 'N/A'}</strong>
                  <span>{item.publicoTipo === 'estimado' ? 'público estimado' : 'participantes'}</span>
                </div>
              ) : null}
            </header>
            {buildPublicContext(item) ? <p className="premium-public-context">{buildPublicContext(item)}</p> : null}
            <div className="premium-card-facts">
              <span><strong>Datas</strong>{(item.datasConsolidadas || []).join(', ') || item.data || item.mes || 'período'}</span>
              <span><strong>Meta vinculada</strong>{item.metaEditorial || getActivityMeta(item) || 'não informada'}{item.metaInferida ? ' (inferida)' : ''}</span>
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
              <span><strong>Créditos</strong>{item.credito || item.creditos || item.producao || 'registros do app'}</span>
              <span><strong>Indicador</strong>{item.isCommunicationCard ? 'documentação institucional' : item.publicoTipo === 'estimado' ? 'público estimado' : 'público registrado'}</span>
            </footer>
            <EvidenceLinks links={item.evidenciaLinks} />
          </article>
        ))}
      </div>
    </PremiumSection>
  );
}

function ReportsArchiveSection({ contexto }) {
  const reports = Array.isArray(contexto?.relatorios_equipe) ? contexto.relatorios_equipe : [];
  if (reports.length === 0) return null;

  return (
    <PremiumSection
      breakBefore
      eyebrow="Relatórios da equipe"
      title="Fontes internas consolidadas"
      subtitle={`${fmtInt(reports.length)} relatórios aprovados compõem a base narrativa, técnica e documental do período.`}
      text="Esta seção explicita a origem dos textos e registros utilizados no relatório. Em vez de repetir integralmente cada documento, o sistema recupera autoria, função, museu, mês, atividades, público e trechos de síntese, preservando rastreabilidade e evitando redundância editorial."
    >
      <div className="premium-report-archive">
        {reports.slice(0, 60).map((report, index) => (
          <article className="premium-report-note" key={report.id || index}>
            <strong>{report.autor || report.author_name || 'Equipe Museus Centro'}</strong>
            <span>{[report.funcao, report.museu, report.mes].filter(Boolean).join(' / ')}</span>
            <span>{fmtInt(report.atividades_count)} atividades · público {fmtInt(report.publico)}</span>
            <small>{sanitizeReportText(uniqueParagraphs([report.resumo_executivo, report.resumo_periodo, report.pontos_positivos].filter(Boolean).join('\n\n'), 1, 40)[0] || 'Relatório aprovado usado como fonte do período.')}</small>
          </article>
        ))}
      </div>
    </PremiumSection>
  );
}

function PhotoEvidenceDenseSection({ contexto }) {
  const photos = extractPhotos(contexto, 120);
  if (photos.length === 0) return null;

  return (
    <PremiumSection
      breakBefore
      eyebrow="Listagem de fotos"
      title="Fotos, créditos e localização"
      subtitle="Lista em três colunas para conferência de atividade, museu, mês, arquivo, crédito, link e GPS quando disponível."
      text="A listagem amplia a densidade documental do relatório e evita que a fotografia apareça apenas como ilustração. Cada item preserva o vínculo com a atividade ou arquivo de origem disponível no app."
    >
      <div className="premium-photo-index">
        {photos.map((photo, index) => (
          <article className="premium-photo-index-item" key={`${photo.link || photo.fileName}-${index}`}>
            <strong>{photo.mes || 'Período'}</strong>
            <span>{sanitizeReportText(photo.atividade || 'Atividade vinculada ao app')}</span>
            <small>{photo.museu || 'Museus Centro'}</small>
            <small>{cleanFileName(photo.fileName || photo.link)}</small>
            <small>GPS: {photo.localizacao?.label || 'não informado'}</small>
            <small>Crédito: {photo.credito || 'não informado'}</small>
            {photo.link ? <a href={photo.link} target="_blank" rel="noreferrer">Abrir arquivo</a> : null}
          </article>
        ))}
      </div>
    </PremiumSection>
  );
}

function RubricasTable({ contexto }) {
  const rubricas = Array.isArray(contexto?.rubricas) ? contexto.rubricas : [];
  if (rubricas.length === 0) return null;

  return (
    <div className="premium-table-wrap">
      <table className="premium-table">
        <thead>
          <tr>
            <th>Grupo</th>
            <th>Rubrica</th>
            <th>Previsto</th>
            <th>Utilizado</th>
            <th>Saldo</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {rubricas.slice(0, 42).map((item, index) => (
            <tr key={item?.id || index}>
              <td>{item?.grupo || 'Grupo'}</td>
              <td>{item?.rubrica || item?.nome || 'Rubrica'}</td>
              <td>{fmtBRL(item?.valor_previsto ?? item?.previsto ?? item?.valor_rubrica ?? item?.valor_total)}</td>
              <td>{fmtBRL(item?.valor_utilizado ?? item?.utilizado)}</td>
              <td>{fmtBRL(item?.saldo)}</td>
              <td>{toNumber(item?.percentual).toFixed(1).replace('.', ',')}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComprasTable({ contexto }) {
  const compras = Array.isArray(contexto?.compras) ? contexto.compras : [];
  if (compras.length === 0) return null;

  return (
    <div className="premium-table-wrap">
      <table className="premium-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Fornecedor</th>
            <th>Rubrica</th>
            <th>Status</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {compras.slice(0, 36).map((item, index) => (
            <tr key={item?.id || index}>
              <td>{item?.descricao || 'Compra registrada'}</td>
              <td>{item?.fornecedor || '-'}</td>
              <td>{item?.rubrica || '-'}</td>
              <td>{item?.status || '-'}</td>
              <td>{fmtBRL(item?.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AudienceBreakdown({ contexto }) {
  const porMes = buildAudienceMonthRows(contexto);
  const porMuseu = Array.isArray(contexto?.publico_por_museu) ? contexto.publico_por_museu : Object.values(contexto?.por_museu || {});

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
    </div>
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
    }).slice(0, 4),
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

  if (atividades.length === 0 && rubricas.length === 0) return null;

  return (
    <PremiumSection
      breakBefore
      eyebrow="Seção especial"
      title="Seção removida"
      subtitle="Planejamento, pré-produção, infraestrutura, comunicação e rubricas vinculadas ao eixo de maior visibilidade pública."
      text="Seção mantida fora do fluxo público deste relatório porque o evento não ocorreu no período analisado."
    >
      <div className="premium-finance-grid">
        <div>
          <h3>Registros relacionados</h3>
          <div className="premium-table-wrap">
            <table className="premium-table">
              <tbody>
                {atividades.slice(0, 12).map((item, index) => (
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
                {rubricas.slice(0, 12).map((item, index) => (
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

function hasSection(selected = [], ...ids) {
  if (!Array.isArray(selected) || selected.length === 0) return true;
  return ids.some((id) => selected.includes(id));
}

export default function PremiumReportLayout({ contexto = {}, textos = {}, filtros = {}, secoesSelecionadas = [] }) {
  return (
    <main className="premium-report">
      {hasSection(secoesSelecionadas, 'capa') && <PremiumOpeningCover contexto={contexto} filtros={filtros} />}

      {hasSection(secoesSelecionadas, 'expediente') && <PremiumExpedienteSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'sumario_executivo', 'introducao') && <TableOfContents />}

      {hasSection(secoesSelecionadas, 'sumario_executivo', 'introducao', 'resumo_geral', 'indicadores_premium') && <PremiumSection
        eyebrow="Sumário executivo"
        title="Introdução"
        subtitle="Fevereiro, março e abril como ciclo de transição, estabilização, pactuação de rotinas e consolidação dos dados do app."
        text={composeIntro(textos)}
      >
        <PremiumMetrics contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'territorio', 'sistema_governanca') && <TransitionManagementSection />}

      {hasSection(secoesSelecionadas, 'publico', 'metas', 'indicadores_premium') && <PremiumSection
        breakBefore
        eyebrow="Indicadores, metas e público"
        title="Execução física acompanhada por evidências"
        subtitle={`${fmtInt(contexto.total_atividades)} atividades registradas, ${fmtInt(contexto.publico_total)} pessoas no recorte do período e ${fmtInt(contexto.total_relatorios)} relatórios consolidados.`}
        text={`${textos.resumo_geral || ''}\n\nPúblico espontâneo corresponde ao público que acessa o museu sem agendamento prévio, em visita livre, circulação cotidiana, exposições, permanência nos espaços e fruição espontânea da programação.\n\nVisitas agendadas correspondem a grupos previamente organizados, escolas, instituições, coletivos ou grupos acompanhados por mediação, com registro de data, número de participantes e, quando houver, vínculo com atividade educativa.\n\n${textos.metas || ''}`}
      >
        <AudienceBreakdown contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'programacao', 'agenda_programacao', 'timeline_premium') && <PremiumSection
        breakBefore
        eyebrow="Agenda Museus Centro no período"
        title="Programação e atividades do período"
        subtitle="Programações e atividades reais de fevereiro, março e abril, recuperadas dos relatórios aprovados e da agenda do app."
        text={textos.programacao}
      >
        <PremiumTimeline contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'agenda_programacao', 'programacao') && <MonthlyAgendaSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'programacao', 'atividades_museu', 'relatorios_completos') && <StrategicRecords contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'atividades_museu', 'museus_premium') && <PremiumMuseumSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'comunicacao', 'comunicacao_premium') && <PremiumCommunicationSection contexto={contexto} textos={textos} />}

      {hasSection(secoesSelecionadas, 'galeria_evidencias', 'galeria_premium') && <PremiumSection
        breakBefore
        eyebrow="Galeria e evidências"
        title="Imagem como documento de execução"
        subtitle="As fotografias são recuperadas do app, deduplicadas por URL e distribuídas como evidência visual das ações."
        text="A galeria opera como camada documental do relatório. Ela amplia a verificabilidade da narrativa: cada imagem vinculada ao app aponta para uma ação, um equipamento, uma frente de trabalho ou uma etapa de produção. A listagem em três colunas preserva atividade, museu, mês, crédito, arquivo e localização GPS quando disponível."
      >
        <PremiumGallery contexto={contexto} />
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'galeria_evidencias', 'galeria_premium') && <PhotoEvidenceDenseSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'relatorios_completos') && <ReportsArchiveSection contexto={contexto} />}

      {hasSection(secoesSelecionadas, 'financeiro', 'rubricas', 'prestacao') && <PremiumSection
        breakBefore
        eyebrow="Metas, orçamento e prestação de contas"
        title="Orçamento, rubricas e rastreabilidade"
        subtitle={`Execução informada: ${toNumber(contexto.percentual_execucao).toFixed(1).replace('.', ',')}% do orçamento acompanhado.`}
        text={`${textos.financeiro || ''}\n\n${textos.prestacao || ''}`}
      >
        <div className="premium-finance-grid">
          <RubricasTable contexto={contexto} />
          <ComprasTable contexto={contexto} />
        </div>
      </PremiumSection>}

      {hasSection(secoesSelecionadas, 'app_museu_centro', 'sistema_governanca') && <PremiumSection
        breakBefore
        eyebrow="Sistema e governança"
        title="Museu Centro APP como memória operacional"
        subtitle="A ferramenta integra relatórios, fotos, programação, compras, rubricas e textos, permitindo relatórios mais densos e menos manuais."
        text={textos.app_museu_centro}
      />}

      {hasSection(secoesSelecionadas, 'conclusao') && <PremiumClosingSection textos={textos} />}
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
