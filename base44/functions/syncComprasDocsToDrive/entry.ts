import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncComprasDocsToDrive — Sincroniza documentos da aba Compras para o Google Drive.
 *
 * Estrutura de pastas:
 *   ROOT/
 *     Compras/
 *       {Mês Ano}/        ex: "Maio 2026"
 *         Notas Fiscais/
 *         XML/
 *         Recibos e Comprovantes/
 *         Outros/
 *
 * Renomeação automática:
 *   NF:          NF {numero} - {fornecedor} - {rubrica} - {centro} - R$ {valor} - {competencia}.pdf
 *   XML:         XML NF {numero} - {fornecedor} - {rubrica} - {centro} - R$ {valor} - {competencia}.xml
 *   Comprovante: COMPROVANTE NF {numero} - {fornecedor} - {centro} - R$ {valorNF} - {competencia}.pdf
 *   Outros:      {nome_original}
 *
 * Pode ser chamada com:
 *   - { purchase_id }  → sincroniza todos os attachments dessa compra
 *   - { attachment_id } → sincroniza somente esse attachment
 *   - { trigger: 'approved', purchase_id } → idem, mas registra que foi por aprovação
 */

const ROOT_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';
const CACHE_KEY_PREFIX = 'compras_drive_folder__';
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(v, maxLen = 60) {
  return String(v || '').trim().replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').slice(0, maxLen) || 'Sem_Nome';
}

function fmtBRL(valor) {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n) || n === 0) return '';
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

function getMesAno(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function detectTipoDoc(attachment) {
  const nfTipo = String(attachment?.nf_tipo_documento || '').toLowerCase();
  const mime = String(attachment?.file_type || '').toLowerCase();
  const name = String(attachment?.file_name || '').toLowerCase();
  const desc = String(attachment?.description || '').toLowerCase();
  const categoria = String(attachment?.categoria || '').toLowerCase();

  if (nfTipo === 'xml_nf' || mime.includes('xml') || name.endsWith('.xml')) return 'XML';

  const isRecibo = [desc, name, categoria].some(s =>
    s.includes('recibo') || s.includes('comprovante') || s.includes('pagamento') ||
    s.includes('boleto') || s.includes('pix') || s.includes('deposito')
  );
  if (isRecibo) return 'RECIBO';

  if (nfTipo === 'pdf_nf' || (attachment?.nf_numero && name.endsWith('.pdf'))) return 'NF_PDF';
  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    if (attachment?.nf_numero || attachment?.nf_emitente_nome || attachment?.nf_valor_total) return 'NF_PDF';
    return 'OUTRO_PDF';
  }

  return 'OUTRO';
}

function buildFileName(tipoDoc, attachment, purchase, rubrica) {
  const nfNum = sanitize(attachment?.nf_numero || purchase?.nf_numero || '', 20);
  const fornecedor = sanitize(
    attachment?.nf_emitente_nome || purchase?.fornecedor_nome || purchase?.nf_emitente_nome || 'SemFornecedor', 40
  );
  const rubricaNome = sanitize(rubrica?.rubrica || purchase?.rubrica_nome || purchase?.categoria || 'SemRubrica', 30);
  const centro = sanitize(purchase?.centro_custo || 'SemCentro', 20);

  // Valor da NF (preferência: attachment → purchase)
  const valorNF = Number(
    attachment?.nf_valor_total || purchase?.nf_valor_total ||
    purchase?.valor_pago || purchase?.valor_aprovado_admin ||
    purchase?.valor_aprovado || purchase?.valor_solicitado || 0
  );
  const valorStr = valorNF > 0 ? `R$ ${valorNF.toFixed(2).replace('.', ',')}` : '';

  // Competência: data de emissão ou mês de referência
  const competenciaRaw = attachment?.nf_data_emissao || purchase?.data_pagamento_efetivo || attachment?.created_date || '';
  const competencia = competenciaRaw ? getMesAno(competenciaRaw) : '';

  const parts = (arr) => arr.filter(Boolean).join(' - ');

  const ext = tipoDoc === 'XML' ? '.xml' : '.pdf';

  if (tipoDoc === 'NF_PDF') {
    return `NF ${parts([nfNum, fornecedor, rubricaNome, centro, valorStr, competencia])}${ext}`;
  }
  if (tipoDoc === 'XML') {
    return `XML NF ${parts([nfNum, fornecedor, rubricaNome, centro, valorStr, competencia])}${ext}`;
  }
  if (tipoDoc === 'RECIBO') {
    // Valor no nome do comprovante = valor da NF vinculada
    return `COMPROVANTE NF ${parts([nfNum, fornecedor, centro, valorStr, competencia])}${ext}`;
  }

  // Fallback: nome original
  return attachment?.file_name || `documento${ext}`;
}

