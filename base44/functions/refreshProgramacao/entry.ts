/**
 * base44/functions/refreshProgramacao/entry.ts
 *
 * Sequência:
 *  1) upsertKnowledgeProgramacao
 *  2) syncProgramacao
 *
 * Agora repassa debug=1 e devolve os erros explicitamente.
 */

type AnyObj = Record<string, any>;

import upsertKnowledgeProgramacao from "../upsertKnowledgeProgramacao/entry";
import syncProgramacao from "../syncProgramacao/entry";

type RefreshResult = {
  ok: boolean;
  errors: string[];
  steps: {
    upsert: any;
    sync: any;
  };
};

function extractParam(req: AnyObj, key: string): string | null {
  const q = req?.query ?? {};
  const b = req?.body ?? {};
  const v = q?.[key] ?? b?.[key] ?? null;
  return v == null ? null : String(v);
}

function makeSubContext(parent: AnyObj): AnyObj {
  const sub: AnyObj = {};
  for (const k of Object.keys(parent ?? {})) sub[k] = parent[k];
  delete sub.res;
  return sub;
}

function buildReqLike(originalReq: AnyObj, patch: AnyObj): AnyObj {
  const q = { ...(originalReq?.query ?? {}), ...(patch?.query ?? {}) };
  const b = { ...(originalReq?.body ?? {}), ...(patch?.body ?? {}) };
  return { ...(originalReq ?? {}), query: q, body: b };
}

export default async function entry(context: AnyObj, req: AnyObj): Promise<any> {
  const errors: string[] = [];

  try {
    const sourceUrl = extractParam(req, "source_url") ?? extractParam(req, "sourceUrl");
    const title = extractParam(req, "title") ?? "Programação espelhada";
    const mode = (extractParam(req, "mode") ?? "history").toLowerCase();
    const debug = extractParam(req, "debug") ?? "0";

    if (!sourceUrl) throw new Error('Parâmetro obrigatório ausente: "source_url" (query ou body).');

    const upsertCtx = makeSubContext(context);
    const upsertReq = buildReqLike(req, {
      query: { source_url: sourceUrl, title },
      body: { source_url: sourceUrl, title },
    });

    const upsertOut = await upsertKnowledgeProgramacao(upsertCtx, upsertReq);
    if (!upsertOut?.ok) {
      errors.push("Falha no upsertKnowledgeProgramacao.");
      if (Array.isArray(upsertOut?.errors)) errors.push(...upsertOut.errors.map((x: any) => String(x)));
    }

    const syncCtx = makeSubContext(context);
    const syncReq = buildReqLike(req, {
      query: { source_url: sourceUrl, mode, debug },
      body: { source_url: sourceUrl, mode, debug },
    });

    const syncOut = await syncProgramacao(syncCtx, syncReq);
    if (!syncOut?.ok) {
      errors.push("Falha no syncProgramacao.");
      if (Array.isArray(syncOut?.errors)) errors.push(...syncOut.errors.map((x: any) => String(x)));
    }

    const payload: RefreshResult = {
      ok: errors.length === 0,
      errors,
      steps: { upsert: upsertOut, sync: syncOut },
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

    const payload: RefreshResult = { ok: false, errors, steps: { upsert: null, sync: null } };

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
