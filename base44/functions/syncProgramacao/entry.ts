/**
 * base44/functions/syncProgramacao/entry.ts
 *
 * Sync incremental (padrão):
 * - mês atual sempre
 * - mês seguinte somente a partir do dia 23
 *
 * Correção importante:
 * - Se NÃO selecionar nenhuma aba pelo incremental (ex.: relógio do servidor não bate),
 *   faz fallback e processa o(s) mês(es) mais recentes encontrados no XLSX.
 *
 * Opções:
 * - ?mode=incremental (default)
 * - ?mode=full        (processa todas as abas mês/ano)
 *
 * Fonte:
 * - Preferencial: KnowledgeDocument mais recente com category = "Programação" (file_url)
 * - Fallback: req.query.source_url ou req.body.source_url (Google Sheets/Drive URL)
 *
 * Retorno: JSON diagnóstico
 */

import * as XLSX from "xlsx";
import crypto from "node:crypto";

type AnyObj = Record<string, any>;

type DebugSheet = {
  sheet: string;
  used: boolean;
  headerRow?: number;
  headerScore?: number;
  mappedColumns?: Record<string, number>;
  rowsSeen?: number;
  rowsParsed?: number;
  rowsKept?: number;
  syncMonth?: string;
  notes?: string[];
  errors?: string[];
};

type ResultJson = {
  ok: boolean;
  total_items: number;
  created: number;
  deleted_previous: number;
  errors: string[];
  debug_sheets: DebugSheet[];
  source_used: "knowledge_document" | "source_url";
  source_url_resolved: string | null;
  knowledge_document_id: string | null;
};

const CATEGORY = "Programação";

const CANON_FIELDS = [
  "equipamento",
  "nome",
  "sinopse",
  "tipo",
  "formato",
  "data",
  "horario",
  "publico",
  "acessibilidade",
  "vagas",
  "inscricao",
  "contato",
  "valor",
  "requisicao",
  "local",
] as const;

type CanonField = (typeof CANON_FIELDS)[number];

const COLUMN_SYNONYMS: Record<CanonField, string[]> = {
  equipamento: ["equipamento", "equip.", "eqp", "museu", "unidade"],
  nome: ["nome", "atividade", "título", "titulo", "evento", "programacao", "programação"],
  sinopse: ["sinopse", "descrição", "descricao", "resumo", "sobre", "observação", "observacao"],
  tipo: ["tipo de atividade", "tipo", "categoria", "eixo", "linha"],
  formato: ["formato", "modalidade", "presencial/online", "presencial", "online"],
  data: ["data", "dia", "data do evento"],
  horario: ["horário", "horario", "hora", "horas"],
  publico: ["público-alvo", "publico-alvo", "público", "publico", "faixa etária", "faixa etaria"],
  acessibilidade: ["acessibilidade", "acessível", "acessivel", "libras", "audiodescrição", "audiodescricao"],
  vagas: ["vagas", "lotação", "lotacao", "capacidade", "limite"],
  inscricao: ["inscrição/acesso", "inscricao/acesso", "inscrição", "inscricao", "acesso", "ingresso", "entrada"],
  contato: ["contato da atração", "contato", "responsável", "responsavel", "produção", "producao"],
  valor: ["valor", "preço", "preco", "gratuito", "custo"],
  requisicao: ["requisição feita?", "requisicao feita?", "requisição", "requisicao"],
  local: ["local", "espaço", "espaco", "sala", "onde"],
};

const REQUIRED_FOR_HEADER: CanonField[] = ["nome", "data"];

const PT_MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
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

