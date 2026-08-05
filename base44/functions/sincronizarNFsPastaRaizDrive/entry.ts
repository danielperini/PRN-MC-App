import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ============================================================================
// sincronizarNFsPastaRaizDrive
// ----------------------------------------------------------------------------
// Varre a pasta raiz fixa do Google Drive e suas subpastas de nível 1 (sem
// recursão profunda), criando DocumentIntakes para NFs (PDF/XML) e comprovantes
// ainda não representados no banco. Recupera arquivos cujos registros foram
// apagados sem disparar fila de compras/notificações.
//
// Deduplicação:
//   1) Primária: drive_file_id (chave física do arquivo no Drive)
//   2) Secundária: CNPJ + número + valor (extraídos via regex do nome)
//
// Registros criados:
//   - origem = 'sincronizacao_drive_nfs'
//   - ocultar_entrada_unica = false
//   - status_processamento = 'ENVIADO'
//   - nenhum PurchaseRequest, nenhuma chamada a addPurchaseToNotificationQueue
//     ou enqueuePurchaseNotification.
//
// Final: envia e-mail ao admin com cobertura %, registra em BackupLog.
// Timeout budget 45s, lote máximo 80 arquivos por execução.
// ============================================================================

const ROOT_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const TIMEOUT_BUDGET_MS = 45000;
const MAX_FILES_PER_EXEC = 80;
const ORIGEM_SYNC = 'sincronizacao_drive_nfs';

const MIME_POR_EXT = {
  pdf: 'application/pdf',
  xml: 'application/xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function safeStr(v) { return String(v || '').trim(); }
function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }

function getExt(name) {
  const n = safeStr(name).toLowerCase();
  const m = n.match(/\.([a-z0-9]{2,5})$/);
  return m ? m[1] : '';
}

// Regex simples para extrair CNPJ (14 dígitos contíguos), número NF e valor do nome
function parseNFFingerprint(name) {
  const text = safeStr(name);
  const digits = onlyDigits(text);

  let cnpj = '';
  const cnpjMatch = text.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) {
    cnpj = onlyDigits(cnpjMatch[1]);
    if (cnpj.length !== 14) cnpj = '';
  } else if (digits.length >= 14) {
    // tento pegar 14 dígitos se houver um bloco contíguo suficiente
    const m = digits.match(/(\d{14})/);
    if (m) cnpj = m[1];
  }

  let numero = '';
  const nfMatch = text.match(/\bnf[\s_-]*(\d{1,9})\b/i);
  if (nfMatch) {
    numero = onlyDigits(nfMatch[1]);
  } else {
    // padrão "<número>-<serie>" curto depois de 44 dígitos pode indicar chave
    const chaveMatch = text.match(/(\d{44})/);
    if (chaveMatch) {
      const chave = chaveMatch[1];
      numero = chave.substring(25, 34).replace(/^0+/, '') || '';
    }
  }

  let valor = 0;
  // valor BR "R$ 1.234,56" ou "1234,56" ou "1,500.00"
  const valorMatch = text.match(/(?:r\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,3}(?:,\d{3})*\.\d{2}|\d+,\d{2})/i);
  if (valorMatch) {
    const raw = valorMatch[1].replace(/\./g, '').replace(',', '.');
    const num = Number(raw);
    if (!isNaN(num)) valor = num;
  }

  return { cnpj, numero, valor };
}

function fingerprintKey(cnpj, numero, valor) {
  if (!cnpj || !numero) return '';
  return `${cnpj}|${numero}|${String(Math.round(valor * 100))}`;
}

function detectarTipoPorExtensao(name) {
  const ext = getExt(name);
  const lower = name.toLowerCase();
  if (ext === 'xml') return 'NOTA_FISCAL_XML';
  if (ext === 'pdf') {
    if (/\b(recibo|comprovante|boleto|pix|pagamento)\b/i.test(lower)) return 'RECIBO_PDF';
    return 'NOTA_FISCAL_PDF';
  }
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    if (/\b(recibo|comprovante)\b/i.test(lower)) return 'RECIBO_PDF';
    return 'OUTRO';
  }
  return 'OUTRO';
}

// ---------- Drive helpers ----------

async function getDriveToken(srv) {
  const conn = await srv.connectors.getConnection('googledrive');
  const token = conn?.accessToken || conn?.access_token;
  if (!token) throw new Error('Token do Google Drive não disponível — reconecte o conector.');
  return token;
}

function driveHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function driveListChildren(token, folderId) {
  const all = [];
  let pageToken = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,mimeType,size,createdTime,modifiedTime),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { headers: driveHeaders(token) });
    if (!res.ok) {
      console.warn(`[Drive] listChildren HTTP ${res.status} folder ${folderId}`);
      break;
    }
    const data = await res.json();
    if (Array.isArray(data.files)) all.push(...data.files);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return all;
}

async function walkRaizENivel1(token) {
  const out = [];
  const rootChildren = await driveListChildren(token, ROOT_FOLDER_ID);
  for (const it of rootChildren) {
    if (it.mimeType === 'application/vnd.google-apps.folder') {
      const sub = await driveListChildren(token, it.id);
      out.push(...sub);
    } else {
      out.push(it);
    }
  }
  return out;
}

// ---------- Intakes existentes ----------

async function loadExistingIntakeIndex(srv) {
  const byDriveId = new Set();
  const byFingerprint = new Set();
  let skip = 0;
  while (true) {
    const batch = await srv.entities.DocumentIntake.list('-created_date', 500, skip);
    if (!batch || batch.length === 0) break;
    for (const d of batch) {
      const did = safeStr(d.drive_file_id);
      if (did) byDriveId.add(did);
      const fp = fingerprintKey(
        safeStr(d.nf_emitente_cnpj || d.fornecedor_cpf_cnpj),
        safeStr(d.nf_numero),
        Number(d.nf_valor_total) || 0
      );
      if (fp) byFingerprint.add(fp);
    }
    if (batch.length < 500) break;
    skip += 500;
  }
  return { byDriveId, byFingerprint };
}

async function sendAdminEmail(srv, { totalDrive, totalCriados, totalPulados, cobertura, pendentes }) {
  const admins = await srv.entities.User.filter({ role: 'admin' }).catch(async () => {
    // fallback: list all and filter
    const all = await srv.entities.User.list();
    return Array.isArray(all) ? all.filter((u) => u.role === 'admin') : [];
  });
  if (!admins || admins.length === 0) {
    console.warn('[sincronizarNFsPastaRaizDrive] Nenhum admin encontrado para envio de e-mail.');
    return { enviados: 0 };
  }
  const statusCobertura = cobertura >= 100 ? '100% concluída' : `${cobertura.toFixed(1)}%`;
  const subject = `Sincronização NFs Drive — ${statusCobertura} — ${totalCriados} notas sincronizadas`;
  const bodyLines = [
    'Sincronização de arquivos da pasta raiz do Google Drive concluída.',
    '',
    `Total de arquivos no Drive (raiz + nível 1): ${totalDrive}`,
    `DocumentIntakes criados neste lote: ${totalCriados}`,
    `Arquivos pulados (duplicatas/existentes): ${totalPulados}`,
    `Cobertura atual: ${cobertura.toFixed(1)}%`,
  ];
  if (pendentes > 0) {
    bodyLines.push(`Arquivos pendentes para a próxima execução: ${pendentes}`);
  } else {
    bodyLines.push('Cobertura atingiu 100% — todos os arquivos da pasta estão representados no app.');
  }
  bodyLines.push('', 'Esta sincronização é um processo de auditoria/restauração e não dispara notificações de compra.');
  const body = bodyLines.join('\n');

  let enviados = 0;
  const erros = [];
  for (const adm of admins) {
    try {
      await srv.integrations.Core.SendEmail({
        to: adm.email,
        subject,
        body,
        from_name: 'Museus Centro — Auditoria',
      });
      enviados++;
    } catch (e) {
      erros.push(`${adm.email}: ${e.message}`);
    }
  }
  return { enviados, erros };
}

