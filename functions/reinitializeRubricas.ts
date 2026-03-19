import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Dados canônicos das rubricas do projeto
// ATENÇÃO:
// - valor_utilizado NÃO deve ser fixado aqui
// - saldo e percentual_utilizado devem refletir uso real
const RUBRICAS_DEFAULT = [
  {
    grupo: 'Equipe e gestão',
    rubrica: 'Coordenador Geral',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 70000,
    observacao_uso: 'Valor utilizado calculado automaticamente',
    ativo: true,
    ordem_exibicao: 1
  },
  {
    grupo: 'Equipe e gestão',
    rubrica: 'Assistente de Coordenação e Produção',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 50000,
    observacao_uso: 'Valor utilizado calculado automaticamente',
    ativo: true,
    ordem_exibicao: 2
  },
  {
    grupo: 'Equipe e gestão',
    rubrica: 'Coordenador de Comunicação',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 60000,
    observacao_uso: 'Valor utilizado calculado automaticamente',
    ativo: true,
    ordem_exibicao: 3
  },
  {
    grupo: 'Equipe e gestão',
    rubrica: 'Analista Administrativo-Financeira',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 50000,
    observacao_uso: 'Valor utilizado calculado automaticamente',
    ativo: true,
    ordem_exibicao: 4
  },
  {
    grupo: 'Equipe e gestão',
    rubrica: 'Assistente Administrativo',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 40000,
    observacao_uso: 'Valor utilizado calculado automaticamente',
    ativo: true,
    ordem_exibicao: 5
  },
  {
    grupo: 'Equipe e gestão',
    rubrica: 'Produção MIS/MUMO/MHAB',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 113400,
    observacao_uso: 'Rubrica compartilhada entre os espaços',
    ativo: true,
    ordem_exibicao: 6
  },
  {
    grupo: 'Equipe e gestão',
    rubrica: 'Assessor de Imprensa',
    numero_parcelas_unidades: '8 meses',
    valor_rubrica: 27000,
    observacao_uso: 'Valor utilizado calculado automaticamente',
    ativo: true,
    ordem_exibicao: 7
  },
  {
    grupo: 'Equipe e gestão',
    rubrica: 'Designer',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 52000,
    observacao_uso: 'Valor utilizado calculado automaticamente',
    ativo: true,
    ordem_exibicao: 8
  },
  {
    grupo: 'Manutenção e operação',
    rubrica: 'Educador MIS / MUMO / MHAB',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 138000,
    observacao_uso: 'Rubrica compartilhada entre os espaços',
    ativo: true,
    ordem_exibicao: 9
  },
  {
    grupo: 'Despesas gerais',
    rubrica: 'Assessoria jurídica',
    numero_parcelas_unidades: '1 contrato/serviço',
    valor_rubrica: 17000,
    observacao_uso: 'Valor utilizado calculado automaticamente',
    ativo: true,
    ordem_exibicao: 10
  }
];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json(
        { error: 'Acesso restrito a coordenadores/admin' },
        { status: 403 }
      );
    }

    // Busca rubricas existentes para evitar duplicatas
    const existentes = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);
    const rubricasPorNome = {};
    for (const r of existentes || []) {
      rubricasPorNome[r.rubrica] = r;
    }

    let criados = 0;
    let atualizados = 0;

    for (const rubrica of RUBRICAS_DEFAULT) {
      const existente = rubricasPorNome[rubrica.rubrica];

      if (existente) {
        // Preserva valores financeiros reais já existentes
        const valorUtilizadoAtual = toNumber(existente.valor_utilizado);
        const valorRubricaAtualizado = toNumber(rubrica.valor_rubrica);
        const saldo = parseFloat((valorRubricaAtualizado - valorUtilizadoAtual).toFixed(2));
        const percentual_utilizado =
          valorRubricaAtualizado > 0
            ? parseFloat(((valorUtilizadoAtual / valorRubricaAtualizado) * 100).toFixed(2))
            : 0;

        await base44.asServiceRole.entities.Rubrica.update(existente.id, {
          grupo: rubrica.grupo,
          rubrica: rubrica.rubrica,
          numero_parcelas_unidades: rubrica.numero_parcelas_unidades,
          valor_rubrica: valorRubricaAtualizado,
          observacao_uso: rubrica.observacao_uso,
          ativo: rubrica.ativo,
          ordem_exibicao: rubrica.ordem_exibicao,
          saldo,
          percentual_utilizado
        });

        atualizados++;
      } else {
        // Cria nova rubrica sem uso fake
        const valorUtilizadoInicial = 0;
        const saldo = parseFloat((rubrica.valor_rubrica - valorUtilizadoInicial).toFixed(2));
        const percentual_utilizado = 0;

        await base44.asServiceRole.entities.Rubrica.create({
          grupo: rubrica.grupo,
          rubrica: rubrica.rubrica,
          numero_parcelas_unidades: rubrica.numero_parcelas_unidades,
          valor_rubrica: rubrica.valor_rubrica,
          valor_utilizado: valorUtilizadoInicial,
          observacao_uso: rubrica.observacao_uso,
          ativo: rubrica.ativo,
          ordem_exibicao: rubrica.ordem_exibicao,
          saldo,
          percentual_utilizado
        });

        criados++;
      }
    }

    // Recalcular todas as rubricas depois da inicialização/atualização
    try {
      await base44.asServiceRole.functions.invoke('recalculateAllRubricas', {
        trigger: 'reinitialize_rubricas'
      });
    } catch (e) {
      console.error('Erro ao recalcular rubricas após reinitialize:', e.message);
    }

    return Response.json({
      success: true,
      criados,
      atualizados
    });
  } catch (error) {
    return Response.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
});