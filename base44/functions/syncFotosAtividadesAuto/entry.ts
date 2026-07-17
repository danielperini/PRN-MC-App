import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const FOTOS_PASTA_RAIZ = '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J';
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif', 'image/bmp'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif', '.bmp'];

function isImage(name = '', mime = '') {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return IMAGE_MIMES.includes(mime) || IMAGE_EXTS.includes(ext);
}

function normalizeStr(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

function scoreMatch(activityTitle = '', folderName = '') {
  const a = normalizeStr(activityTitle).split(/\s+/).filter(w => w.length > 3);
  const b = normalizeStr(folderName);
  return a.filter(word => b.includes(word)).length;
}

function parseFolderName(folderName = '') {
  const autorMatch = folderName.match(/[Ff]otos\s*[-–]\s*(.+)/);
  const autor = autorMatch ? autorMatch[1].trim() : null;
  const museuMatch = folderName.match(/\b(MHAB|MIS|MUMO)\b/i);
  const museu = museuMatch ? museuMatch[1].toUpperCase() : null;
  const dataMatch = folderName.match(/^(\d{4})-(\d{2})/);
  const mesRef = dataMatch ? `${dataMatch[1]}-${dataMatch[2]}` : null;
  let titulo = folderName;
  if (museuMatch) {
    const aposMuseu = folderName.slice(folderName.toUpperCase().indexOf(museuMatch[1].toUpperCase()) + museuMatch[1].length);
    const semFotos = autorMatch ? aposMuseu.slice(0, aposMuseu.toLowerCase().indexOf('fotos')) : aposMuseu;
    titulo = semFotos.replace(/^[-\s]+/, '').trim() || folderName;
  }
  return { autor, museu, mesRef, titulo };
}

async function driveList(accessToken, q, fields = 'files(id,name,mimeType,webViewLink,thumbnailLink,imageMediaMetadata,description,properties)', pageToken = null) {
  const params = new URLSearchParams({ q, fields: `nextPageToken,${fields}`, pageSize: '100' });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAllInFolder(accessToken, folderId) {
  const items = [];
  let pageToken = null;
  do {
    const data = await driveList(
      accessToken,
      `'${folderId}' in parents and trashed = false`,
      'files(id,name,mimeType,webViewLink,thumbnailLink,imageMediaMetadata,description,properties)',
      pageToken
    );
    items.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return items;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const subpastas = await listAllInFolder(accessToken, FOTOS_PASTA_RAIZ);
    const pastasFotos = subpastas.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const fotasAvulsas = subpastas.filter(f => f.mimeType !== 'application/vnd.google-apps.folder' && isImage(f.name, f.mimeType));

    const [atividades, relatorios] = await Promise.all([
      base44.asServiceRole.entities.Activity.list('-created_date', 2000),
      base44.asServiceRole.entities.Report.list('-created_date', 500),
    ]);

    const reportMap: Record<string, any> = {};
    for (const r of relatorios) reportMap[r.id] = r;

    const resultados: any[] = [];

    for (const foto of fotasAvulsas) {
      resultados.push({
        drive_file_id: foto.id,
        drive_nome_original: foto.name,
        pasta_nome: '',
        pasta_id: FOTOS_PASTA_RAIZ,
        drive_url: foto.webViewLink || `https://drive.google.com/file/d/${foto.id}/view`,
        thumbnail_url: foto.thumbnailLink ? foto.thumbnailLink.replace('=s220', '=s800') : `https://drive.google.com/thumbnail?id=${foto.id}&sz=w800`,
        mime: foto.mimeType,
        atividade_id: null, atividade_titulo: null, report_id: null, autor_relatorio: null,
        museu: null, mes_referencia: null,
        legenda: foto.description || foto.name.replace(/\.[^.]+$/, ''),
        score: 0,
      });
    }

    for (const pasta of pastasFotos) {
      let melhorAtividade = null;
      let melhorScore = 0;
      for (const atv of atividades) {
        const s = scoreMatch(atv.titulo || '', pasta.name);
        if (s > melhorScore) { melhorScore = s; melhorAtividade = atv; }
      }
      const atvVinculada = melhorScore >= 2 ? melhorAtividade : null;
      const reportVinculado = atvVinculada ? reportMap[atvVinculada.report_id] : null;
      const pastaInfo = parseFolderName(pasta.name);

      const fotosNaPasta = await listAllInFolder(accessToken, pasta.id);
      const imagensDaPasta = fotosNaPasta.filter(f => isImage(f.name, f.mimeType));

      for (const foto of imagensDaPasta) {
        resultados.push({
          drive_file_id: foto.id,
          drive_nome_original: foto.name,
          pasta_nome: pasta.name,
          pasta_id: pasta.id,
          drive_url: foto.webViewLink || `https://drive.google.com/file/d/${foto.id}/view`,
          thumbnail_url: foto.thumbnailLink ? foto.thumbnailLink.replace('=s220', '=s800') : `https://drive.google.com/thumbnail?id=${foto.id}&sz=w800`,
          mime: foto.mimeType,
          atividade_id: atvVinculada?.id || null,
          atividade_titulo: atvVinculada?.titulo || pastaInfo.titulo || pasta.name,
          report_id: reportVinculado?.id || null,
          autor_relatorio: pastaInfo.autor || reportVinculado?.author_name || null,
          museu: reportVinculado?.museu || pastaInfo.museu || atvVinculada?.equipe_responsavel || null,
          mes_referencia: reportVinculado?.mes_referencia || pastaInfo.mesRef || null,
          legenda: foto.description || `Foto de Registro — ${pastaInfo.autor ? `${atvVinculada?.titulo || pastaInfo.titulo}  ·  ${pastaInfo.autor}` : (atvVinculada?.titulo || pasta.name)}`,
          score: melhorScore,
        });
      }
    }

    // Importar apenas fotos ainda não existentes
    const todosIds = resultados.map(f => f.drive_file_id).filter(Boolean);
    const existentes = todosIds.length > 0
      ? await base44.asServiceRole.entities.ReportPhoto.filter({ drive_file_id: { $in: todosIds } })
      : [];
    const existenteIds = new Set(existentes.map((e: any) => e.drive_file_id));

    const novas = resultados.filter(f => f.drive_file_id && !existenteIds.has(f.drive_file_id));

    let criadas = 0;
    const falhas: any[] = [];

    for (const foto of novas) {
      try {
        const fileUrl = `https://drive.google.com/thumbnail?id=${foto.drive_file_id}&sz=w1600`;
        const att = await base44.asServiceRole.entities.Attachment.create({
          report_id: foto.report_id || 'drive-import',
          activity_id: foto.atividade_id || undefined,
          file_name: foto.drive_nome_original,
          file_type: foto.mime || 'image/jpeg',
          file_url: fileUrl,
          description: foto.legenda,
          drive_file_id: foto.drive_file_id,
          drive_folder_id: foto.pasta_id,
          backup_done: true,
        });

        await base44.asServiceRole.entities.ReportPhoto.create({
          report_id: foto.report_id || undefined,
          activity_id: foto.atividade_id || undefined,
          attachment_id: att.id,
          file_url: fileUrl,
          file_name: foto.drive_nome_original,
          caption: foto.legenda,
          legenda: foto.legenda,
          author: foto.autor_relatorio || 'Registro Fotográfico',
          museu: foto.museu || undefined,
          mes_referencia: foto.mes_referencia || undefined,
          drive_file_id: foto.drive_file_id,
          drive_backup_status: 'concluido',
        });

        if (foto.atividade_id) {
          const atv = await base44.asServiceRole.entities.Activity.get(foto.atividade_id).catch(() => null);
          if (atv) {
            const fotosAtuais = Array.isArray(atv.fotos) ? atv.fotos : [];
            const jaVinculada = fotosAtuais.some((f: any) => f.attachment_id === att.id);
            if (!jaVinculada) {
              await base44.asServiceRole.entities.Activity.update(foto.atividade_id, {
                fotos: [...fotosAtuais, { attachment_id: att.id }],
              });
            }
          }
        }
        criadas++;
      } catch (e: any) {
        falhas.push({ arquivo: foto.drive_nome_original, erro: e.message });
      }
    }

    return Response.json({
      success: true,
      total_no_drive: resultados.length,
      ja_existiam: existenteIds.size,
      criadas,
      falhas_count: falhas.length,
      falhas: falhas.slice(0, 10),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});