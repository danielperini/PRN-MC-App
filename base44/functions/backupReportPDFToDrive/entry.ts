import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const RELATORIOS_FOLDER_NAME = 'Relatorios Exportados';
const FISICO_FINANCEIRO_FOLDER_NAME = 'Relatorios Fisico-Financeiros';

// Converte nome do mês para número
function getMonthNumber(monthName) {
  const months = {
    'Janeiro': '01',
    'Fevereiro': '02',
    'Março': '03',
    'Abril': '04',
    'Maio': '05',
    'Junho': '06',
    'Julho': '07',
    'Agosto': '08',
    'Setembro': '09',
    'Outubro': '10',
    'Novembro': '11',
    'Dezembro': '12',
  };
  return months[monthName] || '00';
}

// Constrói nome da pasta de mês (ex: "05 - Maio")
function buildMonthFolderName(monthName, year) {
  const monthNum = getMonthNumber(monthName);
  return `${monthNum} - ${monthName}`;
}

// Encontra ou cria pasta recursivamente
async function findOrCreateFolder(accessToken, parentFolderId, folderName) {
  try {
    // Busca pasta existente
    const query = `'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&pageSize=1&fields=files(id,name)`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // Cria pasta se não existir
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });

    const createData = await createRes.json();
    if (!createData.id) {
      throw new Error(`Falha ao criar pasta: ${folderName}`);
    }

    return createData.id;
  } catch (error) {
    throw new Error(`Erro ao gerenciar pasta ${folderName}: ${error.message}`);
  }
}

// Upload de arquivo para Drive
async function uploadFileToDrive(accessToken, parentFolderId, fileName, fileContent, mimeType = 'application/pdf') {
  try {
    const metadata = {
      name: fileName,
      parents: [parentFolderId],
      mimeType,
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: mimeType }));

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: form,
    });

    const data = await res.json();
    if (!data.id) {
      throw new Error(`Falha no upload: ${data.error?.message || 'Erro desconhecido'}`);
    }

    return {
      file_id: data.id,
      file_url: data.webViewLink,
      file_name: data.name,
    };
  } catch (error) {
    throw new Error(`Erro ao fazer upload: ${error.message}`);
  }
}

// Deleta versão antiga do arquivo se existir
async function deleteOldVersion(accessToken, parentFolderId, fileName) {
  try {
    const query = `'${parentFolderId}' in parents and name='${fileName}' and trashed=false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const data = await res.json();

    if (data.files && data.files.length > 0) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${data.files[0].id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
    }
  } catch (error) {
    console.warn(`Aviso ao deletar versão antiga: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      reportId,
      pdfContent,
      isFisicoFinanceiro = false,
      museu = null,
      mes = null,
      ano = null,
      userName = null,
      periodo = null,
    } = await req.json();

    if (!reportId || !pdfContent) {
      return Response.json(
        { error: 'reportId e pdfContent são obrigatórios' },
        { status: 400 }
      );
    }

    // Obtém token de acesso do Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Define estrutura de pastas
    let parentFolderId = ROOT_FOLDER_ID;
    let fileName = '';

    if (isFisicoFinanceiro) {
      // Relatório Físico-Financeiro
      parentFolderId = await findOrCreateFolder(accessToken, ROOT_FOLDER_ID, FISICO_FINANCEIRO_FOLDER_NAME);
      parentFolderId = await findOrCreateFolder(accessToken, parentFolderId, String(ano));
      const monthFolder = buildMonthFolderName(mes, ano);
      parentFolderId = await findOrCreateFolder(accessToken, parentFolderId, monthFolder);

      fileName = `RELATORIO FISICO-FINANCEIRO - ${mes} ${ano} - ${museu || 'Museus Centro'}.pdf`;
    } else {
      // Relatório Individual de Usuário
      parentFolderId = await findOrCreateFolder(accessToken, ROOT_FOLDER_ID, RELATORIOS_FOLDER_NAME);
      parentFolderId = await findOrCreateFolder(accessToken, parentFolderId, String(ano));
      const monthFolder = buildMonthFolderName(mes, ano);
      parentFolderId = await findOrCreateFolder(accessToken, parentFolderId, monthFolder);

      fileName = `RELATORIO - ${userName} - ${museu} - ${mes} ${ano}.pdf`;
    }

    // Deleta versão antiga se existir (não duplica)
    await deleteOldVersion(accessToken, parentFolderId, fileName);

    // Faz upload do arquivo
    const uploadResult = await uploadFileToDrive(
      accessToken,
      parentFolderId,
      fileName,
      pdfContent,
      'application/pdf'
    );

    // Atualiza registro no banco de dados
    if (!isFisicoFinanceiro) {
      await base44.asServiceRole.entities.Report.update(reportId, {
        drive_file_id: uploadResult.file_id,
        drive_file_url: uploadResult.file_url,
        exported_pdf_url: uploadResult.file_url,
        exported_at: new Date().toISOString(),
        export_status: 'EXPORTADO',
      });
    }

    return Response.json({
      success: true,
      file_id: uploadResult.file_id,
      file_url: uploadResult.file_url,
      file_name: uploadResult.file_name,
      message: 'Relatório exportado e backup realizado com sucesso',
    });
  } catch (error) {
    console.error('Erro em backupReportPDFToDrive:', error);
    return Response.json(
      { error: error.message || 'Erro ao fazer backup do relatório' },
      { status: 500 }
    );
  }
});