function getSubfolder(tipoDoc) {
  if (tipoDoc === 'NF_PDF') return 'Notas Fiscais';
  if (tipoDoc === 'XML') return 'XML';
  if (tipoDoc === 'RECIBO') return 'Recibos e Comprovantes';
  return 'Outros';
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function listChildren(accessToken, parentId) {
  const q = encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.files || [];
}

async function createFolder(accessToken, name, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const data = await res.json();
  if (data.error) throw new Error(`Erro ao criar pasta "${name}": ${data.error.message}`);
  return data.id;
}

// Cache de IDs de pasta via AuditLog para evitar chamadas redundantes
async function getOrCreateFolder(base44, accessToken, name, parentId) {
  const cacheKey = `${CACHE_KEY_PREFIX}${parentId}__${name}`;

  const cached = await base44.asServiceRole.entities.AuditLog
    .filter({ details: cacheKey }).catch(() => []);

  if (cached?.length > 0 && cached[0].entity_id?.length > 10) {
    return cached[0].entity_id;
  }

  const children = await listChildren(accessToken, parentId);
  const existing = children.find(f => f.name === name);
  const folderId = existing ? existing.id : await createFolder(accessToken, name, parentId);

  await base44.asServiceRole.entities.AuditLog.create({
    action: 'CREATE',
    entity_type: 'ATTACHMENT',
    entity_id: folderId,
    actor_email: 'system',
    actor_name: 'Compras Drive Sync',
    details: cacheKey,
  }).catch(() => null);

  return folderId;
}

async function resolveComprasFolder(base44, accessToken, mesAno, subfolder) {
  const comprasRoot = await getOrCreateFolder(base44, accessToken, 'Compras', ROOT_FOLDER_ID);
  const mesFolder = await getOrCreateFolder(base44, accessToken, mesAno, comprasRoot);
  return await getOrCreateFolder(base44, accessToken, subfolder, mesFolder);
}

async function uploadFileToDrive(accessToken, blob, name, folderId) {
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name, parents: [folderId] })], { type: 'application/json' }));
  formData.append('file', blob, name);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData
  });
  const data = await res.json();
  if (data.error) throw new Error('Upload error: ' + data.error.message);
  return data.id;
}

async function patchFileDrive(accessToken, fileId, blob, name) {
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify({ name })], { type: 'application/json' }));
  formData.append('file', blob, name);
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData
  });
  const data = await res.json();
  if (data.error) throw new Error('Patch error: ' + data.error.message);
  return data.id;
}

