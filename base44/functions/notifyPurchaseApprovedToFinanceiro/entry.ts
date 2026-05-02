import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const EMAIL_FINANCEIRO = 'notasfiscais@viadutodasartes.org.br';

function formatCurrency(value) {
  const n = parseFloat(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch { return dateStr; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { purchaseId, aprovadorEmail, aprovadorNome } = await req.json();

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId obrigatório.' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada.' }, { status: 404 });
    }

    // Buscar anexos vinculados
    const attachments = await base44.asServiceRole.entities.Attachment.filter({ report_id: purchaseId }).catch(() => []);
    const purchaseDocs = await base44.asServiceRole.entities.PurchaseDocument?.filter({ purchase_id: purchaseId }).catch(() => []);

    const todosArquivos = [
      ...(attachments || []),
      ...(purchaseDocs || []),
    ];

    // Montar lista de arquivos sem duplicata por URL
    const arquivosUnicos = [];
    const urlsVistas = new Set();
    for (const arq of todosArquivos) {
      const url = arq.file_url || arq.url;
      if (url && !urlsVistas.has(url)) {
        urlsVistas.add(url);
        arquivosUnicos.push(arq);
      }
    }

    const valor = formatCurrency(
      purchase.valor_pago || purchase.valor_aprovado_admin || purchase.valor_aprovado || purchase.valor_solicitado
    );

    // Montar corpo do e-mail em HTML
    const linhasArquivos = arquivosUnicos.length > 0
      ? arquivosUnicos.map(arq => {
          const nome = arq.nf_nome_renomeado || arq.file_name || 'Arquivo';
          const url = arq.file_url || arq.url || '';
          return `<li><a href="${url}" target="_blank">${nome}</a></li>`;
        }).join('\n')
      : '<li>Nenhum arquivo anexado</li>';

    const linhasCompra = purchase.orcamento_url
      ? `<li><a href="${purchase.orcamento_url}" target="_blank">Orçamento / Proposta</a></li>`
      : '';

    const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #111; max-width: 700px; margin: auto; padding: 24px;">
  <div style="background: #f8f9fa; border-left: 4px solid #1a1a1a; padding: 16px 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 4px; font-size: 18px;">✅ Compra Aprovada — Museus Centro</h2>
    <p style="margin: 0; color: #555; font-size: 14px;">Esta mensagem é gerada automaticamente pelo sistema.</p>
  </div>

  <table style="width:100%; border-collapse: collapse; font-size: 14px;">
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold; width: 40%;">ID / Identificação</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${purchase.id}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">Descrição</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${purchase.descricao_item || '—'}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">Categoria</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${purchase.categoria || '—'}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">Centro de Custo</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${purchase.centro_custo || '—'}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">Fornecedor</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${purchase.fornecedor_nome || '—'}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">Valor Aprovado</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0; font-weight: bold; color: #1a1a1a;">${valor}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">Data da Aprovação</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${formatDate(new Date().toISOString())}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">Aprovado por</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${aprovadorNome || aprovadorEmail || '—'}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">Status</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">APROVADO</td>
    </tr>
  </table>

  ${arquivosUnicos.length > 0 ? `
  <div style="margin-top: 24px;">
    <h3 style="font-size: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">📎 Arquivos Vinculados</h3>
    <ul style="font-size: 14px; line-height: 1.8;">
      ${linhasArquivos}
      ${linhasCompra}
    </ul>
  </div>
  ` : ''}

  <div style="margin-top: 32px; padding: 12px 16px; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; color: #555;">
    <strong>Sistema:</strong> Museus Centro — Versão 1.0 Estável<br>
    <strong>Projeto:</strong> Viaduto das Artes<br>
    <strong>Gerado em:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  </div>
</body>
</html>`;

    let emailEnviado = false;
    let emailErro = null;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    if (EMAIL_FINANCEIRO !== ALLOWED_EMAIL) {
      console.log('Email bloqueado (financeiro):', EMAIL_FINANCEIRO);
      return Response.json({ success: true, skipped: true, reason: 'Email bloqueado por política de envio' });
    }

    // Tentar enviar e-mail
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: EMAIL_FINANCEIRO,
        subject: `[Compra Aprovada] ${purchase.descricao_item || 'Solicitação'} — ${valor} — Museus Centro`,
        body: htmlBody,
        from_name: 'Museus Centro — Sistema',
      });
      emailEnviado = true;
    } catch (emailErr) {
      emailErro = emailErr?.message || 'Erro ao enviar e-mail';
      console.warn('E-mail financeiro não enviado:', emailErro);
    }

    // Registrar em log (independente do e-mail)
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'APPROVE',
      entity_type: 'PURCHASE',
      entity_id: purchaseId,
      actor_email: aprovadorEmail || 'sistema',
      actor_name: aprovadorNome || 'Sistema',
      new_status: 'APROVADO',
      details: emailEnviado
        ? `E-mail enviado para ${EMAIL_FINANCEIRO} com ${arquivosUnicos.length} arquivo(s).`
        : `Compra aprovada. E-mail NÃO enviado: ${emailErro}. Arquivos: ${arquivosUnicos.length}.`,
    }).catch(() => null);

    return Response.json({
      success: true,
      email_enviado: emailEnviado,
      email_enviado_para: EMAIL_FINANCEIRO,
      email_erro: emailErro,
      arquivos_incluidos: arquivosUnicos.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});