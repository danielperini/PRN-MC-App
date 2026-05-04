import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DESTINATARIOS_FIXOS = [
  'danielperini.mc@viadutodasartes.org.br',
  'notasfiscais@viadutodasartes.org.br',
];

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseMoney(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = safeString(value);
  if (!raw) return 0;

  const normalized = raw
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyBR(value: unknown): string {
  const n = parseMoney(value);

  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeRecipients(value: unknown): string[] {
  return safeString(value)
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueRecipients(...groups: string[][]): string[] {
  const set = new Set<string>();

  groups.flat().forEach((email) => {
    const normalized = safeString(email).toLowerCase();
    if (normalized) set.add(normalized);
  });

  return Array.from(set);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { data } = body;

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
    const nomeRubrica = rubrica.nome || rubrica.rubrica || 'Rubrica sem nome';
    const valorAprovado = parseMoney(data?.valor_total || data?.nf_valor_total || data?.valor || 0);
    const nfNumero = data?.nf_numero || data?.numero_nf || 'S/N';
    const nfEmitente =
      data?.nf_emitente_nome ||
      data?.emitente_nome ||
      data?.fornecedor_nome ||
      'Fornecedor não identificado';

    const emitenteDocumento =
      data?.nf_emitente_cpf_cnpj ||
      data?.emitente_cnpj ||
      data?.fornecedor_cnpj ||
      '';

    const dataEmissao =
      data?.nf_data_emissao ||
      data?.data_emissao ||
      new Date().toISOString().split('T')[0];

    const descricaoNota =
      data?.nf_descricao ||
      data?.nf_descricao_servico ||
      data?.descricao_nota ||
      data?.descricao ||
      data?.observacoes ||
      'Descrição da nota não identificada.';

    const destinatarioNome =
      data?.nf_destinatario_nome ||
      data?.destinatario_nome ||
      '';

    const destinatarioDocumento =
      data?.nf_destinatario_cpf_cnpj ||
      data?.destinatario_cnpj ||
      '';

    const chaveAcesso =
      data?.nf_chave_acesso ||
      data?.chave_acesso ||
      '';

    const centroCusto =
      data?.centro_custo ||
      data?.museu ||
      '';

    const solicitante =
      data?.solicitante_nome ||
      data?.user_name ||
      data?.author_name ||
      data?.created_by ||
      '';

    // Calcula saldo após débito
    const valorRubrica =
      parseMoney(rubrica.valor_total) ||
      parseMoney(rubrica.valor_rubrica) ||
      0;

    const valorUtilizadoAtual =
      parseMoney(rubrica.valor_utilizado) ||
      parseMoney(rubrica.valor_utilizado_aprovado) ||
      0;

    const saldoAposDebito = Math.max(0, valorRubrica - (valorUtilizadoAtual + valorAprovado));

    // Busca dados bancários (PIX e conta)
    let pixKey = 'Chave PIX não configurada';
    let contaBancaria = 'Conta bancária não configurada';

    try {
      const config = await base44.asServiceRole.entities.EmailConfig.filter({
        tipo: 'pagamentos',
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
NOTA FISCAL APROVADA PARA PAGAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NF: ${nfNumero}
Valor da Nota: ${formatMoneyBR(valorAprovado)}
Emitente: ${nfEmitente}${emitenteDocumento ? ` (${emitenteDocumento})` : ''}
Data de Emissão: ${dataEmissao}
Rubrica: ${nomeRubrica}
Centro de Custo: ${centroCusto || '-'}
Solicitante: ${solicitante || '-'}

DADOS DA NOTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Número da NF: ${nfNumero}
Emitente: ${nfEmitente}${emitenteDocumento ? ` (${emitenteDocumento})` : ''}
Destinatário: ${destinatarioNome || '-'}${destinatarioDocumento ? ` (${destinatarioDocumento})` : ''}
Chave de Acesso: ${chaveAcesso || '-'}
Valor: ${formatMoneyBR(valorAprovado)}

DESCRIÇÃO TRANSCRITA DA NOTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${descricaoNota}

DADOS PARA PAGAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Valor a Pagar: ${formatMoneyBR(valorAprovado)}

DADOS BANCÁRIOS:
${contaBancaria}

CHAVE PIX:
${pixKey}

SALDO DA RUBRICA APÓS APROVAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Valor Total da Rubrica: ${formatMoneyBR(valorRubrica)}
Valor Utilizado Atual: ${formatMoneyBR(valorUtilizadoAtual)}
Valor Aprovado nesta NF: ${formatMoneyBR(valorAprovado)}
Saldo Disponível após Aprovação: ${formatMoneyBR(saldoAposDebito)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este é um pedido de pagamento automático gerado pelo sistema.
Plataforma de Gestão - Museus Centro
`.trim();

    // Envia emails
    const recipients = uniqueRecipients(
      DESTINATARIOS_FIXOS,
      normalizeRecipients(body?.to),
      normalizeRecipients(body?.recipients)
    );

    const emailTitle = `NF aprovada - ${formatMoneyBR(valorAprovado)} - ${nfEmitente}`;

    for (const to of recipients) {
      try {
        await base44.integrations.Core.SendEmail({
          to,
          subject: emailTitle,
          body: emailBody,
          from_name: 'Sistema de Gestão - Museus Centro',
        });
      } catch (emailError) {
        console.error(`Erro ao enviar email para ${to}:`, emailError);
      }
    }

    return Response.json({
      success: true,
      emailsSent: recipients.length,
      recipients,
      rubricaId,
      valorAprovado,
      saldoAposDebito,
      subject: emailTitle,
    });
  } catch (error) {
    console.error('Error in sendInvoiceApprovalEmail:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
});
