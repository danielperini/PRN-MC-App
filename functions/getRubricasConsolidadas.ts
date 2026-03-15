import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Mapeamento de grupos/nomes de rubricas para categoria_key dos cards
// Ordem importa: mais específico primeiro
const KEYWORD_TO_CATEGORIA = [
  ['exposi', 'exposicao'],
  ['expograf', 'exposicao'],
  ['som e luz', 'som_luz'],
  ['som/luz', 'som_luz'],
  ['som e l', 'som_luz'],
  ['acao educativa', 'acoes_educativas'],
  ['ações educativas', 'acoes_educativas'],
  ['acoes educativas', 'acoes_educativas'],
  ['diaria', 'diarias_educador'],
  ['diária', 'diarias_educador'],
  ['lanche', 'lanches'],
  ['buffet', 'lanches'],
  ['alimentac', 'alimentacao_cartao'],
  ['cartao', 'alimentacao_cartao'],
  ['cartão', 'alimentacao_cartao'],
  ['material', 'material'],
  ['manutenc', 'manutencao'],
  ['manuten', 'manutencao'],
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

function inferirCategoria(rubrica) {
  const texto = ((rubrica.grupo || '') + ' ' + (rubrica.rubrica || '')).toLowerCase();
  for (const [keyword, cat] of KEYWORD_TO_CATEGORIA) {
    if (texto.includes(keyword)) return cat;
  }
  return null;
}

function inferirMuseus(rubrica) {
  const texto = ((rubrica.grupo || '') + ' ' + (rubrica.rubrica || '') + ' ' + (rubrica.observacao_uso || '')).toLowerCase();
  
  // Exposição só vai para MUMO
  if (texto.includes('exposi') || texto.includes('expograf')) {
    return ['MUMO'];
  }
  
  // Se menciona museu específico
  const museusMencionados = MUSEUS.filter(m => texto.includes(m.toLowerCase()));
  if (museusMencionados.length > 0) return museusMencionados;
  
  // Default: todos os museus
  return MUSEUS;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação (qualquer usuário autenticado pode visualizar)
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Leitura via service role para garantir acesso aos dados de cálculo
    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);
    const configs = await base44.asServiceRole.entities.RubricaMuseuConfig.list('', 1000);
    const lancamentos = await base44.asServiceRole.entities.LancamentoRubrica.list('-data_lancamento', 2000);

    // Indexar lançamentos por rubrica
    const lansByRubrica = {};
    for (const l of lancamentos) {
      if (!lansByRubrica[l.rubrica_id]) lansByRubrica[l.rubrica_id] = [];
      lansByRubrica[l.rubrica_id].push(l);
    }

    // Indexar configs por rubrica+museu
    const configsByRubricaMuseu = {};
    for (const c of configs) {
      const key = `${c.rubrica_id}__${c.museu}`;
      configsByRubricaMuseu[key] = c;
    }

    // Para cada rubrica ativa, calcular saldo e associar a museus/categorias
    const rubricasAtivas = rubricas.filter(r => r.ativo !== false);
    
    const resultado = {};
    for (const museu of MUSEUS) {
      resultado[museu] = {};
    }

    for (const rubrica of rubricasAtivas) {
      const lans = lansByRubrica[rubrica.id] || [];
      const totalLancado = lans.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0);
      
      const valorRubrica = parseFloat(rubrica.valor_rubrica) || 0;
      // Usa valor_utilizado calculado se existir, senão usa lançamentos
      const valorUtilizado = rubrica.valor_utilizado != null ? parseFloat(rubrica.valor_utilizado) : totalLancado;
      const saldo = parseFloat((valorRubrica - valorUtilizado).toFixed(2));
      const pct = valorRubrica > 0 ? parseFloat(((valorUtilizado / valorRubrica) * 100).toFixed(1)) : 0;

      // Determinar em quais museus esta rubrica aparece (via config ou inferência)
      const configsRubrica = configs.filter(c => c.rubrica_id === rubrica.id);
      
      let associacoes = [];
      if (configsRubrica.length > 0) {
        // Usa configs existentes
        associacoes = configsRubrica.map(c => ({
          museu: c.museu,
          categoria_key: c.categoria_key,
          divisor: c.divisor || 1,
        }));
      } else {
        // Infere museus e categoria pelo nome/grupo
        const museus = inferirMuseus(rubrica);
        const categoria_key = inferirCategoria(rubrica);
        if (categoria_key) {
          associacoes = museus.map(m => ({ museu: m, categoria_key, divisor: museus.length }));
        }
      }

      for (const assoc of associacoes) {
        if (!resultado[assoc.museu]) continue;
        const divisor = assoc.divisor || 1;
        const cat = assoc.categoria_key || 'outros';
        
        if (!resultado[assoc.museu][cat]) resultado[assoc.museu][cat] = [];
        
        resultado[assoc.museu][cat].push({
          id: rubrica.id,
          rubrica: rubrica.rubrica,
          grupo: rubrica.grupo,
          totalOrcado: parseFloat((valorRubrica / divisor).toFixed(2)),
          valorUtilizado: parseFloat((valorUtilizado / divisor).toFixed(2)),
          saldo: parseFloat((saldo / divisor).toFixed(2)),
          pct,
          divisor,
          num_lancamentos: lans.length,
        });
      }
    }

    // Calcular totais por museu
    const totaisPorMuseu = {};
    for (const museu of MUSEUS) {
      let totalOrcado = 0, totalUtilizado = 0;
      for (const cat of Object.values(resultado[museu])) {
        for (const r of cat) {
          totalOrcado += r.totalOrcado;
          totalUtilizado += r.valorUtilizado;
        }
      }
      const totalSaldo = parseFloat((totalOrcado - totalUtilizado).toFixed(2));
      const pct = totalOrcado > 0 ? parseFloat(((totalUtilizado / totalOrcado) * 100).toFixed(1)) : 0;
      totaisPorMuseu[museu] = { totalOrcado: parseFloat(totalOrcado.toFixed(2)), totalUtilizado: parseFloat(totalUtilizado.toFixed(2)), totalSaldo, pct };
    }

    return Response.json({
      success: true,
      por_museu: resultado,
      totais_por_museu: totaisPorMuseu,
      total_rubricas: rubricasAtivas.length,
      total_configs: configs.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});