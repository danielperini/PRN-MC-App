import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MAX_FILES = 10000;
const PAGE_SIZE = 1000;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/xml',
  'application/xml',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function normalize(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function isInvoiceFile(file: any) {
  if (!ALLOWED_MIME.has(String(file?.mimeType || ''))) return false;
  const name = normalize(file?.name);
  if (['extrato', 'rendimento', 'contrato', 'aditivo', 'orcamento', 'proposta'].some((term) => name.includes(term))) return false;
  return /\bnf\b/.test(name) || name.includes('nota fiscal') || name.endsWith('.xml') || name.endsWith('.pdf');
}

function errorMessage(error: any) {
  return String(error?.message || error || 'Erro desconhecido').slice(0, 800);
}

Deno.serve(async (request) => {
  try {
    const base44 = createClientFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ success: false, error: 'Não autorizado' }, { status: 401 });

    const folderIds = [
      ...(Array.isArray(body.folder_ids) ? body.folder_ids : []),
      body.folder_id,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    if (!folderIds.length) {
      return Response.json({ success: false, error: 'folder_id ou folder_ids obrigatório' }, { status: 400 });
    }

    let token: string | null = null;
    try {
      token = (await base44.asServiceRole.connectors.getConnection('googledrive'))?.accessToken || null;
    } catch (_) {}
    if (!token) {
      return Response.json({ success: false, code: 'DRIVE_NOT_CONNECTED', error: 'Google Drive não está conectado.' }, { status: 401 });
    }

    async function listChildren(parentId: string) {
      const files: any[] = [];
      let pageToken = '';
      do {
        const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
        const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,md5Checksum,parents)');
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=${PAGE_SIZE}&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Google Drive HTTP ${response.status}: ${await response.text()}`);
        const payload = await response.json();
        files.push(...(payload.files || []));
        pageToken = payload.nextPageToken || '';
      } while (pageToken && files.length < MAX_FILES);
      return files;
    }

    async function scanRecursively(rootIds: string[]) {
      const queue = [...new Set(rootIds)];
      const visitedFolders = new Set<string>();
      const files = new Map<string, any>();

      while (queue.length && files.size < MAX_FILES) {
        const folderId = queue.shift()!;
        if (visitedFolders.has(folderId)) continue;
        visitedFolders.add(folderId);

        const children = await listChildren(folderId);
        for (const file of children) {
          if (file?.mimeType === FOLDER_MIME) {
            if (!visitedFolders.has(String(file.id))) queue.push(String(file.id));
            continue;
          }
          if (!files.has(String(file.id))) {
            files.set(String(file.id), { ...file, scanned_parent_id: folderId });
          }
          if (files.size >= MAX_FILES) break;
        }
      }

      return {
        files: [...files.values()],
        foldersScanned: visitedFolders.size,
        truncated: files.size >= MAX_FILES,
      };
    }

    const scan = await scanRecursively(folderIds);
    const invoiceFiles = scan.files.filter(isInvoiceFile);
    const existing = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 10000).catch(() => []);
    const byDriveId = new Map(
      existing
        .filter((item: any) => item?.drive_file_id)
        .map((item: any) => [String(item.drive_file_id), item]),
    );

    const imported: any[] = [];
    const existingRows: any[] = [];
    const updatedRows: any[] = [];
    const errors: any[] = [];

    for (const file of invoiceFiles) {
      const current = byDriveId.get(String(file.id));
      if (current) {
        existingRows.push({ drive_file_id: file.id, arquivo: file.name, id: current?.id });
        const changed =
          String(current?.drive_modified_at || '') !== String(file.modifiedTime || '') ||
          String(current?.file_name_original || '') !== String(file.name || '') ||
          String(current?.checksum || '') !== String(file.md5Checksum || '');

        if (changed) {
          try {
            await base44.asServiceRole.entities.DocumentIntake.update(current.id, {
              file_name_original: file.name,
              arquivo_original_url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
              mime_type: file.mimeType,
              tamanho_bytes: Number(file.size || 0),
              drive_modified_at: file.modifiedTime || null,
              checksum: file.md5Checksum || null,
              pasta_drive_id: file.scanned_parent_id || folderIds[0],
              sincronizado_drive_em: new Date().toISOString(),
            });
            updatedRows.push({ id: current.id, drive_file_id: file.id, arquivo: file.name });
          } catch (error: any) {
            errors.push({ drive_file_id: file.id, arquivo: file.name, erro: errorMessage(error) });
          }
        }
        continue;
      }

      try {
        const record = await base44.asServiceRole.entities.DocumentIntake.create({
          drive_file_id: file.id,
          file_name_original: file.name,
          arquivo_original_url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
          mime_type: file.mimeType,
          tamanho_bytes: Number(file.size || 0),
          tipo_detectado: 'nota_fiscal_pendente_validacao',
          status_processamento: 'pendente',
          origem: 'google_drive_sync',
          pasta_drive_id: file.scanned_parent_id || folderIds[0],
          drive_created_at: file.createdTime || null,
          drive_modified_at: file.modifiedTime || null,
          checksum: file.md5Checksum || null,
          importado_em: new Date().toISOString(),
          sincronizado_drive_em: new Date().toISOString(),
        });
        imported.push({ id: record.id, drive_file_id: file.id, arquivo: file.name });
        byDriveId.set(String(file.id), record);
      } catch (error: any) {
        errors.push({ drive_file_id: file.id, arquivo: file.name, erro: errorMessage(error) });
      }
    }

    return Response.json({
      success: errors.length === 0,
      pastas_raiz: folderIds,
      pastas_varridas: scan.foldersScanned,
      arquivos_encontrados: scan.files.length,
      candidatos_nota_fiscal: invoiceFiles.length,
      importadas: imported.length,
      atualizadas: updatedRows.length,
      existentes: existingRows.length,
      erros: errors.length,
      limite_atingido: scan.truncated,
      notas_importadas: imported,
      notas_atualizadas: updatedRows,
      notas_existentes: existingRows,
      falhas: errors,
      idempotencia: 'drive_file_id',
      observacao: 'Todas as subpastas foram varridas. As notas foram incluídas ou atualizadas na lista de conferência sem duplicação.',
    }, { status: errors.length ? 207 : 200 });
  } catch (error: any) {
    return Response.json({ success: false, error: errorMessage(error) }, { status: 500 });
  }
});