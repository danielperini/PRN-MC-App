import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar se é admin/coordenador
    if (user.role !== 'admin' && !user.role?.includes('COORD')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { reportId, cursor } = body;

    // Obter conexão Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Pasta raiz "Relatórios" no Drive
    const parentFolderName = 'Relatórios';
    let parentFolderId = null;

    // Buscar ou criar pasta raiz "Relatórios"
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${parentFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      { headers: authHeader }
    );
    const searchData = await searchRes.json();
    
    if (searchData.files && searchData.files.length > 0) {
      parentFolderId = searchData.files[0].id;
    } else {
      // Criar pasta raiz
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: parentFolderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      const createData = await createRes.json();
      parentFolderId = createData.id;
    }

    let reports: any[] = [];
    let skip = 0;
    const limit = 10;

    if (cursor) {
      skip = parseInt(cursor, 10) || 0;
    }

    if (reportId) {
      // Backup de um relatório específico
      const report = await base44.entities.Report.get(reportId);
      if (!report) {
        return Response.json({ error: 'Report not found' }, { status: 404 });
      }
      reports = [report];
    } else {
      // Backup em lote - apenas aprovados com PDF
      const allReports = await base44.entities.Report.filter(
        { status: 'APROVADO' },
        '-updated_date',
        limit + skip
      );
      
      if (skip >= allReports.length) {
        return Response.json({
          success: true,
          processados: 0,
          temMais: false,
          cursor: '0'
        });
      }
      
      reports = allReports.slice(skip, skip + limit);
    }
    
    let processados = 0;
    let erros = 0;
    const errosDetalhe: any[] = [];

    for (const report of reports) {
      try {
        // Verificar se já tem backup recente (últimas 24h) - pular se não for update manual
        if (!reportId && report.drive_backup_status === 'concluido' && report.drive_backup_at) {
          const backupDate = new Date(report.drive_backup_at);
          const now = new Date();
          const hoursDiff = (now.getTime() - backupDate.getTime()) / (1000 * 60 * 60);
          
          if (hoursDiff < 24) {
            processados++;
            continue;
          }
        }

        // Obter URL do PDF
        const pdfUrl = report.export_pdf_url || report.pdf_url;
        if (!pdfUrl) {
          await base44.entities.Report.update(report.id, {
            drive_backup_status: 'sem_arquivo'
          });
          processados++;
          continue;
        }

        // Determinar tipo e subpasta
        const reportType = report.tipo || 'mensal';
        const mesRef = report.mes_referencia || 'Sem-Mes';
        const anoRef = report.ano_referencia || report.ano || new Date().getFullYear();
        
        const typeFolderMap: any = {
          'mensal': 'Relatórios Mensais',
          'parcial': 'Relatórios Parciais',
          'final': 'Relatórios Finais',
          'atividade': 'Relatórios de Atividade',
          'financeiro': 'Relatórios Financeiros'
        };
        
        const subFolderName = typeFolderMap[reportType] || 'Outros Relatórios';

        // Buscar ou criar subpasta do tipo
        let typeFolderId = null;
        const typeSearchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${subFolderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`,
          { headers: authHeader }
        );
        const typeSearchData = await typeSearchRes.json();
        
        if (typeSearchData.files && typeSearchData.files.length > 0) {
          typeFolderId = typeSearchData.files[0].id;
        } else {
          const typeCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: subFolderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentFolderId]
            })
          });
          const typeCreateData = await typeCreateRes.json();
          typeFolderId = typeCreateData.id;
        }

        // Buscar ou criar pasta do ano dentro da subpasta
        const yearFolderName = String(anoRef);
        let yearFolderId = null;
        const yearSearchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${yearFolderName}' and mimeType='application/vnd.google-apps.folder' and '${typeFolderId}' in parents and trashed=false`,
          { headers: authHeader }
        );
        const yearSearchData = await yearSearchRes.json();
        
        if (yearSearchData.files && yearSearchData.files.length > 0) {
          yearFolderId = yearSearchData.files[0].id;
        } else {
          const yearCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: yearFolderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [typeFolderId]
            })
          });
          const yearCreateData = await yearCreateRes.json();
          yearFolderId = yearCreateData.id;
        }

        // Buscar ou criar pasta do mês dentro do ano
        const monthFolderName = mesRef;
        let monthFolderId = null;
        const monthSearchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${monthFolderName}' and mimeType='application/vnd.google-apps.folder' and '${yearFolderId}' in parents and trashed=false`,
          { headers: authHeader }
        );
        const monthSearchData = await monthSearchRes.json();
        
        if (monthSearchData.files && monthSearchData.files.length > 0) {
          monthFolderId = monthSearchData.files[0].id;
        } else {
          const monthCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: monthFolderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [yearFolderId]
            })
          });
          const monthCreateData = await monthCreateRes.json();
          monthFolderId = monthCreateData.id;
        }

        // Verificar se arquivo já existe no Drive (por nome)
        const reportFileName = `Relatorio_${reportType}_${mesRef}_${anoRef}_${report.museu || 'Geral'}.pdf`;
        const existingFileSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${reportFileName}' and '${monthFolderId}' in parents and trashed=false`,
          { headers: authHeader }
        );
        const existingFileData = await existingFileSearch.json();

        if (existingFileData.files && existingFileData.files.length > 0) {
          // Arquivo já existe - apenas atualizar metadata
          const existingFileId = existingFileData.files[0].id;
          await base44.entities.Report.update(report.id, {
            drive_backup_relatorio_url: `https://drive.google.com/file/d/${existingFileId}/view`,
            drive_backup_relatorio_id: existingFileId,
            drive_backup_status: 'concluido',
            drive_backup_at: new Date().toISOString()
          });
          processados++;
          continue;
        }

        // Download do PDF
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error('Failed to download PDF');
        }
        const pdfArrayBuffer = await pdfResponse.arrayBuffer();

        // Upload para Google Drive
        const boundary = 'boundary_' + Date.now();
        const metadata = {
          name: reportFileName,
          parents: [monthFolderId]
        };

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            ...authHeader,
            'Content-Type': `multipart/related; boundary="${boundary}"`
          },
          body: [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            'Content-Type: application/pdf',
            '',
            '',
            String.fromCharCode.apply(null, Array.from(new Uint8Array(pdfArrayBuffer)) as any),
            `--${boundary}--`
          ].join('\r\n')
        });

        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(uploadData.error?.message || 'Upload failed');
        }

        const fileId = uploadData.id;
        const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

        // Atualizar relatório
        await base44.entities.Report.update(report.id, {
          drive_backup_relatorio_url: driveUrl,
          drive_backup_relatorio_id: fileId,
          drive_backup_status: 'concluido',
          drive_backup_at: new Date().toISOString()
        });

        processados++;
      } catch (error) {
        console.error('Erro ao fazer backup do relatório:', report?.id, error);
        erros++;
        errosDetalhe.push({
          reportId: report.id,
          error: error.message
        });
        
        await base44.entities.Report.update(report.id, {
          drive_backup_status: 'erro'
        }).catch(() => {});
      }
    }

    const temMais = !reportId && reports.length === limit;
    const nextCursor = temMais ? String(skip + limit) : '0';

    return Response.json({
      success: true,
      processados,
      erros,
      errosDetalhe,
      temMais,
      cursor: nextCursor
    });
  } catch (error) {
    console.error('Erro geral no backup de relatórios:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});