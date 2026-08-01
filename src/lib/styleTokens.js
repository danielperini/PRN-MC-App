import { cn } from '@/lib/utils';

export const PAGE_WRAPPER = 'max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6';
export const CARD_BASE = 'rounded-2xl border border-gray-200 bg-white shadow-sm';
export const CARD_HEADER = 'px-5 py-4 border-b border-gray-100';
export const CARD_BODY = 'p-5';
export const SECTION_TITLE = 'text-base font-semibold text-gray-900';
export const SECTION_TITLE_SM = 'text-sm font-semibold text-gray-700';
export const KPI_CARD = 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm';
export const TABLE_WRAPPER = 'rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm';

export const PAGE_HEADING = 'text-2xl font-semibold text-black tracking-tight';
export const LABEL_SM = 'text-xs uppercase tracking-wide text-gray-500';

/** Helper para compor tokens com classes extras */
export function card(extra) { return cn(CARD_BASE, extra); }
export function kpi(extra) { return cn(KPI_CARD, extra); }
export function pageWrapper(extra) { return cn(PAGE_WRAPPER, extra); }