import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

type AnyRecord = Record<string, any>;

function toArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

function normalizeText(value: any): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function cleanValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDateBr(value);
  return String(value).trim();
}

function formatDateBr(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateIso(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function extractSheetMonthYear(sheetName = ''): { month: number | null; year: number | null } {
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
  for (const [k, v] of Object.entries(monthMap)) {
    if (text.includes(k)) {
      month = v;
      break;
    }
  }

  const yearMatch = text.match(/(20\d{2}|\d{2})/);
  let year: number | null = null;
  if (yearMatch) {
    year = Number(yearMatch[1]);
    if (year < 100) year += 2000;
  }

  return { month, year };
}

function excelSerialToDate(value: number): Date | null {
  try {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) return new Date(parsed.y, parsed.m - 1, parsed.d);
  } catch (_) {
    // ignore
  }
  return null;
}

function parseDateWithSheetContext(value: any, sheetName = ''): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) return excelSerialToDate(value);
    return null;
  }

  const text = cleanValue(value);
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime()) && /\d{4}/.test(text)) return direct;

  const { month, year } = extractSheetMonthYear(sheetName);

  const fullBr = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (fullBr) {
    let y = Number(fullBr[3]);
    if (y < 100) y += 2000;
    return new Date(y, Number(fullBr[2]) - 1, Number(fullBr[1]));
  }

  const partialBr = text.match(/^(\d{1,2})[\/.-](\d{1,2})$/);
  if (partialBr && year) {
    return new Date(year, Number(partialBr[2]) - 1, Number(partialBr[1]));
  }

  const dayOnly = text.match(/^(\d{1,2})$/);
  if (dayOnly && month && year) {
    return new Date(year, month - 1, Number(dayOnly[1]));
  }

  const embedded = text.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
  if (embedded) {
    const d = Number(embedded[1]);
    const m = Number(embedded[2]);
    let y = embedded[3] ? Number(embedded[3]) : year || new Date().getFullYear();
    if (y < 100) y += 2000;
    return new Date(y, m - 1, d);
  }

  return null;
}

function parseTime(value: any): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hh = String(value.getHours()).padStart(2, '0');
    const mm = String(value.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value < 1) {
      const totalMinutes = Math.round(value * 24 * 60);
      const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
      const mm = String(totalMinutes % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  }

  const text = cleanValue(value);
  const m =
    text.match(/(\d{1,2})\s*h(?:\s*:?(\d{2}))?/i) ||
    text.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = String(Number(m[1])).padStart(2, '0');
    const mm = String(Number(m[2] || '0')).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  return text;
}

const HEADER_SYNONYMS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'nome', patterns: [/^nome\b/i, /^titulo\b/i, /^título\b/i, /nome da acao/i, /nome da ação/i] },
  { key: 'data', patterns: [/^data\b/i, /^dia\b/i, /data inicio/i, /data_in/i] },
  { key: 'horario', patterns: [/horario/i, /horário/i, /^hora\b/i] },
  { key: 'museu', patterns: [/^museu\b/i, /^equipamento\b/i, /^unidade\b/i, /^local do museu/i] },
  { key: 'local', patterns: [/^local\b/i, /espaco/i, /espaço/i, /onde/i] },
  { key: 'endereco_completo', patterns: [/endereco/i, /endereço/i, /logradouro/i] },
  { key: 'sinopse', patterns: [/sinopse/i, /sinóps/i, /resumo\b/i] },
  { key: 'descricao', patterns: [/descricao/i, /descrição/i, /detalh/i] },
  { key: 'tipo', patterns: [/^tipo\b/i, /tipo de atividade/i, /categoria/i] },
  { key: 'formato', patterns: [/formato/i, /modalidade/i] },
  { key: 'publico_alvo', patterns: [/publico/i, /público/i, /faixa etaria/i, /faixa etária/i] },
  { key: 'acessibilidade', patterns: [/acessibil/i] },
  { key: 'classificacao_indicativa', patterns: [/classific/i, /idade/i] },
  { key: 'vagas', patterns: [/vagas/i, /lotacao/i, /lotação/i, /capacidade/i] },
  { key: 'inscricao', patterns: [/inscri/i, /inscrição/i] },
  { key: 'link_inscricao', patterns: [/link.*inscri/i, /url.*inscri/i] },
  { key: 'material_de_divulgacao', patterns: [/material/i, /divulg/i] },
  { key: 'link_imagens', patterns: [/imagem/i, /fotos?/i, /drive/i] },
  { key: 'minibios', patterns: [/bio/i, /minibio/i] },
  { key: 'status', patterns: [/status/i, /situacao/i, /situação/i] },
  { key: 'briefing', patterns: [/brief/i] },
  { key: 'servico', patterns: [/servic/i, /serviço/i] },
  { key: 'valor', patterns: [/valor/i, /preco/i, /preço/i] },
];

