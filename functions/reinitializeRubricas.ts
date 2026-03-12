import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Qualquer usuário autenticado pode inicializar rubricas vazias
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Dados das rubricas com valores atualizados
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

    let criadosRubricas = 0;

    for (const rubrica of rubricas) {
      const saldo = rubrica.valor_rubrica - (rubrica.valor_utilizado || 0);
      const percentualUtilizado = rubrica.valor_rubrica > 0 
        ? Math.round((rubrica.valor_utilizado / rubrica.valor_rubrica) * 100) 
        : 0;
      
      try {
        await base44.asServiceRole.entities.Rubrica.create({
          ...rubrica,
          saldo,
          percentual_utilizado: percentualUtilizado,
        });
        criadosRubricas++;
      } catch (e) {
        // Tenta atualizar se já existe
        try {
          const existentes = await base44.asServiceRole.entities.Rubrica.filter({ rubrica: rubrica.rubrica });
          if (existentes.length > 0) {
            await base44.asServiceRole.entities.Rubrica.update(existentes[0].id, {
              valor_utilizado: rubrica.valor_utilizado,
              saldo,
              percentual_utilizado: percentualUtilizado,
            });
            criadosRubricas++;
          }
        } catch (ee) {
          console.log(`Erro ao processar rubrica ${rubrica.rubrica}: ${ee.message}`);
        }
      }
    }

    return Response.json({
      success: true,
      rubricas_processadas: criadosRubricas,
    });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});