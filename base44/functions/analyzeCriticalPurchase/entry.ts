import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const HIGH_VALUE_THRESHOLD = 3000; // R$ 3.000
const LOW_BUDGET_PCT = 25; // menos de 25% do saldo disponível

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data: purchaseData, entity_id } = payload;

    // Only process when status transitions to SOLICITADO
    const purchase = purchaseData || await base44.asServiceRole.entities.PurchaseRequest.get(entity_id);
    if (!purchase || purchase.status !== 'SOLICITADO') {
      return Response.json({ skipped: true, reason: 'Not in SOLICITADO status' });
    }

    // Get budget line for this purchase
    let budgetLine = null;
    let saldoRestante = null;
    let pctRestante = null;

    if (purchase.budgetline_id) {
      const lines = await base44.asServiceRole.entities.BudgetLine.filter({ id: purchase.budgetline_id });
      budgetLine = lines?.[0];

      if (budgetLine) {
        const saldoInicial = budgetLine.saldo_inicial || budgetLine.valor_total_previsto || 0;
        const comprometido = budgetLine.saldo_comprometido || 0;
        saldoRestante = saldoInicial - comprometido;
        pctRestante = saldoInicial > 0 ? (saldoRestante / saldoInicial) * 100 : 100;
      }
    }

    const valorSolicitado = purchase.valor_solicitado || 0;
    const isHighValue = valorSolicitado >= HIGH_VALUE_THRESHOLD;
    const isLowBudget = pctRestante !== null && pctRestante <= LOW_BUDGET_PCT;

    // Not critical — skip
    if (!isHighValue && !isLowBudget) {
      return Response.json({ skipped: true, reason: 'Not critical' });
    }

    // Determine criticality level
    const isCritical = (isHighValue && valorSolicitado >= HIGH_VALUE_THRESHOLD * 2) || (pctRestante !== null && pctRestante <= 10);

    // Use AI to generate a personalized, contextualized alert
    const aiAnalysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Você é um assistente financeiro especializado em gestão de projetos culturais.

Analise esta solicitação de compra e gere um alerta personalizado para os coordenadores:

