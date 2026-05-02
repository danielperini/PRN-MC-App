import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data } = body;

    // Verifica se é aprovação
    if (data?.status !== 'APROVADO') {
      return Response.json({ success: true, skipped: true });
    }

    // Busca rubrica
    const rubricaId = data?.rubrica_id || data?.budgetline_id;
    if (!rubricaId) {
      return Response.json({ success: true, skipped: true });
    }

    const rubrica = await base44.asServiceRole.entities.Rubrica.read(rubricaId);
    if (!rubrica) {
      return Response.json({ success: true, skipped: true });
    }

    // Dados do documento (nota fiscal)
    const nomeRubrica = rubrica.nome || 'Rubrica sem nome';
    const valorAprovado = data?.valor_total || data?.nf_valor_total || 0;
    const nfNumero = data?.nf_numero || 'S/N';
    const nfEmitente = data?.nf_emitente_nome || 'Fornecedor';
    const dataEmissao = data?.nf_data_emissao || new Date().toISOString().split('T')[0];

    // Calcula saldo após débito
    const saldoAposDebito = (rubrica.saldo_disponivel || 0) - valorAprovado;

    // Busca dados bancários (PIX e conta)
    // Assumindo que existem config fields ou tabela de config
    let pixKey = 'Chave PIX não configurada';
    let contaBancaria = 'Conta bancária não configurada';

    try {
      const config = await base44.asServiceRole.entities.EmailConfig.filter({
        tipo: 'pagamentos'
      });
      if (config && config[0]) {
        pixKey = config[0].pix_key || pixKey;
        contaBancaria = config[0].conta_bancaria || contaBancaria;
      }
    } catch (e) {
      console.log('Config não encontrada, usando valores padrão');
    }

    // Formata o corpo do email
    const emailBody = `
Solicitação de Pagamento - Rubrica ${nomeRubrica}

NOTA FISCAL APROVADA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Número da NF: ${nfNumero}
Emitente: ${nfEmitente}
Data de Emissão: ${dataEmissao}
Rubrica: ${nomeRubrica}

DADOS PARA PAGAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Valor a Pagar: R$ ${valorAprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

DADOS BANCÁRIOS:
${contaBancaria}

CHAVE PIX:
${pixKey}

SALDO DA RUBRICA APÓS PAGAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Valor Total: R$ ${(rubrica.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Valor Utilizado Aprovado: R$ ${((rubrica.valor_utilizado_aprovado || 0) + valorAprovado).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Saldo Disponível (Após Pagamento): R$ ${Math.max(0, saldoAposDebito).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este é um pedido de pagamento automático gerado pelo sistema.
Plataforma de Gestão - Museus Centro
`.trim();

    // Envia emails
    const recipients = [
      'danielperini.mc@viadutodasartes.org.br',
      'notas.fiscais@viadutodasartes.org.br'
    ];

    const emailTitle = `Solicitação de Pagamento - Rubrica ${nomeRubrica} (NF ${nfNumero})`;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
    const allowedRecipients = recipients.filter(r => { if (r !== ALLOWED_EMAIL) { console.log('Email bloqueado:', r); return false; } return true; });

    for (const to of allowedRecipients) {
      try {
        await base44.integrations.Core.SendEmail({
          to,
          subject: emailTitle,
          body: emailBody,
          from_name: 'Sistema de Gestão - Museus Centro'
        });
      } catch (emailError) {
        console.error(`Erro ao enviar email para ${to}:`, emailError);
      }
    }

    return Response.json({
      success: true,
      emailsSent: recipients.length,
      rubricaId,
      valorAprovado,
      saldoAposDebito,
    });
  } catch (error) {
    console.error('Error in sendInvoiceApprovalEmail:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});