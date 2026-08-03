import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

import { buildAppLink } from '../_shared/appUrl.ts';

const RECIPIENTS = [
  'adm@viadutodasartes.org.br',           // Marcos
  'josianeamancio@viadutodasartes.org.br', // Josiane Amâncio
  'danielperini.mc@viadutodasartes.org.br', // Daniel Perini
];

// Status que nunca devem aparecer no digest (mesmo que cheguem à fila)
const EXCLUDE_STATUSES = ['PAGO', 'CANCELADO', 'RECUSADO', 'DEVOLVIDO'];

function brtNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

/** 06h00 BRT de hoje = 09h00 UTC (corte para o disparo das 13h) */
function brtStartOfToday06(): Date {
  const brt = brtNow();
  return new Date(Date.UTC(brt.getFullYear(), brt.getMonth(), brt.getDate(), 9, 0, 0));
}

/** Normaliza um PurchaseRequest para o shape do item da fila (reaproveita o render) */
function normalizeFromPR(pr: any): any {
  return {
    id: pr.id,
    purchase_id: pr.id,
    purchase_descricao: pr.descricao_item || pr.observacoes || 'N/A',
    fornecedor_nome: pr.fornecedor_nome || pr.nf_emitente_nome || 'N/A',
    fornecedor_cnpj: pr.fornecedor_cnpj || pr.nf_emitente_cpf_cnpj || '',
    centro_custo: pr.centro_custo || 'Geral',
    rubrica_grupo: pr.rubrica_nome || '',
    rubrica_nome: pr.rubrica_nome || '',
    valor: pr.valor_aprovado || pr.valor_aprovado_admin || pr.valor_solicitado || pr.valor_total || pr.nf_valor_total || 0,
    status_solicitacao: pr.status,
    nota_fiscal_pdf_url: pr.nota_fiscal_url || pr.nf_pdf_url || '',
    nota_fiscal_xml_url: pr.nf_xml_url || '',
    comprovante_url: pr.comprovante_url || pr.comprovante_pagamento_url || '',
    drive_backup_nf_pdf_link: '',
    drive_backup_nf_xml_link: '',
    data_emissao_nf: pr.nf_data_emissao || '',
  };
}

