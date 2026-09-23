const DEFAULT_APP_URL = 'https://appgestor.periniprojetos.com.br';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function publicAppUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (/^https?:$/.test(parsed.protocol) && parsed.hostname) return parsed.origin;
  } catch {
    // The canonical public address below is deliberately used for every e-mail.
  }
  return DEFAULT_APP_URL;
}

export const reportSubmissionSteps = [
  'Abra o relatório do mês correto ou selecione “Novo relatório”.',
  'Confirme seu nome, função, museu e mês de referência antes de editar.',
  'Registre as atividades realizadas e anexe as fotos correspondentes.',
  'Clique em “Salvar” e, ao terminar, em “Enviar para aprovação”.',
];

export const purchaseSubmissionSteps = [
  'Abra a solicitação e confira fornecedor, número da NF, data de emissão e valor.',
  'Selecione a meta, a rubrica e o centro de custo corretos.',
  'Anexe a nota fiscal em PDF e, quando houver, o XML da mesma nota.',
  'Revise os dados e envie a solicitação para aprovação; acompanhe o status na tela.',
];

export const paymentNotificationSteps = [
  'Abra a solicitação pelo botão abaixo; ele leva diretamente ao registro desta nota.',
  'Confira fornecedor, número da NF, valor e o status de pagamento.',
  'Abra os arquivos vinculados para consultar a nota fiscal, XML e comprovante, quando disponível.',
  'Se encontrar alguma divergência, registre o problema no aplicativo antes de realizar nova ação.',
];

export function brandedEmailHtml({
  appUrl,
  title,
  greeting = 'Olá',
  message,
  steps = [],
  ctaLabel = 'Abrir no Gestor Museus',
  ctaUrl,
  recipientEmail = '',
  accent = '#102b21',
}) {
  const baseUrl = publicAppUrl(appUrl);
  const buttonUrl = String(ctaUrl || baseUrl).trim();
  const safeSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  const stepsHtml = safeSteps.length
    ? `<tr><td style="padding:0 32px 24px"><div style="border:1px solid #dbe8e1;border-radius:12px;background:#f7fbf8;padding:18px 20px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#49705d;margin:0 0 10px">Passo a passo</div><ol style="margin:0;padding-left:20px;color:#253a30;font-size:14px;line-height:1.65">${safeSteps.map((step) => `<li style="margin:0 0 5px">${escapeHtml(step)}</li>`).join('')}</ol></div></td></tr>`
    : '';
  const accountHint = recipientEmail
    ? `Entre com a mesma conta Google deste e-mail: <strong>${escapeHtml(recipientEmail)}</strong>.`
    : 'Entre com a conta Google cadastrada no Gestor Museus.';

  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#eef3f0;font-family:Arial,Helvetica,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f0;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(16,43,33,.10)"><tr><td style="background:${escapeHtml(accent)};padding:24px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><img src="${escapeHtml(`${baseUrl}/viaduto-logo.png`)}" width="74" height="74" alt="Viaduto das Artes" style="display:block;border:0;max-width:74px;height:auto"></td><td valign="middle" style="padding-left:16px;color:#ffffff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.78">Viaduto das Artes</div><div style="font-size:20px;font-weight:700;margin-top:4px">Gestor Museus Centro</div></td></tr></table></td></tr><tr><td style="padding:30px 32px 12px"><h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;color:#172033">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escapeHtml(greeting)}.</p><p style="font-size:15px;line-height:1.6;margin:0;color:#394b42">${safeMessage}</p></td></tr>${stepsHtml}<tr><td style="padding:0 32px 26px"><p style="font-size:13px;line-height:1.55;color:#5d6c65;margin:0 0 18px">${accountHint} O botão abre a tela correta e mantém o destino após a autenticação.</p><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:${escapeHtml(accent)};color:#ffffff;text-decoration:none;font-weight:700;border-radius:9px;padding:13px 20px;font-size:14px">${escapeHtml(ctaLabel)}</a></td></tr><tr><td style="border-top:1px solid #e5ece8;padding:18px 32px 22px;color:#6b7b73;font-size:12px;line-height:1.5">Mensagem automática do Gestor Museus Centro · Viaduto das Artes.<br>Se encontrar alguma inconsistência, use “Reportar problema” dentro do aplicativo.</td></tr></table></td></tr></table></body></html>`;
}

export function brandedEmailText({ greeting = 'Olá', message, steps = [], ctaLabel = 'Abrir no Gestor Museus', ctaUrl, recipientEmail = '' }) {
  const account = recipientEmail ? `\n\nAcesse usando a conta Google: ${recipientEmail}.` : '';
  const guide = Array.isArray(steps) && steps.length
    ? `\n\nPASSO A PASSO\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`
    : '';
  return `${greeting}.\n\n${message}${account}${guide}\n\n${ctaLabel}: ${ctaUrl}`;
}
