// auditarXmls082026Deterministico
//
// Auditoria DETERMINISTICA de XMLs fiscais na pasta mensal 08-2026 do Google Drive.
// FONTE DA VERDADE: data de emissao extraida do XML (dhEmi > dEmi > dhSaida > dSaida).
// NAO usa IA, nao confia em nome de arquivo nem em data de upload/modificacao.
//
// Para cada XML na pasta origem:
//   1. Download e parse case-insensitive.
//   2. Extrai dhEmi/dEmi -> calcula MM-AAAA destino.
//   3. Se mes == 08-2026 -> CORRECT_ALREADY (mantem).
//   4. Se mes != 08-2026 -> MOVE para pasta mensal correta (addParents/removeParents).
//   5. Verifica duplicata no destino por chave fiscal (chNFe ou nNF+CNPJ+valor+emissao).
//   6. Idempotencia por appProperties e checagem de parents atual.
//   7. Opcional: tenta mover PDF par quando match inequivoco (valor+chave fiscal real).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ROOT_NOTAS_FISCAIS_ID = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const ORIGEM_PADRAO_08 = '1zLdKkd0CSyCGjZgjchmRooJl6MgdVvi7';
const MES_ANO_ESPERADO = '08-2026'; // Formato MM-AAAA (igual ao nome das pastas no Drive)
const PROPS_KEY = 'auditoria_xml_emissao';

function pad2(n) { return String(n).padStart(2, '0'); }

function parseDataEmissao(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}[Tt]/.test(s)) d = new Date(s);
  else if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.substring(0, 10) + 'T12:00:00Z');
  else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (m) {
      const hh = m[4] ? Number(m[4]) : 12;
      const mi = m[5] ? Number(m[5]) : 0;
      const ss = m[6] ? Number(m[6]) : 0;
      d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hh, mi, ss));
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  return { ano: d.getUTCFullYear(), mes: pad2(d.getUTCMonth() + 1), dataIso: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` };
}

function unescapeXml(s) {
  if (!s) return s;
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function extractTag(xml, tags) {
  for (const tag of tags) {
    const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([^<]+)</' + tag + '>', 'i');
    const m = xml.match(re);
    if (m && m[1] && m[1].trim()) return unescapeXml(m[1].trim());
  }
  return null;
}

function normalizeDigits(v) {
  if (!v) return null;
  const d = String(v).replace(/\D/g, '');
  return d || null;
}

function parseValorBR(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseXmlFiscal(xml) {
  const dhRaw = extractTag(xml, ['dhEmi', 'dEmi', 'dhSaida', 'dSaida', 'dhCont']);
  const info = parseDataEmissao(dhRaw);
  const num = extractTag(xml, ['nNF', 'nNFe', 'nNFS', 'nNFS-e', 'nNfse', 'NNFS', 'NumeroNfse', 'Numero', 'numeroNfse', 'nRPS', 'numero']);
  let chave = extractTag(xml, ['chNFe', 'chaveAcesso', 'chave', 'CodVerificacao', 'codigoVerificacao']);
  if (chave) {
    const digits = String(chave).replace(/\D/g, '');
    if (digits.length === 44) chave = digits;
  }
  const cnpj = normalizeDigits(extractTag(xml, ['CNPJ', 'Cnpj', 'cnpj']));
  const cpf = normalizeDigits(extractTag(xml, ['CPF', 'Cpf', 'cpf']));
  const xNome = extractTag(xml, ['xNome', 'XNome', 'RazaoSocial', 'razaoSocial', 'razao_social']);
  const vRaw = extractTag(xml, ['vNF', 'vServ', 'vLCP', 'vTPrest', 'ValorServicos', 'valorServico', 'vTotNF', 'vLiq']);
  const valor = parseValorBR(vRaw);
  let origem = null;
  if (info) {
    if (/<dhEmi/i.test(xml)) origem = 'dhEmi';
    else if (/<dEmi/i.test(xml)) origem = 'dEmi';
    else if (/<dhSaida/i.test(xml)) origem = 'dhSaida';
    else if (/<dSaida/i.test(xml)) origem = 'dSaida';
    else origem = 'outro';
  }
  return { numero_nf: num, chave, cnpj_emit: cnpj, cpf_emit: cpf, emitente: xNome, valor, data_info: info, origem };
}

function fiscalKey(x) {
  if (x.chave) return 'chave:' + x.chave;
  return ['nf', x.numero_nf || '', x.cnpj_emit || x.cpf_emit || '', x.valor != null ? x.valor.toFixed(2) : '', x.data_info ? x.data_info.dataIso : ''].join('|');
}

async function getToken(base44) {
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  return conn?.accessToken || conn?.access_token || conn?.token;
}

async function listFiles(token, folderId) {
  const items = [];
  let pt = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,md5Checksum,parents,appProperties),nextPageToken&pageSize=1000&supportsAllDrives=true`;
    if (pt) url += '&pageToken=' + encodeURIComponent(pt);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('listFiles ' + r.status);
    const d = await r.json();
    if (Array.isArray(d.files)) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function listFolders(token, rootId, cache) {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'"+rootId+"' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'")}&fields=files(id,name)&pageSize=200&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (!r.ok) return;
  const d = await r.json();
  for (const f of d.files || []) cache.set(f.name, f.id);
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent("name='" + String(name).replace(/'/g, "\\'") + "' and '" + parentId + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.files && d.files[0] ? d.files[0].id : null;
}

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error('createFolder "' + name + '": ' + d.error.message);
  return d.id;
}

async function getOrCreateFolder(token, name, parentId, cache) {
  if (cache.has(name)) return cache.get(name);
  let id = await findFolder(token, name, parentId);
  if (!id) id = await createFolder(token, name, parentId);
  cache.set(name, id);
  return id;
}

async function downloadText(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(40_000) });
  if (!r.ok) throw new Error('download ' + r.status);
  return await r.text();
}

