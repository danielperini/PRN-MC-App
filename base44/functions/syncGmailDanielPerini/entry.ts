import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DANIEL_EMAIL = 'daniel@museuscentro.com.br';
const MUSEUS_CENTRO_KEYWORDS = [
  'museus centro', 'museu centro', 'nota fiscal', 'nf', 'nf-e', 'nfe',
  'nfse', 'danfe', 'boleto', 'contrato', 'recibo', 'comprovante',
  'pagamento', 'cobrança', 'fatura', 'museu', 'mis', 'mhab', 'mumo',
  'pampulha', 'noturno', 'prestação de contas', 'termo de compromisso',
  'aditivo', 'rubrica', 'orçamento',
];

const BLOCKED_KEYWORDS = [
  'spam', 'promoção', 'newsletter', 'propaganda', 'marketing',
  'convite', 'aniversário', 'feliz', 'parabéns',
];

function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isRelevantEmail(subject, from, snippet) {
  const combined = normalize(`${subject} ${from} ${snippet}`);

  for (const kw of BLOCKED_KEYWORDS) {
    if (combined.includes(normalize(kw))) return false;
  }

  for (const kw of MUSEUS_CENTRO_KEYWORDS) {
    if (combined.includes(normalize(kw))) return true;
  }

  return false;
}

function isAllowedAttachment(filename, mimeType) {
  const name = normalize(filename || '');
  const allowedExts = ['.pdf', '.xml', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx'];
  const allowedMimes = [
    'application/pdf', 'text/xml', 'application/xml',
    'image/png', 'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  if (mimeType && allowedMimes.includes(mimeType)) return true;

  for (const ext of allowedExts) {
    if (name.endsWith(ext)) return true;
  }

  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito à coordenação geral.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const maxResults = body.maxResults || 20;
    const dryRun = body.dryRun === true;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Buscar e-mails com anexo a partir de março de 2026 (lidos e não lidos)
    const searchQuery = `has:attachment after:2026/02/28`;
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${maxResults}`;

    const listRes = await fetch(listUrl, { headers: authHeader });
    if (!listRes.ok) {
      const err = await listRes.text();
      console.error('Gmail list error:', listRes.status, err);
      return Response.json({ error: `Erro ao listar e-mails: ${listRes.status}` }, { status: 500 });
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];

    if (messages.length === 0) {
      return Response.json({ success: true, mensagem: 'Nenhum e-mail com anexo encontrado a partir de março de 2026.', importados: 0 });
    }

    const resultados = [];
    let importados = 0;
    let ignorados = 0;
    let erros = 0;

    for (const msg of messages) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: authHeader }
        );

        if (!msgRes.ok) {
          console.error(`Erro ao buscar mensagem ${msg.id}:`, msgRes.status);
          erros++;
          continue;
        }

        const message = await msgRes.json();
        const headers = {};
        (message.payload?.headers || []).forEach(h => {
          headers[h.name?.toLowerCase()] = h.value;
        });

        const subject = headers['subject'] || '';
        const from = headers['from'] || '';
        const date = headers['date'] || '';

        if (!isRelevantEmail(subject, from, message.snippet || '')) {
          ignorados++;
          resultados.push({ messageId: msg.id, subject, status: 'ignorado', motivo: 'não relevante' });
          continue;
        }

        const parts = [];
        function collectParts(part) {
          if (part.parts) {
            part.parts.forEach(collectParts);
          } else if (part.filename && part.body?.attachmentId) {
            parts.push(part);
          }
        }
        collectParts(message.payload);

        if (parts.length === 0) {
          ignorados++;
          resultados.push({ messageId: msg.id, subject, status: 'ignorado', motivo: 'sem anexos processáveis' });
          continue;
        }

        for (const part of parts) {
          const filename = part.filename;
          const mimeType = part.mimeType;

          if (!isAllowedAttachment(filename, mimeType)) {
            resultados.push({ messageId: msg.id, subject, filename, status: 'ignorado', motivo: 'tipo não permitido' });
            continue;
          }

          if (dryRun) {
            resultados.push({ messageId: msg.id, subject, filename, status: 'dry-run', mimeType });
            continue;
          }

          // Baixar anexo
          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
            { headers: authHeader }
          );

          if (!attRes.ok) {
            console.error(`Erro ao baixar anexo ${filename}:`, attRes.status);
            erros++;
            continue;
          }

          const attData = await attRes.json();
          const rawBytes = Uint8Array.from(atob(attData.data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

          // Upload para storage
          const file = new File([rawBytes], filename, { type: mimeType || 'application/octet-stream' });
          const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file });

          if (!uploadRes?.file_url) {
            console.error(`Falha ao fazer upload de ${filename}`);
            erros++;
            continue;
          }

          // Criar DocumentIntake
          const intakePayload = {
            user_email: DANIEL_EMAIL,
            user_name: 'Daniel Perini',
            arquivo_original_url: uploadRes.file_url,
            file_name_original: filename,
            mime_type: mimeType || 'application/octet-stream',
            status_processamento: 'ENVIADO',
            tipo_detectado: 'PENDENTE',
            origem: 'gmail',
            revisado_pelo_usuario: false,
          };

          try {
            await base44.asServiceRole.entities.DocumentIntake.create(intakePayload);
            importados++;
            resultados.push({ messageId: msg.id, subject, filename, status: 'importado' });
          } catch (createErr) {
            console.error(`Erro ao criar DocumentIntake para ${filename}:`, createErr.message);
            erros++;
          }
        }

        // Não marcamos como lido — processamos lidos e não lidos

      } catch (msgErr) {
        console.error(`Erro processando mensagem ${msg.id}:`, msgErr.message);
        erros++;
      }
    }

    return Response.json({
      success: true,
      mensagem: `Processados ${messages.length} e-mails. ${importados} anexos importados, ${ignorados} ignorados, ${erros} erros.`,
      importados,
      ignorados,
      erros,
      dryRun,
      resultados,
    });

  } catch (error) {
    console.error('syncGmailDanielPerini error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});