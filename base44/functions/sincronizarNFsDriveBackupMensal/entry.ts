import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// sincronizarNFsDriveBackupMensal
// Varredura recorrente da pasta de origem de NFs (a partir de 2026-03).
// IDENTIFICA arquivos fiscais (PDF, XML, comprovantes) fora do backup,
// COPIA server-side para subpastas mensais (YYYY-MM - Mês) no backup e
// CRIA um DocumentIntake (AGUARDANDO_REVISAO) por arquivo copiado — que
// aparece automaticamente na fila da Entrada Única para revisão manual.
// Idempotente por nome (case-insensitive) e por arquivo_original_url.
// =====================================================================

const ORIGEM_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BACKUP_FOLDER_ID = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_LOWER = MESES_PT.map((m) => m.toLowerCase());

const TIMEOUT_BUDGET_MS = 200000; // 200s de 240s máx
const DATA_LIMITE = new Date(Date.UTC(2026, 2, 1)); // 2026-03-01
const MAX_DEPTH = 6;

const EXT_PERMITIDAS = new Set(['pdf', 'xml', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic']);
const MIME_POR_EXT = {
  pdf: 'application/pdf',
  xml: 'application/xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
};

// ─── Util ────────────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }

function labelPastaMes(mes, ano) {
  return `${ano}-${pad2(mes)} - ${MESES_PT[mes - 1]}`;
}

function detectarMesPasta(nome) {
  if (!nome) return null;
  const lower = nome.toLowerCase();
  let mesIdx = -1;
  let ano = null;
  // YYYY-MM (ex: 2026-03, 2026-03 - Março)
  let m = nome.match(/(20\d{2})-(\d{1,2})/);
  if (m) { ano = Number(m[1]); mesIdx = Number(m[2]) - 1; }
  if (mesIdx < 0) {
    // MM-YYYY (ex: 08-2026, 03-2026)
    m = nome.match(/\b(\d{1,2})-(20\d{2})\b/);
    if (m) { mesIdx = Number(m[1]) - 1; ano = Number(m[2]); }
  }
  if (mesIdx < 0) {
    for (let i = 0; i < MESES_PT.length; i++) {
      if (lower.includes(MESES_LOWER[i])) { mesIdx = i; break; }
    }
    if (mesIdx >= 0) {
      const ym = nome.match(/(20\d{2})/);
      ano = ym ? Number(ym[1]) : 2026;
    }
  }
  if (mesIdx < 0 || mesIdx > 11) return null;
  if (!ano) ano = 2026;
  return { mes: mesIdx + 1, ano };
}

function mesDeData(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return { mes: d.getUTCMonth() + 1, ano: d.getUTCFullYear() };
}

function ehPosteriorAoLimite(m, a) {
  return new Date(Date.UTC(a, m - 1, 1)) >= DATA_LIMITE;
}

function extPermitida(name) {
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  return EXT_PERMITIDAS.has(ext);
}

function detectarTipo(name) {
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  const nm = name.toLowerCase();
  if (ext === 'xml') return 'NOTA_FISCAL_XML';
  if (ext === 'pdf') {
    if (/\b(nf|nfe|nfse|nota|danhfe|comprovante|recibo)\b/.test(nm)) return 'NOTA_FISCAL_PDF';
    return 'DOCUMENTO_ADMINISTRATIVO';
  }
  return 'OUTRO';
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function walkFolder(token, folderId, folderName, depth, results, deadline) {
  if (depth > MAX_DEPTH) return;
  if (Date.now() > deadline) return;
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  let pageToken = null;
  do {
    if (Date.now() > deadline) return;
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,createdTime,modifiedTime)&pageSize=200`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    for (const f of data.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        await walkFolder(token, f.id, f.name, depth + 1, results, deadline);
      } else if (extPermitida(f.name || '')) {
        f._parentName = folderName;
        results.push(f);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
}

async function getOrCreateMesSubpasta(token, mes, ano) {
  const label = labelPastaMes(mes, ano);
  const safe = label.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${safe}' and '${BACKUP_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,webViewLink)`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.files && data.files.length > 0) return { id: data.files[0].id, label, link: data.files[0].webViewLink };
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: label, mimeType: 'application/vnd.google-apps.folder', parents: [BACKUP_FOLDER_ID] }),
  });
  const cf = await cr.json();
  if (cf.error) throw new Error(`Criar pasta "${label}": ${cf.error.message}`);
  return { id: cf.id, label, link: cf.webViewLink };
}

async function listarArquivosBackup(token, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return new Set((data.files || []).map((f) => (f.name || '').toLowerCase()));
}

