/**
 * base44/functions/upsertKnowledgeProgramacao/entry.ts
 *
 * Objetivo:
 * - Contornar bug do "adicionar arquivo" no KnowledgeDocument
 * - Baixar XLSX do Google Sheets/Drive (source_url)
 * - Criar ou atualizar KnowledgeDocument (categoria "Programação")
 * - Anexar/subir o arquivo para que exista file_url válido na base
 *
 * Entrada:
 * - source_url via req.query.source_url ou req.body.source_url
 * - (opcional) title via req.query.title/req.body.title (default: "Programação espelhada")
 *
 * Saída (diagnóstico):
 * - ok, action, knowledge_document_id, source_url_resolved, file_size_bytes, errors, debug_attempts
 */

import crypto from "node:crypto";

type AnyObj = Record<string, any>;

type ResultJson = {
  ok: boolean;
  action: "created" | "updated" | "no_change";
  knowledge_document_id: string | null;
  source_url_resolved: string | null;
  file_size_bytes: number;
  file_sha1: string | null;
  errors: string[];
  debug_attempts: Array<{
    step: string;
    ok: boolean;
    message?: string;
  }>;
};

const CATEGORY = "Programação";
const DEFAULT_TITLE = "Programação espelhada";
const DEFAULT_FILENAME = "programacao-espelhada.xlsx";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function sha1(buf: Buffer): string {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function pickKnowledgeDocumentApi(ctx: AnyObj): AnyObj {
  return (
    ctx?.entities?.KnowledgeDocument ||
    ctx?.db?.KnowledgeDocument ||
    ctx?.db?.entities?.KnowledgeDocument ||
    ctx?.data?.KnowledgeDocument ||
    null
  );
}

function extractParam(req: AnyObj, key: string): string | null {
  const q = req?.query ?? {};
  const b = req?.body ?? {};
  const v = q?.[key] ?? b?.[key] ?? null;
  return v == null ? null : String(v);
}

function resolveGoogleSheetsToXlsx(url: string): string {
  const u = String(url).trim();

  // Already export? keep
  if (/docs\.google\.com\/spreadsheets\/d\/.+\/export\?/i.test(u)) return u;

  // Typical:
  // https://docs.google.com/spreadsheets/d/<ID>/edit?gid=<GID>#gid=<GID>
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

async function findLatestKnowledgeDoc(kdApi: AnyObj): Promise<AnyObj | null> {
  const where = { category: CATEGORY };

  if (typeof kdApi?.findMany === "function") {
    const rows = await kdApi.findMany({ where, orderBy: { created_at: "desc" }, take: 1 });
    return rows?.[0] ?? null;
  }

  if (typeof kdApi?.list === "function") {
    const rows = await kdApi.list({
      filter: where,
      sort: [{ field: "created_at", direction: "desc" }],
      limit: 1,
    });
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

/**
 * Tenta anexar arquivo em várias formas comuns.
 * A ideia é “bater” com o formato esperado pelo runtime do Base44.
 */
async function attachFileWithRetries(params: {
  kdApi: AnyObj;
  id: string;
  title: string;
  sourceUrlResolved: string;
  fileBuf: Buffer;
  filename: string;
  attemptsLog: ResultJson["debug_attempts"];
}): Promise<{ ok: boolean; message?: string }> {
  const { kdApi, id, title, sourceUrlResolved, fileBuf, filename, attemptsLog } = params;

  const base64 = fileBuf.toString("base64");

  const candidates: Array<{ step: string; build: () => AnyObj }> = [
    {
      step: "update:file_object_base64",
      build: () => ({
        title,
        category: CATEGORY,
        source_url: sourceUrlResolved,
        file: {
          filename,
          contentType: XLSX_MIME,
          dataBase64: base64,
        },
      }),
    },
    {
      step: "update:file_object_data",
      build: () => ({
        title,
        category: CATEGORY,
        source_url: sourceUrlResolved,
        file: {
          name: filename,
          type: XLSX_MIME,
          data: base64,
          encoding: "base64",
        },
      }),
    },
    {
      step: "update:attachment_array",
      build: () => ({
        title,
        category: CATEGORY,
        source_url: sourceUrlResolved,
        attachments: [
          {
            filename,
            contentType: XLSX_MIME,
            dataBase64: base64,
          },
        ],
      }),
    },
    {
      step: "update:file_url_external_only",
      build: () => ({
        title,
        category: CATEGORY,
        source_url: sourceUrlResolved,
        file_url: sourceUrlResolved,
        file_name: filename,
        file_mime: XLSX_MIME,
      }),
    },
  ];

  // Métodos alternativos (quando existe upload separado)
  if (typeof kdApi?.uploadFile === "function") {
    candidates.unshift({
      step: "uploadFile_then_update:file_url",
      build: () => ({ __useUploadMethod: true }),
    });
  }

  for (const c of candidates) {
    try {
      if (c.step === "uploadFile_then_update:file_url") {
        // uploadFile(buffer, meta) -> retorna url/id
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

        attemptsLog.push({ step: c.step, ok: true });
        return { ok: true };
      }

      await updateKnowledgeDoc(kdApi, id, c.build());
      attemptsLog.push({ step: c.step, ok: true });
      return { ok: true };
    } catch (e: any) {
      attemptsLog.push({ step: c.step, ok: false, message: String(e?.message ?? e) });
    }
  }

  return { ok: false, message: "Nenhuma estratégia de anexo/atualização funcionou." };
}

export default async function entry(context: AnyObj, req: AnyObj): Promise<any> {
  const errors: string[] = [];
  const debug_attempts: ResultJson["debug_attempts"] = [];

  let knowledge_document_id: string | null = null;
  let action: ResultJson["action"] = "no_change";
  let source_url_resolved: string | null = null;

  try {
    const kdApi = pickKnowledgeDocumentApi(context);
    if (!kdApi) throw new Error("Não encontrei a entity KnowledgeDocument no contexto da função.");

    const sourceUrl = extractParam(req, "source_url") ?? extractParam(req, "sourceUrl");
    const title = extractParam(req, "title") ?? DEFAULT_TITLE;

    if (!sourceUrl) {
      throw new Error('Parâmetro obrigatório ausente: "source_url" (query ou body).');
    }

    source_url_resolved = resolveGoogleSheetsToXlsx(sourceUrl);

    debug_attempts.push({ step: "download:xlsx", ok: true, message: source_url_resolved });
    const fileBuf = await fetchBinary(source_url_resolved);

    const file_size_bytes = fileBuf.length;
    const file_sha1 = sha1(fileBuf);

    // 1) tenta achar doc mais recente da categoria
    let doc = null as AnyObj | null;
    try {
      doc = await findLatestKnowledgeDoc(kdApi);
      debug_attempts.push({ step: "findLatestKnowledgeDoc", ok: true, message: doc ? "found" : "not_found" });
    } catch (e: any) {
      debug_attempts.push({ step: "findLatestKnowledgeDoc", ok: false, message: String(e?.message ?? e) });
    }

    // 2) cria se não existir
    if (!doc) {
      try {
        const created = await createKnowledgeDoc(kdApi, {
          title,
          category: CATEGORY,
          source_url: source_url_resolved,
          file_name: DEFAULT_FILENAME,
          file_mime: XLSX_MIME,
        });
        knowledge_document_id = String(created?.id ?? created?._id ?? "") || null;
        if (!knowledge_document_id) throw new Error("Create retornou sem id.");

        action = "created";
        debug_attempts.push({ step: "createKnowledgeDoc", ok: true, message: knowledge_document_id });
        doc = created;
      } catch (e: any) {
        throw new Error(`Falha ao criar KnowledgeDocument: ${String(e?.message ?? e)}`);
      }
    } else {
      knowledge_document_id = String(doc?.id ?? doc?._id ?? "") || null;
      action = "updated";
    }

    if (!knowledge_document_id) {
      throw new Error("Não foi possível obter knowledge_document_id.");
    }

    // 3) anexa o arquivo (multi-estratégia)
    const attach = await attachFileWithRetries({
      kdApi,
      id: knowledge_document_id,
      title,
      sourceUrlResolved: source_url_resolved,
      fileBuf,
      filename: DEFAULT_FILENAME,
      attemptsLog: debug_attempts,
    });

    if (!attach.ok) {
      errors.push(attach.message ?? "Falha ao anexar arquivo.");
    }

    const payload: ResultJson = {
      ok: errors.length === 0,
      action,
      knowledge_document_id,
      source_url_resolved,
      file_size_bytes,
      file_sha1,
      errors,
      debug_attempts,
    };

    if (context?.res !== undefined) {
      context.res = {
        status: payload.ok ? 200 : 500,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: payload,
      };
      return;
    }

    return payload;
  } catch (e: any) {
    errors.push(String(e?.message ?? e));

    const payload: ResultJson = {
      ok: false,
      action,
      knowledge_document_id,
      source_url_resolved,
      file_size_bytes: 0,
      file_sha1: null,
      errors,
      debug_attempts,
    };

    if (context?.res !== undefined) {
      context.res = {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: payload,
      };
      return;
    }

    return payload;
  }
}
