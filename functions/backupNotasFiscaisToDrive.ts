import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta Notas Fiscais — subpastas por rubrica
const NOTAS_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const NOTAS_SUBFOLDER = 'Notas Fiscais';

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
  if (data.error) throw new Error(`Erro ao criar pasta: ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  return await findFolder(accessToken, folderName, parentFolderId) || await createFolder(accessToken, folderName, parentFolderId);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { file_url, file_name, purchase_id } = body;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Pasta raiz de Notas Fiscais dentro da raiz geral
    const notasFolderId = await getOrCreateFolder(accessToken, NOTAS_SUBFOLDER, NOTAS_FOLDER_ID);

    // Upload de nota fiscal avulsa (vinculada a uma compra/rubrica)
    if (file_url && file_name) {
      let rubricaName = 'Sem Rubrica';

      if (purchase_id) {
        const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchase_id).catch(() => null);
        if (purchase?.rubrica_id || purchase?.budget_line_id) {
          const rubricaId = purchase.rubrica_id || purchase.budget_line_id;
          const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId).catch(() => null);
          if (rubrica?.rubrica) rubricaName = rubrica.rubrica.replace(/[\/\\:*?"<>|]/g, '_');
        } else if (purchase?.categoria) {
          rubricaName = purchase.categoria.replace(/[\/\\:*?"<>|]/g, '_');
        }
      }

      const rubricaFolderId = await getOrCreateFolder(accessToken, rubricaName, notasFolderId);

      const fileResponse = await fetch(file_url);
      if (!fileResponse.ok) return Response.json({ error: 'Erro ao obter arquivo' }, { status: 400 });
      const fileBlob = await fileResponse.blob();

      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify({ name: file_name, parents: [rubricaFolderId] })], { type: 'application/json' }));
      formData.append('file', fileBlob, file_name);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });
      const result = await uploadRes.json();
      if (result.error) throw new Error('Erro upload: ' + result.error.message);

      return Response.json({
        success: true,
        message: `Nota fiscal salva em Notas Fiscais/${rubricaName}`,
        file_id: result.id,
        rubrica: rubricaName,
        drive_link: `https://drive.google.com/file/d/${result.id}/view`
      });
    }

    // Backup geral de notas fiscais (admin)
    const isAdmin = ['admin', 'COORDENADOR'].includes(user.role);
    if (!isAdmin) return Response.json({ error: 'Apenas admins podem executar backup geral' }, { status: 403 });

    const [rubricas, purchases, gastos] = await Promise.all([
      base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 200),
      base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.GastoRubrica.list('-created_date', 1000)
    ]);

    const rubricaMap = {};
    rubricas.forEach(r => { rubricaMap[r.id] = r.rubrica; });

    // Coletar todos os arquivos de NF vinculados
    const nfItems = [
      ...purchases.filter(p => p.nota_fiscal_url).map(p => ({
        url: p.nota_fiscal_url,
        name: `NF_${p.id}_${(p.fornecedor_nome || 'fornecedor').replace(/\s+/g, '_')}.pdf`,
        rubrica: rubricaMap[p.rubrica_id || p.budget_line_id] || p.categoria || 'Sem Rubrica'
      })),
      ...gastos.filter(g => g.nota_fiscal_url || g.arquivo_url).map(g => ({
        url: g.nota_fiscal_url || g.arquivo_url,
        name: `NF_gasto_${g.id}.pdf`,
        rubrica: rubricaMap[g.rubrica_id] || 'Sem Rubrica'
      }))
    ];

    let uploaded = 0;
    const errors = [];

    for (const item of nfItems) {
      if (!item.url) continue;
      try {
        const rubricaFolderName = item.rubrica.replace(/[\/\\:*?"<>|]/g, '_');
        const rubricaFolderId = await getOrCreateFolder(accessToken, rubricaFolderName, notasFolderId);

        const fileResponse = await fetch(item.url);
        if (!fileResponse.ok) continue;
        const fileBlob = await fileResponse.blob();

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify({ name: item.name, parents: [rubricaFolderId] })], { type: 'application/json' }));
        formData.append('file', fileBlob, item.name);

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData
        });
        uploaded++;
      } catch (e) {
        errors.push(`${item.name}: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      message: `Backup de notas fiscais concluído`,
      notas_enviadas: uploaded,
      total_itens: nfItems.length,
      erros: errors.length > 0 ? errors.slice(0, 10) : null
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});