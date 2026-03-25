import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@2.30.0';
import { ptBR } from 'npm:date-fns@2.30.0/locale';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

function normalizeText(v: any) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function clean(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function parseDateCell(value: any) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    try {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed?.y && parsed?.m && parsed?.d) {
        return new Date(parsed.y, parsed.m - 1, parsed.d);
      }
    } catch (_) {
      // ignora
    }
  }

  return null;
}

function parseDateFlexible(value: any) {
  if (!value && value !== 0) return null;

  const excelDate = parseDateCell(value);
  if (excelDate) return excelDate;

  const text = String(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

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

function formatDateBR(date: Date | null) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function detectMuseum(text: string) {
  const t = normalizeText(text);

  if (t.includes('mis')) return 'MIS';
  if (t.includes('mhab') || t.includes('mab')) return 'MHAB';
  if (t.includes('mumo') || t.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function normalizeHeader(header: any) {
  const h = normalizeText(header);

  if (h === 'equipamento') return 'equipamento';
  if (
    h === 'nome' ||
    h.includes('nome da acao') ||
    h.includes('nome da ação') ||
    h.includes('nome da programacao') ||
    h.includes('nome da programação')
  ) return 'nome';
  if (
    h.includes('nome da atividade para divulgacao') ||
    h.includes('nome da atividade para divulgação')
  ) return 'nome_divulgacao';
  if (h === 'data' || h.includes('data ou periodo') || h.includes('data/periodo') || h.includes('periodo')) return 'data';
  if (h.includes('horario') || h.includes('horário') || h.includes('hora')) return 'horario';
  if (h.includes('vagas')) return 'vagas';
  if (
    h.includes('inscricao/acesso') ||
    h.includes('inscrição/acesso') ||
    h.includes('inscricao') ||
    h.includes('inscrição') ||
    h.includes('acesso') ||
    h.includes('link de inscricao') ||
    h.includes('link de inscrição')
  ) return 'inscricao';
  if (h.includes('link de imagens')) return 'link_imagens';
  if (h.includes('sinopse')) return 'sinopse';
  if (h.includes('tipo de atividade')) return 'tipo_atividade';
  if (h.includes('formato')) return 'formato';
  if (h.includes('publico-alvo') || h.includes('publico alvo') || h.includes('público-alvo')) return 'publico';
  if (h.includes('acessibilidade')) return 'acessibilidade';
  if (h.includes('classificacao indicativa') || h.includes('classificação indicativa')) return 'classificacao';
  if (h === 'local') return 'local';
  if (h.includes('endereco completo') || h.includes('endereço completo') || h.includes('endereco')) return 'endereco';
  if (h.includes('minibios') || h.includes('mini bios')) return 'minibios';
  if (h.includes('material de divulgacao') || h.includes('material de divulgação')) return 'material_divulgacao';

  return h.replace(/[^\w]+/g, '_');
}

function isLikelyHeaderRow(row: any[]) {
  const mapped = (row || []).map(normalizeHeader);

  const keys = [
    'equipamento',
    'nome',
    'nome_divulgacao',
    'data',
    'horario',
    'tipo_atividade',
    'sinopse',
    'inscricao',
    'vagas',
  ];

  const score = keys.filter((k) => mapped.includes(k)).length;
  return score >= 3;
}

function findHeaderRowIndex(matrix: any[][]) {
  const maxRows = Math.min(matrix.length, 8);

  for (let i = 0; i < maxRows; i++) {
    if (isLikelyHeaderRow(matrix[i] || [])) return i;
  }

  return -1;
}

function buildHeadersForSheet(matrix: any[][]) {
  if (!Array.isArray(matrix) || matrix.length < 2) {
    return { headerRowIndex: -1, headers: [] as string[] };
  }

  if (matrix.length >= 3) {
    const row2 = (matrix[1] || []).map(clean);
    const row3 = (matrix[2] || []).map(clean);

    const isLegacyMainHeader =
      normalizeHeader(row2[0]) === 'equipamento' &&
      normalizeText(row2[1]) === 'programacao';

    if (isLegacyMainHeader) {
      const headers = row3.map((h, idx) => {
        if (idx === 0) return 'equipamento';
        if (idx === 1 && !normalizeHeader(h)) return 'nome';
        return normalizeHeader(h);
      });

      if (!headers[1]) headers[1] = 'nome';

      return { headerRowIndex: 2, headers };
    }
  }

  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex < 0) {
    return { headerRowIndex: -1, headers: [] as string[] };
  }

  const headers = (matrix[headerRowIndex] || []).map((h) => normalizeHeader(h));
  return { headerRowIndex, headers };
}

function normalizeSheet(sheetName: string, matrix: any[][]) {
  const items: any[] = [];
  if (!Array.isArray(matrix) || matrix.length < 2) return items;

  const { headerRowIndex, headers } = buildHeadersForSheet(matrix);
  if (headerRowIndex < 0 || !headers.length) return items;

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const hasAnyValue = row.some((cell) => clean(cell) !== '');
    if (!hasAnyValue) continue;

    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = row[idx];
    });

    const nome =
      clean(obj.nome_divulgacao) ||
      clean(obj.nome) ||
      '';

    if (!nome) continue;

    let date = parseDateFlexible(obj.data);
    if (!date) {
      date = new Date();
    }

    const dataBr = clean(obj.data) || formatDateBR(date);

    items.push({
      nome,
      nome_acao: nome,
      data: dataBr,
      data_iso: date.toISOString(),
      horario: clean(obj.horario),
      vagas: clean(obj.vagas),
      inscricao: clean(obj.inscricao),
      link_imagens: clean(obj.link_imagens),
      sinopse: clean(obj.sinopse),
      museu: detectMuseum(clean(obj.equipamento) || sheetName),
      equipamento: detectMuseum(clean(obj.equipamento) || sheetName),
      tipo_atividade: clean(obj.tipo_atividade),
      formato: clean(obj.formato),
      publico: clean(obj.publico),
      acessibilidade: clean(obj.acessibilidade),
      classificacao: clean(obj.classificacao),
      local: clean(obj.local),
      endereco: clean(obj.endereco),
      minibios: clean(obj.minibios),
      material_divulgacao: clean(obj.material_divulgacao),
      raw: obj,
    });
  }

  return items;
}

