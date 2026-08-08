// corrigirPastaMesErrado
//
// Corrige uma pasta "mês errado" do Drive que recebeu NFs de outros meses:
//   1. Lista todos os PDFs/XMLs da pasta informada (folderId ou folderUrl).
//   2. Para cada arquivo: determina data de emissão real via (a) match DocumentIntake,
//      (b) parse do XML, ou (c) padrão de data no nome do arquivo.
//   3. Renomeia para o padrão canônico (NF/XML <num> <desc> - <emissor> - MUSEUS CENTRO - R$ <val>.<ext>).
//   4. Move para a pasta mensal correta (MM-AAAA) sob a raiz de Notas Fiscais.
//
// Seguro contra trailing dash; default dry_run=true (audita antes de mutar).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ROOT_NOTAS_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const MESES_NOMES = {
  janeiro: 1, fevereiro: 2, marco: 3, marco3: 3, abril: 4, maio: 5,
  junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function safeStr(v) { return String(v || '').trim(); }
function sanitize(v, max = 60) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, max).trim();
}

function parseDataEmissao(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let d = null;
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    d = new Date(s.substring(0, 10) + 'T12:00:00Z');
  } else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  }
  // Portuguese "junho 2026" ou "junho de 2026"
  if (!d) {
    const m = s.toLowerCase().match(/(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+)?(\d{4})/);
    if (m) d = new Date(Number(m[2]), MESES_NOMES[m[1]] - 1, 15, 12);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { ano: d.getFullYear(), mes: String(d.getMonth() + 1).padStart(2, '0') };
}

function extrairDataDoNome(name) {
  if (!name) return null;
  // Pattern MM-AAAA, MM/AAAA, MM_AAAA (com limites)
  let m = String(name).match(/(?:^|[^\d])(\d{2})[-_\/](\d{4})(?:$|[^\d])/);
  if (m) {
    const mes = Number(m[1]);
    const ano = Number(m[2]);
    if (mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2030) {
      return { ano, mes: String(mes).padStart(2, '0') };
    }
  }
  // AAAA-MM-DD
  m = String(name).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return parseDataEmissao(`${m[1]}-${m[2]}-${m[3]}`);
  // Portuguese months
  return parseDataEmissao(name);
}

function extrairNumDoNome(name) {
  if (!name) return null;
  const m = String(name).match(/(?:NF|Nota\s+Fiscal|nf|NFS[eE]|NFSe)\s*(?:n?[o°º]?\.?\s*)?(\d{1,8})/i);
  return m ? m[1] : null;
}

function buildNomeOficial({ num, desc, emissor, valor, ext }) {
  const n = sanitize(num, 10).replace(/^0+(\d)/, '$1') || 'SN';
  const d = sanitize(desc, 30) || 'Despesa';
  const e = sanitize(emissor, 60) || 'FORNECEDOR';
  const v = Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefix = ext === 'xml' ? 'XML' : 'NF';
  return `${prefix} ${n} ${d} - ${e} - MUSEUS CENTRO - R$ ${v}.${ext}`;
}

// Parses XML content (case-insensitive) for date, number, emissor, valor
function parseXmlFields(xml) {
  if (!xml) return null;
  const out = {};
  // Date
  const dateMatches = [
    /<dhEmi[^>]*>([^<]+)<\/dhEmi>/i,
    /<dEmi[^>]*>([^<]+)<\/dEmi>/i,
    /<dataEmissao[^>]*>([^<]+)<\/dataEmissao>/i,
    /<DataEmissao[^>]*>([^<]+)<\/DataEmissao>/i,
    /<dhConte[^>]*>([^<]+)<\/dhConte>/i,
  ];
  for (const p of dateMatches) {
    const m = xml.match(p);
    if (m) { out.data = parseDataEmissao(m[1]); if (out.data) break; }
  }
  // Number
  const numM = xml.match(/<nNF[^>]*>([^<]+)<\/nNF>/i) ||
               xml.match(/<nNFS[eE][^>]*>([^<]+)<\/nNFS[eE]>/i) ||
               xml.match(/<Numero[^>]*>([^<]+)<\/Numero>/i) ||
               xml.match(/<numeroNFSe[^>]*>([^<]+)<\/numeroNFSe>/i);
  if (numM) out.num = numM[1];
  // Emissor
  const emM = xml.match(/<xNome[^>]*>([^<]+)<\/xNome>/i) ||
              xml.match(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i) ||
              xml.match(/<razaoSocial[^>]*>([^<]+)<\/razaoSocial>/i);
  if (emM) out.emissor = emM[1];
  // Valor
  const vM = xml.match(/<vNF[^>]*>([^<]+)<\/vNF>/i) ||
             xml.match(/<valorNFS[eE][^>]*>([^<]+)<\/valorNFS[eE]>/i) ||
             xml.match(/<vLiq[^>]*>([^<]+)<\/vLiq>/i) ||
             xml.match(/<Valor[^>]*>([^<]+)<\/Valor>/i);
  if (vM) {
    const v = parseFloat(String(vM[1]).replace(/\./g, '').replace(',', '.'));
    if (!isNaN(v)) out.valor = v;
  }
  return out;
}

