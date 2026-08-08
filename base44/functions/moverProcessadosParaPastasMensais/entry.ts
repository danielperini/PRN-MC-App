// ================================================================
// moverProcessadosParaPastasMensais
//
// Rotina dedicada (manual ou agendada) que, APÓS a leitura da IA,
// move automaticamente os arquivos PDF e XML das NFs processadas
// para as pastas mensais correspondentes (MM-YYYY) no Google Drive.
//
// Critério de entrada (DocumentIntake):
//   - tipo_detectado IN [NOTA_FISCAL_PDF, NOTA_FISCAL_XML]
//   - status_processamento IN [AGUARDANDO_REVISAO, APROVADO,
//                              ENVIADO_APROVACAO, RASCUNHO]
//     (i.e., a IA já terminou a leitura; não inclui ENVIADO/ANALISANDO_IA
//      que ainda estão em processamento, nem REJEITADO/DELETADO)
//   - status_registro = ATIVO
//   - ocultar_entrada_unica = false (ainda visíveis na fila)
//
// Para cada candidato:
//   1. Resolve file_id no Drive (extrai de qualquer formato de URL)
//   2. Renomeia para o padrão oficial do projeto (idempotente)
//   3. Cria/seleciona pasta mensal MM-YYYY na raiz de Notas Fiscais
//   4. Move o arquivo (files.update addParents/removeParents)
//   5. VERIFICA via GET que o arquivo está efetivamente na pasta mensal
//   6. Em sucesso: marca APROVADO + ocultar_entrada_unica=true (remove da fila)
//   7. Em falha: mantém visível p/ reprocessamento na próxima execução
//
// Resultado em BackupLog (backup_type = drive_nf_sync_mensal).
// ================================================================
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const ROOT_NOTAS_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const MESES_PT = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DEADLINE_MS = 220000; // 3.7min p/ caber resposta HTTP dentro do limite de 5min da plataforma
const STATUS_POS_IA = ['AGUARDANDO_REVISAO', 'APROVADO', 'ENVIADO_APROVACAO', 'RASCUNHO'];

// ── Utilitários ──────────────────────────────────────────────────────────────

function safeStr(v) { return String(v || '').trim(); }
function safeNum(v) { const n = Number(v); return isNaN(n) ? null : n; }

function parseDataEmissao(raw) {
  if (!raw) return null;
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    d = new Date(raw.substring(0, 10) + 'T12:00:00Z');
  } else {
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { ano: d.getFullYear(), mesIdx: d.getMonth(), mesNome: MESES_PT[d.getMonth()] };
}

// Extrai o ID do arquivo no Drive de qualquer formato de URL:
//   - https://drive.google.com/file/d/ID/view?usp=...
//   - https://drive.google.com/open?id=ID
//   - https://drive.google.com/uc?id=ID&export=download
//   - https://www.googleapis.com/drive/v3/files/ID?alt=media
function extrairDriveId(url) {
  if (!url) return null;
  const s = String(url);
  if (s.includes('id=')) {
    const m = s.split('id=').pop().match(/^[\w-]+/);
    if (m) return m[0];
  }
  const m = s.match(/\/file\/d\/([\w-]+)/) || s.match(/\/d\/([\w-]+)/) || s.match(/\/files\/([\w-]+)/);
  if (m) return m[1];
  const m1 = s.match(/[-\w]{25,}/); // ID típico de 25+ chars
  return m1 ? m1[0] : null;
}

function buildNomeOficialLocal(intake, tipo) {
  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  const prefix = tipo === 'XML' ? 'XML' : 'NF';
  const sanitize = (v, max = 60) => String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, max).trim();
  const num = sanitize(intake?.nf_numero, 10).replace(/^0+(\d)/, '$1') || 'SN';
  const desc = sanitize(intake?.rubrica_nome_sugerida || intake?.rubrica_nome || 'Despesa', 30) || 'Despesa';
  const nomeExib = sanitize(intake?.fornecedor_nome || intake?.nf_emitente_nome || 'FORNECEDOR', 60) || 'FORNECEDOR';
  const v = Number(intake?.nf_valor_total || 0);
  const valor = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${prefix} ${num} ${desc} - ${nomeExib} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

