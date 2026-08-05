import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ============================================================================
// restaurarNFsDeletadasBackupMensal
// ----------------------------------------------------------------------------
// Restaura DocumentIntakes de notas fiscais (PDF/XML) que foram deletados
// indevidamente do banco. A fonte dos arquivos é a pasta de backup mensal do
// Google Drive (rastreada pelo BackupLog com backup_type='drive_nf_sync_mensal'
// — backup_folder_id aponta para a raiz 13Lkf...). O banco fornece o índice
// (BackupLog + DocumentIntakes atuais) para deduplicação; o Drive fornece os
// arquivos físicos preservados.
//
// Lógica:
//   1. Resolve a pasta raiz de backup mensal (default fixo + BackupLog override)
//   2. Varre subpastas YYYY-MM (nivel 1) — sem recursão profunda
//   3. Para cada PDF/XML de NF, deduplica contra DocumentIntakes existentes
//      (chave primária: drive_file_id; chave secundária: CNPJ|numero|valor)
//   4. Cria DocumentIntake mínimo (tipo_detectado=NOTA_FISCAL_PDF/XML,
//      status_processamento=ENVIADO, origem='restauracao_backup_mensal',
//      ocultar_entrada_unica=false). NÃO cria PurchaseRequest nem dispara
//      notificações — a restauração é só de auditoria/recuperação.
//   5. Registra BackupLog e envia e-mail ao admin com cobertura %.
//
// Parâmetros (body):
//   - batch_size: limite de arquivos por execução (default 150, máx 300)
//   - dry_run: true = apenas relata o que seria criado, não persiste
//   - mes_uniso: 'YYYY-MM' = restringe a um único mês (testes)
//
// Timeout 45s, lote máx 300.
// ============================================================================

const DEFAULT_BACKUP_ROOT_ID = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const TIMEOUT_BUDGET_MS = 45000;
const MAX_FILES_PER_EXEC = 300;
const ORIGEM_RESTAURACAO = 'restauracao_backup_mensal';

const MIME_POR_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  xml: 'application/xml',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function safeStr(v: any): string { return String(v ?? '').trim(); }
function onlyDigits(v: string): string { return String(v || '').replace(/\D/g, ''); }

function getExt(name: string): string {
  const n = safeStr(name).toLowerCase();
  const m = n.match(/\.([a-z0-9]{2,5})$/);
  return m ? m[1] : '';
}

function parseNFFingerprint(name: string) {
  const text = safeStr(name);
  const digits = onlyDigits(text);

  let cnpj = '';
  const cnpjMatch = text.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpjMatch) {
    cnpj = onlyDigits(cnpjMatch[1]);
    if (cnpj.length !== 14) cnpj = '';
  } else if (digits.length >= 14) {
    const m = digits.match(/(\d{14})/);
    if (m) cnpj = m[1];
  }

  let numero = '';
  const nfMatch = text.match(/\bnf[\s_-]*(\d{1,9})\b/i);
  if (nfMatch) {
    numero = onlyDigits(nfMatch[1]);
  } else {
    const chaveMatch = text.match(/(\d{44})/);
    if (chaveMatch) {
      const chave = chaveMatch[1];
      numero = chave.substring(25, 34).replace(/^0+/, '') || '';
    }
  }

  let valor = 0;
  const valorMatch = text.match(/(?:r\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,3}(?:,\d{3})*\.\d{2}|\d+,\d{2})/i);
  if (valorMatch) {
    const raw = valorMatch[1].replace(/\./g, '').replace(',', '.');
    const num = Number(raw);
    if (!isNaN(num)) valor = num;
  }

  return { cnpj, numero, valor };
}

function fingerprintKey(cnpj: string, numero: string, valor: number): string {
  if (!cnpj || !numero) return '';
  return `${cnpj}|${numero}|${String(Math.round(valor * 100))}`;
}

