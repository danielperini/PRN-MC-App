import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { mes, ano, relatorio, mes_extenso, count_geral, total_geral_fmt } = body;

    if (!mes || !ano || !relatorio) {
      return Response.json({ error: 'Parâmetros obrigatórios: mes, ano, relatorio' }, { status: 400 });
    }

    // Monta o conteúdo CSV com BOM para UTF-8
    const linhas = [
      'Museu;Natureza da Despesa;NF;Fornecedor;Descrição;Valor;Meta;Rubrica;Data Emissão'
    ];
    for (const centro of relatorio) {
      for (const nat of (centro.naturezas || [])) {
        for (const item of (nat.itens || [])) {
          linhas.push([
            centro.centro_custo,
            nat.natureza,
            item.nf_numero || '',
            `"${(item.fornecedor || '').replace(/"/g, '""')}"`,
            `"${(item.descricao || '').replace(/"/g, '""')}"`,
            typeof item.valor === 'number' ? item.valor.toFixed(2).replace('.', ',') : '',
            item.meta || '',
            `"${(item.rubrica || '').replace(/"/g, '""')}"`,
            item.nf_data_emissao || ''
          ].join(';'));
        }
      }
    }

    const csvContent = '\uFEFF' + linhas.join('\n');
    const fileName = `Relatorio_NF_Consolidado_${mes}_${ano}.csv`;

    // Obtém o token do Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Busca ou cria a pasta "Museus Centro / Relatórios Financeiros" no Drive
    const folderName = 'Relatórios Financeiros MC';
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    let folderId = searchData.files?.[0]?.id;

    if (!folderId) {
      const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      const folderData = await createFolderRes.json();
      folderId = folderData.id;
    }

    // Upload do CSV via multipart
    const csvBytes = new TextEncoder().encode(csvContent);
    const boundary = '-------314159265358979323846';
    const metadataPart = JSON.stringify({
      name: fileName,
      parents: folderId ? [folderId] : [],
      description: `Relatório Consolidado NF — ${mes_extenso || `${mes}/${ano}`} — ${count_geral || ''} NFs — Total: ${total_geral_fmt || ''}`
    });

    const bodyParts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n`,
      `--${boundary}\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n`,
    ];
    const bodyStart = new TextEncoder().encode(bodyParts.join(''));
    const bodyEnd = new TextEncoder().encode(`\r\n--${boundary}--`);

    const fullBody = new Uint8Array(bodyStart.length + csvBytes.length + bodyEnd.length);
    fullBody.set(bodyStart, 0);
    fullBody.set(csvBytes, bodyStart.length);
    fullBody.set(bodyEnd, bodyStart.length + csvBytes.length);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`,
          'Content-Length': String(fullBody.length)
        },
        body: fullBody
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return Response.json({ error: `Falha no upload para o Drive: ${errText}` }, { status: 500 });
    }

    const fileData = await uploadRes.json();

    return Response.json({
      success: true,
      file_id: fileData.id,
      file_name: fileData.name,
      drive_url: fileData.webViewLink,
      folder_name: folderName,
      message: `Relatório "${fileName}" salvo com sucesso na pasta "${folderName}" do Google Drive.`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});