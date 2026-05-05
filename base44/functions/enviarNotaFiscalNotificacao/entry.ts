import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeRecipients(value: unknown): string[] {
  return safeString(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
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
          <tr><td style="padding: 6px 0; font-weight: 700; width: 220px;">Arquivo renomeado</td><td style="padding: 6px 0;">${fileName || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Profissional</td><td style="padding: 6px 0;">${nomeProfissional || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Função</td><td style="padding: 6px 0;">${funcao || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Museu</td><td style="padding: 6px 0;">${museu || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Report ID</td><td style="padding: 6px 0;">${reportId || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Número da NF</td><td style="padding: 6px 0;">${nfNumero || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Valor total</td><td style="padding: 6px 0;">${nfValor || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Data de emissão</td><td style="padding: 6px 0;">${nfData || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Emitente</td><td style="padding: 6px 0;">${emitenteNome || '-'} ${emitenteDoc ? `(${emitenteDoc})` : ''}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Destinatário</td><td style="padding: 6px 0;">${destinatarioNome || '-'} ${destinatarioDoc ? `(${destinatarioDoc})` : ''}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Chave de acesso</td><td style="padding: 6px 0;">${chave || '-'}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: 700;">Status da leitura</td><td style="padding: 6px 0;">${statusLeitura || '-'}</td></tr>
        </tbody>
      </table>

      ${
        fileUrl
          ? `<p style="margin: 0 0 16px;">Arquivo: <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">${fileName || 'Abrir arquivo'}</a></p>`
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

    const notificationDefaults = [
      'notasfiscais@viadutodasartes.org.br',
    ];

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    const recipients = (recipientsFromPayload.length > 0 ? recipientsFromPayload : notificationDefaults)
      .filter(e => {
        if (e !== ALLOWED_EMAIL) { console.log('Email bloqueado:', e); return false; }
        return true;
      });

    if (recipients.length === 0) {
      return Response.json({ ok: true, skipped: true, reason: 'Email bloqueado por política de envio' });
    }

    const subject = `NF enviada - ${nfNomeRenomeado}`;

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
      nfNumero: safeString(attachment.nf_numero),
      nfValor: safeString(attachment.nf_valor_total),
      nfData: safeString(attachment.nf_data_emissao),
      emitenteNome: safeString(attachment.nf_emitente_nome),
      emitenteDoc: safeString(attachment.nf_emitente_cpf_cnpj),
      destinatarioNome: safeString(attachment.nf_destinatario_nome),
      destinatarioDoc: safeString(attachment.nf_destinatario_cpf_cnpj),
      chave: safeString(attachment.nf_chave_acesso),
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