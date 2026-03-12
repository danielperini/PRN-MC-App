import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Dados canônicos das rubricas do projeto
const RUBRICAS_DEFAULT = [
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Acesso restrito a coordenadores/admin' }, { status: 403 });
    }

    // Busca rubricas existentes para evitar duplicatas
    const existentes = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 200);
    const nomesExistentes = new Set(existentes.map(r => r.rubrica));

    let criados = 0;
    let atualizados = 0;

    for (const rubrica of RUBRICAS_DEFAULT) {
      const saldo = rubrica.valor_rubrica - (rubrica.valor_utilizado || 0);
      const percentual_utilizado = rubrica.valor_rubrica > 0
        ? Math.round((rubrica.valor_utilizado / rubrica.valor_rubrica) * 100)
        : 0;

      const payload = { ...rubrica, saldo, percentual_utilizado };

      if (nomesExistentes.has(rubrica.rubrica)) {
        // Já existe — atualiza apenas valores financeiros
        const existente = existentes.find(r => r.rubrica === rubrica.rubrica);
        await base44.asServiceRole.entities.Rubrica.update(existente.id, { saldo, percentual_utilizado });
        atualizados++;
      } else {
        await base44.asServiceRole.entities.Rubrica.create(payload);
        criados++;
      }
    }

    return Response.json({ success: true, criados, atualizados });
  } catch (error) {
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});