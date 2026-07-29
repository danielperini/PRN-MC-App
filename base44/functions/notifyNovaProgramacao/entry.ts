import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  // Função desativada permanentemente em 2026-07-29.
  // O disparo automático de e-mails para nova programação foi encerrado.
  return Response.json({ disabled: true, reason: 'Função desativada permanentemente em 2026-07-29.' });
});