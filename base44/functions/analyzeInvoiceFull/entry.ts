import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DRIVE_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';
const NOTIFY_EMAILS = ['notasfiscais@viadutosartes.org.br', 'danielperini.mc@viadutodasartes.org.br'];
const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';

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
  const q = encodeURIComponent(`name='${sanitize(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await res.json();
  if (d.files?.[0]?.id) return d.files[0].id;
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: sanitize(name), mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const cd = await cr.json();
  if (cd.error) throw new Error('Erro pasta Drive: ' + cd.error.message);
  return cd.id;
}

async function uploadToDrive(token, fileName, fileUrl, mimeType, folderId) {
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error('Falha ao baixar arquivo: ' + fileRes.status);
  const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
  const boundary = 'inv_upload_boundary';
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const enc = new TextEncoder();
  const p1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
  const p2 = enc.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const p3 = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(p1.length + p2.length + fileBytes.length + p3.length);
  body.set(p1, 0); body.set(p2, p1.length);
  body.set(fileBytes, p1.length + p2.length);
  body.set(p3, p1.length + p2.length + fileBytes.length);
  const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const d = await up.json();
  if (d.error) throw new Error('Erro upload Drive: ' + d.error.message);
  return d;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { submissionId, pdfFileUrl, xmlFileUrl, aiExtracted } = await req.json();
    if (!pdfFileUrl) return Response.json({ error: 'PDF obrigatorio' }, { status: 400 });

    // --- 1. Contexto do usuário + Validação de Contrato ---
    const [teamMembers, userPermission] = await Promise.all([
      base44.asServiceRole.entities.TeamMember.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.UserPermission.filter({ user_email: user.email }, '-created_date', 1).catch(() => []),
    ]);

    // Buscar contrato do usuário para validação e preenchimento
    const userTeamMembers = (teamMembers || []).filter(m => m.user_email === user.email);
    const teamMember = userTeamMembers.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
    
    let contractStatus = { valid: true, alerts: [] };
    if (teamMember && teamMember.data_fim_contrato) {
      const endDate = new Date(teamMember.data_fim_contrato);
      const today = new Date();
      if (endDate < today) {
        contractStatus.valid = false;
        contractStatus.alerts.push(`Contrato vencido em ${endDate.toLocaleDateString('pt-BR')}.`);
      }
    }

    const perm = (userPermission || [])[0];
    const cargo = perm?.base_role || user.role || user.funcao || 'PROFISSIONAL';
    const nome = user.full_name || user.email;
    const mes = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    const numero = aiExtracted?.numero_nota || '000';
    const valor = aiExtracted?.valor_total || 0;
    const nomeArquivoPadrao = buildFileName(numero, cargo, nome, valor, 'pdf');

    // --- 2. Salvar no banco IMEDIATAMENTE ---
    // Validar dados bancários e determinar origem
    let dataOrigemBancaria = 'Cadastro do utilizador';
    let bancoDados = {
      banco_nome: aiExtracted?.banco_nome || '',
      banco_agencia: aiExtracted?.banco_agencia || '',
      banco_conta: aiExtracted?.banco_conta || '',
      banco_pix: aiExtracted?.banco_pix || '',
      banco_favorecido: aiExtracted?.banco_favorecido || '',
    };

    // Se dados bancários estão incompletos → tentar ler do contrato
    const bancosPreenchidos = Object.values(bancoDados).filter(v => v?.trim()).length;
    if (bancosPreenchidos < 2 && teamMember?.contrato_url) {
      // Fallback: ler do contrato
      const extractedFromContract = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
        file_url: teamMember.contrato_url,
        json_schema: {
          type: 'object',
          properties: {
            contratado_banco: { type: 'string' },
            contratado_agencia: { type: 'string' },
            contratado_conta: { type: 'string' },
            pix_key: { type: 'string' },
          }
        }
      }).catch(() => ({ status: 'error' }));

      if (extractedFromContract.status === 'success' && extractedFromContract.output) {
        const output = extractedFromContract.output;
        bancoDados.banco_nome = bancoDados.banco_nome || output.contratado_banco || '';
        bancoDados.banco_agencia = bancoDados.banco_agencia || output.contratado_agencia || '';
        bancoDados.banco_conta = bancoDados.banco_conta || output.contratado_conta || '';
        bancoDados.banco_pix = bancoDados.banco_pix || output.pix_key || '';
        dataOrigemBancaria = 'Contrato (leitura automática via IA)';
      }
    }

    // Se ainda não tem dados do contrato → usar dados salvos no TeamMember
    if (!bancoDados.banco_nome && teamMember?.banco) {
      bancoDados.banco_nome = teamMember.banco;
      bancoDados.banco_agencia = teamMember.agencia || '';
      bancoDados.banco_conta = teamMember.conta || '';
      bancoDados.banco_pix = teamMember.pix_key || '';
      dataOrigemBancaria = 'Cadastro do utilizador';
    }

    // Garantir nome do favorecido
    if (!bancoDados.banco_favorecido) {
      bancoDados.banco_favorecido = teamMember?.user_name || nome;
    }

    const baseData = {
      user_email: user.email,
      user_name: nome,
      user_cargo: cargo,
      mes_referencia: mes,
      data_submissao: new Date().toISOString(),
      numero_nota: numero,
      valor_total: valor,
      pdf_url: pdfFileUrl,
      xml_url: xmlFileUrl || null,
      dados_extraidos: aiExtracted,
      status: contractStatus.valid ? 'PENDENTE_APROVACAO' : 'VENCIDO',
      nome_arquivo_padrao: nomeArquivoPadrao,
      analysis_done: false,
      team_member_id: teamMember?.id || null,
      team_member_name: teamMember?.user_name || nome,
      emitente_nome: aiExtracted?.fornecedor_nome || '',
      emitente_cnpj_cpf: aiExtracted?.fornecedor_cnpj || '',
      ...bancoDados,
      contract_valid: contractStatus.valid,
      contract_end_date: teamMember?.data_fim_contrato || null,
    };

    let savedSubmission;
    if (submissionId) {
      await base44.asServiceRole.entities.InvoiceSubmission.update(submissionId, baseData);
      savedSubmission = { id: submissionId };
    } else {
      savedSubmission = await base44.asServiceRole.entities.InvoiceSubmission.create(baseData);
    }

    // --- 3. Backup no Drive ---
    let driveResults = {};
    let backupError = null;
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
      const userFolderId = await findOrCreateFolder(accessToken, nome, DRIVE_FOLDER_ID);
      const mesFolderId = await findOrCreateFolder(accessToken, mes, userFolderId);
      driveResults.pdf = await uploadToDrive(accessToken, buildFileName(numero, cargo, nome, valor, 'pdf'), pdfFileUrl, 'application/pdf', mesFolderId);
      if (xmlFileUrl) {
        driveResults.xml = await uploadToDrive(accessToken, buildFileName(numero, cargo, nome, valor, 'xml'), xmlFileUrl, 'application/xml', mesFolderId);
      }
      await base44.asServiceRole.entities.InvoiceSubmission.update(savedSubmission.id, {
        drive_pdf_id: driveResults.pdf?.id,
        drive_xml_id: driveResults.xml?.id,
        drive_pdf_link: driveResults.pdf?.webViewLink,
        drive_xml_link: driveResults.xml?.webViewLink,
        backup_done: true,
      });
    } catch (err) {
      backupError = err.message;
      console.warn('Drive backup falhou:', err.message);
    }

    // --- 3.5 Cruzamento Contrato vs NF (validação complementar) ---
    let crossValidation = { status: 'ok', summary: '', warnings: [], critical_issues: [], comparacao: {} };
    const alertas_final = [...(contractStatus.alerts || [])];
    
    if (teamMember?.contrato_url && aiExtracted) {
      try {
        const validationRes = await base44.functions.invoke('validateContractVsInvoice', {
          contractUrl: teamMember.contrato_url,
          invoiceData: aiExtracted,
          tolerance: 1.00,
          competenciaData: aiExtracted?.data_emissao || new Date().toISOString(),
        });
        if (validationRes?.data?.success) {
          crossValidation = validationRes.data;
          // Se há divergências críticas, adicionar aos alertas finais
          if (crossValidation.critical_issues?.length > 0) {
            alertas_final.push(...crossValidation.critical_issues);
          }
          alertas_final.push(...(crossValidation.warnings || []));
        }
      } catch (err) {
        console.warn('Validação cruzada falhou (não bloqueia):', err.message);
      }
    }

    // --- 4. Emails + Notificações ---
    const emailSubject = `📄 Nova Nota Fiscal — NF ${numero} — ${nome} (${mes})`;
    const emailBody = `
<h2 style="color:#4338ca;">Nova Nota Fiscal Enviada para Aprovação</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
  <tr><td><b>Profissional</b></td><td>${nome}</td></tr>
  <tr><td><b>Cargo</b></td><td>${cargo}</td></tr>
  <tr><td><b>Mês</b></td><td>${mes}</td></tr>
  <tr><td><b>Nº da Nota</b></td><td>${numero}</td></tr>
  <tr><td><b>Valor</b></td><td>R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>
  <tr><td><b>Emitente</b></td><td>${aiExtracted?.fornecedor_nome || '-'}</td></tr>
  <tr><td><b>CNPJ/CPF</b></td><td>${aiExtracted?.fornecedor_cnpj || '-'}</td></tr>
  <tr><td><b>Banco / PIX</b></td><td>${aiExtracted?.banco_pix || aiExtracted?.banco_conta || '-'}</td></tr>
  <tr><td><b>Status</b></td><td><b style="color:#d97706;">⏳ AGUARDANDO APROVAÇÃO</b></td></tr>
</table>
<br/>
<p><a href="${pdfFileUrl}">📄 PDF</a>${xmlFileUrl ? ` | <a href="${xmlFileUrl}">📋 XML</a>` : ''}${driveResults.pdf?.webViewLink ? ` | <a href="${driveResults.pdf.webViewLink}">📁 Drive</a>` : ''}</p>
<p><a href="${APP_URL}/Compras" style="background:#4338ca;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">🔗 Aprovar na plataforma</a></p>
<p style="color:#888;font-size:12px;">Plataforma Museus Centro</p>
    `.trim();

    const coordsForEmail = await base44.asServiceRole.entities.UserPermission.filter(
      { can_review_reports: true }, '-created_date', 20
    ).catch(() => []);

    const allEmails = [...NOTIFY_EMAILS];
    for (const c of (coordsForEmail || [])) {
      if (c.user_email && !allEmails.includes(c.user_email)) allEmails.push(c.user_email);
    }

    // Email coordenadores/fixos
    for (const email of allEmails) {
      base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject: emailSubject, body: emailBody }).catch(e => console.warn('Email falhou:', email, e.message));
    }

    // Email confirmação usuário
    base44.asServiceRole.integrations.Core.SendEmail({
      to: user.email,
      subject: `✅ NF ${numero} enviada com sucesso — ${mes}`,
      body: `<h2>Nota Fiscal Enviada!</h2><p>Olá ${nome},</p><p>Sua NF foi gravada e <b>aguarda aprovação da coordenação</b>.</p><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;"><tr><td>Nº</td><td>${numero}</td></tr><tr><td>Valor</td><td>R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr><tr><td>Mês</td><td>${mes}</td></tr><tr><td>Status</td><td>⏳ Aguardando aprovação</td></tr></table><br/><p><a href="${pdfFileUrl}">📄 PDF</a>${xmlFileUrl ? ` | <a href="${xmlFileUrl}">📋 XML</a>` : ''}</p>`,
    }).catch(e => console.warn('Email usuário falhou:', e.message));

    // Notificações na plataforma
    for (const coord of (coordsForEmail || [])) {
      base44.asServiceRole.entities.Notification.create({
        user_email: coord.user_email,
        type: 'INVOICE_SUBMITTED',
        title: `Nova NF para aprovação — ${nome}`,
        message: `NF ${numero} — R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — aguarda aprovação.`,
        action_url: `${APP_URL}/Compras`,
        read: false,
        email_sent: true,
      }).catch(e => console.warn('Notif coord falhou:', e.message));
    }

    const isEquipe = !!teamMember;
    const equipeMsg = isEquipe && teamMember
      ? `✅ Nota vinculada ao membro: ${teamMember.user_name || nome}`
      : null;

    // Adicionar alertas de contrato se houver
    const pontos_criticos_final = contractStatus.valid ? [] : contractStatus.alerts;

    return Response.json({
      success: true,
      submission_id: savedSubmission.id,
      backup_done: !!driveResults.pdf?.id,
      backup_error: backupError,
      drive_pdf_link: driveResults.pdf?.webViewLink || null,
      drive_xml_link: driveResults.xml?.webViewLink || null,
      nome_arquivo: nomeArquivoPadrao,
      equipe_msg: equipeMsg,
      is_equipe: isEquipe,
      is_nota_valida: contractStatus.valid,
      contract_valid: contractStatus.valid,
      contract_end_date: teamMember?.data_fim_contrato,
      data_origem_bancaria: dataOrigemBancaria,
      cross_validation: crossValidation,
      pontos_criticos: pontos_criticos_final,
      alertas: alertas_final,
      resumo_conformidade: contractStatus.valid ? 'Nota gravada com contrato válido. Dados bancários conferidos.' : 'Nota gravada com contrato vencido ou ausente.',
      recomendacao_final: contractStatus.valid ? 'Aguardar aprovação da coordenação.' : 'Renove o contrato antes de efetuar o pagamento.',
      nota: {
        numero,
        valor_total: valor,
        descricao_servico: aiExtracted?.descricao_servico || '',
        data_emissao: aiExtracted?.data_emissao || '',
      },
      emitente: {
        nome: aiExtracted?.fornecedor_nome || '',
        cnpj_cpf: aiExtracted?.fornecedor_cnpj || '',
      },
      banco: {
        nome: aiExtracted?.banco_nome || '',
        pix: aiExtracted?.banco_pix || '',
        conta: aiExtracted?.banco_conta || '',
        favorecido: aiExtracted?.banco_favorecido || '',
      },
    });
  } catch (error) {
    console.error('analyzeInvoiceFull error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});