import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const DESTINATARIO_FIXO = 'danielperini.mcjoseaniamancioeadm@viadutodasartes.org.br';
const FROM_NAME = 'Museus Centro — Financeiro';

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBRL(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(dateValue) {
  try {
    if (!dateValue) return '-';
    return new Date(dateValue).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });
  } catch (_) {
    return String(dateValue || '-');
  }
}

function labelStatus(status) {
  const mapa = {
    RASCUNHO: 'Rascunho',
    SOLICITADO: 'Solicitado',
    APROVADO_COORD: 'Aprovado (Coord.)',
    APROVADO_ADMIN: 'Aprovado (Admin)',
    PAGO: 'Pago',
    RECUSADO: 'Recusado',
    CANCELADO: 'Cancelado',
    DEVOLVIDO: 'Devolvido',
  };
  return mapa[status] || status || '-';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let pendentes = await base44.asServiceRole.entities.PurchaseRequest.filter(
      { status_pagamento: 'pendente' },
      '-created_date',
      10000
    );
    pendentes = Array.isArray(pendentes) ? pendentes : [];

    if (pendentes.length === 0) {
      return Response.json({
        enviou: false,
        motivo: 'sem_pendentes',
        total: 0,
        destinatario: DESTINATARIO_FIXO,
        verificado_em: new Date().toISOString(),
      });
    }

    const total = pendentes.reduce((acc, p) => acc + (Number(p.valor_solicitado) || 0), 0);
    const numItens = pendentes.length;

    const linhas = pendentes
      .map((p, i) => {
        const descricao = escapeHtml(p.descricao_item || '-').substring(0, 140);
        const fornecedor = escapeHtml(p.fornecedor_nome || '-');
        const centroCusto = escapeHtml(p.centro_custo || '-');
        const statusAprov = escapeHtml(labelStatus(p.status));
        const dataSol = escapeHtml(formatData(p.created_date));
        return `
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">${i + 1}. ${descricao}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">${fornecedor}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;white-space:nowrap;">${formatBRL(p.valor_solicitado)}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">${centroCusto}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">${statusAprov}</td>
          <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">${dataSol}</td>
        </tr>`;
      })
      .join('');

    const agora = new Date().toLocaleString('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });

    const html = `
    <html>
      <body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#ffffff;margin:0;padding:24px;">
        <div style="max-width:900px;margin:0 auto;">
          <h2 style="margin:0 0 4px 0;">Pagamentos Pendentes — Museus Centro</h2>
          <p style="color:#6b7280;margin:0 0 16px 0;">Relatório consolidado diário · ${escapeHtml(agora)} · <strong>${numItens}</strong> ${numItens === 1 ? 'item pendente' : 'itens pendentes'}</p>
          <table style="border-collapse:collapse;width:100%;font-size:13px;">
            <thead>
              <tr style="background:#f3f4f6;text-align:left;">
                <th style="padding:8px;border:1px solid #e5e7eb;">Descrição</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Fornecedor</th>
                <th style="padding:8px;border:1px solid #e5e7eb;text-align:right;">Valor (R$)</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Centro de Custo</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Status de Aprovação</th>
                <th style="padding:8px;border:1px solid #e5e7eb;">Data da Solicitação</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
            <tfoot>
              <tr style="background:#fef3c7;font-weight:600;">
                <td style="padding:8px;border:1px solid #e5e7eb;" colspan="2">TOTAL</td>
                <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;white-space:nowrap;">${formatBRL(total)}</td>
                <td style="padding:8px;border:1px solid #e5e7eb;" colspan="3"></td>
              </tr>
            </tfoot>
          </table>
          <p style="margin-top:16px;color:#6b7280;font-size:12px;">Este e-mail é enviado automaticamente todos os dias enquanto existirem pagamentos pendentes. Quando não houver itens pendentes, nenhum e-mail é enviado.</p>
        </div>
      </body>
    </html>`;

    const subject = `[Museus Centro] ${numItens} pagamento(s) pendente(s) · ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: DESTINATARIO_FIXO,
      subject,
      body: html,
      from_name: FROM_NAME,
    });

    return Response.json({
      enviou: true,
      total_pendentes: numItens,
      total_valor: total,
      destinatario: DESTINATARIO_FIXO,
      enviado_em: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});