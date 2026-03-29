import * as XLSX from "xlsx";

const PROGRAMACAO_FILE_NAME = 'Planilha_de_programação_MC-VAR (1).xlsx';

function s(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return s(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

export default async function handler(context: any) {
  const { entities, request } = context;

  let total_items = 0;
  let created = 0;
  let deleted_previous = 0;
  const errors: any[] = [];
  const debug_sheets: any[] = [];

  try {
    const body = request?.body || {};
    const knowledgeDocumentId = s(body?.knowledge_document_id);
    const requestedFileName = s(body?.file_name) || PROGRAMACAO_FILE_NAME;

    let doc: any = null;

    if (knowledgeDocumentId) {
      doc = await entities.KnowledgeDocument.get(knowledgeDocumentId);
    }

    if (!doc?.id) {
      const docs = await entities.KnowledgeDocument.list({
        sort: { created_date: 'desc' },
        limit: 50,
      });

      const docsArray = Array.isArray(docs?.data) ? docs.data : Array.isArray(docs) ? docs : [];
      doc = docsArray.find((item: any) => s(item?.file_name) === requestedFileName) || null;
    }

    if (!doc?.file_url) {
      return {
        ok: false,
        error: `Nenhum arquivo encontrado para sincronizar: ${requestedFileName}`,
        total_items: 0,
        created: 0,
        deleted_previous: 0,
        errors,
        debug_sheets,
      };
    }

    const response = await fetch(doc.file_url);

    if (!response.ok) {
      throw new Error(`Falha ao baixar arquivo salvo: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const allItems: any[] = [];

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
        const descricao = s(getCell(obj, ['descricao', 'sinopse']));
        const tipo_atividade = s(getCell(obj, ['tipo de atividade']));
        const formato = s(getCell(obj, ['formato']));
        const publico = s(getCell(obj, ['publico-alvo', 'publico alvo']));
        const vagas = s(getCell(obj, ['vagas']));
        const inscricao = s(getCell(obj, ['inscricao/acesso', 'inscricao / acesso']));
        const link_inscricao = inscricao;
        const material_divulgacao_aprovado = s(getCell(obj, ['material de divulgacao aprovado', 'material de divulgação aprovado']));

        if (!titulo || !data_inicio) {
          if (titulo || s(dataRaw)) {
            errors.push({ sheetName, row: i + 1, error: 'missing_titulo_or_data' });
          }
          continue;
        }

        allItems.push({
          titulo,
          nome_acao: titulo,
          data: data_inicio,
          data_inicio,
          horario,
          museu,
          equipamento: museu,
          local,
          descricao,
          sinopse,
          tipo_atividade,
          formato,
          publico,
          vagas,
          inscricao,
          link_inscricao,
          material_divulgacao_aprovado,
          origem: 'syncProgramacao',
          ativo: true,
          knowledge_document_id: doc.id,
          storage_file_url: doc.file_url,
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
    total_items = uniqueItems.length;

    const targetEntity = entities.Programacao || entities.Activity;
    const existing = await targetEntity.list({ limit: 10000 });
    const existingItems = Array.isArray(existing?.data) ? existing.data : Array.isArray(existing) ? existing : [];

    for (const item of existingItems) {
      if (item?.origem === 'syncProgramacao') {
        await targetEntity.delete(item.id);
        deleted_previous += 1;
      }
    }

    for (const item of uniqueItems) {
      await targetEntity.create(item);
      created += 1;
    }

    return {
      ok: true,
      total_items,
      created,
      deleted_previous,
      errors,
      debug_sheets,
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message || 'Erro ao sincronizar programação.',
      total_items,
      created,
      deleted_previous,
      errors,
      debug_sheets,
    };
  }
}