SOLICITAÇÃO:
- Descrição: ${purchase.descricao_item || 'N/A'}
- Valor solicitado: R$ ${valorSolicitado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Categoria: ${purchase.categoria || 'N/A'}
- Tipo: ${purchase.tipo_gasto || 'N/A'}
- Meta vinculada: ${purchase.meta_id || 'N/A'}
- Fornecedor: ${purchase.fornecedor_nome || 'N/A'}
- Centro de custo: ${purchase.centro_custo || 'N/A'}
- Observações do solicitante: ${purchase.observacoes || 'Nenhuma'}

SITUAÇÃO ORÇAMENTÁRIA DA RUBRICA (${budgetLine?.codigo || 'N/A'} — ${budgetLine?.descricao || 'N/A'}):
- Saldo inicial: R$ ${(budgetLine?.saldo_inicial || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Saldo comprometido: R$ ${(budgetLine?.saldo_comprometido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Saldo restante: R$ ${(saldoRestante || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(pctRestante || 0).toFixed(1)}% disponível)

MOTIVO DO ALERTA:
${isHighValue ? `- ⚠️ Valor alto: R$ ${valorSolicitado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (acima do limiar de R$ ${HIGH_VALUE_THRESHOLD.toLocaleString('pt-BR')})` : ''}
${isLowBudget ? `- 🔴 Rubrica com saldo crítico: apenas ${(pctRestante || 0).toFixed(1)}% disponível` : ''}

Gere:
1. Um assunto de email objetivo e urgente (máx. 80 caracteres)
2. Uma análise técnica clara e direta em HTML bem formatado (máx. 250 palavras) destacando os riscos, a situação orçamentária e uma recomendação de ação. Use linguagem profissional e assertiva. Inclua os valores formatados em reais.
3. Um score de urgência de 1 a 10

Contexto: Sistema de gestão do 3º Termo Aditivo do convênio dos Museus de Belo Horizonte.`,
      response_json_schema: {
        type: 'object',
        properties: {
          assunto: { type: 'string' },
          corpo_html: { type: 'string' },
          urgencia_score: { type: 'number' },
          recomendacao: { type: 'string' }
        }
      },
      model: 'claude_opus_4_6'
    });

    // Get all coordinators and admins
    const allPermissions = await base44.asServiceRole.entities.UserPermission.filter({});
    const coordEmails = allPermissions
      .filter(p => ['COORDENADOR', 'ADMIN'].includes(p.base_role) || p.gestao_compras === true)
      .map(p => p.user_email)
      .filter(Boolean);

    if (coordEmails.length === 0) {
      return Response.json({ skipped: true, reason: 'No coordinators found' });
    }

    const urgencyLabel = isCritical ? '🔴 URGENTE' : '⚠️ ATENÇÃO';
    const assunto = `${urgencyLabel}: ${aiAnalysis.assunto || `Nova solicitação crítica — ${purchase.descricao_item}`}`;

    const emailBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:${isCritical ? '#dc2626' : '#d97706'};padding:24px 32px;">
            <p style="margin:0;color:#fff;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
              ${urgencyLabel} — Análise de Compra Requerida
            </p>
            <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;line-height:1.3;">
              Nova Solicitação Crítica
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            
            <!-- Análise IA -->
            <div style="background:#fafafa;border-left:4px solid ${isCritical ? '#dc2626' : '#d97706'};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;">
              ${aiAnalysis.corpo_html || '<p>Solicitação requer análise urgente.</p>'}
            </div>

            <!-- Dados da Solicitação -->
            <h2 style="font-size:14px;font-weight:700;color:#111;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Dados da Solicitação</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              ${[
                ['Descrição', purchase.descricao_item || '—'],
                ['Valor Solicitado', `<strong style="color:${isHighValue ? '#dc2626' : '#111'}">R$ ${valorSolicitado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>`],
                ['Categoria', purchase.categoria || '—'],
                ['Meta Vinculada', purchase.meta_id || '—'],
                ['Fornecedor', purchase.fornecedor_nome || '—'],
                ['Centro de Custo', purchase.centro_custo || '—'],
              ].map(([label, value], i) => `
                <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
                  <td style="padding:10px 16px;font-size:12px;color:#6b7280;width:40%;border-bottom:1px solid #e5e7eb;">${label}</td>
                  <td style="padding:10px 16px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">${value}</td>
                </tr>`).join('')}
            </table>

            <!-- Situação Orçamentária -->
            ${budgetLine ? `
            <h2 style="font-size:14px;font-weight:700;color:#111;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Situação da Rubrica</h2>
            <div style="border:1px solid ${isLowBudget ? '#fca5a5' : '#e5e7eb'};background:${isLowBudget ? '#fff1f2' : '#fff'};border-radius:8px;padding:16px;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#111;">${budgetLine.codigo} — ${budgetLine.descricao}</p>
              <div style="display:flex;gap:24px;margin-top:12px;flex-wrap:wrap;">
                <div>
                  <p style="margin:0;font-size:11px;color:#6b7280;">Saldo Inicial</p>
                  <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#111;">R$ ${(budgetLine.saldo_inicial || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p style="margin:0;font-size:11px;color:#6b7280;">Comprometido</p>
                  <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#d97706;">R$ ${(budgetLine.saldo_comprometido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p style="margin:0;font-size:11px;color:#6b7280;">Saldo Restante</p>
                  <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:${isLowBudget ? '#dc2626' : '#16a34a'};">R$ ${(saldoRestante || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(pctRestante || 0).toFixed(1)}%)</p>
                </div>
              </div>
              <!-- Progress bar -->
              <div style="margin-top:12px;background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
                <div style="height:8px;border-radius:999px;background:${(pctRestante || 0) <= 10 ? '#dc2626' : (pctRestante || 0) <= 25 ? '#d97706' : '#16a34a'};width:${Math.min(100 - (pctRestante || 0), 100)}%;"></div>
              </div>
              <p style="margin:6px 0 0;font-size:11px;color:#6b7280;">${(100 - (pctRestante || 0)).toFixed(1)}% da rubrica já comprometido</p>
            </div>
            ` : ''}

            <!-- Score de Urgência -->
            <div style="background:#111;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
              <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Score de Urgência (IA)</p>
              <p style="margin:8px 0 0;font-size:36px;font-weight:900;color:${(aiAnalysis.urgencia_score || 5) >= 8 ? '#f87171' : (aiAnalysis.urgencia_score || 5) >= 5 ? '#fbbf24' : '#4ade80'};">${aiAnalysis.urgencia_score || '—'}<span style="font-size:18px;color:#6b7280;">/10</span></p>
            </div>

            <!-- CTA -->
            <div style="text-align:center;">
              <a href="https://app.base44.com" style="display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
                Analisar no Painel →
              </a>
              <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">Acesse a aba "Aprovações" no módulo de Suprimentos.</p>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
              Sistema de Gestão — Museus de Belo Horizonte · 3º Termo Aditivo<br>
              Esta é uma notificação automática gerada por análise de IA.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Send email to all coordinators
    await Promise.all(
      coordEmails.map(email =>
        base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: assunto,
          body: emailBody,
          from_name: 'Sistema de Suprimentos — Alerta IA',
        })
      )
    );

    // Also create in-app notifications
    await Promise.all(
      coordEmails.map(email =>
        base44.asServiceRole.entities.Notification.create({
          user_email: email,
          type: 'REPORT_NEEDS_ATTENTION',
          title: assunto,
          message: `${aiAnalysis.recomendacao || 'Solicitação requer análise urgente.'} Score de urgência: ${aiAnalysis.urgencia_score}/10.`,
          read: false,
          email_sent: true,
        })
      )
    );

    return Response.json({
      success: true,
      notified: coordEmails.length,
      urgencia_score: aiAnalysis.urgencia_score,
      is_critical: isCritical,
      is_high_value: isHighValue,
      is_low_budget: isLowBudget,
    });

  } catch (error) {
    console.error('analyzeCriticalPurchase error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});