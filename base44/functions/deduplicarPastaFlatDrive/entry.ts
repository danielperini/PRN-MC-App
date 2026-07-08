import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * deduplicarPastaFlatDrive
 *
 * Em uma pasta "flat" (sem subpastas) do Google Drive, detecta pares de arquivos
 * que representam a mesma NF mas com nomes diferentes:
 *   - Padrão MÁQUINA:  2026-07__NOME__NF-05__nf-pdf__sol-dcbb9e63.pdf   ← REMOVER
 *   - Padrão LEGÍVEL:  NF 05 Educador - NOME - PROJETO - R$ VALOR.pdf   ← MANTER
 *
 * Regra: sempre que houver duplicata semântica, mantém o arquivo cujo nome
 * começa com "NF " (padrão legível) e move para lixeira o padrão máquina.
 * Se os dois forem padrão máquina, mantém o mais antigo.
 */

const FOLDER_ID = '10udE1viTbqEtoGdpMZVcRA97SkpcWNsn';

// ── helpers ───────────────────────────────────────────────────────────────────

function isMachinePattern(nome: string) {
  // Padrão: YYYY-MM__...___sol-XXXXXXXX.pdf  ou  YYYY-MM__...__nf-pdf__sol-*.pdf
  return /^\d{4}-\d{2}__/.test(nome);
}

function isLegiblePattern(nome: string) {
  return /^NF\s+\d+/i.test(nome);
}

/** Extrai chave semântica: número NF + competência YYYY-MM */
function extrairChave(nome: string): { nfNum: string | null; competencia: string | null; tokens: string[] } {
  const base = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.[^.]+$/, '');

  // NF number
  const nfMatch = base.match(/\bnf[_\s-]?(\d+)\b/);
  const nfNum = nfMatch ? nfMatch[1].padStart(4, '0') : null;

  // Competência
  const c1 = base.match(/(\d{4})[_-](\d{2})/);
  const c2 = base.match(/(\d{2})[_-](\d{4})/);
  let competencia: string | null = null;
  if (c1) competencia = `${c1[1]}-${c1[2]}`;
  else if (c2) competencia = `${c2[2]}-${c2[1]}`;

  // Tokens de fornecedor
  const stop = new Set(['nf', 'nota', 'fiscal', 'pdf', 'xml', 'mes', 'museu', 'centro',
    'mumo', 'mhab', 'mis', 'sol', 'nfse', 'viaduto', 'das', 'artes', 'educador',
    'consultoria', 'servico', 'servicos', 'noturno', 'nos', 'museus', '2026',
    'r$', 'ao', 'de', 'do', 'da', 'para', 'com', 'e', 'nf-pdf']);
  const tokens = base.split(/[\s_\-,()]+/).filter(t => t.length >= 3 && !stop.has(t) && !/^\d+$/.test(t));

  return { nfNum, competencia, tokens };
}

function saoSemanticamenteDuplicados(a: string, b: string): boolean {
  const ka = extrairChave(a);
  const kb = extrairChave(b);

  // Competência diferente → não duplicata
  if (ka.competencia && kb.competencia && ka.competencia !== kb.competencia) return false;

  // Mesmo número de NF → verifica tokens de fornecedor
  if (ka.nfNum && kb.nfNum && ka.nfNum === kb.nfNum) {
    const setA = new Set(ka.tokens);
    const common = kb.tokens.filter(t => setA.has(t));
    return common.length >= 1;
  }

  // Sem número de NF → tokens em comum
  const setA = new Set(ka.tokens);
  const common = kb.tokens.filter(t => setA.has(t));
  return common.length >= 2;
}

/** Decide qual arquivo manter entre dois duplicados. Retorna o ID a remover. */
function escolherRemover(a: any, b: any): string {
  const aLeg = isLegiblePattern(a.name);
  const bLeg = isLegiblePattern(b.name);

  if (aLeg && !bLeg) return b.id; // mantém A (legível)
  if (!aLeg && bLeg) return a.id; // mantém B (legível)

  // Ambos legíveis ou ambos máquina → mantém o que tem nome mais longo (mais informativo)
  return a.name.length >= b.name.length ? b.id : a.id;
}

// ── Drive ─────────────────────────────────────────────────────────────────────

async function listFiles(token: string, folderId: string) {
  const files: any[] = [];
  let pageToken: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime,size)&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) files.push(...d.files);
    pageToken = d.nextPageToken || null;
  } while (pageToken);
  return files;
}

async function trashFile(token: string, fileId: string) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  return r.ok;
}

// ── main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // padrão: true (seguro)
    const folderId = body.folderId || FOLDER_ID;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;

    const files = await listFiles(token, folderId);
    console.log(`Total de arquivos: ${files.length}`);

    // Detectar pares duplicados
    const toRemoveIds = new Set<string>();
    const toRemoveNames: any[] = [];
    const processed = new Set<number>();

    for (let i = 0; i < files.length; i++) {
      if (processed.has(i)) continue;
      for (let j = i + 1; j < files.length; j++) {
        if (processed.has(j)) continue;
        if (saoSemanticamenteDuplicados(files[i].name, files[j].name)) {
          const removeId = escolherRemover(files[i], files[j]);
          const removeName = removeId === files[i].id ? files[i].name : files[j].name;
          const keepName = removeId === files[i].id ? files[j].name : files[i].name;
          if (!toRemoveIds.has(removeId)) {
            toRemoveIds.add(removeId);
            toRemoveNames.push({ remover: removeName, manter: keepName, id: removeId });
          }
          processed.add(j);
        }
      }
      processed.add(i);
    }

    let removidos = 0;
    const erros: string[] = [];

    if (!dryRun) {
      for (const item of toRemoveNames) {
        const ok = await trashFile(token, item.id);
        if (ok) removidos++;
        else erros.push(item.remover);
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      folder: folderId,
      total_arquivos: files.length,
      duplicatas_encontradas: toRemoveNames.length,
      removidos: dryRun ? 0 : removidos,
      erros,
      pares: toRemoveNames.slice(0, 100),
    });

  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});