function detectHeaderRow(rows: any[][]): { headerRowIndex: number | null; headerMap: Record<number, string> } {
  const scanLimit = Math.min(rows.length, 30);

  let bestIndex: number | null = null;
  let bestScore = 0;
  let bestMap: Record<number, string> = {};

  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r] || [];
    const map: Record<number, string> = {};
    let score = 0;

    for (let c = 0; c < row.length; c++) {
      const cellText = normalizeText(row[c]);
      if (!cellText) continue;

      for (const syn of HEADER_SYNONYMS) {
        if (syn.patterns.some((p) => p.test(cellText))) {
          if (!map[c]) {
            map[c] = syn.key;
            score++;
          }
          break;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = r;
      bestMap = map;
    }
  }

  if (bestIndex === null || bestScore < 3) return { headerRowIndex: null, headerMap: {} };

  const seen = new Set<string>();
  const normalizedMap: Record<number, string> = {};

  for (const [cStr, key] of Object.entries(bestMap)) {
    const c = Number(cStr);
    if (!key) continue;

    if (!seen.has(key)) {
      normalizedMap[c] = key;
      seen.add(key);
      continue;
    }

    if (key === 'inscricao' && !seen.has('link_inscricao')) {
      normalizedMap[c] = 'link_inscricao';
      seen.add('link_inscricao');
    }
  }

  return { headerRowIndex: bestIndex, headerMap: normalizedMap };
}

function isRowEmpty(values: AnyRecord): boolean {
  const keys = ['nome', 'titulo', 'data', 'horario', 'museu', 'local', 'descricao', 'sinopse'];
  return keys.every((k) => !cleanValue(values[k]));
}

function buildProgramacaoPayload(item: AnyRecord, origem: string) {
  return {
    nome: item.nome || '',
    titulo: item.titulo || item.nome || '',
    nome_acao: item.nome || '',
    data: item.data || '',
    data_inicio: item.data_iso || '',
    data_iso: item.data_iso || '',
    horario: item.horario || '',
    museu: item.museu || 'Externo',
    equipamento: item.equipamento || item.museu || 'Externo',
    local: item.local || '',
    endereco_completo: item.endereco_completo || '',
    sinopse: item.sinopse || '',
    descricao: item.descricao || '',
    tipo: item.tipo || '',
    tipo_atividade: item.tipo_atividade || item.tipo || '',
    formato: item.formato || '',
    vagas: item.vagas || '',
    inscricao: item.inscricao || '',
    link_inscricao: item.link_inscricao || item.inscricao_acesso || item.inscricao || '',
    material_divulgacao: item.material_de_divulgacao || item.material_divulgacao || '',
    link_imagens: item.link_imagens || '',
    minibios: item.minibios || '',
    resumo_ia: item.resumo_ia || '',
    publico_alvo: item.publico_alvo || '',
    acessibilidade: item.acessibilidade || '',
    classificacao_indicativa: item.classificacao_indicativa || '',
    status: item.status || '',
    briefing: item.briefing || '',
    servico: item.servico || '',
    valor: item.valor || '',
    origem,
    sheet_name: item.sheet_name || '',
    month_label: item.month_label || '',
    row_index: item.row_index ?? null,
    raw_values: item.raw_values || item.raw || {},
  };
}

