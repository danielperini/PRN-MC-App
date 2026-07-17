import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Configuração ─────────────────────────────────────────────────────────────
// ID da pasta raiz no Google Drive que contém as sub-pastas de fotos de atividades.
// A função varre recursivamente todas as sub-pastas.
const FOTOS_PASTA_RAIZ = '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif', 'image/bmp', 'image/tiff'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.avif', '.bmp', '.tiff'];

// Mapeamento de palavras-chave no nome da pasta para museu canônico
const MUSEU_KEYWORDS: [string[], string][] = [
  [['mhab', 'historico', 'abilio', 'barreto'], 'MHAB'],
  [['mis', 'imagem', 'som'], 'MIS'],
  [['mumo', 'moda'], 'MUMO'],
  [['kubitschek', 'casak', 'casa k'], 'Casa Kubitschek'],
  [['baile', 'casab'], 'Casa do Baile'],
  [['map', 'pampulha'], 'MAP'],
  [['noturno'], 'Noturno nos Museus'],
];

const MES_MAP: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isImage(name = '', mime = '') {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return IMAGE_MIMES.includes(mime) || IMAGE_EXTS.includes(ext);
}

function normalize(s = '') {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Detecta museu a partir do nome da pasta */
function detectMuseu(folderName: string): string | null {
  const n = normalize(folderName);
  for (const [keywords, museu] of MUSEU_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) return museu;
  }
  return null;
}

/** Detecta mês/ano a partir do nome da pasta. Retorna { mes, ano, mesRef } */
function detectPeriodo(folderName: string): { mes: string | null; ano: number | null; mesRef: string | null } {
  const n = normalize(folderName);

  // Formato YYYY-MM ou YYYY_MM
  const numMatch = folderName.match(/(\d{4})[-_](\d{2})/);
  if (numMatch) {
    const ano = parseInt(numMatch[1]);
    const mes = numMatch[2];
    return { mes, ano, mesRef: `${numMatch[1]}-${mes}` };
  }

  // Formato "Maio 2026" ou "2026 Maio"
  const anoMatch = folderName.match(/\b(20\d{2})\b/);
  const ano = anoMatch ? parseInt(anoMatch[1]) : null;

  for (const [key, num] of Object.entries(MES_MAP)) {
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(n)) {
      const mesRef = ano ? `${ano}-${num}` : null;
      return { mes: num, ano, mesRef };
    }
  }

  return { mes: null, ano, mesRef: null };
}

/** Pontuação de correspondência entre título da atividade e nome da pasta */
function scoreMatch(activityTitle = '', folderName = '') {
  const words = normalize(activityTitle).split(/\s+/).filter(w => w.length > 3);
  const folderNorm = normalize(folderName);
  return words.filter(w => folderNorm.includes(w)).length;
}

/** Mês por extenso em pt-BR a partir do número "01"-"12" */
function mesNumParaExtenso(mes: string): string {
  const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return nomes[parseInt(mes) - 1] || mes;
}

