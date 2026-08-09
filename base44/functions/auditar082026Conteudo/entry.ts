// auditar082026Conteudo
// AUDITORIA INTEGRAL 08-2026 POR CONTEUDO REAL.
// Root: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp / Pasta: 1jhZBWsOltRSjtdKHPG64PovnxygKLuW- (08-2026)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const FOLDER_08_2026_ID = '1jhZBWsOltRSjtdKHPG64PovnxygKLuW-';
const ROOT_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const COORD_GERAL = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];
const P_K = 'auditoria_conteudo_status';
const P_DATA = 'auditoria_conteudo_data_emissao';
const P_PASTA = 'auditoria_conteudo_pasta_correta';
const P_METODO = 'auditoria_conteudo_metodo';
const P_CAMPO = 'auditoria_conteudo_evidencia_campo';
const P_EVID = 'auditoria_conteudo_evidencia';
const P_CONF = 'auditoria_conteudo_confianca';

function normalizaData(s) {
  if (!s) return null;
  s = String(s).trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})([T ].*)?$/i.exec(s))) {
    return { iso: m[1] + '-' + m[2] + '-' + m[3], day: +m[3], month: +m[2], year: +m[1], raw: s };
  }
  if ((m = /^(\d{2})\/(\d{2})\/(\d{4}|\d{2})(.*)?$/i.exec(s))) {
    let y = m[3]; if (y.length === 2) y = '20' + y;
    return { iso: y + '-' + m[2] + '-' + m[1], day: +m[1], month: +m[2], year: +y, raw: s };
  }
  return null;
}
function chaveMM(d) { if (!d) return null; return (d.month < 10 ? '0' + d.month : '' + d.month) + '-' + d.year; }

async function getToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  return conn?.accessToken || conn?.access_token || conn?.token;
}

async function listarArquivos(token, folderId) {
  const items = []; let pt = null;
  do {
    let url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("'" + folderId + "' in parents and trashed=false") + '&fields=files(id,name,mimeType,parents,modifiedTime,createdTime,appProperties),nextPageToken&pageSize=1000&supportsAllDrives=true';
    if (pt) url += '&pageToken=' + encodeURIComponent(pt);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('listarArquivos ' + r.status);
    const d = await r.json();
    if (Array.isArray(d.files)) items.push.apply(items, d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function listarSubpastas(token, rootId) {
  const map = {};
  const r = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("'" + rootId + "' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'") + '&fields=files(id,name)&pageSize=200&supportsAllDrives=true',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!r.ok) return map;
  const d = await r.json();
  for (const f of d.files || []) map[f.name] = f.id;
  return map;
}

async function criarPasta(token, rootId, nome) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error('criarPasta ' + nome + ': ' + d.error.message);
  return d.id;
}

async function getOrCriarPasta(cache, token, rootId, nome) {
  if (cache[nome]) return cache[nome];
  const id = await criarPasta(token, rootId, nome);
  cache[nome] = id;
  return id;
}

async function baixarBytes(token, fileId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw new Error('baixarBytes ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

async function buscarDuplicata(token, folderId, nome) {
  const q = encodeURIComponent("'" + folderId + "' in parents and trashed=false and name='" + nome.replace(/'/g, "\\'") + "'");
  const r = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name)&supportsAllDrives=true', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.files && d.files.length > 0) ? d.files[0] : null;
}

async function copiarArquivo(token, fileId, nomeDestino, pastaDestinoId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy?supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nomeDestino, parents: [pastaDestinoId] }),
  });
  const d = await r.json();
  return d;
}

async function setAppProps(token, fileId, props) {
  try {
    const r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id&supportsAllDrives=true', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: props }),
    });
    return r.ok;
  } catch (e) { return false; }
}

async function auditarXml(token, arquivo) {
  const bytes = await baixarBytes(token, arquivo.id);
  const xml = new TextDecoder('utf-8').decode(bytes);
  const m = xml.match(/<(dhEmi|dEmi)\b[^>]*>([^<]+)<\/\1>/i);
  if (!m) {
    return {
      metodo_leitura: 'XML_PARSE', status: 'REVISAO_MANUAL_DATA_EMISSAO',
      data_emissao: null, campo_que_comprovou_data: null,
      trecho_evidencia: 'campo dhEmi/dEmi nao encontrado no XML',
      confianca: 0, pasta_correta: null, erro: 'dhEmi_nao_encontrado',
    };
  }
  const dataStr = m[2].trim();
  const data = normalizaData(dataStr);
  if (!data) {
    return {
      metodo_leitura: 'XML_PARSE', status: 'REVISAO_MANUAL_DATA_EMISSAO',
      data_emissao: null, campo_que_comprovou_data: m[1],
      trecho_evidencia: m[0], confianca: 0, pasta_correta: null,
      erro: 'data_nao_parseavel:' + dataStr,
    };
  }
  const pasta = chaveMM(data);
  return {
    metodo_leitura: 'XML_PARSE',
    status: pasta === '08-2026' ? 'CORRETO_08_2026' : 'COPIADO_PARA_PASTA_CORRETA',
    data_emissao: data.iso.split('-').reverse().join('/'),
    data_emissao_iso: data.iso,
    campo_que_comprovou_data: m[1], trecho_evidencia: m[0],
    confianca: 100, pasta_correta: pasta, erro: null,
  };
}

