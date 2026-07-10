import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Pasta raiz no Google Drive: Evidências / Galeria de Fotos — Museus Centro
const ROOT_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Drive helpers ──────────────────────────────────────────────────────────────

async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name.replace(/'/g,"\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(token: string, name: string, parentId: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Criar pasta "${name}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  return (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
}

// ── Normalização ───────────────────────────────────────────────────────────────

function sanitize(str = ''): string {
  return String(str).replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function museuLabel(museu = ''): string {
  const m = String(museu).toUpperCase();
  if (m.includes('MHAB') || m.includes('ABILIO') || m.includes('HISTORICO') || m.includes('HISTÓRICO')) return 'MHAB';
  if (m.includes('MIS') || m.includes('IMAGEM') || m.includes('SOM')) return 'MIS';
  if (m.includes('MUMO') || m.includes('MODA')) return 'MUMO';
  if (m.includes('CASA KUBITSCHEK') || m.includes('KUBITSCHEK')) return 'Casa Kubitschek';
  if (m.includes('CASA DO BAILE') || m.includes('BAILE')) return 'Casa do Baile';
  if (m.includes('MAP') || m.includes('ARTE POPULAR')) return 'MAP';
  return 'Geral';
}

/**
 * Retorna "AAAA-MM — Mês" a partir de uma data qualquer ou do mês de referência de um relatório.
 */
function periodoFolder(dateStr?: string, mesReferencia?: string, ano?: number): string {
  // Preferir data explícita
  if (dateStr) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const aaaa = d.getFullYear();
      return `${aaaa}-${mm} — ${MESES_PT[d.getMonth()]}`;
    }
  }
  // Fallback: mês de referência do relatório (texto: "Janeiro", "Fevereiro", etc.)
  if (mesReferencia) {
    const idx = MESES_PT.findIndex(m => m.toLowerCase() === String(mesReferencia).toLowerCase());
    if (idx >= 0) {
      const aaaa = ano || new Date().getFullYear();
      const mm = String(idx + 1).padStart(2, '0');
      return `${aaaa}-${mm} — ${MESES_PT[idx]}`;
    }
  }
  // Último recurso: mês atual
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${mm} — ${MESES_PT[now.getMonth()]}`;
}

/**
 * Nome curto de atividade para pasta (máx 60 chars)
 */
function atividadeFolder(titulo?: string, activityId?: string): string {
  if (titulo && titulo.trim()) return sanitize(titulo).slice(0, 60);
  if (activityId) return `Atividade_${activityId.slice(-8)}`;
  return 'Sem-Atividade';
}

// ── Handler principal ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Apenas admins podem executar backup de fotos' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Number(body.batchSize) || 15, 30);
    const skip = Number(body.skip) || 0;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // ── Carregar logs de backup já existentes (evita reprocessar) ──────────────
    const existingLogs = await base44.asServiceRole.entities.BackupLog.filter(
      { tipo: 'foto_galeria' }, '-created_date', 5000
    ).catch(() => []);
    const alreadyBackedUp = new Set((existingLogs || []).map((l: any) => l.source_id).filter(Boolean));

    // ── Buscar dados ───────────────────────────────────────────────────────────
    const [attachments, reports, activities] = await Promise.all([
      base44.asServiceRole.entities.Attachment.list('-created_date', 1000),
      base44.asServiceRole.entities.Report.list('-created_date', 500),
      base44.asServiceRole.entities.Activity.list('-created_date', 1000),
    ]);

    const reportMap = new Map((reports || []).map((r: any) => [r.id, r]));
    const activityMap = new Map((activities || []).map((a: any) => [a.id, a]));

    // Filtrar apenas imagens pendentes
    const photos = (attachments || []).filter((a: any) =>
      (a.file_url) &&
      (/\.(jpg|jpeg|png|gif|webp|heic)$/i.test(a.file_name || '') || /^image\//i.test(a.file_type || ''))
    );

    const pending = photos.filter((p: any) => !alreadyBackedUp.has(p.id));
    const batch = pending.slice(skip, skip + batchSize);

    let uploaded = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const photo of batch) {
      try {
        const report = reportMap.get(photo.report_id);
        const activity = activityMap.get(photo.activity_id);

        // ── Calcular os três níveis de pasta ──────────────────────────────────
        // 1. Período: AAAA-MM — Mês
        const periodo = periodoFolder(
          photo.data_foto || photo.created_date,
          report?.mes_referencia,
          report?.ano
        );

        // 2. Museu
        const museu = museuLabel(
          activity?.museu || report?.museu || photo.museu || photo.local || ''
        );

        // 3. Atividade
        const atividade = atividadeFolder(
          activity?.titulo || photo.atividade_nome,
          photo.activity_id || photo.report_id
        );

        // ── Criar/encontrar hierarquia de pastas ─────────────────────────────
        const periodoPastaId = await getOrCreateFolder(accessToken, periodo, ROOT_FOLDER_ID);
        const museuPastaId = await getOrCreateFolder(accessToken, museu, periodoPastaId);
        const atividadePastaId = await getOrCreateFolder(accessToken, atividade, museuPastaId);

        const fileName = sanitize(photo.file_name || `foto_${photo.id}.jpg`);
        const folderPath = `${periodo}/${museu}/${atividade}`;

        // ── Verificar duplicidade por nome na pasta destino ──────────────────
        const existsQ = encodeURIComponent(`name='${fileName.replace(/'/g,"\\'")}' and '${atividadePastaId}' in parents and trashed=false`);
        const existsRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${existsQ}&fields=files(id,webViewLink)`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const existsData = await existsRes.json();

        if (existsData.files?.length > 0) {
          await base44.asServiceRole.entities.BackupLog.create({
            backup_type: 'foto_galeria',
            tipo: 'foto_galeria',
            source_id: photo.id,
            source_entity: 'Attachment',
            file_name: fileName,
            drive_file_id: existsData.files[0].id,
            drive_file_url: existsData.files[0].webViewLink,
            drive_folder_path: folderPath,
            status: 'ja_existia',
            backed_up_at: new Date().toISOString(),
          }).catch(() => null);
          skipped++;
          continue;
        }

        // ── Download + Upload para o Drive ────────────────────────────────────
        const fileRes = await fetch(photo.file_url);
        if (!fileRes.ok) {
          errors.push(`${fileName}: download falhou (${fileRes.status})`);
          continue;
        }
        const fileBlob = await fileRes.blob();

        const description = [
          report?.author_name || '',
          activity?.titulo || '',
          report?.museu || museu,
          report?.mes_referencia || '',
        ].filter(Boolean).join(' — ');

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({
          name: fileName,
          parents: [atividadePastaId],
          description,
        })], { type: 'application/json' }));
        form.append('file', fileBlob, fileName);

        const uploadRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
          { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
        );
        const result = await uploadRes.json();
        if (result.error) throw new Error(result.error.message);

        // ── Registrar log + atualizar Attachment ─────────────────────────────
        await Promise.all([
          base44.asServiceRole.entities.BackupLog.create({
            backup_type: 'foto_galeria',
            tipo: 'foto_galeria',
            source_id: photo.id,
            source_entity: 'Attachment',
            file_name: fileName,
            drive_file_id: result.id,
            drive_file_url: result.webViewLink,
            drive_folder_path: folderPath,
            museu,
            periodo,
            atividade,
            status: 'enviado',
            backed_up_at: new Date().toISOString(),
          }).catch(() => null),
          base44.asServiceRole.entities.Attachment.update(photo.id, {
            drive_file_id: result.id,
            drive_backup_url: result.webViewLink,
            backup_done: true,
            backup_date: new Date().toISOString(),
          }).catch(() => null),
        ]);

        uploaded++;
      } catch (e: any) {
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
      erros: errors.slice(0, 10),
      has_more: hasMore,
      next_skip: hasMore ? skip + batchSize : null,
      estrutura: 'ROOT / AAAA-MM — Mês / Museu / Atividade',
      message: `Backup: ${uploaded} enviadas, ${skipped} já existiam.${hasMore ? ` Ainda restam ${pending.length - skip - batchSize} fotos.` : ' Lote concluído.'}`,
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});