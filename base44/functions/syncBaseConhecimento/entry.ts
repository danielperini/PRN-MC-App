import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '117060564';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${GID}#gid=${GID}`;
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

const MIRROR_SLUG = 'base-conhecimento-ia-google-sheet';
const MIRROR_TITLE = 'Biblioteca de Conhecimento IA';
const MIRROR_FOLDER = 'Biblioteca do Conhecimento';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function parseCsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(parseCsvLine);
}

function normalizeHeader(value: string, index: number) {
  const clean = String(value || '').trim();
  return clean || `coluna_${index + 1}`;
}

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseDate(value: any) {
  if (!value) return null;

  const text = String(value).trim();
  const d = new Date(text);

  if (!isNaN(d.getTime())) return d;

  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(match[2]) - 1, Number(match[1]));
  }

  return null;
}

function detectMuseum(text: string) {
  const t = normalizeText(text);

  if (t.includes('mhab') || t.includes('mab')) return 'MHAB';
  if (t.includes('mis')) return 'MIS';
  if (t.includes('mumo') || t.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function normalizeMatrix(matrix: string[][]) {
  const headers = matrix[0].map(normalizeHeader);
  const rows = matrix.slice(1);

  const items = rows.map((row, index) => {
    const values: Record<string, any> = {};

    headers.forEach((h, i) => {
      values[h] = row[i] ?? '';
    });

    const text = Object.values(values).join(' ');
    const date = parseDate(text);

    return {
      row_index: index + 2,
      titulo: text.slice(0, 120),
      descricao: text,
      museu: detectMuseum(text),
      data_iso: date ? date.toISOString() : '',
    };
  });

  return { headers, items };
}

function groupByDay(items: any[]) {
  const map: Record<string, any[]> = {};

  items.forEach((item) => {
    if (!item.data_iso) return;
    const key = item.data_iso.slice(0, 10);

    if (!map[key]) map[key] = [];
    map[key].push(item);
  });

  return map;
}

function groupByMonth(items: any[]) {
  const map: Record<string, any[]> = {};

  items.forEach((item) => {
    if (!item.data_iso) return;
    const key = item.data_iso.slice(0, 7);

    if (!map[key]) map[key] = [];
    map[key].push(item);
  });

  return map;
}

function countByMuseum(items: any[]) {
  const map: Record<string, number> = {};

  items.forEach((item) => {
    const key = item.museu || 'Outro';
    map[key] = (map[key] || 0) + 1;
  });

  return map;
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const response = await fetch(CSV_URL);
    const csvText = await response.text();

    const matrix = parseCsv(csvText);
    const normalized = normalizeMatrix(matrix);

    const groupedByDay = groupByDay(normalized.items);
    const groupedByMonth = groupByMonth(normalized.items);
    const countsByMuseum = countByMuseum(normalized.items);

    return new Response(
      JSON.stringify({
        ok: true,
        items: normalized.items,
        grouped_by_day: groupedByDay,
        grouped_by_month: groupedByMonth,
        counts_by_museum: countsByMuseum,
        total_items: normalized.items.length,
        source_url: SOURCE_URL,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500 }
    );
  }
});