function propsDeResultado(r) {
  return {
    [P_K]: (r.status === 'CORRETO_08_2026' || r.status === 'COPIADO_PARA_PASTA_CORRETA') ? 'OK' : 'REVISAO',
    [P_DATA]: r.data_emissao || '',
    [P_PASTA]: r.pasta_correta || '',
    [P_METODO]: r.metodo_leitura || '',
    [P_CAMPO]: r.campo_que_comprovou_data || '',
    [P_EVID]: (r.trecho_evidencia || '').slice(0, 100),
    [P_CONF]: String(r.confianca || 0),
  };
}

function recuperaDeProps(a) {
  const p = a.appProperties || {};
  return {
    metodo_leitura: p[P_METODO],
    status: p[P_K] === 'OK' ? 'CORRETO_08_2026' : 'REVISAO_MANUAL_DATA_EMISSAO',
    data_emissao: p[P_DATA], campo_que_comprovou_data: p[P_CAMPO],
    trecho_evidencia: p[P_EVID], confianca: +p[P_CONF] || 0, pasta_correta: p[P_PASTA],
    ja_processado: true,
  };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  console.log('[aud08Cont] t0=' + t0);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin' && !COORD_GERAL.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const soXml = body.soXml === true;
    const reprocessar = body.reprocessar === true;
    const copiar = body.copiarArquivos !== false;

    let token;
    try { token = await getToken(base44); } catch (e) {
      return Response.json({ ok: false, error: 'Token Drive: ' + e.message }, { status: 503 });
    }

    const pastaCache = await listarSubpastas(token, ROOT_ID);
    pastaCache['08-2026'] = FOLDER_08_2026_ID;

    const arquivos = await listarArquivos(token, FOLDER_08_2026_ID);
    const xmls = arquivos.filter(f => /\.xml$/i.test(f.name));
    const pdfs = arquivos.filter(f => /\.pdf$/i.test(f.name));
    const outros = arquivos.filter(f => !/\.pdf$/i.test(f.name) && !/\.xml$/i.test(f.name));

    const manifest = [];
    const stats = {
      totalEncontrados: arquivos.length, totalPDF: pdfs.length, totalXML: xmls.length,
      totalOutros: outros.length, totalAgosto: 0, totalForaAgosto: 0, totalCopiados: 0,
      totalDuplicadosDestino: 0, totalRevisaoManual: 0, totalErros: 0,
      vistoriadosEsteRun: 0, subpastas_disponiveis: Object.keys(pastaCache).sort(),
    };

    // ===== XMLs =====
    for (const xml of xmls) {
      let resultado;
      const apre = xml.appProperties || {};
      if (!reprocessar && (apre[P_K] === 'OK' || apre[P_K] === 'REVISAO')) {
        resultado = recuperaDeProps(xml);
      } else {
        try {
          resultado = await auditarXml(token, xml);
          await setAppProps(token, xml.id, propsDeResultado(resultado));
        } catch (e) {
          resultado = { metodo_leitura: 'XML_PARSE', status: 'ERRO_LEITURA', erro: (e && e.message) || String(e), confianca: 0, pasta_correta: null };
          stats.totalErros++;
          await setAppProps(token, xml.id, { [P_K]: 'REVISAO', [P_METODO]: 'XML_PARSE', [P_EVID]: ((e && e.message) || 'erro').slice(0, 100) });
        }
      }
      if (resultado.status === 'REVISAO_MANUAL_DATA_EMISSAO') stats.totalRevisaoManual++;
      if (resultado.pasta_correta === '08-2026') stats.totalAgosto++;
      else if (resultado.pasta_correta) stats.totalForaAgosto++;

      let statusFinal = resultado.status;
      let acao = 'nenhuma';
      if (copiar && resultado.pasta_correta && resultado.pasta_correta !== '08-2026' && resultado.status === 'COPIADO_PARA_PASTA_CORRETA') {
        try {
          const pastaId = await getOrCriarPasta(pastaCache, token, ROOT_ID, resultado.pasta_correta);
          const dup = await buscarDuplicata(token, pastaId, xml.name);
          if (dup) { acao = 'NENHUMA_DUPLICADO_NO_DESTINO'; statusFinal = 'DUPLICADO_NO_DESTINO'; stats.totalDuplicadosDestino++; }
          else {
            const c = await copiarArquivo(token, xml.id, xml.name, pastaId);
            acao = 'COPIADO_PARA_PASTA_CORRETA'; statusFinal = 'COPIADO_PARA_PASTA_CORRETA';
            resultado.copia_id = c.id; stats.totalCopiados++;
          }
        } catch (e) {
          resultado.acao = 'ERRO_PASTA'; statusFinal = 'ERRO_LEITURA'; resultado.erro = 'criar pasta ' + e.message;
          stats.totalErros++;
        }
      }
      manifest.push({
        fileId: xml.id, nome_original: xml.name, extensao: 'xml', pasta_origem: '08-2026',
        tipo_documento: 'XML',
        metodo_leitura: resultado.metodo_leitura, status: resultado.status,
        data_emissao: resultado.data_emissao, campo_que_comprovou_data: resultado.campo_que_comprovou_data,
        trecho_evidencia: resultado.trecho_evidencia, confianca: resultado.confianca,
        pasta_correta: resultado.pasta_correta, erro: resultado.erro || null,
        status_final: statusFinal, acao, arquivo_existia_destino: statusFinal === 'DUPLICADO_NO_DESTINO',
      });
      stats.vistoriadosEsteRun++;
    }

    // ===== PDFs: marca pendente se soXml; caso contrario placeholder =====
    for (const pdf of pdfs) {
      const apre = pdf.appProperties || {};
      if (!reprocessar && apre[P_K] === 'OK') {
        const r = recuperaDeProps(pdf);
        manifest.push({
          fileId: pdf.id, nome_original: pdf.name, extensao: 'pdf', pasta_origem: '08-2026',
          tipo_documento: 'PDF',
          metodo_leitura: r.metodo_leitura, status: r.status, data_emissao: r.data_emissao,
          campo_que_comprovou_data: r.campo_que_comprovou_data, trecho_evidencia: r.trecho_evidencia,
          confianca: r.confianca, pasta_correta: r.pasta_correta, erro: null,
          status_final: r.status, acao: 'nenhuma', arquivo_existia_destino: false,
          ja_processado: true,
        });
        if (r.pasta_correta === '08-2026') stats.totalAgosto++;
        else if (r.pasta_correta) stats.totalForaAgosto++;
        if (r.status === 'REVISAO_MANUAL_DATA_EMISSAO') stats.totalRevisaoManual++;
        stats.vistoriadosEsteRun++;
      } else if (soXml) {
        // pulado neste run; marcado como pendente
        manifest.push({
          fileId: pdf.id, nome_original: pdf.name, extensao: 'pdf', pasta_origem: '08-2026',
          tipo_documento: 'PDF',
          metodo_leitura: 'PENDENTE', status: 'PENDENTE', data_emissao: null,
          campo_que_comprovou_data: null, trecho_evidencia: null, confianca: 0,
          pasta_correta: null, erro: 'skipped_soXml_run', status_final: 'PENDENTE', acao: 'nenhuma',
        });
      }
    }

    // ===== cobertura =====
    const arquivos2 = await listarArquivos(token, FOLDER_08_2026_ID);
    const totalVistoriados = arquivos2.filter(a => {
      const s = (a.appProperties || {})[P_K];
      return s === 'OK' || (s === 'REVISAO' && s !== 'PENDENTE');
    }).length;
    const pendentesGeral = arquivos2.filter(a => {
      const s = (a.appProperties || {})[P_K];
      return !s || s === 'PENDENTE';
    }).length;
    const statusFinal = (totalVistoriados === stats.totalEncontrados && pendentesGeral === 0) ? 'AUDITORIA_COMPLETA' : 'AUDITORIA_INCOMPLETA';

    const relatorio = {
      ok: true, status: statusFinal,
      folder_id: FOLDER_08_2026_ID, root_id: ROOT_ID,
      totalEncontrados: stats.totalEncontrados, totalVistoriados,
      totalPDF: stats.totalPDF, totalXML: stats.totalXML, totalOutros: stats.totalOutros,
      totalAgosto: stats.totalAgosto, totalForaAgosto: stats.totalForaAgosto,
      totalCopiados: stats.totalCopiados, totalDuplicadosDestino: stats.totalDuplicadosDestino,
      totalRevisaoManual: stats.totalRevisaoManual, totalErros: stats.totalErros,
      pendentesVision: pendentesGeral, vistoriadosEsteRun: stats.vistoriadosEsteRun,
      subpastas_disponiveis: stats.subpastas_disponiveis, manifest, elapsed_ms: Date.now() - t0,
    };

    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        entity_type: 'AUDITORIA_08_2026_CONTEUDO',
        status: 'concluido',
        details: JSON.stringify(relatorio).slice(0, 30000),
        total_files: stats.totalEncontrados,
        files_copied: stats.totalCopiados,
        triggered_by: 'manual',
        processed_at: new Date().toISOString(),
        execution_time_ms: Date.now() - t0,
      });
    } catch (e) { console.warn('[aud08Cont] BackupLog:', e && e.message); }

    return Response.json(relatorio);
  } catch (error) {
    console.error('[aud08Cont] erro:', error && error.message);
    return Response.json({ ok: false, error: (error && error.message) || 'Erro interno' }, { status: 500 });
  }
});