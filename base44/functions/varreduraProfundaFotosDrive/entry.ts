import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MUSEU_GEO = {
  'MHAB': { lat: -19.9434, lng: -43.9378, nome: 'Museu Histórico Abílio Barreto', endereco: 'Av. Prudente de Morais, 202 - Cidade Jardim' },
  'MIS':  { lat: -19.9328, lng: -43.9355, nome: 'Museu da Imagem e do Som', endereco: 'Av. Álvares Cabral, 560 - Lourdes' },
  'MUMO': { lat: -19.9214, lng: -43.9395, nome: 'Museu da Moda de BH', endereco: 'Rua da Bahia, 1149 - Centro' },
  'MCK':  { lat: -19.8627, lng: -43.9699, nome: 'Museu Casa Kubitschek', endereco: 'Av. Otacílio Negrão de Lima, 4188 - Bandeirantes' },
  'MAP':  { lat: -19.8541, lng: -43.9749, nome: 'Museu de Arte da Pampulha', endereco: 'Av. Otacílio Negrão de Lima, 16585 - Pampulha' },
  'CASA DO BAILE': { lat: -19.8599, lng: -43.9673, nome: 'Casa do Baile', endereco: 'Av. Otacílio Negrão de Lima, 751 - Pampulha' },
  'NOTURNO': { lat: -19.9167, lng: -43.9345, nome: 'Noturno nos Museus 2026 - BH', endereco: 'Belo Horizonte, MG' },
};

// Mês por token no nome do arquivo/pasta
const MES_TOKENS: Record<string, string> = {
  jan: 'Janeiro', fev: 'Fevereiro', feb: 'Fevereiro',
  mar: 'Março', abr: 'Abril', apr: 'Abril',
  mai: 'Maio', may: 'Maio', jun: 'Junho',
  jul: 'Julho', ago: 'Agosto', aug: 'Agosto',
  set: 'Setembro', sep: 'Setembro', out: 'Outubro', oct: 'Outubro',
  nov: 'Novembro', dez: 'Dezembro', dec: 'Dezembro',
  janeiro: 'Janeiro', fevereiro: 'Fevereiro', marco: 'Março', março: 'Março',
  abril: 'Abril', maio: 'Maio', junho: 'Junho', julho: 'Julho',
  agosto: 'Agosto', setembro: 'Setembro', outubro: 'Outubro',
  novembro: 'Novembro', dezembro: 'Dezembro',
};

function detectarMuseu(nome: string): string | null {
  const n = (nome || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('MHAB') || n.includes('ABILIO') || n.includes('ABARRETO') || n.includes('HISTORICO')) return 'MHAB';
  if (n.includes('MISBH') || n.includes('MIS-BH') || n.includes('MIS_BH') || n.includes('IMAGEM') || /\bMIS\b/.test(n)) return 'MIS';
  if (n.includes('MUMO') || n.includes('MODA')) return 'MUMO';
  if (n.includes('MCK') || n.includes('KUBITSCHEK') || n.includes('KUBITSCHECK')) return 'MCK';
  if (n.includes('MAP') || (n.includes('PAMPULHA') && n.includes('ARTE'))) return 'MAP';
  if (n.includes('BAILE')) return 'CASA DO BAILE';
  if (n.includes('NOTURNO')) return 'NOTURNO';
  return null;
}

