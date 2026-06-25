import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obter conexão do Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Buscar todos os relatórios aprovados
    const reports = await base44.asServiceRole.entities.Report.list('-created_date', 500);
    
    if (!Array.isArray(reports) || reports.length === 0) {
      return Response.json({ success: true, message: 'Nenhum relatório encontrado', processados: 0 });
    }

    // Filtrar apenas relatórios aprovados
    const approvedReports = reports.filter(r => 
      r.status === 'APROVADO' || r.status === 'FINALIZADO' || r.aprovado === true
    );

    if (approvedReports.length === 0) {
      return Response.json({ success: true, message: 'Nenhum relatório aprovado encontrado', processados: 0 });
    }

    // Criar ou encontrar pasta principal "Relatórios"
    const folderName = 'Relatórios';
    let mainFolderId = null;

    // Buscar pasta existente
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      { headers: authHeader }
    );
    const searchData = await searchRes.json();
    
    if (searchData.files && searchData.files.length > 0) {
      mainFolderId = searchData.files[0].id;
    } else {
      // Criar pasta principal
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      const createData = await createRes.json();
      mainFolderId = createData.id;
    }

    let processados = 0;
    let erros = 0;
    const errosDetalhe = [];

    // Processar cada relatório aprovado
    for (const report of approvedReports) {
      try {
        // Verificar se já tem backup
        if (report.drive_backup_relatorio_url && report.drive_backup_relatorio_id) {
          processados++;
          continue;
        }

        // Determinar tipo de relatório para organização em subpastas
        const tipoRelatorio = report.tipo || 'geral';
        const subfolderName = `Relatórios ${tipoRelatorio.charAt(0).toUpperCase() + tipoRelatorio.slice(1)}`;
        
        // Criar/encontrar subpasta do tipo
        let subFolderId = null;
        const subfolderSearchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${subfolderName}' and mimeType='application/vnd.google-apps.folder' and '${mainFolderId}' in parents and trashed=false`,
          { headers: authHeader }
        );
        const subfolderSearchData = await subfolderSearchRes.json();
        
        if (subfolderSearchData.files && subfolderSearchData.files.length > 0) {
          subFolderId = subfolderSearchData.files[0].id;
        } else {
          const subfolderCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: subfolderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [mainFolderId]
            })
          });
          const subfolderCreateData = await subfolderCreateRes.json();
          subFolderId = subfolderCreateData.id;
        }

        // Gerar nome do arquivo padronizado
        const museu = report.museu || 'Geral';
        const mes = report.mes_referencia || 'SemMes';;
        const ano = report.ano_referencia || new Date().getFullYear();
        const safeName = `${ano}_${mes}_${museu}_${report.id}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '_');

        // Verificar se já existe arquivo com este nome
        const fileSearchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${safeName}' and '${subFolderId}' in parents and trashed=false`,
          { headers: authHeader }
        );
        const fileSearchData = await fileSearchRes.json();
        
        if (fileSearchData.files && fileSearchData.files.length > 0) {
          // Arquivo já existe, apenas atualizar referência
          const existingFile = fileSearchData.files[0];
          await base44.asServiceRole.entities.Report.update(report.id, {
            drive_backup_relatorio_url: `https://drive.google.com/file/d/${existingFile.id}/view`,
            drive_backup_relatorio_id: existingFile.id,
            drive_backup_status: 'concluido',
            drive_backup_at: new Date().toISOString()
          });
          processados++;
          continue;
        }

        // Se tiver PDF gerado, fazer upload
        if (report.pdf_url || report.export_pdf_url) {
          const pdfUrl = report.pdf_url || report.export_pdf_url;
          
          // Download do PDF
          const pdfRes = await fetch(pdfUrl);
          const pdfBlob = await pdfRes.blob();
          const arrayBuffer = await pdfBlob.arrayBuffer();

          // Upload para Drive
          const formData = new FormData();
          const metadata = {
            name: safeName,
            parents: [subFolderId]
          };
          
          formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          formData.append('file', new Blob([arrayBuffer], { type: 'application/pdf' }));

          const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: authHeader,
            body: formData
          });

          const uploadData = await uploadRes.json();
          
          if (uploadData.id) {
            await base44.asServiceRole.entities.Report.update(report.id, {
              drive_backup_relatorio_url: `https://drive.google.com/file/d/${uploadData.id}/view`,
              drive_backup_relatorio_id: uploadData.id,
              drive_backup_status: 'concluido',
              drive_backup_at: new Date().toISOString()
            });
            processados++;
          } else {
            erros++;
            errosDetalhe.push({ report_id: report.id, erro: uploadData.error?.message || 'Falha no upload' });
          }
        } else {
          // Sem PDF disponível
          await base44.asServiceRole.entities.Report.update(report.id, {
            drive_backup_status: 'sem_arquivo',
            drive_backup_at: new Date().toISOString()
          });
          processados++;
        }
      } catch (error) {
        erros++;
        errosDetalhe.push({ report_id: report.id, erro: error.message });
        console.error(`Erro ao processar relatório ${report.id}:`, error);
      }
    }

    return Response.json({
      success: true,
      message: `Backup concluído: ${processados} relatórios processados`,
      processados,
      erros,
      errosDetalhe: errosDetalhe.slice(0, 10) // Limitar a 10 erros no response
    });

  } catch (error) {
    console.error('Erro no backup de relatórios:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});