function detectarTipoPorExtensao(name: string): string {
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

async function getDriveToken(srv: any): Promise<string> {
  const conn = await srv.connectors.getConnection('googledrive');
  const token = conn?.accessToken || conn?.access_token;
  if (!token) throw new Error('Token do Google Drive não disponível — reconecte o conector.');
  return token;
}

function driveHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function driveListChildren(token: string, folderId: string) {
  const all: any[] = [];
  let pageToken: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,mimeType,size,createdTime,modifiedTime,parents),nextPageToken&pageSize=1000`;
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

async function resolveBackupRootId(srv: any): Promise<string> {
  try {
    const logs = await srv.entities.BackupLog.filter(
      { backup_type: 'drive_nf_sync_mensal' },
      '-processed_at', 10
    );
    for (const l of (logs || [])) {
      const fid = safeStr(l.backup_folder_id);
      if (fid && fid.length > 10) return fid;
    }
  } catch (e) {
    console.warn('[BackupLog] falha ao ler pasta de backup mensal:', e.message);
  }
  return DEFAULT_BACKUP_ROOT_ID;
}

async function walkPastasMensais(token: string, rootId: string, mesUnico: string | null) {
  const out: any[] = [];
  const subFolders = await driveListChildren(token, rootId);
  for (const it of subFolders) {
    if (it.mimeType !== 'application/vnd.google-apps.folder') {
      // arquivo solto na raiz de backup — também considera
      out.push({ file: it, mes: 'raiz' });
      continue;
    }
    const folderName = safeStr(it.name);
    if (mesUnico && folderName !== mesUnico) continue;
    const files = await driveListChildren(token, it.id);
    for (const f of files) out.push({ file: f, mes: folderName });
  }
  return out;
}

// ---------- Intakes existentes ----------

async function loadExistingIntakeIndex(srv: any) {
  const byDriveId = new Set<string>();
  const byFingerprint = new Set<string>();
  let skip = 0;
  while (true) {
    const batch = await srv.entities.DocumentIntake.list('-created_date', 500, skip);
    if (!batch || batch.length === 0) break;
    for (const d of batch) {
      const did = safeStr(d.drive_file_id);
      if (did) byDriveId.add(did);
      // também tenta extrair id da URL (legado)
      if (!did && d.arquivo_original_url) {
        const m = safeStr(d.arquivo_original_url).match(/\/d\/([^/]+)/);
        if (m) byDriveId.add(m[1]);
      }
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

async function sendAdminEmail(srv: any, dados: any) {
  const admins = await srv.entities.User.filter({ role: 'admin' }).catch(async () => {
    const all = await srv.entities.User.list();
    return Array.isArray(all) ? all.filter((u: any) => u.role === 'admin') : [];
  });
  if (!admins || admins.length === 0) {
    console.warn('[restaurarNFsDeletadasBackupMensal] Nenhum admin para envio de e-mail.');
    return { enviados: 0 };
  }
  const statusCobertura = dados.cobertura >= 100 ? '100% concluída' : `${dados.cobertura.toFixed(1)}%`;
  const prefix = dados.dry_run ? '[DRY-RUN] ' : '';
  const subject = `${prefix}Restauração de NFs Deletadas — ${statusCobertura} — ${dados.total_criados} restauradas`;
  const bodyLines = [
    `${prefix}Restauração de DocumentIntakes de notas fiscais deletadas do banco concluída.`,
    '',
    `Pasta de backup mensal (Drive): ${dados.root_id}`,
    `Total de arquivos no Drive (subpastas mensais): ${dados.total_drive}`,
    `DocumentIntakes restaurados neste lote: ${dados.total_criados}`,
    `Arquivos pulados (duplicatas/existentes): ${dados.total_pulados}`,
    `Duplicidade semântica (CNPJ|numero|valor): ${dados.duplicidade_semantica}`,
    `Cobertura atual: ${dados.cobertura.toFixed(1)}%`,
    `Origem dos registros restaurados: ${ORIGEM_RESTAURACAO}`,
  ];
  if (dados.total_pendentes > 0) {
    bodyLines.push(`Arquivos pendentes para a próxima execução: ${dados.total_pendentes}`);
  }
  bodyLines.push('', 'Restauração de auditoria — não cria PurchaseRequest nem dispara notificações de compra.');
  const body = bodyLines.join('\n');

  let enviados = 0;
  const erros: string[] = [];
  for (const adm of admins) {
    try {
      await srv.integrations.Core.SendEmail({
        to: adm.email,
        subject,
        body,
        from_name: 'Museus Centro — Restauração',
      });
      enviados++;
    } catch (e: any) {
      erros.push(`${adm.email}: ${e.message}`);
    }
  }
  return { enviados, erros };
}

async function registrarBackupLog(srv: any, dados: any) {
  try {
    await srv.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'restaurarNFsDeletadasBackupMensal',
      status: dados.erro ? 'failure' : 'concluido',
      processed_at: new Date().toISOString(),
      total_files: dados.total_drive || 0,
      files_copied: dados.total_criados || 0,
      execution_time_ms: dados.execution_ms || 0,
      details: safeStr(JSON.stringify({
        origem: ORIGEM_RESTAURACAO,
        backup_folder_id: dados.root_id,
        cobertura_percentual: dados.cobertura,
        total_criados: dados.total_criados,
        total_pulados: dados.total_pulados,
        duplicidade_semantica: dados.duplicidade_semantica,
        total_pendentes: dados.total_pendentes,
        dry_run: Boolean(dados.dry_run),
        mes_unico: dados.mes_unico || null,
        email_enviado_admin: dados.email_enviado,
      })),
      backup_folder_id: dados.root_id,
      error_message: dados.erro || '',
      triggered_by: 'manual',
    });
  } catch (e: any) {
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
    const dryRun = Boolean(body.dry_run);
    const mesUnico = body.mes_unico ? safeStr(body.mes_unico) : null;
    const deadline = startTime + TIMEOUT_BUDGET_MS;

    let token: string;
    try {
      token = await getDriveToken(srv);
    } catch (e: any) {
      return Response.json({ error: 'Google Drive não autorizado', detail: e.message }, { status: 502 });
    }

    const rootId = await resolveBackupRootId(srv);
    const { byDriveId, byFingerprint } = await loadExistingIntakeIndex(srv);

    const arquivos = await walkPastasMensais(token, rootId, mesUnico);
    const totalDrive = arquivos.length;

    let totalCriados = 0;
    let totalPulados = 0;
    let totalPendentes = 0;
    let totalIgnorados = 0;
    let duplicidadeSemantica = 0;
    const erros: string[] = [];
    const criadosResumo: any[] = [];

    const limite = Math.min(batchSize, totalDrive);
    for (let i = 0; i < limite; i++) {
      if (Date.now() > deadline) {
        totalPendentes = totalDrive - i;
        break;
      }
      const { file: f, mes } = arquivos[i];
      const fid = safeStr(f.id);
      const name = safeStr(f.name);
      const ext = getExt(name);

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

      if (dryRun) {
        totalCriados++;
        if (criadosResumo.length < 20) {
          criadosResumo.push({ name, drive_id: fid, mes, fingerprint: fpKey || 'sem_fp' });
        }
        continue;
      }

      try {
        const driveUrl = `https://drive.google.com/file/d/${fid}/view`;
        await srv.entities.DocumentIntake.create({
          user_email: user?.email || 'sistema@museus-centro',
          user_name: user?.full_name || 'Sistema (restauração)',
          tipo_detectado: detectarTipoPorExtensao(name),
          status_processamento: 'ENVIADO',
          arquivo_original_url: driveUrl,
          file_name_original: name,
          file_name_final: name,
          mime_type: MIME_POR_EXT[ext] || 'application/octet-stream',
          origem: ORIGEM_RESTAURACAO,
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
        if (criadosResumo.length < 20) {
          criadosResumo.push({ name, drive_id: fid, mes, fingerprint: fpKey || 'sem_fp' });
        }
      } catch (e: any) {
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

    let emailRes = { enviados: 0, erros: [] as string[] };
    if (totalCriados > 0 || dryRun) {
      emailRes = await sendAdminEmail(srv, {
        root_id: rootId,
        totalDrive, totalCriados, totalPulados,
        duplicidade_semantica: duplicidadeSemantica,
        cobertura, total_pendentes: totalPendentes,
        dry_run: dryRun,
      });
    }

    if (!dryRun) {
      await registrarBackupLog(srv, {
        root_id: rootId,
        total_drive: totalDrive,
        total_criados: totalCriados,
        total_pulados: totalPulados,
        duplicidade_semantica: duplicidadeSemantica,
        total_pendentes: totalPendentes,
        cobertura,
        execution_ms,
        email_enviado: emailRes.enviados,
        dry_run: dryRun,
        mes_unico: mesUnico,
        erro: erros.length > 0 ? erros.join('; ').slice(0, 500) : '',
      });
    }

    return Response.json({
      dry_run: dryRun,
      backup_root_id: rootId,
      mes_unico: mesUnico,
      total_arquivos_drive: totalDrive,
      total_criados: totalCriados,
      total_pulados: totalPulados,
      duplicidade_semantica: duplicidadeSemantica,
      total_ignorados: totalIgnorados,
      total_pendentes: totalPendentes,
      cobertura_percentual: Number(cobertura.toFixed(1)),
      execution_ms,
      email_enviado: emailRes.enviados > 0,
      amostra_criados: criadosResumo,
      erros,
    });
  } catch (error: any) {
    console.error('[restaurarNFsDeletadasBackupMensal]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});