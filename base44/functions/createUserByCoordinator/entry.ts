import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function normalizeEmail(email: any): string {
  return String(email || '').trim().toLowerCase();
}

function rolePayload(role: string) {
  return {
    base_role: role,
    status: 'ATIVO',
    can_review_reports: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_users: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_files: role === 'COORDENADOR' || role === 'ADMIN',
    can_view_audit_log: role === 'COORDENADOR' || role === 'ADMIN',
    can_manage_platform: role === 'ADMIN',
    gestao_compras: role === 'COORDENADOR' || role === 'ADMIN',
    pode_aprovar_solicitacoes: role === 'COORDENADOR' || role === 'ADMIN',
    must_submit_monthly_reports: role === 'PROFISSIONAL',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const email = normalizeEmail(body.email || body.login);
    const login = normalizeEmail(body.login || body.email);
    const fullName = String(body.full_name || body.nome || '').trim();
    const role = String(body.role || body.base_role || 'PROFISSIONAL').trim().toUpperCase();
    const senha = String(body.senha || body.password || body.senha_inicial || '').trim();

    if (!email || !login || !fullName) {
      return json({ success: false, error: 'Nome, e-mail e login são obrigatórios.' }, 400);
    }

    const permissionPayload = {
      ...rolePayload(role),
      ...(body.permissions || {}),
      user_email: email,
      user_name: fullName,
      funcao: body.funcao || '',
      equipe: body.equipe || '',
      area: body.area || body.museu || '',
      museu: body.area || body.museu || '',
      login,
      senha_inicial: senha,
    };

    const existingPermissions = await base44.asServiceRole.entities.UserPermission
      .filter({ user_email: email })
      .catch(() => []);

    if (existingPermissions?.[0]?.id) {
      await base44.asServiceRole.entities.UserPermission.update(
        existingPermissions[0].id,
        permissionPayload
      );
    } else {
      await base44.asServiceRole.entities.UserPermission.create(permissionPayload);
    }

    const existingRegistrations = await base44.asServiceRole.entities.UserRegistration
      .filter({ email })
      .catch(() => []);

    if (existingRegistrations?.[0]?.id) {
      await base44.asServiceRole.entities.UserRegistration.update(existingRegistrations[0].id, {
        full_name: fullName,
        nome: fullName,
        email,
        login,
        senha_inicial: senha,
        funcao: body.funcao || '',
        equipe: body.equipe || '',
        area: body.area || body.museu || '',
        museu: body.area || body.museu || '',
        status: 'APROVADO',
        aprovado_em: new Date().toISOString(),
        role_aprovada: role,
      });
    } else {
      await base44.asServiceRole.entities.UserRegistration.create({
        full_name: fullName,
        nome: fullName,
        email,
        login,
        senha_inicial: senha,
        funcao: body.funcao || '',
        equipe: body.equipe || '',
        area: body.area || body.museu || '',
        museu: body.area || body.museu || '',
        status: 'APROVADO',
        aprovado_em: new Date().toISOString(),
        role_aprovada: role,
      });
    }

    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: 'Acesso ao sistema Museus Centro',
        body: `
Olá, ${fullName}.

Seu acesso ao sistema Museus Centro foi autorizado.

Login: ${login}
Senha inicial: ${senha || 'use a redefinição de senha no primeiro acesso'}

Acesse o sistema pelo link enviado pela coordenação.
        `.trim(),
      });
    } catch (e) {
      console.warn('E-mail de acesso não enviado:', e?.message || e);
    }

    return json({
      success: true,
      message: 'Usuário registrado e permissões criadas.',
      email,
      login,
      role,
    });
  } catch (error: any) {
    console.error('createUserByCoordinator error:', error);

    return json({
      success: false,
      error: error?.message || 'Erro ao criar usuário.'
    }, 500);
  }
});
