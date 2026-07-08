import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * completarPastasOrigemDrive
 *
 * Origem (padronizado):  1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp  (subpastas: "07-2026", "03-2026"…)
 * Destino (por extenso): 13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T  (subpastas: "Julho 2026", "Março 2026"…)
 *
 * Para cada pasta mensual na ORIGEM, localiza a pasta equivalente no DESTINO e copia
 * apenas os arquivos que NÃO existem lá — detectando duplicatas tanto por nome exato
 * quanto por análise semântica (fornecedor + número NF + mês/ano).
 */

const SOURCE_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp'; // pastas MM-YYYY
const DEST_FOLDER_ID   = '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T'; // pastas "Mês YYYY"

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Mapa inverso: "07-2026" → possíveis nomes por extenso
const MESES_NUM_TO_NOME = {
  '01': ['Janeiro', 'January'],
  '02': ['Fevereiro', 'February'],
  '03': ['Março', 'Marco', 'March'],
  '04': ['Abril', 'April'],
  '05': ['Maio', 'May'],
  '06': ['Junho', 'June'],
  '07': ['Julho', 'July'],
  '08': ['Agosto', 'August'],
  '09': ['Setembro', 'September'],
  '10': ['Outubro', 'October'],
  '11': ['Novembro', 'November'],
  '12': ['Dezembro', 'December'],
};

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function driveRequest(token, url, options: any = {}) {
  return fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
}

async function listFolder(token, folderId) {
  const items: any[] = [];
  let pageToken = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const r = await driveRequest(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pageToken = d.nextPageToken || null;
  } while (pageToken);
  return items;
}

async function copyFile(token, fileId, fileName, destFolderId) {
  const r = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName, parents: [destFolderId] }),
    }
  );
  const d = await r.json();
  if (d.error) throw new Error(`Copy "${fileName}": ${d.error.message}`);
  return d.id;
}

// ── Análise semântica de NF ───────────────────────────────────────────────────

/**
 * Extrai campos-chave de qualquer estilo de nome de arquivo NF.
 * Suporta tanto o padrão "2026-07__FORNECEDOR__NF-05__..."
 * quanto o legado "NF 05 Consultoria - FORNECEDOR - R$ 6.000,00.pdf"
 */
function extrairChaveNF(nome: string) {
  const base = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.[^.]+$/, '');

  // Extrair número da NF
  const nfMatch = base.match(/\bnf[_\s-]?(\d+)\b/) || base.match(/nota[_\s-]?fiscal[_\s-]?n[_\s-]?o?[_\s-]?(\d+)/i);
  const nfNum = nfMatch ? nfMatch[1].padStart(3, '0') : null;

  // Extrair competência YYYY-MM ou MM-YYYY
  const compMatch1 = base.match(/(\d{4})[_-](\d{2})/); // 2026-07
  const compMatch2 = base.match(/(\d{2})[_-](\d{4})/); // 07-2026
  let competencia = null;
  if (compMatch1) competencia = `${compMatch1[1]}-${compMatch1[2]}`;
  else if (compMatch2) competencia = `${compMatch2[2]}-${compMatch2[1]}`;

  // Extrair tokens do fornecedor (palavras com 3+ chars, excluindo stopwords)
  const stopwords = new Set(['nf', 'nota', 'fiscal', 'pdf', 'xml', 'mes', 'museu', 'centro',
    'mumo', 'mhab', 'mis', 'sol', 'nfse', 'viaduto', 'das', 'artes', 'educador',
    'consultoria', 'servico', 'servicos', 'r$', 'ao', 'de', 'do', 'da', 'para', 'com', 'museos']);
  const tokens = base.split(/[\s_\-,()]+/)
    .filter(t => t.length >= 3 && !stopwords.has(t) && !/^\d+$/.test(t));

  return { nfNum, competencia, tokens, raw: nome };
}

/**
 * Retorna true se `candidato` é semanticamente duplicado de algum arquivo em `existentes`.
 * Critério: mesmo número de NF + mesma competência + pelo menos 1 token de fornecedor em comum.
 * Se não tiver número de NF, usa apenas competência + 2 tokens comuns.
 */
function isDuplicataSemântica(candidato: string, existentes: any[]): string | null {
  const c = extrairChaveNF(candidato);

  for (const ex of existentes) {
    const e = extrairChaveNF(ex.name);

    // Competência deve ser igual se ambos tiverem
    if (c.competencia && e.competencia && c.competencia !== e.competencia) continue;

    // Se ambos têm número de NF e são iguais → alta suspeita
    if (c.nfNum && e.nfNum && c.nfNum === e.nfNum) {
      // Confirma com pelo menos 1 token de fornecedor comum
      const cSet = new Set(c.tokens);
      const common = e.tokens.filter(t => cSet.has(t));
      if (common.length >= 1) return ex.name;
    }

    // Sem número de NF: precisa de 2+ tokens comuns
    if (!c.nfNum || !e.nfNum) {
      const cSet = new Set(c.tokens);
      const common = e.tokens.filter(t => cSet.has(t));
      if (common.length >= 2) return ex.name;
    }
  }
  return null;
}

