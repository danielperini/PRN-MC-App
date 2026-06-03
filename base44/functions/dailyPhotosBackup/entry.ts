import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Pasta base: /Fotos Museus Centro
const BASE_FOLDER_ID = '1KHek34-ES3eef7E7YAh4q8ZhLgjPZuZC';

// Mapeamento de museus para nomes de pasta
const MUSEU_PASTA = {
  'MIS': 'MIS',
  'MIS BH': 'MIS',
  'MUMO': 'MUMO',
  'MHAB': 'MHAB',
  'MAB': 'MHAB',
  'GERAL': 'Atuação Geral',
  'Geral/Transversal': 'Atuação Geral',
  'Geral': 'Atuação Geral',
};

function sanitizeName(name = '') {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 80);
}

function normalizeText(str = '') {
  return String(str).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function detectMuseu(photo, activity, report) {
  // 1. Campo explícito no relatório
  const museuRaw = report?.museu || activity?.museu || photo?.museu || '';
  if (museuRaw) {
    const m = normalizeText(museuRaw);
    if (m.includes('MIS')) return 'MIS';
    if (m.includes('MUMO')) return 'MUMO';
    if (m.includes('MHAB') || m.includes('MAB')) return 'MHAB';
    if (m.includes('GERAL') || m.includes('TRANSVERSAL')) return 'Atuação Geral';
  }

  // 2. Centro de custo da atividade
  const cc = normalizeText(activity?.centro_custo || report?.centro_custo || '');
  if (cc.includes('MIS')) return 'MIS';
  if (cc.includes('MUMO')) return 'MUMO';
  if (cc.includes('MHAB') || cc.includes('MAB')) return 'MHAB';

  return null; // Não classificado
}

function detectAtividade(activity, report) {
  const titulo = sanitizeName(activity?.titulo || report?.titulo || report?.mes_referencia || '');
  return titulo || 'AtividadeGeral';
}

function detectData(photo, activity, report) {
  const rawDate =
    activity?.data_realizacao ||
    activity?.data_inicio ||
    report?.periodo_inicio ||
    photo?.created_date ||
    new Date().toISOString();
  try {
    return new Date(rawDate).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function buildActivityFolderName(activity, report, museu) {
  const atividade = detectAtividade(activity, report);
  const data = detectData(null, activity, report);
  const museuTag = museu && museu !== 'Atuação Geral' ? `_${museu}` : '_GERAL';
  // Formato: OficinaDeFotografia_2026-03-12_MIS
  const atividadeSem = atividade.replace(/\s+/g, '');
  return `${atividadeSem}_${data}${museuTag}`;
}

function buildFileName(photo, activity, report, museu) {
  const data = detectData(photo, activity, report);
  const museuTag = museu || 'SemMuseu';
  const atividade = sanitizeName(activity?.titulo || report?.titulo || 'SemAtividade');
  const original = photo.file_name || `foto_${photo.id}.jpg`;
  return `${data} - ${museuTag} - ${atividade} - ${original}`;
}

// === Google Drive helpers ===

async function driveRequest(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Drive API error ${res.status}`);
  }
  return res.json();
}

async function findFolder(accessToken, name, parentId) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const data = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, name, parentId) {
  const data = await driveRequest(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    }
  );
  return data.id;
}

async function getOrCreateFolder(accessToken, name, parentId, createdFolders) {
  const existing = await findFolder(accessToken, name, parentId);
  if (existing) return existing;
  const newId = await createFolder(accessToken, name, parentId);
  createdFolders.push(name);
  return newId;
}

async function fileExistsInFolder(accessToken, name, folderId) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`);
  const data = await driveRequest(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data.files?.[0]?.id || null;
}

async function uploadFile(accessToken, fileUrl, fileName, folderId) {
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error(`Erro ao baixar arquivo: ${fileRes.status}`);
  const blob = await fileRes.blob();

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', blob, fileName);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  const result = await res.json();
  if (result.error) throw new Error(result.error.message);
  return result.id;
}

// === Main handler ===

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permite chamada por automação (sem user) ou por admin
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (user && !['admin', 'ADMIN', 'coordenador', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Acesso restrito' }, { status: 403 });
    }

    const startTime = Date.now();
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Garantir estrutura base de pastas
    const createdFolders = [];
    const museuFolders = {};
    const naoClassificadasId = await getOrCreateFolder(accessToken, 'Não Classificadas', BASE_FOLDER_ID, createdFolders);
    for (const [, pastaName] of Object.entries(MUSEU_PASTA)) {
      if (!museuFolders[pastaName]) {
        museuFolders[pastaName] = await getOrCreateFolder(accessToken, pastaName, BASE_FOLDER_ID, createdFolders);
      }
    }

    // Buscar fotos não enviadas ao backup
    // Considera Attachment com tipo imagem e backup_done = false (ou sem campo)
    const allAttachments = await base44.asServiceRole.entities.Attachment.filter(
      { backup_done: false },
      '-created_date',
      2000
    );

    const photos = allAttachments.filter(a => {
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_name || '') || /^image\//i.test(a.file_type || '');
      return isImage && a.file_url;
    });

    // Também pegar ReportPhoto sem backup
    let reportPhotos = [];
    try {
      const rp = await base44.asServiceRole.entities.ReportPhoto.filter({ backup_done: false }, '-created_date', 2000);
      reportPhotos = rp.filter(p => p.file_url);
    } catch {}

    // Buscar activities e reports para contexto
    const [activities, reports] = await Promise.all([
      base44.asServiceRole.entities.Activity.list('-created_date', 3000).catch(() => []),
      base44.asServiceRole.entities.Report.list('-created_date', 1000).catch(() => []),
    ]);

    const activityMap = {};
    activities.forEach(a => { activityMap[a.id] = a; });
    const reportMap = {};
    reports.forEach(r => { reportMap[r.id] = r; });

    const log = {
      data_rotina: new Date().toISOString(),
      total_analisadas: photos.length + reportPhotos.length,
      total_enviadas: 0,
      ignoradas_ja_existem: 0,
      nao_classificadas: 0,
      pastas_criadas: [],
      erros: [],
    };

    // Processar Attachments de foto
    for (const photo of photos) {
      try {
        const activity = activityMap[photo.activity_id] || null;
        const report = reportMap[photo.report_id] || reportMap[activity?.report_id] || null;
        const museu = detectMuseu(photo, activity, report);
        const museuPasta = museu ? (MUSEU_PASTA[museu] || museu) : null;

        let targetFolderId;

        if (!museuPasta) {
          // Não classificada
          targetFolderId = naoClassificadasId;
          log.nao_classificadas++;
        } else {
          const museuFolderId = museuFolders[museuPasta] || naoClassificadasId;
          // Criar subpasta por atividade
          const actFolderName = buildActivityFolderName(activity, report, museu);
          targetFolderId = await getOrCreateFolder(accessToken, actFolderName, museuFolderId, createdFolders);
        }

        const fileName = buildFileName(photo, activity, report, museu);

        // Verificar se já existe
        const existing = await fileExistsInFolder(accessToken, fileName, targetFolderId);
        if (existing) {
          log.ignoradas_ja_existem++;
          // Marcar como backup feito mesmo assim
          await base44.asServiceRole.entities.Attachment.update(photo.id, {
            backup_done: true,
            drive_file_id: existing,
            backup_date: new Date().toISOString(),
          }).catch(() => {});
          continue;
        }

        const driveFileId = await uploadFile(accessToken, photo.file_url, fileName, targetFolderId);

        // Atualizar attachment
        await base44.asServiceRole.entities.Attachment.update(photo.id, {
          backup_done: true,
          drive_file_id: driveFileId,
          drive_folder_id: targetFolderId,
          backup_date: new Date().toISOString(),
        }).catch(() => {});

        log.total_enviadas++;
      } catch (e) {
        log.erros.push(`Attachment ${photo.id} (${photo.file_name}): ${e.message}`);
      }
    }

    // Processar ReportPhotos
    for (const photo of reportPhotos) {
      try {
        const report = reportMap[photo.report_id] || null;
        const activity = activityMap[photo.activity_id] || null;
        const museu = detectMuseu(photo, activity, report);
        const museuPasta = museu ? (MUSEU_PASTA[museu] || museu) : null;

        let targetFolderId;
        if (!museuPasta) {
          targetFolderId = naoClassificadasId;
          log.nao_classificadas++;
        } else {
          const museuFolderId = museuFolders[museuPasta] || naoClassificadasId;
          const actFolderName = buildActivityFolderName(activity, report, museu);
          targetFolderId = await getOrCreateFolder(accessToken, actFolderName, museuFolderId, createdFolders);
        }

        const fileName = buildFileName(photo, activity, report, museu);

        const existing = await fileExistsInFolder(accessToken, fileName, targetFolderId);
        if (existing) {
          log.ignoradas_ja_existem++;
          await base44.asServiceRole.entities.ReportPhoto.update(photo.id, {
            backup_done: true,
            drive_file_id: existing,
            backup_date: new Date().toISOString(),
          }).catch(() => {});
          continue;
        }

        const driveFileId = await uploadFile(accessToken, photo.file_url, fileName, targetFolderId);

        await base44.asServiceRole.entities.ReportPhoto.update(photo.id, {
          backup_done: true,
          drive_file_id: driveFileId,
          drive_folder_id: targetFolderId,
          backup_date: new Date().toISOString(),
        }).catch(() => {});

        log.total_enviadas++;
      } catch (e) {
        log.erros.push(`ReportPhoto ${photo.id}: ${e.message}`);
      }
    }

    log.pastas_criadas = [...new Set(createdFolders)];

    // Salvar log
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_folders',
      status: log.erros.length === 0 ? 'success' : 'failure',
      total_files: log.total_analisadas,
      files_copied: log.total_enviadas,
      error_message: log.erros.length > 0 ? log.erros.slice(0, 5).join(' | ') : null,
      execution_time_ms: Date.now() - startTime,
      triggered_by: user ? 'manual' : 'scheduled',
    }).catch(() => {});

    return Response.json({
      ok: true,
      ...log,
      tempo_execucao_ms: Date.now() - startTime,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});