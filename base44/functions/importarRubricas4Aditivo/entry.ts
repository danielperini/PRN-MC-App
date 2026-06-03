import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Rubricas do 4º Aditivo — Noturno Pampulha
// Total previsto: R$ 81.719,85
// Pasta Drive NFs: https://drive.google.com/drive/u/0/folders/1Ov9ci6Dwg297mm7QiqX1wfLIb92EZSGf
const RUBRICAS_4_ADITIVO = [
  {
    grupo: 'Contratação de artistas e atrações culturais',
    rubrica: 'Contratação de artistas e atrações – Noturno Pampulha',
    descricao: 'Cachês e contratações de artistas, bandas, DJs e atrações culturais para o Noturno Pampulha',
    valor_rubrica: 35000.00,
    unidade: 'serviço',
    quantidade: 1,
    origem_recurso: '4º ADITIVO',
    centro_custo: 'Noturno Pampulha',
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: '4º Aditivo – Noturno Pampulha',
    ordem_exibicao: 1001,
    ativo: true,
    valor_utilizado: 0,
    saldo: 35000.00,
    saldo_real: 35000.00,
    percentual_utilizado: 0,
  },
  {
    grupo: 'Produção e infraestrutura do evento',
    rubrica: 'Produção e infraestrutura – Noturno Pampulha',
    descricao: 'Locação de equipamentos, palco, som, iluminação, tendas, gerador e infraestrutura do Noturno Pampulha',
    valor_rubrica: 18500.00,
    unidade: 'serviço',
    quantidade: 1,
    origem_recurso: '4º ADITIVO',
    centro_custo: 'Noturno Pampulha',
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: '4º Aditivo – Noturno Pampulha',
    ordem_exibicao: 1002,
    ativo: true,
    valor_utilizado: 0,
    saldo: 18500.00,
    saldo_real: 18500.00,
    percentual_utilizado: 0,
  },
  {
    grupo: 'Comunicação e divulgação',
    rubrica: 'Comunicação e divulgação – Noturno Pampulha',
    descricao: 'Criação de materiais gráficos, impressão, mídia digital, fotografia e vídeo para o Noturno Pampulha',
    valor_rubrica: 9500.00,
    unidade: 'serviço',
    quantidade: 1,
    origem_recurso: '4º ADITIVO',
    centro_custo: 'Noturno Pampulha',
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: '4º Aditivo – Noturno Pampulha',
    ordem_exibicao: 1003,
    ativo: true,
    valor_utilizado: 0,
    saldo: 9500.00,
    saldo_real: 9500.00,
    percentual_utilizado: 0,
  },
  {
    grupo: 'Alimentação e hospitalidade',
    rubrica: 'Alimentação e hospitalidade – Noturno Pampulha',
    descricao: 'Coffee break, água, coquetel de abertura e despesas de hospitalidade do Noturno Pampulha',
    valor_rubrica: 4800.00,
    unidade: 'serviço',
    quantidade: 1,
    origem_recurso: '4º ADITIVO',
    centro_custo: 'Noturno Pampulha',
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: '4º Aditivo – Noturno Pampulha',
    ordem_exibicao: 1004,
    ativo: true,
    valor_utilizado: 0,
    saldo: 4800.00,
    saldo_real: 4800.00,
    percentual_utilizado: 0,
  },
  {
    grupo: 'Logística e transporte',
    rubrica: 'Logística e transporte – Noturno Pampulha',
    descricao: 'Transporte de equipe, materiais e equipamentos para o Noturno Pampulha',
    valor_rubrica: 3500.00,
    unidade: 'serviço',
    quantidade: 1,
    origem_recurso: '4º ADITIVO',
    centro_custo: 'Noturno Pampulha',
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: '4º Aditivo – Noturno Pampulha',
    ordem_exibicao: 1005,
    ativo: true,
    valor_utilizado: 0,
    saldo: 3500.00,
    saldo_real: 3500.00,
    percentual_utilizado: 0,
  },
  {
    grupo: 'Segurança e monitoramento',
    rubrica: 'Segurança e monitoramento – Noturno Pampulha',
    descricao: 'Serviços de segurança patrimonial e controle de acesso do Noturno Pampulha',
    valor_rubrica: 4200.00,
    unidade: 'serviço',
    quantidade: 1,
    origem_recurso: '4º ADITIVO',
    centro_custo: 'Noturno Pampulha',
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: '4º Aditivo – Noturno Pampulha',
    ordem_exibicao: 1006,
    ativo: true,
    valor_utilizado: 0,
    saldo: 4200.00,
    saldo_real: 4200.00,
    percentual_utilizado: 0,
  },
  {
    grupo: 'Equipe técnica e coordenação do evento',
    rubrica: 'Equipe técnica e coordenação – Noturno Pampulha',
    descricao: 'Coordenação geral, produção executiva, técnicos de palco e operadores de equipamentos',
    valor_rubrica: 6219.85,
    unidade: 'serviço',
    quantidade: 1,
    origem_recurso: '4º ADITIVO',
    centro_custo: 'Noturno Pampulha',
    museu_codigo: 'NOTURNO',
    escopo_orcamentario: 'NOTURNO',
    natureza_despesa: '339039',
    nome_natureza: 'Serviços de terceiros - Pessoa jurídica',
    meta: '4º Aditivo – Noturno Pampulha',
    ordem_exibicao: 1007,
    ativo: true,
    valor_utilizado: 0,
    saldo: 6219.85,
    saldo_real: 6219.85,
    percentual_utilizado: 0,
  },
];

// Verificação: soma = 35000 + 18500 + 9500 + 4800 + 3500 + 4200 + 6219.85 = 81719.85 ✓

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a administradores.' }, { status: 403 });
    }

    // Verifica se já existem rubricas do 4º Aditivo para evitar duplicação
    const existentes = await base44.asServiceRole.entities.Rubrica.filter({
      origem_recurso: '4º ADITIVO'
    });

    if (Array.isArray(existentes) && existentes.length > 0) {
      return Response.json({
        success: false,
        message: `Já existem ${existentes.length} rubricas do 4º Aditivo. Use mode=force para reimportar.`,
        existentes: existentes.length,
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = body?.mode || 'safe';

    // Se mode=force, remove as existentes antes de reimportar
    if (mode === 'force' && Array.isArray(existentes) && existentes.length > 0) {
      for (const r of existentes) {
        await base44.asServiceRole.entities.Rubrica.delete(r.id);
      }
    }

    const criadas = [];
    const erros = [];

    for (const rubrica of RUBRICAS_4_ADITIVO) {
      const chave = `${rubrica.grupo}::${rubrica.rubrica}::${rubrica.meta}`;
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

    const totalCriado = criadas.reduce((acc, _, i) => acc + (RUBRICAS_4_ADITIVO[i]?.valor_rubrica || 0), 0);

    return Response.json({
      success: true,
      criadas: criadas.length,
      erros,
      totalPrevisto: 81719.85,
      totalCriado: Number(totalCriado.toFixed(2)),
      message: `${criadas.length} rubricas do 4º Aditivo inseridas com sucesso. Total: R$ 81.719,85`,
      pastaDriveNFs: 'https://drive.google.com/drive/u/0/folders/1Ov9ci6Dwg297mm7QiqX1wfLIb92EZSGf',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});