import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ======================================================================
// CONSTANTES
// ======================================================================
const ORIGIN_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BACKUP_FOLDER_ID = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T';
const CONNECTOR_ID = '6a6d5c4b784a7fe768da2d1d';
const SYSTEM_EMAIL = 'sistema@automacao';
const SYSTEM_NAME = 'Sistema — Sincronização Drive Backup Mensal';
const CUTOFF_MS = new Date('2026-03-01T00:00:00Z').getTime();
const BUDGET_MS = 200000; // 200s dos 240s máximos

const MESES = [
  { nome: 'Janeiro', num: 1 },
  { nome: 'Fevereiro', num: 2 },
  { nome: 'Março', num: 3 },
  { nome: 'Abril', num: 4 },
  { nome: 'Maio', num: 5 },
  { nome: 'Junho', num: 6 },
  { nome: 'Julho', num: 7 },
  { nome: 'Agosto', num: 8 },
  { nome: 'Setembro', num: 9 },
  { nome: 'Outubro', num: 10 },
  { nome: 'Novembro', num: 11 },
  { nome: 'Dezembro', num: 12 },
];

// ======================================================================
// UTILITÁRIOS
// ======================================================================
function stripAccents(s: string): string {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function safeStr(v: any): string {
  return String(v || '').trim();
}

function detectMonthNum(text: string): number | null {
  const u = stripAccents(text).toUpperCase();
  for (const m of MESES) {
    if (u.includes(stripAccents(m.nome).toUpperCase())) return m.num;
  }
  return null;
}

function detectYear(text: string): number | null {
  const m = String(text || '').match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

// Detecta mês/ano em formato numérico: "02-2026" (MM-YYYY), "2026-03" (YYYY-MM), "02/2026".
// Retorna { mes, ano } quando encontrar ambos no mesmo trecho.
function detectNumericMonthYear(text: string): { mes: number; ano: number } | null {
  // MM-YYYY ou MM/YYYY (ex.: "02-2026", "03/2026")
  let m = String(text || '').match(/\b(0?[1-9]|1[0-2])\s*[-/]\s*(20\d{2})\b/);
  if (m) {
    const mes = parseInt(m[1], 10);
    const ano = parseInt(m[2], 10);
    if (mes >= 1 && mes <= 12) return { mes, ano };
  }
  // YYYY-MM ou YYYY/MM (ex.: "2026-03")
  m = String(text || '').match(/\b(20\d{2})\s*[-/]\s*(0?[1-9]|1[0-2])\b/);
  if (m) {
    const ano = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10);
    if (mes >= 1 && mes <= 12) return { mes, ano };
  }
  return null;
}

function monthKey(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function monthLabel(ano: number, mes: number): string {
  return `${monthKey(ano, mes)} - ${MESES[mes - 1].nome}`;
}

function inferTipo(file: any): string {
  const name = safeStr(file.name);
  const ext = name.toLowerCase().split('.').pop() || '';
  const base = stripAccents(name).toLowerCase();
  if (ext === 'xml') return 'NOTA_FISCAL_XML';
  if (ext === 'pdf') {
    if (base.includes('nf') || base.includes('nota')) return 'NOTA_FISCAL_PDF';
    return 'DOCUMENTO_ADMINISTRATIVO';
  }
  return 'OUTRO';
}

function shouldAccept(file: any): boolean {
  const ext = safeStr(file.name).toLowerCase().split('.').pop() || '';
  if (ext === 'pdf' || ext === 'xml') return true;
  if (file.mimeType && String(file.mimeType).startsWith('image/')) return true;
  return false;
}

function isDriveFolder(file: any): boolean {
  return file.mimeType === 'application/vnd.google-apps.folder';
}

// ======================================================================
// ACESSO AO GOOGLE DRIVE (BYO_SHARED)
// ======================================================================
async function getDriveToken(base44: any): Promise<string> {
  // Google Drive nesta plataforma não suporta BYO_SHARED; usa o conector SHARED (app OAuth
  // da plataforma), já autorizado com escopo drive. Mesmo padrão das demais funções de sync.
  const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
  const token = conn?.accessToken || conn?.access_token;
  if (!token) throw new Error('Token do Google Drive não disponível — reconecte o conector googledrive.');
  return token;
}

function driveFetch(token: string, url: string, opts?: any) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts?.headers || {}) } });
}

