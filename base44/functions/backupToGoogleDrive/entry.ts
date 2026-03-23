import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// =============================================
// MAPA OFICIAL DE PASTAS NO GOOGLE DRIVE
// =============================================
// Contratos:          1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7  (raiz - subpastas por membro)
// Documentos/Docs:    1psLJvyj6sNuO7kscJIjrCsINgRBTQq_1  (relatórios PDF, JSON, XLSX)
// Financeiro:         1KqVGVQDQPD6GSXpLxi4APaG8LWBTYy98  (planilha espelho rubricas)
// Fotos:              1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9  (subpastas por usuário)
// Notas Fiscais:      1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7  (subpastas por rubrica, dentro de "Notas Fiscais")
// =============================================

const DOCUMENTOS_FOLDER_ID = '1psLJvyj6sNuO7kscJIjrCsINgRBTQq_1';

async function findFolder(accessToken, folderName, parentFolderId) {
  const q = encodeURIComponent(`name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentFolderId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  return await findFolder(accessToken, folderName, parentFolderId) || await createFolder(accessToken, folderName, parentFolderId);
}

async function uploadJson(accessToken, fileName, data, parentFolderId) {
  const content = JSON.stringify(data, null, 2);
  const boundary = 'backup_json_boundary';
  const metaPart = JSON.stringify({ name: fileName, parents: [parentFolderId], mimeType: 'application/json' });
  const enc = new TextEncoder();
  const part1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`);
  const part2 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n`);
  const part3 = enc.encode(`--${boundary}--`);
  const body = new Uint8Array(part1.length + part2.length + part3.length);
  body.set(part1, 0);
  body.set(part2, part1.length);
  body.set(part3, part1.length + part2.length);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isCoordinator = ['admin', 'COORDENADOR', 'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA', 'COORD_COMUNICACAO'].includes(user.role);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Buscar dados conforme papel
    let reports, purchases, attachments;
    if (isCoordinator) {
      [reports, purchases, attachments] = await Promise.all([
        base44.asServiceRole.entities.Report.list('-updated_date', 1000),
        base44.asServiceRole.entities.PurchaseRequest.list('-updated_date', 1000),
        base44.asServiceRole.entities.Attachment.list('-updated_date', 1000)
      ]);
    } else {
      reports = await base44.entities.Report.filter({ created_by: user.email }, '-updated_date', 200);
      purchases = await base44.entities.PurchaseRequest.filter({ created_by: user.email }, '-updated_date', 200);
      const reportIds = reports.map(r => r.id);
      const allAtt = await base44.entities.Attachment.list('-updated_date', 500);
      attachments = allAtt.filter(a => reportIds.includes(a.report_id));
    }

    // Estrutura Documentos: subpastas por tipo e data
    const jsonFolderId = await getOrCreateFolder(accessToken, 'Backups JSON', DOCUMENTOS_FOLDER_ID);
    const dateFolderId = await getOrCreateFolder(accessToken, dateStr, jsonFolderId);

    const uploads = [];

    // Relatórios JSON
    if (reports.length > 0) {
      const r = await uploadJson(accessToken, `relatorios-${dateStr}.json`, {
        timestamp: now.toISOString(), count: reports.length,
        data: reports.map(r => ({
          id: r.id, numero_protocolo: r.numero_protocolo,
          author_name: r.author_name, mes_referencia: r.mes_referencia,
          ano: r.ano, status: r.status, museu: r.museu,
          created_date: r.created_date, updated_date: r.updated_date
        }))
      }, dateFolderId);
      uploads.push({ type: 'relatorios', file_id: r.id, count: reports.length });
    }

    // Compras JSON
    if (purchases.length > 0) {
      const r = await uploadJson(accessToken, `compras-${dateStr}.json`, {
        timestamp: now.toISOString(), count: purchases.length,
        data: purchases.map(p => ({
          id: p.id, descricao_item: p.descricao_item,
          valor_solicitado: p.valor_solicitado, valor_aprovado_admin: p.valor_aprovado_admin,
          fornecedor_nome: p.fornecedor_nome, status: p.status,
          nota_fiscal_url: p.nota_fiscal_url, created_date: p.created_date
        }))
      }, dateFolderId);
      uploads.push({ type: 'compras', file_id: r.id, count: purchases.length });
    }

    // Documentos/Anexos JSON index
    if (attachments.length > 0) {
      const r = await uploadJson(accessToken, `documentos-${dateStr}.json`, {
        timestamp: now.toISOString(), count: attachments.length,
        data: attachments.map(a => ({
          id: a.id, file_name: a.file_name, file_type: a.file_type,
          file_url: a.file_url, report_id: a.report_id, created_date: a.created_date
        }))
      }, dateFolderId);
      uploads.push({ type: 'documentos', file_id: r.id, count: attachments.length });
    }

    // Também acionar atualização da planilha espelho de rubricas
    try {
      await base44.functions.invoke('backupRubricasToDrive', {});
    } catch (e) {
      console.warn('Aviso: planilha espelho não atualizada:', e.message);
    }

    return Response.json({
      success: true,
      message: 'Backup geral concluído',
      timestamp: now.toISOString(),
      pasta_documentos: DOCUMENTOS_FOLDER_ID,
      uploads
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});