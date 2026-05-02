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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { purchaseId, newStatus, comentario } = await req.json();

    if (!purchaseId || !newStatus) {
      return Response.json(
        { error: 'purchaseId e newStatus são obrigatórios' },
        { status: 400 }
      );
    }

    const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({ id: purchaseId });
    if (!purchases || purchases.length === 0) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const purchase = purchases[0];
    const userEmail = purchase.created_by;

    const appBaseUrl = getBaseAppUrl(req);
    const appLink = `${appBaseUrl}/Compras`;

    const valor = toNumber(
      purchase.valor_pago ||
      purchase.valor_aprovado_admin ||
      purchase.valor_aprovado ||
      purchase.valor_final ||
      purchase.valor_solicitado ||
      0
    );

    const valorFmt = valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const statusMap: Record<string, { label: string; emoji: string; intro: string }> = {
      RASCUNHO: {
        label: 'Rascunho',
        emoji: '📝',
        intro: 'Sua solicitação voltou para rascunho e pode ser ajustada na plataforma.',
      },
      ENVIADO_COORD: {
        label: 'Enviado para Coordenação',
        emoji: '📨',
        intro: 'Sua solicitação foi enviada para análise da coordenação.',
      },
      SOLICITADO: {
        label: 'Solicitado',
        emoji: '📨',
        intro: 'Sua solicitação foi registrada e está aguardando análise.',
      },
      APROVADO_COORD: {
        label: 'Aprovado pela Coordenação',
        emoji: '✅',
        intro: 'Sua solicitação foi aprovada pela coordenação.',
      },
      APROVADO_ADMIN: {
        label: 'Aprovado pela Administração',
        emoji: '✅',
        intro: 'Sua solicitação foi aprovada administrativamente.',
      },
      RECUSADO: {
        label: 'Recusado',
        emoji: '❌',
        intro: 'Sua solicitação foi recusada.',
      },
      PAGO: {
        label: 'Pago',
        emoji: '💳',
        intro: 'Sua solicitação foi marcada como paga.',
      },
    };

    const statusInfo = statusMap[newStatus] || {
      label: newStatus,
      emoji: '📋',
      intro: 'O status da sua solicitação foi atualizado.',
    };

    const isReturnedToDraft = newStatus === 'RASCUNHO';

    const subject = `${statusInfo.emoji} Sua solicitação de compra: ${statusInfo.label}`;

    let body = `Olá,\n\n`;
    body += `${statusInfo.intro}\n\n`;
    body += `Dados da solicitação:\n`;
    body += `• Item: ${purchase.descricao_item || 'Sem descrição'}\n`;
    body += `• Valor: R$ ${valorFmt}\n`;
    body += `• Novo status: ${statusInfo.label}\n`;

    if (comentario) {
      body += `\nComentário do coordenador:\n${comentario}\n`;
    }

    if (isReturnedToDraft) {
      body += `\nPróximo passo:\n`;
      body += `Revise os dados e documentos da solicitação e envie novamente após a correção.\n`;
    }

    body += `\nAcesse a plataforma para acompanhar ou ajustar sua solicitação:\n${appLink}\n`;
    body += `\nCaminho sugerido:\nCompras > Solicitações\n`;
    body += `\nPlataforma Museus Centro`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    if (userEmail !== ALLOWED_EMAIL) {
      console.log('Email bloqueado:', userEmail);
      return Response.json({ success: true, skipped: true });
    }
    await base44.integrations.Core.SendEmail({
      to: userEmail,
      subject,
      body,
      from_name: 'Museus Centro',
    });

    return Response.json({
      success: true,
      message: 'Notificação enviada ao usuário',
      app_link: appLink,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});