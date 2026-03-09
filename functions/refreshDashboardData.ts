import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const reports = await base44.asServiceRole.entities.Report.list();

    return Response.json({
      ok: true,
      step: 'leitura da entidade',
      total: reports.length,
      first: reports.length > 0 ? reports[0] : null
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: String(error.message || error)
      },
      { status: 500 }
    );
  }
});