// ======================================================================
// VARREDURA RECURSIVA DA ORIGEM
// ======================================================================
// Retorna lista de arquivos com parentFolderName e folderPath para inferir mês.
async function listFolderRecursive(
  token: string,
  folderId: string,
  parentName = '',
  folderPath = '',
  acc: any[] = [],
): Promise<any[]> {
  let pageToken: string | null = null;
  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    let url =
      `https://www.googleapis.com/drive/v3/files?q=${query}` +
      `&fields=files(id,name,mimeType,size,modifiedTime,createdTime),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await driveFetch(token, url);
    if (!res.ok) {
      console.warn(`[Varredura] Falha ao listar ${folderId}: HTTP ${res.status}`);
      break;
    }
    const data = await res.json();
    pageToken = data.nextPageToken || null;
    for (const f of data.files || []) {
      if (isDriveFolder(f)) {
        const subPath = folderPath ? `${folderPath}/${f.name}` : f.name;
        await listFolderRecursive(token, f.id, f.name, subPath, acc);
      } else {
        acc.push({ ...f, _parentFolderName: parentName, _folderPath: folderPath });
      }
    }
  } while (pageToken);
  return acc;
}

// ======================================================================
// DETERMINAÇÃO DO MÊS DE REFERÊNCIA
// ======================================================================
// 1) Procura mês/ano no caminho completo e no nome da pasta pai.
// 2) Fallback: data de criação do arquivo no Drive.
// Retorna { ano, mes } ou null se anterior ao corte (2026-03).
function resolveReference(file: any): { ano: number; mes: number } | null {
  // Tenta nome da pasta pai, depois caminho completo
  const sources = [file._parentFolderName || '', file._folderPath || ''].filter(Boolean);
  let mes: number | null = null;
  let ano: number | null = null;
  for (const src of sources) {
    // 1) Nome de mês por extenso (Março, Abril, ...)
    if (mes === null) {
      const m = detectMonthNum(src);
      if (m !== null) mes = m;
    }
    // 2) Formato numérico MM-YYYY / YYYY-MM / MM/YYYY (preferencial quando ambos presentes)
    const numeric = detectNumericMonthYear(src);
    if (numeric) {
      if (mes === null) mes = numeric.mes;
      if (ano === null) ano = numeric.ano;
    }
    // 3) Ano isolado no nome da pasta
    if (ano === null) {
      const y = detectYear(src);
      if (y !== null) ano = y;
    }
    if (mes !== null && ano !== null) break;
  }
  // Se encontrou mês mas não ano, usa o ano da data de criação
  if (mes !== null && ano === null) {
    const tc = file.createdTime ? new Date(file.createdTime) : null;
    if (tc) ano = tc.getUTCFullYear();
  }
  // Fallback total: data de criação do arquivo no Drive
  if (mes === null || ano === null) {
    const tc = file.createdTime ? new Date(file.createdTime) : null;
    if (tc) {
      if (ano === null) ano = tc.getUTCFullYear();
      if (mes === null) mes = tc.getUTCMonth() + 1;
    }
  }
  if (mes === null || ano === null) return null;
  const ms = new Date(Date.UTC(ano, mes - 1, 1)).getTime();
  if (ms < CUTOFF_MS) return null;
  return { ano, mes };
}

// ======================================================================
// SUBPASTAS MENSAIS NO BACKUP
// ======================================================================
// Lista subpastas do backup uma única vez e reutiliza o cache.
async function listBackupSubfolders(token: string): Promise<Map<string, { id: string; files: Map<string, string> }>> {
  const map = new Map<string, { id: string; files: Map<string, string> }>();
  let pageToken: string | null = null;
  do {
    const query = encodeURIComponent(`'${BACKUP_FOLDER_ID}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`);
    let url =
      `https://www.googleapis.com/drive/v3/files?q=${query}` +
      `&fields=files(id,name),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await driveFetch(token, url);
    if (!res.ok) return map;
    const data = await res.json();
    pageToken = data.nextPageToken || null;
    for (const f of data.files || []) {
      map.set(f.name, { id: f.id, files: new Map() });
    }
  } while (pageToken);
  return map;
}

async function createBackupSubfolder(token: string, label: string): Promise<string> {
  const res = await driveFetch(token, 'https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: label,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [BACKUP_FOLDER_ID],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Falha ao criar subpasta '${label}': HTTP ${res.status} ${t}`);
  }
  const data = await res.json();
  return data.id;
}

// Lista arquivos de uma subpasta de backup (nome -> webViewLink) para idempotência.
async function listBackupSubfolderFiles(token: string, folderId: string): Promise<Map<string, string>> {
  const filesMap = new Map<string, string>();
  let pageToken: string | null = null;
  do {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    let url =
      `https://www.googleapis.com/drive/v3/files?q=${query}` +
      `&fields=files(id,name,webViewLink),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await driveFetch(token, url);
    if (!res.ok) return filesMap;
    const data = await res.json();
    pageToken = data.nextPageToken || null;
    for (const f of data.files || []) {
      filesMap.set(f.name.toLowerCase(), f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`);
    }
  } while (pageToken);
  return filesMap;
}

