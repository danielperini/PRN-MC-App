import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

function s(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return s(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildExportUrl(sourceUrl: string): string {
  const match = sourceUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('SOURCE_URL inválida.');
  }
  const id = match[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
}

function excelDateToISO(value: unknown): string {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';
    const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    return date.toISOString();
  }

  const text = s(value);
  if (!text) return '';

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const dd = Number(br[1]);
    const mm = Number(br[2]) - 1;
    let yyyy = Number(br[3]);
    if (yyyy < 100) yyyy += 2000;
    return new Date(Date.UTC(yyyy, mm, dd)).toISOString();
  }

  const native = new Date(text);
  if (!Number.isNaN(native.getTime())) {
    return native.toISOString();
  }

  return '';
}

function detectHeaderRow(rows: any[][]) {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i].map(normalizeHeader);
    const hasNome =
      row.includes('nome da acao') ||
      row.includes('nome da ação') ||
      row.includes('atividade') ||
      row.includes('evento') ||
      row.includes('nome');
    const hasData = row.includes('data');

    if (hasNome && hasData) {
      return { index: i, headers: row };
    }
  }

  return { index: -1, headers: [] as string[] };
}

function getCell(obj: Record<string, any>, names: string[]) {
  for (const name of names) {
    if (obj[name] != null && s(obj[name])) {
      return obj[name];
    }
  }
  return '';
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { ok: false, error: 'Não autenticado.' },
        { status: 401 }
      );
    }

    const body = req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : {};

    const args = body?.args || body || {};
    const sourceUrl = s(args.source_url);

    if (!sourceUrl) {
      return Response.json(
        { ok: false, error: 'source_url é obrigatório.' },
        { status: 400 }
      );
    }

    const exportUrl = buildExportUrl(sourceUrl);
    const response = await fetch(exportUrl);

    if (!response.ok) {
      throw new Error(`Falha ao baixar planilha: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const allItems: any[] = [];
    const errors: any[] = [];
    const debug_sheets: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][];
      const { index: headerIndex, headers } = detectHeaderRow(rows);

      if (headerIndex < 0) {
        debug_sheets.push({ sheetName, status: 'no_header' });
        continue;
      }

      let rowsParsed = 0;

      for (let i = headerIndex + 1; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row || !row.length) continue;

        const obj: Record<string, any> = {};
        headers.forEach((header, idx) => {
          obj[header] = row[idx];
        });

        const titulo = s(getCell(obj, ['nome da acao', 'nome da ação', 'atividade', 'evento', 'nome']));
        const dataRaw = getCell(obj, ['data']);
        const data_inicio = excelDateToISO(dataRaw);
        const museu = s(getCell(obj, ['equipamento programacao', 'equipamento', 'museu']));
        const horario = s(getCell(obj, ['horario']));
        const local = s(getCell(obj, ['local']));
        const sinopse = s(getCell(obj, ['sinopse']));

        if (!titulo || !data_inicio) {
          if (titulo || s(dataRaw)) {
            errors.push({ sheetName, row: i + 1, error: 'missing_titulo_or_data' });
          }
          continue;
        }

        allItems.push({
          titulo,
          nome: titulo,
          data_inicio,
          data: data_inicio,
          museu,
          horario,
          local,
          sinopse,
          origem: 'syncProgramacao',
          source_url: sourceUrl,
          source_sheet: sheetName,
        });

        rowsParsed += 1;
      }

      debug_sheets.push({ sheetName, rows: rowsParsed });
    }

    const dedup = new Map<string, any>();

    for (const item of allItems) {
      const key = [
        s(item.titulo).toLowerCase(),
        s(item.data_inicio),
        s(item.museu).toLowerCase(),
        s(item.horario).toLowerCase(),
      ].join('|');

      if (!dedup.has(key)) {
        dedup.set(key, item);
      }
    }

    const uniqueItems = Array.from(dedup.values());
    const targetEntity = base44.asServiceRole.entities.Programacao;

    const existing = await targetEntity.list('-created_date', 10000);
    const existingItems = Array.isArray(existing) ? existing : existing?.items || [];

    let deleted_previous = 0;

    for (const item of existingItems) {
      if (item?.origem === 'syncProgramacao') {
        await targetEntity.delete(item.id);
        deleted_previous += 1;
      }
    }

    let created = 0;

    for (const item of uniqueItems) {
      await targetEntity.create(item);
      created += 1;
    }

    return Response.json({
      ok: true,
      total_items: uniqueItems.length,
      created,
      deleted_previous,
      errors,
      debug_sheets,
    });
  } catch (error: any) {
    console.error('syncProgramacao error:', error);

    return Response.json(
      {
        ok: false,
        error: error?.message || 'Erro ao sincronizar programação.',
        total_items: 0,
        created: 0,
        deleted_previous: 0,
        errors: [],
        debug_sheets: [],
      },
      { status: 500 }
    );
  }
});
