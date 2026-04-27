import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * setupDriveStructure — Cria a estrutura de pastas numeradas no Google Drive.
 *
 * Estrutura:
 *   ROOT/
 *     01_Notas_Fiscais/
 *       PDF/
 *       XML/
 *       Por_Rubrica/
 *     02_Comprovantes_Pagamento/
 *     03_Fotos_Atividades/
 *       MHAB/
 *       MIS/
 *       MUMO/
 *       Geral/
 *     04_Relatorios_PDF/
 *     05_Contratos_Termos/
 *     06_Orcamentos/
 *     07_Documentos_Administrativos/
 *     08_Prestacao_de_Contas/
 *     09_Lixeira_Controlada/
 *
 * Usa drive.file scope — busca pastas por nome dentro do parent conhecido (sem query de busca global).
 * Idempotente: não recria pastas já existentes.
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

async function listChildren(accessToken, parentId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)&pageSize=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.files || [];
}

async function createFolder(accessToken, name, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar "${name}": ${data.error.message}`);
  return data.id;
}

async function getOrCreate(accessToken, name, parentId, existingList) {
  const found = existingList.find(f => f.name === name);
  if (found) return { id: found.id, created: false };
  const id = await createFolder(accessToken, name, parentId);
  return { id, created: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const rootChildren = await listChildren(accessToken, ROOT_FOLDER_ID);
    const report = [];

    // Definição da estrutura
    const structure = [
      { name: '01_Notas_Fiscais', sub: ['PDF', 'XML', 'Por_Rubrica'] },
      { name: '02_Comprovantes_Pagamento', sub: [] },
      { name: '03_Fotos_Atividades', sub: ['MHAB', 'MIS', 'MUMO', 'Geral'] },
      { name: '04_Relatorios_PDF', sub: [] },
      { name: '05_Contratos_Termos', sub: [] },
      { name: '06_Orcamentos', sub: [] },
      { name: '07_Documentos_Administrativos', sub: [] },
      { name: '08_Prestacao_de_Contas', sub: [] },
      { name: '09_Lixeira_Controlada', sub: [] },
    ];

    for (const folder of structure) {
      const parent = await getOrCreate(accessToken, folder.name, ROOT_FOLDER_ID, rootChildren);
      report.push({ name: folder.name, id: parent.id, created: parent.created, children: [] });

      if (folder.sub.length > 0) {
        const subChildren = parent.created ? [] : await listChildren(accessToken, parent.id);
        for (const subName of folder.sub) {
          const sub = await getOrCreate(accessToken, subName, parent.id, subChildren);
          report[report.length - 1].children.push({ name: subName, id: sub.id, created: sub.created });
        }
      }
    }

    const totalCreated = report.reduce((acc, f) => acc + (f.created ? 1 : 0) + f.children.filter(c => c.created).length, 0);

    return Response.json({
      success: true,
      root_folder_id: ROOT_FOLDER_ID,
      total_created: totalCreated,
      folders: report,
    });

  } catch (error) {
    console.error('Erro ao configurar estrutura Drive:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});