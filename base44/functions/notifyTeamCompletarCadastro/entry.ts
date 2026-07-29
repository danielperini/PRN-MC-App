import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const APP_URL = 'https://app.base44.com';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    // Permite chamada de automação (sem user) ou por admin/coordenador
    if (user && !['admin', 'coordenador', 'coordinator'].includes((user.role || '').toLowerCase())) {
      return Response.json({ error: 'Acesso restrito a coordenadores e admins' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // Suporte à chamada de entity automation (payload com event + data)
    let usuarios = body.usuarios;
    if (!usuarios && body.event && body.data) {
      const m = body.data;
      const role = (m.role || m.funcao_institucional || '').toLowerCase();
      if (role.includes('observador') || role.includes('observer')) {
        return Response.json({ success: true, message: 'Observador ignorado' });
      }
      const camposFaltantes = [];
      if (!m.cpf && !m.cnpj) camposFaltantes.push('CPF / CNPJ');
      if (!m.banco) camposFaltantes.push('Banco');
      if (!m.pix_key) camposFaltantes.push('Chave PIX');
      if (!m.telefone && !m.celular) camposFaltantes.push('Telefone / Celular');
      if (!m.contrato_url) camposFaltantes.push('Contrato assinado');
      usuarios = [{ email: m.user_email, nome: m.user_name, campos_faltantes: camposFaltantes }];
    }

    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      return Response.json({ success: true, message: 'Nenhum usuário para notificar' });
    }

    let enviados = 0;
    let erros = 0;
    const detalhes = [];

    for (const u of usuarios) {
      const { email, nome, campos_faltantes = [] } = u;
      if (!email || !nome) continue;

      const camposHtml = campos_faltantes.length > 0
        ? `<ul style="margin:8px 0 16px;padding-left:20px;color:#b45309;">${campos_faltantes.map(c => `<li>${c}</li>`).join('')}</ul>`
        : '';

      const body = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;}
h2{color:#111;}a.btn{display:inline-block;background:#111;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;margin:4px 4px 4px 0;}
.box{background:#f9f5ff;border:1px solid #ddd6fe;border-radius:8px;padding:16px;margin:16px 0;}
.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:16px 0;}</style>
</head>
<body>
<h2>Olá, ${nome}!</h2>
<p>Para garantir o correto processamento do seu vínculo contratual com o projeto <strong>Museus Centro</strong>, precisamos que você complete seu cadastro na plataforma.</p>

${campos_faltantes.length > 0 ? `
<div class="warn">
  <strong>Campos que precisam ser preenchidos:</strong>
  ${camposHtml}
</div>
` : ''}

<p><strong>O que fazer:</strong></p>
<ol>
  <li>Acesse a plataforma e abra a seção <strong>"Meus Dados"</strong> para preencher os campos faltantes.</li>
  <li>Faça o upload do <strong>contrato assinado</strong> pela seção <strong>"Entrada de Documentos"</strong>.</li>
  <li>Salve suas informações ao finalizar.</li>
</ol>

<p>A IA irá analisar seu contrato e pré-preencher os campos automaticamente para facilitar.</p>

<div style="margin:24px 0;">
  <a href="${APP_URL}/MeusDados" class="btn">Completar Meus Dados</a>
  <a href="${APP_URL}/EntradaUnica" class="btn" style="background:#6d28d9;">Fazer Upload do Contrato</a>
</div>

<div class="box">
  <p style="margin:0;font-size:13px;color:#555;">⏰ Prazo sugerido: <strong>7 dias</strong> para regularizar o cadastro. Em caso de dúvidas, entre em contato com a coordenação.</p>
</div>

<p style="color:#999;font-size:12px;margin-top:32px;">Museus Centro — Viaduto das Artes</p>
</body>
</html>`;

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: `[Museus Centro] Complete seu cadastro na plataforma — ${campos_faltantes.length} campo(s) pendente(s)`,
          body,
        });
        enviados++;
        detalhes.push({ email, status: 'enviado' });

        // Registrar no NotificationLog
        await base44.asServiceRole.entities.NotificationLog.create({
          notification_type: 'TEAM_COMPLETAR_CADASTRO',
          channel: 'EMAIL',
          recipients: [email],
          subject: `[Museus Centro] Complete seu cadastro`,
          entity_type: 'User',
          status: 'SENT',
          sent_at: new Date().toISOString(),
          created_by: user.email,
          metadata_json: { campos_faltantes },
        });
      } catch (err) {
        erros++;
        detalhes.push({ email, status: 'erro', erro: err.message });
      }
    }

    return Response.json({ enviados, erros, detalhes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});