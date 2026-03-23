import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, fileId, fileName, mimeType } = body;

    // Obter token do Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    if (action === 'list') {
      // Listar pastas e arquivos do Drive
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?q=trashed=false&fields=id,name,mimeType,webViewLink,createdTime,size&pageSize=100&orderBy=name',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        return Response.json({ error: 'Erro ao acessar Google Drive' }, { status: 400 });
      }

      const data = await response.json();
      return Response.json({
        files: data.files.filter(f =>
          f.mimeType !== 'application/vnd.google-apps.folder' || // Incluir pastas para navegação
          f.mimeType === 'application/pdf' ||
          f.mimeType.startsWith('image/') ||
          f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          f.mimeType === 'application/msword' ||
          f.mimeType === 'application/vnd.ms-excel'
        )
      });
    }

    if (action === 'import') {
      // Fazer download do arquivo do Drive
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      
      const fileResponse = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!fileResponse.ok) {
        return Response.json({ error: 'Erro ao baixar arquivo' }, { status: 400 });
      }

      const fileBuffer = await fileResponse.arrayBuffer();
      
      // Fazer upload para o Base44
      const uploadResponse = await base44.asServiceRole.integrations.Core.UploadFile({
        file: new Blob([fileBuffer], { type: mimeType })
      });

      // Se for PDF, adicionar na base de conhecimento
      if (mimeType === 'application/pdf') {
        await base44.asServiceRole.entities.KnowledgeDocument.create({
          titulo: fileName.replace('.pdf', ''),
          categoria: 'Documento de Referência',
          versao: new Date().toLocaleDateString('pt-BR'),
          descricao: `Importado do Google Drive em ${new Date().toLocaleDateString('pt-BR')}`,
          file_url: uploadResponse.file_url,
          conteudo_extraido: `Arquivo: ${fileName}`,
          ativo: true
        });
      }

      return Response.json({
        success: true,
        file_url: uploadResponse.file_url,
        fileName
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});