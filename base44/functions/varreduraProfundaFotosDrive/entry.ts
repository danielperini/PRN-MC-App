import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MUSEU_GEO = {
  'MHAB': { lat: -19.9434, lng: -43.9378, nome: 'Museu Histórico Abílio Barreto', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim' },
  'MIS': { lat: -19.9328, lng: -43.9355, nome: 'Museu da Imagem e do Som', endereco: 'Av. Álvares Cabral, 560 - Lourdes' },
  'MUMO': { lat: -19.9214, lng: -43.9395, nome: 'Museu da Moda de BH', endereco: 'Rua da Bahia, 1149 - Centro' },
  'MCK': { lat: -19.8627, lng: -43.9699, nome: 'Museu Casa Kubitschek', endereco: 'Av. Otacílio Negrão de Lima, 4188 - Bandeirantes' },
  'MAP': { lat: -19.8541, lng: -43.9749, nome: 'Museu de Arte da Pampulha', endereco: 'Av. Otacílio Negrão de Lima, 16585 - Pampulha' },
  'CASA DO BAILE': { lat: -19.8599, lng: -43.9673, nome: 'Casa do Baile', endereco: 'Av. Otacílio Negrão de Lima, 751 - Pampulha' },
  'NOTURNO': { lat: -19.9167, lng: -43.9345, nome: 'Noturno nos Museus 2026 - BH', endereco: 'Belo Horizonte, MG' },
};

function detectarMuseu(nome) {
  const n = (nome || '').toUpperCase();
  if (n.includes('MHAB') || n.includes('ABILIO') || n.includes('ABARRETO')) return 'MHAB';
  if (n.includes('MISBH') || n.includes('MIS-BH') || n.includes('IMAGEM') || n.includes('MIS ') || n.includes('-MIS') || n.includes('_MIS')) return 'MIS';
  if (n.includes('MUMO') || n.includes('MODA')) return 'MUMO';
  if (n.includes('MCK') || n.includes('KUBITSCHEK') || n.includes('KUBITSCHECK')) return 'MCK';
  if (n.includes('MAP') || n.includes('PAMPULHA') && n.includes('ARTE')) return 'MAP';
  if (n.includes('BAILE')) return 'CASA DO BAILE';
  if (n.includes('NOTURNO') || n.includes('NOTURNO')) return 'NOTURNO';
  return null;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/tiff']);

// Lista apenas subpastas de um folder (sem recursão)
async function listarSubpastas(folderId, accessToken) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)&pageSize=50`,
    { headers: authHeader }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.files || [];
}

// Lista imagens de UMA pasta (sem recursão), com pageToken de paginação
async function listarImagensPasta(folderId, accessToken, pageToken) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=nextPageToken,files(id,name,mimeType,thumbnailLink,createdTime)&pageSize=50`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url, { headers: authHeader });
  if (!res.ok) return { files: [], nextPageToken: null };
  const data = await res.json();
  const images = (data.files || []).filter(f => IMAGE_MIME_TYPES.has(f.mimeType));
  return { files: images, nextPageToken: data.nextPageToken || null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const folderId = body.folderId || '1rnpwK5eEY0bPFLbmyqfzzzyxbw9Zm3oh';
    const reportId = body.reportId || '6a5524d079963e8244afda9a';
    // Para paginação incremental: pasta atual e page token
    const currentFolderIndex = body.currentFolderIndex || 0;
    const currentPageToken = body.currentPageToken || null;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // 1. Descobrir todas as subpastas (nível 1 e 2)
    const subpastas1 = await listarSubpastas(folderId, accessToken);
    let todasPastas = [{ id: folderId, name: 'raiz', parentName: '' }];
    for (const p of subpastas1) {
      todasPastas.push({ id: p.id, name: p.name, parentName: '' });
      const subpastas2 = await listarSubpastas(p.id, accessToken);
      for (const p2 of subpastas2) {
        todasPastas.push({ id: p2.id, name: p2.name, parentName: p.name });
        // Nível 3
        const subpastas3 = await listarSubpastas(p2.id, accessToken);
        for (const p3 of subpastas3) {
          todasPastas.push({ id: p3.id, name: p3.name, parentName: p2.name + '/' + p.name });
        }
      }
    }

    // Checar existentes
    const existentes = await base44.asServiceRole.entities.ReportPhoto.filter({ report_id: reportId });
    const existentesSet = new Set(existentes.map(e => e.drive_file_id).filter(Boolean));

    // 2. Processar pasta pelo índice (máx 5 pastas por chamada para não timeout)
    const BATCH = 5;
    const pastasAProcessar = todasPastas.slice(currentFolderIndex, currentFolderIndex + BATCH);
    let criados = 0;
    const linksPorMuseu = {};

    for (const pasta of pastasAProcessar) {
      const contextoNome = pasta.name + ' ' + pasta.parentName;
      const museuKey = detectarMuseu(contextoNome) || 'NOTURNO';
      const geoInfo = MUSEU_GEO[museuKey];

      let pageToken = (pasta.id === todasPastas[currentFolderIndex]?.id) ? currentPageToken : null;

      // Processa até 50 imagens por pasta nesta chamada
      const { files: imagens, nextPageToken } = await listarImagensPasta(pasta.id, accessToken, pageToken);

      for (const arquivo of imagens) {
        if (existentesSet.has(arquivo.id)) continue;

        const thumbnailUrl = arquivo.thumbnailLink
          ? arquivo.thumbnailLink.replace('=s220', '=s1600')
          : `https://drive.google.com/thumbnail?id=${arquivo.id}&sz=w1600`;

        const shareUrl = `https://drive.google.com/file/d/${arquivo.id}/view?usp=sharing`;
        const legenda = `Foto de Registro — 11ª Edição Noturno nos Museus 2026 — ${geoInfo.nome} — Daniela Isis`;

        await base44.asServiceRole.entities.ReportPhoto.create({
          report_id: reportId,
          drive_file_id: arquivo.id,
          file_url: thumbnailUrl,
          file_name: arquivo.name,
          caption: legenda,
          legenda,
          author: 'Daniela Isis',
          museu: museuKey,
          mes_referencia: 'Junho',
          ano: 2026,
          drive_backup_status: 'concluido',
          fonte_ia: 'drive_sync',
          galeria_oculta: false,
          contexto_ia: JSON.stringify({
            drive_share_url: shareUrl,
            pasta_origem: contextoNome,
            geolocalizacao: { lat: geoInfo.lat, lng: geoInfo.lng, endereco: geoInfo.endereco, nome_local: geoInfo.nome },
            evento: '11ª Edição Noturno nos Museus 2026',
            data_evento: '2026-06-26',
          }),
        });

        criados++;
        existentesSet.add(arquivo.id);

        if (!linksPorMuseu[museuKey]) linksPorMuseu[museuKey] = { total: 0, geo: geoInfo, exemplos: [] };
        linksPorMuseu[museuKey].total++;
        if (linksPorMuseu[museuKey].exemplos.length < 3) {
          linksPorMuseu[museuKey].exemplos.push({ url: thumbnailUrl, share: shareUrl, nome: arquivo.name });
        }
      }

      // Se há mais páginas nesta pasta, indica para próxima chamada continuar aqui
      if (nextPageToken) {
        return Response.json({
          status: 'parcial',
          criadas: criados,
          proxima_chamada: { currentFolderIndex, currentPageToken: nextPageToken },
          total_pastas: todasPastas.length,
          links_por_museu: linksPorMuseu,
        });
      }
    }

    const proximoIndice = currentFolderIndex + BATCH;
    const hasMore = proximoIndice < todasPastas.length;

    // Se concluiu tudo, atualiza atividades do relatório com fotos dos museus
    if (!hasMore) {
      const report = await base44.asServiceRole.entities.Report.get(reportId);
      if (report && Array.isArray(report.atividades)) {
        // Pegar fotos recentes por museu
        const [fotosMUMO, fotosMHAB, fotosMIS, fotosGeral] = await Promise.all([
          base44.asServiceRole.entities.ReportPhoto.filter({ report_id: reportId, museu: 'MUMO' }, '-created_date', 4),
          base44.asServiceRole.entities.ReportPhoto.filter({ report_id: reportId, museu: 'MHAB' }, '-created_date', 4),
          base44.asServiceRole.entities.ReportPhoto.filter({ report_id: reportId, museu: 'MIS' }, '-created_date', 4),
          base44.asServiceRole.entities.ReportPhoto.filter({ report_id: reportId }, '-created_date', 6),
        ]);

        const mapa = { MUMO: fotosMUMO, MHAB: fotosMHAB, MIS: fotosMIS };

        const atividadesAtualizadas = report.atividades.map(atv => {
          const titulo = (atv.titulo || '').toUpperCase();
          let chave = null;
          if (titulo.includes('MHAB') || (titulo.includes('HIST') && titulo.includes('ABILIO'))) chave = 'MHAB';
          else if (titulo.includes('MIS') || titulo.includes('IMAGEM')) chave = 'MIS';
          else if (titulo.includes('MUMO') || titulo.includes('MODA')) chave = 'MUMO';

          const fonte = chave ? mapa[chave] : fotosGeral;
          if (!fonte || fonte.length === 0) return atv;

          const novasFotos = fonte.slice(0, 3).map(f => ({
            attachment_id: f.attachment_id || null,
            file_url: f.file_url,
            legenda: f.legenda,
            autor: 'Daniela Isis',
            ordem: 0,
          }));

          return { ...atv, fotos: [...(atv.fotos || []).slice(0, 3), ...novasFotos] };
        });

        await base44.asServiceRole.entities.Report.update(reportId, { atividades: atividadesAtualizadas });
      }
    }

    return Response.json({
      status: hasMore ? 'parcial' : 'concluido',
      criadas: criados,
      total_pastas: todasPastas.length,
      pastas_processadas: currentFolderIndex + pastasAProcessar.length,
      proxima_chamada: hasMore ? { currentFolderIndex: proximoIndice, currentPageToken: null } : null,
      links_por_museu: linksPorMuseu,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});