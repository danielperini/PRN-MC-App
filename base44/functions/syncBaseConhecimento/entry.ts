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

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
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
    .filter((line) => line.trim() !== '')
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
    .trim()
    .toLowerCase();
}

function inferMonth(text: string) {
  const value = normalizeText(text);

  const months: Record<string, number> = {
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

  for (const [name, number] of Object.entries(months)) {
    if (value.includes(name)) return number;
  }

  return null;
}

function parseFlexibleDate(value: any) {
  if (!value) return null;

  const text = String(value).trim();
  if (!text) return null;

  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime())) return asDate;

  const brMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    let year = Number(brMatch[3]);

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
    const matched = possibleKeys.some((candidate) => normalizedKey.includes(candidate));

    if (matched && String(value || '').trim()) {
      return value;
    }
  }

  return '';
}

function detectMuseum(values: Record<string, any>) {
  const explicitMuseum =
    findValueByPossibleKeys(values, ['museu', 'unidade', 'local']) || '';

  const sourceText = explicitMuseum || Object.values(values || {}).join(' ');
  const text = normalizeText(sourceText);

  if (text.includes('mhab') || text.includes('mab')) return 'MHAB';
  if (text.includes('mis')) return 'MIS';
  if (text.includes('mumo') || text.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function detectClassification(values: Record<string, any>) {
  const explicit =
    findValueByPossibleKeys(values, ['classificacao', 'tipo', 'categoria']) || '';

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

  return explicit ? 'Outra' : '';
}

function mapStructuredFields(values: Record<string, any>, firstText: string, rowIndex: number) {
  const rawDate =
    findValueByPossibleKeys(values, ['data']) ||
    findValueByPossibleKeys(values, ['dia']) ||
    '';

  const parsedDate = parseFlexibleDate(rawDate);

  const titulo =
    findValueByPossibleKeys(values, ['titulo', 'atividade', 'acao', 'ação', 'programacao', 'programação', 'evento', 'nome']) ||
    firstText ||
    `Atividade ${rowIndex}`;

  const descricao =
    findValueByPossibleKeys(values, ['descricao', 'descrição', 'resumo', 'observacao', 'observação', 'detalhe']) || '';

  const equipe = detectEquipe(values);
  const museu = detectMuseum(values);
  const classificacao = detectClassification(values);
  const publico_estimado =
    findValueByPossibleKeys(values, ['publico', 'público', 'participantes']) || '';

  return {
    data: rawDate || '',
    data_iso: parsedDate ? parsedDate.toISOString() : '',
    museu,
    titulo,
    descricao,
    equipe,
    classificacao,
    publico_estimado,
  };
}

function normalizeMatrix(matrix: string[][]) {
  if (!matrix.length) {
    return {
      headers: [],
      items: [],
      raw_matrix: [],
      total_items: 0,
    };
  }

  const headers = matrix[0].map(normalizeHeader);
  const rows = matrix.slice(1);

  const items = rows
    .map((row, index) => {
      const values: Record<string, any> = {};

      headers.forEach((header, colIndex) => {
        values[header] = row[colIndex] ?? '';
      });

      const firstText =
        row.find((cell) => String(cell || '').trim() !== '') || '';

      const hasAnyValue = row.some((cell) => String(cell || '').trim() !== '');

      const structured = mapStructuredFields(values, firstText, index + 2);

      return {
        row_index: index + 2,
        first_text: firstText,
        inferred_month: inferMonth(firstText),
        values,
        raw: row,
        ...structured,
        hasAnyValue,
      };
    })
    .filter((item) => item.hasAnyValue)
    .map(({ hasAnyValue, ...rest }) => rest);

  return {
    headers,
    items,
    raw_matrix: matrix,
    total_items: items.length,
  };
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

    const response = await fetch(CSV_URL);

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

    const csvText = await response.text();
    const matrix = parseCsv(csvText);
    const normalized = normalizeMatrix(matrix);

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Base carregada com sucesso (sem persistência).',
        slug: MIRROR_SLUG,
        titulo: MIRROR_TITLE,
        pasta: MIRROR_FOLDER,
        tipo: 'google_sheet_runtime',
        origem: 'google_sheets_csv',
        source_url: SOURCE_URL,
        headers: normalized.headers,
        items: normalized.items,
        raw_matrix: normalized.raw_matrix,
        total_items: normalized.total_items,
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
