import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const EMAILS_FINANCEIRO_AUTORIZADOS = [
  'danielperini.mc@viadutodasartes.org.br',
  'notasfiscais@viadutodasartes.org.br',
];

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

function getPurchaseMonthFolderLabel(purchase) {
  const rawDate = purchase.nf_data_emissao || purchase.data_emissao || purchase.created_date || purchase.created_at || new Date().toISOString();
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return 'Pasta do mês no Drive';
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `Pasta do mês no Drive — ${mes}/${ano}`;
}

function getDriveMonthUrl(purchase, arquivosUnicos = []) {
  const direct = purchase.drive_month_folder_url || purchase.pasta_drive_mes_url || purchase.backup_month_folder_url || purchase.drive_folder_url;
  if (direct) return direct;

  const fileWithFolder = arquivosUnicos.find((arq) => arq.drive_folder_url || arq.pasta_drive_url || arq.folder_url);
  return fileWithFolder?.drive_folder_url || fileWithFolder?.pasta_drive_url || fileWithFolder?.folder_url || '';
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

    const attachments = await base44.asServiceRole.entities.Attachment.filter({ report_id: purchaseId }).catch(() => []);
    const purchaseDocs = await base44.asServiceRole.entities.PurchaseDocument?.filter({ purchase_id: purchaseId }).catch(() => []);

    const todosArquivos = [
      ...(attachments || []),
      ...(purchaseDocs || []),
    ];

    const arquivosUnicos = [];
    const urlsVistas = new Set();
    for (const arq of todosArquivos) {
      const url = arq.file_url || arq.url || arq.drive_url;
      if (url && !urlsVistas.has(url)) {
        urlsVistas.add(url);
        arquivosUnicos.push(arq);
      }
    }

    const valor = formatCurrency(
      purchase.valor_pago || purchase.valor_aprovado_admin || purchase.valor_aprovado || purchase.valor_solicitado
    );

    const processamento = purchase.numero_processamento || purchase.numero_solicitacao || purchase.codigo_processamento || purchase.id;
    const driveMonthUrl = getDriveMonthUrl(purchase, arquivosUnicos);
    const driveMonthLabel = getPurchaseMonthFolderLabel(purchase);

    const linhasArquivos = arquivosUnicos.length > 0
      ? arquivosUnicos.map(arq => {
          const nome = arq.nf_nome_renomeado || arq.file_name || arq.filename || arq.nome || 'Arquivo';
          const url = arq.file_url || arq.url || arq.drive_url || '';
          return `<li><a href="${url}" target="_blank">${nome}</a></li>`;
        }).join('\n')
      : '<li>Nenhum arquivo anexado</li>';

    const linhaPastaMes = driveMonthUrl
      ? `<li><strong>${driveMonthLabel}:</strong> <a href="${driveMonthUrl}" target="_blank">abrir pasta do mês</a></li>`
      : `<li><strong>${driveMonthLabel}:</strong> link ainda não localizado no registro</li>`;

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
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold; width: 40%;">Nº de Processamento</td>
      <td style="padding: 8px 12px; border: 1px solid #e0e0e0;">${processamento}</td>
    </tr>
    <tr>
      <td style="padding: 8px 12px; background: #f0f0f0; font-weight: bold;">ID interno</td>
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

  <div style="margin-top: 24px;">
    <h3 style="font-size: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">📁 Pasta mensal para pagamento</h3>
    <ul style="font-size: 14px; line-height: 1.8;">
      ${linhaPastaMes}
    </ul>
  </div>

  <div style="margin-top: 24px;">
    <h3 style="font-size: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">📎 Arquivos vinculados</h3>
    <ul style="font-size: 14px; line-height: 1.8;">
      ${linhasArquivos}
      ${linhasCompra}
    </ul>
  </div>

  <div style="margin-top: 32px; padding: 12px 16px; background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px; color: #555;">
    <strong>Sistema:</strong> Museus Centro — Versão 1.0 Estável<br>
    <strong>Projeto:</strong> Viaduto das Artes<br>
    <strong>Gerado em:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
  </div>
</body>
</html>`;

    const resultadosEmail = [];

    for (const destinatario of EMAILS_FINANCEIRO_AUTORIZADOS) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: destinatario,
          subject: `[Compra Aprovada] ${purchase.descricao_item || 'Solicitação'} — ${valor} — Museus Centro`,
          body: htmlBody,
          from_name: 'Museus Centro — Sistema',
        });
        resultadosEmail.push({ destinatario, enviado: true });
      } catch (emailErr) {
        resultadosEmail.push({ destinatario, enviado: false, erro: emailErr?.message || 'Erro ao enviar e-mail' });
        console.warn('E-mail financeiro não enviado:', destinatario, emailErr?.message || emailErr);
      }
    }

    const enviados = resultadosEmail.filter((r) => r.enviado).map((r) => r.destinatario);
    const erros = resultadosEmail.filter((r) => !r.enviado);

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'APPROVE',
      entity_type: 'PURCHASE',
      entity_id: purchaseId,
      actor_email: aprovadorEmail || 'sistema',
      actor_name: aprovadorNome || 'Sistema',
      new_status: 'APROVADO',
      details: enviados.length > 0
        ? `E-mail financeiro enviado para ${enviados.join(', ')} com ${arquivosUnicos.length} arquivo(s).`
        : `Compra aprovada. E-mail financeiro NÃO enviado. Erros: ${JSON.stringify(erros)}. Arquivos: ${arquivosUnicos.length}.`,
    }).catch(() => null);

    return Response.json({
      success: true,
      emails_enviados_para: enviados,
      emails_erros: erros,
      arquivos_incluidos: arquivosUnicos.length,
      pasta_mes_drive: driveMonthUrl || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});