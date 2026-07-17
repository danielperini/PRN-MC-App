import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * organizarPastasDrive
 *
 * Função utilitária que retorna (ou cria) o ID de uma subpasta no Drive
 * seguindo a hierarquia:
 *   Museus Centro / {tipo} / {ano} / {mes} / {museu}
 *
 * Nunca apaga nem move pastas existentes — apenas cria o que estiver faltando.
 *
 * Parâmetros aceitos:
 *   tipo    : "Relatórios Mensais" | "Fotos" | "Notas Fiscais" | "Evidências" | "Contratos"
 *   ano     : ex. "2026"
 *   mes     : ex. "Junho"  (opcional)
 *   museu   : ex. "MUMO"   (opcional)
 *
 * Retorna: { folder_id, folder_url, path }
 */

const MUSEUS_CENTRO_FOLDER_ID = '1cncFwCYZb-jiQ-cg_GAWti-wRpSZyRCd'; // criado por criarPastaRelatoriosMensais

async function findFolder(accessToken: string, folderName: string, parentId: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(accessToken: string, folderName: string, parentId: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${folderName}": ${data.error.message}`);
  return data.id;
}

async function getOrCreateFolder(accessToken: string, folderName: string, parentId: string): Promise<string> {
  return (await findFolder(accessToken, folderName, parentId)) || (await createFolder(accessToken, folderName, parentId));
}

/**
 * Resolve o caminho completo de subpastas e retorna o ID da pasta final.
 * segments: array de nomes de pasta a criar em cascata a partir da raiz Museus Centro.
 */
async function resolvePath(accessToken: string, segments: string[]): Promise<{ folderId: string; path: string }> {
  let currentId = MUSEUS_CENTRO_FOLDER_ID;
  const resolvedSegments: string[] = ['Museus Centro'];

  for (const seg of segments) {
    if (!seg) continue; // pula segmentos vazios/undefined
    currentId = await getOrCreateFolder(accessToken, seg, currentId);
    resolvedSegments.push(seg);
  }

  return { folderId: currentId, path: resolvedSegments.join(' / ') };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { tipo, ano, mes, museu } = body;

    if (!tipo) return Response.json({ error: 'Parâmetro "tipo" obrigatório' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Monta os segmentos apenas com os valores fornecidos
    const segments: string[] = [tipo];
    if (ano) segments.push(String(ano));
    if (mes) segments.push(mes);
    if (museu) segments.push(museu);

    const { folderId, path } = await resolvePath(accessToken, segments);

    // Buscar URL da pasta
    const folderRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const folderData = await folderRes.json();

    return Response.json({
      success: true,
      folder_id: folderId,
      folder_url: folderData.webViewLink || `https://drive.google.com/drive/folders/${folderId}`,
      path
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});