async function getFile(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents&supportsAllDrives=true`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  return await r.json();
}

async function moveFile(token, fileId, addId, removeId) {
  const params = new URLSearchParams();
  params.set('addParents', addId);
  if (removeId && removeId !== addId) params.set('removeParents', removeId);
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}&supportsAllDrives=true`;
  const r = await fetch(url, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token } });
  return r.ok;
}

async function setAppProps(token, fileId, props) {
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: props }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  console.log('[auditarXmls08] handler iniciado t0=' + t0);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const COORD_GERAL = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];
    if (user && user.role !== 'admin' && !COORD_GERAL.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const sourceFolderId = String(body.folderId || ORIGEM_PADRAO_08).trim();
    const rootFolderId = String(body.rootFolderId || ROOT_NOTAS_FISCAIS_ID).trim();
    const expectedMesAno = String(body.expectedMesAno || MES_ANO_ESPERADO).trim();

    let token;
    try { token = await getToken(base44); } catch (e) {
      return Response.json({ ok: false, error: 'Token Drive: ' + e.message }, { status: 503 });
    }

    const folderCache = new Map();
    await listFolders(token, rootFolderId, folderCache);

    // Cache por pasta destino: key fiscal -> drive_id (evita re-download de XMLs destino)
    const destKeyCache = new Map();

    const allFiles = await listFiles(token, sourceFolderId);
    const xmls = allFiles.filter(f => /\.xml$/i.test(f.name) && f.mimeType !== 'application/vnd.google-apps.folder');
    const pdfs = allFiles.filter(f => /\.pdf$/i.test(f.name) && f.mimeType !== 'application/vnd.google-apps.folder');

    const results = [];
    let auditados = 0, corretos = 0, movidos = 0, duplicados = 0, erros = 0;
    const porMes = {};

    for (const xml of xmls) {
      auditados++;
      const driveId = xml.id;
      const nomeAnterior = xml.name;
      const parentAnterior = (xml.parents && xml.parents[0]) || sourceFolderId;

      let content;
      try { content = await downloadText(token, driveId); }
      catch (e) {
        results.push({ arquivo: nomeAnterior, status: 'ERROR', tipo: 'XML', motivo: 'Download falhou: ' + e.message });
        erros++;
        continue;
      }

      const fx = parseXmlFiscal(content);

      if (!fx.data_info) {
        results.push({
          arquivo: nomeAnterior, status: 'REVIEW_REQUIRED', tipo: 'XML',
          numero_nf: fx.numero_nf, chave_acesso: fx.chave, cnpj_cpf: fx.cnpj_emit || fx.cpf_emit,
          emitente: fx.emitente, valor: fx.valor, origem_data: null,
          motivo: 'Data de emissao nao encontrada no XML (dhEmi/dEmi)',
          drive_file_id: driveId, parent_anterior: parentAnterior,
        });
        erros++;
        continue;
      }

      const mesDetectado = `${fx.data_info.mes}-${fx.data_info.ano}`;

      if (mesDetectado === expectedMesAno) {
        results.push({
          arquivo: nomeAnterior, status: 'CORRECT_ALREADY', tipo: 'XML',
          numero_nf: fx.numero_nf, chave_acesso: fx.chave, cnpj_cpf: fx.cnpj_emit || fx.cpf_emit,
          emitente: fx.emitente, valor: fx.valor, data_emissao_iso: fx.data_info.dataIso,
          mes_detectado: mesDetectado, origem_data: fx.origem,
          motivo: 'emissao coincide com mes esperado',
          drive_file_id: driveId, parent_anterior: parentAnterior, parent_posterior: parentAnterior,
        });
        corretos++;
        if (!dryRun) await setAppProps(token, driveId, { [PROPS_KEY]: 'ok:' + mesDetectado });
        continue;
      }

      let targetId;
      try { targetId = await getOrCreateFolder(token, mesDetectado, rootFolderId, folderCache); }
      catch (e) {
        results.push({ arquivo: nomeAnterior, status: 'ERROR', tipo: 'XML', motivo: 'Pasta destino falhou: ' + e.message, drive_file_id: driveId });
        erros++;
        continue;
      }

      // Duplicata por md5Checksum (byte-identico) + chave fiscal (apenas se md5 indisponivel)
      let dupId = null;
      const myKey = fiscalKey(fx);
      const myMd5 = xml.md5Checksum || null;
      try {
        if (!destKeyCache.has(targetId)) {
          const md5ToId = new Map();
          const keyToId = new Map();
          const destFilhos = await listFiles(token, targetId);
          const destXmls = destFilhos.filter(f => /\.xml$/i.test(f.name));
          for (const dx of destXmls) {
            if (dx.md5Checksum) md5ToId.set(dx.md5Checksum, dx.id);
            // So parse key se md5 ausente (rarissimo)
            if (!dx.md5Checksum) {
              let dxc;
              try { dxc = await downloadText(token, dx.id); } catch { continue; }
              const dxf = parseXmlFiscal(dxc);
              keyToId.set(fiscalKey(dxf), dx.id);
            }
          }
          destKeyCache.set(targetId, { md5: md5ToId, key: keyToId });
        }
        const cache = destKeyCache.get(targetId);
        if (myMd5 && cache.md5.has(myMd5)) dupId = cache.md5.get(myMd5);
        else dupId = cache.key.get(myKey) || null;
      } catch (e) {
        results.push({ arquivo: nomeAnterior, status: 'ERROR', tipo: 'XML', motivo: 'Duplicidade check falhou: ' + e.message, drive_file_id: driveId });
        erros++;
        continue;
      }

      if (dupId) {
        results.push({
          arquivo: nomeAnterior, status: 'DUPLICATE_ALREADY_PRESENT', tipo: 'XML',
          numero_nf: fx.numero_nf, chave_acesso: fx.chave, cnpj_cpf: fx.cnpj_emit || fx.cpf_emit,
          emitente: fx.emitente, valor: fx.valor, data_emissao_iso: fx.data_info.dataIso,
          mes_detectado: mesDetectado, origem_data: fx.origem,
          motivo: 'XML identico ja existe em ' + mesDetectado,
          drive_file_id: driveId, duplicate_id: dupId,
        });
        duplicados++;
        if (!dryRun) await setAppProps(token, driveId, { [PROPS_KEY]: 'dupl:' + dupId });
        continue;
      }

      const currentParents = xml.parents || [parentAnterior];
      if (currentParents.includes(targetId)) {
        results.push({
          arquivo: nomeAnterior, status: 'CORRECT_ALREADY', tipo: 'XML',
          numero_nf: fx.numero_nf, chave_acesso: fx.chave, cnpj_cpf: fx.cnpj_emit || fx.cpf_emit,
          emitente: fx.emitente, valor: fx.valor, data_emissao_iso: fx.data_info.dataIso,
          mes_detectado: mesDetectado, origem_data: fx.origem,
          motivo: 'ALREADY_IN_CORRECT_FOLDER', drive_file_id: driveId,
        });
        corretos++;
        continue;
      }

      if (!dryRun) {
        const moveOk = await moveFile(token, driveId, targetId, parentAnterior);
        if (!moveOk) {
          results.push({ arquivo: nomeAnterior, status: 'ERROR', tipo: 'XML', motivo: 'MOVE falhou', drive_file_id: driveId });
          erros++;
          continue;
        }
        await setAppProps(token, driveId, { [PROPS_KEY]: 'ok:' + mesDetectado });
        // Atualiza cache destino para evitar duplicata em iteracoes seguintes
        if (myMd5) destKeyCache.get(targetId).md5.set(myMd5, driveId);
        else destKeyCache.get(targetId).key.set(myKey, driveId);
      }

      results.push({
        arquivo: nomeAnterior, status: 'MOVED', tipo: 'XML',
        numero_nf: fx.numero_nf, chave_acesso: fx.chave, cnpj_cpf: fx.cnpj_emit || fx.cpf_emit,
        emitente: fx.emitente, valor: fx.valor, data_emissao_iso: fx.data_info.dataIso,
        mes_detectado: mesDetectado, origem_data: fx.origem,
        motivo: dryRun ? 'dry-run: seria movido para ' + mesDetectado : 'movido para ' + mesDetectado,
        drive_file_id: driveId, parent_anterior: parentAnterior, parent_posterior: dryRun ? null : targetId,
      });
      movidos++;
      porMes[mesDetectado] = (porMes[mesDetectado] || 0) + 1;
    }

    let pdfParOk = 0, pdfParDuv = 0;
    for (const r of results.filter(x => x.status === 'MOVED' && x.tipo === 'XML')) {
      const valor = r.valor;
      const chave = r.chave_acesso;
      const numero = r.numero_nf;
      if (valor == null) {
        results.push({ arquivo: '', status: 'PDF_PAIR_NOT_CONFIRMED', tipo: 'PDF', motivo: 'sem valor no XML', drive_file_id: '' });
        pdfParDuv++;
        continue;
      }
      const valorFmt = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const candidatos = pdfs.filter(p => {
        if (!p.name.includes(valorFmt)) return false;
        if (chave && p.name.includes(String(chave).substring(0, 20))) return true;
        if (numero) {
          const numStr = String(numero);
          return p.name.includes('NF ' + numStr) || p.name.includes('NF-' + numStr) || p.name.includes('NF-0' + numStr) || p.name.includes('XML ' + numStr);
        }
        return false;
      });
      if (candidatos.length !== 1) {
        results.push({
          arquivo: '', status: 'PDF_PAIR_NOT_CONFIRMED', tipo: 'PDF',
          numero_nf: numero, chave_acesso: chave, valor,
          motivo: 'candidatos=' + candidatos.length + ' (match inequivoco necessario)',
          drive_file_id: '', drive_xml_relacionado: r.drive_file_id,
        });
        pdfParDuv++;
        continue;
      }
      const pdf = candidatos[0];
      if (!dryRun) {
        try {
          const pcur = await getFile(token, pdf.id);
          const pparents = (pcur && pcur.parents) || [];
          if (r.parent_posterior && !pparents.includes(r.parent_posterior)) {
            await moveFile(token, pdf.id, r.parent_posterior, pparents[0] || '');
          }
        } catch (e) {
          results.push({ arquivo: pdf.name, status: 'PDF_PAIR_NOT_CONFIRMED', tipo: 'PDF', motivo: 'falhou mover PDF: ' + e.message, drive_file_id: pdf.id });
          pdfParDuv++;
          continue;
        }
      }
      results.push({
        arquivo: pdf.name, status: 'MOVED', tipo: 'PDF',
        numero_nf: numero, chave_acesso: chave, valor,
        mes_detectado: r.mes_detectado,
        motivo: dryRun ? 'dry-run: PDF par moveria' : 'PDF par movido junto',
        drive_file_id: pdf.id, drive_xml_relacionado: r.drive_file_id,
      });
      pdfParOk++;
    }

    try {
      if (!dryRun) {
        await base44.asServiceRole.entities.BackupLog.create({
          backup_type: 'auditoria_entrada_unica',
          entity_type: 'AUDITORIA_XML_08_2026_DETERMINISTICO',
          status: 'concluido',
          total_files: auditados,
          files_copied: movidos,
          details: `XMLs auditados=${auditados} corretos=${corretos} movidos=${movidos} duplicados=${duplicados} erros=${erros} pdf_conf=${pdfParOk} pdf_duv=${pdfParDuv}`,
          triggered_by: 'manual',
          processed_at: new Date().toISOString(),
          execution_time_ms: Date.now() - t0,
        });
      }
    } catch (e) { console.warn('[auditarXmls08] BackupLog:', e.message); }

    const resumo = Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0])).map(([m, n]) => ({ mes_destino: m, quantidade: n }));

    return Response.json({
      ok: true,
      dry_run: dryRun,
      source_folder_id: sourceFolderId,
      folder_origem: '08-2026',
      expected_mes_ano: expectedMesAno,
      stats: {
        xmls_analisados: auditados,
        corretos_em_agosto: corretos,
        movidos_para_outros_meses: movidos,
        duplicados_encontrados: duplicados,
        erros,
        pdf_par_confirmado: pdfParOk,
        pdf_par_nao_confirmado: pdfParDuv,
        movidos_por_mes_destino: resumo,
        pdfs_na_pasta_origem: pdfs.length,
      },
      detalhes: results,
      elapsed_ms: Date.now() - t0,
    });
  } catch (error) {
    console.error('[auditarXmls08] erro:', error && error.message);
    return Response.json({ ok: false, error: (error && error.message) || 'Erro interno' }, { status: 500 });
  }
});