// ── Mapeamento de pastas ──────────────────────────────────────────────────────

/**
 * Dado "07-2026", retorna lista de possíveis nomes para buscar no destino:
 * ["Julho 2026", "Marco 2026", etc.]
 */
function possiveisNomesDestino(srcNome: string): string[] {
  const m = srcNome.match(/^(\d{2})-(\d{4})$/);
  if (!m) return [];
  const [, mes, ano] = m;
  const variantes = MESES_NUM_TO_NOME[mes] || [];
  return variantes.map(v => `${v} ${ano}`);
}

/**
 * Localiza a pasta no destino que corresponde à pasta da origem.
 * Busca por cada variante de nome possível.
 */
async function encontrarPastaDestino(token, srcNome: string, destFolderId: string): Promise<string | null> {
  const candidatos = possiveisNomesDestino(srcNome);
  for (const nome of candidatos) {
    const q = encodeURIComponent(
      `name='${nome.replace(/'/g, "\\'")}' and '${destFolderId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`
    );
    const r = await driveRequest(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`);
    if (!r.ok) continue;
    const d = await r.json();
    if (d.files?.[0]?.id) return d.files[0].id;
  }
  // Tenta também busca pelo nome original (ex: "07-2026" diretamente)
  const qDirect = encodeURIComponent(
    `name='${srcNome}' and '${destFolderId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const rDirect = await driveRequest(token, `https://www.googleapis.com/drive/v3/files?q=${qDirect}&fields=files(id)&pageSize=5`);
  if (rDirect.ok) {
    const d = await rDirect.json();
    if (d.files?.[0]?.id) return d.files[0].id;
  }
  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isCron = req.headers.get('x-base44-trigger') === 'cron';
    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const limite = typeof body.limite === 'number' ? body.limite : 0;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;
    const startTime = Date.now();

    // Listar pastas mensais da ORIGEM (MM-YYYY)
    const srcTopLevel = await listFolder(token, SOURCE_FOLDER_ID);
    const srcMesFolders = srcTopLevel.filter(i => i.mimeType === FOLDER_MIME);

    const stats = { copiados: 0, ja_existentes: 0, duplicatas_semanticas: 0, erros: 0, pastas_sem_equivalente: 0 };
    const logs: any[] = [];

    for (const srcFolder of srcMesFolders) {
      if (limite > 0 && stats.copiados >= limite) break;

      // Encontrar pasta equivalente no destino
      const destFolderId = await encontrarPastaDestino(token, srcFolder.name, DEST_FOLDER_ID);
      if (!destFolderId) {
        stats.pastas_sem_equivalente++;
        logs.push({ pasta: srcFolder.name, status: 'pasta_nao_encontrada_no_destino' });
        continue;
      }

      // Listar arquivos da pasta de origem e destino
      const srcFiles = (await listFolder(token, srcFolder.id)).filter(i => i.mimeType !== FOLDER_MIME);
      const destFiles = (await listFolder(token, destFolderId)).filter(i => i.mimeType !== FOLDER_MIME);

      for (const file of srcFiles) {
        if (limite > 0 && stats.copiados >= limite) break;

        // 1. Nome exato
        if (destFiles.some(d => d.name === file.name)) {
          stats.ja_existentes++;
          continue;
        }

        // 2. Duplicata semântica (fornecedor + NF + competência)
        const similar = isDuplicataSemântica(file.name, destFiles);
        if (similar) {
          stats.duplicatas_semanticas++;
          logs.push({ pasta: srcFolder.name, arquivo: file.name, status: 'duplicata_semantica', similar_a: similar });
          continue;
        }

        if (dryRun) {
          logs.push({ pasta: srcFolder.name, arquivo: file.name, status: 'seria_copiado' });
          stats.copiados++;
          continue;
        }

        try {
          await copyFile(token, file.id, file.name, destFolderId);
          // Adiciona ao cache local para proteger contra duplicatas dentro do mesmo lote
          destFiles.push({ name: file.name, mimeType: file.mimeType });
          stats.copiados++;
          logs.push({ pasta: srcFolder.name, arquivo: file.name, status: 'copiado' });
        } catch (e) {
          stats.erros++;
          logs.push({ pasta: srcFolder.name, arquivo: file.name, status: 'erro', detalhe: e.message });
        }
      }
    }

    const execution_ms = Date.now() - startTime;

    if (!dryRun) {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'completar_pastas_origem_drive',
        status: stats.erros > 0 && stats.copiados === 0 ? 'failure' : 'success',
        total_files: stats.copiados + stats.ja_existentes + stats.duplicatas_semanticas + stats.erros,
        files_copied: stats.copiados,
        error_message: stats.erros > 0 ? `${stats.erros} erros` : '',
        execution_time_ms: execution_ms,
        triggered_by: isCron ? 'scheduled' : 'manual',
      }).catch(() => null);
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      source: SOURCE_FOLDER_ID,
      dest: DEST_FOLDER_ID,
      stats,
      execution_ms,
      logs: logs.slice(0, 300),
    });

  } catch (error) {
    console.error('completarPastasOrigemDrive error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});