import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * varreduraPastaSalaEspera
 *
 * Varre uma pasta específica do Google Drive e registra cada PDF/XML de NF
 * como DocumentIntake ENVIADO na fila da Sala de Espera.
 *
 * Em seguida, o `processarSalaDeEspera` (automação ou chamada direta) processa
 * a fila: aplica o "early canonical rename" (renomeia para o padrão oficial
 * `NF <num> <desc> - <emissor> - MUSEUS CENTRO - R$ <val>.<ext>` no Drive),
 * extrai metadados via IA/XML, valida e move para a pasta mensal de backup.
 *
 * Idempotente: pula arquivos que já têm DocumentIntake ATIVO com o mesmo
 * file_name_original.
 *
 * Payload:
 *   { folderUrl: string, dryRun?: boolean (default true), limite?: number (default 300) }
 *
 * folderUrl aceita:
 *   - https://drive.google.com/drive/folders/<ID>
 *   - https://drive.google.com/file/d/<ID>/view (folder file id)
 *   - ID cru do Google Drive
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DEADLINE_MS = 55000; // 55s — deixa margem p/ resposta HTTP no limite Deno ~90s

const ACCEPTED_EXT = new Set(['.xml', '.pdf']);

function safeStr(v) { return String(v || '').trim(); }
function getExt(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return m ? '.' + m[1] : '';
}

function extractFolderId(url) {
  if (!url) return null;
  const s = safeStr(url);
  // ID crus de ~28-33 chars (alphanumerico com - e _)
  if (/^[\w-]{20,}$/.test(s)) return s;
  const m = s.match(/\/folders\/([\w-]+)/) ||
    s.match(/[?&]id=([\w-]+)/) ||
    s.match(/\/file\/d\/([\w-]+)/) ||
    s.match(/\/d\/([\w-]+)/);
  return m ? m[1] : null;
}

