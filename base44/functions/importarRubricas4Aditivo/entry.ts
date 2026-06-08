import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Rubricas oficiais do 4º Aditivo — Noturno Pampulha
// Total previsto: R$ 81.719,85
const GRUPO_4_ADITIVO = 'Noturno nos Museus 2026 - Museus Pampulha';
const META_4_ADITIVO = '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus';
const ORIGEM_4_ADITIVO = '4º ADITIVO';
const CENTRO_CUSTO_4_ADITIVO = 'Noturno Pampulha';
const TOTAL_4_ADITIVO = 81719.85;

const RUBRICAS_4_ADITIVO = [
  {
    grupo: GRUPO_4_ADITIVO,
    rubrica: 'Apresentações culturais no MCK, MAP e Casa do Baile',
    descricao: 'Apresentações culturais vinculadas ao Noturno nos Museus Pampulha, nos equipamentos MCK, MAP e Casa do Baile.',
    valor_rubrica: 30000.00,
    valor_total: 30000.00,
    valor_unitario: 30000.00,
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    origem_recurso: ORIGEM_4_ADITIVO,
    centro_custo: CENTRO_CUSTO_4_ADITIVO,
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: META_4_ADITIVO,
    ordem_exibicao: 1001,
    ativo: true,
    valor_utilizado: 0,
    saldo: 30000.00,
    saldo_real: 30000.00,
    percentual_utilizado: 0,
  },
  {
    grupo: GRUPO_4_ADITIVO,
    rubrica: 'Infraestrutura e iluminação',
    descricao: 'Infraestrutura e iluminação vinculadas ao Noturno nos Museus Pampulha.',
    valor_rubrica: 30000.00,
    valor_total: 30000.00,
    valor_unitario: 30000.00,
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    origem_recurso: ORIGEM_4_ADITIVO,
    centro_custo: CENTRO_CUSTO_4_ADITIVO,
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: META_4_ADITIVO,
    ordem_exibicao: 1002,
    ativo: true,
    valor_utilizado: 0,
    saldo: 30000.00,
    saldo_real: 30000.00,
    percentual_utilizado: 0,
  },
  {
    grupo: GRUPO_4_ADITIVO,
    rubrica: 'Produtor',
    descricao: 'Serviço de produção vinculado ao Noturno nos Museus Pampulha.',
    valor_rubrica: 10469.85,
    valor_total: 10469.85,
    valor_unitario: 10469.85,
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    origem_recurso: ORIGEM_4_ADITIVO,
    centro_custo: CENTRO_CUSTO_4_ADITIVO,
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: META_4_ADITIVO,
    ordem_exibicao: 1003,
    ativo: true,
    valor_utilizado: 0,
    saldo: 10469.85,
    saldo_real: 10469.85,
    percentual_utilizado: 0,
  },
  {
    grupo: GRUPO_4_ADITIVO,
    rubrica: 'Sinalização',
    descricao: 'Sinalização vinculada ao Noturno nos Museus Pampulha.',
    valor_rubrica: 11250.00,
    valor_total: 11250.00,
    valor_unitario: 11250.00,
    unidade: 'serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    origem_recurso: ORIGEM_4_ADITIVO,
    centro_custo: CENTRO_CUSTO_4_ADITIVO,
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: META_4_ADITIVO,
    ordem_exibicao: 1004,
    ativo: true,
    valor_utilizado: 0,
    saldo: 11250.00,
    saldo_real: 11250.00,
    percentual_utilizado: 0,
  },
];

function getValorUtilizado(rubrica: any) {
  return Number(rubrica?.valor_utilizado || rubrica?.utilizado || 0);
}

function chaveOficial(rubrica: any) {
  return `${rubrica.grupo}::${rubrica.rubrica}::${rubrica.meta}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = body?.mode || 'safe';

    const existentes = await base44.asServiceRole.entities.Rubrica.filter({
      origem_recurso: ORIGEM_4_ADITIVO,
    });

    if (Array.isArray(existentes) && existentes.length > 0 && mode !== 'force') {
      return Response.json({
        success: false,
        message: `Já existem ${existentes.length} rubricas do 4º Aditivo. Use mode=force apenas após conferir que não há valores utilizados nas rubricas antigas.`,
        existentes: existentes.length,
        totalOficial: TOTAL_4_ADITIVO,
      });
    }

    const comUtilizado = (existentes || []).filter((r: any) => getValorUtilizado(r) > 0);
    if (mode === 'force' && comUtilizado.length > 0) {
      return Response.json({
        success: false,
        message: 'Reimportação bloqueada: existem rubricas do 4º Aditivo com valor utilizado. Migre ou audite os vínculos antes de reimportar para evitar perda de histórico.',
        rubricasComUtilizado: comUtilizado.map((r: any) => ({
          id: r.id,
          rubrica: r.rubrica,
          valor_utilizado: getValorUtilizado(r),
        })),
      }, { status: 409 });
    }

    const inativadas = [];
    if (mode === 'force' && Array.isArray(existentes) && existentes.length > 0) {
      for (const r of existentes) {
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          ativo: false,
          observacao_uso: `${r.observacao_uso || ''}\nInativada automaticamente antes da reimportação segura das rubricas oficiais do 4º Aditivo em ${new Date().toISOString()}.`.trim(),
        });
        inativadas.push(r.id);
      }
    }

    const criadas = [];
    const erros = [];

    for (const rubrica of RUBRICAS_4_ADITIVO) {
      const chave = chaveOficial(rubrica);
      try {
        const nova = await base44.asServiceRole.entities.Rubrica.create({
          ...rubrica,
          _chave_oficial: chave,
        });
        criadas.push(nova.id);
      } catch (err) {
        erros.push({ rubrica: rubrica.rubrica, erro: err.message });
      }
    }

    const totalCriado = RUBRICAS_4_ADITIVO.reduce((acc, r) => acc + (r.valor_rubrica || 0), 0);

    return Response.json({
      success: true,
      criadas: criadas.length,
      inativadas: inativadas.length,
      erros,
      totalPrevisto: TOTAL_4_ADITIVO,
      totalCriado: Number(totalCriado.toFixed(2)),
      message: `${criadas.length} rubricas oficiais do 4º Aditivo inseridas com sucesso. Total: R$ 81.719,85`,
      rubricas: RUBRICAS_4_ADITIVO.map((r) => ({ rubrica: r.rubrica, valor_rubrica: r.valor_rubrica })),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
