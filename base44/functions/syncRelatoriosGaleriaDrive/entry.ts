import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Pasta raiz do Drive onde estão organizados os relatórios e galerias
// Estrutura esperada: Museus Centro / Relatórios / {Museu} / {Mês}
//                    Museus Centro / Galeria / {Museu} / {Mês}
const DRIVE_ROOT_FOLDER_NAME = 'Museus Centro';

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  // Busca pasta existente
  const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (data.files && data.files.length > 0) return data.files[0].id;

  // Cria a pasta
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const created = await createRes.json();
  return created.id;
}

async function uploadFileToDrive(accessToken: string, fileUrl: string, fileName: string, folderId: string, mimeType = 'image/jpeg'): Promise<{ id: string; webViewLink: string } | null> {
  try {
    // Baixar o arquivo da URL
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return null;
    const fileBuffer = await fileRes.arrayBuffer();

    // Verificar se já existe no Drive
    const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const existsRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,webViewLink)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const existsData = await existsRes.json();
    if (existsData.files && existsData.files.length > 0) {
      return { id: existsData.files[0].id, webViewLink: existsData.files[0].webViewLink };
    }

    // Upload multipart
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
    const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`;
    const dataPart = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;
    const closepart = closeDelimiter;

    const encoder = new TextEncoder();
    const metaBytes = encoder.encode(metaPart);
    const dataHeaderBytes = encoder.encode(dataPart);
    const closeBytes = encoder.encode(closepart);

    const body = new Uint8Array(metaBytes.length + dataHeaderBytes.length + fileBuffer.byteLength + closeBytes.length);
    body.set(metaBytes, 0);
    body.set(dataHeaderBytes, metaBytes.length);
    body.set(new Uint8Array(fileBuffer), metaBytes.length + dataHeaderBytes.length);
    body.set(closeBytes, metaBytes.length + dataHeaderBytes.length + fileBuffer.byteLength);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`,
        },
        body,
      }
    );
    if (!uploadRes.ok) return null;
    return await uploadRes.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuthenticated = await base44.auth.isAuthenticated();
    // Permite acesso autenticado ou chamadas do sistema (automações agendadas)
    const isSystemCall = req.headers.get('x-base44-system') === 'true';
    if (!isAuthenticated && !isSystemCall) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const modo = payload.modo || 'galeria'; // 'galeria' | 'relatorios' | 'ambos'
    const limite = payload.limite || 50; // fotos por execução

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // 1. Encontrar pasta raiz no Drive
    const rootRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${DRIVE_ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const rootData = await rootRes.json();
    let rootFolderId = rootData.files?.[0]?.id;

    if (!rootFolderId) {
      // Criar pasta raiz no root do Drive
      const createRoot = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: DRIVE_ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
      });
      const created = await createRoot.json();
      rootFolderId = created.id;
    }

    const resultados = { relatorios: { processados: 0, enviados: 0, erros: 0 }, galeria: { processados: 0, enviados: 0, erros: 0 } };

    // 2. SYNC DE RELATÓRIOS MENSAIS (PDFs)
    if (modo === 'relatorios' || modo === 'ambos') {
      const relatoriosFolderId = await findOrCreateFolder(accessToken, 'Relatórios Mensais', rootFolderId);
      const reports = await base44.asServiceRole.entities.Report.filter(
        { status: 'APPROVED', drive_backup_status: { $nin: ['concluido'] } },
        '-updated_date', limite
      );

      for (const report of reports) {
        resultados.relatorios.processados++;
        const pdfUrl = report.pdf_url || report.export_pdf_url;
        if (!pdfUrl) continue;

        try {
          const museuFolder = await findOrCreateFolder(accessToken, report.museu || 'Geral', relatoriosFolderId);
          const fileName = `Relatório_${report.museu}_${report.mes_referencia}_${report.ano || 2026}_${report.author_name || ''}.pdf`;
          const uploaded = await uploadFileToDrive(accessToken, pdfUrl, fileName, museuFolder, 'application/pdf');

          if (uploaded) {
            await base44.asServiceRole.entities.Report.update(report.id, {
              drive_backup_status: 'concluido',
              drive_backup_relatorio_url: uploaded.webViewLink,
              drive_backup_at: new Date().toISOString(),
            });
            resultados.relatorios.enviados++;
          } else {
            resultados.relatorios.erros++;
          }
        } catch {
          resultados.relatorios.erros++;
        }
      }
    }

    // 3. SYNC DE GALERIA (fotos por museu/mês)
    if (modo === 'galeria' || modo === 'ambos') {
      const galeriaFolderId = await findOrCreateFolder(accessToken, 'Galeria de Fotos', rootFolderId);

      // Buscar fotos sem backup no Drive
      const fotos = await base44.asServiceRole.entities.ReportPhoto.filter(
        { drive_backup_status: { $nin: ['concluido'] } },
        'created_date', limite
      );

      for (const foto of fotos) {
        resultados.galeria.processados++;
        if (!foto.file_url) continue;

        try {
          const museuNome = foto.museu || 'Geral';
          const mesNome = foto.mes_referencia || 'Geral';
          const museuFolder = await findOrCreateFolder(accessToken, museuNome, galeriaFolderId);
          const mesFolder = await findOrCreateFolder(accessToken, `${mesNome} ${foto.ano || 2026}`, museuFolder);

          const fileName = foto.file_name || `foto_${foto.id}.jpg`;
          const uploaded = await uploadFileToDrive(accessToken, foto.file_url, fileName, mesFolder, 'image/jpeg');

          if (uploaded) {
            await base44.asServiceRole.entities.ReportPhoto.update(foto.id, {
              drive_backup_status: 'concluido',
              drive_file_id: uploaded.id,
            });
            resultados.galeria.enviados++;
          } else {
            resultados.galeria.erros++;
          }
        } catch {
          resultados.galeria.erros++;
        }
      }
    }

    // 4. Registrar log
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'reports',
      entity_type: 'SYNC_RELATORIOS_GALERIA',
      status: 'success',
      processed_at: new Date().toISOString(),
      details: JSON.stringify(resultados),
      total_files: resultados.relatorios.processados + resultados.galeria.processados,
      files_copied: resultados.relatorios.enviados + resultados.galeria.enviados,
      triggered_by: 'manual',
    });

    return Response.json({ ok: true, resultados });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});