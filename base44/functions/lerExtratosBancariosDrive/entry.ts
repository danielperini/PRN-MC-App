import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const ROOT_FOLDER_ID = '1sI_XEZpUo3W5gcs2Nik3rGm1v6bAbKTh';
const MONTH_FOLDERS: Record<number, string | null> = {
  1: '1RV2mZM56GXI2CnDkwSJUp4y_s6uA82QX',
  2: '1X7Ouq3bWMkw2FKuj5ToNrVqI8GT8fdU1',
  3: '1GPGPwo3mXZHmKLEI87GrfsvlHhnt7S9s',
  4: null,
  5: '155LK95qLqmv8QKRqBHUgJescETB1MOsw',
  6: '166UanEeDSixvVKT7RhQ7edsTOtNqYdBT',
  7: '10udE1viTbqEtoGdpMZVcRA97SkpcWNsn',
};
const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_MAP: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function normalize(value: string) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function monthFromText(value: string) {
  const text = normalize(value);
  for (const [name, number] of Object.entries(MONTH_MAP)) {
    if (text.includes(normalize(name))) return number;
  }
  return null;
}

function yearFromText(value: string) {
  const match = String(value || '').match(/20\d{2}/);
  return match ? Number(match[0]) : null;
}

function isStatementPdf(file: any) {
  if (file.mimeType !== 'application/pdf') return false;
  const name = normalize(file.name);
  return name.includes('extrato') || name.includes('rendimento') || name.includes('investimento') || name.includes('aplicacao');
}

function isYieldStatement(name: string) {
  const text = normalize(name);
  return text.includes('rendimento') || text.includes('investimento') || text.includes('aplicacao') || text.includes('cdb') || text.includes('poupanca');
}

