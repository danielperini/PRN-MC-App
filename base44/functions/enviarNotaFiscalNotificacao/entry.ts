import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const EMAILS_PERMITIDOS = [
  'notasfiscais@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
];

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function escapeHtml(value: unknown): string {
  return safeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeRecipients(value: unknown): string[] {
  return safeString(value)
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function filtrarEmailsPermitidos(emails: string[]): string[] {
  return emails.filter((email) =>
    EMAILS_PERMITIDOS.includes(email.toLowerCase())
  );
}

function uniqueRecipients(...groups: string[][]): string[] {
  const set = new Set<string>();

  groups.flat().forEach((email) => {
    const normalized = safeString(email).toLowerCase();
    if (normalized) set.add(normalized);
  });

  // 🔒 FILTRO FINAL (CRÍTICO)
  return filtrarEmailsPermitidos(Array.from(set));
}

function formatMoneyBR(value: unknown): string {
  const raw = safeString(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const n = Number(raw || value || 0);

  if (!Number.isFinite(n) || n <= 0) {
    return safeString(value) || 'R$ 0,00';
  }

  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export default async function handler(req: Request) {
  const base44 = createClientFromRequest(req);

  try {
    const body = await req.json();

    const {
      destinatarios,
      nomeProfissional,
      funcao,
      museu,
      reportId,
      fileName,
      nfNumero,
      nfValor,
      nfData,
      emitenteNome,
      emitenteDoc,
      descricaoNota,
      fileUrl,
    } = body;

    const listaOriginal = normalizeRecipients(destinatarios);

    // 🔒 AQUI ESTÁ O BLOQUEIO REAL
    const listaFinal = filtrarEmailsPermitidos(listaOriginal);

    if (listaFinal.length === 0) {
      console.warn('Nenhum e-mail permitido. Cancelando envio.');
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const subject = `${safeString(emitenteNome)} — ${formatMoneyBR(nfValor)}`;

    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px;">
        <h2>Nova Nota Fiscal enviada</h2>

        <p><b>Profissional:</b> ${escapeHtml(nomeProfissional)}</p>
        <p><b>Função:</b> ${escapeHtml(funcao)}</p>
        <p><b>Museu:</b> ${escapeHtml(museu)}</p>

        <hr/>

        <p><b>Fornecedor:</b> ${escapeHtml(emitenteNome)}</p>
        <p><b>CNPJ:</b> ${escapeHtml(emitenteDoc)}</p>
        <p><b>Nº NF:</b> ${escapeHtml(nfNumero)}</p>
        <p><b>Valor:</b> ${formatMoneyBR(nfValor)}</p>
        <p><b>Data:</b> ${escapeHtml(nfData)}</p>

        <p><b>Descrição:</b></p>
        <p>${escapeHtml(descricaoNota)}</p>

        <hr/>

        <p><a href="${fileUrl}" target="_blank">Abrir arquivo</a></p>
      </div>
    `;

    await base44.integrations.Email.send({
      to: listaFinal,
      subject,
      html,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