async function getToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
  return accessToken;
}

async function listFolder(token, folderId) {
  const items = [];
  let pt = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&fields=files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(`listFolder ${r.status}: ${d.error?.message || r.statusText}`);
    }
    const d = await r.json();
    if (Array.isArray(d.files)) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function downloadFileText(token, fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return await r.text();
}

async function getFile(token, fileId, fields) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return await r.json();
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`createFolder "${name}": ${d.error.message}`);
  return d.id;
}

async function getOrCreate(token, name, parentId, cache) {
  const key = `${parentId}/${name}`;
  if (cache[key] !== undefined) return cache[key];
  const id = (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
  cache[key] = id;
  return id;
}

async function renameFile(token, fileId, newName) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  return r.ok;
}

async function moveFile(token, fileId, newParentId, oldParentId) {
  const params = new URLSearchParams();
  params.set('addParents', newParentId);
  if (oldParentId && oldParentId !== newParentId) params.set('removeParents', oldParentId);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}&supportsAllDrives=true`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }
  );
  return r.ok;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const COORD_GERAL_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];
    if (user && user.role !== 'admin' && !COORD_GERAL_EMAILS.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden — apenas administradores / coordenadores gerais' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const folderUrl = String(body.folderUrl || '');
    // Extract folderId from URL or use passed folderId; preserva hífen final (válido em IDs do Drive)
    const folderId = String(body.folderId || folderUrl.match(/\/folders\/([\w-]+)/)?.[1] || '').trim();
    const dryRun = body.dryRun !== false; // default: SIMULAÇÃO
    const limite = Math.min(Number(body.limite || 200), 500);
    const rootNotasId = body.rootNotasId || ROOT_NOTAS_FOLDER_ID;

    if (!folderId) {
      return Response.json({ error: 'folderId ou folderUrl obrigatório' }, { status: 400 });
    }

    // 1. Token
    let token = null;
    try {
      token = await getToken(base44);
    } catch (e) {
      return Response.json({ ok: false, error: `Token Drive indisponível: ${e.message}` }, { status: 503 });
    }

    // 2. Resolve source folder metadata (validate access)
    const folderMeta = await getFile(token, folderId, 'id,name,parents');
    if (!folderMeta) {
      return Response.json({ ok: false, error: 'Pasta não encontrada ou sem acesso', folderId }, { status: 404 });
    }

    // 3. List files
    const allFiles = await listFolder(token, folderId);
    const candidateFiles = allFiles.filter(f =>
      f.mimeType !== 'application/vnd.google-apps.folder' && /\.(pdf|xml)$/i.test(f.name)
    ).slice(0, limite);

    const stats = {
      dry_run: dryRun,
      source_folder_id: folderId,
      source_folder_name: folderMeta.name,
      files_total: allFiles.length,
      files_target: candidateFiles.length,
      matched_intake: 0,
      xml_parsed: 0,
      from_filename: 0,
      sem_data: 0,
      ja_no_mes_correto: 0,
      renomeados: 0,
      movidos: 0,
      erros: 0,
      detalhes: [],
    };

    const folderCache = {};
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const DEADLINE_MS = 60000;
    const deadlineStart = Date.now();

    // Pré-carrega DocumentIntakes recentes (NF) indexados por file_name_original —
    // evita 1 query por arquivo (rate-limit)
    const intakesPorFilename = new Map();
    try {
      const recent = await base44.asServiceRole.entities.DocumentIntake.filter(
        { tipo_detectado: { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML'] } },
        '-updated_date', 2000, 0
      ).catch(() => []);
      for (const it of (recent || [])) {
        const k = safeStr(it.file_name_original);
        if (k && !intakesPorFilename.has(k)) intakesPorFilename.set(k, it);
      }
    } catch (e) {
      console.warn('[corrigirPastaMesErrado] aviso preload intakes:', e.message);
    }

    let paradosPorDeadline = 0;
    for (let i = 0; i < candidateFiles.length; i++) {
      if (Date.now() - deadlineStart > DEADLINE_MS) {
        paradosPorDeadline = candidateFiles.length - i;
        if (stats.detalhes.length < 60) stats.detalhes.push(`⏸ INTERROMPIDO POR DEADLINE (${paradosPorDeadline} restantes)`);
        break;
      }
      const file = candidateFiles[i];
      let dataInfo = null;
      let num = null;
      let emissor = null;
      let valor = null;
      let desc = 'Despesa';

      // 3a. Match DocumentIntake por file_name_original (index em memória)
      const intake = intakesPorFilename.get(safeStr(file.name));
      if (intake) {
        stats.matched_intake++;
        if (intake.nf_data_emissao) dataInfo = parseDataEmissao(intake.nf_data_emissao);
        num = safeStr(intake.nf_numero);
        emissor = intake.fornecedor_nome || intake.nf_emitente_nome;
        valor = Number(intake.nf_valor_total || 0) || null;
        if (intake.rubrica_nome_sugerida || intake.rubrica_nome) {
          desc = intake.rubrica_nome_sugerida || intake.rubrica_nome;
        }
      }

      // 3b. If XML — parse XML content
      if (!dataInfo && /\.xml$/i.test(file.name)) {
        try {
          const xml = await downloadFileText(token, file.id);
          if (xml) {
            stats.xml_parsed++;
            const f = parseXmlFields(xml);
            if (f?.data) dataInfo = f.data;
            if (!num && f?.num) num = f.num;
            if (!emissor && f?.emissor) emissor = f.emissor;
            if (!valor && f?.valor) valor = f.valor;
          }
        } catch { /* segue */ }
      }

      // 3c. Filename pattern fallback
      if (!dataInfo) {
        const fd = extrairDataDoNome(file.name);
        if (fd) { dataInfo = fd; stats.from_filename++; }
      }

      if (!dataInfo) {
        stats.sem_data++;
        if (stats.detalhes.length < 50) {
          stats.detalhes.push(`✗ ${file.name.substring(0, 70)}: SEM DATA`);
        }
        continue;
      }

      // 4. Determine target month folder (MM-AAAA)
      const targetMonthFolder = `${dataInfo.mes}-${dataInfo.ano}`;
      const sourceFolderName = folderMeta.name || '';
      const isAlreadyCorrect = sourceFolderName === targetMonthFolder;

      if (isAlreadyCorrect) stats.ja_no_mes_correto++;

      // 5. Build canonical name
      const ext = /\.xml$/i.test(file.name) ? 'xml' : 'pdf';
      if (!num) num = extrairNumDoNome(file.name);
      const novoNome = buildNomeOficial({ num, desc, emissor, valor, ext });

      if (!dryRun) {
        // Rename if different
        if (file.name !== novoNome) {
          try {
            const rName = await renameFile(token, file.id, novoNome);
            if (rName) stats.renomeados++;
            else stats.erros++;
          } catch {
            stats.erros++;
          }
          await delay(150);
        }

        // Move to correct month folder (skip if already there)
        if (!isAlreadyCorrect) {
          try {
            const targetFolderIdReal = await getOrCreate(token, targetMonthFolder, rootNotasId, folderCache);
            const fileMeta = await getFile(token, file.id, 'parents');
            const currentParents = (fileMeta?.parents || []);
            let moveOk = false;
            if (currentParents.length === 0) {
              moveOk = await moveFile(token, file.id, targetFolderIdReal, null);
            } else {
              for (const cp of currentParents) {
                const ok = await moveFile(token, file.id, targetFolderIdReal, cp);
                if (ok) moveOk = true;
              }
            }
            if (moveOk) {
              stats.movidos++;
              if (stats.detalhes.length < 50) {
                stats.detalhes.push(`✓ ${novoNome.substring(0, 60)} → ${targetMonthFolder}`);
              }
            } else {
              stats.erros++;
              if (stats.detalhes.length < 50) {
                stats.detalhes.push(`✗ ${novoNome.substring(0, 60)}: MOVE_FALHOU`);
              }
            }
          } catch (e) {
            stats.erros++;
            if (stats.detalhes.length < 50) {
              stats.detalhes.push(`✗ ${novoNome.substring(0, 60)}: ${e.message}`);
            }
          }
          await delay(200);
        } else {
          if (stats.detalhes.length < 50) {
            stats.detalhes.push(`↻ ${novoNome.substring(0, 60)} (rename only, same folder)`);
          }
        }
      } else {
        // Dry-run simulation
        if (file.name !== novoNome) stats.renomeados++;
        if (!isAlreadyCorrect) stats.movidos++;
        if (stats.detalhes.length < 50) {
          stats.detalhes.push(`[DRY] ${novoNome.substring(0, 55)} → ${targetMonthFolder}${isAlreadyCorrect ? ' (same)' : ''}`);
        }
      }
    }

    stats.adidados_deadline = paradosPorDeadline;
    return Response.json({ ok: true, stats, elapsed_ms: Date.now() - startTime, paradosPorDeadline });
  } catch (error) {
    console.error('[corrigirPastaMesErrado] erro:', error.message);
    return Response.json({ ok: false, error: error?.message || 'Erro interno' }, { status: 500 });
  }
});