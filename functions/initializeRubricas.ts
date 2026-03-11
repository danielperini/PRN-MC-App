import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const RUBRICAS_INICIAIS = [
  { grupo: 'Equipe e gestão', rubrica: 'Coordenador Geral', numero_parcelas_unidades: '10 meses', valor_rubrica: 70000, valor_utilizado: 7000, ordem_exibicao: 1 },
  { grupo: 'Equipe e gestão', rubrica: 'Assistente de Coordenação e Produção', numero_parcelas_unidades: 'Não indicado', valor_rubrica: 50000, valor_utilizado: 5000, ordem_exibicao: 2 },
  { grupo: 'Equipe e gestão', rubrica: 'Coordenador de Comunicação', numero_parcelas_unidades: '10 meses', valor_rubrica: 60000, valor_utilizado: 6000, ordem_exibicao: 3 },
  { grupo: 'Equipe e gestão', rubrica: 'Analista Administrativo-Financeira', numero_parcelas_unidades: '10 meses', valor_rubrica: 50000, valor_utilizado: 5000, ordem_exibicao: 4 },
  { grupo: 'Equipe e gestão', rubrica: 'Assistente Administrativo', numero_parcelas_unidades: '10 meses', valor_rubrica: 40000, valor_utilizado: 4000, ordem_exibicao: 5 },
  { grupo: 'Equipe e gestão', rubrica: 'Produção MIS/MUMO/MHAB', numero_parcelas_unidades: '10 meses', valor_rubrica: 113400, valor_utilizado: 12600, ordem_exibicao: 6 },
  { grupo: 'Equipe e gestão', rubrica: 'Assessor de Imprensa', numero_parcelas_unidades: '10 meses', valor_rubrica: 27000, valor_utilizado: 3000, ordem_exibicao: 7 },
  { grupo: 'Equipe e gestão', rubrica: 'Designer', numero_parcelas_unidades: '10 meses', valor_rubrica: 52000, valor_utilizado: 5200, ordem_exibicao: 8 },
  { grupo: 'Manutenção e operação', rubrica: 'Educador MIS / MUMO / MHAB', numero_parcelas_unidades: '10 meses', valor_rubrica: 138000, valor_utilizado: 18400, ordem_exibicao: 9 },
  { grupo: 'Despesas gerais', rubrica: 'Assessoria jurídica', numero_parcelas_unidades: '1 contrato/serviço', valor_rubrica: 17000, valor_utilizado: 1700, ordem_exibicao: 10 },
];

const MAPEAMENTOS = [
  { descricao_original: 'ANALISTA ADMINISTRATIVO FINANCEIRO', rubrica_nome: 'Analista Administrativo-Financeira' },
  { descricao_original: 'ASSISTENTE DE COORDENAÇÃO', rubrica_nome: 'Assistente de Coordenação e Produção' },
  { descricao_original: 'EDUCADORA', rubrica_nome: 'Educador MIS / MUMO / MHAB' },
  { descricao_original: 'PRODUTORA', rubrica_nome: 'Produção MIS/MUMO/MHAB' },
  { descricao_original: 'ASSESSORIA JURÍDICA', rubrica_nome: 'Assessoria jurídica' },
  { descricao_original: 'COORDENADORA DE COMUNICAÇÃO', rubrica_nome: 'Coordenador de Comunicação' },
  { descricao_original: 'ASSESSORIA DE IMPRENSA', rubrica_nome: 'Assessor de Imprensa' },
  { descricao_original: 'DESIGNER', rubrica_nome: 'Designer' },
  { descricao_original: 'COORDENAÇÃO GERAL', rubrica_nome: 'Coordenador Geral' },
  { descricao_original: 'ASSISTENTE ADMINISTRATIVO', rubrica_nome: 'Assistente Administrativo' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin' && user?.role !== 'ADMIN') {
      return Response.json({ error: 'Apenas admin pode inicializar' }, { status: 403 });
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
      const rubrica = rubricas.find(r => r.rubrica === mapa.rubrica_nome);
      if (rubrica) {
        await base44.entities.MapeamentoRubricas.create({
          descricao_original: mapa.descricao_original,
          rubrica_id: rubrica.id,
          rubrica_nome: mapa.rubrica_nome,
          ativo: true,
        });
      }
    }

    return Response.json({ success: true, rubricas_created: rubricas.length, mapeamentos_created: MAPEAMENTOS.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});