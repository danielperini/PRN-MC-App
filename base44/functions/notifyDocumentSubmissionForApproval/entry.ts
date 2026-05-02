import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function safeStr(v) {
  return String(v || '').trim();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value) {
  if (!value && value !== 0) return 'R$ 0,00';
  const num = parseFloat(String(value).replace(/\D/g, '')) / 100 || parseFloat(value);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildCoordinatorEmail(params) {
  const {
    nomeSolicitante,
    emailSolicitante,
    tipoDocumento,
    categoriaIdentificada,
    nfNumero,
    valor,
    rubricaSugerida,
    centroCusto,
    dataEnvio,
    linkRevisar,
    documentoId,
  } = params;

  return `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 700px;">
      <h2 style="color: #1f2937; margin: 0 0 16px;">📋 Novo Documento para Aprovação</h2>

      <p style="margin: 0 0 12px; color: #555;">
        Um usuário enviou um documento para aprovação. Revise os dados abaixo:
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #e5e7eb;">
        <tbody>
          <tr style="background-color: #f3f4f6;">
            <td style="padding: 10px 12px; font-weight: 600; width: 180px; border: 1px solid #e5e7eb;">Solicitante</td>
            <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${nomeSolicitante}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Email</td>
            <td style="padding: 10px 12px; border: 1px solid #e5e7eb;"><a href="mailto:${emailSolicitante}">${emailSolicitante}</a></td>
          </tr>
          <tr style="background-color: #f3f4f6;">
            <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Tipo de Documento</td>
            <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${tipoDocumento || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Categoria</td>
            <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${categoriaIdentificada || '-'}</td>
          </tr>
          ${nfNumero ? `
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Nota Fiscal</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${nfNumero}</td>
            </tr>
          ` : ''}
          ${valor ? `
            <tr>
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Valor</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${formatCurrency(valor)}</td>
            </tr>
          ` : ''}
          ${rubricaSugerida ? `
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Rubrica</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${rubricaSugerida}</td>
            </tr>
          ` : ''}
          ${centroCusto ? `
            <tr>
              <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Centro de Custo</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${centroCusto}</td>
            </tr>
          ` : ''}
          <tr style="background-color: #f3f4f6;">
            <td style="padding: 10px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Data de Envio</td>
            <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${formatDate(dataEnvio)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin: 20px 0; text-align: center;">
        <a href="${linkRevisar}" target="_blank" rel="noopener noreferrer" 
           style="display: inline-block; padding: 12px 24px; background-color: #1f2937; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Revisar e Aprovar
        </a>
      </div>

      <p style="margin: 12px 0; color: #666; font-size: 12px;">
        Este é um documento de ID: ${documentoId}
      </p>

      <p style="margin: 12px 0 0; color: #999; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
        Mensagem gerada automaticamente pelo sistema Museus Centro.
      </p>
    </div>
  `;
}

function buildUserConfirmationEmail(params) {
  const {
    nomeSolicitante,
    tipoDocumento,
    linkAcompanhar,
    documentoId,
  } = params;

  return `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; max-width: 700px;">
      <h2 style="color: #16a34a; margin: 0 0 16px;">✅ Confirmação de Envio para Aprovação</h2>

      <p style="margin: 0 0 12px; color: #555;">
        Olá <strong>${nomeSolicitante}</strong>,
      </p>

      <p style="margin: 0 0 12px; color: #555;">
        Recebemos seu documento com sucesso! Ele foi encaminhado para análise da coordenação.
      </p>

      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0; color: #166534;">
          📋 <strong>Tipo de Documento:</strong> ${tipoDocumento}
        </p>
        <p style="margin: 8px 0 0; color: #166534;">
          📍 <strong>Status:</strong> Aguardando aprovação da coordenação
        </p>
      </div>

      <p style="margin: 16px 0; color: #555;">
        Você poderá acompanhar o status em qualquer hora clicando no link abaixo:
      </p>

      <div style="margin: 20px 0; text-align: center;">
        <a href="${linkAcompanhar}" target="_blank" rel="noopener noreferrer" 
           style="display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Acompanhar Status
        </a>
      </div>

      <p style="margin: 16px 0 0; color: #666; font-size: 13px;">
        Você pode acompanhar este documento em qualquer uma de nossas áreas:<br/>
        • <strong>Entrada Única de Documentos</strong> (onde você enviou)<br/>
        • <strong>Meus Pagamentos</strong> (se for nota fiscal)<br/>
        • <strong>Meus Documentos</strong> (se for outro tipo)
      </p>

      <p style="margin: 16px 0 0; color: #999; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
        ID do documento: ${documentoId}<br/>
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
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      documentIntakeId,
      tipoDocumento,
      categoriaIdentificada,
      nfNumero,
      valor,
      rubricaSugerida,
      centroCusto,
      nomeArquivo,
    } = body;

    if (!documentIntakeId) {
      return Response.json({ error: 'documentIntakeId obrigatório' }, { status: 400 });
    }

    // Busca o DocumentIntake
    const intake = await base44.asServiceRole.entities.DocumentIntake.get(documentIntakeId);
    if (!intake) {
      return Response.json({ error: 'DocumentIntake não encontrado' }, { status: 404 });
    }

    const nomeSolicitante = intake.user_name || intake.user_email;
    const emailSolicitante = intake.user_email;
    const dataEnvio = new Date().toISOString();

    // Links para os emails
    const linkRevisar = `${Deno.env.get('APP_URL') || 'https://museus-centro.app'}/EntradaUnica`;
    const linkAcompanhar = linkRevisar;

    // BLOQUEIO: enviar apenas para o endereço autorizado
    const ALLOWED_EMAIL = 'danielperini.mc@viadutodasartes.org.br';

    // ═══════════════════════════════════════
    // EMAIL 1: Para COORDENADORES
    // ═══════════════════════════════════════
    const coordEmails = [
      'danielperini.mc@viadutodasartes.org.br',
      'danie@periniprojetos.com.br',
    ].filter(e => { if (e !== ALLOWED_EMAIL) { console.log('Email bloqueado:', e); return false; } return true; });

    const coordHtml = buildCoordinatorEmail({
      nomeSolicitante,
      emailSolicitante,
      tipoDocumento: tipoDocumento || 'Documento',
      categoriaIdentificada: categoriaIdentificada || '-',
      nfNumero: nfNumero || null,
      valor: valor || null,
      rubricaSugerida: rubricaSugerida || null,
      centroCusto: centroCusto || null,
      dataEnvio,
      linkRevisar,
      documentoId: documentIntakeId,
    });

    let coordEmailResult = null;
    let coordEmailError = null;

    try {
      coordEmailResult = await base44.asServiceRole.integrations.Core.SendEmail({
        to: coordEmails,
        subject: `[Aprovação] Novo Documento — ${tipoDocumento || 'Documento'} de ${nomeSolicitante}`,
        html: coordHtml,
      });
    } catch (e) {
      coordEmailError = safeStr(e.message);
      console.error('Erro ao enviar email para coordenadores:', coordEmailError);
    }

    // ═══════════════════════════════════════
    // EMAIL 2: Para USUÁRIO (Confirmação)
    // ═══════════════════════════════════════
    const userHtml = buildUserConfirmationEmail({
      nomeSolicitante,
      tipoDocumento: tipoDocumento || 'Documento',
      linkAcompanhar,
      documentoId: documentIntakeId,
    });

    let userEmailResult = null;
    let userEmailError = null;

    try {
      if (emailSolicitante === ALLOWED_EMAIL) {
        userEmailResult = await base44.asServiceRole.integrations.Core.SendEmail({
          to: [emailSolicitante],
          subject: '✅ Seu documento foi enviado para aprovação',
          html: userHtml,
        });
      } else {
        console.log('Email bloqueado (usuário confirmação):', emailSolicitante);
      }
    } catch (e) {
      userEmailError = safeStr(e.message);
      console.error('Erro ao enviar email para usuário:', userEmailError);
    }

    // ═══════════════════════════════════════
    // LOGGING NA AUDITORIA
    // ═══════════════════════════════════════
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'SUBMIT',
        entity_type: 'DOCUMENT_INTAKE',
        entity_id: documentIntakeId,
        actor_email: emailSolicitante,
        actor_name: nomeSolicitante,
        details: `Documento enviado para aprovação. Emails: Coordenação=${coordEmailError ? 'ERRO' : 'OK'}, Usuário=${userEmailError ? 'ERRO' : 'OK'}`,
      });
    } catch (e) {
      console.error('Erro ao registrar auditoria:', e.message);
    }

    // ═══════════════════════════════════════
    // RESPOSTA
    // ═══════════════════════════════════════
    const hasErrors = coordEmailError || userEmailError;

    return Response.json({
      ok: !hasErrors,
      document_id: documentIntakeId,
      coordinator_email_sent: !!coordEmailResult,
      coordinator_email_error: coordEmailError || null,
      user_email_sent: !!userEmailResult,
      user_email_error: userEmailError || null,
      timestamp: dataEnvio,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
});