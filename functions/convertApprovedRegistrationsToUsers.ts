import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admins/coordinators can run this
    if (user?.role !== 'ADMIN' && user?.role !== 'admin' && user?.role !== 'COORDENADOR') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all registrations
    const allRegistrations = await base44.entities.UserRegistration.list();
    const allUsers = await base44.entities.User.list();

    // Find approved registrations that don't have a user
    const approvedNotInvited = allRegistrations.filter(reg => {
      const hasUser = allUsers.some(u => u.email === reg.email);
      return reg.status === 'APROVADO' && !hasUser;
    });

    const results = [];

    // Convert each one to a user
    for (const reg of approvedNotInvited) {
      try {
        // Invite the user
        await base44.users.inviteUser(reg.email, 'user');
        results.push({ email: reg.email, status: 'invited' });
      } catch (error) {
        results.push({ email: reg.email, status: 'error', message: error.message });
      }
    }

    return Response.json({
      total: approvedNotInvited.length,
      processed: results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});