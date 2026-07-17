import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Locais do Noturno nos Museus com coordenadas reais de BH
const LOCAIS_NOTURNO = [
  {
    nome: 'Museu Histórico Abílio Barreto (MHAB)',
    bairro: 'Cidade Jardim',
    endereco: 'Av. Prudente de Morais, 202 – Cidade Jardim, BH/MG',
    coordenadas: '-19.9400, -43.9550',
  },
  {
    nome: 'Museu da Imagem e do Som (MIS BH)',
    bairro: 'Centro',
    endereco: 'Av. Afonso Pena, 1520 – Centro, BH/MG',
    coordenadas: '-19.9191, -43.9378',
  },
  {
    nome: 'Museu de Artes e Ofícios (MAO)',
    bairro: 'Centro',
    endereco: 'Praça da Estação, s/n – Centro, BH/MG',
    coordenadas: '-19.9141, -43.9349',
  },
  {
    nome: 'Museu Mineiro',
    bairro: 'Centro',
    endereco: 'Av. João Pinheiro, 342 – Centro, BH/MG',
    coordenadas: '-19.9234, -43.9386',
  },
  {
    nome: 'Casa Kubitschek',
    bairro: 'Pampulha',
    endereco: 'Av. João Antônio Alves, 90 – Pampulha, BH/MG',
    coordenadas: '-19.8631, -43.9741',
  },
  {
    nome: 'Casa do Baile',
    bairro: 'Pampulha',
    endereco: 'Av. Otacílio Negrão de Lima, 751 – Pampulha, BH/MG',
    coordenadas: '-19.8591, -43.9754',
  },
  {
    nome: 'Museu de Arte da Pampulha (MAP)',
    bairro: 'Pampulha',
    endereco: 'Av. Otacílio Negrão de Lima, 16.585 – Pampulha, BH/MG',
    coordenadas: '-19.8571, -43.9742',
  },
  {
    nome: 'Museu do Museu (MUMO)',
    bairro: 'Centro',
    endereco: 'Rua da Bahia, 1149 – Centro, BH/MG',
    coordenadas: '-19.9249, -43.9431',
  },
];

