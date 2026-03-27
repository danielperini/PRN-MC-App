/**
 * base44/functions/refreshProgramacao/entry.ts
 *
 * Standalone (SEM imports entre functions) para não quebrar deploy no Base44.
 *
 * Faz:
 *  1) upsert KnowledgeDocument (title fixo) baixando XLSX do Google Sheets
 *  2) sync Programacao (ou Activity fallback) lendo o XLSX e gravando histórico (>= 2024-01 até mês+1)
 *
 * Entrada (Payload / query):
 *  - source_url (obrigatório)
 *  - title (opcional; default "Programação espelhada")
 *  - mode (opcional): history|incremental|full (default history)
 *  - debug (opcional): "1" para debug_sheets mais verboso
 */

import * as XLSX from "xlsx";
import crypto from "node:crypto";

type AnyObj = Record<string, any>;

type UpsertResult = {
  ok: boolean;
  action: "created" | "updated" | "no_change";
  knowledge_document_id: string | null;
  source_url_resolved: string | null;
  file_size_bytes: number;
  file_sha1: string | null;
  errors: string[];
  debug_attempts: Array<{ step: string; ok: boolean; message?: string }>;
};

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
  preview?: {
    firstNonEmptyRows?: any[][];
    detectedHeaderRow?: any[];
  };
};

type SyncResult = {
  ok: boolean;
  total_items: number;
  created: number;
  deleted_previous: number;
  errors: string[];
  debug_sheets: DebugSheet[];
  source_used: "knowledge_document" | "source_url";
  source_url_resolved: string | null;
  knowledge_document_id: string | null;
  diagnostic: {
    mode: "history" | "incremental" | "full";
    debug: boolean;
    sheets_detected_month_year: number;
    sheets_selected: number;
    history_range: { start_ym: string; end_ym_inclusive: string };
  };
};

type RefreshResult = {
  ok: boolean;
  errors: string[];
  steps: {
    upsert: UpsertResult;
    sync: SyncResult;
  };
};

const CATEGORY = "Programação";
const DEFAULT_TITLE = "Programação espelhada";
const DEFAULT_FILENAME = "programacao-espelhada.xlsx";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HISTORY_START_YM = "2024-01";

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

function sha1Buf(buf: Buffer): string {
  return crypto.createHash("sha1").update(buf).digest("hex");
}
function sha1Str(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex");
}

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
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const yy = parseInt(m2[1], 10);
    const mm = parseInt(m2[2], 10);
    const dd = parseInt(m2[3], 10);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const t = Date.parse(str);
  return Number.isNaN(t) ? null : new Date(t);
}

function parseSheetMonthYear(sheetName: string): { year: number; month: number } | null {
  const n = String(sheetName || "")
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

function yyyymm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
function ymToKey(ym: string): number {
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  return y * 100 + m;
}

function startOfMonthUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}
function startOfNextMonthUTC(year: number, month: number): Date {
  return month === 12 ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)) : new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

function shouldSyncMonthIncremental(params: { year: number; month: number; now: Date }): boolean {
  const { year, month, now } = params;
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();

  if (year === nowYear && month === nowMonth) return true;

  const next = nowMonth === 12 ? { y: nowYear + 1, m: 1 } : { y: nowYear, m: nowMonth + 1 };
  return year === next.y && month === next.m && nowDay >= 23;
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

  return !best || best.score < 3 ? null : best;
}

function sheetToMatrix(ws: XLSX.WorkSheet): any[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
}

