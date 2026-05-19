import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export const NF_BACKUP_DRIVE_PARENT_ID = '1aJ5nfpgXcpu6SrDVecmhIQ2eq4vexqe3';
const APPROVED_STATUSES = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const NF_TYPES = new Set(['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML', 'RECIBO_PDF']);
const DELETE_STATUSES = new Set(['DELETADO', 'EXCLUIDO', 'EXCLUÍDO', 'CANCELADO']);
const BACKUP_DELAY_MS = 60 * 1000;

function safeStr(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  return safeStr(value).toUpperCase();
}

function isApprovedPayload(payload = {}) {
  return APPROVED_STATUSES.has(normalizeStatus(payload.status || payload.status_processamento));
}

function isDeletePayload(payload = {}) {
  return DELETE_STATUSES.has(normalizeStatus(payload.status || payload.status_processamento || payload.status_registro));
}

function isFiscalDocumentPayload(payload = {}) {
  const type = normalizeStatus(payload.tipo_detectado || payload.nf_tipo_documento || payload.resultado_ia?.tipo_documento);
  if (!type) return true;
  return NF_TYPES.has(type) || type.includes('NOTA_FISCAL') || type.includes('RECIBO');
}

function invokeBackup(payload) {
  if (!base44?.functions?.invoke) return Promise.resolve(null);
  return base44.functions.invoke('syncNotaFiscalDriveBackup', payload).catch((error) => {
    console.warn('Falha ao sincronizar backup de NF no Drive:', error);
    return null;
  });
}

function scheduleBackup(payload = {}) {
  window.setTimeout(() => {
    invokeBackup({
      action: 'backup',
      parent_folder_id: NF_BACKUP_DRIVE_PARENT_ID,
      ...payload,
    });
  }, BACKUP_DELAY_MS);
}

function scheduleDelete(payload = {}) {
  window.setTimeout(() => {
    invokeBackup({
      action: 'delete',
      parent_folder_id: NF_BACKUP_DRIVE_PARENT_ID,
      ...payload,
    });
  }, 0);
}

function patchEntity(entity, entityName) {
  if (!entity || entity.__nfDriveBackupPatched) return () => {};

  const originalCreate = entity.create?.bind(entity);
  const originalUpdate = entity.update?.bind(entity);
  const originalDelete = entity.delete?.bind(entity);

  if (originalCreate) {
    entity.create = async (payload = {}, ...args) => {
      const result = await originalCreate(payload, ...args);

      if (entityName === 'PurchaseRequest' && isApprovedPayload(payload)) {
        scheduleBackup({
          purchase_request_id: result?.id,
          nf_numero: payload?.nf_numero,
          fornecedor_cnpj: payload?.fornecedor_cnpj,
          fornecedor_nome: payload?.fornecedor_nome,
          valor: payload?.valor_solicitado,
          source: 'PurchaseRequest.create',
        });
      }

      return result;
    };
  }

  if (originalUpdate) {
    entity.update = async (id, payload = {}, ...args) => {
      const result = await originalUpdate(id, payload, ...args);

      if (entityName === 'PurchaseRequest' && isApprovedPayload(payload)) {
        scheduleBackup({
          purchase_request_id: id,
          nf_numero: payload?.nf_numero || payload?.numero_nf,
          fornecedor_cnpj: payload?.fornecedor_cnpj,
          fornecedor_nome: payload?.fornecedor_nome,
          valor: payload?.valor_solicitado,
          source: 'PurchaseRequest.update',
        });
      }

      if (entityName === 'DocumentIntake' && isApprovedPayload(payload) && isFiscalDocumentPayload(payload)) {
        scheduleBackup({
          document_intake_id: id,
          purchase_request_id: payload?.entidade_destino === 'PurchaseRequest' ? payload?.entidade_destino_id : '',
          attachment_id: payload?.entidade_destino === 'Attachment' ? payload?.entidade_destino_id : '',
          nf_numero: payload?.resultado_ia?.nf_numero,
          fornecedor_cnpj: payload?.resultado_ia?.nf_emitente_cpf_cnpj,
          fornecedor_nome: payload?.resultado_ia?.nf_emitente_nome,
          valor: payload?.resultado_ia?.nf_valor_total,
          source: 'DocumentIntake.update',
        });
      }

      if (entityName === 'Attachment' && isDeletePayload(payload)) {
        scheduleDelete({
          attachment_id: id,
          source: 'Attachment.update.delete-status',
        });
      }

      if (entityName === 'DocumentIntake' && isDeletePayload(payload)) {
        scheduleDelete({
          document_intake_id: id,
          attachment_id: payload?.entidade_destino === 'Attachment' ? payload?.entidade_destino_id : '',
          source: 'DocumentIntake.update.delete-status',
        });
      }

      return result;
    };
  }

  if (originalDelete) {
    entity.delete = async (id, ...args) => {
      if (entityName === 'Attachment') {
        scheduleDelete({ attachment_id: id, source: 'Attachment.delete' });
      }

      if (entityName === 'DocumentIntake') {
        scheduleDelete({ document_intake_id: id, source: 'DocumentIntake.delete' });
      }

      return originalDelete(id, ...args);
    };
  }

  entity.__nfDriveBackupPatched = true;

  return () => {
    if (originalCreate) entity.create = originalCreate;
    if (originalUpdate) entity.update = originalUpdate;
    if (originalDelete) entity.delete = originalDelete;
    delete entity.__nfDriveBackupPatched;
  };
}

export function installNFDriveBackupSync() {
  const entities = base44?.entities || {};
  const cleanups = [
    patchEntity(entities.PurchaseRequest, 'PurchaseRequest'),
    patchEntity(entities.DocumentIntake, 'DocumentIntake'),
    patchEntity(entities.Attachment, 'Attachment'),
  ];

  return () => cleanups.forEach((cleanup) => cleanup?.());
}

export default function NFDriveBackupSyncInstaller() {
  useEffect(() => installNFDriveBackupSync(), []);
  return null;
}
