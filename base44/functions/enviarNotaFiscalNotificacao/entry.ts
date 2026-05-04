import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const DESTINATARIOS_FIXOS = [
  'notasfiscais@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
];

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function escapeHtml(value: unknown): string {
  return safeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function formatMoneyBR(value: unknown): string {
  const raw = safeString(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const n = Number(raw || value || 0);

  if (!Number.isFinite(n) || n <= 0) {
    return safeString(value) || 'R$ 0,00';
  }

  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function buildHtml(params: {
  nomeProfissional: string;
  funcao: string;
  museu: string;
  reportId: string;
  fileName: string;
  nfNumero: string;
  nfValor: string;
  nfData: string;
  emitenteNome: string;
  emitenteDoc: string;
  destinatarioNome: string;
  destinatarioDoc: string;
  chave: string;
  descricaoNota: string;
  statusLeitura: string;
  fileUrl: string;
}) {
  const {
    nomeProfissional,
    funcao,
    museu,
    reportId,
    fileName,
    nfNumero,
    nfValor,
    nfData,
    emitenteNome,
    emitenteDoc,
    destinatarioNome,
    destinatarioDoc,
    chave,
    descricaoNota,
    statusLeitura,
    fileUrl,
  } = params;

  return `
    <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
      <h2 style="margin: 0 0 16px;">Nova Nota Fiscal enviada</h2>

      <p style="margin: 0 0 16px;">
        Uma nota fiscal foi processada e está pronta para conferência.
      </p>

      <table style="border-collapse: collapse; width: 100%; margin-bottom: 16px;">
        <tbody>
          <tr><td style="padding: 6px 0; font-weight: 700; width: 220px;">Arquivo</td><td style="padding: 6px 0;">${escapeHtml(fileName || '-')}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Profissional</td><td style="padding: 6px 0;">${escapeHtml(nomeProfissional || '-')}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Função</td><td style="padding: 6px 0;">${escapeHtml(funcao || '-')}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Museu / Centro de custo</td><td style="padding: 6px 0;">${escapeHtml(museu || '-')}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Report ID</td><td style="padding: 6px 0;">${escapeHtml(reportId || '-')}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Número da NF</td><td style="padding: 6px 0;">${escapeHtml(nfNumero || '-')}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Valor da nota</td><td style="padding: 6px 0;">${escapeHtml(formatMoneyBR(nfValor))}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Data de emissão</td><td style="padding: 6px 0;">${escapeHtml(nfData || '-')}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Emitente</td><td style="padding: 6px 0;">${escapeHtml(emitenteNome || '-')} ${emitenteDoc ? `(${escapeHtml(emitenteDoc)})` : ''}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Destinatário</td><td style="padding: 6px 0;">${escapeHtml(destinatarioNome || '-')} ${destinatarioDoc ? `(${escapeHtml(destinatarioDoc)})` : ''}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Chave de acesso</td><td style="padding: 6px 0;">${escapeHtml(chave || '-')}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Status da leitura</td><td style="padding: 6px 0;">${escapeHtml(statusLeitura || '-')}</td></tr>
        </tbody>
      </table>

      <div style="margin: 16px 0; padding: 12px; background: #f6f6f6; border: 1px solid #ddd; border-radius: 8px;">
        <p style="margin: 0 0 8px; font-weight: 700;">Descrição transcrita da nota</p>
        <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(descricaoNota || 'Descrição não identificada na leitura da nota.')}</p>
      </div>

      ${
        fileUrl
          ? `<p style="margin: 0 0 16px;">Arquivo: <a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(fileName || 'Abrir arquivo')}</a></p>`
          : ''
      }

      <p style="margin: 16px 0 0; color: #555;">
        Mensagem gerada automaticamente pelo sistema Museus Centro.
      </p>
    </div>
  `;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const attachmentId = safeString(body?.attachment_id);
    const recipientsFromPayload = normalizeRecipients(body?.to);
    const ccFromPayload = normalizeRecipients(body?.cc);
    const bccFromPayload = normalizeRecipients(body?.bcc);

    if (!attachmentId) {
      return Response.json(
        { ok: false, error: 'Parâmetro obrigatório: attachment_id' },
        { status: 400 }
      );
    }

    const attachment = await base44.asServiceRole.entities.Attachment.get(attachmentId);

    if (!attachment) {
      return Response.json(
        { ok: false, error: `Attachment não encontrado: ${attachmentId}` },
        { status: 404 }
      );
    }

    const fileUrl = safeString(attachment.file_url);
    if (!fileUrl) {
      return Response.json(
        { ok: false, error: 'Attachment sem file_url' },
        { status: 400 }
      );
    }

    const nfTipoDocumento = safeString(attachment.nf_tipo_documento);
    const nfNomeRenomeado =
      safeString(attachment.nf_nome_renomeado) ||
      safeString(attachment.file_name) ||
      safeString(attachment.name);

    if (!nfTipoDocumento) {
      return Response.json(
        {
          ok: false,
          error: 'Attachment ainda não foi processado como Nota Fiscal',
        },
        { status: 400 }
      );
    }

    const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      url: fileUrl,
    });

    const signedUrl = safeString(signed?.signed_url || fileUrl);

    const fileResponse = await fetch(signedUrl);
    if (!fileResponse.ok) {
      throw new Error(`Falha ao baixar arquivo para envio: ${fileResponse.status}`);
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));

    const recipients = uniqueRecipients(
      DESTINATARIOS_FIXOS,
      recipientsFromPayload
    );

    const nfValor =
      safeString(attachment.nf_valor_total) ||
      safeString(attachment.valor_total) ||
      safeString(attachment.valor) ||
      safeString(body?.nf_valor_total);

    const emitenteNome =
      safeString(attachment.nf_emitente_nome) ||
      safeString(attachment.emitente_nome) ||
      safeString(attachment.fornecedor_nome) ||
      safeString(body?.nf_emitente_nome) ||
      'Emitente não identificado';

    const nfNumero =
      safeString(attachment.nf_numero) ||
      safeString(attachment.numero_nf) ||
      safeString(body?.nf_numero);

    const descricaoNota =
      safeString(attachment.nf_descricao) ||
      safeString(attachment.nf_descricao_servico) ||
      safeString(attachment.descricao_nota) ||
      safeString(attachment.descricao) ||
      safeString(attachment.ai_descricao) ||
      safeString(attachment.conteudo_extraido) ||
      safeString(body?.nf_descricao);

    const subject = `NF ${nfNumero || 'S/N'} - ${formatMoneyBR(nfValor)} - ${emitenteNome}`;

    const html = buildHtml({
      nomeProfissional:
        safeString(attachment.author_name) ||
        safeString(attachment.user_name) ||
        safeString(user.full_name) ||
        safeString(user.name),
      funcao:
        safeString(attachment.funcao) ||
        safeString(user.funcao) ||
        safeString(user.role),
      museu:
        safeString(attachment.museu) ||
        safeString(attachment.centro_custo),
      reportId: safeString(attachment.report_id),
      fileName: nfNomeRenomeado,
      nfNumero,
      nfValor,
      nfData:
        safeString(attachment.nf_data_emissao) ||
        safeString(attachment.data_emissao) ||
        safeString(body?.nf_data_emissao),
      emitenteNome,
      emitenteDoc:
        safeString(attachment.nf_emitente_cpf_cnpj) ||
        safeString(attachment.emitente_cnpj) ||
        safeString(attachment.fornecedor_cnpj),
      destinatarioNome:
        safeString(attachment.nf_destinatario_nome) ||
        safeString(attachment.destinatario_nome),
      destinatarioDoc:
        safeString(attachment.nf_destinatario_cpf_cnpj) ||
        safeString(attachment.destinatario_cnpj),
      chave:
        safeString(attachment.nf_chave_acesso) ||
        safeString(attachment.chave_acesso),
      descricaoNota,
      statusLeitura: safeString(attachment.nf_status_leitura),
      fileUrl: signedUrl,
    });

    const mimeType =
      safeString(attachment.file_type) ||
      (nfTipoDocumento === 'xml_nf' ? 'application/xml' : 'application/pdf');

    let emailResult: any = null;
    let usedIntegration = '';

    if (base44.asServiceRole.integrations?.Core?.SendEmail) {
      emailResult = await base44.asServiceRole.integrations.Core.SendEmail({
        to: recipients,
        cc: ccFromPayload,
        bcc: bccFromPayload,
        subject,
        html,
        attachments: [
          {
            filename: nfNomeRenomeado,
            mime_type: mimeType,
            data: bytes,
          },
        ],
      });
      usedIntegration = 'Core.SendEmail';
    } else if (base44.asServiceRole.integrations?.Email?.send) {
      emailResult = await base44.asServiceRole.integrations.Email.send({
        to: recipients,
        cc: ccFromPayload,
        bcc: bccFromPayload,
        subject,
        html,
        attachments: [
          {
            filename: nfNomeRenomeado,
            mime_type: mimeType,
            data: bytes,
          },
        ],
      });
      usedIntegration = 'Email.send';
    } else {
      throw new Error(
        'Nenhuma integração de e-mail disponível no ambiente. Verifique o conector de e-mail do Base44.'
      );
    }

    await base44.asServiceRole.entities.Attachment.update(attachmentId, {
      nf_email_enviado: true,
      nf_email_data_envio: new Date().toISOString(),
      nf_email_destinatarios: recipients.join(', '),
      nf_email_assunto: subject,
      nf_email_ultimo_status: 'enviado',
    });

    return Response.json({
      ok: true,
      attachment_id: attachmentId,
      file_name_sent: nfNomeRenomeado,
      to: recipients,
      cc: ccFromPayload,
      bcc: bccFromPayload,
      subject,
      integration_used: usedIntegration,
      email_result: emailResult || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';

    try {
      const reqClone = req.clone();
      const body = await reqClone.json();
      const attachmentId = safeString(body?.attachment_id);

      if (attachmentId) {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.Attachment.update(attachmentId, {
          nf_email_enviado: false,
          nf_email_data_envio: new Date().toISOString(),
          nf_email_ultimo_status: `erro: ${message}`,
        });
      }
    } catch {
      // evita quebrar o handler por erro no bloco de log
    }

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
});
