import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// IDs Base64 do Drive têm 33 chars (folders) ou 28-44 chars (files).
// Um fragmento truncado é uma URL do Drive cujo ID não é 100% base64url (A-Za-z0-9_-) ou é muito curto < 28 chars.
function extrairFragmentosDriveUrl(url) {
  if (!url || typeof url !== 'string') return null;

  // Regex para extrair o ID do Drive, seja pasta ou arquivo
  const matchFolder = url.match(/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_\-]+)/);
  const matchFile = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_\-]+)/);
  const matchSheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_\-]+)/);

  let fragmentoId = null;
  let tipo = null;

  if (matchFolder) { fragmentoId = matchFolder[1]; tipo = 'folder'; }
  else if (matchFile) { fragmentoId = matchFile[1]; tipo = 'file'; }
  else if (matchSheet) { fragmentoId = matchSheet[1]; tipo = 'spreadsheet'; }

  if (!fragmentoId) return null;

  // IDs válidos completos do Drive são A-Za-z0-9_- e têm entre 28 e 44 chars
  const BASE64URL = /^[A-Za-z0-9_\-]+$/;
  const comprimentoMinimo = 28;
  const isTruncado = !BASE64URL.test(fragmentoId) || fragmentoId.length < comprimentoMinimo;

  if (!isTruncado) return null; // URL já está completa, não precisa reparar

  // Extrai apenas o prefixo base64url válido do fragmento
  const prefixoMatch = fragmentoId.match(/^([A-Za-z0-9_\-]+)/);
  const prefixo = prefixoMatch ? prefixoMatch[1] : null;
  if (!prefixo || prefixo.length < 2) return null;

  return { prefixo, url_original: url, tipo };
}

