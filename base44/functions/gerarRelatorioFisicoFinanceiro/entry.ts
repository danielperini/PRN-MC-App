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
      message: 'gerarRelatorioFisicoFinanceiro: use o client-side src/utils/buildRelatorioFisicoFinanceiroContext.js ou a funcao exportarRelatorioFisicoFinanceiroPDF para gerar o relatorio fisico-financeiro. Este endpoint esta mantido para compatibilidade de rotas legadas.',
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
});