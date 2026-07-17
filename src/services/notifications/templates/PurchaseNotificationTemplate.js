/**
 * PurchaseNotificationTemplate - Templates para Notificações de Compras
 * 
 * Centraliza todos os templates de email relacionados a compras.
 * Mantém o padrão visual atual do sistema.
 */

// Funções utilitárias locais (para evitar dependências externas)
function moeda(value) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatarData(date) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Templates de notificações de compras
 */
export const PurchaseNotificationTemplate = {
  /**
   * Obter template por tipo
   * @param {string} type - Tipo da notificação
   * @param {Object} data - Dados para o template
   * @returns {Object|null}
   */
  getTemplate(type, data) {
    switch (type) {
      case 'PURCHASE_DIGEST':
        return this.digestTemplate(data);
      case 'PURCHASE_APPROVED':
        return this.approvedTemplate(data);
      case 'PURCHASE_RETURNED':
        return this.returnedTemplate(data);
      default:
        return null;
    }
  },

  /**
   * Template para lote consolidado (digest)
   */
  digestTemplate({ items, batchSlot, now }) {
    if (!items || items.length === 0) {
      return null;
    }

    // Agrupar por centro de custo
    const groupedByCentroCusto = items.reduce((acc, item) => {
      const cc = item.centro_custo || 'Geral';
      if (!acc[cc]) acc[cc] = [];
      acc[cc].push(item);
      return acc;
    }, {});

    const totalGeral = items.reduce((sum, item) => sum + (item.valor || 0), 0);
    const dataFormatada = now ? now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : new Date().toLocaleString('pt-BR');

    // Construir HTML
    let emailBody = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
                
                <!-- HEADER -->
                <tr>
                  <td style="background:#111827;border-radius:12px 12px 0 0;padding:28px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <div style="font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">
                            Projeto Museus Centro · Viaduto das Artes
                          </div>
                          <div style="font-size:22px;color:#ffffff;font-weight:700;line-height:1.3;">
                            Notificação de Compras - Lote ${batchSlot.toUpperCase()}
                          </div>
                        </td>
                        <td align="right" style="vertical-align:top;">
                          <div style="background:#2563eb;color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;white-space:nowrap;">
                            ${items.length} solicitação(ões)
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- INFO -->
                <tr>
                  <td style="background:#ffffff;padding:24px 32px;">
                    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px 0;">
                      <strong>Data/Hora:</strong> ${dataFormatada}<br>
                      <strong>Total de solicitações:</strong> ${items.length}<br>
                      <strong>Valor total do lote:</strong> ${moeda(totalGeral)}
                    </p>
                    <hr style="border:1px solid #e5e7eb;margin:20px 0;">
                  </td>
                </tr>
    `;

    // Iterar por centro de custo
    for (const [centroCusto, centroItems] of Object.entries(groupedByCentroCusto)) {
      const totalCentroCusto = centroItems.reduce((sum, item) => sum + (item.valor || 0), 0);

      emailBody += `
        <tr>
          <td style="background:#ffffff;padding:0 32px;">
            <h3 style="color:#059669;margin:20px 0 12px 0;font-size:16px;">${centroCusto}</h3>
            <p style="font-size:13px;color:#6b7280;margin:0 0 12px 0;">
              <strong>Quantidade:</strong> ${centroItems.length} | 
              <strong>Valor Total:</strong> ${moeda(totalCentroCusto)}
            </p>
            <table style="width:100%;border-collapse:collapse;margin:12px 0;" border="1" bordercolor="#e5e7eb">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;">Descrição</th>
                  <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;">Fornecedor</th>
                  <th style="padding:8px;text-align:right;font-size:12px;color:#6b7280;">Valor</th>
                  <th style="padding:8px;text-align:center;font-size:12px;color:#6b7280;">Rubrica</th>
                  <th style="padding:8px;text-align:center;font-size:12px;color:#6b7280;">Links</th>
                </tr>
              </thead>
              <tbody>
      `;

      for (const item of centroItems) {
        // Link direto para a solicitação no app
        const appBaseUrl = 'https://museus-centro.base44-apps.com';
        const linkSolicitacao = item.purchase_id
          ? `${appBaseUrl}/Compras?id=${item.purchase_id}`
          : `${appBaseUrl}/Compras`;

        const links = [];
        // Link para a solicitação no app (sempre presente)
        links.push(`<a href="${linkSolicitacao}" target="_blank" style="color:#2563eb;font-weight:600;">Ver no app</a>`);
        // NF: Drive primeiro, depois URL direta
        if (item.drive_backup_nf_pdf_link || item.nota_fiscal_pdf_url) {
          links.push(`<a href="${item.drive_backup_nf_pdf_link || item.nota_fiscal_pdf_url}" target="_blank" style="color:#059669;">NF PDF</a>`);
        }
        if (item.drive_backup_nf_xml_link || item.nota_fiscal_xml_url || item.xml_url) {
          links.push(`<a href="${item.drive_backup_nf_xml_link || item.nota_fiscal_xml_url || item.xml_url}" target="_blank" style="color:#6b7280;">XML</a>`);
        }
        if (item.comprovante_url) {
          links.push(`<a href="${item.comprovante_url}" target="_blank" style="color:#7c3aed;">Comprovante</a>`);
        }

        emailBody += `
          <tr>
            <td style="padding:8px;font-size:13px;color:#111827;">${item.purchase_descricao || 'N/A'}</td>
            <td style="padding:8px;font-size:13px;color:#111827;">
              ${item.fornecedor_nome || 'N/A'}
              ${item.fornecedor_cnpj ? `<br/><small style="color:#6b7280;">CNPJ: ${item.fornecedor_cnpj}</small>` : ''}
            </td>
            <td style="padding:8px;text-align:right;font-size:13px;color:#111827;font-weight:600;">
              ${moeda(item.valor)}
            </td>
            <td style="padding:8px;text-align:center;font-size:12px;color:#6b7280;">
              ${item.rubrica_grupo || item.rubrica_nome || 'N/A'}
            </td>
            <td style="padding:8px;text-align:center;font-size:12px;">
              ${links.join(' · ')}
            </td>
          </tr>
        `;
      }

      emailBody += `
              </tbody>
            </table>
          </td>
        </tr>
      `;
    }

    emailBody += `
                <!-- FOOTER -->
                <tr>
                  <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
                    <div style="font-size:12px;color:#6b7280;margin:0 0 8px 0;">
                      <strong>Instruções:</strong><br>
                      - Verifique a conformidade de cada nota fiscal antes de aprovar.<br>
                      - Acesse o sistema para visualizar detalhes completos e aprovar as solicitações.<br>
                      - Este email é automático e não deve ser respondido.
                    </div>
                    <p style="margin:20px 0 0 0;">
                      <a href="https://museus-centro.base44-apps.com/Compras" 
                         style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                        Acessar Solicitações de Compras
                      </a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    return {
      subject: `Notificação de Compras - Lote ${batchSlot.toUpperCase()} - ${items.length} solicitação(ões)`,
      body: emailBody,
      fromName: 'Museus Centro - Sistema de Compras',
    };
  },

  /**
   * Template para aprovação individual (legado, não usado no fluxo de lotes)
   */
  approvedTemplate(data) {
    // Template mantido para compatibilidade futura
    return null;
  },

  /**
   * Template para devolução (legado, não usado no fluxo de lotes)
   */
  returnedTemplate(data) {
    // Template mantido para compatibilidade futura
    return null;
  },
};