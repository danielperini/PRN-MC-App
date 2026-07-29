import { createClient } from '@base44/sdk';

const base44 = createClient({ appId: process.env.APP_ID });

export default async function handler(req: Request): Promise<Response> {
  // Esta função foi desativada permanentemente.
  // O disparo automático de e-mails para nova programação foi encerrado em 2026-07-29.
  return new Response(JSON.stringify({ disabled: true, reason: 'Função desativada permanentemente em 2026-07-29.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}