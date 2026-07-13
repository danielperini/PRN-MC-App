import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Pasta raiz onde ficam os contratos assinados no Drive
const CONTRATOS_FOLDER_ID = '1sI_XEZpUo3W5gcs2Nik3rGm1v6bAbKTh';

function normalize(str: string) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Fingerprint de duplicata: normaliza nome removendo datas, versões, sufixos numéricos
function fingerprintNome(nome: string): string {
  return normalize(nome)
    .replace(/\.(pdf|docx|doc)$/i, '')           // remove extensão
    .replace(/\s*[-_v]\s*\d+(\.\d+)?$/g, '')     // remove versões: -v2, _2, -2.1
    .replace(/\s+\d{2}\/\d{2}\/\d{4}$/, '')      // remove data no final
    .replace(/\s+\d{4}-\d{2}-\d{2}$/, '')        // remove data ISO no final
    .replace(/\s+copia\s*\d*$/g, '')              // remove "copia", "copia 2"
    .replace(/\s+assinado\s*$/g, '')              // remove sufixo "assinado"
    .replace(/\s+signed\s*$/g, '')                // remove sufixo "signed"
    .replace(/\s{2,}/g, ' ')                      // normaliza espaços
    .trim();
}

function isContrato(nome: string): boolean {
  const n = normalize(nome);
  const keywords = ['contrato', 'termo', 'acordo', 'convenio', 'convênio', 'tc-', 'tc_', ' tc ', 'aditivo'];
  return keywords.some(k => n.includes(normalize(k)));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = (user.role || '').toLowerCase();
    if (!['admin', 'coordenador', 'coordinator'].includes(role)) {
      return Response.json({ error: 'Acesso restrito.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const folderId = body.folder_id || CONTRATOS_FOLDER_ID;
    const importar = body.importar === true; // false = só listar/detectar duplicatas

    // Obter token do Drive
    let token: string | null = null;
    try { const c = await base44.connectors.getConnection('googledrive'); token = c?.access_token || null; } catch (_) {}
    if (!token) {
      try { const c = await base44.asServiceRole.connectors.getConnection('googledrive'); token = c?.access_token || null; } catch (_) {}
    }
    if (!token) {
      return Response.json({ error: 'Google Drive não conectado.', code: 'DRIVE_NOT_CONNECTED' }, { status: 401 });
    }

    // Listar todos os PDFs/DOCs recursivamente
    async function listFiles(fid: string, depth = 0, path = ''): Promise<any[]> {
      if (depth > 5) return [];
      let files: any[] = [];
      let pageToken: string | null = null;
      do {
        const q = encodeURIComponent(`'${fid}' in parents and trashed=false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink,size)&pageSize=100${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) break;
        const data = await res.json();
        if (data.error) break;
        for (const f of (data.files || [])) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            const sub = await listFiles(f.id, depth + 1, path ? `${path}/${f.name}` : f.name);
            files = files.concat(sub);
          } else {
            const ext = (f.name || '').toLowerCase();
            if (ext.endsWith('.pdf') || ext.endsWith('.doc') || ext.endsWith('.docx')) {
              files.push({ ...f, folder_path: path || '(raiz)' });
            }
          }
        }
        pageToken = data.nextPageToken || null;
      } while (pageToken);
      return files;
    }

    const allFiles = await listFiles(folderId);

    // Filtrar apenas contratos pelo nome
    const contratos = allFiles.filter(f => isContrato(f.name));
    const naoContratos = allFiles.filter(f => !isContrato(f.name));

    // Detectar duplicatas por fingerprint de nome
    const fpMap: Record<string, any[]> = {};
    for (const f of contratos) {
      const fp = fingerprintNome(f.name);
      if (!fpMap[fp]) fpMap[fp] = [];
      fpMap[fp].push(f);
    }

    const duplicatas: any[] = [];
    const unicos: any[] = [];
    for (const [fp, grupo] of Object.entries(fpMap)) {
      if (grupo.length > 1) {
        // Ordenar: mais recente primeiro
        grupo.sort((a, b) => new Date(b.modifiedTime || b.createdTime).getTime() - new Date(a.modifiedTime || a.createdTime).getTime());
        duplicatas.push({
          fingerprint: fp,
          quantidade: grupo.length,
          arquivos: grupo.map(f => ({
            id: f.id,
            nome: f.name,
            caminho: f.folder_path,
            data_modificacao: f.modifiedTime,
            data_criacao: f.createdTime,
            link: f.webViewLink,
            tamanho: f.size,
          })),
          mais_recente: grupo[0].name,
          link_mais_recente: grupo[0].webViewLink,
        });
      } else {
        unicos.push(grupo[0]);
      }
    }

    // Importar contratos únicos como TermoCompromisso/DocumentIntake (opcional)
    const importados: any[] = [];
    if (importar && unicos.length > 0) {
      // Buscar contratos já importados para não duplicar
      const existentes = await base44.asServiceRole.entities.DocumentIntake.filter(
        { tipo_detectado: 'CONTRATO', status_registro: 'ATIVO' }, '', 500
      ).catch(() => []);
      const nomesExist = new Set((existentes as any[]).map((e: any) => normalize(e.file_name_original || '')));

      for (const f of unicos) {
        if (nomesExist.has(normalize(f.name))) continue;
        try {
          await base44.asServiceRole.entities.DocumentIntake.create({
            user_email: user.email,
            user_name: user.full_name || user.email,
            arquivo_original_url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
            file_name_original: f.name,
            mime_type: f.mimeType || 'application/pdf',
            status_processamento: 'AGUARDANDO_REVISAO',
            tipo_detectado: 'CONTRATO',
            origem: 'drive_contratos',
            status_registro: 'ATIVO',
            grupo_status: 'INCOMPLETO',
            contrato_drive_url: f.webViewLink,
            contrato_drive_folder_id: folderId,
          });
          importados.push({ nome: f.name, id: f.id });
        } catch (e) {
          console.error(`[Contratos] Erro ao importar ${f.name}:`, e);
        }
      }
    }

    return Response.json({
      success: true,
      resumo: {
        total_arquivos_drive: allFiles.length,
        contratos_encontrados: contratos.length,
        contratos_unicos: unicos.length,
        grupos_duplicados: duplicatas.length,
        total_duplicatas: duplicatas.reduce((s, d) => s + d.quantidade - 1, 0),
        nao_contratos: naoContratos.length,
        importados: importados.length,
      },
      duplicatas,
      contratos_unicos: unicos.map(f => ({
        id: f.id,
        nome: f.name,
        caminho: f.folder_path,
        data_modificacao: f.modifiedTime,
        link: f.webViewLink,
      })),
      importados,
    });

  } catch (error) {
    console.error('[buscarContratosAssinadosDrive] Erro:', error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});