function renderItems(groupedByCentroCusto: Record<string, any[]>, req: any): string {
  let html = '';
  for (const [centroCusto, items] of Object.entries(groupedByCentroCusto)) {
    const totalCC = items.reduce((sum: number, item: any) => sum + (item.valor || 0), 0);

    html += `
    <!-- Grupo: ${centroCusto} -->
    <div style="padding:20px 28px 0 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td><span style="display:inline-block;background:#eff6ff;color:#1e3a8a;font-size:13px;font-weight:700;padding:4px 12px;border-radius:6px;">${centroCusto}</span></td>
          <td style="text-align:right;"><span style="color:#64748b;font-size:13px;">${items.length} item(s) · <strong style="color:#059669;">R$ ${totalCC.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span></td>
        </tr>
      </table>
    </div>
    <div style="padding:12px 28px 0 28px;">
`;

    for (const item of items) {
      const linkSolicitacao = item.purchase_id
        ? buildAppLink(req, `/Compras?id=${item.purchase_id}`)
        : buildAppLink(req, '/Compras');

      const docsLinks: string[] = [];
      if (item.drive_backup_nf_pdf_link || item.nota_fiscal_pdf_url) {
        docsLinks.push(`<a href="${item.drive_backup_nf_pdf_link || item.nota_fiscal_pdf_url}" style="color:#059669;font-size:12px;text-decoration:none;">📄 NF PDF</a>`);
      }
      if (item.drive_backup_nf_xml_link || item.nota_fiscal_xml_url || item.xml_url) {
        docsLinks.push(`<a href="${item.drive_backup_nf_xml_link || item.nota_fiscal_xml_url || item.xml_url}" style="color:#6b7280;font-size:12px;text-decoration:none;">📄 XML</a>`);
      }
      if (item.comprovante_url) {
        docsLinks.push(`<a href="${item.comprovante_url}" style="color:#7c3aed;font-size:12px;text-decoration:none;">📄 Comprovante</a>`);
      }

      html += `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-size:15px;font-weight:600;color:#1e293b;">${item.purchase_descricao || 'N/A'}</div>
              <div style="font-size:13px;color:#475569;margin-top:4px;"><strong>Fornecedor:</strong> ${item.fornecedor_nome || 'N/A'}${item.fornecedor_cnpj ? ` · CNPJ: ${item.fornecedor_cnpj}` : ''}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;"><strong>Rubrica:</strong> ${item.rubrica_grupo || item.rubrica_nome || 'N/A'}${item.data_emissao_nf ? ` · <strong>NF:</strong> ${new Date(item.data_emissao_nf).toLocaleDateString('pt-BR')}` : ''}</div>
            </td>
            <td style="vertical-align:top;text-align:right;width:120px;">
              <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;">Valor</div>
              <div style="font-size:18px;font-weight:700;color:#059669;margin-top:2px;">R$ ${(item.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </td>
          </tr>
        </table>
        ${docsLinks.length > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;">${docsLinks.join(' &nbsp;·&nbsp; ')}</div>` : ''}
        <div style="margin-top:10px;">
          <a href="${linkSolicitacao}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:13px;font-weight:600;padding:8px 18px;border-radius:6px;text-decoration:none;">Ver solicitação no app →</a>
        </div>
      </div>
`;
    }

    html += `    </div>\n`;
  }
  return html;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch { /* sem body — contexto de cron */ }

    const force = body.force === true;
    const mode = body.mode;       // 'errata' | undefined
    const slot = body.slot;       // 'tarde' | undefined (manhã é default)
    const isErrata = mode === 'errata';

    // ── Verificar dia útil (America/Sao_Paulo) ──
    const nowBRT = brtNow();
    const diaSemana = nowBRT.getDay(); // 0=Dom, 6=Sab
    if (!force && !isErrata && (diaSemana === 0 || diaSemana === 6)) {
      return Response.json({ success: true, message: 'Fim de semana — nenhum e-mail enviado', itemsSent: 0 });
    }

    let items: any[] = [];
    let queueItems: any[] = [];

    if (isErrata) {
      // ERRATA: busca diretamente em PurchaseRequest — status aprovado (exclui PAGO e demais)
      const all = await base44.asServiceRole.entities.PurchaseRequest.list('-updated_date', 500);
      items = (all || [])
        .filter((pr: any) => ['APROVADO_COORD', 'APROVADO_ADMIN'].includes(pr.status))
        .map(normalizeFromPR);
    } else {
      // Fluxo normal (crons) via fila
      const pendingItems: any[] = await base44.asServiceRole.entities.PurchaseNotificationQueue.filter({
        status: 'pendente_lote'
      });

      // Filtro de segurança: excluir itens cujo snapshot de status esteja finalizado
      items = (pendingItems || []).filter((it: any) => !EXCLUDE_STATUSES.includes(it.status_solicitacao));
      queueItems = items;

      // Slot tarde: apenas itens novos desde 06h BRT do dia corrente
      if (slot === 'tarde') {
        const inicio06 = brtStartOfToday06();
        items = items.filter((it: any) => {
          const ref = it.requested_at ? new Date(it.requested_at) : null;
          return ref != null && ref >= inicio06;
        });
        queueItems = items;
        if (items.length === 0) {
          return Response.json({ success: true, message: 'Nenhuma compra nova desde as 06h — e-mail das 13h não enviado.', itemsSent: 0, slot: 'tarde' });
        }
      }
    }

    if (!items || items.length === 0) {
      return Response.json({
        success: true,
        message: isErrata ? 'Nenhuma compra aprovada encontrada para a errata.' : 'Nenhuma compra aprovada pendente para notificar.',
        itemsSent: 0
      });
    }

    const now = new Date();
    const dataFormatada = now.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const dataHoje = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

    const totalGeral = items.reduce((sum: number, item: any) => sum + (item.valor || 0), 0);

    const groupedByCentroCusto: Record<string, any[]> = items.reduce((acc: any, item: any) => {
      const cc = item.centro_custo || 'Geral';
      if (!acc[cc]) acc[cc] = [];
      acc[cc].push(item);
      return acc;
    }, {});

    // ── Cores e textos conforme modo ──
    const headerBg = isErrata
      ? 'linear-gradient(135deg,#991b1b,#c2410c)'
      : 'linear-gradient(135deg,#1e3a8a,#2563eb)';
    const headerKicker = isErrata
      ? '⚠️ ERRATA — Este e-mail substitui o resumo enviado anteriormente hoje'
      : 'Museus Centro · Sistema de Compras';
    const headerTitle = isErrata
      ? 'ERRATA — Resumo Corrigido de Compras Aprovadas'
      : 'Resumo Diário de Compras Aprovadas';

    const subLabel = slot === 'tarde' ? 'Atualização das 13h' : dataFormatada;

    // ── E-mail HTML ──
    let emailBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:${headerBg};padding:24px 28px;">
      <div style="color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;opacity:0.92;">${headerKicker}</div>
      <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:4px;">${headerTitle}</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">${isErrata ? dataHoje : subLabel}</div>
    </div>

    <!-- Sumário -->
    <div style="padding:20px 28px 8px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total de compras</div>
            <div style="font-size:22px;color:${isErrata ? '#c2410c' : '#2563eb'};font-weight:700;margin-top:2px;">${items.length}</div>
          </td>
          <td style="vertical-align:top;text-align:right;">
            <div style="font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Valor total</div>
            <div style="font-size:22px;color:#059669;font-weight:700;margin-top:2px;">R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding:8px 28px 0 28px;"><div style="height:1px;background:#e2e8f0;"></div></div>
`;

    emailBody += renderItems(groupedByCentroCusto, req);

    // Nota de errata
    const errataNote = isErrata
      ? `<div style="margin:0 28px 12px 28px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;color:#991b1b;font-size:13px;line-height:1.5;">
          ⚠️ <strong>Nota:</strong> a NF de R$ 30.400,00 (Noturno 2026, já paga) foi removida desta lista pois consta como PAGO no sistema. Os demais itens aprovados que constavam ausentes no envio anterior foram incluídos.
        </div>`
      : '';

    emailBody += `
    <!-- Footer -->
    <div style="padding:16px 28px 24px 28px;">
      <div style="height:1px;background:#e2e8f0;margin-bottom:16px;"></div>
      ${errataNote}
      <div style="text-align:center;">
        <a href="${buildAppLink(req, '/Compras?tab=lista')}" style="display:inline-block;background:#1e293b;color:#ffffff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Acessar Solicitações de Compras</a>
      </div>
      <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:16px;">
        Museus Centro · Viaduto das Artes · E-mail automático gerado às ${dataFormatada}${isErrata ? ' (ERRATA)' : ''}
      </p>
    </div>
  </div>
</body>
</html>`;

    const digestId = `DIGEST-${isErrata ? 'ERRATA' : 'DIARIO'}-${now.toISOString().split('T')[0]}-${Date.now()}`;
    const subject = isErrata
      ? `⚠️ ERRATA — Resumo Corrigido de Compras Aprovadas — ${dataHoje} (${items.length} compra${items.length > 1 ? 's' : ''})`
      : `Resumo Diário de Compras Aprovadas — ${now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (${items.length} compra${items.length > 1 ? 's' : ''})`;

    // Enviar para destinatários fixos usando asServiceRole (obrigatório em contexto de cron)
    await Promise.all(RECIPIENTS.map(recipient =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: recipient,
        subject,
        body: emailBody,
        from_name: isErrata ? 'Museus Centro — Compras (ERRATA)' : 'Museus Centro — Compras'
      }).catch((e: any) => console.warn(`Falha ao enviar para ${recipient}:`, e?.message))
    ));

    // Marcar fila como enviada (apenas fluxo normal)
    if (!isErrata) {
      for (const item of queueItems) {
        await base44.asServiceRole.entities.PurchaseNotificationQueue.update(item.id, {
          status: 'enviado',
          sent_at: now.toISOString(),
          digest_id: digestId
        }).catch(() => {});
        // Deduplicação via PurchaseRequest.notificado_aprovacao_coord_em
        if (item.purchase_id) {
          await base44.asServiceRole.entities.PurchaseRequest.update(item.purchase_id, {
            notificado_aprovacao_coord_em: now.toISOString()
          }).catch(() => {});
        }
      }
    }

    return Response.json({
      success: true,
      message: isErrata ? 'Errata enviada com sucesso' : 'Digest diário enviado com sucesso',
      digestId,
      itemsSent: items.length,
      recipients: RECIPIENTS,
      ...(slot === 'tarde' ? { slot: 'tarde' } : {}),
      ...(isErrata ? { mode: 'errata' } : {})
    });

  } catch (error: any) {
    console.error('Erro ao enviar digest de compras:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});