function buildDedupKey(item: AnyObj): string {
  const parts = [
    normalizeHeader(item.museu ?? item.equipamento ?? ""),
    normalizeHeader(item.titulo ?? item.nome ?? item.title ?? ""),
    item.data_inicio ? String(item.data_inicio).slice(0, 10) : "",
    normalizeHeader(item.horario ?? ""),
    normalizeHeader(item.local ?? ""),
  ];
  return sha1Str(parts.join("|"));
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

async function fetchBinary(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar XLSX: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function pickKnowledgeDocumentApi(ctx: AnyObj): AnyObj {
  return ctx?.entities?.KnowledgeDocument || ctx?.db?.KnowledgeDocument || ctx?.db?.entities?.KnowledgeDocument || ctx?.data?.KnowledgeDocument || null;
}

function pickOperationalEntity(ctx: AnyObj): { name: "Programacao" | "Activity"; api: AnyObj } | null {
  const prog = ctx?.entities?.Programacao || ctx?.db?.Programacao || ctx?.db?.entities?.Programacao || ctx?.data?.Programacao || null;
  if (prog) return { name: "Programacao", api: prog };

  const act = ctx?.entities?.Activity || ctx?.db?.Activity || ctx?.db?.entities?.Activity || ctx?.data?.Activity || null;
  if (act) return { name: "Activity", api: act };

  return null;
}

async function findByCategoryAndTitle(kdApi: AnyObj, title: string): Promise<AnyObj | null> {
  const where = { category: CATEGORY, title };

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

async function updateKnowledgeDoc(kdApi: AnyObj, id: string, data: AnyObj): Promise<any> {
  if (typeof kdApi?.update === "function") return kdApi.update(id, data);
  if (typeof kdApi?.updateOne === "function") return kdApi.updateOne({ id, data });
  if (typeof kdApi?.patch === "function") return kdApi.patch(id, data);
  throw new Error("KnowledgeDocument não suporta update/updateOne/patch.");
}

async function createKnowledgeDoc(kdApi: AnyObj, data: AnyObj): Promise<any> {
  if (typeof kdApi?.create === "function") return kdApi.create(data);
  if (typeof kdApi?.insert === "function") return kdApi.insert(data);
  throw new Error("KnowledgeDocument não suporta create/insert.");
}

async function attachFileWithRetries(params: {
  kdApi: AnyObj;
  id: string;
  title: string;
  sourceUrlResolved: string;
  fileBuf: Buffer;
  filename: string;
  attemptsLog: UpsertResult["debug_attempts"];
}): Promise<{ ok: boolean; message?: string }> {
  const { kdApi, id, title, sourceUrlResolved, fileBuf, filename, attemptsLog } = params;
  const base64 = fileBuf.toString("base64");

  const candidates: Array<{ step: string; run: () => Promise<void> }> = [];

  if (typeof kdApi?.uploadFile === "function") {
    candidates.push({
      step: "uploadFile_then_update:file_url",
      run: async () => {
        const up = await kdApi.uploadFile(fileBuf, { filename, contentType: XLSX_MIME });
        const fileUrl = up?.file_url ?? up?.url ?? up?.fileUrl ?? null;
        if (!fileUrl) throw new Error("uploadFile retornou sem url.");
        await updateKnowledgeDoc(kdApi, id, {
          title,
          category: CATEGORY,
          source_url: sourceUrlResolved,
          file_url: fileUrl,
          file_name: filename,
          file_mime: XLSX_MIME,
        });
      },
    });
  }

  candidates.push(
    {
      step: "update:file_object_base64",
      run: async () => {
        await updateKnowledgeDoc(kdApi, id, {
          title,
          category: CATEGORY,
          source_url: sourceUrlResolved,
          file: { filename, contentType: XLSX_MIME, dataBase64: base64 },
        });
      },
    },
    {
      step: "update:file_object_data",
      run: async () => {
        await updateKnowledgeDoc(kdApi, id, {
          title,
          category: CATEGORY,
          source_url: sourceUrlResolved,
          file: { name: filename, type: XLSX_MIME, data: base64, encoding: "base64" },
        });
      },
    },
    {
      step: "update:attachment_array",
      run: async () => {
        await updateKnowledgeDoc(kdApi, id, {
          title,
          category: CATEGORY,
          source_url: sourceUrlResolved,
          attachments: [{ filename, contentType: XLSX_MIME, dataBase64: base64 }],
        });
      },
    },
    {
      step: "update:file_url_external_only",
      run: async () => {
        await updateKnowledgeDoc(kdApi, id, {
          title,
          category: CATEGORY,
          source_url: sourceUrlResolved,
          file_url: sourceUrlResolved,
          file_name: filename,
          file_mime: XLSX_MIME,
        });
      },
    }
  );

  for (const c of candidates) {
    try {
      await c.run();
      attemptsLog.push({ step: c.step, ok: true });
      return { ok: true };
    } catch (e: any) {
      attemptsLog.push({ step: c.step, ok: false, message: String(e?.message ?? e) });
    }
  }

  return { ok: false, message: "Nenhuma estratégia de anexo/atualização funcionou." };
}

async function upsertKnowledgeDocument(ctx: AnyObj, sourceUrl: string, title: string): Promise<UpsertResult> {
  const errors: string[] = [];
  const debug_attempts: UpsertResult["debug_attempts"] = [];

  const kdApi = pickKnowledgeDocumentApi(ctx);
  if (!kdApi) {
    return {
      ok: false,
      action: "no_change",
      knowledge_document_id: null,
      source_url_resolved: null,
      file_size_bytes: 0,
      file_sha1: null,
      errors: ["Não encontrei a entity KnowledgeDocument no contexto da função."],
      debug_attempts,
    };
  }

  const source_url_resolved = resolveGoogleSheetsToXlsx(sourceUrl);

  let fileBuf: Buffer;
  try {
    debug_attempts.push({ step: "download:xlsx", ok: true, message: source_url_resolved });
    fileBuf = await fetchBinary(source_url_resolved);
  } catch (e: any) {
    return {
      ok: false,
      action: "no_change",
      knowledge_document_id: null,
      source_url_resolved,
      file_size_bytes: 0,
      file_sha1: null,
      errors: [`Falha ao baixar XLSX: ${String(e?.message ?? e)}`],
      debug_attempts,
    };
  }

  const file_size_bytes = fileBuf.length;
  const file_sha1 = sha1Buf(fileBuf);

  let doc: AnyObj | null = null;
  try {
    doc = await findByCategoryAndTitle(kdApi, title);
    debug_attempts.push({ step: "findByCategoryAndTitle", ok: true, message: doc ? "found" : "not_found" });
  } catch (e: any) {
    debug_attempts.push({ step: "findByCategoryAndTitle", ok: false, message: String(e?.message ?? e) });
  }

  let action: UpsertResult["action"] = "no_change";
  let knowledge_document_id: string | null = null;

  try {
    if (!doc) {
      const created = await createKnowledgeDoc(kdApi, {
        title,
        category: CATEGORY,
        source_url: source_url_resolved,
        file_name: DEFAULT_FILENAME,
        file_mime: XLSX_MIME,
        file_sha1,
        file_size_bytes,
      });
      knowledge_document_id = String(created?.id ?? created?._id ?? "") || null;
      if (!knowledge_document_id) throw new Error("Create retornou sem id.");
      action = "created";
      debug_attempts.push({ step: "createKnowledgeDoc", ok: true, message: knowledge_document_id });
    } else {
      knowledge_document_id = String(doc?.id ?? doc?._id ?? "") || null;
      if (!knowledge_document_id) throw new Error("Doc encontrado mas sem id.");
      action = "updated";

      try {
        await updateKnowledgeDoc(kdApi, knowledge_document_id, {
          title,
          category: CATEGORY,
          source_url: source_url_resolved,
          file_name: DEFAULT_FILENAME,
          file_mime: XLSX_MIME,
          file_sha1,
          file_size_bytes,
        });
        debug_attempts.push({ step: "update:metadata", ok: true });
      } catch (e: any) {
        debug_attempts.push({ step: "update:metadata", ok: false, message: String(e?.message ?? e) });
      }
    }
  } catch (e: any) {
    errors.push(String(e?.message ?? e));
    return {
      ok: false,
      action,
      knowledge_document_id,
      source_url_resolved,
      file_size_bytes,
      file_sha1,
      errors,
      debug_attempts,
    };
  }

  const attach = await attachFileWithRetries({
    kdApi,
    id: knowledge_document_id!,
    title,
    sourceUrlResolved: source_url_resolved,
    fileBuf,
    filename: DEFAULT_FILENAME,
    attemptsLog: debug_attempts,
  });

  if (!attach.ok) errors.push(attach.message ?? "Falha ao anexar arquivo.");

  return {
    ok: errors.length === 0,
    action,
    knowledge_document_id,
    source_url_resolved,
    file_size_bytes,
    file_sha1,
    errors,
    debug_attempts,
  };
}

function expandDatesWithContext(sheetName: string, value: any, debugNotes: string[]): Date[] {
  const direct = parseExcelDateBasic(value);
  if (direct) return [direct];

  const ctx = parseSheetMonthYear(sheetName);
  const str = String(value ?? "").trim();
  if (!ctx || !str) return [];

  const n = str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

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

  const dayMatches = [...n.matchAll(/\b(\d{1,2})\b/g)].map((m) => parseInt(m[1], 10)).filter((x) => x >= 1 && x <= 31);
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

function toProgramacaoRecord(parsed: AnyObj): AnyObj {
  const museu = (parsed.equipamento || "").trim() || "Externo";
  const titulo = parsed.nome || null;
  const dataInicioIso = parsed.data || null;

  const rec: AnyObj = {
    origem: "Planilha Programação (KD)",
    ativo: true,
    nome_acao: parsed.nome ?? null,
    titulo,
    data: dataInicioIso ? String(dataInicioIso).slice(0, 10) : null,
    data_inicio: dataInicioIso,
    data_fim: dataInicioIso,
    horario: parsed.horario ?? null,
    museu,
    equipamento: museu,
    local: parsed.local ?? null,
    descricao: parsed.sinopse ?? null,
    sinopse: parsed.sinopse ?? null,
    tipo: parsed.tipo ?? null,
    tipo_atividade: parsed.tipo ?? null,
    formato: parsed.formato ?? null,
    publico: parsed.publico ?? null,
    vagas: parsed.vagas != null ? String(parsed.vagas) : null,
    acessibilidade: parsed.acessibilidade ?? null,
    inscricao: parsed.inscricao ?? null,
    link_inscricao: parsed.inscricao ?? null,
    responsavel: parsed.contato ?? null,
    status: "CONFIRMADA",
    source_sheet: parsed.source_sheet ?? null,
    source_row: parsed.source_row ?? null,
    sync_month: parsed.sync_month ?? null,
  };

  rec.external_key = buildDedupKey(rec);
  return rec;
}

function toActivityRecord(parsed: AnyObj): AnyObj {
  const rec: AnyObj = {
    title: parsed.nome ?? null,
    description: parsed.sinopse ?? null,
    data_realizacao: parsed.data ?? null,
    horario: parsed.horario ?? null,
    local: parsed.local ?? null,
    equipamento: parsed.equipamento ?? null,
    origem: "Planilha Programação (KD)",
    source_sheet: parsed.source_sheet ?? null,
    source_row: parsed.source_row ?? null,
    sync_month: parsed.sync_month ?? null,
  };
  rec.external_key = buildDedupKey(rec);
  return rec;
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
  if (!ranges.length) return 0;

  if (typeof opApi?.deleteMany === "function") {
    let total = 0;
    for (const r of ranges) {
      try {
        const out = await opApi.deleteMany({ where: { data_inicio: { gte: r.startIso, lt: r.endIso } } });
        total += typeof out === "number" ? out : out?.count ?? 0;
      } catch {
        const start = new Date(r.startIso).getTime();
        const end = new Date(r.endIso).getTime();
        total += await deleteWhereOperational(opApi, (it) => {
          const d = it?.data_inicio ?? it?.data ?? it?.date;
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
      const d = it?.data_inicio ?? it?.data ?? it?.date;
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

async function syncProgramacaoFromXlsx(
  ctx: AnyObj,
  xlsxBuf: Buffer,
  mode: "history" | "incremental" | "full",
  debug: boolean,
  source_meta: { source_used: "knowledge_document" | "source_url"; source_url_resolved: string | null; knowledge_document_id: string | null }
): Promise<SyncResult> {
  const errors: string[] = [];
  const debug_sheets: DebugSheet[] = [];

  const operational = pickOperationalEntity(ctx);
  if (!operational) {
    return {
      ok: false,
      total_items: 0,
      created: 0,
      deleted_previous: 0,
      errors: ['Não encontrei entity "Programacao" nem "Activity" no projeto.'],
      debug_sheets,
      ...source_meta,
      diagnostic: {
        mode,
        debug,
        sheets_detected_month_year: 0,
        sheets_selected: 0,
        history_range: { start_ym: HISTORY_START_YM, end_ym_inclusive: "unknown" },
      },
    };
  }

  const workbook = XLSX.read(xlsxBuf, { type: "buffer", cellDates: true, cellText: false });

  const now = new Date();
  const nextYm = (() => {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return yyyymm(ny, nm);
  })();

  const monthSheets: Array<{ name: string; ym: string; year: number; month: number; key: number }> = [];
  for (const sheetName of workbook.SheetNames) {
    const my = parseSheetMonthYear(sheetName);
    if (!my) {
      debug_sheets.push({ sheet: sheetName, used: false, notes: ["Nome da aba não reconhecido como mês/ano; ignorada."], errors: [] });
      continue;
    }
    const ym = yyyymm(my.year, my.month);
    monthSheets.push({ name: sheetName, ym, year: my.year, month: my.month, key: ymToKey(ym) });
  }

  let sheetsToProcess: Array<{ name: string; ym: string; year: number; month: number }> = [];

  if (mode === "full") {
    sheetsToProcess = monthSheets.map((s) => ({ name: s.name, ym: s.ym, year: s.year, month: s.month }));
  } else if (mode === "incremental") {
    for (const s of monthSheets) {
      if (shouldSyncMonthIncremental({ year: s.year, month: s.month, now })) sheetsToProcess.push({ name: s.name, ym: s.ym, year: s.year, month: s.month });
    }
  } else {
    const startKey = ymToKey(HISTORY_START_YM);
    const endKey = ymToKey(nextYm);
    for (const s of monthSheets) {
      if (s.key >= startKey && s.key <= endKey) sheetsToProcess.push({ name: s.name, ym: s.ym, year: s.year, month: s.month });
    }
    if (!sheetsToProcess.length && monthSheets.length) {
      sheetsToProcess = monthSheets.map((s) => ({ name: s.name, ym: s.ym, year: s.year, month: s.month }));
      debug_sheets.push({ sheet: "__fallback__", used: true, notes: ["FALLBACK: history sem meses; usando full."], errors: [] });
    }
  }

  const targetMonthRanges: { startIso: string; endIso: string }[] = [];
  const uniqYm = Array.from(new Set(sheetsToProcess.map((s) => s.ym)));
  for (const ym of uniqYm) {
    const [yy, mm] = ym.split("-").map((x) => parseInt(x, 10));
    targetMonthRanges.push({ startIso: startOfMonthUTC(yy, mm).toISOString(), endIso: startOfNextMonthUTC(yy, mm).toISOString() });
  }

  const allItems: AnyObj[] = [];
  const seen = new Set<string>();

  for (const s of sheetsToProcess) {
    const ws = workbook.Sheets[s.name];
    const dbg: DebugSheet = { sheet: s.name, used: false, errors: [], notes: [], syncMonth: s.ym };

    if (!ws) {
      dbg.errors?.push("Worksheet inexistente no workbook.");
      debug_sheets.push(dbg);
      continue;
    }

    const matrix = sheetToMatrix(ws);
    dbg.rowsSeen = matrix.length;

    if (debug) {
      const firstNonEmpty: any[][] = [];
      for (let i = 0; i < Math.min(matrix.length, 40); i++) {
        if (!isProbablyEmptyRow(matrix[i] ?? [])) firstNonEmpty.push((matrix[i] ?? []).slice(0, 20));
        if (firstNonEmpty.length >= 8) break;
      }
      dbg.preview = { firstNonEmptyRows: firstNonEmpty };
    }

    const best = findBestHeader(matrix);
    if (!best) {
      dbg.used = false;
      dbg.notes?.push("Cabeçalho não detectado (precisa 'Nome/Atividade' + 'Data').");
      debug_sheets.push(dbg);
      continue;
    }

    dbg.used = true;
    dbg.headerRow = best.headerRow + 1;
    dbg.headerScore = best.score;
    dbg.mappedColumns = Object.fromEntries(Object.entries(best.map).map(([k, v]) => [k, (v as number) + 1]));

    if (debug) {
      dbg.preview = dbg.preview ?? {};
      dbg.preview.detectedHeaderRow = (matrix[best.headerRow] ?? []).slice(0, 30);
    }

    const notes: string[] = dbg.notes ?? (dbg.notes = []);

    const maxCols = Math.max(...matrix.map((r) => r.length), 0);
    const getCell = (row: any[], idx: number | undefined): any => {
      if (idx == null) return null;
      if (idx < 0 || idx >= maxCols) return null;
      return row[idx] ?? null;
    };

    let rowsParsed = 0;
    let kept = 0;

    for (let r = best.headerRow + 1; r < matrix.length; r++) {
      const row = matrix[r] ?? [];
      if (isProbablyEmptyRow(row)) continue;

      const nome = asString(getCell(row, best.map.nome));
      const dataRaw = getCell(row, best.map.data);
      if (!nome) continue;

      const dates = expandDatesWithContext(s.name, dataRaw, notes);
      if (!dates.length) continue;

      for (const d of dates) {
        const parsed: AnyObj = {
          equipamento: asString(getCell(row, best.map.equipamento)) || null,
          nome,
          sinopse: asString(getCell(row, best.map.sinopse)) || null,
          tipo: asString(getCell(row, best.map.tipo)) || null,
          formato: asString(getCell(row, best.map.formato)) || null,
          data: d.toISOString(),
          horario: asString(getCell(row, best.map.horario)) || null,
          publico: asString(getCell(row, best.map.publico)) || null,
          acessibilidade: asString(getCell(row, best.map.acessibilidade)) || null,
          vagas: toNullableNumber(getCell(row, best.map.vagas)),
          inscricao: asString(getCell(row, best.map.inscricao)) || null,
          contato: asString(getCell(row, best.map.contato)) || null,
          valor: asString(getCell(row, best.map.valor)) || null,
          requisicao: asString(getCell(row, best.map.requisicao)) || null,
          local: asString(getCell(row, best.map.local)) || null,
          source_sheet: s.name,
          source_row: r + 1,
          sync_month: s.ym,
        };

        const rec = operational.name === "Programacao" ? toProgramacaoRecord(parsed) : toActivityRecord(parsed);
        const key = String(rec.external_key ?? "");
        rowsParsed++;

        if (!key) continue;
        if (seen.has(key)) continue;

        seen.add(key);
        allItems.push(rec);
        kept++;
      }
    }

    dbg.rowsParsed = rowsParsed;
    dbg.rowsKept = kept;
    debug_sheets.push(dbg);
  }

  if (allItems.length === 0) {
    errors.push(
      "Nenhum registro lido do XLSX. Rode com debug=1 e veja debug_sheets.preview para identificar cabeçalho/abas/datas."
    );
  }

  let deleted_previous = 0;
  try {
    deleted_previous = await deleteByMonthRanges(operational.api, targetMonthRanges);
  } catch (e: any) {
    errors.push(`Falha ao apagar registros anteriores (por range): ${String(e?.message ?? e)}`);
  }

  let created = 0;
  try {
    created = await createManyOperational(operational.api, allItems);
  } catch (e: any) {
    errors.push(`Falha ao criar registros: ${String(e?.message ?? e)}`);
  }

  return {
    ok: errors.length === 0,
    total_items: allItems.length,
    created,
    deleted_previous,
    errors,
    debug_sheets,
    ...source_meta,
    diagnostic: {
      mode,
      debug,
      sheets_detected_month_year: monthSheets.length,
      sheets_selected: sheetsToProcess.length,
      history_range: { start_ym: HISTORY_START_YM, end_ym_inclusive: nextYm },
    },
  };
}

function extractParam(req: AnyObj, key: string): string | null {
  const q = req?.query ?? {};
  const b = req?.body ?? {};
  const v = q?.[key] ?? b?.[key] ?? null;
  return v == null ? null : String(v);
}

export default async function entry(context: AnyObj, req: AnyObj): Promise<any> {
  const errors: string[] = [];

  const source_url = extractParam(req, "source_url") ?? extractParam(req, "sourceUrl");
  const title = extractParam(req, "title") ?? DEFAULT_TITLE;
  const modeRaw = (extractParam(req, "mode") ?? "history").toLowerCase().trim();
  const debug = (() => {
    const d = (extractParam(req, "debug") ?? "0").toLowerCase().trim();
    return d === "1" || d === "true" || d === "yes";
  })();

  const mode: "history" | "incremental" | "full" =
    modeRaw === "full" ? "full" : modeRaw === "incremental" ? "incremental" : "history";

  if (!source_url) {
    const payload: RefreshResult = {
      ok: false,
      errors: ['Parâmetro obrigatório ausente: "source_url".'],
      steps: {
        upsert: {
          ok: false,
          action: "no_change",
          knowledge_document_id: null,
          source_url_resolved: null,
          file_size_bytes: 0,
          file_sha1: null,
          errors: ['Parâmetro obrigatório ausente: "source_url".'],
          debug_attempts: [],
        },
        sync: {
          ok: false,
          total_items: 0,
          created: 0,
          deleted_previous: 0,
          errors: ['Parâmetro obrigatório ausente: "source_url".'],
          debug_sheets: [],
          source_used: "source_url",
          source_url_resolved: null,
          knowledge_document_id: null,
          diagnostic: {
            mode,
            debug,
            sheets_detected_month_year: 0,
            sheets_selected: 0,
            history_range: { start_ym: HISTORY_START_YM, end_ym_inclusive: "unknown" },
          },
        },
      },
    };

    if (context?.res !== undefined) {
      context.res = { status: 400, headers: { "content-type": "application/json; charset=utf-8" }, body: payload };
      return;
    }
    return payload;
  }

  // 1) Upsert KD
  const upsertOut = await upsertKnowledgeDocument(context, source_url, title);
  if (!upsertOut.ok) errors.push(...upsertOut.errors.map(String));

  // 2) Sync Programacao (usa sempre o XLSX baixado do source_url para evitar depender do KD bug)
  const xlsxResolved = upsertOut.source_url_resolved ?? resolveGoogleSheetsToXlsx(source_url);
  let xlsxBuf: Buffer;
  try {
    xlsxBuf = await fetchBinary(xlsxResolved);
  } catch (e: any) {
    const syncFail: SyncResult = {
      ok: false,
      total_items: 0,
      created: 0,
      deleted_previous: 0,
      errors: [`Falha ao baixar XLSX para sync: ${String(e?.message ?? e)}`],
      debug_sheets: [],
      source_used: "source_url",
      source_url_resolved: xlsxResolved,
      knowledge_document_id: upsertOut.knowledge_document_id,
      diagnostic: {
        mode,
        debug,
        sheets_detected_month_year: 0,
        sheets_selected: 0,
        history_range: { start_ym: HISTORY_START_YM, end_ym_inclusive: "unknown" },
      },
    };

    const payload: RefreshResult = {
      ok: false,
      errors: [...errors, ...syncFail.errors],
      steps: { upsert: upsertOut, sync: syncFail },
    };

    if (context?.res !== undefined) {
      context.res = { status: 500, headers: { "content-type": "application/json; charset=utf-8" }, body: payload };
      return;
    }
    return payload;
  }

  const syncOut = await syncProgramacaoFromXlsx(context, xlsxBuf, mode, debug, {
    source_used: "source_url",
    source_url_resolved: xlsxResolved,
    knowledge_document_id: upsertOut.knowledge_document_id,
  });

  if (!syncOut.ok) errors.push(...syncOut.errors.map(String));

  const payload: RefreshResult = {
    ok: errors.length === 0,
    errors,
    steps: { upsert: upsertOut, sync: syncOut },
  };

  if (context?.res !== undefined) {
    context.res = { status: payload.ok ? 200 : 500, headers: { "content-type": "application/json; charset=utf-8" }, body: payload };
    return;
  }
  return payload;
}