function dedupeItems(items: any[]) {
  const map = new Map<string, any>();

  for (const item of items || []) {
    const key = [
      normalizeText(item?.nome || item?.nome_acao),
      normalizeText(item?.data),
      normalizeText(item?.horario),
      normalizeText(item?.museu || item?.equipamento),
      normalizeText(item?.local),
    ].join('|');

    if (!key.replace(/\|/g, '')) continue;

    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const prev = map.get(key) || {};
    map.set(key, {
      ...prev,
      ...item,
      sinopse: clean(item.sinopse) || clean(prev.sinopse),
      endereco: clean(item.endereco) || clean(prev.endereco),
      link_imagens: clean(item.link_imagens) || clean(prev.link_imagens),
      minibios: clean(item.minibios) || clean(prev.minibios),
      material_divulgacao: clean(item.material_divulgacao) || clean(prev.material_divulgacao),
    });
  }

  return Array.from(map.values());
}

function buildAgenda(items: any[]) {
  const agenda: Record<string, Record<string, any[]>> = {};

  items.forEach((item) => {
    const date = new Date(item.data_iso);
    if (Number.isNaN(date.getTime())) return;

    const mes = format(date, 'MMMM yyyy', { locale: ptBR });
    const museu = item.museu || item.equipamento || 'Externo';

    if (!agenda[mes]) agenda[mes] = {};
    if (!agenda[mes][museu]) agenda[mes][museu] = [];

    agenda[mes][museu].push(item);
  });

  Object.keys(agenda).forEach((mes) => {
    Object.keys(agenda[mes]).forEach((museu) => {
      agenda[mes][museu].sort((a, b) => {
        const da = new Date(a.data_iso).getTime();
        const db = new Date(b.data_iso).getTime();
        return da - db;
      });
    });
  });

  return agenda;
}

function buildGroupedByMuseumAndMonth(items: any[]) {
  const grouped: Record<string, Record<string, any[]>> = {};

  items.forEach((item) => {
    const museum = item.museu || item.equipamento || 'Externo';
    const date = new Date(item.data_iso);
    if (Number.isNaN(date.getTime())) return;

    const monthKey = format(date, 'yyyy-MM');
    if (!grouped[museum]) grouped[museum] = {};
    if (!grouped[museum][monthKey]) grouped[museum][monthKey] = [];

    grouped[museum][monthKey].push(item);
  });

  return grouped;
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const res = await fetch(XLSX_URL);

    if (!res.ok) {
      return Response.json(
        { ok: false, error: `Falha ao baixar planilha: ${res.status}` },
        { status: 500 }
      );
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
        raw: true,
        defval: '',
      }) as any[][];

      const items = normalizeSheet(sheetName, matrix);
      allItems = allItems.concat(items);
    });

    allItems = dedupeItems(allItems);

    const agenda = buildAgenda(allItems);
    const groupedByMuseumAndMonth = buildGroupedByMuseumAndMonth(allItems);

    return Response.json({
      ok: true,
      total: allItems.length,
      items: allItems,
      agenda,
      grouped_by_museum_and_month: groupedByMuseumAndMonth,
      source: 'google_sheets_xlsx',
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao sincronizar base de conhecimento.',
      },
      { status: 500 }
    );
  }
});
