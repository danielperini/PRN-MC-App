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
    doc?.updated_date ||
    doc?.updated_at ||
    ''
  );
}

function normalizeDoc(doc: any) {
  return {
    id: doc?.id || '',
    title: doc?.title || doc?.name || doc?.file_name || '',
    name: doc?.name || doc?.title || '',
    file_name: doc?.file_name || doc?.filename || '',
    file_url: doc?.file_url || doc?.url || doc?.document_url || '',
    mime_type: doc?.mime_type || '',
    categoria: doc?.categoria || doc?.category || '',
    descricao: doc?.descricao || doc?.description || '',
    summary: doc?.summary || '',
    status: doc?.status || '',
    processing_status: doc?.processing_status || '',
    created_date: doc?.created_date || doc?.created_at || '',
    updated_date: doc?.updated_date || doc?.updated_at || '',
    uploaded_by_email: doc?.uploaded_by_email || '',
    created_by_email: doc?.created_by_email || '',
    uploaded_by: doc?.uploaded_by || '',
    created_by: doc?.created_by || '',
    uploaded_by_id: doc?.uploaded_by_id || '',
    created_by_id: doc?.created_by_id || '',
    tags: Array.isArray(doc?.tags) ? doc.tags : [],
  };
}

function isCoordinator(user: any) {
  return (
    user?.role === 'admin' ||
    user?.role === 'ADMIN' ||
    user?.role === 'COORDENADOR' ||
    user?.can_manage_users === true ||
    user?.email === 'daniel@periniprojetos.com.br' ||
    user?.email === 'danielperini.mc@vidadutodasartes.org.br'
  );
}

function isOwner(doc: any, user: any) {
  const userEmail = String(user?.email || '').trim().toLowerCase();
  const userId = String(user?.id || '').trim();

  const candidateEmails = [
    doc?.uploaded_by_email,
    doc?.created_by_email,
  ]
    .map((v: any) => String(v || '').trim().toLowerCase())
    .filter(Boolean);

  const candidateIds = [
    doc?.uploaded_by_id,
    doc?.created_by_id,
    doc?.uploaded_by,
    doc?.created_by,
  ]
    .map((v: any) => String(v || '').trim())
    .filter(Boolean);

  if (userEmail && candidateEmails.includes(userEmail)) return true;
  if (userId && candidateIds.includes(userId)) return true;

  return false;
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

    const docs = toArray(result).map(normalizeDoc);
    const coord = isCoordinator(user);

    const filtered = docs
      .filter((doc: any) => {
        if (coord) return true;

        const hasOwnershipMetadata =
          !!doc?.uploaded_by_email ||
          !!doc?.created_by_email ||
          !!doc?.uploaded_by ||
          !!doc?.created_by ||
          !!doc?.uploaded_by_id ||
          !!doc?.created_by_id;

        if (!hasOwnershipMetadata) {
          return true;
        }

        return isOwner(doc, user);
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