async function copiarArquivo(token, fileId, targetFolderId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parents: [targetFolderId] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

// ─── Lista de meses a processar (cursor incremental) ──────────────────────────

function listarMeses(cursorJoin) {
  const out = [];
  const agora = new Date();
  const anoAtual = agora.getUTCFullYear();
  const mesAtual = agora.getUTCMonth() + 1;
  for (let ano = 2026; ano <= anoAtual; ano++) {
    const ini = ano === 2026 ? 3 : 1;
    const fim = ano === anoAtual ? mesAtual : 12;
    for (let m = ini; m <= fim; m++) {
      const join = ano * 100 + m;
      if (cursorJoin && join <= cursorJoin) continue;
      out.push({ mes: m, ano });
    }
  }
  return out.sort((a, b) => (a.ano * 100 + a.mes) - (b.ano * 100 + b.mes));
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const srv = base44.asServiceRole;
    if (!srv) return Response.json({ error: 'Service role indisponível' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const startTime = Date.now();
    const budgetMs = Number(body.budget_ms) && Number(body.budget_ms) <= 240000 ? Number(body.budget_ms) : TIMEOUT_BUDGET_MS;
    const deadline = startTime + budgetMs;
    const cursorJoin = Number(body.cursor_mes) || 0;

    let token;
    try {
      const conn = await srv.connectors.getConnection('googledrive');
      token = conn.accessToken;
    } catch (e) {
      return Response.json({ error: 'Google Drive não autorizado', detail: e.message }, { status: 502 });
    }

    const stats = {
      verificados: 0,
      copiados: 0,
      ignorados_duplicados: 0,
      intakes_criados: 0,
      intakes_pulados: 0,
      erros: [],
      meses_processados: [],
      cursor_proximo: cursorJoin,
    };

    // Varredura recursiva única da pasta de origem
    const arquivos = [];
    await walkFolder(token, ORIGEM_FOLDER_ID, '(raiz)', 0, arquivos, deadline);

    // Agrupa por mês/ano (pasta pai > data de criação). Filtro: >= 2026-03.
    const porMes = {};
    for (const f of arquivos) {
      const ma = detectarMesPasta(f._parentName) || mesDeData(f.createdTime);
      if (!ma) continue;
      if (!ehPosteriorAoLimite(ma.mes, ma.ano)) continue;
      const k = ma.ano * 100 + ma.mes;
      if (!porMes[k]) porMes[k] = { mes: ma.mes, ano: ma.ano, arquivos: [] };
      porMes[k].arquivos.push(f);
    }

    // Modo teste: processar apenas um mês específico (YYYYMM).
    let meses = listarMeses(cursorJoin);
    if (body.mesUnico) {
      const joinAlvo = Number(body.mesUnico);
      meses = [{ mes: joinAlvo % 100, ano: Math.floor(joinAlvo / 100) }];
    }
    for (const mp of meses) {
      if (Date.now() > deadline) { stats.cursor_proximo = mp.ano * 100 + mp.mes; break; }
      const join = mp.ano * 100 + mp.mes;
      const grupo = porMes[join] || { mes: mp.mes, ano: mp.ano, arquivos: [] };

      let subpasta;
      try {
        subpasta = await getOrCreateMesSubpasta(token, mp.mes, mp.ano);
      } catch (e) {
        stats.erros.push(`Pasta ${labelPastaMes(mp.mes, mp.ano)}: ${e.message}`);
        continue;
      }

      let nomesExistentes = new Set();
      try {
        nomesExistentes = await listarArquivosBackup(token, subpasta.id);
      } catch (e) {
        stats.erros.push(`Listar ${subpasta.label}: ${e.message}`);
      }

      let parouNoMes = false;
      for (const f of grupo.arquivos) {
        if (Date.now() > deadline) {
          stats.cursor_proximo = join;
          parouNoMes = true;
          break;
        }
        stats.verificados++;
        const nomeLower = (f.name || '').toLowerCase();
        if (nomesExistentes.has(nomeLower)) {
          stats.ignorados_duplicados++;
          continue;
        }
        try {
          const copia = await copiarArquivo(token, f.id, subpasta.id);
          const arquivoUrl = `https://drive.google.com/file/d/${copia.id}/view`;
          nomesExistentes.add((copia.name || f.name || '').toLowerCase());
          stats.copiados++;

          try {
            const existentes = await srv.entities.DocumentIntake.filter({ arquivo_original_url: arquivoUrl }, 'created_date', 5);
            if (existentes && existentes.length > 0) {
              stats.intakes_pulados++;
            } else {
              const nomeFinal = copia.name || f.name;
              const ext = (nomeFinal.includes('.') ? nomeFinal.split('.').pop() : '').toLowerCase();
              await srv.entities.DocumentIntake.create({
                user_email: 'sistema@automacao',
                arquivo_original_url: arquivoUrl,
                file_name_original: nomeFinal,
                mime_type: MIME_POR_EXT[ext] || 'application/octet-stream',
                status_processamento: 'AGUARDANDO_REVISAO',
                tipo_detectado: detectarTipo(nomeFinal),
                origem: 'sync_drive_backup',
              });
              stats.intakes_criados++;
            }
          } catch (intakeErr) {
            stats.erros.push(`Intake ${copia.name || f.name}: ${intakeErr.message}`);
          }
        } catch (e) {
          stats.erros.push(`Copiar ${f.name}: ${e.message}`);
        }
      }

      stats.meses_processados.push(`${subpasta.label} (${grupo.arquivos.length} verificados, ${stats.copiados} deste lote)`);
      if (!parouNoMes) stats.cursor_proximo = 0;
      if (Date.now() > deadline) break;
    }

    const duracao = Math.round((Date.now() - startTime) / 1000);

    try {
      await srv.entities.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal',
        entity_type: 'SYNC_NFS_DRIVE_BACKUP_MENSAL',
        backup_folder_id: BACKUP_FOLDER_ID,
        status: 'concluido',
        processed_at: new Date().toISOString(),
        total_files: stats.verificados,
        files_copied: stats.copiados,
        execution_time_ms: duracao * 1000,
        triggered_by: body.triggered_by === 'manual' ? 'manual' : 'scheduled',
        details: JSON.stringify({
          verificados: stats.verificados,
          copiados: stats.copiados,
          ignorados_duplicados: stats.ignorados_duplicados,
          intakes_criados: stats.intakes_criados,
          intakes_pulados: stats.intakes_pulados,
          meses_processados: stats.meses_processados,
          cursor_proximo: stats.cursor_proximo,
          erros: stats.erros,
        }),
      });
    } catch (logErr) {
      console.error('Erro ao salvar BackupLog:', logErr.message);
    }

    return Response.json({
      success: true,
      duracao_segundos: duracao,
      stats,
      message: `Sincronização NFs Drive Backup: ${stats.copiados} copiados, ${stats.ignorados_duplicados} ignorados, ${stats.intakes_criados} intakes criados.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});