async function listAllInFolder(token, folderId) {
  const items = [];
  let pt = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function listRecursive(token, folderId, limite, stats) {
  const out = [];
  async function walk(folderIdArg, depth) {
    if (Date.now() - stats.startTime > DEADLINE_MS) return;
    if (out.length >= limite) return;
    const items = await listAllInFolder(token, folderIdArg);
    for (const it of items) {
      if (Date.now() - stats.startTime > DEADLINE_MS) return;
      if (it.mimeType === FOLDER_MIME) {
        if (depth < 6) await walk(it.id, depth + 1);
        continue;
      }
      const ext = getExt(it.name);
      if (!ACCEPTED_EXT.has(ext)) {
        stats.ignorado_extensao++;
        continue;
      }
      out.push(it);
      if (out.length >= limite) return;
    }
  }
  await walk(folderId, 0);
  return out;
}

async function getDriveToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  const token = conn?.accessToken || conn?.access_token;
  if (!token) throw new Error('Token Google Drive indisponível — reconecte o conector.');
  return token;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const folderUrl = safeStr(body.folderUrl);
    const folderId = extractFolderId(folderUrl);
    if (!folderId) {
      return Response.json({ ok: false, error: 'folderUrl inválido. Informe a URL da pasta do Drive ou o ID.' }, { status: 400 });
    }
    const dryRun = body.dryRun !== false; // padrão: segura
    const limite = Math.min(parseInt(body.limite, 10) || 300, 1000);

    const token = await getDriveToken(base44);

    const stats = {
      startTime,
      total_encontrados: 0,
      ignorado_extensao: 0,
      duplicados: 0,
      novos_intakes: 0,
      pdf: 0,
      xml: 0,
      erros: 0,
      detalhes: [],
    };

    const arquivos = await listRecursive(token, folderId, limite, stats);
    stats.total_encontrados = arquivos.length;

    if (arquivos.length === 0) {
      return Response.json({
        ok: true,
        dry_run: dryRun,
        folder_id: folderId,
        arquivos_encontrados: 0,
        novos_intakes: 0,
        message: 'Nenhum arquivo .pdf ou .xml encontrado na pasta.',
        elapsed_ms: Date.now() - startTime,
      });
    }

    // Pré-busca DocumentIntakes já existentes p/ dedup — chave: arquivo_original_url
    // (URL do Drive do arquivo; é estável entre runs, ao contrário de file_name_final
    // que muda após Sala de Espera renomear p/ padrão canônico).
    let existentesMap = new Map();
    try {
      let skip = 0;
      while (skip < 5000) {
        const batch = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 500, skip);
        if (!batch || batch.length === 0) break;
        for (const e of batch) {
          const url = safeStr(e.arquivo_original_url);
          const fname = safeStr(e.file_name_original);
          if (url && url.includes('/file/d/') && !existentesMap.has(url)) existentesMap.set(url, e.id);
          if (fname && !existentesMap.has(fname)) existentesMap.set(fname, e.id);
        }
        if (batch.length < 500) break;
        skip += 500;
      }
    } catch (e) {
      console.warn('Falha ao carregar intakes existentes para dedup:', e.message);
    }

    for (const it of arquivos) {
      if (Date.now() - startTime > DEADLINE_MS) {
        stats.detalhes.push(`⏸ INTERROMPIDO POR DEADLINE — ${arquivos.length - stats.novos_intakes - stats.duplicados} restantes`);
        break;
      }
      const name = it.name;
      const driveUrl = `https://drive.google.com/file/d/${it.id}/view`;

      // Dedup por URL (chave estável) e/ou file_name_original
      if (existentesMap.has(driveUrl) || existentesMap.has(name)) {
        stats.duplicados++;
        continue;
      }

      const ext = getExt(name);
      const ehXML = ext === '.xml';
      const tipo = ehXML ? 'NOTA_FISCAL_XML' : 'NOTA_FISCAL_PDF';

      if (dryRun) {
        stats.novos_intakes++;
        if (ehXML) stats.xml++; else stats.pdf++;
        if (stats.detalhes.length < 30) stats.detalhes.push(`[DRY] ${tipo} → ${name}`);
        continue;
      }

      try {
        await base44.entities.DocumentIntake.create({
          user_email: 'sistema@museus-centro.org.br',
          user_name: 'Sistema',
          tipo_detectado: tipo,
          status_processamento: 'ENVIADO',
          arquivo_original_url: driveUrl,
          file_name_original: name,
          file_name_final: name,
          mime_type: ehXML ? 'application/xml' : 'application/pdf',
          origem: 'varredura_pasta_sala_espera',
          grupo_upload_id: `varredura-${folderId}-${it.id}`.substring(0, 50),
          grupo_status: 'INCOMPLETO',
          nf_xml_url: ehXML ? driveUrl : '',
          nf_pdf_url: !ehXML ? driveUrl : '',
          status_registro: 'ATIVO',
          ocultar_entrada_unica: false,
        });
        stats.novos_intakes++;
        if (ehXML) stats.xml++; else stats.pdf++;
        // registra URL + nome no mapa p/ não duplicar dentro do mesmo lote
        existentesMap.set(driveUrl, it.id);
        existentesMap.set(name, it.id);
      } catch (e) {
        stats.erros++;
        if (stats.detalhes.length < 50) stats.detalhes.push(` ERRO ${name}: ${e.message}`);
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      folder_id: folderId,
      arquivos_encontrados: stats.total_encontrados,
      ignorado_extensao: stats.ignorado_extensao,
      duplicados: stats.duplicados,
      novos_intakes: stats.novos_intakes,
      pdf: stats.pdf,
      xml: stats.xml,
      erros: stats.erros,
      elapsed_ms: Date.now() - startTime,
      detalhes: stats.detalhes.slice(0, 60),
    });
  } catch (error) {
    console.error('[varreduraPastaSalaEspera]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});