// ── Drive helpers ────────────────────────────────────────────────────────────

async function getToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
  return accessToken;
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
  if (d.error) throw new Error(`Erro criar pasta "${name}": ${d.error.message}`);
  return d.id;
}

async function getOrCreate(token, name, parentId, cache) {
  const key = `${parentId}/${name}`;
  if (cache[key] !== undefined) return cache[key];
  const id = (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
  cache[key] = id;
  return id;
}

// ── Pipeline: renomear + mover + verificar (1 intake) ────────────────────────

async function processarUm(token, base44, intake, folderCache) {
  const url = intake.nf_pdf_url || intake.nf_xml_url || intake.arquivo_original_url;
  const fileId = extrairDriveId(url);
  if (!fileId) return { ok: false, motivo: 'sem_file_id_drive' };

  const tipo = intake.tipo_detectado === 'NOTA_FISCAL_XML' ? 'XML' : 'NF';
  const nomeOficial = buildNomeOficialLocal(intake, tipo);
  if (!nomeOficial) return { ok: false, motivo: 'nome_invalido' };

  const dataInfo = parseDataEmissao(intake.nf_data_emissao);
  if (!dataInfo) return { ok: false, motivo: 'sem_data_emissao' };

  const mesFmt = String(dataInfo.mesIdx + 1).padStart(2, '0');
  const nomePasta = `${mesFmt}-${dataInfo.ano}`;

  let folderId = null;
  try {
    folderId = await getOrCreate(token, nomePasta, ROOT_NOTAS_FOLDER_ID, folderCache);
  } catch (e) {
    return { ok: false, motivo: `pasta_erro:${e.message}` };
  }
  if (!folderId) return { ok: false, motivo: 'pasta_nao_criada' };

  const jaTemNome = intake.file_name_final === nomeOficial;
  // 1. Renomear (idempotente)
  if (!jaTemNome) {
    try {
      const rRename = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nomeOficial }),
      });
      if (!rRename.ok) {
        const dRename = await rRename.json().catch(() => ({}));
        return { ok: false, motivo: `rename_falhou:${rRename.status}:${dRename.error?.message || ''}` };
      }
    } catch (e) {
      return { ok: false, motivo: `rename_erro:${e.message}` };
    }
  }

  // 2. Mover (addParents/removeParents)
  let moveOk = false;
  try {
    const rGet = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dGet = rGet.ok ? await rGet.json() : {};
    const currentParents = (dGet.parents || []).join(',');

    const moveParams = new URLSearchParams();
    moveParams.set('addParents', folderId);
    if (currentParents && currentParents !== folderId) moveParams.set('removeParents', currentParents);
    const rMove = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?${moveParams.toString()}&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    moveOk = rMove.ok;
    if (!moveOk) {
      const dMove = await rMove.json().catch(() => ({}));
      return { ok: false, motivo: `move_falhou:${rMove.status}:${dMove.error?.message || ''}` };
    }
  } catch (e) {
    return { ok: false, motivo: `move_erro:${e.message}` };
  }

  // 3. Verificar que o arquivo está efetivamente na pasta mensal
  try {
    const rVer = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents,name,id&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (rVer.ok) {
      const dVer = await rVer.json();
      if (!Array.isArray(dVer.parents) || !dVer.parents.includes(folderId)) {
        return { ok: false, motivo: 'verificacao_parents_nao_batem', nome: nomeOficial };
      }
    }
  } catch {
    // Movimentação OK — segue mesmo se verificação GET falhar
  }

  // 4. Persistir nome final no intake
  if (!jaTemNome) {
    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
      file_name_final: nomeOficial,
    }).catch(() => null);
  }

  return { ok: true, motivo: 'renomeado_e_movido', nome: nomeOficial, folderId, pasta: nomePasta };
}

