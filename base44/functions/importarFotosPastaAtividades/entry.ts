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

// Extrai metadados do padrão de nome de pasta: AAAA-MM-MUSEU-TITULO Fotos - Autor
function parseFolderName(folderName = '') {
  // Extrai autor após "Fotos -" ou "Fotos-"
  const autorMatch = folderName.match(/[Ff]otos\s*[-–]\s*(.+)/);
  const autor = autorMatch ? autorMatch[1].trim() : null;

  // Extrai museu
  const museuMatch = folderName.match(/\b(MHAB|MIS|MUMO)\b/i);
  const museu = museuMatch ? museuMatch[1].toUpperCase() : null;

  // Extrai mês/ano pelo padrão AAAA-MM no início
  const dataMatch = folderName.match(/^(\d{4})-(\d{2})/);
  const mesRef = dataMatch ? `${dataMatch[1]}-${dataMatch[2]}` : null;

  // Título da atividade: entre museu e "Fotos"
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
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const modo = payload.modo || 'preview';   // 'preview' | 'importar'
    const offset = Number(payload.offset || 0);
    const limite = Number(payload.limite || 20);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // 1. Buscar sub-pastas da raiz (cada uma = título de atividade)
    const subpastas = await listAllInFolder(accessToken, FOTOS_PASTA_RAIZ);
    const pastasFotos = subpastas.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const fotasAvulsas = subpastas.filter(f => f.mimeType !== 'application/vnd.google-apps.folder' && isImage(f.name, f.mimeType));

    // 2. Carregar atividades e relatórios para vinculação
    const [atividades, relatorios] = await Promise.all([
      base44.asServiceRole.entities.Activity.list('-created_date', 2000),
      base44.asServiceRole.entities.Report.list('-created_date', 500),
    ]);

    // Mapa report_id → report para recuperar autor e museu
    const reportMap = {};
    for (const r of relatorios) reportMap[r.id] = r;

    // 3. Para cada sub-pasta, encontrar fotos e vincular atividade por score semântico
    const resultados = [];

    // Processar fotos avulsas na raiz (sem pasta de atividade)
    for (const foto of fotasAvulsas) {
      resultados.push({
        drive_file_id: foto.id,
        drive_nome_original: foto.name,
        pasta_nome: '',
        pasta_id: FOTOS_PASTA_RAIZ,
        drive_url: foto.webViewLink || `https://drive.google.com/file/d/${foto.id}/view`,
        thumbnail_url: foto.thumbnailLink ? foto.thumbnailLink.replace('=s220', '=s800') : `https://drive.google.com/thumbnail?id=${foto.id}&sz=w800`,
        mime: foto.mimeType,
        atividade_id: null,
        atividade_titulo: null,
        report_id: null,
        autor_relatorio: null,
        museu: null,
        mes_referencia: null,
        geo_latitude: foto.imageMediaMetadata?.location?.latitude || null,
        geo_longitude: foto.imageMediaMetadata?.location?.longitude || null,
        geo_coordinates: foto.imageMediaMetadata?.location?.latitude
          ? `${foto.imageMediaMetadata.location.latitude.toFixed(6)}, ${foto.imageMediaMetadata.location.longitude.toFixed(6)}`
          : '',
        legenda: foto.description || foto.name.replace(/\.[^.]+$/, ''),
        score: 0,
      });
    }

    for (const pasta of pastasFotos) {
      // Buscar melhor atividade correspondente
      let melhorAtividade = null;
      let melhorScore = 0;
      for (const atv of atividades) {
        const s = scoreMatch(atv.titulo || '', pasta.name);
        if (s > melhorScore) { melhorScore = s; melhorAtividade = atv; }
      }

      const atvVinculada = melhorScore >= 2 ? melhorAtividade : null;
      const reportVinculado = atvVinculada ? reportMap[atvVinculada.report_id] : null;
      const pastaInfo = parseFolderName(pasta.name);

      // Listar fotos dentro da pasta
      const fotosNaPasta = await listAllInFolder(accessToken, pasta.id);
      const imagensDaPasta = fotosNaPasta.filter(f => isImage(f.name, f.mimeType));

      for (const foto of imagensDaPasta) {
        const lat = foto.imageMediaMetadata?.location?.latitude || null;
        const lng = foto.imageMediaMetadata?.location?.longitude || null;
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
          geo_latitude: lat,
          geo_longitude: lng,
          geo_coordinates: lat ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '',
          legenda: foto.description || `Foto de Registro — ${pastaInfo.autor ? `${atvVinculada?.titulo || pastaInfo.titulo}  ·  ${pastaInfo.autor}` : (atvVinculada?.titulo || pasta.name)}`,
          score: melhorScore,
        });
      }
    }

    // 4. Atividades sem fotos de registro
    const atividadesComFoto = new Set(resultados.filter(r => r.atividade_id).map(r => r.atividade_id));
    const atividadesSemFoto = atividades
      .filter(a => !atividadesComFoto.has(a.id) && (!a.fotos || a.fotos.length === 0))
      .map(a => {
        const r = reportMap[a.report_id];
        return {
          id: a.id,
          titulo: a.titulo,
          report_id: a.report_id,
          museu: r?.museu || null,
          autor: r?.author_name || null,
          mes: r?.mes_referencia || null,
        };
      })
      .slice(0, 100);

    if (modo === 'preview') {
      const paginados = resultados.slice(offset, offset + limite);
      return Response.json({
        success: true,
        total: resultados.length,
        total_pastas: pastasFotos.length,
        total_fotos: resultados.length,
        atividades_sem_foto: atividadesSemFoto.length,
        atividades_sem_foto_lista: atividadesSemFoto,
        has_more: offset + limite < resultados.length,
        next_offset: offset + limite,
        resultados: paginados,
      });
    }

    // modo 'importar': persiste no Attachment e vincula à atividade
    if (modo === 'importar') {
      const lote = resultados.slice(offset, offset + limite);
      let criadas = 0;
      let ja_existia = 0;
      const falhas = [];

      // Buscar existentes pelo drive_file_id
      const existentes = await base44.asServiceRole.entities.Attachment.filter({ drive_file_id: { $in: lote.map(f => f.drive_file_id).filter(Boolean) } });
      const existenteIds = new Set(existentes.map(e => e.drive_file_id));

      for (const foto of lote) {
        if (existenteIds.has(foto.drive_file_id)) { ja_existia++; continue; }
        try {
          // URL direta para visualização
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

          // Criar também ReportPhoto para aparecer na galeria com todos os metadados
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

          // Vincular foto à atividade
          if (foto.atividade_id) {
            const atv = await base44.asServiceRole.entities.Activity.get(foto.atividade_id).catch(() => null);
            if (atv) {
              const fotosAtuais = Array.isArray(atv.fotos) ? atv.fotos : [];
              const jaVinculada = fotosAtuais.some(f => f.attachment_id === att.id);
              if (!jaVinculada) {
                await base44.asServiceRole.entities.Activity.update(foto.atividade_id, {
                  fotos: [...fotosAtuais, { attachment_id: att.id }],
                });
              }
            }
          }

          criadas++;
        } catch (e) {
          falhas.push({ arquivo: foto.drive_nome_original, erro: e.message });
        }
      }

      return Response.json({
        success: true,
        criadas,
        ja_existia,
        falhas,
        has_more: offset + limite < resultados.length,
        next_offset: offset + limite,
        total: resultados.length,
      });
    }

    return Response.json({ error: 'modo inválido' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});