/**
 * METAS OFICIAIS DO PROJETO — 3º ADITIVO
 * Fonte de verdade única para todos os formulários da plataforma.
 * Baseadas nas metas reais do plano de trabalho (rubricas oficiais).
 */

export const METAS_PROJETO = [
  { id: 'MC3A-20', label: 'MC3A-20 — Meta 1: Contratação da equipe principal e coordenadores' },
  { id: 'MC3A-21', label: 'MC3A-21 — Meta 3: Manutenção de rotina em exposições' },
  { id: 'MC3A-22', label: 'MC3A-22 — Meta 7: Educadores (MIS, MUMO, MHAB)' },
  { id: 'MC3A-23', label: 'MC3A-23 — Metas 10/11: Mostras e Noturno nos Museus 2026' },
  { id: 'MC3A-24', label: 'MC3A-24 — Metas 16/17/18: Diárias, Publicações e Custeios educativos' },
  { id: 'MC3A-25', label: 'MC3A-25 — Metas 20/21/22: Ações educativas, Exposição MUMO e Consultorias' },
  { id: 'MC3A-EXTRA', label: 'MC3A-EXTRA — Meta 23: Despesas Gerais' },
];

export const METAS_IDS = METAS_PROJETO.map((m) => m.id);

export const SET_METAS_OFICIAIS = new Set(METAS_IDS);

/** Retorna o label legível para um id de meta */
export function getMetaLabel(metaId) {
  const meta = METAS_PROJETO.find((m) => m.id === metaId);
  return meta?.label ?? metaId ?? '';
}