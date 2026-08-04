import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ROOT_FOLDER_ID = '1aJ5nfpgXcpu6SrDVecmhIQ2eq4vexqe3';
const ROOT_FOLDER_NAME = 'notasfiscais-App';

const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const APPROVED_STATUSES = new Set(['APROVADO_COORD','APROVADO_ADMIN','APROVADO','PAGO']);

// Retorna { mes: string, ano: number } para nomear a pasta mensal
function resolverMesAno(purchase) {
  // 1. competencia da solicitação
  if (purchase.competencia) {
    const d = new Date(purchase.competencia);
    if (!isNaN(d)) return { mes: MESES_PT[d.getMonth()], ano: d.getFullYear() };
  }
  // 2. data de emissão da NF
  if (purchase.nf_data_emissao) {
    const d = new Date(purchase.nf_data_emissao);
    if (!isNaN(d)) return { mes: MESES_PT[d.getMonth()], ano: d.getFullYear() };
  }
  // 3. data da solicitação (created_date)
  if (purchase.created_date) {
    const d = new Date(purchase.created_date);
    if (!isNaN(d)) return { mes: MESES_PT[d.getMonth()], ano: d.getFullYear() };
  }
  // 4. data de aprovação
  if (purchase.approved_at) {
    const d = new Date(purchase.approved_at);
    if (!isNaN(d)) return { mes: MESES_PT[d.getMonth()], ano: d.getFullYear() };
  }
  // fallback: agora
  const now = new Date();
  return { mes: MESES_PT[now.getMonth()], ano: now.getFullYear() };
}

// Sanitiza string para uso em nome de arquivo
function sanitize(str) {
  return (str || '').replace(/[^a-zA-Z0-9À-ÿ\-_]/g, '_').replace(/_+/g, '_').slice(0, 60);
}

// Gera nome padronizado: AAAA-MM__Fornecedor__NF-numero__tipo__solicitacao-id.ext
function gerarNomeArquivo(purchase, tipo, originalUrl) {
  const { mes, ano } = resolverMesAno(purchase);
  const mesIdx = MESES_PT.indexOf(mes);
  const mm = String(mesIdx + 1).padStart(2, '0');
  const fornecedor = sanitize(purchase.fornecedor_nome || 'fornecedor-nao-informado');
  const nfNum = purchase.nf_numero ? `NF-${sanitize(purchase.nf_numero)}` : 'sem-nf';
  const tipoSanitized = sanitize(tipo);
  const solId = (purchase.id || 'sem-id').slice(-8);
  const ext = (originalUrl || '').split('?')[0].split('.').pop().toLowerCase().slice(0, 6) || 'bin';
  return `${ano}-${mm}__${fornecedor}__${nfNum}__${tipoSanitized}__sol-${solId}.${ext}`;
}

// Busca ou cria uma pasta pelo nome dentro de um parent
async function getOrCreateFolder(authHeader, parentId, folderName) {
  // Busca existente
  const q = encodeURIComponent(`name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)`,
    { headers: authHeader }
  );
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0];
  }
  // Cria
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  });
  return await createRes.json();
}

