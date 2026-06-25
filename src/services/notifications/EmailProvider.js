/**
 * EmailProvider - Provedor de Email Abstrato
 * 
 * Camada de abstração para envio de emails.
 * Atualmente usa Base44 SendEmail, preparado para migração para:
 * - Resend
 * - Amazon SES
 * - Postmark
 * - SendGrid
 * 
 * Uso:
 *   import { EmailProvider } from '@/services/notifications/EmailProvider';
 *   
 *   const result = await EmailProvider.send({
 *     recipients: ['email@exemplo.com'],
 *     subject: 'Assunto',
 *     body: '<html>...</html>',
 *     fromName: 'Remetente'
 *   });
 */

import { base44 } from '@/api/base44Client';

// Tipo de provedor atual
const CURRENT_PROVIDER = 'base44_sendemail';

/**
 * Provedor de email
 */
export const EmailProvider = {
  /**
   * Enviar email
   * @param {Object} options
   * @param {Array<string>} options.recipients - Lista de destinatários
   * @param {string} options.subject - Assunto do email
   * @param {string} options.body - Corpo do email (HTML)
   * @param {string} options.fromName - Nome do remetente
   * @returns {Promise<{success: boolean, provider: string, error?: string}>}
   */
  async send({ recipients, subject, body, fromName }) {
    try {
      // Validar parâmetros
      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        throw new Error('Destinatários são obrigatórios');
      }

      if (!subject) {
        throw new Error('Assunto é obrigatório');
      }

      if (!body) {
        throw new Error('Corpo do email é obrigatório');
      }

      // Enviar para cada destinatário
      const results = await Promise.all(
        recipients.map(async (recipient) => {
          try {
            await this._sendViaBase44({
              to: recipient,
              subject,
              body,
              from_name: fromName,
            });

            return { email: recipient, success: true };
          } catch (error) {
            console.error(`[EmailProvider] Falha ao enviar para ${recipient}:`, error);
            return { email: recipient, success: false, error: error.message };
          }
        })
      );

      // Verificar resultados
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      return {
        success: successCount > 0,
        provider: CURRENT_PROVIDER,
        totalRecipients: recipients.length,
        successCount,
        failCount,
        results,
      };
    } catch (error) {
      console.error('[EmailProvider.send] Erro:', error);
      return {
        success: false,
        provider: CURRENT_PROVIDER,
        error: error.message,
      };
    }
  },

  /**
   * Enviar via Base44 SendEmail (provedor atual)
   */
  async _sendViaBase44({ to, subject, body, from_name }) {
    try {
      if (typeof base44 === 'undefined' || !base44.integrations?.Core?.SendEmail) {
        throw new Error('Integração Base44 SendEmail não disponível');
      }

      const result = await base44.integrations.Core.SendEmail({
        to,
        subject,
        body,
        from_name,
      });

      return result;
    } catch (error) {
      console.error('[EmailProvider._sendViaBase44] Erro:', error);
      throw error;
    }
  },

  /**
   * Método placeholder para futura integração com Resend
   * (não implementado, apenas como referência)
   */
  async _sendViaResend({ to, subject, body, from_name }) {
    throw new Error('Resend não implementado. Para migrar, implementar esta função.');
    // Exemplo de implementação futura:
    // const res = await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    //   },
    //   body: JSON.stringify({
    //     from: `${from_name} <noreply@viadutodasartes.org.br>`,
    //     to: [to],
    //     subject,
    //     html: body,
    //   }),
    // });
    // return res.json();
  },

  /**
   * Método placeholder para futura integração com Amazon SES
   * (não implementado, apenas como referência)
   */
  async _sendViaSES({ to, subject, body, from_name }) {
    throw new Error('Amazon SES não implementado. Para migrar, implementar esta função.');
  },
};