// Busca arquivos no Drive cujo ID começa com o prefixo
async function buscarPorPrefixo(accessToken, prefixo) {
  // A Drive API v3 não suporta busca por prefixo de ID diretamente.
  // Estratégia: buscar na base de dados local primeiro (BackupLog, ReportPhoto, etc.)
  // e depois tentar a API do Drive com files.get se o ID for suficientemente longo.
  // Retorna array de { id, name, mimeType, webViewLink }
  
  const resultados = [];

  // Tentativa: files.list filtrando por nome contém parte do prefixo (último recurso)
  // Nota: a Drive API não permite filtrar por ID parcial. A melhor abordagem é
  // tentar files.get com o ID completo se disponível, ou buscar em fontes internas.
  // Aqui usamos files.list com pageSize reduzido e verificamos prefixo no ID retornado.
  // Para ser eficiente, buscamos 1000 itens por vez e filtramos localmente.
  
  // Para minimizar chamadas à API, só buscamos se o prefixo for >= 5 chars
  if (prefixo.length < 5) return resultados;

  try {
    const url = `https://www.googleapis.com/drive/v3/files?pageSize=1000&fields=files(id,name,mimeType,webViewLink)&q=trashed=false`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (data.files) {
      for (const f of data.files) {
        if (f.id && f.id.startsWith(prefixo)) {
          resultados.push({ id: f.id, name: f.name, mimeType: f.mimeType, webViewLink: f.webViewLink });
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao buscar no Drive:', e.message);
  }

  return resultados;
}

// Busca prefixo nas entidades internas do banco
async function buscarNoBanco(base44, prefixo) {
  const resultados = [];
  try {
    const logs = await base44.asServiceRole.entities.BackupLog.filter({}, '-created_date', 500);
    for (const l of logs) {
      if (l.drive_file_id && l.drive_file_id.startsWith(prefixo)) {
        resultados.push({ id: l.drive_file_id, name: l.file_name || l.drive_file_id, source: 'BackupLog' });
      }
      if (l.backup_folder_id && l.backup_folder_id.startsWith(prefixo)) {
        resultados.push({ id: l.backup_folder_id, name: `Pasta - ${l.file_name || l.backup_folder_id}`, source: 'BackupLog' });
      }
    }
  } catch {}
  try {
    const photos = await base44.asServiceRole.entities.ReportPhoto.filter({}, '-created_date', 500);
    for (const p of photos) {
      if (p.drive_file_id && p.drive_file_id.startsWith(prefixo)) {
        resultados.push({ id: p.drive_file_id, name: p.file_name || p.drive_file_id, source: 'ReportPhoto' });
      }
    }
  } catch {}
  try {
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.filter({}, '-created_date', 500);
    for (const p of purchases) {
      if (p.drive_backup_folder_id && p.drive_backup_folder_id.startsWith(prefixo)) {
        resultados.push({ id: p.drive_backup_folder_id, name: `Pasta NF - ${p.descricao_item || p.drive_backup_folder_id}`, source: 'PurchaseRequest' });
      }
    }
  } catch {}
  return resultados;
}

function construirLinkCompleto(id, tipo) {
  if (tipo === 'folder') return `https://drive.google.com/drive/folders/${id}?usp=drive_link`;
  if (tipo === 'spreadsheet') return `https://docs.google.com/spreadsheets/d/${id}`;
  return `https://drive.google.com/file/d/${id}/view?usp=drive_link`;
}

// Substitui uma URL truncada pelo link completo dentro de um array de strings
function substituirUrlNoArray(arr, urlOriginal, novaUrl) {
  return arr.map(item => item === urlOriginal ? novaUrl : item);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { relatorio_id, confirmar_ambiguos } = body;
    if (!relatorio_id) return Response.json({ error: 'relatorio_id obrigatório' }, { status: 400 });

    const relatorio = await base44.asServiceRole.entities.RelatorioExecucaoObjeto.get(relatorio_id);
    if (!relatorio) return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });

    // Modo: confirmar ambiguos — recebe { relatorio_id, confirmar_ambiguos: [{ url_original, id_correto, tipo, campo, meta_idx, doc_idx }] }
    if (confirmar_ambiguos && Array.isArray(confirmar_ambiguos) && confirmar_ambiguos.length > 0) {
      let cronogramaMetas = JSON.parse(JSON.stringify(relatorio.cronograma_metas || []));
      let anexosEvidencias = JSON.parse(JSON.stringify(relatorio.anexos_evidencias || []));
      const corrigidos = [];

      for (const conf of confirmar_ambiguos) {
        const novaUrl = construirLinkCompleto(conf.id_correto, conf.tipo);
        if (conf.campo === 'cronograma_metas' && conf.meta_idx !== undefined && conf.doc_idx !== undefined) {
          const docs = cronogramaMetas[conf.meta_idx]?.documentos_verificacao;
          if (docs && docs[conf.doc_idx] === conf.url_original) {
            cronogramaMetas[conf.meta_idx].documentos_verificacao[conf.doc_idx] = novaUrl;
            corrigidos.push({ url_original: conf.url_original, url_corrigida: novaUrl });
          }
        } else if (conf.campo === 'anexos_evidencias' && conf.meta_idx !== undefined) {
          if (anexosEvidencias[conf.meta_idx]?.foto_url === conf.url_original) {
            anexosEvidencias[conf.meta_idx].foto_url = novaUrl;
            corrigidos.push({ url_original: conf.url_original, url_corrigida: novaUrl });
          }
        }
      }

      await base44.asServiceRole.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        cronograma_metas: cronogramaMetas,
        anexos_evidencias: anexosEvidencias,
      });

      return Response.json({ success: true, corrigidos_confirmados: corrigidos });
    }

    // Modo principal: varredura e auto-correção
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const cronogramaMetas = JSON.parse(JSON.stringify(relatorio.cronograma_metas || []));
    const anexosEvidencias = JSON.parse(JSON.stringify(relatorio.anexos_evidencias || []));

    const corrigidos = [];
    const ambiguos = [];
    const naoEncontrados = [];

    // Cache de buscas para evitar duplicação
    const cacheResultados = {};

    async function resolverFragmento(url_original, tipo, campo, meta_idx, doc_idx) {
      const info = extrairFragmentosDriveUrl(url_original);
      if (!info) return; // URL não é Drive ou já está completa

      const { prefixo, tipo: tipoRecurso } = info;
      const cacheKey = prefixo;

      let matches;
      if (cacheResultados[cacheKey] !== undefined) {
        matches = cacheResultados[cacheKey];
      } else {
        // Busca no banco primeiro (mais rápido)
        const bancoDB = await buscarNoBanco(base44, prefixo);
        if (bancoDB.length > 0) {
          matches = bancoDB;
        } else {
          // Busca no Drive
          matches = await buscarPorPrefixo(accessToken, prefixo);
        }
        cacheResultados[cacheKey] = matches;
      }

      const base = { url_original, prefixo, tipo: tipoRecurso, campo, meta_idx, doc_idx };

      if (matches.length === 1) {
        const novaUrl = construirLinkCompleto(matches[0].id, tipoRecurso);
        // Atualizar no array em memória
        if (campo === 'cronograma_metas' && meta_idx !== undefined && doc_idx !== undefined) {
          cronogramaMetas[meta_idx].documentos_verificacao[doc_idx] = novaUrl;
        } else if (campo === 'anexos_evidencias' && meta_idx !== undefined) {
          anexosEvidencias[meta_idx].foto_url = novaUrl;
        }
        corrigidos.push({ ...base, url_corrigida: novaUrl, arquivo: matches[0].name });
      } else if (matches.length > 1) {
        ambiguos.push({ ...base, opcoes: matches.map(m => ({ id: m.id, name: m.name || m.source, webViewLink: construirLinkCompleto(m.id, tipoRecurso) })) });
      } else {
        naoEncontrados.push({ ...base });
      }
    }

    // Varrer cronograma_metas
    for (let mi = 0; mi < cronogramaMetas.length; mi++) {
      const meta = cronogramaMetas[mi];
      const docs = meta.documentos_verificacao;
      if (Array.isArray(docs)) {
        for (let di = 0; di < docs.length; di++) {
          await resolverFragmento(docs[di], 'cronograma_metas', 'cronograma_metas', mi, di);
        }
      }
    }

    // Varrer anexos_evidencias
    for (let ai = 0; ai < anexosEvidencias.length; ai++) {
      const anexo = anexosEvidencias[ai];
      if (anexo.foto_url) {
        await resolverFragmento(anexo.foto_url, 'anexos_evidencias', 'anexos_evidencias', ai, undefined);
      }
    }

    // Salvar apenas os auto-corrigidos no banco
    if (corrigidos.length > 0) {
      await base44.asServiceRole.entities.RelatorioExecucaoObjeto.update(relatorio_id, {
        cronograma_metas: cronogramaMetas,
        anexos_evidencias: anexosEvidencias,
      });
    }

    return Response.json({
      success: true,
      corrigidos,
      ambiguos,
      nao_encontrados: naoEncontrados,
      total_varridos: corrigidos.length + ambiguos.length + naoEncontrados.length,
    });

  } catch (error) {
    console.error('[repararLinksTruncados]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});