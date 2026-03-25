import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit || body?.args?.limit || 200);

    const result = await base44.asServiceRole.entities.KnowledgeDocument.list(
      '-created_date',
      limit
    );

    const docs = Array.isArray(result)
      ? result
      : Array.isArray(result?.items)
        ? result.items
        : [];

    const filtered = docs.filter((doc: any) => {
      const ownerEmail =
        doc?.uploaded_by_email ||
        doc?.created_by_email ||
        '';

      const isOwner = ownerEmail === user.email;
      const isCoordinator =
        user?.role === 'admin' ||
        user?.role === 'COORDENADOR' ||
        user?.email === 'daniel@periniprojetos.com.br' ||
        user?.email === 'danielperini.mc@vidadutodasartes.org.br';

      return isOwner || isCoordinator;
    });

    return Response.json({
      ok: true,
      items: filtered,
      total: filtered.length,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || 'Erro ao listar documentos.',
      },
      { status: 500 }
    );
  }
});