// ─── API Google Drive ─────────────────────────────────────────────────────────
async function driveList(
  accessToken: string,
  q: string,
  pageToken: string | null = null
): Promise<{ files: any[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    q,
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,description)',
    pageSize: '200',
    orderBy: 'name',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function listFolderContents(accessToken: string, folderId: string): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | null = null;
  do {
    const data = await driveList(accessToken, `'${folderId}' in parents and trashed = false`, pageToken);
    items.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return items;
}

/** Varre recursivamente até depth níveis, coletando { pasta, imagens[] } */
async function varrerPastas(
  accessToken: string,
  folderId: string,
  depth = 0,
  maxDepth = 3
): Promise<Array<{ pasta: any; imagens: any[] }>> {
  if (depth > maxDepth) return [];
  const contents = await listFolderContents(accessToken, folderId);
  const subpastas = contents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const imagensRaiz = contents.filter(f => isImage(f.name, f.mimeType));

  const resultado: Array<{ pasta: any; imagens: any[] }> = [];

  // Imagens avulsas na pasta raiz do nível atual
  if (imagensRaiz.length > 0) {
    resultado.push({ pasta: { id: folderId, name: '' }, imagens: imagensRaiz });
  }

  // Para cada sub-pasta: coleta imagens diretas + desce recursivamente
  for (const pasta of subpastas) {
    const conteudoPasta = await listFolderContents(accessToken, pasta.id);
    const imagens = conteudoPasta.filter(f => isImage(f.name, f.mimeType));
    const subsubs = conteudoPasta.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

    if (imagens.length > 0) {
      resultado.push({ pasta, imagens });
    }

    // Descer mais um nível para sub-sub-pastas
    for (const sub of subsubs) {
      const subResult = await varrerPastas(accessToken, sub.id, depth + 2, maxDepth);
      resultado.push(...subResult);
    }
  }

  return resultado;
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // 1. Varrer pastas do Drive
    const pastasFotos = await varrerPastas(accessToken, FOTOS_PASTA_RAIZ);

    // 2. Carregar atividades e relatórios
    const [atividades, relatorios] = await Promise.all([
      base44.asServiceRole.entities.Activity.list('-created_date', 3000),
      base44.asServiceRole.entities.Report.list('-created_date', 800),
    ]);

    // Índice: museu → lista de relatórios ordenados por data
    const reportsPorMuseu: Record<string, any[]> = {};
    for (const r of relatorios) {
      const key = (r.museu || '').trim();
      if (!reportsPorMuseu[key]) reportsPorMuseu[key] = [];
      reportsPorMuseu[key].push(r);
    }

    // Índice: museu+mes → relatório
    const reportPorMuseuMes: Record<string, any> = {};
    for (const r of relatorios) {
      if (r.museu && r.mes_referencia) {
        const mes = String(r.mes_referencia).trim();
        const key = `${r.museu}|${mes}`;
        if (!reportPorMuseuMes[key]) reportPorMuseuMes[key] = r;
      }
    }

    // 3. Coletar todos os resultados de fotos a importar
    const resultados: any[] = [];

    for (const { pasta, imagens } of pastasFotos) {
      const museuDetectado = pasta.name ? detectMuseu(pasta.name) : null;
      const periodo = pasta.name ? detectPeriodo(pasta.name) : { mes: null, ano: null, mesRef: null };

      // Tentar vincular a uma atividade pelo nome da pasta
      let melhorAtividade: any = null;
      let melhorScore = 0;
      if (pasta.name) {
        for (const atv of atividades) {
          const s = scoreMatch(atv.titulo || '', pasta.name);
          if (s > melhorScore) { melhorScore = s; melhorAtividade = atv; }
        }
      }
      const atvVinculada = melhorScore >= 2 ? melhorAtividade : null;

      // Encontrar o relatório: primeiro pela atividade, depois pelo museu+mês, depois pelo museu mais recente
      let reportVinculado: any = null;
      if (atvVinculada?.report_id) {
        reportVinculado = relatorios.find(r => r.id === atvVinculada.report_id) || null;
      }
      if (!reportVinculado && museuDetectado && periodo.mesRef) {
        // Tentar por museu + mês (ex: "Maio" → "05" → busca por mes_referencia contendo isso)
        const mesExtenso = periodo.mes ? mesNumParaExtenso(periodo.mes) : null;
        // Procurar match flexível
        reportVinculado = relatorios.find(r => {
          if (!r.museu || !r.mes_referencia) return false;
          const museuOk = normalize(r.museu).includes(normalize(museuDetectado));
          const mesStr = String(r.mes_referencia);
          const mesOk = mesStr === periodo.mesRef ||
            (periodo.mes && mesStr.includes(periodo.mes)) ||
            (mesExtenso && normalize(mesStr).includes(normalize(mesExtenso)));
          return museuOk && mesOk;
        }) || null;
      }
      if (!reportVinculado && museuDetectado) {
        // Fallback: relatório mais recente do museu
        const lista = reportsPorMuseu[museuDetectado] || [];
        reportVinculado = lista[0] || null;
      }

      const museuFinal = reportVinculado?.museu || museuDetectado || null;
      const mesFinal = reportVinculado?.mes_referencia || periodo.mesRef || null;
      const autorFinal = reportVinculado?.author_name || null;
      const tituloAtv = atvVinculada?.titulo || pasta.name || 'Foto de Registro';

      for (const foto of imagens) {
        resultados.push({
          drive_file_id: foto.id,
          drive_nome_original: foto.name,
          pasta_nome: pasta.name || '',
          pasta_id: pasta.id,
          drive_url: foto.webViewLink || `https://drive.google.com/file/d/${foto.id}/view`,
          file_url: `https://drive.google.com/thumbnail?id=${foto.id}&sz=w1600`,
          mime: foto.mimeType || 'image/jpeg',
          atividade_id: atvVinculada?.id || null,
          report_id: reportVinculado?.id || null,
          museu: museuFinal,
          mes_referencia: mesFinal,
          autor: autorFinal,
          legenda: foto.description || (autorFinal
            ? `Foto de Registro — ${tituloAtv} · ${autorFinal}`
            : `Foto de Registro — ${tituloAtv}`),
          score: melhorScore,
        });
      }
    }

    // 4. Filtrar apenas novas (não importadas ainda)
    const todosIds = resultados.map(f => f.drive_file_id).filter(Boolean);
    const existentes = todosIds.length > 0
      ? await base44.asServiceRole.entities.ReportPhoto.filter({ drive_file_id: { $in: todosIds } })
      : [];
    const existenteIds = new Set(existentes.map((e: any) => e.drive_file_id));
    const novas = resultados.filter(f => !existenteIds.has(f.drive_file_id));

    // 5. Importar em lotes de 20 para evitar timeout
    const LOTE = 20;
    let criadas = 0;
    const falhas: any[] = [];

    // Cache de atividades já atualizadas nesta execução para evitar reads desnecessários
    const atividadeCache: Record<string, any> = {};

    for (let i = 0; i < novas.length; i += LOTE) {
      const lote = novas.slice(i, i + LOTE);
      for (const foto of lote) {
        try {
          // Criar Attachment
          const att = await base44.asServiceRole.entities.Attachment.create({
            report_id: foto.report_id || 'drive-import',
            activity_id: foto.atividade_id || undefined,
            file_name: foto.drive_nome_original,
            file_type: foto.mime,
            file_url: foto.file_url,
            description: foto.legenda,
            drive_file_id: foto.drive_file_id,
            drive_folder_id: foto.pasta_id,
            backup_done: true,
          });

          // Criar ReportPhoto
          await base44.asServiceRole.entities.ReportPhoto.create({
            report_id: foto.report_id || undefined,
            activity_id: foto.atividade_id || undefined,
            attachment_id: att.id,
            file_url: foto.file_url,
            file_name: foto.drive_nome_original,
            caption: foto.legenda,
            legenda: foto.legenda,
            author: foto.autor || 'Registro Fotográfico',
            museu: foto.museu || undefined,
            mes_referencia: foto.mes_referencia || undefined,
            drive_file_id: foto.drive_file_id,
            drive_backup_status: 'concluido',
            fonte_ia: 'drive_sync',
          });

          // Vincular à atividade (com cache)
          if (foto.atividade_id) {
            let atv = atividadeCache[foto.atividade_id];
            if (!atv) {
              atv = await base44.asServiceRole.entities.Activity.get(foto.atividade_id).catch(() => null);
              if (atv) atividadeCache[foto.atividade_id] = atv;
            }
            if (atv) {
              const fotosAtuais = Array.isArray(atv.fotos) ? atv.fotos : [];
              const jaVinculada = fotosAtuais.some((f: any) => f.attachment_id === att.id);
              if (!jaVinculada) {
                const novasFotos = [...fotosAtuais, {
                  attachment_id: att.id,
                  file_url: foto.file_url,
                  legenda: foto.legenda,
                  autor: foto.autor || 'Registro Fotográfico',
                  ordem: fotosAtuais.length,
                }];
                await base44.asServiceRole.entities.Activity.update(foto.atividade_id, { fotos: novasFotos });
                // Atualizar cache
                atividadeCache[foto.atividade_id] = { ...atv, fotos: novasFotos };
              }
            }
          }

          criadas++;
        } catch (e: any) {
          falhas.push({ arquivo: foto.drive_nome_original, erro: e.message });
        }
      }
    }

    return Response.json({
      success: true,
      total_pastas_varridas: pastasFotos.length,
      total_fotos_drive: resultados.length,
      ja_existiam: existenteIds.size,
      criadas,
      falhas_count: falhas.length,
      falhas: falhas.slice(0, 15),
    });
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});