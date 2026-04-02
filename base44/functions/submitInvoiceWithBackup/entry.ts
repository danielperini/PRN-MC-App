import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const FOTOS_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';
const NOTIFY_EMAILS = ['notasfiscais@viadutosartes.org.br', 'danielperini.mc@viadutodasartes.org.br'];

function sanitize(name) {
  return String(name || '').replace(/[<>:"/\\|?*\n\r]/g, '').trim();
}

function buildFileName(numero, cargo, nome, valor, ext) {
  const nomeClean = sanitize(nome).toUpperCase();
  const cargoClean = sanitize(cargo).toUpperCase();
  const valorStr = Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `NF ${numero} ${cargoClean} - ${nomeClean} - MUSEUS CENTRO - R$ ${valorStr}.${ext}`;
}

async function findOrCreateFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await res.json();
  if (d.files?.[0]?.id) return d.files[0].id;

  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const cd = await cr.json();
  if (cd.error) throw new Error(`Erro ao criar pasta: ${cd.error.message}`);
  return cd.id;
}

async function uploadFileToDrive(token, fileName, fileUrl, mimeType, folderId) {
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error(`Falha ao baixar arquivo: ${fileRes.status}`);
  const fileBuffer = await fileRes.arrayBuffer();
  const fileBytes = new Uint8Array(fileBuffer);

  const boundary = 'nf_upload_boundary';
  const meta = JSON.stringify({ name: fileName, parents: [folderId], mimeType });
  const enc = new TextEncoder();
  const p1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
  const p2 = enc.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const p3 = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(p1.length + p2.length + fileBytes.length + p3.length);
  body.set(p1, 0);
  body.set(p2, p1.length);
  body.set(fileBytes, p1.length + p2.length);
  body.set(p3, p1.length + p2.length + fileBytes.length);

  const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  const upData = await up.json();
  if (upData.error) throw new Error(`Erro upload Drive: ${upData.error.message}`);
  return upData;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { invoiceData, pdfFileUrl, xmlFileUrl, aiExtracted } = await req.json();

    if (!pdfFileUrl || !xmlFileUrl) {
      return Response.json({ error: 'PDF e XML são obrigatórios' }, { status: 400 });
    }

    const numero = aiExtracted?.numero_nota || '000';
    const cargo = user.funcao || user.role || 'PROFISSIONAL';
    const nome = user.full_name || user.email;
    const valor = aiExtracted?.valor_total || 0;
    const mes = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    // 1. Salvar no banco de dados (InvoiceSubmission)
    const submission = await base44.asServiceRole.entities.InvoiceSubmission.create({
      user_email: user.email,
      user_name: nome,
      user_cargo: cargo,
      mes_referencia: mes,
      data_submissao: new Date().toISOString(),
      numero_nota: numero,
      valor_total: valor,
      pdf_url: pdfFileUrl,
      xml_url: xmlFileUrl,
      dados_extraidos: aiExtracted,
      status: 'PENDENTE_APROVACAO',
      nome_arquivo_padrao: buildFileName(numero, cargo, nome, valor, 'pdf'),
    });

    // 2. Backup no Drive
    let driveResults = { pdf: null, xml: null };
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
      const userFolderId = await findOrCreateFolder(accessToken, sanitize(nome), FOTOS_FOLDER_ID);
      const mesFolderId = await findOrCreateFolder(accessToken, mes, userFolderId);

      const pdfFileName = buildFileName(numero, cargo, nome, valor, 'pdf');
      const xmlFileName = buildFileName(numero, cargo, nome, valor, 'xml');

      const [pdfDrive, xmlDrive] = await Promise.all([
        uploadFileToDrive(accessToken, pdfFileName, pdfFileUrl, 'application/pdf', mesFolderId),
        uploadFileToDrive(accessToken, xmlFileName, xmlFileUrl, 'application/xml', mesFolderId),
      ]);

      driveResults = { pdf: pdfDrive, xml: xmlDrive };

      // Atualizar submission com links do Drive
      await base44.asServiceRole.entities.InvoiceSubmission.update(submission.id, {
        drive_pdf_id: pdfDrive.id,
        drive_xml_id: xmlDrive.id,
        drive_pdf_link: pdfDrive.webViewLink,
        drive_xml_link: xmlDrive.webViewLink,
        backup_done: true,
      });
    } catch (driveErr) {
      console.warn('Drive backup falhou:', driveErr.message);
    }

    const submissionUrl = `${Deno.env.get('BASE44_APP_URL') || 'https://app.base44.com'}/Compras`;

    // 3. Notificações imediatas ao enviar
    const notifySubject = `📄 Nova Nota Fiscal Enviada — ${nome}`;
    const notifyBody = `
<h2>Nova Nota Fiscal Enviada para Aprovação</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
  <tr><td><b>Profissional</b></td><td>${nome}</td></tr>
  <tr><td><b>Cargo</b></td><td>${cargo}</td></tr>
  <tr><td><b>Nº da Nota</b></td><td>${numero}</td></tr>
  <tr><td><b>Valor</b></td><td>R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
  <tr><td><b>Mês de Referência</b></td><td>${mes}</td></tr>
  <tr><td><b>Fornecedor</b></td><td>${aiExtracted?.fornecedor_nome || '-'}</td></tr>
  <tr><td><b>Data de Emissão</b></td><td>${aiExtracted?.data_emissao || '-'}</td></tr>
</table>
<br/>
<p>📎 <a href="${pdfFileUrl}">Visualizar PDF da Nota Fiscal</a></p>
<p>📎 <a href="${xmlFileUrl}">Visualizar XML da Nota Fiscal</a></p>
${driveResults.pdf?.webViewLink ? `<p>📁 <a href="${driveResults.pdf.webViewLink}">Abrir no Google Drive</a></p>` : ''}
<br/>
<p>🔗 <a href="${submissionUrl}">Acessar plataforma para aprovar</a></p>
<hr/>
<p style="color:#888;font-size:12px;">Plataforma Museus Centro — Gestão de Notas Fiscais</p>
    `.trim();

    for (const email of NOTIFY_EMAILS) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: notifySubject,
          body: notifyBody,
        });
      } catch (mailErr) {
        console.warn(`Email para ${email} falhou:`, mailErr.message);
      }
    }

    // 4. Notificação na plataforma para coordenadores
    const coordinators = await base44.asServiceRole.entities.UserPermission.filter(
      { can_review_reports: true }, '-created_date', 50
    );
    for (const coord of coordinators || []) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          user_email: coord.user_email,
          type: 'INVOICE_SUBMITTED',
          title: `Nova NF para aprovação — ${nome}`,
          message: `NF ${numero} no valor de R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} aguarda sua aprovação.`,
          action_url: submissionUrl,
          read: false,
          email_sent: true,
        });
      } catch (e) {
        console.warn('Notif coord falhou:', e.message);
      }
    }

    return Response.json({
      success: true,
      submission_id: submission.id,
      backup_done: !!driveResults.pdf?.id,
      drive_link: driveResults.pdf?.webViewLink || null,
      nome_arquivo: buildFileName(numero, cargo, nome, valor, 'pdf'),
      notificacoes_enviadas: NOTIFY_EMAILS,
    });

  } catch (error) {
    console.error('Erro submitInvoiceWithBackup:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});