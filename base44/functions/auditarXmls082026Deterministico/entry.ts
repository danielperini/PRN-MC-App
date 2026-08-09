// Teste minimal
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  return Response.json({ ok: true, msg: 'hello' });
});