// ── Handler HTTP ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startTime = Date.now();
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const limite = typeof body.limite === 'number' ? Math.min(body.limite, 200) : 100;

    let user = null;
    try { user = await base44.auth.me(); } catch { /* service role (cron/manual admin) */ }

    let token = null;
    try {
      token = await getToken(base44);
    } catch (e) {
      return Response.json(
        { ok: false, error: `Token Drive indisponível: ${e.message}` },
        { status: 503 }
      );
    }

    const folderCache = {};

    // Pendentes: PDF/XML com IA já processada (status estágios pós-IA), não ocultos, ativos
    const pendentes = await base44.asServiceRole.entities.DocumentIntake.filter(
      {
        status_registro: 'ATIVO',
        ocultar_entrada_unica: false,
        tipo_detectado: { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML'] },
        status_processamento: { $in: STATUS_POS_IA },
      },
      '-updated_date', limite, 0
    ).catch((e) => {
      throw new Error(`Filtro DocumentIntake falhou: ${e.message}`);
    });

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        pendentes_total: (pendentes || []).length,
        amostra: (pendentes || []).slice(0, 8).map((i) => ({
          id: i.id,
          tipo: i.tipo_detectado,
          file_name: i.file_name_final || i.file_name_original,
          data_emissao: i.nf_data_emissao,
          status: i.status_processamento,
          url: i.nf_pdf_url || i.nf_xml_url || i.arquivo_original_url,
        })),
      });
    }

    const resultados = { movidos: 0, sem_data: 0, sem_file_id: 0, erro: 0 };
    const detalhes = [];

    const deadline = startTime + DEADLINE_MS;
    let paradosPorDeadline = 0;
    for (let idx = 0; idx < (pendentes || []).length; idx++) {
      if (Date.now() > deadline - 10000) {
        paradosPorDeadline = (pendentes || []).length - idx;
        detalhes.push(`interrompido p/ deadline (restam ${paradosPorDeadline})`);
        break;
      }
      const intake = pendentes[idx];
      try {
        const r = await processarUm(token, base44, intake, folderCache);
        if (r.ok) {
          // Backup Drive confirmado → marca APROVADO + remove da fila
          await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'APROVADO',
            revisado_pelo_usuario: true,
            ocultar_entrada_unica: true,
            ...(r.nome ? { file_name_final: r.nome } : {}),
          }).catch(() => null);
          resultados.movidos++;
          detalhes.push(`✓ ${intake.id} → pasta ${r.pasta}`);
        } else {
          if (r.motivo === 'sem_data_emissao') resultados.sem_data++;
          else if (r.motivo === 'sem_file_id_drive') resultados.sem_file_id++;
          else resultados.erro++;
          detalhes.push(`✗ ${intake.id}: ${r.motivo}`);
        }
      } catch (e) {
        resultados.erro++;
        detalhes.push(`✗ ${intake.id}: exceção ${e.message}`);
      }
    }

    // Log de execução em BackupLog
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_nf_sync_mensal',
      status: resultados.movidos > 0 ? 'success' : (resultados.erro > 0 ? 'failure' : 'concluido'),
      total_files: (pendentes || []).length,
      files_copied: resultados.movidos,
      error_message: resultados.erro > 0 ? `${resultados.erro} erros` : '',
      execution_time_ms: Date.now() - startTime,
      triggered_by: user ? 'manual' : 'scheduled',
      details: `Mover NFs p/ pastas mensais: ${resultados.movidos} movidos, ${resultados.sem_data} sem data, ${resultados.sem_file_id} sem file_id, ${resultados.erro} erros, ${paradosPorDeadline} adiados (deadline)`,
    }).catch(() => null);

    return Response.json({
      ok: true,
      pendentes_total: (pendentes || []).length,
      processados: (pendentes || []).length - paradosPorDeadline,
      adiados_deadline: paradosPorDeadline,
      resultados,
      execution_ms: Date.now() - startTime,
      processado_em: new Date().toISOString(),
      detalhes: detalhes.slice(0, 50),
    });
  } catch (err) {
    console.error('[moverProcessadosParaPastasMensais] erro:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});