import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'ADMIN' && user?.role !== 'admin' && user?.role !== 'COORDENADOR') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all users
    const allUsers = await base44.entities.User.list();

    // Get all permissions
    const allPermissions = await base44.entities.UserPermission.filter({});

    const updated = [];
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    // For each user, ensure they have UserPermission record with must_submit_monthly_report = true
    for (const userObj of allUsers) {
      const existingPerm = allPermissions.find(p => p.user_email === userObj.email);

      if (!existingPerm) {
        // Create permission record
        await base44.entities.UserPermission.create({
          user_email: userObj.email,
          user_name: userObj.full_name,
          base_role: userObj.role || 'PROFISSIONAL',
          must_submit_monthly_report: true,
          can_view_all_reports: userObj.role === 'COORDENADOR' || userObj.role === 'ADMIN',
          can_review_reports: userObj.role === 'COORDENADOR' || userObj.role === 'ADMIN',
          can_manage_users: userObj.role === 'ADMIN',
          can_manage_platform: userObj.role === 'ADMIN'
        });
        updated.push({
          email: userObj.email,
          name: userObj.full_name,
          action: 'created'
        });
      } else if (!existingPerm.must_submit_monthly_report) {
        // Update existing permission
        await base44.entities.UserPermission.update(existingPerm.id, {
          must_submit_monthly_report: true
        });
        updated.push({
          email: userObj.email,
          name: userObj.full_name,
          action: 'updated'
        });
      }
    }

    // Now get all reports and count expected
    const allReports = await base44.entities.Report.list('-created_date', 500);
    const now = new Date();
    const currentYear = now.getFullYear();

    const allMonths = monthNames.map((m, idx) => ({
      month: m,
      year: currentYear
    }));

    const stats = [];
    for (const userObj of allUsers) {
      const userReports = allReports.filter(r => r.created_by === userObj.email && r.ano === currentYear);
      const submitted = userReports.length;
      const expected = allMonths.length;
      const missing = expected - submitted;

      stats.push({
        email: userObj.email,
        name: userObj.full_name,
        submitted,
        expected,
        missing,
        percentComplete: Math.round((submitted / expected) * 100)
      });
    }

    return Response.json({
      updated: updated.length,
      updatedUsers: updated,
      stats,
      currentYear
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});