// Cópia server-side via Drive API files.copy
async function copyFile(token: string, fileId: string, name: string, targetFolderId: string): Promise<{ id: string; webViewLink: string } | null> {
  const res = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name,webViewLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [targetFolderId] }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return {
    id: data.id,
    webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

// ======================================================================
// IDEMPOTÊNCIA DE DOCUMENTINTAKE
// ======================================================================
async function findIntakeByUrl(base44: any, url: string): Promise<any | null> {
  try {
    const res = await base44.asServiceRole.entities.DocumentIntake.filter({ arquivo_original_url: url });
    return Array.isArray(res) && res.length > 0 ? res[0] : null;
  } catch (_) {
    return null;
  }
}

async function createIntakeForCopy(base44: any, file: any, url: string): Promise<any | null> {
  const tipo = inferTipo(file);
  try {
    const intake = await base44.asServiceRole.entities.DocumentIntake.create({
      user_email: SYSTEM_EMAIL,
      user_name: SYSTEM_NAME,
      tipo_detectado: tipo,
      status_processamento: 'AGUARDANDO_REVISAO',
      arquivo_original_url: url,
      file_name_original: file.name,
      file_name_final: file.name,
      mime_type: file.mimeType || '',
      origem: 'sync_drive_backup',
      resultado_ia: {
        drive_file_id_origem: file.id,
        drive_folder_path: file._folderPath || '',
        drive_parent_folder_name: file._parentFolderName || '',
        drive_modified_time: file.modifiedTime,
        drive_created_time: file.createdTime,
      },
    });
    return intake;
  } catch (e) {
    console.error(`[Intake] Falha ao criar DocumentIntake para ${file.name}: ${e.message}`);
    return null;
  }
}

// ======================================================================
// HANDLER PRINCIPAL
// ======================================================================
Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);

    // Autenticação: admin manual OU automação (cron)
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const isCron =
      url.searchParams.get('cron') === '1' ||
      req.headers.get('x-base44-trigger') === 'cron' ||
      body.cron === true ||
      body.cron === '1';

    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
      if (user.role !== 'admin') {
        return Response.json({ ok: false, error: 'Função exclusiva da coordenação geral' }, { status: 403 });
      }
    }

    const triggeredBy = isCron ? 'scheduled' : 'manual';
    const dryRun = body.dryRun === true;
    const cursorMonth = safeStr(body.cursor); // ex: '2026-07' — retoma a partir deste mês (inclusive)
    const startMonthKey = cursorMonth || '2026-03';

    // ── Token único ──
    let token: string;
    try {
      token = await getDriveToken(base44);
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 401 });
    }

    // ── Valida acesso às pastas raiz ──
    const [orig, back] = await Promise.allSettled([
      driveFetch(token, `https://www.googleapis.com/drive/v3/files/${ORIGIN_FOLDER_ID}?fields=id,name`),
      driveFetch(token, `https://www.googleapis.com/drive/v3/files/${BACKUP_FOLDER_ID}?fields=id,name`),
    ]);
    if (orig.status !== 'fulfilled' || !orig.value.ok) {
      return Response.json({ success: false, error: 'SEM_ACESSO_PASTA_ORIGEM' }, { status: 403 });
    }
    if (back.status !== 'fulfilled' || !back.value.ok) {
      return Response.json({ success: false, error: 'SEM_ACESSO_PASTA_BACKUP' }, { status: 403 });
    }

    // ── Varredura recursiva da origem ──
    const allFiles = await listFolderRecursive(token, ORIGIN_FOLDER_ID);
    console.log(`[Varredura] ${allFiles.length} arquivos encontrados na origem.`);

    // Aceitar apenas PDF, XML, imagem; descartar Google Docs/Sheets/etc.
    const candidates = allFiles.filter(shouldAccept);

    // Determinar mês/ano de referência e descartar anteriores ao corte
    const byMonth = new Map<string, any[]>();
    const filesSemMes: any[] = [];
    for (const f of candidates) {
      const ref = resolveReference(f);
      if (!ref) {
        filesSemMes.push(f);
        continue;
      }
      const key = monthKey(ref.ano, ref.mes);
      if (key < startMonthKey) continue; // cursor: pula meses anteriores
      const bucket = byMonth.get(key) || [];
      bucket.push(f);
      byMonth.set(key, bucket);
    }

    // Processa meses em ordem cronológica
    const sortedMonths = Array.from(byMonth.keys()).sort();
    const stats = {
      verificados: candidates.length,
      copiados: 0,
      ignorados: 0,
      intakes_criados: 0,
      erros: 0,
      sem_mes: filesSemMes.length,
      meses_processados: [] as string[],
      detalhes: [] as any[],
      next_cursor: null as string | null,
      tem_mais: false,
    };

    if (dryRun) {
      const amostra: any[] = [];
      let count = 0;
      for (const mk of sortedMonths) {
        for (const f of byMonth.get(mk)!) {
          if (count++ >= 50) break;
          amostra.push({ nome: f.name, pasta: f._parentFolderName || f._folderPath || '/', mes: mk, created: f.createdTime });
        }
        if (count >= 50) break;
      }
      return Response.json({
        success: true,
        dry_run: true,
        total_encontrados: allFiles.length,
        total_candidatos: candidates.length,
        sem_mes_referencia: filesSemMes.length,
        meses: sortedMonths.map((mk) => ({ mes: mk, arquivos: byMonth.get(mk)!.length })),
        amostra,
      });
    }

    // Cache das subpastas mensais de backup (nome -> { id, files })
    const subfolders = await listBackupSubfolders(token);

    for (const mk of sortedMonths) {
      // Controle de orçamento de tempo
      if (Date.now() - startTime > BUDGET_MS) {
        stats.next_cursor = mk;
        (stats as any).tem_mais = true;
        console.log(`[Budget] Tempo esgotado antes de processar ${mk}. next_cursor=${mk}`);
        break;
      }

      const [anoStr, mesStr] = mk.split('-');
      const ano = parseInt(anoStr, 10);
      const mes = parseInt(mesStr, 10);
      const label = monthLabel(ano, mes);

      // Garante subpasta mensal
      let sub = subfolders.get(label);
      if (!sub) {
        try {
          const id = await createBackupSubfolder(token, label);
          sub = { id, files: new Map() };
          subfolders.set(label, sub);
          console.log(`[Subpasta] Criada '${label}' id=${id}`);
        } catch (e) {
          stats.erros++;
          stats.detalhes.push({ mes: mk, erro: `Falha ao criar subpasta: ${e.message}` });
          continue;
        }
      }
      // Lista arquivos existentes na subpasta (idempotência por nome)
      if (sub.files.size === 0) {
        const filesMap = await listBackupSubfolderFiles(token, sub.id);
        sub.files = filesMap;
      }

      for (const f of byMonth.get(mk)!) {
        const lname = (f.name || '').toLowerCase();
        if (sub.files.has(lname)) {
          // Já copiado — garante intake (recuperação de falha parcial)
          const existingUrl = sub.files.get(lname)!;
          const intake = await findIntakeByUrl(base44, existingUrl);
          if (!intake) {
            const created = await createIntakeForCopy(base44, f, existingUrl);
            if (created) stats.intakes_criados++;
          }
          stats.ignorados++;
          continue;
        }
        // Copia server-side
        const copy = await copyFile(token, f.id, f.name, sub.id);
        if (!copy) {
          stats.erros++;
          stats.detalhes.push({ mes: mk, nome: f.name, erro: 'Falha na cópia via files.copy' });
          continue;
        }
        stats.copiados++;
        sub.files.set(lname, copy.webViewLink); // registra para próximas iterações
        // Cria DocumentIntake (idempotente por arquivo_original_url)
        const existing = await findIntakeByUrl(base44, copy.webViewLink);
        if (existing) {
          stats.ignorados++;
        } else {
          const created = await createIntakeForCopy(base44, f, copy.webViewLink);
          if (created) stats.intakes_criados++;
          else stats.erros++;
        }
      }
      stats.meses_processados.push(mk);
    }

    // ── BackupLog final ──
    const executionTime = Date.now() - startTime;
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'drive_nf_sync_mensal',
        status: stats.erros > 0 && stats.copiados === 0 && stats.intakes_criados === 0 ? 'failure' : 'success',
        total_files: stats.verificados,
        files_copied: stats.copiados,
        error_message: stats.erros > 0 ? `${stats.erros} arquivos com erro` : '',
        execution_time_ms: executionTime,
        triggered_by: triggeredBy,
        details: JSON.stringify({ meses: stats.meses_processados, intakes: stats.intakes_criados, ignorados: stats.ignorados, sem_mes: stats.sem_mes, next_cursor: stats.next_cursor }),
      });
    } catch (_) { /* log é best-effort */ }

    return Response.json({
      success: true,
      periodo_cursor_inicial: startMonthKey,
      verificados: stats.verificados,
      copiados: stats.copiados,
      ignorados: stats.ignorados,
      intakes_criados: stats.intakes_criados,
      erros: stats.erros,
      sem_mes_referencia: stats.sem_mes,
      meses_processados: stats.meses_processados,
      next_cursor: stats.next_cursor,
      tem_mais: (stats as any).tem_mais === true,
      execution_ms: executionTime,
      triggered_by: triggeredBy,
    });
  } catch (error) {
    console.error('sincronizarNFsDriveBackupMensal error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});