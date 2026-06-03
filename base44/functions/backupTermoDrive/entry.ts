import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ROOT_FOLDER_ID = '1wn3W0A4VDJT8ryn0pQX849Twy7HP5I7s';

async function getOrCreateFolder(accessToken, parentId, name) {
  // Busca pasta existente
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )}&fields=files(id,name)`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  // Cria pasta
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  const created = await createRes.json();
  return created.id;
}

async function checkFileExists(accessToken, folderId, fileName) {
  const q = `'${folderId}' in parents and name='${fileName}' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.files && data.files.length > 0;
}

async function uploadFile(accessToken, folderId, fileName, pdfBase64) {
  // Verifica se arquivo já existe; se sim, acrescenta versão
  let finalName = fileName;
  let version = 2;
  while (await checkFileExists(accessToken, folderId, finalName + '.pdf')) {
    finalName = `${fileName} v${version}`;
    version++;
  }
  finalName = finalName + '.pdf';

  const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));

  const boundary = '-------314159265358979323846';
  const metadata = JSON.stringify({ name: finalName, parents: [folderId] });

  // Multipart upload
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/pdf',
    '',
  ].join('\r\n');

  const bodyBytes = new TextEncoder().encode(body + '\r\n');
  const endBytes = new TextEncoder().encode(`\r\n--${boundary}--`);
  const combined = new Uint8Array(bodyBytes.length + pdfBytes.length + endBytes.length);
  combined.set(bodyBytes, 0);
  combined.set(pdfBytes, bodyBytes.length);
  combined.set(endBytes, bodyBytes.length + pdfBytes.length);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
        'Content-Length': String(combined.length),
      },
      body: combined,
    }
  );

  const uploaded = await uploadRes.json();
  return { fileId: uploaded.id, fileName: finalName, webViewLink: uploaded.webViewLink };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const { numero_tc, contratado_nome, funcao, valor_total, ano, pdf_base64, termo_id } = await req.json();

    if (!pdf_base64) return Response.json({ error: 'pdf_base64 obrigatório' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Monta nome do arquivo
    const nomeContratadoUpper = (contratado_nome || 'CONTRATADO').toUpperCase();
    const funcaoUpper = (funcao || '').toUpperCase();
    const valorFormatado = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(
      parseFloat(valor_total) || 0
    );
    const nomeArquivo = `${numero_tc} - ${nomeContratadoUpper}${funcaoUpper ? ' - ' + funcaoUpper : ''} - MUSEUS CENTRO - R$ ${valorFormatado}`;

    // Monta estrutura de pastas
    const anoStr = String(ano || new Date().getFullYear());
    const pastaTermos = await getOrCreateFolder(accessToken, ROOT_FOLDER_ID, 'Termos de Compromisso');
    const pastaAno = await getOrCreateFolder(accessToken, pastaTermos, anoStr);
    const pastaMuseus = await getOrCreateFolder(accessToken, pastaAno, 'Museus Centro');
    const pastaContratado = await getOrCreateFolder(accessToken, pastaMuseus, nomeContratadoUpper);

    // Upload
    const { fileId, fileName, webViewLink } = await uploadFile(
      accessToken,
      pastaContratado,
      nomeArquivo,
      pdf_base64
    );

    const caminhoCompleto = `Termos de Compromisso/${anoStr}/Museus Centro/${nomeContratadoUpper}/${fileName}`;

    // Atualiza registro do termo com URL do Drive
    if (termo_id) {
      await base44.asServiceRole.entities.TermoCompromisso.update(termo_id, {
        drive_backup_url: webViewLink,
        drive_backup_path: caminhoCompleto,
        drive_backup_status: 'concluido',
        drive_backup_at: new Date().toISOString(),
        drive_file_id: fileId,
        drive_file_name: fileName,
      });
    }

    return Response.json({
      success: true,
      fileId,
      fileName,
      webViewLink,
      caminho: caminhoCompleto,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});