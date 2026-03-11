import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const rubricas = [
      { grupo: 'Equipe e gestão', rubrica: 'Coordenador Geral', numero_parcelas_unidades: '10 meses', valor_rubrica: 70000, valor_utilizado: 7000, observacao_uso: 'Valor utilizado acumulado', ativo: true, ordem_exibicao: 1 },
      { grupo: 'Equipe e gestão', rubrica: 'Assistente de Coordenação e Produção', numero_parcelas_unidades: 'Não indicado', valor_rubrica: 50000, valor_utilizado: 5000, observacao_uso: 'Valor utilizado acumulado', ativo: true, ordem_exibicao: 2 },
      { grupo: 'Equipe e gestão', rubrica: 'Coordenador de Comunicação', numero_parcelas_unidades: '10 meses', valor_rubrica: 60000, valor_utilizado: 6000, observacao_uso: 'Valor utilizado acumulado', ativo: true, ordem_exibicao: 3 },
      { grupo: 'Equipe e gestão', rubrica: 'Analista Administrativo-Financeira', numero_parcelas_unidades: '10 meses', valor_rubrica: 50000, valor_utilizado: 5000, observacao_uso: 'Valor utilizado acumulado', ativo: true, ordem_exibicao: 4 },
      { grupo: 'Equipe e gestão', rubrica: 'Assistente Administrativo', numero_parcelas_unidades: '10 meses', valor_rubrica: 40000, valor_utilizado: 4000, observacao_uso: 'Valor utilizado acumulado', ativo: true, ordem_exibicao: 5 },
      { grupo: 'Equipe e gestão', rubrica: 'Produção MIS/MUMO/MHAB', numero_parcelas_unidades: '10 meses', valor_rubrica: 113400, valor_utilizado: 12600, observacao_uso: 'Soma de 3 produtoras', ativo: true, ordem_exibicao: 6 },
      { grupo: 'Equipe e gestão', rubrica: 'Assessor de Imprensa', numero_parcelas_unidades: '10 meses', valor_rubrica: 27000, valor_utilizado: 3000, observacao_uso: 'Valor utilizado acumulado', ativo: true, ordem_exibicao: 7 },
      { grupo: 'Equipe e gestão', rubrica: 'Designer', numero_parcelas_unidades: '10 meses', valor_rubrica: 52000, valor_utilizado: 5200, observacao_uso: 'Soma de 2 designers', ativo: true, ordem_exibicao: 8 },
      { grupo: 'Manutenção e operação', rubrica: 'Educador MIS / MUMO / MHAB', numero_parcelas_unidades: '10 meses', valor_rubrica: 138000, valor_utilizado: 18400, observacao_uso: 'Soma de 4 educadoras', ativo: true, ordem_exibicao: 9 },
      { grupo: 'Despesas gerais', rubrica: 'Assessoria jurídica', numero_parcelas_unidades: '1 contrato/serviço', valor_rubrica: 17000, valor_utilizado: 1700, observacao_uso: 'Valor utilizado acumulado', ativo: true, ordem_exibicao: 10 },
    ];

    const mapeamentos = [
      { termo_origem: 'ANALISTA ADMINISTRATIVO FINANCEIRO', rubrica_destino: 'Analista Administrativo-Financeira', ativo: true },
      { termo_origem: 'ASSISTENTE DE COORDENAÇÃO', rubrica_destino: 'Assistente de Coordenação e Produção', ativo: true },
      { termo_origem: 'EDUCADORA', rubrica_destino: 'Educador MIS / MUMO / MHAB', ativo: true },
      { termo_origem: 'PRODUTORA', rubrica_destino: 'Produção MIS/MUMO/MHAB', ativo: true },
      { termo_origem: 'ASSESSORIA JURÍDICA', rubrica_destino: 'Assessoria jurídica', ativo: true },
      { termo_origem: 'COORDENADORA DE COMUNICAÇÃO', rubrica_destino: 'Coordenador de Comunicação', ativo: true },
      { termo_origem: 'ASSESSORIA DE IMPRENSA', rubrica_destino: 'Assessor de Imprensa', ativo: true },
      { termo_origem: 'DESIGNER', rubrica_destino: 'Designer', ativo: true },
      { termo_origem: 'COORDENAÇÃO GERAL', rubrica_destino: 'Coordenador Geral', ativo: true },
      { termo_origem: 'ASSISTENTE ADMINISTRATIVO', rubrica_destino: 'Assistente Administrativo', ativo: true },
    ];

    let criadosRubricas = 0;
    let criadosMapeamentos = 0;

    for (const rubrica of rubricas) {
      const saldo = rubrica.valor_rubrica - (rubrica.valor_utilizado || 0);
      const percentualUtilizado = rubrica.valor_rubrica > 0 ? Math.round((rubrica.valor_utilizado / rubrica.valor_rubrica) * 100) : 0;
      try {
        await base44.entities.Rubrica.create({
          ...rubrica,
          saldo,
          percentual_utilizado: percentualUtilizado,
        });
        criadosRubricas++;
      } catch (e) {
        console.log(`Rubrica ${rubrica.rubrica} já existe`);
      }
    }

    for (const mapeamento of mapeamentos) {
      try {
        await base44.entities.MapeamentoRubricas.create(mapeamento);
        criadosMapeamentos++;
      } catch (e) {
        console.log(`Mapeamento ${mapeamento.termo_origem} já existe`);
      }
    }

    return Response.json({
      success: true,
      rubricas_criadas: criadosRubricas,
      mapeamentos_criados: criadosMapeamentos,
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});