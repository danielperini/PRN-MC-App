/**
 * NotificationService - Módulo Central de Comunicação
 * 
 * Responsável por gerenciar todas as notificações do sistema.
 * Preparado para múltiplos canais (EMAIL, WHATSAPP, TELEGRAM) e provedores.
 * 
 * Uso:
 *   import { NotificationService } from '@/services/notifications/NotificationService';
 *   
 *   await NotificationService.send({
 *     channel: 'EMAIL',
 *     type: 'PURCHASE_DIGEST',
 *     recipients: [...],
 *     data: {...}
 *   });
 */

import { base44 } from '@/api/base44Client';
import { EmailProvider } from './EmailProvider';
import { PurchaseNotificationTemplate } from './templates/PurchaseNotificationTemplate';

// Canais suportados
export const NotificationChannel = {
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  TELEGRAM: 'TELEGRAM',
};

// Tipos de notificação
export const NotificationType = {
  PURCHASE_DIGEST: 'PURCHASE_DIGEST',
  PURCHASE_APPROVED: 'PURCHASE_APPROVED',
  PURCHASE_RETURNED: 'PURCHASE_RETURNED',
  REPORT_APPROVED: 'REPORT_APPROVED',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
};

// Status da fila
export const QueueStatus = {
  PENDING: 'PENDING',
  SCHEDULED: 'SCHEDULED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

// Destinatários fixos para notificações de compras
const FIXED_PURCHASE_RECIPIENTS = [
  'adm@viadutodasartes.org.br',
  'notasfiscais@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
  'daniel@periniprojetos.com.br',
];

/**
 * Serviço central de notificações
 */
export const NotificationService = {
  /**
   * Enviar notificação
   * @param {Object} options
   * @param {string} options.channel - Canal (EMAIL, WHATSAPP, TELEGRAM)
   * @param {string} options.type - Tipo da notificação
   * @param {Array<string>} options.recipients - Destinatários
   * @param {Object} options.data - Dados para o template
   * @param {string} options.priority - Prioridade (low, normal, high)
   * @param {string} options.entityType - Tipo da entidade relacionada
   * @param {string} options.entityId - ID da entidade relacionada
   */
  async send({
    channel = NotificationChannel.EMAIL,
    type,
    recipients = [],
    data = {},
    priority = 'normal',
    entityType,
    entityId,
  }) {
    try {
      // Validar canal
      if (!Object.values(NotificationChannel).includes(channel)) {
        throw new Error(`Canal não suportado: ${channel}`);
      }

      // Canal EMAIL (único implementado atualmente)
      if (channel === NotificationChannel.EMAIL) {
        return await this._sendEmail({ type, recipients, data, priority, entityType, entityId });
      }

      // Outros canais (preparado para implementação futura)
      if (channel === NotificationChannel.WHATSAPP) {
        throw new Error('WhatsApp ainda não implementado');
      }

      if (channel === NotificationChannel.TELEGRAM) {
        throw new Error('Telegram ainda não implementado');
      }

      throw new Error('Canal não implementado');
    } catch (error) {
      console.error('[NotificationService.send] Erro:', error);
      throw error;
    }
  },

  /**
   * Enviar email
   */
  async _sendEmail({ type, recipients, data, priority, entityType, entityId }) {
    try {
      // Obter template
      const template = PurchaseNotificationTemplate.getTemplate(type, data);
      
      if (!template) {
        throw new Error(`Template não encontrado para tipo: ${type}`);
      }

      // Enviar via provider
      const result = await EmailProvider.send({
        recipients,
        subject: template.subject,
        body: template.body,
        fromName: template.fromName || 'Museus Centro - Sistema',
      });

      // Registrar log
      await this._logNotification({
        type,
        channel: NotificationChannel.EMAIL,
        recipients,
        entityType,
        entityId,
        status: result.success ? QueueStatus.SENT : QueueStatus.FAILED,
        provider: 'base44_sendemail',
        error: result.error,
      });

      return result;
    } catch (error) {
      console.error('[NotificationService._sendEmail] Erro:', error);
      
      // Registrar log de erro
      await this._logNotification({
        type,
        channel: NotificationChannel.EMAIL,
        recipients,
        entityType,
        entityId,
        status: QueueStatus.FAILED,
        provider: 'base44_sendemail',
        error: error.message,
      });

      throw error;
    }
  },

  /**
   * Registrar log de notificação
   */
  async _logNotification({ type, channel, recipients, entityType, entityId, status, provider, error }) {
    try {
      // Usar entidade NotificationLog se existir, senão NotificacaoCompraLog
      const logData = {
        notification_type: type,
        channel,
        recipients,
        entity_type: entityType,
        entity_id: entityId,
        status,
        provider,
        error_message: error,
        sent_at: new Date().toISOString(),
      };

      // Tentar criar log na entidade apropriada
      if (typeof base44 !== 'undefined' && base44.entities) {
        // Priorizar NotificationLog, fallback para NotificacaoCompraLog
        if (base44.entities.NotificationLog) {
          await base44.entities.NotificationLog.create(logData);
        } else if (base44.entities.NotificacaoCompraLog) {
          await base44.entities.NotificacaoCompraLog.create({
            purchase_id: entityId || 'desconhecido',
            status: status === QueueStatus.SENT ? 'sucesso' : 'falha',
            enviado_por: 'NotificationService',
            erro: error,
            disparado_em: logData.sent_at,
          });
        }
      }
    } catch (logError) {
      console.error('[NotificationService._logNotification] Falha ao registrar log:', logError);
      // Não lançar erro para não quebrar o fluxo principal
    }
  },

  /**
   * Obter destinatários fixos para compras
   */
  getPurchaseRecipients() {
    return [...FIXED_PURCHASE_RECIPIENTS];
  },

  /**
   * Calcular próximo slot de envio
   * @param {Date} now - Data atual
   * @returns {Object} { batchSlot, batchScheduledAt }
   */
  calculateNextSlot(now = new Date()) {
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    let batchSlot;
    let batchScheduledAt;

    // Lote da manhã: 09:30
    // Lote da tarde: 16:45
    
    if (currentHour < 9 || (currentHour === 9 && currentMinute < 30)) {
      // Antes das 09:30: lote da manhã de hoje
      batchSlot = 'manha';
      batchScheduledAt = new Date(now);
      batchScheduledAt.setHours(9, 30, 0, 0);
    } else if (currentHour < 16 || (currentHour === 16 && currentMinute < 45)) {
      // Entre 09:30 e 16:45: lote da tarde de hoje
      batchSlot = 'tarde';
      batchScheduledAt = new Date(now);
      batchScheduledAt.setHours(16, 45, 0, 0);
    } else {
      // Depois das 16:45: lote da manhã de amanhã
      batchSlot = 'manha';
      batchScheduledAt = new Date(now);
      batchScheduledAt.setDate(batchScheduledAt.getDate() + 1);
      batchScheduledAt.setHours(9, 30, 0, 0);
    }

    return { batchSlot, batchScheduledAt };
  },

  /**
   * Verificar se já existe na fila
   * @param {string} purchaseId
   * @param {string} batchSlot
   * @returns {Promise<boolean>}
   */
  async alreadyInQueue(purchaseId, batchSlot) {
    try {
      if (typeof base44 === 'undefined' || !base44.entities) {
        return false;
      }

      const existing = await base44.entities.PurchaseNotificationQueue.filter({
        purchase_id: purchaseId,
        batch_slot: batchSlot,
        status: 'pendente_lote',
      });

      return existing && existing.length > 0;
    } catch (error) {
      console.error('[NotificationService.alreadyInQueue] Erro:', error);
      return false;
    }
  },
};