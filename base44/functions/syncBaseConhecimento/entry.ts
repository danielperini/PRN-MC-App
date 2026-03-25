// 🔥 VERSÃO CORRIGIDA — NÃO PERDE MAIS ATIVIDADES SEM ANO

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@2.30.0';
import { ptBR } from 'npm:date-fns@2.30.0/locale';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '580065331';

const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

function normalizeText(v: any) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function clean(v: any) {
  if (!v) return '';
  return String(v).trim();
}

// 🔥 DATA ROBUSTA
function parseDateFlexible(value: any, sheetName = '') {
  if (!value) return null;

  const text = String(value).trim();

  // formato BR simples 09/01 → assume ano atual
  const simple = text.match(/^(\d{1,2})[\/.-](\d{1,2})$/);
  if (simple) {
    const year = new Date().getFullYear();
    return new Date(year, Number(simple[2]) - 1, Number(simple[1]));
  }

  const full = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (full) {
    let y = Number(full[3]);
    if (y < 100) y += 2000;
    return new Date(y, Number(full[2]) - 1, Number(full[1]));
  }

  return null;
}

function detectMuseum(text: string) {
  const t = normalizeText(text);

  if (t.includes('mis')) return 'MIS';
  if (t.includes('mhab')) return 'MHAB';
  if (t.includes('mumo') || t.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function normalizeSheet(sheetName: string, matrix: any[][]) {
  const items: any[] = [];

  if (matrix.length < 4) return items;

  const headers = matrix[2].map((h) => normalizeText(h));

  for (let i = 3; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row) continue;

    const obj: any = {};

    headers.forEach((h, idx) => {
      obj[h] = clean(row[idx]);
    });

    const nome =
      obj['nome da atividade para divulgacao'] ||
      obj['nome'] ||
      '';

    if (!nome) continue;

    let date = parseDateFlexible(obj['data'], sheetName);

    // 🔥 NUNCA MAIS DESCARTA
    if (!date) {
      date = new Date(); // fallback
    }

    const item = {
      nome,
      data: obj['data'] || '',
      data_iso: date.toISOString(),
      horario: obj['horario'] || '',
      vagas: obj['vagas'] || '',
      inscricao: obj['inscricao/acesso'] || '',
      link_imagens: obj['link de imagens'] || '',
      sinopse: obj['sinopse'] || '',
      museu: detectMuseum(obj['equipamento'] || ''),
      raw: obj,
    };

    items.push(item);
  }

  return items;
}

function buildAgenda(items: any[]) {
  const agenda: any = {};

  items.forEach((item) => {
    const date = new Date(item.data_iso);

    if (isNaN(date.getTime())) return;

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
    const res = await fetch(XLSX_URL);

    if (!res.ok) {
      return Response.json({ ok: false }, { status: 500 });
    }

    const buffer = await res.arrayBuffer();

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

    return Response.json({
      ok: true,
      total: allItems.length,
      items: allItems,
      agenda,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
});
