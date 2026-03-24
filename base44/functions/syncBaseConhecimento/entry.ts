import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '580065331';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${GID}#gid=${GID}`;
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

const MIRROR_SLUG = 'base-conhecimento-ia-google-sheet';
const MIRROR_TITLE = 'Biblioteca de Conhecimento IA';
const MIRROR_FOLDER = 'Biblioteca do Conhecimento';

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeHeader(value: any, index: number) {
  const clean = String(value || '').trim();
  return clean || `coluna_${index + 1}`;
}

function parseDate(value: any) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  if (!text) return null;

  const match = text.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);

  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = match[3] ? Number(match[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day);
  }

  return null;
}

function findValue(values: Record<string, any>, keys: string[]) {
  for (const [k, v] of Object.entries(values)) {
    const nk = normalizeText(k);
    if (keys.some((kk) => nk.includes(kk)) && String(v || '').trim()) {
      return v;
    }
  }
  return '';
}

function detectMuseum(values: Record<string, any>) {
  const text = normalizeText(Object.values(values).join(' '));

  if (text.includes('mhab') || text.includes('abilio')) return 'MHAB';
  if (text.includes('mis')) return 'MIS';
  if (text.includes('mumo') || text.includes('museu da moda')) return 'MUMO';

  return 'Externo';
}

function mapRow(values: Record<string, any>, index: number) {
  const rawDate =
    findValue(values, ['data']) ||
    findValue(values, ['periodo']) ||
    findValue(values, ['período']);

  const parsedDate = parseDate(rawDate);

  const nome =
    findValue(values, ['nome da acao', 'nome da ação', 'nome atividade', 'nome']) ||
    `Atividade ${index}`;

  const sinopse = findValue(values, ['sinopse', 'descricao', 'descrição']);
  const tipo = findValue(values, ['tipo']);
  const horario = findValue(values, ['horario']);
  const vagas = findValue(values, ['vagas']);
  const inscricao = findValue(values, ['inscricao']);
  const link = findValue(values, ['link']);

  return {
    nome,
    titulo: nome,
    sinopse,
    descricao: sinopse,
    tipo,
    horario,
    vagas,
    inscricao,
    link,
    museu: detectMuseum(values),
    data: rawDate,
    data_iso: parsedDate ? parsedDate.toISOString() : '',
  };
}

function normalizeSheet(matrix: any[][]) {
  if (!matrix.length) return [];

  const headers = matrix[0].map(normalizeHeader);

  const items: any[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const values: Record<string, any> = {};

    headers.forEach((h, idx) => {
      values[h] = row[idx];
    });

    const item = mapRow(values, i);

    if (!item.nome || !item.data_iso) continue;

    items.push(item);
  }

  return items;
}

function groupTimeline(items: any[]) {
  const now = new Date();

  const map: any = {
    Todos: { futuras: [], atuais: [], passadas: [] },
    MIS: { futuras: [], atuais: [], passadas: [] },
    MHAB: { futuras: [], atuais: [], passadas: [] },
    MUMO: { futuras: [], atuais: [], passadas: [] },
    Externo: { futuras: [], atuais: [], passadas: [] },
  };

  items.forEach((item) => {
    const d = new Date(item.data_iso);
    const today = new Date();

    let bucket = 'passadas';
    if (d.toDateString() === today.toDateString()) bucket = 'atuais';
    else if (d > today) bucket = 'futuras';

    const m = item.museu || 'Externo';

    map.Todos[bucket].push(item);
    map[m][bucket].push(item);
  });

  return map;
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const response = await fetch(XLSX_URL);

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    let allItems: any[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const ws = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const items = normalizeSheet(matrix);
      allItems = allItems.concat(items);
    });

    const timeline = groupTimeline(allItems);

    return new Response(
      JSON.stringify({
        ok: true,
        items: allItems,
        timeline_by_museum: timeline,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
    });
  }
});
