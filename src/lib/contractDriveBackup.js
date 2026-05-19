import { base44 } from '@/api/base44Client';

export const CONTRACTS_DRIVE_ROOT_FOLDER = 'Contratos APP';

const CONTRACT_TYPES = new Set(['CONTRATO', 'CONTRATO_PDF', 'TERMO_COMPROMISSO_PDF']);
const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
];

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  return cleanString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sanitizeFilePart(value, fallback = 'documento') {
  const cleaned = cleanString(value)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (cleaned || fallback).slice(0, 90);
}

function getReferenceDate(intake = {}) {
  const ia = intake.resultado_ia || {};
  const raw =
    ia.data_assinatura ||
    ia.vigencia_inicio ||
    ia.data_inicio ||
    intake.data_referencia ||
    intake.created_date ||
    new Date().toISOString();

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getYearMonthFolder(intake = {}) {
  const date = getReferenceDate(intake);
  const year = String(date.getFullYear());
  const monthIndex = date.getMonth();
  const month = `${String(monthIndex + 1).padStart(2, '0')}-${MONTH_NAMES[monthIndex]}`;

  return { year, month, label: `${String(monthIndex + 1).padStart(2, '0')}-${year}` };
}

export function isContractIntakeType(type) {
  return CONTRACT_TYPES.has(cleanString(type).toUpperCase());
}

export function getContractBackupKind({ intake = {}, linkType = '' } = {}) {
  const type = cleanString(intake.tipo_detectado).toUpperCase();
  const target = cleanString(intake.entidade_destino || linkType);
  const ia = intake.resultado_ia || {};
  const text = normalizeText([
    type,
    target,
    ia.tipo_documento,
    ia.objeto_contrato,
    intake.file_name_original,
    intake.file_name_final
  ].join(' '));

  if (type === 'TERMO_COMPROMISSO_PDF' || text.includes('termo de compromisso')) {
    return 'Termos de compromisso';
  }

  if (target === 'TeamMember' || target === 'TeamPayment' || intake.contrato_team_member_id) {
    return 'Equipe';
  }

  if (target === 'PurchaseRequest' || target === 'Fornecedor' || intake.contrato_fornecedor_id) {
    return 'Fornecedores';
  }

  return 'Sem vinculo';
}

export function buildContractDriveFolderPath({ intake = {}, linkType = '' } = {}) {
  const { year, month } = getYearMonthFolder(intake);
  const kind = getContractBackupKind({ intake, linkType });
  return `${CONTRACTS_DRIVE_ROOT_FOLDER}/${year}/${month}/${kind}`;
}

export function buildContractBackupFileName({ intake = {}, linkType = '' } = {}) {
  const ia = intake.resultado_ia || {};
  const { label } = getYearMonthFolder(intake);
  const kind = getContractBackupKind({ intake, linkType });
  const original = sanitizeFilePart(intake.file_name_original || intake.file_name_final || 'contrato');
  const pessoa = sanitizeFilePart(
    ia.fornecedor_nome ||
      ia.responsavel_tecnico ||
      intake.fornecedor_nome ||
      intake.user_name ||
      original,
    'sem identificacao'
  );
  const funcao = sanitizeFilePart(ia.funcao || ia.cargo || intake.funcao || intake.cargo || 'funcao');
  const objeto = sanitizeFilePart(
    ia.objeto_contrato ||
      ia.escopo_descricao ||
      ia.rubrica_sugerida ||
      intake.rubrica_nome ||
      original,
    'objeto'
  );

  if (kind === 'Equipe') {
    return `CONTRATO - ${pessoa} - ${funcao} - ${label}.pdf`;
  }

  if (kind === 'Fornecedores') {
    return `CONTRATO - ${pessoa} - ${objeto} - ${label}.pdf`;
  }

  if (kind === 'Termos de compromisso') {
    return `TERMO DE COMPROMISSO - ${pessoa} - ${objeto} - ${label}.pdf`;
  }

  return `CONTRATO SEM VINCULO - ${original} - ${label}.pdf`;
}

function extractBackupInfo(response) {
  const data = response?.data || response || {};
  return {
    driveFileId:
      data.drive_file_id ||
      data.fileId ||
      data.id ||
      data.result?.drive_file_id ||
      data.result?.fileId ||
      '',
    driveUrl:
      data.drive_backup_url ||
      data.drive_file_url ||
      data.webViewLink ||
      data.url ||
      data.result?.drive_backup_url ||
      data.result?.drive_file_url ||
      data.result?.webViewLink ||
      '',
    duplicated: data.duplicated || data.duplicate || data.status === 'DUPLICADO'
  };
}

async function invokeBackupFunction(payload) {
  if (!base44.functions?.invoke) {
    throw new Error('Integração de functions indisponível.');
  }

  const functionNames = ['syncContratoDriveBackup', 'backupContratoDrive', 'processarContratoEntradaUnica'];
  let lastError = null;

  for (const functionName of functionNames) {
    try {
      return await base44.functions.invoke(functionName, payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Function de backup de contratos indisponível.');
}

export async function backupContractIntakeToDrive({ intake, currentUser, linkType = '', updateIntake = true } = {}) {
  if (!intake?.id || !isContractIntakeType(intake.tipo_detectado)) {
    return { skipped: true, reason: 'not_contract' };
  }

  if (intake.backup_drive_status === 'CONCLUIDO' && (intake.drive_file_id || intake.drive_backup_url)) {
    return {
      skipped: true,
      reason: 'already_backed_up',
      drive_file_id: intake.drive_file_id,
      drive_backup_url: intake.drive_backup_url
    };
  }

  const folderPath = buildContractDriveFolderPath({ intake, linkType });
  const backupFileName = buildContractBackupFileName({ intake, linkType });

  const payload = {
    action: 'backup',
    root_folder_name: CONTRACTS_DRIVE_ROOT_FOLDER,
    folder_path: folderPath,
    file_name: backupFileName,
    file_url: intake.arquivo_original_url,
    intake_id: intake.id,
    document_intake_id: intake.id,
    tipo_detectado: intake.tipo_detectado,
    entidade_destino: intake.entidade_destino || linkType || '',
    entidade_destino_id: intake.entidade_destino_id || '',
    contrato_team_member_id: intake.contrato_team_member_id || '',
    contrato_fornecedor_id: intake.contrato_fornecedor_id || '',
    original_file_name: intake.file_name_original || intake.file_name_final || '',
    dedupe_key:
      intake.arquivo_original_url ||
      `${intake.id}:${intake.file_name_original || intake.file_name_final || ''}`,
    metadata: {
      user_email: currentUser?.email || intake.user_email || '',
      fornecedor_nome: intake.resultado_ia?.fornecedor_nome || intake.fornecedor_nome || '',
      tipo_pasta: getContractBackupKind({ intake, linkType })
    }
  };

  if (updateIntake) {
    await base44.entities.DocumentIntake.update(intake.id, {
      drive_folder_path: folderPath,
      drive_backup_file_name: backupFileName,
      backup_drive_status: 'PENDENTE'
    }).catch(() => {});
  }

  try {
    const response = await invokeBackupFunction(payload);
    const info = extractBackupInfo(response);

    const patch = {
      drive_backup_url: info.driveUrl || intake.drive_backup_url || '',
      drive_file_id: info.driveFileId || intake.drive_file_id || '',
      drive_folder_path: folderPath,
      drive_backup_file_name: backupFileName,
      backup_drive_em: new Date().toISOString(),
      backup_drive_status: 'CONCLUIDO',
      backup_done: true,
      backup_status: info.duplicated ? 'DUPLICADO_IGNORADO' : 'BACKUP_OK'
    };

    if (updateIntake) {
      await base44.entities.DocumentIntake.update(intake.id, patch).catch(() => {});
    }

    return { success: true, ...patch, duplicated: info.duplicated };
  } catch (error) {
    const patch = {
      drive_folder_path: folderPath,
      drive_backup_file_name: backupFileName,
      backup_drive_em: new Date().toISOString(),
      backup_drive_status: 'ERRO',
      backup_error: error?.message || 'Falha ao enviar contrato ao Drive'
    };

    if (updateIntake) {
      await base44.entities.DocumentIntake.update(intake.id, patch).catch(() => {});
    }

    return { success: false, ...patch };
  }
}
