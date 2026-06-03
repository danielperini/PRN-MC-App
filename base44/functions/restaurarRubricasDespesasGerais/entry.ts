import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Dados oficiais das 5 rubricas de Despesas Gerais (Meta 23)
const RUBRICAS_OFICIAIS_DESPESAS_GERAIS = [
  { rubrica: 'Transporte', valor_total: 4000, unidade: 'mês', periodo_frequencia: 10, valor_unitario: 400, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '04', pagina_pdf: 44, museu_codigo: 'GERAL', escopo_orcamentario: 'GERAL' },
  { rubrica: 'Material escritório', valor_total: 2700, unidade: 'mês', periodo_frequencia: 9, valor_unitario: 300, natureza_despesa: '339030', nome_natureza: 'Material de consumo', numero_natureza: '12', pagina_pdf: 44, museu_codigo: 'GERAL', escopo_orcamentario: 'GERAL' },
  { rubrica: 'Assessoria Jurídica', valor_total: 17000, unidade: 'mês', periodo_frequencia: 10, valor_unitario: 1700, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '46', pagina_pdf: 44, museu_codigo: 'GERAL', escopo_orcamentario: 'GERAL' },
  { rubrica: 'Energia elétrica', valor_total: 4500, unidade: 'mês', periodo_frequencia: 10, valor_unitario: 450, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '04', pagina_pdf: 44, museu_codigo: 'GERAL', escopo_orcamentario: 'GERAL' },
  { rubrica: 'Contador', valor_total: 10000, unidade: 'mês', periodo_frequencia: 10, valor_unitario: 1000, natureza_despesa: '339039', nome_natureza: 'Serviços de terceiros - Pessoa jurídica', numero_natureza: '42', pagina_pdf: 44, museu_codigo: 'GERAL', escopo_orcamentario: 'GERAL' },
];

/**
 * Restaura as 4 rubricas de Despesas Gerais que faltam:
 * - Transporte — R$ 4.000,00 (utilizado: 0)
 * - Assessoria Jurídica — R$ 17.000,00 (utilizado: 3.200)
 * - Energia elétrica — R$ 4.500,00 (utilizado: 1.350)
 * - Contador — R$ 10.000,00 (utilizado: 1.000)
 * 
 * Mantém "Material escritório" que já existe (utilizado: 75).
 * Não apaga lançamentos, não altera solicitações/notas/histórico.
 * Apenas reativa/cria rubricas oficiais e recalcula saldos.
 */

const VALORES_UTILIZADOS = {
  'Transporte': 0,
  'Material escritório': 75,
  'Assessoria Jurídica': 3200,
  'Energia elétrica': 1350,
  'Contador': 1000,
};

