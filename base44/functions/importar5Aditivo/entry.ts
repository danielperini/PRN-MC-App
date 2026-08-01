import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const RUBRICAS_5_ADITIVO = [
  {
    rubrica: 'Coordenador Geral (Simpósio)',
    grupo: 'Simpósio do Patrimônio Cultural de BH',
    natureza_despesa: '339039',
    codigo: '42',
    unidade: 'Serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 3000,
    valor_rubrica: 3000,
  },
  {
    rubrica: 'Produção',
    grupo: 'Simpósio do Patrimônio Cultural de BH',
    natureza_despesa: '339039',
    codigo: '42',
    unidade: 'Serviço',
    quantidade: 1,
    periodo_frequencia: 1,
    valor_unitario: 2500,
    valor_rubrica: 2500,
  },
  {
    rubrica: 'Apresentações culturais',
    grupo: 'Simpósio do Patrimônio Cultural de BH',
    natureza_despesa: '339039',
    codigo: '22',
    unidade: 'Serviço',
    quantidade: 1,
    periodo_frequencia: 2,
    valor_unitario: 3350,
    valor_rubrica: 6700,
  },
  {
    rubrica: 'Monitores (Diárias)',
    grupo: 'Simpósio do Patrimônio Cultural de BH',
    natureza_despesa: '339039',
    codigo: '42',
    unidade: 'Serviço',
    quantidade: 2,
    periodo_frequencia: 1,
    valor_unitario: 300,
    valor_rubrica: 600,
  },
  {
    rubrica: 'Material Educativo (kit)',
    grupo: 'Simpósio do Patrimônio Cultural de BH',
    natureza_despesa: '339030',
    codigo: '12',
    unidade: 'Unidade',
    quantidade: 80,
    periodo_frequencia: 1,
    valor_unitario: 37.5,
    valor_rubrica: 3000,
  },
];

const SOMA_ESPERADA = 15800;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: apenas admins' }, { status: 403 });

    const sr = base44.asServiceRole;
    const erros = [];

    // --- 1. Validar soma das rubricas ---
    const somaCalculada = RUBRICAS_5_ADITIVO.reduce((acc, r) => acc + r.valor_rubrica, 0);
    if (Math.abs(somaCalculada - SOMA_ESPERADA) > 0.01) {
      return Response.json({
        error: `Soma das rubricas (R$${somaCalculada}) diverge do esperado (R$${SOMA_ESPERADA}). Operação abortada.`
      }, { status: 400 });
    }

    // --- 2. Criar ou obter a meta ---
    let metaCriada = false;
    let metaId = '';

    const metasExistentes = await sr.entities.ProjectMeta.filter({});
    const metaExistente = metasExistentes.find(
      (m) => m.nome && m.nome.includes('Simpósio') && m.nome.includes('Patrimônio')
    );

    if (metaExistente) {
      metaId = metaExistente.id;
    } else {
      // Verificar se ordem 24 já está em uso
      const ordemEmUso = metasExistentes.some((m) => m.ordem === 24);
      let ordemFinal = 24;
      if (ordemEmUso) {
        const ordensUsadas = new Set(metasExistentes.map((m) => m.ordem).filter(Boolean));
        ordemFinal = 24;
        while (ordensUsadas.has(ordemFinal)) {
          ordemFinal++;
        }
      }

      const novaMeta = await sr.entities.ProjectMeta.create({
        nome: '3º Simpósio do Patrimônio Cultural de BH',
        descricao: 'Realização do 3º Simpósio do Patrimônio Cultural de Belo Horizonte no MHAB — 5º Aditivo. Valor acrescido: R$15.800,00.',
        ativo: true,
        ordem: ordemFinal,
      });
      metaId = novaMeta.id;
      metaCriada = true;
    }

    // --- 3. Criar rubricas com idempotência ---
    let rubricasCriadas = 0;

    for (const rubrica of RUBRICAS_5_ADITIVO) {
      const chaveOficial = `5º Aditivo|${rubrica.natureza_despesa}|${rubrica.codigo}|${rubrica.rubrica}`;

      // Verificar se já existe pelo _chave_oficial
      const existentes = await sr.entities.Rubrica.filter({ _chave_oficial: chaveOficial });
      if (existentes && existentes.length > 0) {
        // já existe — pular
        continue;
      }

      await sr.entities.Rubrica.create({
        rubrica: rubrica.rubrica,
        nome: rubrica.rubrica,
        item_rubrica: rubrica.rubrica,
        grupo: rubrica.grupo,
        natureza_despesa: rubrica.natureza_despesa,
        codigo: rubrica.codigo,
        unidade: rubrica.unidade,
        quantidade: rubrica.quantidade,
        periodo_frequencia: rubrica.periodo_frequencia,
        valor_unitario: rubrica.valor_unitario,
        valor_rubrica: rubrica.valor_rubrica,
        valor_total: rubrica.valor_rubrica,
        saldo: rubrica.valor_rubrica,
        saldo_real: rubrica.valor_rubrica,
        valor_utilizado: 0,
        percentual_utilizado: 0,
        origem_recurso: '5º ADITIVO',
        meta: '24 – Realizar Simpósio do Patrimônio Cultural de BH',
        meta_titulo: '3º Simpósio do Patrimônio Cultural de BH',
        meta_manual_ids: [],
        centro_custo: 'Geral/Transversal',
        museu_codigo: 'MHAB',
        ativo: true,
        _chave_oficial: chaveOficial,
      });
      rubricasCriadas++;
    }

    // --- 4. Disparar recálculo de saldos ---
    try {
      await sr.functions.invoke('recalcularSaldosRubricas', {});
    } catch (recalcErr) {
      erros.push(`Aviso: recálculo de saldos falhou — ${recalcErr.message}`);
    }

    return Response.json({
      success: true,
      meta_criada: metaCriada,
      meta_id: metaId,
      rubricas_criadas: rubricasCriadas,
      total_valor: somaCalculada,
      erros,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});