function errorMessage(error: any) {
  return String(error?.message || error || 'Erro desconhecido').slice(0, 800);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    let user: any = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const role = normalize(user.role || '');
    if (!['admin', 'coordenador', 'coordinator'].includes(role)) {
      return Response.json({ success: false, error: 'Apenas administradores ou coordenadores podem executar esta rotina.' }, { status: 403 });
    }

    let token: string | null = null;
    try {
      const connection = await base44.asServiceRole.connectors.getConnection('googledrive');
      token = connection?.accessToken || null;
    } catch (_) {}
    if (!token) {
      return Response.json({ success: false, error: 'Google Drive não está conectado.', code: 'DRIVE_NOT_CONNECTED' }, { status: 401 });
    }

    async function listFolder(folderId: string): Promise<any[]> {
      const files: any[] = [];
      let pageToken = '';
      do {
        const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)');
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Drive listagem HTTP ${response.status}: ${await response.text()}`);
        const data = await response.json();
        files.push(...(data.files || []));
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return files;
    }

    async function collectPdfs(folderId: string, depth = 0): Promise<any[]> {
      const items = await listFolder(folderId);
      const pdfs = items.filter(isStatementPdf);
      if (depth >= 2) return pdfs;
      const folders = items.filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
      for (const folder of folders) {
        const folderName = normalize(folder.name);
        if (folderName.includes('extrato') || folderName.includes('banco') || folderName.includes('financeiro') || depth === 0) {
          pdfs.push(...await collectPdfs(folder.id, depth + 1));
        }
      }
      return pdfs;
    }

    const requestedMonth = Number(body.mes_num || 0);
    const requestedYear = Number(body.ano || 2026);
    const explicitFolderId = String(body.folder_id || '').trim() || null;

    const sources: Array<{ folder_id: string; mes_num: number | null; ano: number }> = [];
    if (explicitFolderId) {
      sources.push({ folder_id: explicitFolderId, mes_num: requestedMonth || null, ano: requestedYear });
    } else if (requestedMonth) {
      const folderId = MONTH_FOLDERS[requestedMonth];
      if (!folderId) {
        return Response.json({
          success: false,
          code: 'MONTH_FOLDER_NOT_CONFIGURED',
          error: `A pasta de ${MONTH_NAMES[requestedMonth] || requestedMonth} não foi informada.`,
        }, { status: 400 });
      }
      sources.push({ folder_id: folderId, mes_num: requestedMonth, ano: requestedYear });
    } else {
      for (const [month, folderId] of Object.entries(MONTH_FOLDERS)) {
        if (folderId) sources.push({ folder_id: folderId, mes_num: Number(month), ano: 2026 });
      }
      if (sources.length === 0) sources.push({ folder_id: ROOT_FOLDER_ID, mes_num: null, ano: requestedYear });
    }

    const pdfsById = new Map<string, any>();
    for (const source of sources) {
      const found = await collectPdfs(source.folder_id);
      for (const file of found) {
        pdfsById.set(file.id, { ...file, _mes_num: source.mes_num, _ano: source.ano, _folder_id: source.folder_id });
      }
    }
    const pdfs = Array.from(pdfsById.values());

    const existing = await base44.asServiceRole.entities.MovimentacaoBancaria.list('-created_date', 1000);
    const processedIds = new Set(existing.map((item: any) => item.drive_file_id).filter(Boolean));
    const pending = pdfs.filter((file: any) => !processedIds.has(file.id));
    const batchSize = Math.max(1, Math.min(5, Number(body.batch_size || 3)));
    const batch = pending.slice(0, batchSize);

    const created: any[] = [];
    const errors: any[] = [];

    for (const pdf of batch) {
      let stage = 'download';
      try {
        const type = isYieldStatement(pdf.name) ? 'extrato_rendimento' : 'extrato_conta';
        const monthNumber = Number(pdf._mes_num || monthFromText(pdf.name) || new Date(pdf.createdTime || Date.now()).getMonth() + 1);
        const year = Number(pdf._ano || yearFromText(pdf.name) || requestedYear || new Date().getFullYear());

        const download = await fetch(`https://www.googleapis.com/drive/v3/files/${pdf.id}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!download.ok) throw new Error(`Drive download HTTP ${download.status}: ${await download.text()}`);

        stage = 'upload';
        const bytes = await download.arrayBuffer();
        if (!bytes.byteLength) throw new Error('O PDF baixado está vazio');
        const file = new File([bytes], pdf.name || `${pdf.id}.pdf`, { type: 'application/pdf' });
        const upload = await base44.asServiceRole.integrations.Core.UploadFile({ file });
        const uploadedUrl = upload?.file_url || upload?.url || upload?.data?.file_url;
        if (!uploadedUrl) throw new Error(`Upload temporário não retornou URL: ${JSON.stringify(upload).slice(0, 300)}`);

        stage = 'analysis';
        const extracted = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Analise o extrato bancário brasileiro "${pdf.name}". A competência obrigatória é ${MONTH_NAMES[monthNumber]}/${year}. Extraia banco, conta, saldos, totais e lançamentos. Para cada lançamento use data DD/MM/AAAA, descrição, tipo credito/debito/rendimento, valor positivo e saldo. Não mova o documento para outro mês com base em datas internas; a pasta mensal define a competência do documento.`,
          file_urls: [uploadedUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              banco: { type: 'string' }, conta: { type: 'string' },
              saldo_inicial: { type: 'number' }, saldo_final: { type: 'number' },
              total_creditos: { type: 'number' }, total_debitos: { type: 'number' }, total_rendimento: { type: 'number' },
              lancamentos: { type: 'array', items: { type: 'object', properties: {
                data: { type: 'string' }, descricao: { type: 'string' }, tipo: { type: 'string' }, valor: { type: 'number' }, saldo: { type: 'number' },
              } } },
              resumo_ia: { type: 'string' },
            },
          },
        }) || {};

        stage = 'persist';
        const record = await base44.asServiceRole.entities.MovimentacaoBancaria.create({
          mes: MONTH_NAMES[monthNumber], mes_num: monthNumber, ano: year, tipo: type,
          banco: extracted.banco || 'Não identificado', conta: extracted.conta || '',
          saldo_inicial: Number(extracted.saldo_inicial) || 0, saldo_final: Number(extracted.saldo_final) || 0,
          total_creditos: Number(extracted.total_creditos) || 0, total_debitos: Number(extracted.total_debitos) || 0,
          total_rendimento: Number(extracted.total_rendimento) || 0,
          lancamentos: Array.isArray(extracted.lancamentos) ? extracted.lancamentos : [],
          drive_file_id: pdf.id,
          drive_file_url: pdf.webViewLink || `https://drive.google.com/file/d/${pdf.id}/view`,
          drive_file_name: pdf.name,
          processado_em: new Date().toISOString(),
          resumo_ia: extracted.resumo_ia || '',
        });
        created.push({ arquivo: pdf.name, id: record.id, mes_num: monthNumber, tipo: type });
      } catch (error: any) {
        errors.push({ arquivo: pdf.name, drive_file_id: pdf.id, etapa: stage, erro: errorMessage(error) });
      }
    }

    return Response.json({
      success: true,
      resumo: {
        pastas_lidas: sources.length,
        pdfs_encontrados: pdfs.length,
        novos_no_drive: pending.length,
        processados_neste_lote: batch.length,
        novos_criados: created.length,
        restantes: Math.max(0, pending.length - batch.length),
        erros: errors.length,
      },
      novos: created,
      erros: errors,
    });
  } catch (error: any) {
    console.error('[lerExtratosBancariosDrive]', error);
    return Response.json({ success: false, error: errorMessage(error) }, { status: 500 });
  }
});
