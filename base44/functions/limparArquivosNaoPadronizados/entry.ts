import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * limparArquivosNaoPadronizados
 *
 * Remove de uma pasta do Drive todos os arquivos que NÃO seguem o padrão numérico
 * esperado: AAAA-MM__... (ex: "2026-07__Fornecedor__NF-01__...")
 *
 * Mantém apenas arquivos cujo nome começa com YYYY-MM__ (formato padronizado).
 * Tudo que não bater nesse padrão é deletado (movido para lixeira).
 */

async function driveRequest(token, url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  return r;
}

async function listFolder(token, folderId) {
  const items = [];
  let pageToken = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name),nextPageToken&pageSize=1000`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const r = await driveRequest(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pageToken = d.nextPageToken || null;
  } while (pageToken);
  return items;
}

async function trashFile(token, fileId) {
  const r = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    }
  );
  if (!r.ok) {
    const d = await r.json();
    throw new Error(d.error?.message || `HTTP ${r.status}`);
  }
}

// Padrão: começa com 4 dígitos, hífen, 2 dígitos, dois underscores
// Ex: 2026-07__Fornecedor__...
const PADRAO_NUMERICO = /^\d{4}-\d{2}__/;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const folderId = body.folderId;
    if (!folderId) return Response.json({ error: 'folderId é obrigatório' }, { status: 400 });

    const dryRun = body.dryRun === true;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;

    const items = await listFolder(token, folderId);

    const paraRemover = items.filter(i => !PADRAO_NUMERICO.test(i.name));
    const manter = items.filter(i => PADRAO_NUMERICO.test(i.name));

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        folderId,
        total: items.length,
        manter: manter.length,
        remover: paraRemover.length,
        arquivos_a_remover: paraRemover.map(i => i.name),
      });
    }

    let removidos = 0;
    const erros = [];

    for (const item of paraRemover) {
      try {
        await trashFile(token, item.id);
        removidos++;
      } catch (e) {
        erros.push({ nome: item.name, erro: e.message });
      }
    }

    return Response.json({
      ok: true,
      folderId,
      total: items.length,
      mantidos: manter.length,
      removidos,
      erros,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});