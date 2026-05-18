import { NOTIFICATION_EVENTS } from './notificationRules';

const fmtBRL = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function purchaseTitle(entity = {}) {
  return entity.descricao_item || entity.descricao || entity.titulo || 'solicitação de compra';
}

function purchaseValue(entity = {}) {
  return entity.valor_solicitado ?? entity.valor_total ?? entity.nf_valor_total ?? entity.valor ?? 0;
}

export function buildActionUrl(entity = {}, fallbackPath = '') {
  if (entity.action_url) return entity.action_url;
  if (entity.id && fallbackPath) return `${fallbackPath}${fallbackPath.includes('?') ? '&' : '?'}id=${entity.id}`;
  return fallbackPath;
}

export function getNotificationTemplate(eventType, entity = {}, recipient = {}) {
  const templates = {
    [NOTIFICATION_EVENTS.PURCHASE_CREATED]: recipient.reason === 'own_purchase_confirmation'
      ? {
          title: 'Solicitação enviada',
          message: `Sua solicitação "${purchaseTitle(entity)}" foi registrada no valor de ${fmtBRL(purchaseValue(entity))}.`,
        }
      : {
          title: 'Nova solicitação de compra',
          message: `${entity.solicitante_nome || entity.created_by || 'Solicitante'} enviou "${purchaseTitle(entity)}" no valor de ${fmtBRL(purchaseValue(entity))}.`,
        },
    [NOTIFICATION_EVENTS.PURCHASE_APPROVED]: recipient.reason === 'ready_for_payment'
      ? {
          title: 'Solicitação pronta para pagamento',
          message: `"${purchaseTitle(entity)}" foi aprovada. Valor: ${fmtBRL(purchaseValue(entity))}. Rubrica: ${entity.rubrica_nome || entity.rubrica || 'não informada'}.`,
        }
      : {
          title: 'Sua solicitação foi aprovada',
          message: `A solicitação "${purchaseTitle(entity)}" foi aprovada e seguirá para pagamento.`,
        },
    [NOTIFICATION_EVENTS.PURCHASE_RETURNED]: {
      title: 'Sua solicitação foi devolvida',
      message: `A solicitação "${purchaseTitle(entity)}" foi devolvida para ajuste.${entity.comentario_devolucao ? ` Motivo: ${entity.comentario_devolucao}` : ''}`,
    },
    [NOTIFICATION_EVENTS.PURCHASE_REJECTED]: {
      title: 'Sua solicitação foi recusada',
      message: `A solicitação "${purchaseTitle(entity)}" foi recusada.${entity.comentario_devolucao ? ` Motivo: ${entity.comentario_devolucao}` : ''}`,
    },
    [NOTIFICATION_EVENTS.PURCHASE_PAID]: {
      title: 'Pagamento realizado',
      message: `O pagamento de "${purchaseTitle(entity)}" foi registrado no valor de ${fmtBRL(purchaseValue(entity))}.`,
    },
    [NOTIFICATION_EVENTS.PAYMENT_PROOF_ATTACHED]: {
      title: 'Comprovante de pagamento anexado',
      message: `O comprovante de pagamento de "${purchaseTitle(entity)}" foi anexado.`,
    },
    [NOTIFICATION_EVENTS.REPORT_SUBMITTED]: recipient.reason === 'pending_report_review'
      ? {
          title: 'Relatório pendente de revisão',
          message: `${entity.author_name || entity.created_by || 'Profissional'} enviou relatório de ${entity.mes_referencia || entity.mes || 'período não informado'}.`,
        }
      : {
          title: 'Relatório enviado',
          message: `Seu relatório de ${entity.mes_referencia || entity.mes || 'período não informado'} foi enviado para revisão.`,
        },
    [NOTIFICATION_EVENTS.REPORT_APPROVED]: {
      title: 'Relatório aprovado',
      message: `O relatório de ${entity.mes_referencia || entity.mes || 'período não informado'} foi aprovado.`,
    },
    [NOTIFICATION_EVENTS.REPORT_RETURNED]: {
      title: 'Relatório devolvido',
      message: `O relatório de ${entity.mes_referencia || entity.mes || 'período não informado'} foi devolvido.${entity.return_comment ? ` Motivo: ${entity.return_comment}` : ''}`,
    },
    [NOTIFICATION_EVENTS.MESSAGE_DIRECT]: {
      title: entity.title || 'Nova mensagem',
      message: entity.message || entity.conteudo || 'Você recebeu uma mensagem direcionada.',
    },
    [NOTIFICATION_EVENTS.COMMENT_CREATED]: {
      title: 'Novo comentário',
      message: entity.comment || entity.message || 'Há um comentário em um item criado por você.',
    },
  };

  return templates[eventType] || null;
}