async function deleteFileDrive(accessToken, fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

// ── Sincronizar um único attachment ───────────────────────────────────────────

async function syncAttachment(base44, accessToken, attachment, purchase, rubrica) {
  if (!attachment?.file_url) {
    return { skipped: true, reason: 'sem_url', id: attachment?.id };
  }

  const tipoDoc = detectTipoDoc(attachment);

  // Recibo: NÃO gera solicitação nem debita rubrica — mas faz backup normalmente
  // Apenas vinculamos como anexo complementar

  const mesAno = getMesAno(attachment?.nf_data_emissao || attachment?.created_date);
  const subfolder = getSubfolder(tipoDoc);
  const newName = buildFileName(tipoDoc, attachment, purchase, rubrica);

  // Baixar arquivo
  const fileResp = await fetch(attachment.file_url);
  if (!fileResp.ok) return { skipped: true, reason: 'download_falhou', id: attachment.id };

  const sizeHeader = fileResp.headers.get('content-length');
  if (sizeHeader && parseInt(sizeHeader, 10) > MAX_SIZE_BYTES) {
    return { skipped: true, reason: 'arquivo_muito_grande', id: attachment.id };
  }

  const blob = await fileResp.blob();
  const buffer = await blob.arrayBuffer();
  const newHash = await sha256Hex(new Uint8Array(buffer));

  // Hash idêntico e já tem drive_file_id → skip
  if (attachment.backup_done && attachment.drive_file_id && attachment.file_hash === newHash) {
    return { skipped: true, reason: 'hash_identico', id: attachment.id, drive_file_id: attachment.drive_file_id };
  }

  const now = new Date().toISOString();
  let driveFileId;
  let action;

  if (attachment.drive_file_id && attachment.backup_done) {
    // Se mudou de pasta/nome → deletar antigo e subir de novo
    const oldFolderId = attachment.drive_folder_id;
    const targetFolderId = await resolveComprasFolder(base44, accessToken, mesAno, subfolder);

    if (oldFolderId && oldFolderId !== targetFolderId) {
      // Deletar versão antiga para evitar duplicidade
      await deleteFileDrive(accessToken, attachment.drive_file_id).catch(() => null);
      driveFileId = await uploadFileToDrive(accessToken, blob, newName, targetFolderId);
      action = 'substituido';
    } else {
      // Mesmo folder: só atualiza conteúdo/nome
      driveFileId = await patchFileDrive(accessToken, attachment.drive_file_id, blob, newName);
      action = 'atualizado';
    }
  } else {
    // Novo upload
    const targetFolderId = await resolveComprasFolder(base44, accessToken, mesAno, subfolder);
    driveFileId = await uploadFileToDrive(accessToken, blob, newName, targetFolderId);
    action = 'enviado';
  }

  const driveLink = `https://drive.google.com/file/d/${driveFileId}/view`;

  // Atualizar attachment
  await base44.asServiceRole.entities.Attachment.update(attachment.id, {
    backup_done: true,
    drive_file_id: driveFileId,
    drive_folder_id: await resolveComprasFolder(base44, accessToken, mesAno, subfolder).catch(() => null),
    backup_date: now,
    file_hash: newHash,
    last_synced_at: now,
    nf_nome_renomeado: newName,
  }).catch(() => null);

  return {
    success: true,
    action,
    id: attachment.id,
    tipo: tipoDoc,
    drive_file_id: driveFileId,
    drive_link: driveLink,
    nome_no_drive: newName,
    pasta: `Compras/${mesAno}/${subfolder}`,
  };
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: aceitar chamada de automação (sem user) ou user admin
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    const body = await req.json().catch(() => ({}));

    // Suporte a payload de automação de entidade
    const purchaseId = body?.purchase_id || body?.data?.id || body?.event?.entity_id;
    const attachmentId = body?.attachment_id;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // ── Modo: attachment único ────────────────────────────────────────────────
    if (attachmentId && !purchaseId) {
      const attachment = await base44.asServiceRole.entities.Attachment.get(attachmentId).catch(() => null);
      if (!attachment) return Response.json({ error: 'Attachment não encontrado' }, { status: 404 });

      // Buscar compra vinculada
      const linkedPurchaseId = attachment.purchase_request_id || attachment.purchase_id || attachment.solicitacao_id;
      let purchase = null;
      let rubrica = null;
      if (linkedPurchaseId) {
        purchase = await base44.asServiceRole.entities.PurchaseRequest.get(linkedPurchaseId).catch(() => null);
        if (purchase?.rubrica_id) {
          rubrica = await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id).catch(() => null);
        }
      }

      const result = await syncAttachment(base44, accessToken, attachment, purchase, rubrica);
      return Response.json(result);
    }

    // ── Modo: todos os attachments de uma compra ──────────────────────────────
    if (purchaseId) {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId).catch(() => null);
      if (!purchase) return Response.json({ error: 'PurchaseRequest não encontrada' }, { status: 404 });

      // Só sincronizar compras aprovadas
      const statusAprovados = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
      if (!statusAprovados.has(String(purchase.status || '').toUpperCase())) {
        return Response.json({ skipped: true, reason: 'compra_nao_aprovada', status: purchase.status });
      }

      let rubrica = null;
      if (purchase.rubrica_id) {
        rubrica = await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id).catch(() => null);
      }

      // Buscar todos os attachments vinculados a esta compra
      const allAttachments = await base44.asServiceRole.entities.Attachment
        .filter({ purchase_request_id: purchaseId }).catch(() => []);

      // Também buscar por report_id (fallback)
      const byReportId = purchase?.report_id
        ? await base44.asServiceRole.entities.Attachment.filter({ report_id: purchaseId }).catch(() => [])
        : [];

      // Dedup
      const attMap = new Map();
      [...allAttachments, ...byReportId].forEach(a => { if (a?.id) attMap.set(a.id, a); });

      // Incluir URLs diretas da compra como attachments sintéticos se não tiver attachment
      if (attMap.size === 0) {
        const syntheticUrls = [
          purchase.nota_fiscal_url && { id: `synth_nf_${purchaseId}`, file_url: purchase.nota_fiscal_url, file_name: `NF_${purchaseId}.pdf`, nf_tipo_documento: 'pdf_nf', nf_numero: purchase.nf_numero, nf_emitente_nome: purchase.fornecedor_nome, nf_valor_total: purchase.nf_valor_total, created_date: purchase.created_date, purchase_request_id: purchaseId },
          purchase.nf_pdf_url && { id: `synth_nfpdf_${purchaseId}`, file_url: purchase.nf_pdf_url, file_name: `NF_PDF_${purchaseId}.pdf`, nf_tipo_documento: 'pdf_nf', nf_numero: purchase.nf_numero, nf_emitente_nome: purchase.fornecedor_nome, nf_valor_total: purchase.nf_valor_total, created_date: purchase.created_date, purchase_request_id: purchaseId },
          purchase.comprovante_url && { id: `synth_comp_${purchaseId}`, file_url: purchase.comprovante_url, file_name: `COMPROVANTE_${purchaseId}.pdf`, description: 'comprovante pagamento', created_date: purchase.created_date, purchase_request_id: purchaseId },
          purchase.comprovante_pagamento_url && { id: `synth_comppag_${purchaseId}`, file_url: purchase.comprovante_pagamento_url, file_name: `COMPROVANTE_PAG_${purchaseId}.pdf`, description: 'comprovante pagamento', created_date: purchase.created_date, purchase_request_id: purchaseId },
        ].filter(Boolean);
        syntheticUrls.forEach(a => attMap.set(a.id, a));
      }

      if (attMap.size === 0) {
        return Response.json({ skipped: true, reason: 'sem_attachments', purchase_id: purchaseId });
      }

      const results = [];
      for (const att of attMap.values()) {
        const r = await syncAttachment(base44, accessToken, att, purchase, rubrica);
        results.push(r);
      }

      return Response.json({
        success: true,
        purchase_id: purchaseId,
        total: results.length,
        enviados: results.filter(r => r.success).length,
        ignorados: results.filter(r => r.skipped).length,
        results,
      });
    }

    return Response.json({ error: 'Informe purchase_id ou attachment_id' }, { status: 400 });

  } catch (error) {
    console.error('Erro syncComprasDocsToDrive:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});