async function registrarBackupLog(srv, dados) {
  try {
    await srv.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'sincronizacaoNFsPastaRaizDrive',
      status: dados.erro ? 'failure' : 'concluido',
      processed_at: new Date().toISOString(),
      total_files: dados.total_drive || 0,
      files_copied: dados.total_criados || 0,
      execution_time_ms: dados.execution_ms || 0,
      details: safeStr(JSON.stringify({
        origem: ORIGEM_SYNC,
        cobertura_percentual: dados.cobertura,
        total_criados: dados.total_criados,
        total_pulados: dados.total_pulados,
        total_pendentes: dados.total_pendentes,
        email_enviado_admin: dados.email_enviado,
      })),
      error_message: dados.erro || '',
      triggered_by: 'manual',
    });
  } catch (e) {
    console.warn('[BackupLog] falha ao registrar:', e.message);
  }
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const srv = base44.asServiceRole;
    if (!srv) return Response.json({ error: 'Service role indisponível' }, { status: 500 });

    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await base44.auth.me().catch(() => null);
    if (user && !['admin', 'coordenador', 'coordinator'].includes(String(user.role || '').toLowerCase())) {
      return Response.json({ error: 'Apenas administradores ou coordenadores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(parseInt(body.batch_size, 10) || MAX_FILES_PER_EXEC, MAX_FILES_PER_EXEC);
    const deadline = startTime + TIMEOUT_BUDGET_MS;

    let token;
    try {
      token = await getDriveToken(srv);
    } catch (e) {
      return Response.json({ error: 'Google Drive não autorizado', detail: e.message }, { status: 502 });
    }

    const { byDriveId, byFingerprint } = await loadExistingIntakeIndex(srv);

    const arquivosDrive = await walkRaizENivel1(token);
    const totalDrive = arquivosDrive.length;

    let totalCriados = 0;
    let totalPulados = 0;
    let totalPendentes = 0;
    let totalIgnorados = 0;
    let duplicidadeSemantica = 0;
    const erros = [];

    const limite = Math.min(batchSize, totalDrive);
    for (let i = 0; i < limite; i++) {
      if (Date.now() > deadline) {
        totalPendentes = totalDrive - i;
        break;
      }
      const f = arquivosDrive[i];
      const fid = safeStr(f.id);
      const name = safeStr(f.name);
      const ext = getExt(name);

      // filtra extensões irrelevantes
      if (!['pdf', 'xml', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        totalIgnorados++;
        continue;
      }

      // dedup 1: drive_file_id
      if (fid && byDriveId.has(fid)) {
        totalPulados++;
        continue;
      }

      // dedup 2: fingerprint semântica
      const fps = parseNFFingerprint(name);
      const fpKey = fingerprintKey(fps.cnpj, fps.numero, fps.valor);
      if (fpKey && byFingerprint.has(fpKey)) {
        totalPulados++;
        duplicidadeSemantica++;
        continue;
      }

      try {
        const driveUrl = `https://drive.google.com/file/d/${fid}/view`;
        await srv.entities.DocumentIntake.create({
          user_email: user?.email || 'sistema@museus-centro',
          user_name: user?.full_name || 'Sistema (admin)',
          tipo_detectado: detectarTipoPorExtensao(name),
          status_processamento: 'ENVIADO',
          arquivo_original_url: driveUrl,
          file_name_original: name,
          file_name_final: name,
          mime_type: MIME_POR_EXT[ext] || 'application/octet-stream',
          origem: ORIGEM_SYNC,
          drive_file_id: fid,
          nf_emitente_cnpj: fps.cnpj || '',
          fornecedor_cpf_cnpj: fps.cnpj || '',
          nf_numero: fps.numero || '',
          nf_valor_total: fps.valor || 0,
          ocultar_entrada_unica: false,
          status_registro: 'ATIVO',
          revisado_pelo_usuario: false,
          grupo_status: 'INCOMPLETO',
        });
        totalCriados++;
        if (fid) byDriveId.add(fid);
        if (fpKey) byFingerprint.add(fpKey);
      } catch (e) {
        erros.push(`${name}: ${e.message}`);
      }
    }

    if (limite < totalDrive) {
      totalPendentes = totalDrive - limite;
    }

    const cobertura = totalDrive > 0
      ? ((totalPulados + totalCriados) / totalDrive) * 100
      : 100;
    const execution_ms = Date.now() - startTime;

    const emailRes = await sendAdminEmail(srv, {
      totalDrive, totalCriados, totalPulados, cobertura, pendentes: totalPendentes,
    });
    await registrarBackupLog(srv, {
      total_drive: totalDrive,
      total_criados: totalCriados,
      total_pulados: totalPulados,
      total_pendentes: totalPendentes,
      cobertura,
      execution_ms,
      email_enviado: emailRes.enviados,
      erro: erros.length > 0 ? erros.join('; ').slice(0, 500) : '',
    });

    return Response.json({
      total_arquivos_drive: totalDrive,
      total_criados: totalCriados,
      total_pulados: totalPulados,
      duplicidade_semantica: duplicidadeSemantica,
      total_ignorados: totalIgnorados,
      total_pendentes: totalPendentes,
      cobertura_percentual: Number(cobertura.toFixed(1)),
      execution_ms,
      email_enviado: emailRes.enviados > 0,
      erros,
    });
  } catch (error) {
    console.error('[sincronizarNFsPastaRaizDrive]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});