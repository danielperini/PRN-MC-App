import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '869093013';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${GID}#gid=${GID}`;
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

const MIRROR_SLUG = 'base-conhecimento-ia-google-sheet';
const MIRROR_TITLE = 'Biblioteca de Conhecimento IA';
const MIRROR_FOLDER = 'Biblioteca do Conhecimento';

function normalizeHeader(value: string, index: number) {
  const clean = String(value || '').trim();
  return clean || `coluna_${index + 1}`;
}

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseDate(value: any) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  if (!text) return null;

  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) return iso;

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    let year = Number(br[3]);

    if (year < 100) year += 2000;

    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function findValueByPossibleKeys(values: Record<string, any>, possibleKeys: string[]) {
  const entries = Object.entries(values || {});

  for (const [key, value] of entries) {
    const normalizedKey = normalizeText(key);

    if (
      possibleKeys.some((candidate) => normalizedKey.includes(candidate)) &&
      String(value || '').trim()
    ) {
      return value;
    }
  }

  return '';
}

function detectMuseum(values: Record<string, any>, sheetName = '') {
  const explicitMuseum =
    findValueByPossibleKeys(values, ['museu', 'unidade', 'local', 'equipamento']) || '';

  const sourceText = `${sheetName} ${explicitMuseum} ${Object.values(values || {}).join(' ')}`;
  const text = normalizeText(sourceText);

  if (text.includes('mhab') || text.includes('mab')) return 'MHAB';
  if (text.includes('mis')) return 'MIS';
  if (text.includes('mumo') || text.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function detectClassification(values: Record<string, any>) {
  const explicit =
    findValueByPossibleKeys(values, ['classificacao', 'classificação', 'tipo', 'categoria']) || '';

  const text = normalizeText(explicit);

  if (text.includes('meta')) return 'META';
  if (text.includes('rotina')) return 'ROTINA';
  if (text.includes('extra')) return 'EXTRA';

  return '';
}

function detectEquipe(values: Record<string, any>) {
  const explicit =
    findValueByPossibleKeys(values, ['equipe', 'responsavel', 'responsável', 'area', 'área', 'setor']) || '';

  const text = normalizeText(explicit);

  if (text.includes('comunic')) return 'Comunicação';
  if (text.includes('admin')) return 'Administração';
  if (text.includes('educ')) return 'Educativo';
  if (text.includes('produ')) return 'Produção';

  return explicit ? String(explicit) : '';
}

function inferMonthLabel(date: Date | null, values: Record<string, any>, sheetName = '') {
  if (date && !Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
  }

  const source = normalizeText(`${sheetName} ${Object.values(values || {}).join(' ')}`);

  const monthMap: Record<string, string> = {
    janeiro: 'janeiro',
    fevereiro: 'fevereiro',
    marco: 'março',
    abril: 'abril',
    maio: 'maio',
    junho: 'junho',
    julho: 'julho',
    agosto: 'agosto',
    setembro: 'setembro',
    outubro: 'outubro',
    novembro: 'novembro',
    dezembro: 'dezembro',
  };

  for (const [key, label] of Object.entries(monthMap)) {
    if (source.includes(key)) return label;
  }

  return '';
}

function mapStructuredFields(values: Record<string, any>, firstText: string, rowIndex: number, sheetName = '') {
  const rawDate =
    findValueByPossibleKeys(values, ['data']) ||
    findValueByPossibleKeys(values, ['dia']) ||
    '';

  const parsedDate = parseDate(rawDate);

  const titulo =
    findValueByPossibleKeys(values, [
      'titulo',
      'título',
      'atividade',
      'acao',
      'ação',
      'programacao',
      'programação',
      'evento',
      'nome',
    ]) ||
    firstText ||
    `Atividade ${rowIndex}`;

  const descricao =
    findValueByPossibleKeys(values, [
      'descricao',
      'descrição',
      'resumo',
      'observacao',
      'observação',
      'detalhe',
    ]) || '';

  const equipe = detectEquipe(values);
  const museu = detectMuseum(values, sheetName);
  const classificacao = detectClassification(values);
  const publico_estimado =
    findValueByPossibleKeys(values, ['publico', 'público', 'participantes']) || '';

  return {
    data: rawDate || '',
    data_iso: parsedDate ? parsedDate.toISOString() : '',
    month_label: inferMonthLabel(parsedDate, values, sheetName),
    museu,
    titulo,
    descricao,
    equipe,
    classificacao,
    publico_estimado,
  };
}

function rowLooksLikeHeader(row: any[]) {
  const text = normalizeText((row || []).join(' | '));

  if (!text) return false;

  const headerSignals = [
    'data',
    'atividade',
    'programacao',
    'programação',
    'titulo',
    'título',
    'evento',
    'museu',
    'local',
    'responsavel',
    'responsável',
    'equipe',
    'publico',
    'público',
  ];

  return headerSignals.some((signal) => text.includes(signal));
}

function normalizeSheet(sheetName: string, matrix: any[][], rowOffset = 0) {
  if (!Array.isArray(matrix) || !matrix.length) return [];

  let items: any[] = [];
  let currentHeaders: string[] = [];

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] || [];

    const isHeader = row.some((cell) =>
      String(cell || '').toLowerCase().includes('data')
    );

    if (isHeader) {
      currentHeaders = row.map((h, idx) => normalizeHeader(h, idx));
      continue;
    }

    if (!currentHeaders.length) {
      if (rowLooksLikeHeader(row)) {
        currentHeaders = row.map((h, idx) => normalizeHeader(h, idx));
      }
      continue;
    }

    const values: Record<string, any> = {};

    currentHeaders.forEach((header, colIndex) => {
      values[header] = row[colIndex] ?? '';
    });

    const firstText =
      row.find((cell) => String(cell || '').trim() !== '') || '';

    if (!firstText) continue;

    const structured = mapStructuredFields(
      values,
      firstText,
      i + rowOffset,
      sheetName
    );

    items.push({
      row_index: i + rowOffset,
      sheet_name: sheetName,
      first_text: firstText,
      values,
      raw: row,
      ...structured,
    });
  }

  return items;
}

function getDayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonthKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function groupByDay(items: any[]) {
  const map: Record<string, any[]> = {};

  items.forEach((item) => {
    if (!item.data_iso) return;

    const date = new Date(item.data_iso);
    if (Number.isNaN(date.getTime())) return;

    const key = getDayKey(date);

    if (!map[key]) map[key] = [];
    map[key].push(item);
  });

  return map;
}

function groupByMonth(items: any[]) {
  const map: Record<string, any[]> = {};

  items.forEach((item) => {
    let key = '';

    if (item.data_iso) {
      const date = new Date(item.data_iso);
      if (!Number.isNaN(date.getTime())) {
        key = getMonthKey(date);
      }
    }

    if (!key) {
      key = item.month_label || item.sheet_name || 'sem-mes';
    }

    if (!map[key]) map[key] = [];
    map[key].push(item);
  });

  return map;
}

function countByMuseum(items: any[]) {
  const map: Record<string, number> = {
    MIS: 0,
    MHAB: 0,
    MUMO: 0,
    Externo: 0,
  };

  items.forEach((item) => {
    const key = item.museu || 'Externo';
    map[key] = (map[key] || 0) + 1;
  });

  return map;
}

function groupTimelineByMuseum(items: any[]) {
  const now = new Date();

  const map: Record<string, { futuras: any[]; atuais: any[]; passadas: any[] }> = {
    Todos: { futuras: [], atuais: [], passadas: [] },
    MIS: { futuras: [], atuais: [], passadas: [] },
    MHAB: { futuras: [], atuais: [], passadas: [] },
    MUMO: { futuras: [], atuais: [], passadas: [] },
    Externo: { futuras: [], atuais: [], passadas: [] },
  };

  items.forEach((item) => {
    if (!item.data_iso) return;

    const date = new Date(item.data_iso);
    if (Number.isNaN(date.getTime())) return;

    const itemDay = getDayKey(date);
    const nowDay = getDayKey(now);

    let bucket: 'futuras' | 'atuais' | 'passadas' = 'passadas';
    if (itemDay > nowDay) bucket = 'futuras';
    else if (itemDay === nowDay) bucket = 'atuais';

    const museu = item.museu || 'Externo';

    map.Todos[bucket].push(item);

    if (!map[museu]) {
      map[museu] = { futuras: [], atuais: [], passadas: [] };
    }

    map[museu][bucket].push(item);
  });

  Object.values(map).forEach((group) => {
    group.futuras.sort((a, b) => new Date(a.data_iso).getTime() - new Date(b.data_iso).getTime());
    group.atuais.sort((a, b) => new Date(a.data_iso).getTime() - new Date(b.data_iso).getTime());
    group.passadas.sort((a, b) => new Date(b.data_iso).getTime() - new Date(a.data_iso).getTime());
  });

  return map;
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const body =
      req.method === 'POST'
        ? await req.json().catch(() => ({}))
        : {};

    const mode = body?.args?.mode || body?.mode || 'manual';
    const nowIso = new Date().toISOString();

    const response = await fetch(XLSX_URL);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Falha ao ler planilha. HTTP ${response.status}`,
          source_url: SOURCE_URL,
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    let allItems: any[] = [];
    const rawMatrixBySheet: Record<string, any[][]> = {};
    let runningOffset = 0;

    workbook.SheetNames.forEach((sheetName) => {
      const ws = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: '',
      }) as any[][];

      rawMatrixBySheet[sheetName] = matrix;

      const normalizedItems = normalizeSheet(sheetName, matrix, runningOffset);
      allItems = allItems.concat(normalizedItems);
      runningOffset += normalizedItems.length + 10;
    });

    const groupedByDay = groupByDay(allItems);
    const groupedByMonth = groupByMonth(allItems);
    const countsByMuseum = countByMuseum(allItems);
    const timelineByMuseum = groupTimelineByMuseum(allItems);

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Base carregada com sucesso a partir da planilha inteira.',
        slug: MIRROR_SLUG,
        titulo: MIRROR_TITLE,
        pasta: MIRROR_FOLDER,
        tipo: 'google_sheet_runtime',
        origem: 'google_sheets_xlsx',
        source_url: SOURCE_URL,
        source_sheet_id: SHEET_ID,
        source_gid: GID,
        sheet_names: workbook.SheetNames,
        headers: [],
        items: allItems,
        raw_matrix: rawMatrixBySheet,
        total_items: allItems.length,
        grouped_by_day: groupedByDay,
        grouped_by_month: groupedByMonth,
        counts_by_museum: countsByMuseum,
        timeline_by_museum: timelineByMuseum,
        last_sync: nowIso,
        sync_mode: mode,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro inesperado na sincronização.',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
});
