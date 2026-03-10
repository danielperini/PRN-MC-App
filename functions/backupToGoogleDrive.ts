import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta raiz oficial
const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

// Estrutura de pastas
const FOLDER_STRUCTURE = {
  'Relatórios em PDF': 'relatorios_pdf',
  'Financeiro': 'financeiro',
  'Notas Fiscais': 'notas_fiscais',
  'Fotos': 'fotos',
  'Documentos': 'documentos',
  'Contratos': 'contratos',
  'Orçamentos': 'orcamentos',
  'Prestação de Contas': 'prestacao_contas'
};

// Cria pasta no Google Drive
async function createFolder(accessToken, folderName, parentFolderId) {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

// Busca pastas existentes
async function findFolder(accessToken, folderName, parentFolderId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  const data = await response.json();
  const files = data.files || [];
  return files.length > 0 ? files[0].id : null;
}

// Faz upload de arquivo para Google Drive
async function uploadToGoogleDrive(accessToken, fileName, fileContent, parentFolderId) {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const metadata = {
    name: fileName,
    parents: [parentFolderId]
  };
  
  const multipartBody = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });
  
  return await response.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Obter conexão do Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    
    // Obter dados para backup
    const isCoordinator = ['admin', 'COORDENADOR', 'COORD_PRODUCAO', 'COORD_ADMINISTRATIVA', 'COORD_COMUNICACAO'].includes(user.role);
    
    let userReports = [];
    let userPurchases = [];
    let userAttachments = [];
    
    if (isCoordinator) {
      // Coordenador faz backup de TUDO
      userReports = await base44.asServiceRole.entities.Report.list('-updated_date', 1000);
      userPurchases = await base44.asServiceRole.entities.PurchaseRequest.list('-updated_date', 1000);
      userAttachments = await base44.asServiceRole.entities.Attachment.list('-updated_date', 1000);
    } else {
      // Usuário comum faz backup apenas dos seus arquivos
      const userEmail = user.email;
      userReports = await base44.entities.Report.filter({ created_by: userEmail }, '-updated_date', 500);
      userPurchases = await base44.entities.PurchaseRequest.filter({ created_by: userEmail }, '-updated_date', 500);
      
      const reportIds = userReports.map(r => r.id);
      const allAttachments = await base44.entities.Attachment.list('-updated_date', 500);
      userAttachments = allAttachments.filter(a => reportIds.includes(a.report_id));
    }
    
    // Obter ou criar estrutura de pastas
    const folderIds = {};
    for (const [displayName, key] of Object.entries(FOLDER_STRUCTURE)) {
      let folderId = await findFolder(accessToken, displayName, ROOT_FOLDER_ID);
      if (!folderId) {
        folderId = await createFolder(accessToken, displayName, ROOT_FOLDER_ID);
      }
      folderIds[key] = folderId;
    }
    
    // Criar pasta de data para organização
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timestamp = now.toISOString();
    
    // Upload de Relatórios
    if (userReports.length > 0) {
      const reportData = {
        timestamp,
        type: 'relatórios',
        count: userReports.length,
        data: userReports.map(r => ({
          id: r.id,
          numero_protocolo: r.numero_protocolo,
          author_name: r.author_name,
          mes_referencia: r.mes_referencia,
          ano: r.ano,
          status: r.status,
          created_date: r.created_date,
          updated_date: r.updated_date
        }))
      };
      
      await uploadToGoogleDrive(
        accessToken,
        `relatorios-${dateStr}.json`,
        JSON.stringify(reportData, null, 2),
        folderIds.relatorios_pdf
      );
    }
    
    // Upload de Notas Fiscais
    if (userPurchases.length > 0) {
      const notasFiscaisData = {
        timestamp,
        type: 'notas_fiscais',
        count: userPurchases.filter(p => p.nota_fiscal_url).length,
        data: userPurchases.filter(p => p.nota_fiscal_url).map(p => ({
          id: p.id,
          numero_nf: p.numero_nf,
          valor: p.valor_solicitado,
          fornecedor: p.fornecedor_nome,
          data_criacao: p.created_date,
          status: p.status,
          nota_fiscal_url: p.nota_fiscal_url
        }))
      };
      
      await uploadToGoogleDrive(
        accessToken,
        `notas_fiscais-${dateStr}.json`,
        JSON.stringify(notasFiscaisData, null, 2),
        folderIds.notas_fiscais
      );
    }
    
    // Upload de Orçamentos/Compras
    if (userPurchases.length > 0) {
      const orcamentosData = {
        timestamp,
        type: 'orcamentos',
        count: userPurchases.length,
        data: userPurchases.map(p => ({
          id: p.id,
          descricao_item: p.descricao_item,
          valor_solicitado: p.valor_solicitado,
          valor_aprovado_admin: p.valor_aprovado_admin,
          categoria: p.categoria,
          fornecedor_nome: p.fornecedor_nome,
          status: p.status,
          created_date: p.created_date,
          orcamento_url: p.orcamento_url
        }))
      };
      
      await uploadToGoogleDrive(
        accessToken,
        `orcamentos-${dateStr}.json`,
        JSON.stringify(orcamentosData, null, 2),
        folderIds.orcamentos
      );
    }
    
    // Upload de Documentos Gerais
    if (userAttachments.length > 0) {
      const documentosData = {
        timestamp,
        type: 'documentos',
        count: userAttachments.length,
        data: userAttachments.map(a => ({
          id: a.id,
          file_name: a.file_name,
          file_type: a.file_type,
          file_size: a.file_size,
          file_url: a.file_url,
          description: a.description,
          created_date: a.created_date
        }))
      };
      
      await uploadToGoogleDrive(
        accessToken,
        `documentos-${dateStr}.json`,
        JSON.stringify(documentosData, null, 2),
        folderIds.documentos
      );
    }
    
    // Upload de resumo de prestação de contas
    const prestacaoData = {
      timestamp,
      type: 'prestacao_contas',
      periodo: dateStr,
      resumo: {
        total_relatorios: userReports.length,
        relatorios_aprovados: userReports.filter(r => r.status === 'APPROVED').length,
        total_compras: userPurchases.length,
        compras_aprovadas: userPurchases.filter(p => p.status === 'APROVADO_ADMIN').length,
        compras_pagas: userPurchases.filter(p => p.status === 'PAGO').length,
        valor_total_compras: userPurchases.reduce((s, p) => s + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0)
      }
    };
    
    await uploadToGoogleDrive(
      accessToken,
      `prestacao_contas-${dateStr}.json`,
      JSON.stringify(prestacaoData, null, 2),
      folderIds.prestacao_contas
    );
    
    return Response.json({
      success: true,
      message: 'Backup organizado em pastas realizado com sucesso',
      timestamp,
      folders_created: Object.keys(folderIds).length,
      backups: {
        relatorios: userReports.length,
        notas_fiscais: userPurchases.filter(p => p.nota_fiscal_url).length,
        orcamentos: userPurchases.length,
        documentos: userAttachments.length,
        prestacao_contas: 1
      }
    });
  } catch (error) {
    console.error('Erro ao fazer backup:', error);
    return Response.json({
      error: error.message || 'Erro ao realizar backup'
    }, { status: 500 });
  }
});