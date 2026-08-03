import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const APP_LINK = 'https://periniprojetos.com.br';
const PROJETO = 'Museus Centro';
const ORGANIZACAO = 'Perini Projetos';

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtmlEmail({ nome, contatoEmail }) {
  const saudacao = nome ? `Olá, ${escapeHtml(nome)}!` : 'Olá!';
  const contatoLinha = contatoEmail
    ? `Em caso de dúvidas, escreva para <a href="mailto:${escapeHtml(contatoEmail)}" style="color:#1d4ed8;">${escapeHtml(contatoEmail)}</a>.`
    : 'Em caso de dúvidas, entre em contato com a coordenação do projeto.';

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;padding:24px 28px;color:#ffffff;">
      <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${escapeHtml(ORGANIZACAO)} — ${escapeHtml(PROJETO)}</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">Atualização do endereço de acesso à plataforma</p>
    </div>
    <div style="padding:24px 28px;color:#1f2937;">
      <p style="font-size:16px;font-weight:600;margin:0 0 12px;">${saudacao}</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:#374151;">
        A plataforma de gestão do projeto <strong>${escapeHtml(PROJETO)}</strong> da <strong>${escapeHtml(ORGANIZACAO)}</strong> passou a funcionar em um novo endereço oficial.
        Acesse agora pelo link abaixo — ele é o caminho correto e atualizado para registro de relatórios, atividades e notas fiscais.
      </p>
      <div style="text-align:center;margin:22px 0;">
        <a href="${APP_LINK}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">Acessar a plataforma</a>
      </div>
      <p style="font-size:13px;color:#6b7280;word-break:break-all;margin:0 0 16px;">
        Ou copie o endereço: <span style="color:#1d4ed8;">${APP_LINK}</span>
      </p>
      <p style="font-size:13px;color:#6b7280;line-height:1.55;margin:0;border-top:1px solid #f1f5f9;padding-top:14px;">
        ${contatoLinha}
      </p>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;font-size:11px;color:#94a3b8;text-align:center;">
      Mensagem institucional — ${escapeHtml(ORGANIZACAO)} / ${escapeHtml(PROJETO)}
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin' && user.role !== 'COORDENADOR') {
      return Response.json({ error: 'Forbidden: apenas administradores' }, { status: 403 });
    }

    const contatoEmail = normalizeEmail(user.email) || 'contato@periniprojetos.com.br';

    const [teamMembersRes, userPermissionsRes] = await Promise.allSettled([
      base44.asServiceRole.entities.TeamMember.list('-created_date', 500),
      base44.asServiceRole.entities.UserPermission.list('-created_date', 500),
    ]);

    const recipients = new Map();

    if (teamMembersRes.status === 'fulfilled') {
      const members = Array.isArray(teamMembersRes.value) ? teamMembersRes.value : [];
      members.forEach((m) => {
        if (m.status && String(m.status).toUpperCase() !== 'ATIVO') return;
        const primary = normalizeEmail(m.user_email);
        const secondary = normalizeEmail(m.email_pessoal);
        if (primary) recipients.set(primary, { email: primary, nome: m.user_name || m.nome || '' });
        if (secondary && !recipients.has(secondary)) {
          recipients.set(secondary, { email: secondary, nome: m.user_name || m.nome || '' });
        }
      });
    }

    if (userPermissionsRes.status === 'fulfilled') {
      const perms = Array.isArray(userPermissionsRes.value) ? userPermissionsRes.value : [];
      perms.forEach((p) => {
        const email = normalizeEmail(p.user_email);
        if (email && !recipients.has(email)) recipients.set(email, { email, nome: p.user_name || p.nome || '' });
      });
    }

    const lista = Array.from(recipients.values());
    const erros = [];
    let enviados = 0;

    for (const dest of lista) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: dest.email,
          subject: `Acesso ao ${PROJETO} (${ORGANIZACAO}) — novo endereço oficial`,
          body: buildHtmlEmail({ nome: dest.nome, contatoEmail }),
          from_name: ORGANIZACAO,
        });
        enviados += 1;
      } catch (e) {
        erros.push({ email: dest.email, erro: String(e?.message || e || '').slice(0, 200) });
      }
    }

    return Response.json({
      total: lista.length,
      enviados,
      erros,
      link: APP_LINK,
    });
  } catch (error) {
    console.error('notifyLinkCorretoApp error', error);
    return Response.json({ error: String(error?.message || error || 'Internal error') }, { status: 500 });
  }
});