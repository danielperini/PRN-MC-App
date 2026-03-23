import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(value: unknown): string {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getBaseAppUrl(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '');
  return 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';
}

function uniqueEmails(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))];
}

function getPurchaseValue(purchase: any): number {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { purchaseId } = await req.json().catch(() => ({}));

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId é obrigatório' }, { status: 400 });
    }

    const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({ id: purchaseId });
    if (!purchases || purchases.length === 0) {
      return Response.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const p = purchases[0];
    const appBaseUrl = getBaseAppUrl(req);
    const appLink = `${appBaseUrl}/Compras`;

    const permissions = await base44.asServiceRole.entities.UserPermission.list('', 1000);
    const notifyFromPermissions = (permissions || [])
      .filter((perm: any) =>
        perm &&
        perm.user_email &&
        (
          perm.can_review_reports === true ||
          perm.pode_aprovar_solicitacoes === true ||
          perm.gestao_compras === true ||
          perm.base_role === 'COORDENADOR'
        )
      )
      .map((perm: any) => perm.user_email);

    const allUsers = await base44.asServiceRole.entities.User.list('', 1000);
    const notifyFromRoles = (allUsers || [])
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
      ...notifyFromRoles,
    ]);

    if (notifyEmails.length === 0) {
      return Response.json({ success: true, message: 'No coordinators found', notified: 0 });
    }

    let rubricaInfo = '';
    let linhaInfo = '';
    if (p.budgetline_id || p.budget_line_id || p.linha_orcamentaria_id) {
      const budgetLineId = p.budgetline_id || p.budget_line_id || p.linha_orcamentaria_id;
      try {
        const budgetLine = await base44.asServiceRole.entities.BudgetLine.get(budgetLineId);
        if (budgetLine) {
          linhaInfo = `• Linha orçamentária: [${budgetLine.codigo || 'S/CÓD'}] ${budgetLine.descricao || budgetLine.nome || 'Sem descrição'}`;
        }
      } catch {
      }
    }

    if (p.rubrica_id) {
      try {
        const rubrica = await base44.asServiceRole.entities.Rubrica.get(p.rubrica_id);
        if (rubrica) {
          rubricaInfo = `• Rubrica: ${rubrica.rubrica || rubrica.nome || rubrica.descricao || 'Sem descrição'}`;
        }
      } catch {
      }
    }

    let solicitanteNome = p.created_by || 'Solicitante';
    try {
      const users = await base44.asServiceRole.entities.User.filter({ email: p.created_by });
      if (users && users.length > 0) {
        solicitanteNome = users[0].full_name || users[0].email || solicitanteNome;
      }
    } catch {
    }

    const valorFmt = formatBRL(getPurchaseValue(p));
    const subject = `📨 Nova solicitação de compra para aprovação - ${p.descricao_item || 'Item sem descrição'}`;

    const body = `Olá,

Uma nova solicitação de compra foi enviada para análise.

Dados principais:
• Item: ${p.descricao_item || 'Sem descrição'}
• Fornecedor: ${p.fornecedor_nome || 'Não informado'}
• Valor: R$ ${valorFmt}
• Solicitante: ${solicitanteNome}
• E-mail do solicitante: ${p.created_by || 'Não informado'}
• Meta: ${p.meta_id || 'Não informada'}
• Tipo: ${p.tipo_gasto || p.categoria || 'Não informado'}
${linhaInfo ? `${linhaInfo}\n` : ''}${rubricaInfo ? `${rubricaInfo}\n` : ''}

Acesse o sistema para revisar:
${appLink}

Caminho sugerido:
Compras > Aprovações

Atenciosamente,
Plataforma — Museus Centro`;

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
      app_link: appLink,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
