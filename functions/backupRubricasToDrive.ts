import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const FOLDER_ID = '1KqVGVQDQPD6GSXpLxi4APaG8LWBTYy98';
const FILE_NAME = 'rubricas_espelho_museus_centro.csv';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow both authenticated users (manual trigger) and service role (automation)
    let authorized = false;
    try {
      const user = await base44.auth.me();
      authorized = !!user;
    } catch (_) {
      // Called from automation without user context - use service role
      authorized = true;
    }

    if (!authorized) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all rubricas using service role
    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 200);

    // Build CSV
    const headers = ['Grupo', 'Rubrica', 'Nº Parcelas/Unidades', 'Valor Total (R$)', 'Valor Utilizado (R$)', 'Saldo (R$)', '% Utilizado', 'Ativo'];
    const rows = rubricas.map(r => [
      `"${(r.grupo || '').replace(/"/g, '""')}"`,
      `"${(r.rubrica || '').replace(/"/g, '""')}"`,
      `"${(r.numero_parcelas_unidades || '').replace(/"/g, '""')}"`,
      r.valor_rubrica || 0,
      r.valor_utilizado || 0,
      r.saldo || 0,
      `${(r.percentual_utilizado || 0).toFixed(2)}%`,
      r.ativo ? 'Sim' : 'Não',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const csvBytes = new TextEncoder().encode('\uFEFF' + csvContent); // BOM for Excel UTF-8

    // Get Drive access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Check if file already exists by searching for it by name in the folder
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${FILE_NAME}' and '${FOLDER_ID}' in parents and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    const existingFile = searchData.files?.[0];

    let result;
    if (existingFile) {
      // Update existing file content
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'text/csv; charset=UTF-8',
          },
          body: csvBytes,
        }
      );
      result = await updateRes.json();
    } else {
      // Create new file in the folder
      const boundary = 'backup_boundary_rubricas';
      const metaPart = JSON.stringify({ name: FILE_NAME, parents: [FOLDER_ID], mimeType: 'text/csv' });

      const multipartBody = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`,
        `--${boundary}\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n`,
      ];
      const enc = new TextEncoder();
      const part1 = enc.encode(multipartBody[0]);
      const part2 = enc.encode(multipartBody[1]);
      const part3 = enc.encode(`\r\n--${boundary}--`);

      const body = new Uint8Array(part1.length + part2.length + csvBytes.length + part3.length);
      body.set(part1, 0);
      body.set(part2, part1.length);
      body.set(csvBytes, part1.length + part2.length);
      body.set(part3, part1.length + part2.length + csvBytes.length);

      const createRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );
      result = await createRes.json();
    }

    return Response.json({
      success: true,
      total_rubricas: rubricas.length,
      file_id: result.id,
      file_name: FILE_NAME,
      action: existingFile ? 'updated' : 'created',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});