const AUTORES = ['Daniel Moreira', 'Arquivo Viaduto das Artes'];
const PASTA_NOTURNO_ID = '1rnpwK5eEY0bPFLbmyqfzzzyxbw9Zm3oh';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { dry_run = false, max_por_local = 5, min_por_local = 3 } = body;

    const srv = base44.asServiceRole;

    // 1. Obter token do Google Drive
    const { accessToken } = await srv.connectors.getConnection('googledrive');
    const headers = { Authorization: `Bearer ${accessToken}` };

    // 2. Listar todos os arquivos de imagem na pasta do Drive (e subpastas)
    const todasFotos: any[] = [];

    async function listarImagensNaPasta(pastaId: string, profundidade = 0) {
      if (profundidade > 3) return;
      let pageToken: string | null = null;
      do {
        const url = new URL('https://www.googleapis.com/drive/v3/files');
        url.searchParams.set('q', `'${pastaId}' in parents and trashed=false`);
        url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,createdTime,imageMediaMetadata,description,thumbnailLink,webViewLink)');
        url.searchParams.set('pageSize', '200');
        url.searchParams.set('orderBy', 'createdTime desc');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const res = await fetch(url.toString(), { headers });
        if (!res.ok) break;
        const data = await res.json();
        const arquivos = data.files || [];

        for (const f of arquivos) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            await listarImagensNaPasta(f.id, profundidade + 1);
          } else if (f.mimeType?.startsWith('image/')) {
            todasFotos.push(f);
          }
        }
        pageToken = data.nextPageToken || null;
      } while (pageToken && todasFotos.length < 2000);
    }

    await listarImagensNaPasta(PASTA_NOTURNO_ID);

    if (todasFotos.length === 0) {
      return Response.json({ error: 'Nenhuma imagem encontrada na pasta do Drive.', pasta: PASTA_NOTURNO_ID }, { status: 404 });
    }

    // 3. Para cada local, usar IA para selecionar as melhores fotos e criar legenda
    const albumPorLocal: any[] = [];
    const fotosSelecionadas: any[] = [];

    for (const local of LOCAIS_NOTURNO) {
      // Filtrar fotos que mencionam o local no nome ou descrição (heurística)
      const termos = [
        local.nome.toLowerCase(),
        local.bairro.toLowerCase(),
        local.nome.split(' ').pop()?.toLowerCase() || '',
        // siglas
        local.nome.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() || '',
      ].filter(Boolean);

      const fotosDoLocal = todasFotos.filter(f => {
        const txt = (f.name + ' ' + (f.description || '')).toLowerCase();
        return termos.some(t => t.length > 3 && txt.includes(t));
      });

      // Se não há fotos específicas, pegar fotos gerais (distribui equitativamente)
      const pool = fotosDoLocal.length >= min_por_local ? fotosDoLocal : todasFotos;

      // Pegar amostra para IA avaliar (máx 15 candidatas)
      const candidatas = pool.slice(0, 15).map(f => ({
        id: f.id,
        nome: f.name,
        descricao: f.description || '',
        data: f.createdTime || '',
        thumbnail: f.thumbnailLink || `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`,
        url_view: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      }));

      if (candidatas.length < min_por_local) continue;

      // IA seleciona e redige legendas
      const promptIA = `Você é curador de fotografia cultural. Analise as seguintes ${candidatas.length} fotos da pasta "Noturno nos Museus" referentes ao local "${local.nome}" (${local.endereco}).

FOTOS DISPONÍVEIS:
${JSON.stringify(candidatas, null, 2)}

TAREFA:
1. Selecione entre ${min_por_local} e ${max_por_local} fotos que melhor representem o evento noturno neste local.
2. Priorize: qualidade estética, diversidade de ângulos, representatividade do evento.
3. Para cada foto selecionada, escreva uma legenda jornalística/cultural de 1-2 frases em português do Brasil.
4. A legenda deve citar: o local (${local.nome}), o caráter noturno/cultural do evento, elementos visuais presentes.
5. Autor das fotos: ${AUTORES[0]} / ${AUTORES[1]} (use ambos alternadamente).

Retorne JSON com array "fotos_selecionadas" onde cada item tem: id, nome, legenda, autor.`;

      let selecionadas: any[] = [];
      try {
        const iaRes = await base44.integrations.Core.InvokeLLM({
          prompt: promptIA,
          response_json_schema: {
            type: 'object',
            properties: {
              fotos_selecionadas: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    nome: { type: 'string' },
                    legenda: { type: 'string' },
                    autor: { type: 'string' },
                  },
                  required: ['id', 'legenda'],
                },
              },
            },
            required: ['fotos_selecionadas'],
          },
        });
        selecionadas = (iaRes?.fotos_selecionadas || []).slice(0, max_por_local);
      } catch {
        // Fallback: pegar primeiras fotos sem IA
        selecionadas = candidatas.slice(0, max_por_local).map((f, i) => ({
          id: f.id,
          nome: f.nome,
          legenda: `${local.nome} durante o Noturno nos Museus. Registro fotográfico do evento cultural noturno em Belo Horizonte.`,
          autor: AUTORES[i % AUTORES.length],
        }));
      }

      // Montar fotos do álbum com URLs de visualização
      const fotosAlbumLocal = selecionadas
        .map(s => {
          const original = candidatas.find(c => c.id === s.id) || candidatas[0];
          return {
            drive_file_id: original.id,
            file_url: `https://drive.google.com/thumbnail?id=${original.id}&sz=w800`,
            thumb_url: `https://drive.google.com/thumbnail?id=${original.id}&sz=w400`,
            view_url: `https://drive.google.com/file/d/${original.id}/view`,
            nome_arquivo: original.nome || s.nome || '',
            legenda: s.legenda,
            autor: s.autor || AUTORES[0],
            local: local.nome,
            bairro: local.bairro,
            endereco: local.endereco,
            coordenadas: local.coordenadas,
            album: 'Noturno nos Museus',
          };
        })
        .filter(f => f.drive_file_id);

      if (fotosAlbumLocal.length >= min_por_local) {
        albumPorLocal.push({
          local: local.nome,
          bairro: local.bairro,
          endereco: local.endereco,
          coordenadas: local.coordenadas,
          total_fotos: fotosAlbumLocal.length,
          fotos: fotosAlbumLocal,
        });
        fotosSelecionadas.push(...fotosAlbumLocal);
      }
    }

    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        total_fotos_drive: todasFotos.length,
        total_selecionadas: fotosSelecionadas.length,
        locais_com_fotos: albumPorLocal.length,
        album: albumPorLocal,
      });
    }

    // 4. Salvar álbum como ReportPhoto com tag de álbum
    // Buscar ou criar report especial para o álbum Noturno
    let reportAlbum = await srv.entities.Report.filter({ tipo: 'mensal', mes_referencia: 'Album-Noturno-2026' });
    let reportId: string;

    if (reportAlbum.length === 0) {
      const novoReport = await srv.entities.Report.create({
        author_name: 'Curadoria Viaduto das Artes',
        author_role: 'ADMIN',
        museu: 'Noturno nos Museus',
        mes_referencia: 'Album-Noturno-2026',
        ano: 2026,
        status: 'APPROVED',
        tipo: 'mensal',
        resumo_periodo: 'Álbum fotográfico curado do evento Noturno nos Museus de Belo Horizonte.',
      });
      reportId = novoReport.id;
    } else {
      reportId = reportAlbum[0].id;
    }

    // Limpar fotos antigas do álbum
    const fotosAntigas = await srv.entities.ReportPhoto.filter({ report_id: reportId });
    for (const f of fotosAntigas) {
      await srv.entities.ReportPhoto.delete(f.id);
    }

    // Salvar novas fotos
    let salvas = 0;
    for (let i = 0; i < fotosSelecionadas.length; i++) {
      const f = fotosSelecionadas[i];
      try {
        await srv.entities.ReportPhoto.create({
          report_id: reportId,
          file_url: f.file_url,
          file_name: f.nome_arquivo || f.local,
          caption: f.legenda,
          author: f.autor,
          mes_referencia: 'Album-Noturno-2026',
          ano: 2026,
          ordem: i,
        });
        salvas++;
      } catch { /* continua */ }
    }

    return Response.json({
      success: true,
      total_fotos_drive: todasFotos.length,
      total_selecionadas: fotosSelecionadas.length,
      total_salvas: salvas,
      locais_com_fotos: albumPorLocal.length,
      report_album_id: reportId,
      album: albumPorLocal,
    });

  } catch (error) {
    console.error('Erro criarAlbumNoturnoDrive:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});