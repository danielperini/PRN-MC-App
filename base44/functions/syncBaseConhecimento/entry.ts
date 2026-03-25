import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@2.30.0';
import { ptBR } from 'npm:date-fns@2.30.0/locale';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '580065331';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${GID}`;
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function cleanValue(value: any) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value).trim();
}

function parseDate(value: any) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(br[2]) - 1, Number(br[1]));
  }

  return null;
}

function detectMuseum(text: string) {
  const t = normalizeText(text);

  if (t.includes('mhab')) return 'MHAB';
  if (t.includes('mis')) return 'MIS';
  if (t.includes('mumo') || t.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function normalizeSheet(sheetName: string, matrix: any[][]) {
  const items: any[] = [];

  if (!matrix.length) return items;

  const headers = matrix[0].map((h) => normalizeText(h));

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];

    if (!row || !row.length) continue;

    const obj: any = {};

    headers.forEach((h, idx) => {
      obj[h] = cleanValue(row[idx]);
    });

    const nome =
      obj['nome'] ||
      obj['nome da acao'] ||
      obj['nome da ação'] ||
      obj['nome da atividade para divulgacao'] ||
      '';

    if (!nome) continue;

    let parsedDate = parseDate(obj['data']);

    // 🔥 fallback de data
    if (!parsedDate) {
      parsedDate = new Date();
    }

    const item = {
      nome,
      data: obj['data'] || '',
      data_iso: parsedDate.toISOString(),
      horario: obj['horario'] || '',
      vagas: obj['vagas'] || '',
      inscricao: obj['inscricao/acesso'] || '',
      link_imagens: obj['link de imagens'] || '',
      sinopse: obj['sinopse'] || '',
      resumo_ia: obj['sinopse'] || '',
      museu: detectMuseum(obj['equipamento'] || ''),
      raw: obj,
    };

    // 🔥 NÃO DESCARTA MAIS POR DATA
    items.push(item);
  }

  return items;
}

function buildAgenda(items: any[]) {
  const agenda: Record<string, any> = {};

  items.forEach((item) => {
    const date = new Date(item.data_iso);

    if (Number.isNaN(date.getTime())) return;

    const mes = format(date, 'MMMM yyyy', { locale: ptBR });
    const museu = item.museu || 'Externo';

    if (!agenda[mes]) agenda[mes] = {};
    if (!agenda[mes][museu]) agenda[mes][museu] = [];

    agenda[mes][museu].push(item);
  });

  return agenda;
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const response = await fetch(XLSX_URL);

    if (!response.ok) {
      return new Response(JSON.stringify({ ok: false }), { status: 500 });
    }

    const buffer = await response.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
    });

    let allItems: any[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const ws = workbook.Sheets[sheetName];

      const matrix = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
      });

      const items = normalizeSheet(sheetName, matrix);
      allItems = allItems.concat(items);
    });

    const agenda = buildAgenda(allItems);

    return new Response(
      JSON.stringify({
        ok: true,
        total: allItems.length,
        items: allItems,
        agenda,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      { status: 500 }
    );
  }
});
