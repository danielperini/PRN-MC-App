import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, old_data } = payload;

    // Apenas processar eventos de UPDATE onde status muda para APROVADO
    if (event.type !== 'update' || !data) {
      return new Response(JSON.stringify({ processed: false }), { status: 200 });
    }

    const purchase = data;
    const previousStatus = old_data?.status;
    const newStatus = purchase.status;

    // Verificar se mudou para APROVADO
    if (newStatus !== 'APROVADO' || previousStatus === 'APROVADO') {
      return new Response(JSON.stringify({ processed: false }), { status: 200 });
    }

    // Obter conector Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Google Drive não autorizado' }), { status: 403 });
    }

    // Data atual para estrutura de pastas
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthName = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleString('pt-BR', { month: 'long' });
    const folderPath = `Compras Aprovadas/${year}/${month} - ${monthName}`;

    // Buscar anexos da compra
    const attachments = await base44.asServiceRole.entities.Attachment.filter({
      report_id: purchase.report_id || '',
    });

    if (attachments.length === 0) {
      return new Response(JSON.stringify({ 
        processed: true, 
        message: 'Nenhum anexo encontrado',
        files_moved: 0,
      }), { status: 200 });
    }

    // Criar estrutura de pastas no Drive
    let parentFolderId = 'root';
    const folders = ['Compras Aprovadas', `${year}`, `${month} - ${monthName}`];

    for (const folderName of folders) {
      try {
        // Procurar pasta existente
        const searchResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&fields=files(id,name)`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        
        const searchData = await searchResponse.json();
        
        if (searchData.files && searchData.files.length > 0) {
          parentFolderId = searchData.files[0].id;
        } else {
          // Criar pasta se não existir
          const createResponse = await fetch(
            'https://www.googleapis.com/drive/v3/files?fields=id',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentFolderId],
              }),
            }
          );

          const createData = await createResponse.json();
          parentFolderId = createData.id;
        }
      } catch (error) {
        console.error(`Erro ao processar pasta ${folderName}:`, error);
      }
    }

    // Mover arquivos para a pasta
    let filesMoved = 0;
    const movedFiles = [];

    for (const attachment of attachments) {
      try {
        // Extrair file ID da URL (se for URL do Drive)
        const fileIdMatch = attachment.file_url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!fileIdMatch) {
          console.log(`Arquivo não é do Drive: ${attachment.file_name}`);
          continue;
        }

        const fileId = fileIdMatch[1];

        // Mover arquivo para a pasta
        const moveResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${parentFolderId}&removeParents=root&fields=id,parents`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (moveResponse.ok) {
          filesMoved++;
          movedFiles.push(attachment.file_name);
        }
      } catch (error) {
        console.error(`Erro ao mover arquivo ${attachment.file_name}:`, error);
      }
    }

    // Registrar atividade
    console.log(`Compra ${purchase.numero_protocolo || purchase.id} aprovada - ${filesMoved} arquivos movidos para Drive`);

    return new Response(JSON.stringify({
      processed: true,
      files_moved: filesMoved,
      moved_files: movedFiles,
      drive_folder: folderPath,
    }), { status: 200 });
  } catch (error) {
    console.error('Erro em movePurchaseFilesToDrive:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});