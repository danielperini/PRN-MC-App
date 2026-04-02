import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DOCUMENTOS_FOLDER_ID = '1psLJvyj6sNuO7kscJIjrCsINgRBTQq_1';

async function findFolder(accessToken, folderName, parentId) {
  const q = encodeURIComponent(`name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentId) {
  return await findFolder(accessToken, folderName, parentId) || await createFolder(accessToken, folderName, parentId);
}

async function uploadOrReplaceJson(accessToken, fileName, content, parentFolderId) {
  // Verificar se já existe arquivo com esse nome na pasta (para substituir)
  const q = encodeURIComponent(`name='${fileName}' and '${parentFolderId}' in parents and trashed=false`);
  const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const searchData = await search.json();
  const existingId = searchData.files?.[0]?.id;

  const jsonStr = JSON.stringify(content, null, 2);
  const boundary = 'report_backup_boundary';
  const enc = new TextEncoder();

  if (existingId) {
    // Atualizar arquivo existente
    const body = enc.encode(jsonStr);
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&fields=id,webViewLink`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body
    });
    return await res.json();
  }

  // Criar novo arquivo
  const meta = JSON.stringify({ name: fileName, parents: [parentFolderId], mimeType: 'application/json' });
  const part1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
  const part2 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${jsonStr}\r\n`);
  const part3 = enc.encode(`--${boundary}--`);
  const bodyArr = new Uint8Array(part1.length + part2.length + part3.length);
  bodyArr.set(part1, 0);
  bodyArr.set(part2, part1.length);
  bodyArr.set(part3, part1.length + part2.length);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: bodyArr
  });
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { reportId } = await req.json();
    if (!reportId) return Response.json({ error: 'reportId obrigatório' }, { status: 400 });

    // Buscar relatório completo
    const report = await base44.asServiceRole.entities.Report.get(reportId);
    if (!report) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    // Buscar atividades salvas separadamente
    const activities = await base44.asServiceRole.entities.Activity.filter(
      { report_id: reportId }, '-updated_date', 500
    );

    // Buscar anexos do relatório
    const attachments = await base44.asServiceRole.entities.Attachment.filter(
      { report_id: reportId }, '-created_date', 500
    );

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Estrutura de pastas: Documentos / Relatórios / {ano} / {mes} / {protocolo}
    const ano = String(report.ano || new Date().getFullYear());
    const mes = report.mes_referencia || 'SemMes';
    const protocolo = report.numero_protocolo || reportId;

    const relatoriosFolderId = await getOrCreateFolder(accessToken, 'Relatórios', DOCUMENTOS_FOLDER_ID);
    const anoFolderId = await getOrCreateFolder(accessToken, ano, relatoriosFolderId);
    const mesFolderId = await getOrCreateFolder(accessToken, mes, anoFolderId);
    const reportFolderId = await getOrCreateFolder(accessToken, protocolo, mesFolderId);

    const timestamp = new Date().toISOString();

    // 1. Salvar dados completos do relatório
    const reportBackup = await uploadOrReplaceJson(
      accessToken,
      `${protocolo}_relatorio.json`,
      {
        backup_timestamp: timestamp,
        backup_by: user.email,
        relatorio: report,
        total_atividades: activities.length,
        total_anexos: attachments.length,
      },
      reportFolderId
    );

    // 2. Salvar atividades completas
    let activitiesBackup = null;
    if (activities.length > 0) {
      activitiesBackup = await uploadOrReplaceJson(
        accessToken,
        `${protocolo}_atividades.json`,
        {
          backup_timestamp: timestamp,
          report_id: reportId,
          protocolo,
          atividades: activities,
        },
        reportFolderId
      );
    }

    // 3. Salvar índice de anexos/documentos
    let attachmentsBackup = null;
    if (attachments.length > 0) {
      attachmentsBackup = await uploadOrReplaceJson(
        accessToken,
        `${protocolo}_documentos.json`,
        {
          backup_timestamp: timestamp,
          report_id: reportId,
          protocolo,
          documentos: attachments.map(a => ({
            id: a.id,
            file_name: a.file_name,
            file_type: a.file_type,
            file_url: a.file_url,
            description: a.description,
            created_date: a.created_date,
          })),
        },
        reportFolderId
      );
    }

    // Registrar no AuditLog
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'UPDATE',
      entity_type: 'REPORT',
      entity_id: reportId,
      actor_email: user.email,
      actor_name: user.full_name,
      details: `Backup no Drive: ${protocolo} — ${activities.length} atividades, ${attachments.length} documentos`,
    });

    return Response.json({
      success: true,
      protocolo,
      pasta_drive: `Relatórios/${ano}/${mes}/${protocolo}`,
      arquivos_salvos: {
        relatorio: !!reportBackup?.id,
        atividades: !!activitiesBackup?.id,
        documentos: !!attachmentsBackup?.id,
      },
      contagens: {
        atividades: activities.length,
        documentos: attachments.length,
      },
      timestamp,
    });

  } catch (error) {
    console.error('Erro no backup:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});