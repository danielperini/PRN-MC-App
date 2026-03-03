import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'ADMIN' && user?.role !== 'admin' && user?.role !== 'COORDENADOR') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all users with must_submit_monthly_report = true
    const allUsers = await base44.entities.User.list();
    const usersRequiredToReport = await base44.entities.UserPermission.filter({ 
      must_submit_monthly_report: true 
    });

    // Get all reports
    const allReports = await base44.entities.Report.list('-created_date', 500);

    const results = [];
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const now = new Date();
    const currentMonth = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();

    // For each user required to report
    for (const perm of usersRequiredToReport) {
      const userEmail = perm.user_email;
      const userObj = allUsers.find(u => u.email === userEmail);

      // Count expected reports (one per month of the year)
      // Get all months/years this user should have reports for
      const allMonths = monthNames.map((_, idx) => ({
        month: monthNames[idx],
        year: currentYear
      }));

      const userReports = allReports.filter(r => r.created_by === userEmail);
      const reportMonths = userReports.map(r => `${r.mes_referencia}-${r.ano}`);

      const missingMonths = allMonths.filter(m => !reportMonths.includes(`${m.month}-${m.year}`));

      results.push({
        userEmail,
        userName: perm.user_name || userObj?.full_name || '–',
        totalExpected: allMonths.length,
        submitted: userReports.length,
        expected: allMonths.length,
        missing: missingMonths.length,
        missingMonths: missingMonths.map(m => `${m.month}/${m.year}`),
        permissionId: perm.id,
        hasPermission: true
      });
    }

    return Response.json({
      total: usersRequiredToReport.length,
      currentMonth,
      currentYear,
      users: results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});