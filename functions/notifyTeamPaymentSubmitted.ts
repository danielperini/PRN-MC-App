import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getBaseAppUrl(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '');
  return 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';
}

function uniqueEmails(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const {
      team_member_name,
      mes,
      ano,
      valor,
      user_email,
    } = payload || {};

    const valorNumero = toNumber(valor);
    const valorFmt = valorNumero.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const appBaseUrl = getBaseAppUrl(req);
    const paymentLink = `${appBaseUrl}/Compras`;

    const coordenadoresPorPermissao = await base44.asServiceRole.entities.UserPermission.list('', 1000);
    const notifyFromPermissions = (coordenadoresPorPermissao || [])
      .filter((p: any) =>
        p &&
        p.user_email &&
        (
          p.base_role === 'COORDENADOR' ||
          p.pode_aprovar_solicitacoes === true ||
          p.gestao_compras === true ||
          p.can_review_reports === true
        )
      )
      .map((p: any) => p.user_email);

    const allUsers = await base44.asServiceRole.entities.User.list('', 1000);
    const adminsAndCoords = (allUsers || [])
      .filter((u: any) =>
        u &&
        u.email &&
        [
          'admin',
          'ADMIN',
          'COORDENADOR',
          'COORD_PRODUCAO',
          'COORD_ADMINISTRATIVA',
          'COORD_COMUNICACAO',
        ].includes(u.role)
      )
      .map((u: any) => u.email);

    const notifyEmails = uniqueEmails([
      ...notifyFromPermissions,
      ...adminsAndCoords,
      'notasfiscais@viadutodasartes.org.br',
    ]);

    const subject = `[Equipe] Nova Nota Fiscal - ${team_member_name || 'Membro'} (${mes || '-'}\/${ano || '-'})`;

    const body = `Olá,

Um novo pagamento foi submetido para aprovação no fluxo da equipe.

Membro: ${team_member_name || 'Não informado'}
Período do envio: ${mes || '-'}\/${ano || '-'}
Valor informado: R$ ${valorFmt}
E-mail do membro: ${user_email || 'Não informado'}
Enviado por: ${user.full_name || user.email}

Checklist esperado para conferência:
- Contrato
- Nota Fiscal em PDF
- Nota Fiscal em XML
- Parcela disponível
- Saldo na rubrica / linha orçamentária

Acesso direto ao sistema:
${paymentLink}

Caminho sugerido no app:
Compras > Equipe / Pagamentos da Equipe > Revisão de Envios

Observação:
A caixa notasfiscais@viadutodasartes.org.br também foi incluída nesta notificação para acompanhamento do fluxo documental.

Atenciosamente,
Sistema de Suprimentos`;

    const results = [];

    for (const email of notifyEmails) {
      try {
        await base44.integrations.Core.SendEmail({
          to: email,
          subject,
          body,
          from_name: 'Museus Centro',
        });
        results.push({ email, success: true });
      } catch (err) {
        console.error(`Erro ao enviar email para ${email}:`, err);
        results.push({
          email,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return Response.json({
      success: true,
      notified: results.filter((r) => r.success).length,
      attempted: notifyEmails.length,
      results,
      payment_link: paymentLink,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
