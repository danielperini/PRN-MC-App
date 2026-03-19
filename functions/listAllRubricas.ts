import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function listAll(entityApi, orderBy = '', pageSize = 200) {
  let all = [];
  let page = 0;

  while (true) {
    const batch = await entityApi.list(orderBy, pageSize, page * pageSize);

    if (!batch || batch.length === 0) break;

    all = all.concat(batch);

    if (batch.length < pageSize) break;
    page++;
  }

  return all;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const rubricas = await listAll(
      base44.asServiceRole.entities.Rubrica,
      'ordem_exibicao',
      200
    );

    return Response.json({
      success: true,
      total: rubricas.length,
      rubricas
    });
  } catch (error) {
    console.error('listAllRubricas error:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
});
