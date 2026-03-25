import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toArray(result: any) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

function getDocDate(doc: any) {
  return (
    doc?.created_date ||
    doc?.created_at ||
    doc?.updated_at ||
    doc?.updated_date ||
    ''
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { ok: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    let body: any = {};
    if (req.method !== 'GET') {
      body = await req.json().catch(() => ({}));
    }

    const limit = Number(body?.limit || body?.args?.limit || 200);

    const result = await base44.asServiceRole.entities.KnowledgeDocument.list(
      '-created_date',
      limit
    );

    const docs = toArray(result);

    const isCoordinator =
      user?.role === 'admin' ||
      user?.role === 'COORDENADOR' ||
      user?.email === 'daniel@periniprojetos.com.br' ||
      user?.email === 'danielperini.mc@vidadutodasartes.org.br';

    const filtered = docs
      .filter((doc: any) => {
        const ownerEmail =
          doc?.uploaded_by_email ||
          doc?.created_by_email ||
          '';

        const isOwner = ownerEmail === user.email;

        return isOwner || isCoordinator;
      })
      .sort((a: any, b: any) => {
        const da = new Date(getDocDate(a)).getTime() || 0;
        const db = new Date(getDocDate(b)).getTime() || 0;
        return db - da;
      });

    return Response.json({
      ok: true,
      items: filtered,
      total: filtered.length,
    });
  } catch (error: any) {
    console.error('Erro em listKnowledgeDocuments:', error);

    return Response.json(
      {
        ok: false,
        error: error?.message || 'Erro ao listar documentos.',
      },
      { status: 500 }
    );
  }
});
