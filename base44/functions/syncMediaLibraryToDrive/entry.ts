import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const IMAGENS_FOLDER_NAME = 'Imagens';

// Meses mapeados para nomes em português
const MESES = {
  '01': '01 - Janeiro',
  '02': '02 - Fevereiro',
  '03': '03 - Março',
  '04': '04 - Abril',
  '05': '05 - Maio',
  '06': '06 - Junho',
  '07': '07 - Julho',
  '08': '08 - Agosto',
  '09': '09 - Setembro',
  '10': '10 - Outubro',
  '11': '11 - Novembro',
  '12': '12 - Dezembro',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportPhotoId, fileUrl, fileName, museu, activity, activityDate, reportId } = await req.json();

    if (!fileUrl || !fileName) {
      return Response.json({ error: 'fileUrl and fileName required' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Baixar arquivo
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.statusText}`);
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    
    // Gerar hash SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const fileHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Extrair data da foto ou usar data atual
    const photoDate = activityDate ? new Date(activityDate) : new Date();
    const year = photoDate.getFullYear().toString();
    const month = String(photoDate.getMonth() + 1).padStart(2, '0');
    const monthName = MESES[month] || month;
    const dateStr = photoDate.toISOString().split('T')[0];

    // Classificação automática (fallback se não fornecido)
    const classifiedMuseu = museu || 'GERAL';
    const classifiedActivity = activity || 'Sem Classificação';

    // Obter access token do Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Criar estrutura de pastas
    const imagensFolder = await getOrCreateFolder(accessToken, ROOT_FOLDER_ID, IMAGENS_FOLDER_NAME);
    const yearFolder = await getOrCreateFolder(accessToken, imagensFolder.id, year);
    const monthFolder = await getOrCreateFolder(accessToken, yearFolder.id, monthName);
    const museuFolder = await getOrCreateFolder(accessToken, monthFolder.id, classifiedMuseu);
    const activityFolder = await getOrCreateFolder(accessToken, museuFolder.id, classifiedActivity);

    // Verificar duplicidade (hash)
    const existingFile = await checkDuplicateFile(accessToken, activityFolder.id, fileHash);
    if (existingFile) {
      // Atualizar registro com info de duplicidade
      if (reportPhotoId) {
        await base44.entities.ReportPhoto.update(reportPhotoId, {
          backup_status: 'DUPLICADO_IGNORADO',
          duplicate_file_id: existingFile.id,
          file_hash: fileHash,
        });
      }
      return Response.json({
        success: true,
        action: 'DUPLICATED',
        message: 'File already exists in Drive',
        fileId: existingFile.id,
      });
    }

    // Gerar nome padronizado
    const extension = fileName.split('.').pop();
    const sequence = String(await countFilesInFolder(accessToken, activityFolder.id) + 1).padStart(2, '0');
    const standardName = `FOTO - ${classifiedActivity} - ${classifiedMuseu} - ${dateStr} - ${sequence}.${extension}`;

    // Upload do arquivo
    const uploadedFile = await uploadFileToFolder(accessToken, activityFolder.id, standardName, fileBuffer);

    // Atualizar registro no sistema
    if (reportPhotoId) {
      await base44.entities.ReportPhoto.update(reportPhotoId, {
        drive_file_id: uploadedFile.id,
        drive_file_url: uploadedFile.webViewLink,
        backup_status: 'BACKUP_OK',
        backup_synced_at: new Date().toISOString(),
        file_hash: fileHash,
        backup_folder_path: `${IMAGENS_FOLDER_NAME}/${year}/${monthName}/${classifiedMuseu}/${classifiedActivity}`,
      });
    }

    // Log de sucesso
    console.log(`[BACKUP OK] ${standardName} → ${classifiedMuseu}/${classifiedActivity}`);

    return Response.json({
      success: true,
      action: 'UPLOADED',
      fileId: uploadedFile.id,
      fileUrl: uploadedFile.webViewLink,
      fileName: standardName,
      folderPath: `${IMAGENS_FOLDER_NAME}/${year}/${monthName}/${classifiedMuseu}/${classifiedActivity}`,
    });
  } catch (error) {
    console.error('Sync media error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Funções auxiliares

async function getOrCreateFolder(accessToken, parentId, folderName) {
  // Procurar pasta existente
  const query = `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }

  // Criar nova pasta
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });

  return await createResponse.json();
}

async function checkDuplicateFile(accessToken, folderId, fileHash) {
  const query = `'${folderId}' in parents and properties has { key='file_hash' and value='${fileHash}' } and trashed=false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

async function countFilesInFolder(accessToken, folderId) {
  const query = `'${folderId}' in parents and trashed=false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  return data.files ? data.files.length : 0;
}

async function uploadFileToFolder(accessToken, folderId, fileName, fileBuffer) {
  // Gerar hash SHA-256 para propriedade
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const fileHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const metadata = {
    name: fileName,
    parents: [folderId],
    properties: {
      file_hash: fileHash,
    },
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileBuffer]));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const data = await response.json();
  if (!data.id) throw new Error(`Upload failed: ${data.error?.message || 'Unknown error'}`);

  return data;
}