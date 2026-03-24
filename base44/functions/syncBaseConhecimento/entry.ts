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

function extractSheetMonthYear(sheetName: string) {
  const text = normalizeText(sheetName);

  const monthMap: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
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

  let month: number | null = null;
  let year: number | null = null;

  for (const [name, num] of Object.entries(monthMap)) {
    if (text.includes(name)) {
      month = num;
      break;
    }
  }

  const yearMatch = text.match(/(20\d{2}|\d{2})/);
  if (yearMatch) {
    year = Number(yearMatch[1]);
    if (year < 100) year += 2000;
  }

  return { month, year };
}

function parseDateWithSheetContext(value: any, sheetName = '') {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;

  const ctx = extractSheetMonthYear(sheetName);

  const fullBr = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (fullBr) {
    let year = Number(fullBr[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(fullBr[2]) - 1, Number(fullBr[1]));
  }

  const partialBr = text.match(/^(\d{1,2})[\/.-](\d{1,2})$/);
  if (partialBr && ctx.year) {
    return new Date(ctx.year, Number(partialBr[2]) - 1, Number(partialBr[1]));
  }

  const firstDateInPeriod = text.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
  if (firstDateInPeriod) {
    const day = Number(firstDateInPeriod[1]);
    const month = Number(firstDateInPeriod[2]);
    let year = firstDateInPeriod[3] ? Number(firstDateInPeriod[3]) : ctx.year || new Date().getFullYear();
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day);
  }

  if (ctx.month && ctx.year) {
    const dayOnly = text.match(/^(\d{1,2})$/);
    if (dayOnly) {
      return new Date(ctx.year, ctx.month - 1, Number(dayOnly[1]));
    }
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
  const equipamento =
    findValueByPossibleKeys(values, ['equipamento']) ||
    findValueByPossibleKeys(values, ['museu']) ||
    findValueByPossibleKeys(values, ['local']) ||
    '';

  const sourceText = `${sheetName} ${equipamento} ${Object.values(values || {}).join(' ')}`;
  const text = normalizeText(sourceText);

  if (text.includes('mhab') || text.includes('mab') || text.includes('abilio barreto')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem e som')) return 'MIS';
  if (text.includes('mumo') || text.includes('mumu') || text.includes('museu da moda')) return 'MUMO';

  return 'Externo';
}

function rowLooksLikeHeader(row: any[]) {
  const text = normalizeText((row || []).join(' | '));
  if (!text) return false;

  const signals = [
    'equipamento',
    'nome da acao',
    'nome',
    'sinopse',
    'tipo de atividade',
    'formato',
    'data',
    'horario',
    'horário',
    'vagas',
    'inscricao',
    'inscrição',
    'publico',
    'público',
  ];

  return signals.some((signal) => text.includes(signal));
}

function inferMonthLabel(date: Date | null, sheetName = '') {
  if (date && !Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
  }

  const ctx = extractSheetMonthYear(sheetName);
  if (ctx.month) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2026, ctx.month - 1, 1));
  }

  return '';
}

function mapStructuredFields(values: Record<string, any>, firstText: string, rowIndex: number, sheetName = '') {
  const rawDate =
    findValueByPossibleKeys(values, ['data']) ||
    findValueByPossibleKeys(values, ['periodo']) ||
    findValueByPossibleKeys(values, ['período']) ||
    '';

  const parsedDate = parseDateWithSheetContext(rawDate, sheetName);

  const titulo =
    findValueByPossibleKeys(values, ['nome da acao', 'nome da ação', 'nome atividade para divulgacao', 'nome da atividade para divulgacao', 'nome']) ||
    firstText ||
    `Atividade ${rowIndex}`;

  const sinopse =
    findValueByPossibleKeys(values, ['sinopse', 'descricao', 'descrição', 'resumo']) || '';

  const tipoAtividade =
    findValueByPossibleKeys(values, ['tipo de atividade', 'tipo']) || '';

  const formato =
    findValueByPossibleKeys(values, ['formato']) || '';

  const horario =
    findValueByPossibleKeys(values, ['horario', 'horário']) || '';

  const vagas =
    findValueByPossibleKeys(values, ['vagas']) || '';

  const inscricaoAcesso =
    findValueByPossibleKeys(values, ['inscricao/acesso', 'inscrição/acesso', 'inscricao', 'inscrição']) || '';

  const linkImagens =
    findValueByPossibleKeys(values, ['link de imagens', 'link imagens']) || '';

  const local =
    findValueByPossibleKeys(values, ['local']) || '';

  const endereco =
    findValueByPossibleKeys(values, ['endereco completo', 'endereço completo']) || '';

  const equipe =
    findValueByPossibleKeys(values, ['equipe', 'responsavel', 'responsável', 'setor']) || '';

  const museu = detectMuseum(values, sheetName);

  return {
    data: rawDate || '',
    data_iso: parsedDate ? parsedDate.toISOString() : '',
    month_label: inferMonthLabel(parsedDate, sheetName),
    museu,
    titulo,
    descricao: sinopse,
    sinopse,
    tipo_atividade: tipoAtividade,
    formato,
    horario,
    vagas,
    inscricao_acesso: inscricaoAcesso,
    link_imagens: linkImagens,
    local,
    endereco,
    equipe,
  };
}

function normalizeSheet(sheetName: string, matrix: any[][], rowOffset = 0) {
  if (!Array.isArray(matrix) || !matrix.length) return [];

  let items: any[] = [];
  let currentHeaders: string[] = [];
  let lastEquipamento = '';

  for (let i = 0; i < matrix.length; i++) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : [];
    const hasAnyValue = row.some((cell) => String(cell || '').trim() !== '');
    if (!hasAnyValue) continue;

    if (rowLooksLikeHeader(row)) {
      currentHeaders = row.map((h, idx) => normalizeHeader(h, idx));
      continue;
    }

    if (!currentHeaders.length) continue;

    const values: Record<string, any> = {};

    currentHeaders.forEach((header, colIndex) => {
      values[header] = row[colIndex] ?? '';
    });

    const equipamentoAtual =
      values['Equipamento'] ||
      values['equipamento'] ||
      row[0] ||
      '';

    if (String(equipamentoAtual || '').trim()) {
      lastEquipamento = String(equipamentoAtual).trim();
    }

    if (!values['Equipamento'] && !values['equipamento'] && lastEquipamento) {
      values['Equipamento'] = lastEquipamento;
    }

    const firstText =
      row.find((cell) => String(cell || '').trim() !== '') || '';

    const structured = mapStructuredFields(
      values,
      firstText,
      i + rowOffset,
      sheetName
    );

    if (!structured.titulo || !structured.data) continue;

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
