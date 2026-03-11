import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const RUBRICAS_INICIAIS = [
  { 
    grupo: 'Equipe e gestão',
    rubrica: 'Coordenador Geral',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 70000,
    valor_utilizado: 7000,
    observacao_uso: 'Valor utilizado acumulado',
    ordem_exibicao: 1
  },
  { 
    grupo: 'Equipe e gestão',
    rubrica: 'Assistente de Coordenação e Produção',
    numero_parcelas_unidades: 'Não indicado',
    valor_rubrica: 50000,
    valor_utilizado: 5000,
    observacao_uso: 'Valor utilizado acumulado',
    ordem_exibicao: 2
  },
  { 
    grupo: 'Equipe e gestão',
    rubrica: 'Coordenador de Comunicação',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 60000,
    valor_utilizado: 6000,
    observacao_uso: 'Valor utilizado acumulado',
    ordem_exibicao: 3
  },
  { 
    grupo: 'Equipe e gestão',
    rubrica: 'Analista Administrativo-Financeira',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 50000,
    valor_utilizado: 5000,
    observacao_uso: 'Valor utilizado acumulado',
    ordem_exibicao: 4
  },
  { 
    grupo: 'Equipe e gestão',
    rubrica: 'Assistente Administrativo',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 40000,
    valor_utilizado: 4000,
    observacao_uso: 'Valor utilizado acumulado',
    ordem_exibicao: 5
  },
  { 
    grupo: 'Equipe e gestão',
    rubrica: 'Produção MIS/MUMO/MHAB',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 113400,
    valor_utilizado: 12600,
    observacao_uso: 'Soma de 3 produtoras',
    ordem_exibicao: 6
  },
  { 
    grupo: 'Equipe e gestão',
    rubrica: 'Assessor de Imprensa',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 27000,
    valor_utilizado: 3000,
    observacao_uso: 'Valor utilizado acumulado',
    ordem_exibicao: 7
  },
  { 
    grupo: 'Equipe e gestão',
    rubrica: 'Designer',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 52000,
    valor_utilizado: 5200,
    observacao_uso: 'Soma de 2 designers',
    ordem_exibicao: 8
  },
  { 
    grupo: 'Manutenção e operação',
    rubrica: 'Educador MIS / MUMO / MHAB',
    numero_parcelas_unidades: '10 meses',
    valor_rubrica: 138000,
    valor_utilizado: 18400,
    observacao_uso: 'Soma de 4 educadoras',
    ordem_exibicao: 9
  },
  { 
    grupo: 'Despesas gerais',
    rubrica: 'Assessoria jurídica',
    numero_parcelas_unidades: '1 contrato/serviço',
    valor_rubrica: 17000,
    valor_utilizado: 1700,
    observacao_uso: 'Valor utilizado acumulado',
    ordem_exibicao: 10
  },
];

const MAPEAMENTOS = [
  { termo_origem: 'ANALISTA ADMINISTRATIVO FINANCEIRO', rubrica_destino: 'Analista Administrativo-Financeira' },
  { termo_origem: 'ASSISTENTE DE COORDENAÇÃO', rubrica_destino: 'Assistente de Coordenação e Produção' },
  { termo_origem: 'EDUCADORA', rubrica_destino: 'Educador MIS / MUMO / MHAB' },
  { termo_origem: 'PRODUTORA', rubrica_destino: 'Produção MIS/MUMO/MHAB' },
  { termo_origem: 'ASSESSORIA JURÍDICA', rubrica_destino: 'Assessoria jurídica' },
  { termo_origem: 'COORDENADORA DE COMUNICAÇÃO', rubrica_destino: 'Coordenador de Comunicação' },
  { termo_origem: 'ASSESSORIA DE IMPRENSA', rubrica_destino: 'Assessor de Imprensa' },
  { termo_origem: 'DESIGNER', rubrica_destino: 'Designer' },
  { termo_origem: 'COORDENAÇÃO GERAL', rubrica_destino: 'Coordenador Geral' },
  { termo_origem: 'ASSISTENTE ADMINISTRATIVO', rubrica_destino: 'Assistente Administrativo' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin' && user?.role !== 'ADMIN') {
      return Response.json({ error: 'Apenas admin pode inicializar' }, { status: 403 });
    }

    // Limpar dados existentes (opcional)
    const existingRubricas = await base44.entities.Rubrica.list('', 100);
    if (existingRubricas.length > 0) {
      return Response.json({ success: false, message: 'Rubricas já existem. Delete manualmente se quiser reinicializar.' });
    }

    // Criar rubricas
    const rubricas = [];
    for (const rubrica_data of RUBRICAS_INICIAIS) {
      const saldo = rubrica_data.valor_rubrica - rubrica_data.valor_utilizado;
      const percentual_utilizado = (rubrica_data.valor_utilizado / rubrica_data.valor_rubrica) * 100;
      
      const created = await base44.entities.Rubrica.create({
        ...rubrica_data,
        saldo,
        percentual_utilizado,
        ativo: true,
      });
      rubricas.push(created);
    }

    // Criar mapeamentos
    for (const mapa of MAPEAMENTOS) {
      await base44.entities.MapeamentoRubricas.create({
        termo_origem: mapa.termo_origem,
        rubrica_destino: mapa.rubrica_destino,
        ativo: true,
      });
    }

    const totalValor = RUBRICAS_INICIAIS.reduce((sum, r) => sum + r.valor_rubrica, 0);
    const totalUtilizado = RUBRICAS_INICIAIS.reduce((sum, r) => sum + r.valor_utilizado, 0);

    return Response.json({ 
      success: true, 
      rubricas_created: rubricas.length, 
      mapeamentos_created: MAPEAMENTOS.length,
      totais: {
        valor_total: totalValor,
        valor_utilizado: totalUtilizado,
        saldo_total: totalValor - totalUtilizado,
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});