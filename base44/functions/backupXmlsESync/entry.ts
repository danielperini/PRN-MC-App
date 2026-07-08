import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * backupXmlsESync
 *
 * 1. Carrega todos os DocumentIntake do tipo NOTA_FISCAL_XML
 * 2. Para cada XML, resolve a PurchaseRequest vinculada via:
 *      nf_pdf_intake_id → PDF intake → entidade_destino_id (PR)
 *    ou diretamente entidade_destino_id se já preenchido
 *    ou por nf_numero + fornecedor como fallback
 * 3. Faz upload do XML para a pasta MM-YYYY correta no Drive com o nome:
 *      XML [Número] [Natureza] - [Fornecedor] - [Projeto] - R$ [Valor].xml
 * 4. Sincroniza pasta a pasta (ORIGEM flat → DESTINO MM-YYYY)
 *
 * PASTAS:
 *   DESTINO MM-YYYY: 1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp
 *   ORIGEM flat:     10udE1viTbqEtoGdpMZVcRA97SkpcWNsn
 */

const ROOT_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const SOURCE_FLAT_ID = '10udE1viTbqEtoGdpMZVcRA97SkpcWNsn';
const FOLDER_MIME    = 'application/vnd.google-apps.folder';

const MESES_MAP = {
  'janeiro':'01','fevereiro':'02','marco':'03','abril':'04',
  'maio':'05','junho':'06','julho':'07','agosto':'08',
  'setembro':'09','outubro':'10','novembro':'11','dezembro':'12',
};

// ── Helpers de nome ───────────────────────────────────────────────────────────

function sanitize(v: any, max = 50): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-\.]/g, ' ')
    .replace(/\s+/g, ' ').trim().substring(0, max).trim();
}