// Faz download de uma URL e retorna ArrayBuffer
async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falhou: ${res.status} ${url}`);
  return await res.arrayBuffer();
}

// Faz upload de um arquivo para o Drive (multipart)
async function uploadToDrive(authHeader, folderId, fileName, fileBuffer, mimeType) {
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`;
  const filePart = `${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;

  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(fileBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const body = metaPart + filePart + base64 + closeDelimiter;

  console.log(`Upload: ${fileName} (${bytes.byteLength} bytes)`);
  
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body
    }
  );
  
  if (!res.ok) {
    const err = await res.text();
    console.error(`Erro upload: ${res.status} - ${err}`);
    throw new Error(`Upload Drive falhou: ${res.status} - ${err.slice(0, 200)}`);
  }
  return await res.json();
}

// Coleta todas as URLs de arquivos da solicitação
function coletarArquivos(purchase) {
  const arquivos = [];
  const add = (url, tipo) => {
    if (url && typeof url === 'string' && url.startsWith('http')) {
      arquivos.push({ url, tipo });
    }
  };
  // PDF da nota fiscal (todas as variantes de campo)
  add(purchase.nota_fiscal_url, 'nf-pdf');
  add(purchase.nf_pdf_url, 'nf-pdf');
  // XML da nota fiscal (todas as variantes de campo)
  add(purchase.nf_xml_url, 'nf-xml');
  add(purchase.xml_url, 'nf-xml');
  add(purchase.nota_fiscal_xml_url, 'nf-xml');
  // Demais documentos
  add(purchase.arquivo_url, 'arquivo');
  add(purchase.file_url, 'arquivo');
  add(purchase.documento_url, 'documento');
  add(purchase.comprovante_url, 'comprovante');
  add(purchase.comprovante_pagamento_url, 'comprovante-pagamento');
  add(purchase.orcamento_url, 'orcamento');
  // Deduplica por URL
  const seen = new Set();
  return arquivos.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}

// Detecta mime type pela extensão
function mimeFromUrl(url) {
  const ext = (url || '').split('?')[0].split('.').pop().toLowerCase();
  const map = { pdf: 'application/pdf', xml: 'application/xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
  return map[ext] || 'application/octet-stream';
}

// Função principal de backup
export async function executarBackupDrive(base44, purchase) {
  const purchaseId = purchase.id;

  // Idempotência: já concluído
  if (purchase.drive_backup_status === 'concluido') {
    return { skipped: true, reason: 'já concluido' };
  }

  // Marca como em processamento
  await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
    drive_backup_status: 'em_processamento'
  });

  // Coleta arquivos
  const arquivos = coletarArquivos(purchase);
  if (arquivos.length === 0) {
    await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
      drive_backup_status: 'sem_arquivos'
    });
    return { skipped: true, reason: 'sem arquivos' };
  }

  // Obtém token do Drive
  let accessToken;
  try {
    const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
    accessToken = conn.accessToken;
  } catch (err) {
    await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
      drive_backup_status: 'erro',
      drive_backup_error: 'Google Drive não configurado'
    });
    return { error: 'Google Drive não configurado' };
  }

  const authHeader = { Authorization: `Bearer ${accessToken}` };

  try {
    // Garante pasta raiz notasfiscais-App dentro do ROOT_FOLDER_ID
    const rootFolder = await getOrCreateFolder(authHeader, ROOT_FOLDER_ID, ROOT_FOLDER_NAME);

    // Pasta mensal
    const { mes, ano } = resolverMesAno(purchase);
    const nomePastaMs = `${mes} ${ano}`;
    const monthFolder = await getOrCreateFolder(authHeader, rootFolder.id, nomePastaMs);

    // Faz upload de cada arquivo — idempotência: pula XML já presente em drive_backup_files
    const backupAnterior = Array.isArray(purchase.drive_backup_files) ? purchase.drive_backup_files : [];
    const uploadados = [...backupAnterior];
    for (const arquivo of arquivos) {
      // Idempotência para XML: se drive_backup_files já contém nf-xml, não reenvia
      if (arquivo.tipo === 'nf-xml' && backupAnterior.some(f => f.tipo === 'nf-xml')) {
        continue;
      }
      const nomeArquivo = gerarNomeArquivo(purchase, arquivo.tipo, arquivo.url);
      const fileBuffer = await downloadFile(arquivo.url);
      const mime = mimeFromUrl(arquivo.url);
      const uploaded = await uploadToDrive(authHeader, monthFolder.id, nomeArquivo, fileBuffer, mime);
      uploadados.push({
        name: nomeArquivo,
        fileId: uploaded.id,
        url: uploaded.webViewLink,
        tipo: arquivo.tipo,
        originalUrl: arquivo.url
      });
    }

    // Atualiza solicitação com resultado
    await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
      drive_backup_status: 'concluido',
      drive_backup_folder_id: monthFolder.id,
      drive_backup_folder_url: monthFolder.webViewLink || `https://drive.google.com/drive/folders/${monthFolder.id}`,
      drive_backup_files: uploadados,
      drive_backup_at: new Date().toISOString(),
      drive_backup_error: null
    });

    return { success: true, uploaded: uploadados.length, folderId: monthFolder.id };
  } catch (err) {
    await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
      drive_backup_status: 'erro',
      drive_backup_error: err.message || 'Erro desconhecido no backup'
    });
    return { error: err.message };
  }
}

// Handler HTTP — aceita chamada direta (admin) ou via functions.invoke (service role sem user)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { purchaseId } = body;

    // Quando chamado via functions.invoke (service role), não há user session
    // Quando chamado diretamente pelo admin via HTTP, valida o usuário
    let isServiceCall = false;
    try {
      const user = await base44.auth.me();
      if (!user) { isServiceCall = true; }
      else if (user.role !== 'admin') {
        // Permite se chamado com purchaseId (invocação interna)
        if (!purchaseId) return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch (_) {
      isServiceCall = true; // invocação interna sem sessão de usuário
    }

    if (purchaseId) {
      // Backup de uma solicitação específica
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      const result = await executarBackupDrive(base44, purchase);
      return Response.json({ success: true, result });
    }

    // Reprocessa em lote de 10 para evitar timeout (504)
    const cursor = parseInt(body.cursor, 10) || 0;
    const loteSize = 10;
    
    console.log(`Buscando lote ${cursor}...`);
    
    // Busca TODAS as aprovadas, depois filtra as sem backup
    const todas = await base44.asServiceRole.entities.PurchaseRequest.filter(
      { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADO', 'PAGO'] } },
      '-approved_at',
      loteSize + 1,
      cursor
    );
    
    console.log(`Encontradas ${todas?.length || 0} solicitações aprovadas`);
    
    if (!todas || todas.length === 0) {
      return Response.json({ success: true, total_candidatos: 0, processados: 0, resultados: [], concluido: true });
    }
    
    // Filtra apenas as pendentes de backup
    const pendentes = todas.filter(p =>
      !p.drive_backup_status || p.drive_backup_status === 'pendente' || p.drive_backup_status === 'erro'
    );

    console.log(`Lote ${cursor}: ${pendentes.length} pendentes de backup`);
    const resultados = [];
    for (const p of pendentes) {
      console.log(`Processando: ${p.id} - ${p.fornecedor_nome}`);
      const r = await executarBackupDrive(base44, p);
      resultados.push({ id: p.id, fornecedor: p.fornecedor_nome, result: r });
    }

    const proximoCursor = cursor + loteSize;
    const temMais = todas.length > loteSize;

    return Response.json({ 
      success: true, 
      total_candidatos: pendentes.length, 
      processados: resultados.length, 
      resultados,
      cursor: proximoCursor,
      temMais,
      mensagem: temMais ? `Continue com cursor=${proximoCursor}` : 'Processamento concluído'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});