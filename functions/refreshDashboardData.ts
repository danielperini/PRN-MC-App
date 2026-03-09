import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const reports = await base44.asServiceRole.entities.Report.list();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentReports = reports.filter((r) => {
      if (!r.updated_date) return false;
      return new Date(r.updated_date) >= thirtyDaysAgo;
    });

    return Response.json({
      ok: true,
      dashboard: {
        totalReports: reports.length,
        recentReports: recentReports.length
      }
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