type EntityAdapter = {
  entityName: 'Programacao' | 'Activity';
  list: (sort: string, limit: number, offset?: number) => Promise<any>;
  create: (payload: any) => Promise<any>;
  delete: (id: string) => Promise<any>;
};

async function getTargetEntity(base44: any): Promise<EntityAdapter> {
  try {
    if (base44?.asServiceRole?.entities?.Programacao) {
      await base44.asServiceRole.entities.Programacao.list('-created_date', 1);
      return {
        entityName: 'Programacao',
        list: (s, l, o) => base44.asServiceRole.entities.Programacao.list(s, l, o),
        create: (p) => base44.asServiceRole.entities.Programacao.create(p),
        delete: (id) => base44.asServiceRole.entities.Programacao.delete(id),
      };
    }
  } catch (_) {
    // fallback
  }

  return {
    entityName: 'Activity',
    list: (s, l, o) => base44.asServiceRole.entities.Activity.list(s, l, o),
    create: (p) => base44.asServiceRole.entities.Activity.create(p),
    delete: (id) => base44.asServiceRole.entities.Activity.delete(id),
  };
}

async function fetchLatestProgramacaoDoc(base44: any): Promise<any | null> {
  const result = await base44.asServiceRole.entities.KnowledgeDocument.list('-created_date', 1000);
  const docs = toArray(result);

  const candidates = docs
    .map((d: any) => ({
      raw: d,
      categoria: d?.categoria || d?.category || '',
      created_date: d?.created_date || d?.created_at || '',
      updated_date: d?.updated_date || d?.updated_at || '',
      file_url: d?.file_url || d?.url || d?.document_url || '',
    }))
    .filter((d: any) => normalizeText(d.categoria) === 'programacao')
    .sort((a: any, b: any) => {
      const da = new Date(a.updated_date || a.created_date || 0).getTime() || 0;
      const db = new Date(b.updated_date || b.created_date || 0).getTime() || 0;
      return db - da;
    });

  return candidates[0]?.raw || null;
}

function makeDedupKey(item: AnyRecord): string {
  const name = normalizeText(item.nome || item.titulo || '');
  const date = normalizeText(item.data_iso || item.data || '');
  const time = normalizeText(item.horario || '');
  const museum = normalizeText(item.museu || item.equipamento || '');
  const place = normalizeText(item.local || '');
  return [name, date, time, museum, place].join('|');
}

