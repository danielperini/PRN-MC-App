import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || String(user.role || '').toUpperCase() !== 'ADMIN') {
      return Response.json({ ok: false, error: 'Apenas admin' }, { status: 403 });
    }
    return Response.json({
      ok: true,
      message: 'auditarSistemaFinanceiroCompleto: endpoint mantido para compatibilidade. Use as funcoes especializadas (auditarVinculosFinanceiros, conciliarPagamentosRubricas, auditarMovimentacoesBancarias).',
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});