function normalizeHeader(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sha1(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function isProbablyEmptyRow(row: any[]): boolean {
  return row.every((v) => v == null || String(v).trim() === "");
}

function asString(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function toNullableNumber(v: any): number | null {
  if (v == null || String(v).trim() === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(",", ".").replace(/[^\d.]+/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseExcelDateBasic(value: any): Date | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = Math.round(value * 86400000);
    const d = new Date(epoch.getTime() + ms);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const str = String(value).trim();
  if (!str) return null;

  const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const dd = parseInt(m1[1], 10);
    const mm = parseInt(m1[2], 10);
    let yy = parseInt(m1[3], 10);
    if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
    const d = new Date(yy, mm - 1, dd);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const m2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const yy = parseInt(m2[1], 10);
    const mm = parseInt(m2[2], 10);
    const dd = parseInt(m2[3], 10);
    const d = new Date(yy, mm - 1, dd);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const t = Date.parse(str);
  if (!Number.isNaN(t)) return new Date(t);

  return null;
}

function parseSheetMonthYear(sheetName: string): { year: number; month: number } | null {
  const raw = String(sheetName || "");
  const n = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const m = n.match(
    /(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{2,4})/
  );
  if (!m) return null;

  const monthToken = m[1];
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;

  const month = PT_MONTHS[monthToken];
  if (!month) return null;

  return { year, month };
}

function startOfMonthUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function startOfNextMonthUTC(year: number, month: number): Date {
  return month === 12
    ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0))
    : new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

function yyyymm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shouldSyncMonth(params: { year: number; month: number; now: Date }): boolean {
  const { year, month, now } = params;

  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();

  if (year === nowYear && month === nowMonth) return true;

  const next = nowMonth === 12 ? { y: nowYear + 1, m: 1 } : { y: nowYear, m: nowMonth + 1 };
  if (year === next.y && month === next.m) return nowDay >= 23;

  return false;
}

function scoreHeaderRow(row: any[]): { score: number; map: Partial<Record<CanonField, number>> } {
  const normCells = row.map((c) => normalizeHeader(c));
  const colMap: Partial<Record<CanonField, number>> = {};
  let score = 0;

  for (let colIdx = 0; colIdx < normCells.length; colIdx++) {
    const cell = normCells[colIdx];
    if (!cell) continue;

    for (const field of CANON_FIELDS) {
      if (colMap[field] != null) continue;
      const syns = COLUMN_SYNONYMS[field];
      const hit = syns.some((syn) => {
        const ns = normalizeHeader(syn);
        return cell === ns || cell.includes(ns) || ns.includes(cell);
      });
      if (hit) {
        colMap[field] = colIdx;
        score += REQUIRED_FOR_HEADER.includes(field) ? 3 : 1;
      }
    }
  }

  for (const req of REQUIRED_FOR_HEADER) {
    if (colMap[req] == null) score -= 5;
  }

  return { score, map: colMap };
}

function findBestHeader(matrix: any[][]): { headerRow: number; map: Partial<Record<CanonField, number>>; score: number } | null {
  let best: { headerRow: number; map: Partial<Record<CanonField, number>>; score: number } | null = null;

  const scanLimit = Math.min(matrix.length, 60);
  for (let r = 0; r < scanLimit; r++) {
    const row = matrix[r] ?? [];
    if (isProbablyEmptyRow(row)) continue;
    const { score, map } = scoreHeaderRow(row);
    if (!best || score > best.score) best = { headerRow: r, map, score };
  }

  if (!best) return null;
  if (best.score < 3) return null;
  return best;
}

function buildDedupKey(item: AnyObj): string {
  const parts = [
    normalizeHeader(item.equipamento ?? ""),
    normalizeHeader(item.nome ?? item.title ?? ""),
    item.data ? String(item.data).slice(0, 10) : "",
    normalizeHeader(item.horario ?? ""),
    normalizeHeader(item.local ?? ""),
  ];
  return sha1(parts.join("|"));
}

function sheetToMatrix(ws: XLSX.WorkSheet): any[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
}

async function fetchBinary(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar XLSX: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function pickKnowledgeDocumentApi(ctx: AnyObj): AnyObj {
  return ctx?.entities?.KnowledgeDocument || ctx?.db?.KnowledgeDocument || ctx?.db?.entities?.KnowledgeDocument || ctx?.data?.KnowledgeDocument || null;
}

function pickOperationalEntity(ctx: AnyObj): { name: string; api: AnyObj } | null {
  const prog = ctx?.entities?.Programacao || ctx?.db?.Programacao || ctx?.db?.entities?.Programacao || ctx?.data?.Programacao || null;
  if (prog) return { name: "Programacao", api: prog };

  const act = ctx?.entities?.Activity || ctx?.db?.Activity || ctx?.db?.entities?.Activity || ctx?.data?.Activity || null;
  if (act) return { name: "Activity", api: act };

  return null;
}

async function findLatestKnowledgeDoc(kdApi: AnyObj): Promise<AnyObj | null> {
  const where = { category: CATEGORY };

  if (typeof kdApi?.findMany === "function") {
    const rows = await kdApi.findMany({ where, orderBy: { created_at: "desc" }, take: 1 });
    return rows?.[0] ?? null;
  }

  if (typeof kdApi?.list === "function") {
    const rows = await kdApi.list({ filter: where, sort: [{ field: "created_at", direction: "desc" }], limit: 1 });
    return rows?.items?.[0] ?? rows?.[0] ?? null;
  }

  if (typeof kdApi?.query === "function") {
    const rows = await kdApi.query({ where, sort: [{ created_at: "desc" }], limit: 1 });
    return rows?.[0] ?? null;
  }

  throw new Error("API de KnowledgeDocument não reconhecida (sem findMany/list/query).");
}

function extractSourceUrlFromReq(req: AnyObj): string | null {
  const q = req?.query ?? {};
  const b = req?.body ?? {};
  const raw = q?.source_url ?? q?.sourceUrl ?? b?.source_url ?? b?.sourceUrl ?? null;
  return raw ? String(raw) : null;
}

function extractModeFromReq(req: AnyObj): "incremental" | "full" {
  const q = req?.query ?? {};
  const b = req?.body ?? {};
  const raw = q?.mode ?? b?.mode ?? null;
  const m = raw ? String(raw).toLowerCase().trim() : "incremental";
  return m === "full" ? "full" : "incremental";
}

function resolveGoogleSheetsToXlsx(url: string): string {
  const u = String(url).trim();
  if (/docs\.google\.com\/spreadsheets\/d\/.+\/export\?/i.test(u)) return u;

  const m = u.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if (!m) return u;

  const id = m[1];
  const gidMatch = u.match(/[?&#]gid=(\d+)/i);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx&gid=${gid}`;
}

async function listOperational(opApi: AnyObj, limit = 100000): Promise<any[]> {
  if (typeof opApi?.findMany === "function") return (await opApi.findMany({ take: limit })) ?? [];
  if (typeof opApi?.list === "function") {
    const res = await opApi.list({ limit });
    return res?.items ?? res ?? [];
  }
  if (typeof opApi?.query === "function") return (await opApi.query({ limit })) ?? [];
  throw new Error("Entity operacional não suporta listagem (findMany/list/query).");
}

async function deleteWhereOperational(opApi: AnyObj, predicate: (it: AnyObj) => boolean): Promise<number> {
  const items = await listOperational(opApi);
  let deleted = 0;

  for (const it of items) {
    if (!predicate(it)) continue;
    const id = it?.id ?? it?._id;
    if (!id) continue;

    if (typeof opApi?.delete === "function") {
      await opApi.delete(id);
      deleted++;
    } else if (typeof opApi?.remove === "function") {
      await opApi.remove(id);
      deleted++;
    } else {
      throw new Error("Entity operacional não suporta delete/remove.");
    }
  }

  return deleted;
}

async function deleteByMonthRanges(opApi: AnyObj, ranges: { startIso: string; endIso: string }[]): Promise<number> {
  if (typeof opApi?.deleteMany === "function") {
    let total = 0;
    for (const r of ranges) {
      try {
        const out = await opApi.deleteMany({ where: { data: { gte: r.startIso, lt: r.endIso } } });
        total += typeof out === "number" ? out : out?.count ?? 0;
      } catch {
        const start = new Date(r.startIso).getTime();
        const end = new Date(r.endIso).getTime();
        total += await deleteWhereOperational(opApi, (it) => {
          const d = it?.data ?? it?.date;
          if (!d) return false;
          const t = Date.parse(String(d));
          if (Number.isNaN(t)) return false;
          return t >= start && t < end;
        });
      }
    }
    return total;
  }

  let total = 0;
  for (const r of ranges) {
    const start = new Date(r.startIso).getTime();
    const end = new Date(r.endIso).getTime();
    total += await deleteWhereOperational(opApi, (it) => {
      const d = it?.data ?? it?.date;
      if (!d) return false;
      const t = Date.parse(String(d));
      if (Number.isNaN(t)) return false;
      return t >= start && t < end;
    });
  }
  return total;
}

async function createManyOperational(opApi: AnyObj, rows: AnyObj[]): Promise<number> {
  if (!rows.length) return 0;

  if (typeof opApi?.createMany === "function") {
    const out = await opApi.createMany({ data: rows });
    return typeof out === "number" ? out : out?.count ?? rows.length;
  }

  if (typeof opApi?.insertMany === "function") {
    const out = await opApi.insertMany(rows);
    return typeof out === "number" ? out : out?.count ?? rows.length;
  }

  let created = 0;
  for (const r of rows) {
    if (typeof opApi?.create === "function") {
      await opApi.create(r);
      created++;
    } else if (typeof opApi?.insert === "function") {
      await opApi.insert(r);
      created++;
    } else {
      throw new Error("Entity operacional não suporta create/insert/createMany/insertMany.");
    }
  }
  return created;
}

function toOperationalRecord(entityName: string, parsed: AnyObj): AnyObj {
  const base: AnyObj = {
    external_key: parsed.external_key,
    equipamento: parsed.equipamento ?? null,
    nome: parsed.nome ?? null,
    sinopse: parsed.sinopse ?? null,
    tipo: parsed.tipo ?? null,
    formato: parsed.formato ?? null,
    data: parsed.data ?? null,
    horario: parsed.horario ?? null,
    publico: parsed.publico ?? null,
    acessibilidade: parsed.acessibilidade ?? null,
    vagas: parsed.vagas ?? null,
    inscricao: parsed.inscricao ?? null,
    contato: parsed.contato ?? null,
    valor: parsed.valor ?? null,
    requisicao: parsed.requisicao ?? null,
    local: parsed.local ?? null,
    source_sheet: parsed.source_sheet ?? null,
    source_row: parsed.source_row ?? null,
    sync_month: parsed.sync_month ?? null,
  };

  if (entityName === "Activity") {
    base.title = base.nome;
    base.description = base.sinopse;
  }

  return base;
}

function expandDatesWithContext(sheetName: string, value: any, debugNotes: string[]): Date[] {
  const direct = parseExcelDateBasic(value);
  if (direct) return [direct];

  const ctx = parseSheetMonthYear(sheetName);
  const str = String(value ?? "").trim();
  if (!ctx || !str) return [];

  const n = str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const matches = [...n.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})/g)];
  if (matches.length) {
    const out: Date[] = [];
    for (const m of matches) {
      const dd = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const d = new Date(ctx.year, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) out.push(d);
    }
    if (out.length) return out;
  }

  const dayMatches = [...n.matchAll(/\b(\d{1,2})\b/g)]
    .map((m) => parseInt(m[1], 10))
    .filter((x) => x >= 1 && x <= 31);

  if (dayMatches.length >= 1 && dayMatches.length <= 6) {
    const uniq = Array.from(new Set(dayMatches));
    const out = uniq.map((dd) => new Date(ctx.year, ctx.month - 1, dd)).filter((d) => !Number.isNaN(d.getTime()));
    if (out.length) {
      debugNotes.push(`Data textual por contexto: "${str}" => ${out.map((d) => d.toISOString().slice(0, 10)).join(", ")}`);
      return out;
    }
  }

  return [];
}

function parseRowsFromSheet(
  sheetName: string,
  matrix: any[][],
  headerRow: number,
  map: Partial<Record<CanonField, number>>,
  entityName: string,
  debug: DebugSheet,
  syncMonth: string
): AnyObj[] {
  const out: AnyObj[] = [];
  const notes: string[] = debug.notes ?? (debug.notes = []);

  const maxCols = Math.max(...matrix.map((r) => r.length), 0);
  const getCell = (row: any[], idx: number | undefined): any => {
    if (idx == null) return null;
    if (idx < 0 || idx >= maxCols) return null;
    return row[idx] ?? null;
  };

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (isProbablyEmptyRow(row)) continue;

    const maybeHeaderAgain = scoreHeaderRow(row).score >= 3;
    if (maybeHeaderAgain) {
      notes.push(`Linha ${r + 1}: possível cabeçalho repetido; ignorado.`);
      continue;
    }

    const nome = asString(getCell(row, map.nome));
    const dataRaw = getCell(row, map.data);
    if (!nome) continue;

    const dates = expandDatesWithContext(sheetName, dataRaw, notes);
    if (!dates.length) continue;

    for (const d of dates) {
      const parsed: AnyObj = {
        equipamento: asString(getCell(row, map.equipamento)) || null,
        nome: nome || null,
        sinopse: asString(getCell(row
