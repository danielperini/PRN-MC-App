import { base44 } from '@/api/base44Client';

export const ATTENDANCE_DRIVE_ROOT_FOLDER_ID = '1x5VMhvXXIWU-HiBd8B8k_i5B0WnGbp1b';
export const ATTENDANCE_DRIVE_ROOT_URL = `https://drive.google.com/drive/u/0/folders/${ATTENDANCE_DRIVE_ROOT_FOLDER_ID}`;

export function slugFilePart(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

export function buildAttendanceFileName({ museu, atividade, turma, data, extension = 'pdf' } = {}) {
  return [
    slugFilePart(museu || 'MUSEUS-CENTRO'),
    slugFilePart(atividade || 'ATIVIDADE'),
    slugFilePart(turma || 'TURMA'),
    String(data || new Date().toISOString().slice(0, 10)),
  ].filter(Boolean).join('_') + `.${extension}`;
}

export function buildAttendanceFolderPath({ museu, atividade, turma } = {}) {
  return [
    'MUSEUS_CENTRO',
    slugFilePart(museu || 'GERAL'),
    slugFilePart(atividade || 'ATIVIDADE'),
    slugFilePart(turma || 'TURMA'),
  ].join('/');
}

async function auditBackup(payload) {
  try {
    if (base44.entities.AttendanceAuditLog?.create) {
      await base44.entities.AttendanceAuditLog.create(payload);
      return;
    }
    await base44.entities.AuditLog?.create?.({
      action: payload.action || 'ATTENDANCE_BACKUP',
      entity_type: payload.entity_type || 'AttendanceList',
      entity_id: payload.entity_id || payload.attendance_list_id || '',
      details: payload.details || 'Backup de lista de presença',
      metadata: payload,
    });
  } catch (error) {
    console.warn('Auditoria de backup de presença não registrada:', error);
  }
}

export async function backupAttendanceClassToDrive(payload = {}) {
  const folderPath = buildAttendanceFolderPath(payload);
  const fileName = buildAttendanceFileName(payload);
  const request = {
    root_folder_id: ATTENDANCE_DRIVE_ROOT_FOLDER_ID,
    root_folder_url: ATTENDANCE_DRIVE_ROOT_URL,
    folder_path: folderPath,
    file_name: fileName,
    structure: ['LISTAS', 'PDFS', 'PARTICIPANTES', 'ASSINATURAS'],
    ...payload,
  };

  try {
    const result = await base44.functions?.invoke?.('backupAttendanceClassToDrive', request);
    await auditBackup({
      action: 'ATTENDANCE_BACKUP_DONE',
      entity_type: 'AttendanceList',
      entity_id: payload.attendance_list_id || payload.class_id || '',
      attendance_list_id: payload.attendance_list_id || '',
      class_id: payload.class_id || '',
      folder_path: folderPath,
      file_name: fileName,
      drive_root_folder_id: ATTENDANCE_DRIVE_ROOT_FOLDER_ID,
      result,
      details: `Backup de presença preparado em ${folderPath}`,
      created_at: new Date().toISOString(),
    });
    return { ok: true, folderPath, fileName, rootUrl: ATTENDANCE_DRIVE_ROOT_URL, result };
  } catch (error) {
    await auditBackup({
      action: 'ATTENDANCE_BACKUP_PENDING',
      entity_type: 'AttendanceList',
      entity_id: payload.attendance_list_id || payload.class_id || '',
      attendance_list_id: payload.attendance_list_id || '',
      class_id: payload.class_id || '',
      folder_path: folderPath,
      file_name: fileName,
      drive_root_folder_id: ATTENDANCE_DRIVE_ROOT_FOLDER_ID,
      error: error?.message || String(error),
      details: `Backup pendente para ${folderPath}`,
      created_at: new Date().toISOString(),
    });
    return { ok: false, pending: true, folderPath, fileName, rootUrl: ATTENDANCE_DRIVE_ROOT_URL, error };
  }
}

export default backupAttendanceClassToDrive;