function normalizeStr(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function findRubricaOficial(rubricaNome) {
  const nomeNorm = normalizeStr(rubricaNome);
  return RUBRICAS_OFICIAIS_DESPESAS_GERAIS.find(r => normalizeStr(r.rubrica) === nomeNorm);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    // Busca todas as rubricas (ativas e inativas) de Despesas Gerais
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.filter({ grupo: 'Despesas Gerais' });
    
    const log = [];
    const restauradas = [];

    for (const oficial of RUBRICAS_OFICIAIS_DESPESAS_GERAIS) {
      const valorUtilizado = VALORES_UTILIZADOS[oficial.rubrica] || 0;

      // Verifica se já existe (ativa ou inativa)
      const existente = todasRubricas.find(
        rb => normalizeStr(rb.rubrica) === normalizeStr(oficial.rubrica)
      );

      if (existente) {
        if (!existente.ativo) {
          // Reativa a rubrica inativa
          await base44.asServiceRole.entities.Rubrica.update(existente.id, {
            ativo: true,
            valor_rubrica: oficial.valor_total,
            valor_utilizado: valorUtilizado,
            saldo: oficial.valor_total - valorUtilizado,
            saldo_real: oficial.valor_total - valorUtilizado,
            percentual_utilizado: (valorUtilizado / oficial.valor_total) * 100,
            origem_recurso: '3º ADITIVO',
            oficial_3_aditivo: true,
            fonte_importacao: 'rubricas_oficiais_3_aditivo_tabela_colada',
            museu_codigo: oficial.museu_codigo,
            escopo_orcamentario: oficial.escopo_orcamentario,
            centro_custo: 'Geral/Transversal',
          });
          log.push({ rubrica: oficial.rubrica, status: 'reativada', id: existente.id, valor_previsto: oficial.valor_total, valor_utilizado: valorUtilizado });
          restauradas.push(existente.id);
        } else {
          // Já existe e está ativa - atualiza valores
          await base44.asServiceRole.entities.Rubrica.update(existente.id, {
            valor_rubrica: oficial.valor_total,
            valor_utilizado: valorUtilizado,
            saldo: oficial.valor_total - valorUtilizado,
            saldo_real: oficial.valor_total - valorUtilizado,
            percentual_utilizado: (valorUtilizado / oficial.valor_total) * 100,
          });
          log.push({ rubrica: oficial.rubrica, status: 'atualizada', id: existente.id, valor_previsto: oficial.valor_total, valor_utilizado: valorUtilizado });
        }
      } else {
        // Cria nova rubrica oficial
        const novaRubrica = {
          rubrica: oficial.rubrica,
          nome: oficial.rubrica,
          item_rubrica: oficial.rubrica,
          grupo: 'Despesas Gerais',
          nome_natureza: oficial.nome_natureza,
          meta: '23 - Despesas Gerais',
          natureza_despesa: oficial.natureza_despesa,
          numero_natureza: oficial.numero_natureza,
          descricao: null,
          unidade: oficial.unidade,
          quantidade: 1,
          periodo_frequencia: oficial.periodo_frequencia,
          numero_parcelas_unidades: String(oficial.periodo_frequencia),
          valor_unitario: oficial.valor_unitario,
          valor_rubrica: oficial.valor_total,
          valor_total: oficial.valor_total,
          conferencia_valor: oficial.valor_total,
          origem_recurso: '3º ADITIVO',
          pagina_pdf: oficial.pagina_pdf,
          museu_codigo: oficial.museu_codigo,
          escopo_orcamentario: oficial.escopo_orcamentario,
          centro_custo: 'Geral/Transversal',
          valor_utilizado: valorUtilizado,
          saldo: oficial.valor_total - valorUtilizado,
          saldo_real: oficial.valor_total - valorUtilizado,
          percentual_utilizado: (valorUtilizado / oficial.valor_total) * 100,
          observacao_uso: null,
          ativo: true,
          ordem_exibicao: 100,
          _chave_oficial: `despesas gerais::${normalizeStr(oficial.rubrica)}::23 - despesas gerais::${oficial.museu_codigo}::${oficial.escopo_orcamentario}`,
        };

        const criado = await base44.asServiceRole.entities.Rubrica.create(novaRubrica);
        log.push({ rubrica: oficial.rubrica, status: 'criada', id: criado.id, valor_previsto: oficial.valor_total, valor_utilizado: valorUtilizado });
        restauradas.push(criado.id);
      }

      await new Promise(resolve => setTimeout(resolve, 80));
    }

    // Recalcula total geral
    const rubricasAtivas = await base44.asServiceRole.entities.Rubrica.filter({ ativo: true, origem_recurso: '3º ADITIVO' });
    const totalAtivo = rubricasAtivas.reduce((acc, r) => acc + (r.valor_rubrica || 0), 0);

    return Response.json({
      sucesso: true,
      restauradas: restauradas.length,
      total_previsto_ativo: totalAtivo,
      esperado: 1320000,
      diferenca: totalAtivo - 1320000,
      log,
    });
  } catch (error) {
    return Response.json({ erro: error.message, stack: error.stack }, { status: 500 });
  }
});