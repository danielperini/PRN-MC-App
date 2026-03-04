import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'COORDENADOR' && user.role !== 'ADMIN')) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await base44.asServiceRole.entities.User.list('-created_date', 9999);
    const ano = 2026;

    // Sort by created_date ascending so oldest get lowest numbers
    const sorted = [...users].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    let counter = 1;
    const updates = [];

    for (const u of sorted) {
        const matricula = `MCA${ano}${String(counter).padStart(8, '0')}`;
        counter++;
        if (!u.matricula) {
            await base44.asServiceRole.entities.User.update(u.id, { matricula });
            updates.push({ email: u.email, matricula });
        } else {
            updates.push({ email: u.email, matricula: u.matricula, skipped: true });
        }
    }

    return Response.json({ success: true, updates });
});