import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export async function serve(req, ctx) {
  const base44 = createClientFromRequest(req);
  return { ok: true, message: 'motor de decisões operacional' };
}