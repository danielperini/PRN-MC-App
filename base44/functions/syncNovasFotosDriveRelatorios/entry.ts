import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * syncNovasFotosDriveRelatorios
 * Varre as pastas do Google Drive vinculadas aos relatórios
 * (campo drive_backup_relatorio_id) e importa como ReportPhoto
 * todas as imagens que ainda não estão registradas (dedup por drive_file_id).
 *
 * Parâmetros (body):
 *   modo: 'preview' | 'sync'  (padrão: 'preview')
 *   report_id: string          (opcional — restringir a um relatório)
 *   lote: number               (tamanho do lote de download, padrão 5)
 */

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif', 'image/bmp']);
const IMAGE_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif', '.bmp']);

function isImage(name = '', mime = '') {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return IMAGE_MIMES.has(mime) || IMAGE_EXTS.has(ext);
}

function norm(s = '') {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isMacFork(name = '') {
  return String(name).startsWith('._');
}

async function driveListFolder(accessToken, folderId) {
  const items = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,md5Checksum,size)',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Drive API ${res.status}: ${err}`);
    }
    const data = await res.json();
    items.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return items;
}

/** Percorre pasta recursivamente, coletando imagens com caminho. */
async function collectImages(accessToken, folderId, depth = 0) {
  if (depth > 4) return []; // limite de profundidade
  const items = await driveListFolder(accessToken, folderId);
  const images = [];
  for (const item of items) {
    if (isMacFork(item.name)) continue;
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      const sub = await collectImages(accessToken, item.id, depth + 1);
      images.push(...sub);
    } else if (isImage(item.name, item.mimeType)) {
      images.push(item);
    }
  }
  return images;
}

async function downloadAndUpload(base44, accessToken, fileId, fileName, mimeType) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Download Drive ${res.status}`);
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error('Arquivo vazio');
  const file = new File([bytes], fileName, { type: mimeType || 'image/jpeg' });
  const upload = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  const url = upload?.file_url || upload?.url || upload?.data?.file_url;
  if (!url) throw new Error('Upload não retornou URL');
  return url;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Autenticação: permite admin ou chamada de sistema (automação agendada)
    const isSystem = req.headers.get('x-base44-system') === 'true';
    if (!isSystem) {
      let user = null;
      try { user = await base44.auth.me(); } catch { /* noop */ }
      if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const modo = String(body.modo || 'preview');
    const lote = Math.min(Number(body.lote || 5), 10); // máx 10 por execução
    const filtroReportId = body.report_id ? String(body.report_id) : null;

    // Conectar ao Drive
    const connection = await base44.asServiceRole.connectors.getConnection('googledrive').catch(() => null);
    const accessToken = connection?.accessToken;
    if (!accessToken) {
      return Response.json({ error: 'Google Drive não conectado.', code: 'DRIVE_NOT_CONNECTED' }, { status: 401 });
    }

    // Carregar relatórios que têm pasta Drive vinculada
    const todosRelatorios = await base44.asServiceRole.entities.Report.list('-updated_date', 2000).catch(() => []);
    const relatorios = todosRelatorios.filter(r =>
      r.drive_backup_relatorio_id &&
      (!filtroReportId || r.id === filtroReportId)
    );

    if (relatorios.length === 0) {
      return Response.json({
        success: true,
        modo,
        total_relatorios_com_pasta: 0,
        total_novas: 0,
        mensagem: filtroReportId
          ? 'Relatório não possui pasta Drive vinculada.'
          : 'Nenhum relatório com pasta Drive vinculada encontrado.',
      });
    }

    // Carregar fotos já existentes (índice por drive_file_id)
    const fotosExistentes = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 8000).catch(() => []);
    const driveIdsExistentes = new Set(
      fotosExistentes.map(f => f.drive_file_id).filter(Boolean)
    );

    // Varrer todas as pastas em paralelo (limitado por velocidade do Drive)
    const novasParaImportar = [];
    let totalImagens = 0;
    let pastasVarredas = 0;

    for (const relatorio of relatorios) {
      try {
        const imagens = await collectImages(accessToken, relatorio.drive_backup_relatorio_id);
        totalImagens += imagens.length;
        pastasVarredas++;

        for (const img of imagens) {
          if (!driveIdsExistentes.has(img.id)) {
            novasParaImportar.push({
              ...img,
              _report: relatorio,
            });
          }
        }
      } catch (e) {
        // Falha em uma pasta não bloqueia o restante
        console.warn(`[syncNovasFotos] Pasta do relatório ${relatorio.id} falhou: ${e.message}`);
      }
    }

    // ── MODO PREVIEW ─────────────────────────────────────────────────────────
    if (modo === 'preview') {
      return Response.json({
        success: true,
        modo: 'preview',
        total_relatorios_com_pasta: relatorios.length,
        pastas_varredas: pastasVarredas,
        total_imagens_drive: totalImagens,
        total_ja_importadas: totalImagens - novasParaImportar.length,
        total_novas: novasParaImportar.length,
        amostras: novasParaImportar.slice(0, 8).map(img => ({
          nome: img.name,
          relatorio: img._report.author_name,
          museu: img._report.museu,
          mes: img._report.mes_referencia,
        })),
      });
    }

    // ── MODO SYNC ─────────────────────────────────────────────────────────────
    const bloco = novasParaImportar.slice(0, lote);
    let importadas = 0;
    const falhas = [];

    for (const img of bloco) {
      try {
        const relatorio = img._report;
        const fileUrl = await downloadAndUpload(base44, accessToken, img.id, img.name, img.mimeType);

        await base44.asServiceRole.entities.ReportPhoto.create({
          file_url: fileUrl,
          file_name: img.name,
          drive_file_id: img.id,
          drive_backup_status: 'concluido',
          caption: img.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
          legenda: img.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
          report_id: relatorio.id,
          author: relatorio.author_name || '',
          museu: relatorio.museu || '',
          mes_referencia: relatorio.mes_referencia || '',
          ano: relatorio.ano || new Date().getFullYear(),
          fonte_ia: 'drive_sync',
        });

        importadas++;
      } catch (e) {
        falhas.push({ arquivo: img.name, erro: e.message });
      }
    }

    const restantes = novasParaImportar.length - bloco.length;

    // Registrar log
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_folders',
      entity_type: 'SYNC_NOVAS_FOTOS_RELATORIOS',
      status: falhas.length === 0 ? 'success' : 'failure',
      processed_at: new Date().toISOString(),
      total_files: novasParaImportar.length,
      files_copied: importadas,
      details: `syncNovasFotosDriveRelatorios: ${importadas} importadas, ${falhas.length} erros, ${restantes} restantes. Relatórios: ${relatorios.length}.`,
      triggered_by: isSystem ? 'scheduled' : 'manual',
    }).catch(() => {});

    return Response.json({
      success: falhas.length === 0,
      modo: 'sync',
      total_relatorios_com_pasta: relatorios.length,
      total_novas_encontradas: novasParaImportar.length,
      lote_processado: bloco.length,
      importadas,
      restantes,
      has_more: restantes > 0,
      falhas,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});