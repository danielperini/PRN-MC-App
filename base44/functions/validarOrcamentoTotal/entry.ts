import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ORCAMENTO_TOTAL = 1320000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { valor_adicional = 0 } = await req.json();

    // Buscar todas as rubricas ativas
    const rubricas = await base44.entities.Rubrica.list();
    const rubricasAtivas = rubricas.filter(r => r.ativo !== false);

    // Calcular soma total
    const totalAtual = rubricasAtivas.reduce((sum, r) => sum + (r.valor_total || 0), 0);
    const totalComAdicional = totalAtual + valor_adicional;

    const sobrecarga = totalComAdicional > ORCAMENTO_TOTAL;

    return Response.json({
      totalAtual,
      totalComAdicional,
      orcamentoTotal: ORCAMENTO_TOTAL,
      sobrecarga,
      saldoDisponivel: Math.max(0, ORCAMENTO_TOTAL - totalAtual),
      mensagem: sobrecarga 
        ? `A operação ultrapassa o orçamento total permitido de R$ ${ORCAMENTO_TOTAL.toLocaleString('pt-BR')}. Saldo disponível: R$ ${Math.max(0, ORCAMENTO_TOTAL - totalAtual).toLocaleString('pt-BR')}`
        : `Operação válida. Saldo: R$ ${(ORCAMENTO_TOTAL - totalComAdicional).toLocaleString('pt-BR')}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});