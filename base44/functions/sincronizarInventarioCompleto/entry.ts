import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Pastas raiz já existentes no Drive — não cria novas
const PASTA_FOTOS_ATIVIDADES = '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif'];
const IMAGE_EXTS  = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif', '.bmp'];

function isImage(name = '', mime = '') {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return IMAGE_MIMES.includes(mime) || IMAGE_EXTS.includes(ext);
}

function norm(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

function parseFolderName(name = '') {
  const autorMatch = name.match(/[Ff]otos\s*[-–]\s*(.+)/);
  const autor = autorMatch ? autorMatch[1].trim() : null;
  const museuMatch = name.match(/\b(MHAB|MIS|MUMO)\b/i);
  const museu = museuMatch ? museuMatch[1].toUpperCase() : null;
  const dataMatch = name.match(/^(\d{4})-(\d{2})/);
  const mesRef = dataMatch ? `${dataMatch[1]}-${dataMatch[2]}` : null;
  const mesNum = dataMatch ? Number(dataMatch[2]) : null;
  const MESES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const mesNome = mesNum ? MESES[mesNum] : null;
  const ano = dataMatch ? Number(dataMatch[1]) : new Date().getFullYear();
  let titulo = name;
  if (museuMatch) {
    const idx = name.toUpperCase().indexOf(museuMatch[1].toUpperCase());
    const apos = name.slice(idx + museuMatch[1].length);
    const semFotos = autorMatch ? apos.slice(0, apos.toLowerCase().indexOf('fotos')) : apos;
    titulo = semFotos.replace(/^[-\s]+/, '').trim() || name;
  }
  return { autor, museu, mesRef, mesNome, mesNum, ano, titulo };
}

function scoreMatch(activityTitle = '', folderName = '') {
  const words = norm(activityTitle).split(/\s+/).filter(w => w.length > 3);
  const target = norm(folderName);
  return words.filter(w => target.includes(w)).length;
}

async function driveListAll(accessToken: string, folderId: string): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | null = null;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,md5Checksum,size,imageMediaMetadata,description)',
      pageSize: '200',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    items.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return items;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    const isSystem = req.headers.get('x-base44-system') === 'true';
    if (!isAuth && !isSystem) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // modo: 'preview' — só analisa sem gravar | 'sync' — persiste
    const modo = String(body.modo || 'preview');
    const offset = Number(body.offset || 0);
    const limite = Number(body.limite || 10); // fotos por lote no modo sync

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // ── 1. Carregar inventário atual do DB ──────────────────────────────────
    const [fotosDB, attachmentsDB, atividades, relatorios] = await Promise.all([
      base44.asServiceRole.entities.ReportPhoto.list('-created_date', 5000).catch(() => []),
      base44.asServiceRole.entities.Attachment.list('-created_date', 5000).catch(() => []),
      base44.asServiceRole.entities.Activity.list('-created_date', 2000).catch(() => []),
      base44.asServiceRole.entities.Report.list('-created_date', 500).catch(() => []),
    ]);

    // Índice por drive_file_id para detecção de duplicatas e existência
    const dbPorDriveId = new Map<string, any>();
    for (const f of [...fotosDB, ...attachmentsDB]) {
      const did = f.drive_file_id;
      if (did && !dbPorDriveId.has(did)) dbPorDriveId.set(did, f);
    }

    // Índice de url duplicatas (mesmo file_url mas sem drive_file_id)
    const dbPorUrl = new Map<string, any>();
    for (const f of fotosDB) {
      if (f.file_url && !dbPorUrl.has(f.file_url)) dbPorUrl.set(f.file_url, f);
    }

    // Mapa report
    const reportMap: Record<string, any> = {};
    for (const r of relatorios) reportMap[r.id] = r;

    // ── 2. Percorrer estrutura do Drive ─────────────────────────────────────
    const subItems = await driveListAll(accessToken, PASTA_FOTOS_ATIVIDADES);
    const pastas = subItems.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const fotasRaiz = subItems.filter(f => isImage(f.name, f.mimeType));

    const inventarioDrive: any[] = [];

    // Fotos avulsas na raiz
    for (const foto of fotasRaiz) {
      inventarioDrive.push({
        drive_file_id: foto.id,
        drive_nome: foto.name,
        pasta_nome: '',
        pasta_id: PASTA_FOTOS_ATIVIDADES,
        drive_url: foto.webViewLink || `https://drive.google.com/file/d/${foto.id}/view`,
        thumbnail_url: foto.thumbnailLink?.replace('=s220', '=s800') || `https://drive.google.com/thumbnail?id=${foto.id}&sz=w800`,
        mime: foto.mimeType || 'image/jpeg',
        md5: foto.md5Checksum || '',
        museu: null, mes_referencia: null, mes_nome: null, ano: new Date().getFullYear(),
        autor: null, atividade_id: null, report_id: null,
        legenda: foto.description || foto.name.replace(/\.[^.]+$/, ''),
        score: 0,
      });
    }

    // Fotos em sub-pastas (cada pasta = álbum de atividade)
    for (const pasta of pastas) {
      const info = parseFolderName(pasta.name);

      // Melhor atividade por score semântico
      let melhorAtv: any = null;
      let melhorScore = 0;
      for (const atv of atividades) {
        const s = scoreMatch(atv.titulo || '', pasta.name);
        if (s > melhorScore) { melhorScore = s; melhorAtv = atv; }
      }
      const atvVinculada = melhorScore >= 2 ? melhorAtv : null;
      const reportVinculado = atvVinculada ? reportMap[atvVinculada.report_id] : null;

      const fotosNaPasta = await driveListAll(accessToken, pasta.id);
      for (const foto of fotosNaPasta.filter(f => isImage(f.name, f.mimeType))) {
        const lat = foto.imageMediaMetadata?.location?.latitude || null;
        const lng = foto.imageMediaMetadata?.location?.longitude || null;
        const legenda = foto.description ||
          `Foto de Registro — ${info.autor ? `${atvVinculada?.titulo || info.titulo}  ·  ${info.autor}` : (atvVinculada?.titulo || pasta.name)}`;

        inventarioDrive.push({
          drive_file_id: foto.id,
          drive_nome: foto.name,
          pasta_nome: pasta.name,
          pasta_id: pasta.id,
          drive_url: foto.webViewLink || `https://drive.google.com/file/d/${foto.id}/view`,
          thumbnail_url: foto.thumbnailLink?.replace('=s220', '=s800') || `https://drive.google.com/thumbnail?id=${foto.id}&sz=w800`,
          mime: foto.mimeType || 'image/jpeg',
          md5: foto.md5Checksum || '',
          museu: reportVinculado?.museu || info.museu || null,
          mes_referencia: reportVinculado?.mes_referencia || info.mesNome || null,
          mes_nome: info.mesNome,
          ano: info.ano || new Date().getFullYear(),
          autor: info.autor || reportVinculado?.author_name || 'Daniel Moreira',
          atividade_id: atvVinculada?.id || null,
          report_id: reportVinculado?.id || null,
          legenda,
          geo_latitude: lat,
          geo_longitude: lng,
          score: melhorScore,
        });
      }
    }

    // ── 3. Classificar cada foto do Drive ───────────────────────────────────
    const novas: any[] = [];          // no Drive, não está no DB
    const jaExistentes: any[] = [];   // já importadas corretamente
    const duplicatasDB: any[] = [];   // mesmo drive_file_id aparece >1x no DB

    // Detectar duplicatas no DB (mesmo drive_file_id repetido)
    const contPorDriveId = new Map<string, number>();
    for (const f of [...fotosDB, ...attachmentsDB]) {
      const did = f.drive_file_id;
      if (did) contPorDriveId.set(did, (contPorDriveId.get(did) || 0) + 1);
    }

    for (const item of inventarioDrive) {
      const existente = dbPorDriveId.get(item.drive_file_id);
      if (existente) {
        const cont = contPorDriveId.get(item.drive_file_id) || 1;
        if (cont > 1) {
          duplicatasDB.push({ ...item, db_id: existente.id, duplicatas: cont });
        } else {
          jaExistentes.push({ ...item, db_id: existente.id });
        }
      } else {
        novas.push(item);
      }
    }

    // ── 4. PREVIEW — retorna estatísticas sem gravar ─────────────────────────
    if (modo === 'preview') {
      return Response.json({
        success: true,
        modo: 'preview',
        total_drive: inventarioDrive.length,
        total_pastas: pastas.length,
        total_novas: novas.length,
        total_ja_existentes: jaExistentes.length,
        total_duplicatas_db: duplicatasDB.length,
        total_db_fotos: fotosDB.length,
        total_db_attachments: attachmentsDB.length,
        has_more: false,
        amostras_novas: novas.slice(0, 5),
        amostras_duplicatas: duplicatasDB.slice(0, 5),
      });
    }

    // ── 5. SYNC — importa fotos novas em lote e limpa duplicatas ────────────
    if (modo === 'sync') {
      const lote = novas.slice(offset, offset + limite);
      let criadas = 0;
      let ja_existia = 0;
      const falhas: any[] = [];

      for (const foto of lote) {
        // Verificar novamente (pode ter sido criado em lote anterior)
        if (dbPorDriveId.has(foto.drive_file_id)) { ja_existia++; continue; }
        try {
          const fileUrl = `https://drive.google.com/thumbnail?id=${foto.drive_file_id}&sz=w1600`;

          // Criar Attachment (deduplica por drive_file_id)
          const att = await base44.asServiceRole.entities.Attachment.create({
            file_name: foto.drive_nome,
            file_type: foto.mime,
            file_url: fileUrl,
            description: foto.legenda,
            drive_file_id: foto.drive_file_id,
            drive_folder_id: foto.pasta_id,
            report_id: foto.report_id || undefined,
            activity_id: foto.atividade_id || undefined,
            backup_done: true,
          });

          // Criar ReportPhoto
          await base44.asServiceRole.entities.ReportPhoto.create({
            file_url: fileUrl,
            file_name: foto.drive_nome,
            caption: foto.legenda,
            legenda: foto.legenda,
            author: foto.autor || 'Daniel Moreira',
            museu: foto.museu || undefined,
            mes_referencia: foto.mes_referencia || undefined,
            ano: foto.ano,
            drive_file_id: foto.drive_file_id,
            drive_backup_status: 'concluido',
            report_id: foto.report_id || undefined,
            activity_id: foto.atividade_id || undefined,
            attachment_id: att.id,
          });

          // Vincular à atividade
          if (foto.atividade_id) {
            const atv = await base44.asServiceRole.entities.Activity.get(foto.atividade_id).catch(() => null);
            if (atv) {
              const fotosAtuais = Array.isArray(atv.fotos) ? atv.fotos : [];
              const jaVinculada = fotosAtuais.some((f: any) => f.attachment_id === att.id || f.drive_file_id === foto.drive_file_id);
              if (!jaVinculada) {
                await base44.asServiceRole.entities.Activity.update(foto.atividade_id, {
                  fotos: [...fotosAtuais, { attachment_id: att.id, drive_file_id: foto.drive_file_id }],
                });
              }
            }
          }

          criadas++;
        } catch (e: any) {
          falhas.push({ arquivo: foto.drive_nome, pasta: foto.pasta_nome, erro: e.message });
        }
      }

      // Limpar duplicatas no DB (manter apenas o mais recente por drive_file_id)
      let duplicatasRemovidas = 0;
      if (body.limpar_duplicatas && duplicatasDB.length > 0) {
        const idsComDup = [...new Set(duplicatasDB.map(d => d.drive_file_id))];
        for (const did of idsComDup.slice(0, 20)) {
          const todas = fotosDB.filter((f: any) => f.drive_file_id === did).sort((a: any, b: any) =>
            new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime()
          );
          for (const antiga of todas.slice(1)) {
            await base44.asServiceRole.entities.ReportPhoto.delete(antiga.id).catch(() => {});
            duplicatasRemovidas++;
          }
        }
      }

      const nextOffset = offset + limite;
      const hasMore = nextOffset < novas.length;

      // Log ao final
      if (!hasMore || lote.length === 0) {
        await base44.asServiceRole.entities.BackupLog.create({
          backup_type: 'drive_folders',
          entity_type: 'INVENTARIO_SYNC',
          status: falhas.length === 0 ? 'success' : 'failure',
          processed_at: new Date().toISOString(),
          total_files: novas.length,
          files_copied: criadas,
          details: `Sync inventário: ${criadas} criadas, ${ja_existia} já existiam, ${duplicatasRemovidas} duplicatas removidas, ${falhas.length} erros`,
          triggered_by: isSystem ? 'scheduled' : 'manual',
        }).catch(() => {});
      }

      return Response.json({
        success: true,
        modo: 'sync',
        offset,
        next_offset: nextOffset,
        has_more: hasMore,
        total_novas: novas.length,
        lote_processado: lote.length,
        criadas,
        ja_existia,
        duplicatas_removidas: duplicatasRemovidas,
        falhas,
      });
    }

    return Response.json({ error: 'modo deve ser preview ou sync' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});