function extrairMes(nome: string): string | null {
  const n = (nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // tenta tokens do mapeamento (mais específicos primeiro)
  const tokens = Object.keys(MES_TOKENS).sort((a, b) => b.length - a.length);
  for (const tok of tokens) {
    if (n.includes(tok)) return MES_TOKENS[tok];
  }
  // tenta padrão numérico: 2026-02, 02-2026, fev2026, 2026_02
  const mNum = n.match(/(?:20\d\d[-_]?)(\d{2})|(\d{2})(?:[-_]?20\d\d)/);
  if (mNum) {
    const num = parseInt(mNum[1] || mNum[2], 10);
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    if (num >= 1 && num <= 12) return meses[num - 1];
  }
  return null;
}

function extrairActivityId(nome: string, atividades: any[]): string | null {
  if (!atividades?.length) return null;
  const n = (nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // tentativa exata por ID embutido no nome do arquivo (ex: act_abc123_foto.jpg)
  const idMatch = n.match(/act[_-]?([a-f0-9]{12,})/i);
  if (idMatch) {
    const found = atividades.find(a => a.id === idMatch[1]);
    if (found) return found.id;
  }
  // correspondência por título da atividade
  let best: { id: string; score: number } | null = null;
  for (const act of atividades) {
    const titulo = (act.titulo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!titulo) continue;
    // split em palavras significativas (>= 4 chars)
    const palavras = titulo.split(/\s+/).filter(w => w.length >= 4);
    const score = palavras.filter(w => n.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: act.id, score };
  }
  return best ? best.id : null;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/tiff','image/heic']);

// Lista subpastas de um folder — paginado para cobrir mais de 50
async function listarSubpastas(folderId: string, accessToken: string): Promise<any[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const resultado: any[] = [];
  let pageToken: string | null = null;
  do {
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=nextPageToken,files(id,name)&pageSize=200`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    resultado.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return resultado;
}

// Lista imagens de uma pasta com paginação completa opcional
async function listarImagensPasta(folderId: string, accessToken: string, pageToken: string | null, maxImagens = 500): Promise<{ files: any[]; nextPageToken: string | null }> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  // Busca qualquer arquivo (filtramos por MIME depois) para capturar mais
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=nextPageToken,files(id,name,mimeType,thumbnailLink,createdTime,modifiedTime,imageMediaMetadata)&pageSize=1000`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return { files: [], nextPageToken: null };
  const data = await res.json();
  const images = (data.files || []).filter((f: any) => IMAGE_MIME_TYPES.has(f.mimeType));
  return { files: images.slice(0, maxImagens), nextPageToken: data.nextPageToken || null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const folderId  = body.folderId  || '1rnpwK5eEY0bPFLbmyqfzzzyxbw9Zm3oh';
    const reportId  = body.reportId  || '6a5524d079963e8244afda9a';
    const currentFolderIndex: number = body.currentFolderIndex ?? 0;
    const currentPageToken:   string | null = body.currentPageToken ?? null;
    // Número de pastas por chamada — aumentado para 8
    const BATCH = body.batch ?? 8;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // ── 1. Mapear TODA a árvore de pastas (até 4 níveis) ──────────────────────
    const todasPastas: { id: string; name: string; breadcrumb: string }[] = [
      { id: folderId, name: 'raiz', breadcrumb: '' }
    ];

    const subpastas1 = await listarSubpastas(folderId, accessToken);
    for (const p1 of subpastas1) {
      todasPastas.push({ id: p1.id, name: p1.name, breadcrumb: p1.name });
      const subpastas2 = await listarSubpastas(p1.id, accessToken);
      for (const p2 of subpastas2) {
        todasPastas.push({ id: p2.id, name: p2.name, breadcrumb: `${p1.name}/${p2.name}` });
        const subpastas3 = await listarSubpastas(p2.id, accessToken);
        for (const p3 of subpastas3) {
          todasPastas.push({ id: p3.id, name: p3.name, breadcrumb: `${p1.name}/${p2.name}/${p3.name}` });
          // Nível 4
          const subpastas4 = await listarSubpastas(p3.id, accessToken);
          for (const p4 of subpastas4) {
            todasPastas.push({ id: p4.id, name: p4.name, breadcrumb: `${p1.name}/${p2.name}/${p3.name}/${p4.name}` });
          }
        }
      }
    }

    // ── 2. Carregar dados do relatório e existentes ────────────────────────────
    const [existentes, report] = await Promise.all([
      base44.asServiceRole.entities.ReportPhoto.filter({ report_id: reportId }, '-created_date', 5000),
      base44.asServiceRole.entities.Report.get(reportId),
    ]);

    const existentesSet = new Set(existentes.map((e: any) => e.drive_file_id).filter(Boolean));
    const atividadesReport: any[] = Array.isArray(report?.atividades) ? report.atividades : [];

    // ── 3. Processar lote de pastas ───────────────────────────────────────────
    const pastasAProcessar = todasPastas.slice(currentFolderIndex, currentFolderIndex + BATCH);
    let criados = 0;
    let novasVinculacoes = 0;
    const linksPorMuseu: Record<string, any> = {};

    for (let pi = 0; pi < pastasAProcessar.length; pi++) {
      const pasta = pastasAProcessar[pi];
      const contexto = `${pasta.name} ${pasta.breadcrumb}`;

      // Detectar museu e mês pelo contexto da pasta
      const museuPasta  = detectarMuseu(contexto) || 'NOTURNO';
      const mesPasta    = extrairMes(contexto);
      const geoInfo     = MUSEU_GEO[museuPasta] || MUSEU_GEO['NOTURNO'];

      // Usar pageToken apenas na primeira pasta do lote (retomada de paginação)
      const pToken = pi === 0 ? currentPageToken : null;
      const { files: imagens, nextPageToken } = await listarImagensPasta(pasta.id, accessToken, pToken);

      for (const arquivo of imagens) {
        if (existentesSet.has(arquivo.id)) continue;

        // Refinar museu e mês pelo nome do arquivo se a pasta não deixou claro
        const museu  = detectarMuseu(arquivo.name) || museuPasta;
        const mes    = extrairMes(arquivo.name) || mesPasta || 'Junho';
        const geoFinal = MUSEU_GEO[museu] || geoInfo;

        // Tentar vincular a uma atividade do relatório
        const activityId = extrairActivityId(`${arquivo.name} ${contexto}`, atividadesReport);

        const thumbnailUrl = arquivo.thumbnailLink
          ? arquivo.thumbnailLink.replace('=s220', '=s1600')
          : `https://drive.google.com/thumbnail?id=${arquivo.id}&sz=w1600`;

        const shareUrl = `https://drive.google.com/file/d/${arquivo.id}/view?usp=sharing`;

        // Extrair data da foto: preferir metadado da imagem, depois createdTime
        const dataFoto = arquivo.imageMediaMetadata?.time || arquivo.createdTime || null;

        const legenda = `Foto de Registro — ${geoFinal.nome} — ${mes}/2026`;

        await base44.asServiceRole.entities.ReportPhoto.create({
          report_id:          reportId,
          activity_id:        activityId || undefined,
          drive_file_id:      arquivo.id,
          file_url:           thumbnailUrl,
          file_name:          arquivo.name,
          caption:            legenda,
          legenda,
          author:             'Daniela Isis',
          museu,
          mes_referencia:     mes,
          ano:                2026,
          drive_backup_status:'concluido',
          fonte_ia:           'drive_sync',
          galeria_oculta:     false,
          contexto_ia:        JSON.stringify({
            drive_share_url:  shareUrl,
            pasta_origem:     contexto,
            data_foto:        dataFoto,
            geolocalizacao:   { lat: geoFinal.lat, lng: geoFinal.lng, endereco: geoFinal.endereco, nome_local: geoFinal.nome },
            evento:           '11ª Edição Noturno nos Museus 2026',
          }),
        });

        criados++;
        if (activityId) novasVinculacoes++;
        existentesSet.add(arquivo.id);

        if (!linksPorMuseu[museu]) linksPorMuseu[museu] = { total: 0, geo: geoFinal, exemplos: [] };
        linksPorMuseu[museu].total++;
        if (linksPorMuseu[museu].exemplos.length < 3) {
          linksPorMuseu[museu].exemplos.push({ url: thumbnailUrl, share: shareUrl, nome: arquivo.name });
        }
      }

      // Se há mais páginas nesta pasta, pausar e pedir próxima chamada
      if (nextPageToken) {
        return Response.json({
          status:         'parcial',
          criadas:        criados,
          vinculacoes:    novasVinculacoes,
          total_pastas:   todasPastas.length,
          pastas_processadas: currentFolderIndex + pi + 1,
          proxima_chamada: { currentFolderIndex: currentFolderIndex + pi, currentPageToken: nextPageToken },
          links_por_museu: linksPorMuseu,
        });
      }
    }

    const proximoIndice = currentFolderIndex + BATCH;
    const hasMore = proximoIndice < todasPastas.length;

    // ── 4. Ao concluir tudo: vincular fotos às atividades do relatório ─────────
    if (!hasMore && atividadesReport.length > 0) {
      // Carregar todas as fotos do report para distribuição
      const todasFotos = await base44.asServiceRole.entities.ReportPhoto.filter(
        { report_id: reportId }, '-created_date', 5000
      );

      // Agrupar por activity_id (vínculo direto) e por museu (fallback)
      const fotosPorActivity: Record<string, any[]> = {};
      const fotosPorMuseu:    Record<string, any[]> = {};
      for (const f of todasFotos) {
        if (f.activity_id) {
          fotosPorActivity[f.activity_id] = fotosPorActivity[f.activity_id] || [];
          fotosPorActivity[f.activity_id].push(f);
        }
        const mk = f.museu || 'NOTURNO';
        fotosPorMuseu[mk] = fotosPorMuseu[mk] || [];
        fotosPorMuseu[mk].push(f);
      }

      const atividadesAtualizadas = atividadesReport.map((atv: any) => {
        // Já tem fotos suficientes — não sobrescrever
        if (Array.isArray(atv.fotos) && atv.fotos.length >= 3) return atv;

        // 1. Fotos diretamente vinculadas pelo activity_id
        const vinculadas = atv.id ? (fotosPorActivity[atv.id] || []) : [];

        // 2. Fallback por museu extraído do título
        const museuAtv = detectarMuseu(atv.titulo || '') || 'NOTURNO';
        const fallback  = (fotosPorMuseu[museuAtv] || fotosPorMuseu['NOTURNO'] || [])
          .filter((f: any) => !vinculadas.find((v: any) => v.id === f.id));

        const candidatas = [...vinculadas, ...fallback].slice(0, 5);
        if (candidatas.length === 0) return atv;

        const novasFotos = candidatas.map((f: any) => ({
          attachment_id: f.attachment_id || null,
          file_url:      f.file_url,
          legenda:       f.legenda || f.caption || '',
          autor:         f.author || 'Daniela Isis',
          ordem:         0,
        }));

        const fotosExistentes = Array.isArray(atv.fotos) ? atv.fotos : [];
        const idsExistentes   = new Set(fotosExistentes.map((f: any) => f.file_url));
        const novasUnicas     = novasFotos.filter((f: any) => !idsExistentes.has(f.file_url));

        return { ...atv, fotos: [...fotosExistentes, ...novasUnicas].slice(0, 5) };
      });

      await base44.asServiceRole.entities.Report.update(reportId, { atividades: atividadesAtualizadas });
    }

    return Response.json({
      status:            hasMore ? 'parcial' : 'concluido',
      criadas:           criados,
      vinculacoes:       novasVinculacoes,
      total_pastas:      todasPastas.length,
      pastas_processadas: currentFolderIndex + pastasAProcessar.length,
      proxima_chamada:   hasMore ? { currentFolderIndex: proximoIndice, currentPageToken: null } : null,
      links_por_museu:   linksPorMuseu,
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});