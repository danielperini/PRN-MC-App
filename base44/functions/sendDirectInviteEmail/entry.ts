import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['COORDENADOR', 'ADMIN', 'admin'].includes(user.role)) {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json();
    const { email, full_name, role, message: customMessage } = body;

    if (!email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    // Gerar token único para convite direto
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias

    // Salvar convite pendente como UserRegistration com status especial
    await base44.asServiceRole.entities.UserRegistration.create({
      full_name: full_name || email,
      email,
      funcao: 'Outro',
      museu: 'Atuação Geral',
      status: 'APROVADO', // já pré-aprovado pelo admin
      reviewer_note: `Convite direto enviado por ${user.full_name || user.email}. Token: ${token}. Expira: ${expiresAt}`,
    });

    // Montar URL de convite direto
    const parts = req.url.split('/');
    const appIdx = parts.indexOf('app');
    const appId = appIdx !== -1 ? parts[appIdx + 1] : '';
    const baseUrl = new URL(req.url).origin;
    const cadastroUrl = appId ? `${baseUrl}/app/${appId}/Cadastro` : `${baseUrl}/Cadastro`;

    // Buscar config de email
    const emailConfigs = await base44.asServiceRole.entities.EmailConfig.filter({ tipo: 'convites', ativo: true });
    const emailConfig = emailConfigs[0] || {};

    const saudacao = full_name ? `Olá, ${full_name}!` : 'Olá!';
    const roleLabel = {
      PROFISSIONAL: 'Profissional',
      COORDENADOR: 'Coordenação Geral',
      COORD_PRODUCAO: 'Coordenação de Produção',
      COORD_ADMINISTRATIVA: 'Coordenação Administrativa',
      COORD_COMUNICACAO: 'Coordenação de Comunicação',
    }[role] || 'Profissional';

    const emailBody = `${saudacao}

Você foi convidado(a) por ${user.full_name || user.email} para acessar a Plataforma de Relatórios dos Museus Centro como ${roleLabel}.

${customMessage ? `Mensagem do coordenador:\n"${customMessage}"\n\n` : ''}✅ SEU ACESSO JÁ FOI PRÉ-APROVADO.

Para completar seu cadastro, acesse o link abaixo:
${cadastroUrl}

⚠️ Este convite expira em 7 dias.

Se você não esperava este convite, desconsidere este email.

Atenciosamente,
Equipe da Plataforma de Relatórios`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    if (email !== ALLOWED_EMAIL) {
      console.log('Email bloqueado:', email);
      return Response.json({ success: true, skipped: true, email });
    }
    await base44.integrations.Core.SendEmail({
      from_name: emailConfig.nome_sender || 'Plataforma de Relatórios',
      to: email,
      subject: `Convite para a Plataforma de Relatórios - ${roleLabel}`,
      body: emailBody,
    });

    return Response.json({ success: true, email, token });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});