import { createClientFromRequest } from 'npm:@base44/sdk@0.8.34';

const DEFAULT_PARENT_FOLDER_ID = '1aJ5nfpgXcpu6SrDVecmhIQ2eq4vexqe3';
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const BATCH_SIZE = 10;
const MAX_LOOPS = 50;
const SKIP_HOURS = 24;

function safeStr(value: unknown) {
  return String(value || '').trim();
}

function normalizeText(value: unknown) {
  return safeStr(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function parseValor(value: unknown) {
  const raw = safeStr(value).replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(raw.replace(',', '.')) || 0;
}

function formatValor(value: unknown) {
  return parseValor(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function limparNomeArquivo(v: unknown) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim();
}

function normalizarCentroCusto(v: unknown) {
  const raw = safeStr(v).toUpperCase();
  if (raw.includes('MHAB')) return 'MHAB';
  if (raw.includes('MIS')) return 'MIS';
  if (raw.includes('MUMO')) return 'MUMO';
  if (raw.includes('NOTURNO')) return 'NOTURNO';
  if (raw.includes('PUBLICAC')) return 'PUBLICACOES';
  return 'GERAL';
}

function getDateValue(value: unknown) {
  const raw = safeStr(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getMesFolderName(reference: unknown) {
  const date = getDateValue(reference) || new Date();
  return `${MESES[date.getMonth()] || 'MES'}_${date.getFullYear()}`;
}

function getExt(filename: unknown, fallback = 'pdf') {
  const ext = safeStr(filename).split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || ext === 'xml') return ext;
  return fallback;
}

const MUSEUS_VALIDOS_BACKUP = ['MIS', 'MUMO', 'MHAB'];

/**
 * Detecta o tipo de documento complementar a partir dos metadados do attachment ou intake.
 * Retorna 'RECIBO', 'COMPROVANTE' ou null (se for NF normal).
 */
function detectTipoComplementar(attachment: any, context: any = {}): string | null {
  // Tipo explícito salvo pela IA
  const tipoIa = normalizeText(
    attachment?.tipo_documento_complementar ||
    context?.tipo_documento_complementar ||
    attachment?.resultado_ia?.tipo_documento_complementar ||
    ''
  );
  if (tipoIa.includes('RECIBO')) return 'RECIBO';
  if (tipoIa.includes('COMPROVANTE') || tipoIa.includes('PAGAMENTO')) return 'COMPROVANTE';

  // Heurística pelo nome/descrição do arquivo
  const haystack = normalizeText([
    attachment?.file_name,
    attachment?.nf_nome_original,
    attachment?.nf_nome_renomeado,
    attachment?.description,
    attachment?.categoria,
  ].filter(Boolean).join(' '));

  if (haystack.includes('RECIBO')) return 'RECIBO';
  if (haystack.includes('COMPROVANTE') || haystack.includes('PIX') || haystack.includes('TED') || haystack.includes('BOLETO') || haystack.includes('TRANSFERENCIA') || haystack.includes('PAGAMENTO')) return 'COMPROVANTE';

  return null;
}

/**
 * Sanitiza preservando espaços e hífens (para nomes legíveis).
 */
function sanitizeReadable(v: unknown, max = 60): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .substring(0, max).trim();
}

/**
 * Verifica se a PR é de equipe/pessoal (usa TeamMember vinculado).
 */
function ehEquipe(pr: any): boolean {
  const cat = normalizeText(pr?.categoria || '');
  return cat.includes('EQUIPE') || cat.includes('COORDENACAO') || cat.includes('PESSOAL');
}

/**
 * Resolve o nome de exibição oficial:
 *  - Equipe (categoria含 equipe/coordenação/pessoal): {empresa} - {pessoa} - {funcao}
 *  - Fornecedor: fornecedor_nome ou nf_emitente_nome
 * Busca TeamMember por team_payment_id, fornecedor_id ou user_name.
 */
async function resolveNomeExibicao(base44: any, pr: any): Promise<string> {
  const fornecedor = safeStr(pr?.fornecedor_nome || pr?.nf_emitente_nome || 'FORNECEDOR');

  if (!ehEquipe(pr)) {
    return sanitizeReadable(fornecedor, 60) || 'FORNECEDOR';
  }

  let teamMember: any = null;
  try {
    if (pr?.team_payment_id) {
      teamMember = await safeGet(base44.asServiceRole.entities.TeamMember, pr.team_payment_id);
    }
    if (!teamMember && pr?.fornecedor_id) {
      const byForn = await safeFilter(
        base44.asServiceRole.entities.TeamMember,
        { fornecedor_id: pr.fornecedor_id },
        '-created_date',
        5
      );
      teamMember = byForn?.[0] || null;
    }
    if (!teamMember) {
      const byName = await safeFilter(
        base44.asServiceRole.entities.TeamMember,
        { user_name: fornecedor },
        '-created_date',
        5
      );
      teamMember = byName?.[0] || null;
    }
  } catch { /* ignore */ }

  if (!teamMember) {
    return sanitizeReadable(fornecedor, 60) || 'FORNECEDOR';
  }

  const empresa = sanitizeReadable(teamMember.empresa_nome || '', 40);
  const pessoa = sanitizeReadable(teamMember.user_name || fornecedor, 40);
  const funcao = sanitizeReadable(teamMember.funcao || teamMember.role || '', 30);
  const partes = [empresa, pessoa, funcao].filter(Boolean);

  return partes.join(' - ').substring(0, 120) || sanitizeReadable(fornecedor, 60);
}

/**
 * Padrão oficial unificado (usado por novos backups E migração):
 *   NF {num} {descricao} - {nomeExibicao} - MUSEUS CENTRO - R$ {valor}.{ext}
 * nomeExibicao resolvido pelo chamador (resolveNomeExibicao) e passado via context.nome_exibicao.
 * Equipe: "PERINI PROJETOS - Daniel Perini - Coordenador"
 * Fornecedor: nome do fornecedor / emitente
 * XML usa prefixo XML; comprovante usa COMP NF.
 */
function buildFileName(attachment: any, context: any = {}) {
  const tipoComplementar = detectTipoComplementar(attachment, context);

  const current = safeStr(attachment?.nf_nome_renomeado || attachment?.nome_padronizado_ia || attachment?.file_name);
  const ext = getExt(current, attachment?.nf_tipo_documento === 'xml_nf' ? 'xml' : 'pdf');

  // Número da NF
  const nfNumeroRef = safeStr(attachment?.nf_numero_referenciado || context?.nf_numero_referenciado || '');
  const nfNumero = safeStr(attachment?.nf_numero || context?.nf_numero || 'SN');
  const numero = nfNumeroRef || nfNumero;

  // Descrição curta (natureza/categoria)
  const descricaoRaw = safeStr(
    context?.natureza_despesa || attachment?.rubrica_nome || context?.rubrica_nome || context?.categoria || ''
  );
  const descricao = sanitizeReadable(descricaoRaw, 30) || 'Geral';

  // Nome de exibição (fornecedor ou empresa+pessoa+funcao)
  const nomeExibicao = safeStr(context?.nome_exibicao || attachment?.nome_exibicao || 'FORNECEDOR');

  const valor = formatValor(attachment?.nf_valor_total || context?.valor_solicitado || context?.valor || 0);

  const prefixo = tipoComplementar ? 'COMP NF' : (ext === 'xml' ? 'XML' : 'NF');

  const nome = `${prefixo} ${numero} ${descricao} - ${nomeExibicao} - MUSEUS CENTRO - R$ ${valor}.${ext}`;

  // Sanitizar caracteres inválidos preservando espaços, hífens e R$
  return nome.replace(/[\\/;?*"'\[\]{}\(\)]/g, '').replace(/\s+/g, ' ').trim();
}

async function safeGet(entity: any, id: string) {
  if (!entity || !id) return null;
  try { return await entity.get(id); } catch { return null; }
}

async function safeFilter(entity: any, filter: Record<string, unknown>, order = '-created_date', limit = 1000) {
  if (!entity?.filter) return [];
  try {
    const data = await entity.filter(filter, order, limit);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function safeUpdate(entity: any, id: string, payload: Record<string, unknown>) {
  if (!entity?.update || !id) return null;
  try { return await entity.update(id, payload); } catch (error) {
    console.warn(`Falha ao atualizar ${id}:`, error?.message || error);
    return null;
  }
}

async function resolvePurchaseRequest(base44: any, body: any) {
  if (body.purchase_request_id) {
    const pr = await safeGet(base44.asServiceRole.entities.PurchaseRequest, body.purchase_request_id);
    if (pr) return pr;
  }

  if (body.document_intake_id) {
    const intake = await safeGet(base44.asServiceRole.entities.DocumentIntake, body.document_intake_id);
    if (intake?.entidade_destino === 'PurchaseRequest' && intake?.entidade_destino_id) {
      const pr = await safeGet(base44.asServiceRole.entities.PurchaseRequest, intake.entidade_destino_id);
      if (pr) return pr;
    }
  }

  const nfNumero = safeStr(body.nf_numero);
  if (nfNumero) {
    const list = await safeFilter(base44.asServiceRole.entities.PurchaseRequest, { nf_numero: nfNumero }, '-created_date', 20);
    if (list[0]) return list[0];
  }

  return null;
}

function similarNF(a: any, b: any) {
  const nfA = normalizeText(a?.nf_numero || a?.numero_nf || a?.observacoes);
  const nfB = normalizeText(b?.nf_numero || b?.numero_nf || b?.observacoes);
  if (nfA && nfB && (nfA.includes(nfB) || nfB.includes(nfA))) return true;

  const cnpjA = normalizeText(a?.fornecedor_cnpj || a?.nf_emitente_cpf_cnpj);
  const cnpjB = normalizeText(b?.nf_emitente_cpf_cnpj || b?.fornecedor_cnpj);
  const valorA = parseValor(a?.valor_solicitado || a?.valor || a?.nf_valor_total);
  const valorB = parseValor(b?.nf_valor_total || b?.valor_solicitado || b?.valor);
  return !!cnpjA && !!cnpjB && cnpjA === cnpjB && Math.abs(valorA - valorB) < 0.01;
}

async function resolveAttachments(base44: any, body: any, pr: any) {
  const attachmentMap = new Map<string, any>();

  async function addAttachment(id: string) {
    const attachment = await safeGet(base44.asServiceRole.entities.Attachment, id);
    if (attachment?.id) attachmentMap.set(attachment.id, attachment);
  }

  if (body.attachment_id) await addAttachment(body.attachment_id);

  if (body.document_intake_id) {
    const intake = await safeGet(base44.asServiceRole.entities.DocumentIntake, body.document_intake_id);
    if (intake?.entidade_destino === 'Attachment' && intake?.entidade_destino_id) await addAttachment(intake.entidade_destino_id);
    if (intake?.entidade_destino === 'PurchaseRequest' && intake?.entidade_destino_id && !pr) pr = await safeGet(base44.asServiceRole.entities.PurchaseRequest, intake.entidade_destino_id);
  }

  if (pr?.id) {
    const byPr = await safeFilter(base44.asServiceRole.entities.Attachment, { purchase_request_id: pr.id }, '-created_date', 100);
    byPr.forEach((a: any) => a?.id && attachmentMap.set(a.id, a));
  }

  const nfNumero = safeStr(body.nf_numero || pr?.nf_numero || pr?.observacoes?.match?.(/NF\s+([^\s-]+)/i)?.[1]);
  if (nfNumero) {
    const byNF = await safeFilter(base44.asServiceRole.entities.Attachment, { nf_numero: nfNumero }, '-created_date', 100);
    byNF.forEach((a: any) => a?.id && attachmentMap.set(a.id, a));
  }

  // Buscar documentos complementares (recibos/comprovantes) vinculados à NF
  if (pr?.id || body.nf_numero) {
    const nfNum = safeStr(pr?.nf_numero || body.nf_numero);
    const cnpjForn = safeStr(pr?.fornecedor_cnpj || pr?.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
    const [compByNfRef, compByCnpj] = await Promise.all([
      nfNum ? safeFilter(base44.asServiceRole.entities.Attachment, { nf_numero_referenciado: nfNum }, '-created_date', 50) : Promise.resolve([]),
      cnpjForn ? safeFilter(base44.asServiceRole.entities.Attachment, { nf_emitente_cpf_cnpj: cnpjForn }, '-created_date', 100) : Promise.resolve([]),
    ]);
    for (const a of [...compByNfRef, ...compByCnpj]) {
      if (a?.id && (a.tipo_documento_complementar || detectTipoComplementar(a, {}))) {
        attachmentMap.set(a.id, a);
      }
    }
  }

  return Array.from(attachmentMap.values()).filter((attachment) => {
    const isNF = attachment?.nf_categoria === 'nota_fiscal' || ['pdf_nf', 'xml_nf'].includes(attachment?.nf_tipo_documento) || safeStr(attachment?.file_name).toLowerCase().endsWith('.pdf') || safeStr(attachment?.file_name).toLowerCase().endsWith('.xml');
    const isComplementar = !!(attachment?.tipo_documento_complementar || detectTipoComplementar(attachment, {}));
    return (isNF || isComplementar) && (!pr || similarNF(pr, attachment) || isComplementar);
  });
}

async function getGoogleDrive(base44: any) {
  const integrations = base44.asServiceRole?.integrations || base44.integrations || {};
  return integrations.GoogleDrive || integrations.googleDrive || integrations.Drive || integrations.Google || null;
}

async function findOrCreateFolder(drive: any, name: string, parentId: string) {
  if (!drive) return { id: '', name, simulated: true };
  try {
    if (drive.findFolder) {
      const existing = await drive.findFolder({ name, parent_id: parentId });
      if (existing?.id) return existing;
    }
    if (drive.searchFiles) {
      const res = await drive.searchFiles({ q: `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`, limit: 1 });
      const item = Array.isArray(res) ? res[0] : res?.files?.[0];
      if (item?.id) return item;
    }
    if (drive.createFolder) return await drive.createFolder({ name, parent_id: parentId });
    if (drive.createFile) return await drive.createFile({ name, parent_id: parentId, mime_type: 'application/vnd.google-apps.folder' });
  } catch (error) {
    console.warn('Falha ao criar/localizar pasta Drive:', error?.message || error);
  }
  return { id: '', name, simulated: true };
}

async function findDriveFile(drive: any, name: string, folderId: string) {
  if (!drive || !folderId) return null;
  try {
    if (drive.searchFiles) {
      const res = await drive.searchFiles({ q: `name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`, limit: 1 });
      return Array.isArray(res) ? res[0] : res?.files?.[0] || null;
    }
  } catch (error) {
    console.warn('Falha ao buscar arquivo no Drive:', error?.message || error);
  }
  return null;
}

async function uploadDriveFile(drive: any, attachment: any, fileName: string, folderId: string) {
  if (!drive || !folderId) return { id: '', name: fileName, simulated: true };
  const existing = await findDriveFile(drive, fileName, folderId);
  if (existing?.id) return existing;
  const fileUrl = attachment?.file_url || attachment?.url || attachment?.arquivo_original_url || attachment?.download_url;
  try {
    if (drive.uploadFile) return await drive.uploadFile({ file_url: fileUrl, name: fileName, parent_id: folderId });
    if (drive.createFile) return await drive.createFile({ file_url: fileUrl, name: fileName, parent_id: folderId });
  } catch (error) {
    console.warn('Falha ao subir arquivo no Drive:', error?.message || error);
  }
  return { id: '', name: fileName, simulated: true };
}

async function deleteDriveFile(drive: any, fileId: string) {
  if (!drive || !fileId) return { deleted: false, simulated: !drive };
  try {
    if (drive.deleteFile) return await drive.deleteFile({ file_id: fileId });
    if (drive.trashFile) return await drive.trashFile({ file_id: fileId });
    if (drive.updateFile) return await drive.updateFile({ file_id: fileId, trashed: true });
  } catch (error) {
    console.warn('Falha ao deletar arquivo no Drive:', error?.message || error);
  }
  return { deleted: false };
}

async function handleBackup(base44: any, body: any) {
  const parentId = safeStr(body.parent_folder_id) || DEFAULT_PARENT_FOLDER_ID;
  const pr = await resolvePurchaseRequest(base44, body);
  const attachments = await resolveAttachments(base44, body, pr);
  const drive = await getGoogleDrive(base44);
  const referenceDate = body.nf_data_emissao || pr?.nf_data_emissao || pr?.created_date || attachments[0]?.nf_data_emissao || new Date().toISOString();
  const monthFolderName = getMesFolderName(referenceDate);
  const folder = await findOrCreateFolder(drive, monthFolderName, parentId);
  const folderId = folder?.id || '';
  const results: any[] = [];

  // Resolve o nome de exibição oficial uma vez (fornecedor ou empresa+pessoa+funcao)
  const nomeExibicao = pr ? await resolveNomeExibicao(base44, pr) : safeStr(body.nome_exibicao || 'FORNECEDOR');
  const contextBase = { ...(pr || body), nome_exibicao: nomeExibicao };

  for (const attachment of attachments) {
    const fileName = buildFileName(attachment, contextBase);
    if (attachment?.backup_drive_file_id && attachment?.backup_drive_file_name === fileName) {
      results.push({ attachment_id: attachment.id, skipped: true, reason: 'already_synced', fileName });
      continue;
    }
    const uploaded = await uploadDriveFile(drive, attachment, fileName, folderId);
    await safeUpdate(base44.asServiceRole.entities.Attachment, attachment.id, {
      file_name: fileName,
      nf_nome_renomeado: fileName,
      nome_padronizado_ia: fileName,
      backup_done: !!uploaded?.id || !!uploaded?.simulated,
      backup_status: uploaded?.simulated ? 'PENDENTE_CONFIG_DRIVE' : 'SINCRONIZADO',
      backup_drive_parent_folder_id: parentId,
      backup_drive_folder_id: folderId,
      backup_drive_folder_name: monthFolderName,
      backup_drive_file_id: uploaded?.id || attachment?.backup_drive_file_id || '',
      backup_drive_file_name: fileName,
      backup_synced_at: new Date().toISOString(),
    });
    results.push({ attachment_id: attachment.id, fileName, drive_file_id: uploaded?.id || '', folder: monthFolderName, simulated: !!uploaded?.simulated });
  }

  if (pr?.id) {
    await safeUpdate(base44.asServiceRole.entities.PurchaseRequest, pr.id, {
      backup_drive_status: results.some((r) => r.simulated) ? 'PENDENTE_CONFIG_DRIVE' : 'SINCRONIZADO',
      backup_drive_parent_folder_id: parentId,
      backup_drive_folder_id: folderId,
      backup_drive_folder_name: monthFolderName,
      backup_drive_synced_at: new Date().toISOString(),
      backup_drive_total_arquivos: results.length,
    });
  }

  return { ok: true, action: 'backup', parent_folder_id: parentId, folder: monthFolderName, folder_id: folderId, purchase_request_id: pr?.id || '', total: results.length, results, drive_available: !!drive };
}

async function handleDelete(base44: any, body: any) {
  const drive = await getGoogleDrive(base44);
  const deleted: any[] = [];
  async function deleteAttachmentBackup(attachment: any) {
    if (!attachment?.id) return;
    const fileId = safeStr(attachment.backup_drive_file_id);
    if (fileId) await deleteDriveFile(drive, fileId);
    await safeUpdate(base44.asServiceRole.entities.Attachment, attachment.id, { backup_done: false, backup_status: 'DELETADO_NO_BACKUP', backup_deleted_at: new Date().toISOString(), backup_drive_file_id: '' });
    deleted.push({ attachment_id: attachment.id, drive_file_id: fileId });
  }
  if (body.attachment_id) {
    const attachment = await safeGet(base44.asServiceRole.entities.Attachment, body.attachment_id);
    if (attachment) await deleteAttachmentBackup(attachment);
  }
  if (body.document_intake_id) {
    const intake = await safeGet(base44.asServiceRole.entities.DocumentIntake, body.document_intake_id);
    if (intake?.entidade_destino === 'Attachment' && intake?.entidade_destino_id) {
      const attachment = await safeGet(base44.asServiceRole.entities.Attachment, intake.entidade_destino_id);
      if (attachment) await deleteAttachmentBackup(attachment);
    }
  }
  return { ok: true, action: 'delete', deleted, drive_available: !!drive };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const action = safeStr(body.action || 'backup').toLowerCase();
    if (action === 'delete') return Response.json(await handleDelete(base44, body));
    return Response.json(await handleBackup(base44, body));
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});