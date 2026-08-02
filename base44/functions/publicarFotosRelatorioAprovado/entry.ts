import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Pasta raiz "Museus Centro" no Drive → subpasta "Fotos"
const MUSEUS_CENTRO_FOLDER_ID = '1cncFwCYZb-jiQ-cg_GAWti-wRpSZyRCd';
const FOTOS_TIPO = 'Fotos';

function sanitize(name) {
  return String(name || '').replace(/[\/\\:*?"<>|]/g, '_').trim() || 'Geral';
}

async function findFolder(accessToken, folderName, parentFolderId) {
  const q = encodeURIComponent(`name='${folderName.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken, folderName, parentFolderId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.id;
}

async function getOrCreateFolder(accessToken, folderName, parentFolderId) {
  return (await findFolder(accessToken, folderName, parentFolderId)) || (await createFolder(accessToken, folderName, parentFolderId));
}

async function uploadToDrive(accessToken, fileUrl, fileName, folderId) {
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) throw new Error(`Download falhou (${fileResponse.status})`);
  const blob = await fileResponse.blob();
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
  formData.append('file', blob, fileName);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  const result = await res.json();
  if (result.error) throw new Error(result.error.message);
  return result.id;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const user = await base44.auth.me().catch(() => null);
    if (user) {
      const role = String(user.role || '').toUpperCase();
      if (role !== 'ADMIN' && !role.startsWith('COORD')) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // report_id direto, ou vindo de automação de entidade (event/data)
    const reportId = body.report_id || body?.event?.entity_id || body?.data?.id || null;

    let reports = [];
    if (reportId) {
      const r = await base44.asServiceRole.entities.Report.get(reportId).catch(() => null);
      if (r) reports = [r];
    } else {
      reports = await base44.asServiceRole.entities.Report.filter({ status: 'APPROVED' }, '-updated_date', 50);
    }

    reports = reports.filter((r) => String(r?.status || '').toUpperCase() === 'APPROVED');
    if (reports.length === 0) {
      return Response.json({ success: true, message: 'Nenhum relatório aprovado para processar.', processados: 0 });
    }

    let accessToken = null;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      accessToken = conn?.accessToken || null;
    } catch (_) {
      accessToken = null;
    }

    let criadas = 0;
    let atualizadas = 0;
    let backups = 0;
    const erros = [];

    for (const report of reports) {
      const atividades = await base44.asServiceRole.entities.Activity.filter({ report_id: report.id });

      // Reunir fotos em evidência: as do relatório + as de cada atividade
      const candidatas = [];
      (Array.isArray(report.fotos) ? report.fotos : []).forEach((f, i) => {
        if (f?.file_url) {
          candidatas.push({
            file_url: f.file_url,
            file_name: f.file_name || `foto_${report.id}_${i}.jpg`,
            caption: f.legenda || f.caption || '',
            author: f.autor || f.author || report.author_name || '',
            activity_id: f.activity_id || null,
            meta_id: f.meta_id || null,
            attachment_id: f.attachment_id || null,
            ordem: f.ordem ?? i,
          });
        }
      });
      for (const atv of atividades) {
        (Array.isArray(atv.fotos) ? atv.fotos : []).forEach((f, i) => {
          if (f?.file_url) {
            candidatas.push({
              file_url: f.file_url,
              file_name: f.file_name || `foto_${atv.id}_${i}.jpg`,
              caption: f.legenda || f.caption || atv.titulo || '',
              author: f.autor || report.author_name || '',
              activity_id: atv.id,
              meta_id: f.meta_id || atv.meta_id || null,
              attachment_id: f.attachment_id || null,
              ordem: f.ordem ?? i,
            });
          }
        });
      }

      if (candidatas.length === 0) continue;

      const existentes = await base44.asServiceRole.entities.ReportPhoto.filter({ report_id: report.id });
      const porUrl = new Map();
      existentes.forEach((p) => { if (p.file_url) porUrl.set(p.file_url, p); });

      const ano = String(report.ano || new Date().getFullYear());
      const mes = sanitize(report.mes_referencia || 'SemMes');
      const museu = sanitize(report.museu || 'Geral');

      let pastaDestino = null;
      if (accessToken) {
        try {
          const fotosId = await getOrCreateFolder(accessToken, FOTOS_TIPO, MUSEUS_CENTRO_FOLDER_ID);
          const anoId = await getOrCreateFolder(accessToken, ano, fotosId);
          const mesId = await getOrCreateFolder(accessToken, mes, anoId);
          pastaDestino = await getOrCreateFolder(accessToken, museu, mesId);
        } catch (e) {
          erros.push(`Pasta Drive (${report.id}): ${e.message}`);
        }
      }

      for (const foto of candidatas) {
        try {
          const existente = porUrl.get(foto.file_url);
          const dados = {
            report_id: report.id,
            activity_id: foto.activity_id || undefined,
            attachment_id: foto.attachment_id || undefined,
            meta_id: foto.meta_id || undefined,
            file_url: foto.file_url,
            file_name: foto.file_name,
            caption: foto.caption,
            legenda: foto.caption,
            author: foto.author,
            museu: report.museu || undefined,
            mes_referencia: report.mes_referencia || undefined,
            ano: report.ano || undefined,
            ordem: foto.ordem,
            galeria_oculta: false,
          };

          let registro = existente;
          if (!registro) {
            registro = await base44.asServiceRole.entities.ReportPhoto.create({ ...dados, drive_backup_status: 'pendente' });
            porUrl.set(foto.file_url, registro);
            criadas++;
          } else {
            await base44.asServiceRole.entities.ReportPhoto.update(registro.id, dados);
            atualizadas++;
          }

          // Foto que já vive no Drive: apenas registra o id, sem re-upload
          const jaNoDrive = /drive\.google\.com/.test(foto.file_url)
            ? (foto.file_url.match(/[?&]id=([\w-]+)/) || foto.file_url.match(/\/d\/([\w-]+)/) || [])[1]
            : null;
          if (jaNoDrive && !registro.drive_file_id) {
            await base44.asServiceRole.entities.ReportPhoto.update(registro.id, {
              drive_file_id: jaNoDrive,
              drive_backup_status: 'concluido',
            });
            registro = { ...registro, drive_file_id: jaNoDrive };
          }

          // Backup no Drive (só se ainda não tiver)
          if (pastaDestino && !registro.drive_file_id) {
            try {
              const driveId = await uploadToDrive(accessToken, foto.file_url, foto.file_name, pastaDestino);
              await base44.asServiceRole.entities.ReportPhoto.update(registro.id, {
                drive_file_id: driveId,
                drive_backup_status: 'concluido',
              });
              backups++;
            } catch (e) {
              await base44.asServiceRole.entities.ReportPhoto.update(registro.id, { drive_backup_status: 'erro' }).catch(() => {});
              erros.push(`Backup ${foto.file_name}: ${e.message}`);
            }
          }
        } catch (e) {
          erros.push(`${foto.file_name}: ${e.message}`);
        }
      }
    }

    return Response.json({
      success: true,
      processados: reports.length,
      fotos_criadas: criadas,
      fotos_atualizadas: atualizadas,
      backups_drive: backups,
      erros: erros.slice(0, 10),
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});