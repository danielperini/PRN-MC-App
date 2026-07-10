import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Pasta raiz: Evidências / Galeria de Fotos — Museus Centro
const ROOT_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';

// Entidade de controle de arquivos já enviados
const BACKUP_LOG_ENTITY = 'BackupLog';

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Criar pasta "${name}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(token, name, parentId) {
  return (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
}

function museuLabel(museu = '') {
  const m = String(museu).toUpperCase();
  if (m.includes('MHAB') || m.includes('ABILIO') || m.includes('HISTORICO')) return 'MHAB';
  if (m.includes('MIS') || m.includes('IMAGEM') || m.includes('SOM')) return 'MIS';
  if (m.includes('MUMO') || m.includes('MODA')) return 'MUMO';
  return 'Sem-Museu';
}

function mesAno(dateStr = '') {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return 'Sem-Data';
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function sanitize(str = '') {
  return String(str).replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Apenas admins podem executar backup de fotos' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Number(body.batchSize) || 20; // processa N fotos por execução
    const skip = Number(body.skip) || 0;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Carregar logs de arquivos já enviados para evitar duplicidade
    const existingLogs = await base44.asServiceRole.entities[BACKUP_LOG_ENTITY].filter(
      { tipo: 'foto_galeria' }, '-created_date', 5000
    ).catch(() => []);

    const alreadyBackedUp = new Set((existingLogs || []).map(l => l.source_id).filter(Boolean));

    // Buscar fotos dos Attachments com paginação
    const [attachments, reports] = await Promise.all([
      base44.asServiceRole.entities.Attachment.list('-created_date', 500),
      base44.asServiceRole.entities.Report.list('-created_date', 500),
    ]);

    const reportMap = new Map((reports || []).map(r => [r.id, r]));

    const photos = (attachments || []).filter(a =>
      /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(a.file_name || '') ||
      /^image\//i.test(a.file_type || '')
    );

    // Fotos ainda não enviadas
    const pending = photos.filter(p => p.file_url && !alreadyBackedUp.has(p.id));
    const batch = pending.slice(skip, skip + batchSize);

    let uploaded = 0;
    let skipped = 0;
    const errors = [];

    for (const photo of batch) {
      try {
        const report = reportMap.get(photo.report_id);
        const museu = museuLabel(report?.museu || photo.museu || photo.local || '');
        const periodo = mesAno(
          photo.data_foto || photo.created_at || photo.created_date || report?.mes_referencia
            ? `${report?.mes_referencia ? '01/' + ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].indexOf(report.mes_referencia) + 1 + '/' + (report.ano || 2026) : photo.created_date}` 
            : photo.created_date
        );

        // Estrutura: ROOT / MUSEU / AAAA-MM / fileName
        const museuFolderId = await getOrCreateFolder(accessToken, museu, ROOT_FOLDER_ID);
        const periodoFolderId = await getOrCreateFolder(accessToken, periodo, museuFolderId);

        const fileName = sanitize(photo.file_name || `foto_${photo.id}.jpg`);

        // Verificar se arquivo com mesmo nome já existe na pasta de destino
        const existsQ = encodeURIComponent(`name='${fileName}' and '${periodoFolderId}' in parents and trashed=false`);
        const existsRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${existsQ}&fields=files(id)`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const existsData = await existsRes.json();
        if (existsData.files?.length > 0) {
          // Já existe — registrar no log e pular
          await base44.asServiceRole.entities[BACKUP_LOG_ENTITY].create({
            backup_type: 'foto_galeria',
            tipo: 'foto_galeria',
            source_id: photo.id,
            source_entity: 'Attachment',
            file_name: fileName,
            drive_file_id: existsData.files[0].id,
            drive_folder_path: `${museu}/${periodo}`,
            status: 'ja_existia',
            backed_up_at: new Date().toISOString(),
          }).catch(() => null);
          skipped++;
          continue;
        }

        // Fazer download e upload para o Drive
        const fileRes = await fetch(photo.file_url);
        if (!fileRes.ok) { errors.push(`${fileName}: download falhou (${fileRes.status})`); continue; }
        const fileBlob = await fileRes.blob();

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({
          name: fileName,
          parents: [periodoFolderId],
          description: [
            report?.author_name || '',
            report?.mes_referencia || '',
            report?.museu || '',
          ].filter(Boolean).join(' — ')
        })], { type: 'application/json' }));
        form.append('file', fileBlob, fileName);

        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form
        });
        const result = await uploadRes.json();
        if (result.error) throw new Error(result.error.message);

        // Registrar no log de backup
        await base44.asServiceRole.entities[BACKUP_LOG_ENTITY].create({
          backup_type: 'foto_galeria',
          tipo: 'foto_galeria',
          source_id: photo.id,
          source_entity: 'Attachment',
          file_name: fileName,
          drive_file_id: result.id,
          drive_file_url: result.webViewLink,
          drive_folder_path: `${museu}/${periodo}`,
          status: 'enviado',
          backed_up_at: new Date().toISOString(),
        }).catch(() => null);

        // Atualizar o Attachment com o link do Drive
        await base44.asServiceRole.entities.Attachment.update(photo.id, {
          drive_backup_url: result.webViewLink,
          drive_backup_at: new Date().toISOString(),
        }).catch(() => null);

        uploaded++;
      } catch (e) {
        errors.push(`${photo.file_name || photo.id}: ${e.message}`);
      }
    }

    const hasMore = pending.length > skip + batchSize;

    return Response.json({
      success: true,
      total_pendentes: pending.length,
      processadas: batch.length,
      enviadas: uploaded,
      ja_existiam: skipped,
      erros: errors.length > 0 ? errors.slice(0, 10) : [],
      has_more: hasMore,
      next_skip: hasMore ? skip + batchSize : null,
      message: `Backup: ${uploaded} enviadas, ${skipped} já existiam. ${hasMore ? `Ainda restam ${pending.length - skip - batchSize} fotos.` : 'Lote concluído.'}`,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});