function parseValor(v: any): number {
  const s = String(v || '').replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function fmtValor(v: any): string {
  return parseValor(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getProjeto(cc: any): string {
  return String(cc || '').toUpperCase().includes('NOTURNO') ? 'NOTURNO NOS MUSEUS 2026' : 'MUSEUS CENTRO';
}

/** Nome oficial XML a partir de dados de uma PurchaseRequest */
function buildXmlName(pr: any): string {
  const num     = sanitize(pr.nf_numero || pr.id?.substring(0, 8) || 'SN', 10);
  const nat     = sanitize(pr.rubrica_nome || pr.natureza_despesa || pr.categoria || pr.descricao_item || 'Despesa', 40);
  const forn    = sanitize(pr.fornecedor_nome || pr.nf_emitente_nome || 'FORNECEDOR', 50);
  const projeto = getProjeto(pr.centro_custo);
  const valor   = fmtValor(pr.valor_pago || pr.valor_aprovado_admin || pr.nf_valor_total || pr.valor_solicitado || 0);
  return `XML ${num} ${nat} - ${forn} - ${projeto} - R$ ${valor}.xml`;
}

/** Nome XML usando apenas dados do DocumentIntake (fallback sem PR) */
function buildXmlNameFromIntake(intake: any): string {
  const num  = sanitize(intake.nf_numero || 'SN', 10);
  const forn = sanitize(intake.fornecedor_nome || intake.nf_emitente_nome || 'FORNECEDOR', 60);
  return `XML ${num} - ${forn}.xml`;
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function driveReq(token: string, url: string, opts: any = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function listFolder(token: string, folderId: string) {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType),nextPageToken&pageSize=1000`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await driveReq(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function fileExistsInFolder(token: string, fileName: string, folderId: string): Promise<boolean> {
  const q = encodeURIComponent(
    `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`
  );
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
  if (!r.ok) return false;
  const d = await r.json();
  return (d.files?.length || 0) > 0;
}

async function uploadFromUrl(token: string, fileUrl: string, fileName: string, folderId: string) {
  const dl = await fetch(fileUrl);
  if (!dl.ok) throw new Error(`Download falhou (${dl.status}): ${fileUrl}`);
  const buf = await dl.arrayBuffer();
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }));
  form.append('file', new Blob([buf], { type: 'application/xml' }), fileName);
  const up = await driveReq(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', { method: 'POST', body: form });
  const d = await up.json();
  if (d.error) throw new Error(`Upload Drive: ${d.error.message}`);
  return { id: d.id, link: d.webViewLink || `https://drive.google.com/file/d/${d.id}/view` };
}

async function copyFile(token: string, fileId: string, fileName: string, destFolderId: string) {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fileName, parents: [destFolderId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Copy "${fileName}": ${d.error.message}`);
  return d.id;
}

// ── Pasta MM-YYYY por data ────────────────────────────────────────────────────

const folderCache: Record<string, string | null> = {};

async function getMesFolderId(token: string, dataRaw: string): Promise<string | null> {
  if (!dataRaw) return null;
  let mesKey = '';
  if (/^\d{4}-\d{2}/.test(dataRaw)) {
    const [ano, mes] = dataRaw.split('-');
    mesKey = `${mes.padStart(2, '0')}-${ano}`;
  } else {
    const br = dataRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) mesKey = `${br[2].padStart(2, '0')}-${br[3]}`;
  }
  if (!mesKey) return null;
  if (mesKey in folderCache) return folderCache[mesKey];
  const id = await findFolder(token, mesKey, ROOT_FOLDER_ID);
  folderCache[mesKey] = id;
  return id;
}

// ── Resolver PR a partir de um DocumentIntake XML ────────────────────────────

async function resolverPR(base44: any, intake: any): Promise<any | null> {
  // 1. Direto pelo entidade_destino_id
  if (intake.entidade_destino_id && intake.entidade_destino === 'PurchaseRequest') {
    return base44.asServiceRole.entities.PurchaseRequest.get(intake.entidade_destino_id).catch(() => null);
  }

  // 2. Via nf_pdf_intake_id → PDF intake → entidade_destino_id
  if (intake.nf_pdf_intake_id) {
    const pdfIntake = await base44.asServiceRole.entities.DocumentIntake.get(intake.nf_pdf_intake_id).catch(() => null);
    if (pdfIntake?.entidade_destino_id) {
      const pr = await base44.asServiceRole.entities.PurchaseRequest.get(pdfIntake.entidade_destino_id).catch(() => null);
      if (pr) return pr;
    }
  }

  // 3. Fallback: busca por nf_numero + similaridade de fornecedor
  if (intake.nf_numero) {
    const candidates = await base44.asServiceRole.entities.PurchaseRequest.filter(
      { nf_numero: intake.nf_numero }, '-created_date', 10
    ).catch(() => []);
    if (candidates?.length === 1) return candidates[0];
    if (candidates?.length > 1) {
      const hint = String(intake.fornecedor_nome || '').toLowerCase();
      const match = candidates.find((p: any) =>
        hint.split(' ').filter((t: string) => t.length > 3).some((t: string) =>
          String(p.fornecedor_nome || p.nf_emitente_nome || '').toLowerCase().includes(t)
        )
      );
      return match || candidates[0];
    }
  }

  return null;
}

// ── Fase 1: Backup de XMLs ────────────────────────────────────────────────────

async function backupXmls(base44: any, token: string, dryRun: boolean) {
  const stats = { total: 0, enviados: 0, ja_existe: 0, sem_pasta: 0, sem_pr: 0, erros: 0 };
  const logs: any[] = [];

  // Controle de paginação por lote
  const skipXmls  = (globalThis as any).__skipXmls  ?? 0;
  const limiteXmls = (globalThis as any).__limiteXmls ?? 50;

  // Paginar todos os XMLs no DocumentIntake (apenas o lote solicitado)
  let skip = 0;
  const allXmls: any[] = [];
  while (true) {
    const lote = await base44.asServiceRole.entities.DocumentIntake.filter(
      { tipo_detectado: 'NOTA_FISCAL_XML' }, '-created_date', 100, skip
    ).catch(() => []);
    if (!lote?.length) break;
    allXmls.push(...lote);
    if (lote.length < 100) break;
    skip += 100;
  }

  const totalGlobal = allXmls.length;
  const loteXmls = allXmls.slice(skipXmls, skipXmls + limiteXmls);
  stats.total = totalGlobal;

  for (const intake of loteXmls) {
    const fileUrl = intake.arquivo_original_url || '';
    if (!fileUrl) continue;

    // Resolver PurchaseRequest vinculada
    const pr = await resolverPR(base44, intake);
    let fileName: string;
    let dataRaw: string;

    if (pr) {
      fileName = buildXmlName(pr);
      dataRaw = pr.nf_data_emissao || pr.aprov_admin_data || pr.aprov_coord_data || '';
    } else {
      // Fallback: nome básico a partir do intake
      stats.sem_pr++;
      fileName = buildXmlNameFromIntake(intake);
      // Tenta extrair data do nome do arquivo
      const dateMatch = intake.file_name_original?.match(/(\d{4}[-\/]\d{2}[-\/]\d{2})/);
      dataRaw = dateMatch ? dateMatch[1] : '';
      logs.push({ id: intake.id, status: 'sem_pr', nome: fileName, nf: intake.nf_numero });
    }

    // Determina pasta destino
    const mesFolderId = await getMesFolderId(token, dataRaw);
    if (!mesFolderId) {
      // Tenta pasta 07-2026 como fallback (mês corrente do projeto)
      const fallbackId = await findFolder(token, '07-2026', ROOT_FOLDER_ID);
      if (!fallbackId) {
        stats.sem_pasta++;
        logs.push({ id: intake.id, status: 'sem_pasta', nome: fileName });
        continue;
      }
      // Usa pasta 07-2026 como fallback para XMLs sem data identificável
      if (dryRun) {
        stats.enviados++;
        logs.push({ id: intake.id, status: 'simulado_fallback_pasta', nome: fileName, pasta: '07-2026' });
        continue;
      }
      try {
        const existe = await fileExistsInFolder(token, fileName, fallbackId);
        if (existe) { stats.ja_existe++; continue; }
        const { link } = await uploadFromUrl(token, fileUrl, fileName, fallbackId);
        if (pr) {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, { drive_backup_nf_xml_link: link }).catch(() => null);
        }
        stats.enviados++;
        logs.push({ id: intake.id, status: 'enviado_fallback_pasta', nome: fileName, pasta: '07-2026' });
      } catch (e) {
        stats.erros++;
        logs.push({ id: intake.id, status: 'erro', nome: fileName, detalhe: e.message });
      }
      continue;
    }

    if (dryRun) {
      stats.enviados++;
      logs.push({ id: intake.id, status: 'simulado', nome: fileName, pr_id: pr?.id });
      continue;
    }

    try {
      const existe = await fileExistsInFolder(token, fileName, mesFolderId);
      if (existe) {
        stats.ja_existe++;
        logs.push({ id: intake.id, status: 'ja_existe', nome: fileName });
        continue;
      }
      const { link } = await uploadFromUrl(token, fileUrl, fileName, mesFolderId);
      if (pr) {
        await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, { drive_backup_nf_xml_link: link }).catch(() => null);
      }
      stats.enviados++;
      logs.push({ id: intake.id, status: 'enviado', nome: fileName, pr_id: pr?.id });
    } catch (e) {
      stats.erros++;
      logs.push({ id: intake.id, status: 'erro', nome: fileName, detalhe: e.message });
    }
  }

  return { stats, logs, totalGlobal, lote_inicio: skipXmls, lote_fim: skipXmls + loteXmls.length, has_more: skipXmls + limiteXmls < totalGlobal };
}

// ── Fase 2: Sincronização pasta a pasta ──────────────────────────────────────

function parseFolderName(name: string): string | null {
  const norm = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const m = norm.match(/^([a-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const mes = MESES_MAP[m[1]];
  return mes ? `${mes}-${m[2]}` : null;
}

async function syncPastas(token: string) {
  const stats = { copiados: 0, ja_existentes: 0, erros: 0 };
  const logs: any[] = [];

  const sourceItems = await listFolder(token, SOURCE_FLAT_ID);
  const mesFolders  = sourceItems.filter(i => i.mimeType === FOLDER_MIME);

  if (mesFolders.length > 0) {
    // Origem tem subpastas mensais: sincroniza mês a mês
    for (const srcFolder of mesFolders) {
      const destNome = parseFolderName(srcFolder.name);
      if (!destNome) continue;
      const destFolderId = await findFolder(token, destNome, ROOT_FOLDER_ID);
      if (!destFolderId) { logs.push({ pasta: srcFolder.name, status: 'destino_nao_encontrado' }); continue; }

      const srcFiles  = await listFolder(token, srcFolder.id);
      const destFiles = await listFolder(token, destFolderId);
      const destNames = new Set(destFiles.map((f: any) => f.name));

      for (const file of srcFiles) {
        if (file.mimeType === FOLDER_MIME) continue;
        if (destNames.has(file.name)) { stats.ja_existentes++; continue; }
        try {
          await copyFile(token, file.id, file.name, destFolderId);
          destNames.add(file.name);
          stats.copiados++;
          logs.push({ pasta: destNome, nome: file.name, status: 'copiado' });
        } catch (e) {
          stats.erros++;
          logs.push({ pasta: destNome, nome: file.name, status: 'erro', detalhe: e.message });
        }
      }
    }
  } else {
    // Origem flat: copia arquivos direto para as pastas MM-YYYY corretas
    const rootItems = await listFolder(token, ROOT_FOLDER_ID);
    const mmFolders = rootItems.filter((f: any) => f.mimeType === FOLDER_MIME && /^\d{2}-\d{4}$/.test(f.name));

    for (const mmFolder of mmFolders) {
      const srcFiles  = sourceItems.filter((f: any) => f.mimeType !== FOLDER_MIME && f.name.startsWith(mmFolder.name.split('-').reverse().join('-')));
      if (!srcFiles.length) continue;

      const destFiles = await listFolder(token, mmFolder.id);
      const destNames = new Set(destFiles.map((f: any) => f.name));

      for (const file of srcFiles) {
        if (destNames.has(file.name)) { stats.ja_existentes++; continue; }
        try {
          await copyFile(token, file.id, file.name, mmFolder.id);
          destNames.add(file.name);
          stats.copiados++;
          logs.push({ pasta: mmFolder.name, nome: file.name, status: 'copiado' });
        } catch (e) {
          stats.erros++;
          logs.push({ pasta: mmFolder.name, nome: file.name, status: 'erro', detalhe: e.message });
        }
      }
    }

    // Se não conseguiu filtrar por prefixo, copia tudo para 07-2026
    if (!mmFolders.length) {
      const dest07 = await findFolder(token, '07-2026', ROOT_FOLDER_ID);
      if (dest07) {
        const destFiles = await listFolder(token, dest07);
        const destNames = new Set(destFiles.map((f: any) => f.name));
        for (const file of sourceItems) {
          if (file.mimeType === FOLDER_MIME || destNames.has(file.name)) { stats.ja_existentes++; continue; }
          try {
            await copyFile(token, file.id, file.name, dest07);
            stats.copiados++;
            logs.push({ pasta: '07-2026', nome: file.name, status: 'copiado' });
          } catch (e) {
            stats.erros++;
          }
        }
      }
    }
  }

  return { stats, logs };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body        = await req.json().catch(() => ({}));
    const dryRun      = body.dryRun === true;
    const somenteSync = body.somenteSync === true;
    // Suporte a paginação: processa lote de XMLs começando em `skipXmls`
    if (typeof body.skipXmls === 'number') {
      (globalThis as any).__skipXmls = body.skipXmls;
      (globalThis as any).__limiteXmls = body.limiteXmls ?? 50;
    } else {
      (globalThis as any).__skipXmls = 0;
      (globalThis as any).__limiteXmls = body.limiteXmls ?? 50;
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;
    const start = Date.now();

    let backupResult: any = null;
    let syncResult: any   = null;

    if (!somenteSync) {
      backupResult = await backupXmls(base44, token, dryRun);
    }

    if (!dryRun) {
      syncResult = await syncPastas(token);
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      execution_ms: Date.now() - start,
      backup_xml: backupResult,
      sync_pastas: syncResult,
    });

  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});