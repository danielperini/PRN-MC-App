import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const CATEGORY = 'Programação';
const DEFAULT_TITLE = 'Programação espelhada';

function resolveGoogleSheetsToXlsx(url: string): string {
  const u = String(url).trim();
  if (/docs\.google\.com\/spreadsheets\/d\/.+\/export\?/i.test(u)) return u;
  const m = u.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if (!m) return u;
  const id = m[1];
  const gidMatch = u.match(/[?&#]gid=(\d+)/i);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx&gid=${gid}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || String(user.role || '').toUpperCase() !== 'ADMIN') {
      return Response.json({ ok: false, error: 'Apenas admin' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const sourceUrl = String(body?.source_url || body?.sourceUrl || body?.query?.source_url || '').trim();
    const title = String(body?.title || DEFAULT_TITLE).trim();

    if (!sourceUrl) {
      return Response.json({ ok: false, error: 'source_url obrigatório' }, { status: 400 });
    }

    const resolved = resolveGoogleSheetsToXlsx(sourceUrl);

    // Procura KnowledgeDocument existente (category + title)
    const existentes = await base44.asServiceRole.entities.KnowledgeDocument.filter(
      { category: CATEGORY, title },
      '-created_date',
      1,
    ).catch(() => []);

    const existing = Array.isArray(existentes) ? existentes[0] : null;

    const payload: any = {
      title,
      category: CATEGORY,
      source_url: resolved,
      file_name: 'programacao-espelhada.xlsx',
    };

    let action = 'no_change';
    let knowledge_document_id = existing?.id || null;

    if (existing?.id) {
      await base44.asServiceRole.entities.KnowledgeDocument.update(existing.id, payload);
      action = 'updated';
    } else {
      const created: any = await base44.asServiceRole.entities.KnowledgeDocument.create({
        ...payload,
        file_mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      knowledge_document_id = created?.id || null;
      action = 'created';
    }

    return Response.json({
      ok: true,
      action,
      knowledge_document_id,
      source_url_resolved: resolved,
      errors: [],
    });
  } catch (error: any) {
    console.error('[upsertKnowledgeProgramacao] erro:', error);
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});