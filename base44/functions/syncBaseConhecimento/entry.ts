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

function inferMonth(text: string) {
  const value = String(text || '').toLowerCase();

  const months: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    março: 3,
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

      return {
        row_index: index + 2,
        first_text: firstText,
        inferred_month: inferMonth(firstText),
        values,
        raw: row,
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

async function getExistingMirror(base44: any) {
  const existing = await base44.asServiceRole.entities.BibliotecaConhecimentoIA.list({
    filter: { slug: MIRROR_SLUG },
    limit: 1,
  });

  return existing?.[0] || null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body =
      req.method === 'POST'
        ? await req.json().catch(() => ({}))
        : {};

    const mode = body?.args?.mode || body?.mode || 'manual';
    const nowIso = new Date().toISOString();

    const response = await fetch(CSV_URL, {
      method: 'GET',
      headers: {
        accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
      },
    });

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

    const payload = {
      slug: MIRROR_SLUG,
      titulo: MIRROR_TITLE,
      pasta: MIRROR_FOLDER,
      tipo: 'google_sheet_mirror',
      origem: 'google_sheets_csv',
      source_url: SOURCE_URL,
      source_sheet_id: SHEET_ID,
      source_gid: GID,
      headers: normalized.headers,
      items: normalized.items,
      raw_matrix: normalized.raw_matrix,
      total_items: normalized.total_items,
      last_sync: nowIso,
      status: 'sincronizado',
      sync_mode: mode,
    };

    const existing = await getExistingMirror(base44);

    const saved = existing
      ? await base44.asServiceRole.entities.BibliotecaConhecimentoIA.update(
          existing.id,
          payload
        )
      : await base44.asServiceRole.entities.BibliotecaConhecimentoIA.create(
          payload
        );

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Base de conhecimento sincronizada com sucesso.',
        total_items: normalized.total_items,
        last_sync: nowIso,
        record: saved,
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
