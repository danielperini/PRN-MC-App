// ================================================================
// lerNotaFiscalGPT — wrapper HTTP para a função core compartilhada.
// Lógica em _shared/lerNotaFiscalGPTCore.ts. Esta camada apenas trata
// autenticação/HTTP e delega para o core.
// ================================================================
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { analisarNotaFiscal } from '../_shared/lerNotaFiscalGPTCore.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Usuário é OPCIONAL: aceita chamadas autenticadas OU service role
    // (e.g. invocações internas via organizarNFsComIA).
    let user = null;
    try { user = await base44.auth.me(); } catch { /* service role */ }

    const body = await req.json().catch(() => ({}));
    const result = await analisarNotaFiscal(base44, {
      ...body,
      user_email: user?.email || 'service_role',
      feature: 'leitura_profunda_nf',
    });

    if (!result.ok) {
      return Response.json(result, { status: result.http_status || 500 });
    }
    return Response.json(result);
  } catch (err) {
    console.error('[lerNotaFiscalGPT] erro:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});