async function replaceAll(adapter: EntityAdapter, items: AnyRecord[], origem: string) {
  const existing = await adapter.list('-created_date', 5000);
  const existingList = toArray(existing);

  for (const record of existingList) {
    if (!record?.id) continue;
    await adapter.delete(record.id);
  }

  let created = 0;
  const errors: any[] = [];

  for (const item of items) {
    try {
      await adapter.create(buildProgramacaoPayload(item, origem));
      created++;
    } catch (error: any) {
      errors.push({
        nome: item?.nome || item?.titulo || '',
        data: item?.data || '',
        museu: item?.museu || '',
        error: error?.message || String(error),
      });
    }
  }

  return { deleted_previous: existingList.length, created, errors };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const args = body?.args || body || {};
    const dryRun = Boolean(args?.dry_run);
    const origem = 'syncProgramacao';

    const doc = await fetchLatestProgramacaoDoc(base44);
    if (!doc) {
      return Response.json(
        { ok: false, error: 'Nenhum KnowledgeDocument com categoria "Programação" encontrado.' },
        { status: 404 }
      );
    }

    const knowledge_document = {
      id: doc?.id || '',
      title: doc?.title || doc?.name || doc?.file_name || '',
      file_name: doc?.file_name || '',
      file_url: doc?.file_url || doc?.url || doc?.document_url || '',
      categoria: doc?.categoria || doc?.category || '',
      updated_date: doc?.updated_date || doc?.updated_at || '',
      created_date: doc?.created_date || doc?.created_at || '',
    };

    if (!knowledge_document.file_url) {
      return Response.json(
        { ok: false, error: 'KnowledgeDocument encontrado, mas sem file_url.', knowledge_document },
        { status: 400 }
      );
    }

    const resp = await fetch(knowledge_document.file_url);
    if (!resp.ok) {
      return Response.json(
        { ok: false, error: `Falha ao baixar XLSX. HTTP ${resp.status}`, knowledge_document },
        { status: 502 }
      );
    }

    const arrayBuffer = await resp.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellDates: true,
      cellText: false,
      cellNF: false,
      raw: true,
    });

    const debug_sheets: any[] = [];
    const dedup = new Map<string, AnyRecord>();
    let duplicates_total = 0;

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' }) as any[][];
      const { headerRowIndex, headerMap } = detectHeaderRow(rows);

      const mapped_columns = Object.entries(headerMap)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([c, k]) => ({ col: Number(c), key: k }));

      const sheetDebug: any = {
        sheet_name: sheetName,
        header_row_index: headerRowIndex,
        mapped_columns,
        rows_total: rows.length,
        rows_parsed: 0,
        rows_skipped_empty: 0,
        duplicates: 0,
        warnings: [] as string[],
      };

      if (headerRowIndex === null) {
        sheetDebug.warnings.push('Cabeçalho não detectado (score < 3).');
        debug_sheets.push(sheetDebug);
        continue;
      }

      const { month, year } = extractSheetMonthYear(sheetName);
      sheetDebug.month_inferred = month;
      sheetDebug.year_inferred = year;

      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const raw_values: AnyRecord = {};
        const values: AnyRecord = {};

        for (let c = 0; c < row.length; c++) {
          raw_values[`col_${c + 1}`] = row[c];
          const key = headerMap[c];
          if (!key) continue;
          values[key] = row[c];
        }

        const d = parseDateWithSheetContext(values.data, sheetName);
        const data_iso = d ? formatDateIso(d) : '';
        const data = d ? formatDateBr(d) : cleanValue(values.data);
        const horario = parseTime(values.horario);

        const museu = cleanValue(values.museu);
        const nome = cleanValue(values.nome) || cleanValue(values.titulo);

        const item: AnyRecord = {
          ...values,
          nome,
          titulo: cleanValue(values.titulo) || nome,
          museu,
          equipamento: museu,
          data,
          data_iso,
          horario,
          sheet_name: sheetName,
          month_label: month && year ? `${String(month).padStart(2, '0')}/${year}` : '',
          row_index: r + 1,
          raw_values,
        };

        if (isRowEmpty(item)) {
          sheetDebug.rows_skipped_empty++;
          continue;
        }

        const key = makeDedupKey(item);
        if (dedup.has(key)) {
          duplicates_total++;
          sheetDebug.duplicates++;
          continue;
        }

        dedup.set(key, item);
        sheetDebug.rows_parsed++;
      }

      debug_sheets.push(sheetDebug);
    }

    const items = Array.from(dedup.values());
    const adapter = await getTargetEntity(base44);

    let created = 0;
    let deleted_previous = 0;
    const errors: any[] = [];

    if (!dryRun) {
      const result = await replaceAll(adapter, items, origem);
      created = result.created;
      deleted_previous = result.deleted_previous;
      errors.push(...result.errors);
    }

    return Response.json({
      ok: errors.length === 0,
      total_items: items.length,
      created,
      deleted_previous,
      errors,
      debug_sheets,
      duplicates: duplicates_total,
      dry_run: dryRun,
      target_entity: adapter.entityName,
      knowledge_document,
      sheet_names: workbook.SheetNames,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        total_items: 0,
        created: 0,
        deleted_previous: 0,
        errors: [{ error: error?.message || String(error) }],
        debug_sheets: [],
      },
      { status: 500 }
    );
  }
});
