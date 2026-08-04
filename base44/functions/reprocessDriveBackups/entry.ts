import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DRIVE_ROOT_FOLDER_ID = '1aJ5nfpgXcpu6SrDVecmhIQ2eq4vexqe3';
const DRIVE_ROOT_FOLDER_NAME = 'notasfiscais-App';
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const APPROVED_STATUSES = new Set(['APROVADO_COORD','APROVADO_ADMIN','APROVADO','PAGO']);

function resolverMesAno(purchase) {
  for (const campo of ['competencia','nf_data_emissao','created_date','approved_at']) {
    const v = purchase[campo];
    if (v) { const d = new Date(v); if (!isNaN(d.getTime())) return { mes: MESES_PT[d.getMonth()], ano: d.getFullYear() }; }
  }
  const now = new Date(); return { mes: MESES_PT[now.getMonth()], ano: now.getFullYear() };
}

function sanitizeStr(s) { return (s||'').replace(/[^a-zA-Z0-9À-ÿ\-_]/g,'_').replace(/_+/g,'_').slice(0,60); }

function gerarNomeArquivo(purchase, tipo, url) {
  const { mes, ano } = resolverMesAno(purchase);
  const mm = String(MESES_PT.indexOf(mes)+1).padStart(2,'0');
  const fornecedor = sanitizeStr(purchase.fornecedor_nome||'fornecedor-nao-informado');
  const nfNum = purchase.nf_numero ? `NF-${sanitizeStr(purchase.nf_numero)}` : 'sem-nf';
  const solId = (purchase.id||'sem-id').slice(-8);
  const ext = (url||'').split('?')[0].split('.').pop()?.toLowerCase().slice(0,6)||'bin';
  return `${ano}-${mm}__${fornecedor}__${nfNum}__${sanitizeStr(tipo)}__sol-${solId}.${ext}`;
}

async function driveGetOrCreateFolder(authHeader, parentId, folderName) {
  const q = encodeURIComponent(`name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)`, { headers: authHeader });
  const d = await r.json();
  if (d.files?.length > 0) return d.files[0];
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  return await cr.json();
}

async function driveUploadFile(authHeader, folderId, fileName, fileUrl) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
  const buf = await res.arrayBuffer();
  const ext = (fileUrl.split('?')[0].split('.').pop()||'').toLowerCase();
  const mimeMap = { pdf:'application/pdf', xml:'application/xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg' };
  const mime = mimeMap[ext] || 'application/octet-stream';
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = 'boundary314159';
  const bytes = new Uint8Array(buf);
  let binary = ''; for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const body = `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
  const ur = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST', headers: { ...authHeader, 'Content-Type': `multipart/related; boundary="${boundary}"` }, body
  });
  if (!ur.ok) { const e = await ur.text(); throw new Error(`Upload Drive: ${ur.status} - ${e.slice(0,200)}`); }
  return await ur.json();
}

function coletarUrlsArquivos(purchase) {
  const pares = [];
  const add = (url, tipo) => { if (url && typeof url === 'string' && url.startsWith('http')) pares.push({ url, tipo }); };
  add(purchase.nota_fiscal_url, 'nf-pdf');
  add(purchase.nf_pdf_url, 'nf-pdf');
  add(purchase.arquivo_url, 'arquivo');
  add(purchase.file_url, 'arquivo');
  add(purchase.documento_url, 'documento');
  add(purchase.comprovante_url, 'comprovante');
  add(purchase.comprovante_pagamento_url, 'comprovante-pagamento');
  add(purchase.orcamento_url, 'orcamento');
  const seen = new Set();
  return pares.filter(a => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
}

async function executarBackup(base44, purchase) {
  if (purchase.drive_backup_status === 'concluido') return { skipped: true, reason: 'ja concluido' };

  const arquivos = coletarUrlsArquivos(purchase);
  if (arquivos.length === 0) {
    await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, { drive_backup_status: 'sem_arquivos' });
    return { skipped: true, reason: 'sem arquivos' };
  }

  await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, { drive_backup_status: 'em_processamento' });

  let accessToken;
  try {
    const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
    accessToken = conn.accessToken;
  } catch (err) {
    await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
      drive_backup_status: 'erro',
      drive_backup_error: 'Google Drive não configurado'
    });
    return { error: 'Google Drive não configurado' };
  }

  try {
    const authHeader = { Authorization: `Bearer ${accessToken}` };
    const rootFolder = await driveGetOrCreateFolder(authHeader, DRIVE_ROOT_FOLDER_ID, DRIVE_ROOT_FOLDER_NAME);
    const { mes, ano } = resolverMesAno(purchase);
    const monthFolder = await driveGetOrCreateFolder(authHeader, rootFolder.id, `${mes} ${ano}`);

    const uploadados = [];
    for (const arq of arquivos) {
      const nome = gerarNomeArquivo(purchase, arq.tipo, arq.url);
      const uploaded = await driveUploadFile(authHeader, monthFolder.id, nome, arq.url);
      uploadados.push({ name: nome, fileId: uploaded.id, url: uploaded.webViewLink, tipo: arq.tipo });
    }

    await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
      drive_backup_status: 'concluido',
      drive_backup_folder_id: monthFolder.id,
      drive_backup_folder_url: monthFolder.webViewLink || `https://drive.google.com/drive/folders/${monthFolder.id}`,
      drive_backup_files: uploadados,
      drive_backup_at: new Date().toISOString(),
      drive_backup_error: null
    });
    return { success: true, uploaded: uploadados.length };
  } catch (err) {
    await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
      drive_backup_status: 'erro',
      drive_backup_error: err?.message || 'Erro desconhecido'
    });
    return { error: err?.message };
  }
}

// Backup em lote das PurchaseRequests aprovadas/pagas sem backup concluído no Drive.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { purchaseId } = body;

    if (purchaseId) {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });
      const result = await executarBackup(base44, purchase);
      return Response.json({ success: true, result });
    }

    // Reprocessa todas aprovadas/pagas com backup pendente ou erro
    const todas = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
    const pendentes = (todas || []).filter(p =>
      APPROVED_STATUSES.has(p.status) &&
      (!p.drive_backup_status || p.drive_backup_status === 'pendente' || p.drive_backup_status === 'erro')
    );

    console.log(`Reprocessando ${pendentes.length} solicitações...`);
    const resultados = [];
    for (const p of pendentes) {
      const r = await executarBackup(base44, p);
      resultados.push({ id: p.id, fornecedor: p.fornecedor_nome, result: r });
      console.log(`${p.id}: ${JSON.stringify(r)}`);
    }

    return Response.json({
      success: true,
      total_candidatos: pendentes.length,
      resultados
    });
  } catch (error) {
    console.error('reprocessDriveBackups error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});