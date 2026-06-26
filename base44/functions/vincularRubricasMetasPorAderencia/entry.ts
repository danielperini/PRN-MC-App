import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Mapa funcional das metas para busca de rubricas com aderência
 */
const META_FUNCTIONAL_MAP = {
  '1': {
    numero: '1',
    titulo: 'Equipe principal',
    palavrasChave: ['equipe principal', 'coordenação', 'gestão', 'produção principal', 'administração'],
    grupoEsperado: ['Equipe e gestão', 'Coordenação', 'Produção'],
    centroCustoEsperado: ['Geral/Transversal'],
    excludePalavras: ['educador', 'consultoria', 'diária', 'lanche']
  },
  '2': {
    numero: '2',
    titulo: 'Plano de comunicação',
    palavrasChave: ['comunicação', 'imprensa', 'design', 'mídia', 'divulgação', 'redes sociais', 'identidade visual', 'gráfica'],
    grupoEsperado: ['Comunicação', 'Divulgação'],
    centroCustoEsperado: ['Comunicação', 'Geral/Transversal']
  },
  '3': {
    numero: '3',
    titulo: 'Manutenção das exposições',
    palavrasChave: ['manutenção expositiva', 'conservação', 'reparo', 'equipamento expositivo'],
    grupoEsperado: ['Manutenção', 'Exposições'],
    excludePalavras: ['montagem', 'nova exposição', 'expografia']
  },
  '4': {
    numero: '4',
    titulo: 'Alteração de núcleos e salas expositivas',
    palavrasChave: ['alteração de núcleo', 'sala expositiva', 'expografia', 'ambientação', 'cenografia', 'montagem', 'desmontagem'],
    grupoEsperado: ['Exposições', 'Expografia']
  },
  '5': {
    numero: '5',
    titulo: 'Ações educativas',
    palavrasChave: ['ação educativa', 'oficina educativa', 'atividade educativa'],
    grupoEsperado: ['Educação', 'Ações Educativas'],
    excludePalavras: ['contratação', 'diária', 'material de consumo']
  },
  '6': {
    numero: '6',
    titulo: 'Ações culturais',
    palavrasChave: ['apresentação', 'oficina cultural', 'ação cultural', 'programação cultural', 'evento cultural'],
    grupoEsperado: ['Cultura', 'Programação']
  },
  '7': {
    numero: '7',
    titulo: 'Contratação de educadores',
    palavrasChave: ['educador', 'monitor', 'mediador'],
    grupoEsperado: ['Educadores', 'Equipe Educativa'],
    naturezaEsperada: ['339039'],
    excludePalavras: ['diária', 'lanche', 'material']
  },
  '8': {
    numero: '8',
    titulo: 'Exposição e evento MHAB',
    palavrasChave: ['exposição', 'evento'],
    museuEsperado: ['MHAB', 'MAB'],
    centroCustoEsperado: ['MHAB']
  },
  '9': {
    numero: '9',
    titulo: 'Exposição e evento MIS',
    palavrasChave: ['exposição', 'evento'],
    museuEsperado: ['MIS'],
    centroCustoEsperado: ['MIS']
  },
  '10': {
    numero: '10',
    titulo: 'Mostras de baixa/média complexidade',
    palavrasChave: ['mostra', 'exposição temporária', 'baixa complexidade', 'média complexidade'],
    grupoEsperado: ['Exposições', 'Mostras']
  },
  '11': {
    numero: '11',
    titulo: 'Noturno nos Museus',
    palavrasChave: ['noturno nos museus', 'noturno 2026', 'noturno pampulha'],
    grupoEsperado: ['Noturno', 'Eventos'],
    centroCustoEsperado: ['Noturno 2026', 'Noturno Pampulha', 'Noturno nos Museus']
  },
  '11A': {
    numero: '11A',
    titulo: 'Noturno 2026',
    palavrasChave: ['noturno 2026', 'noturno nos museus centro'],
    centroCustoEsperado: ['Noturno 2026', 'Noturno nos Museus Centro'],
    metaPai: '11'
  },
  '11B': {
    numero: '11B',
    titulo: 'Noturno Pampulha',
    palavrasChave: ['noturno pampulha', 'kubitschek', 'casa do baile'],
    centroCustoEsperado: ['Noturno Pampulha', 'Noturno nos Museus Pampulha'],
    metaPai: '11'
  },
  '12': {
    numero: '12',
    titulo: 'Exposição MHAB: pesquisa e curadoria',
    palavrasChave: ['pesquisa', 'curadoria', 'texto curatorial', 'produção de conteúdo'],
    museuEsperado: ['MHAB', 'MAB'],
    centroCustoEsperado: ['MHAB'],
    excludePalavras: ['montagem', 'expografia']
  },
  '13': {
    numero: '13',
    titulo: 'Exposição MUMO: pesquisa e curadoria',
    palavrasChave: ['pesquisa', 'curadoria', 'texto curatorial', 'produção de conteúdo'],
    museuEsperado: ['MUMO'],
    centroCustoEsperado: ['MUMO'],
    excludePalavras: ['montagem', 'expografia']
  },
  '14': {
    numero: '14',
    titulo: 'Acessibilidade',
    palavrasChave: ['acessibilidade', 'audiodescrição', 'libras', 'legendagem', 'tátil', 'dispositivo acessível'],
    grupoEsperado: ['Acessibilidade']
  },
  '15': {
    numero: '15',
    titulo: 'Inscrição em Leis de Incentivo',
    palavrasChave: ['inscrição', 'lei de incentivo', 'edital', 'taxa de inscrição'],
    grupoEsperado: ['Leis de Incentivo'],
    excludePalavras: ['consultoria', 'assessoria']
  },
  '16': {
    numero: '16',
    titulo: 'Diárias de educadores',
    palavrasChave: ['diária', 'diárias'],
    grupoEsperado: ['Diárias'],
    rubricaOficial: 'Diárias MIS MAB MUMO',
    excludePalavras: ['remuneração', 'salário', 'honorário']
  },
  '17': {
    numero: '17',
    titulo: 'Publicações e catálogos',
    palavrasChave: ['catálogo', 'publicação', 'edição', 'revisão', 'tradução', 'impressão', 'fotografia para publicação'],
    grupoEsperado: ['Publicações', 'Editorial']
  },
  '18': {
    numero: '18',
    titulo: 'Custeio das atividades educativas e culturais',
    palavrasChave: ['material de oficina', 'material educativo', 'lanche', 'coffee break', 'insumo', 'custeio operacional'],
    grupoEsperado: ['Custeio', 'Materiais'],
    excludePalavras: ['remuneração', 'diária', 'honorário']
  },
  '19': {
    numero: '19',
    titulo: 'Atividade Presente de Iemanjá',
    palavrasChave: ['presente de iemanjá', 'iemanjá'],
    grupoEsperado: ['Eventos', 'Atividades Culturais']
  },
  '20': {
    numero: '20',
    titulo: 'Ações educativas e/ou culturais (30 ações)',
    palavrasChave: ['30 ações', 'ações do aditivo'],
    grupoEsperado: ['Ações', 'Programação']
  },
  '21': {
    numero: '21',
    titulo: 'Exposição e evento MUMO',
    palavrasChave: ['exposição', 'evento'],
    museuEsperado: ['MUMO'],
    centroCustoEsperado: ['MUMO']
  },
  '22': {
    numero: '22',
    titulo: 'Consultoria para execução do projeto',
    palavrasChave: ['consultoria de execução', 'assessoria técnica', 'acompanhamento técnico', 'consultoria de gestão'],
    grupoEsperado: ['Consultorias'],
    excludePalavras: ['curadoria', 'comunicação', 'educador']
  },
  '23': {
    numero: '23',
    titulo: 'Despesas Gerais',
    palavrasChave: ['despesa administrativa', 'tarifa', 'despesa operacional', 'serviço geral'],
    grupoEsperado: ['Despesas Gerais', 'Administrativo']
  },
  '24': {
    numero: '24',
    titulo: 'Emenda Parlamentar',
    palavrasChave: ['emenda parlamentar', 'emenda'],
    origemRecurso: ['Emenda Parlamentar']
  },
  '25': {
    numero: '25',
    titulo: 'Outras Ações',
    palavrasChave: ['outra ação', 'ações diversas'],
    grupoEsperado: ['Outros']
  }
};

/**
 * Normaliza texto para comparação
 */
function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula similaridade de Jaccard entre dois conjuntos de palavras
 */
function jaccardSimilarity(set1, set2) {
  const arr1 = Array.from(set1);
  const arr2 = Array.from(set2);
  const intersection = arr1.filter(x => set2.has(x));
  const union = new Set([...arr1, ...arr2]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

/**
 * Calcula aderência entre rubrica e meta
 */
function calculateAderencia(rubrica, metaConfig) {
  let score = 0;
  const detalhes = {
    finalidadeDescricao: 0,
    grupoCategoria: 0,
    naturezaDespesa: 0,
    projetoAcao: 0,
    centroCustoMuseu: 0,
    similaridadeNome: 0
  };

  const rubricaNome = normalizeText(rubrica.rubrica || rubrica.nome || '');
  const rubricaDescricao = normalizeText(rubrica.descricao || '');
  const rubricaGrupo = normalizeText(rubrica.grupo || rubrica.meta || '');
  const rubricaNatureza = normalizeText(rubrica.natureza_despesa || rubrica.numero_natureza || '');
  const rubricaCentroCusto = normalizeText(rubrica.centro_custo || '');
  const rubricaMuseuCodigo = normalizeText(rubrica.museu_codigo || rubrica.escopo_orcamentario || '');
  const rubricaOrigem = normalizeText(rubrica.origem_recurso || '');

  const palavrasRubrica = new Set([
    ...rubricaNome.split(' '),
    ...rubricaDescricao.split(' '),
    ...rubricaGrupo.split(' ')
  ].filter(p => p.length > 2));

  // 35%: finalidade e descrição da rubrica
  const palavrasMeta = new Set(metaConfig.palavrasChave.flatMap(p => normalizeText(p).split(' ')));
  const matchFinalidade = Array.from(palavrasMeta).filter(palavra => 
    palavra.length > 2 && (
      palavrasRubrica.has(palavra) || 
      rubricaNome.includes(palavra) || 
      rubricaDescricao.includes(palavra) ||
      rubricaGrupo.includes(palavra)
    )
  ).length;
  
  const percentualMatch = matchFinalidade / Math.max(1, palavrasMeta.size);
  detalhes.finalidadeDescricao = Math.min(35, Math.round(percentualMatch * 35));
  score += detalhes.finalidadeDescricao;

  // 20%: grupo ou categoria orçamentária
  if (metaConfig.grupoEsperado) {
    const matchGrupo = metaConfig.grupoEsperado.some(grupo => 
      normalizeText(grupo).split(' ').some(palavra => 
        palavra.length > 2 && rubricaGrupo.includes(palavra)
      )
    );
    detalhes.grupoCategoria = matchGrupo ? 20 : 0;
    score += detalhes.grupoCategoria;
  }

  // 15%: natureza da despesa (opcional - muitas rubricas não têm este campo preenchido)
  if (metaConfig.naturezaEsperada && rubricaNatureza) {
    const matchNatureza = metaConfig.naturezaEsperada.some(nat => 
      rubricaNatureza.includes(normalizeText(nat))
    );
    detalhes.naturezaDespesa = matchNatureza ? 15 : 5;
    score += detalhes.naturezaDespesa;
  } else {
    detalhes.naturezaDespesa = 5;
    score += 5;
  }

  // 15%: projeto, ação ou programa relacionado (museu/centro de custo)
  if (metaConfig.museuEsperado || metaConfig.centroCustoEsperado) {
    const criteriosMuseu = [...(metaConfig.museuEsperado || []), ...(metaConfig.centroCustoEsperado || [])];
    const matchMuseu = criteriosMuseu.some(criterio => 
      normalizeText(criterio).split(' ').some(palavra => 
        palavra.length > 2 && (
          rubricaMuseuCodigo.includes(palavra) ||
          rubricaCentroCusto.includes(palavra) ||
          rubricaNome.includes(palavra) ||
          rubricaDescricao.includes(palavra)
        )
      )
    );
    detalhes.projetoAcao = matchMuseu ? 15 : 5;
    score += detalhes.projetoAcao;
  } else {
    detalhes.projetoAcao = 5;
    score += 5;
  }

  // 10%: centro de custo ou museu (genérico)
  if (metaConfig.centroCustoEsperado) {
    const matchCentroCusto = metaConfig.centroCustoEsperado.some(cc => 
      normalizeText(cc).split(' ').some(palavra => 
        palavra.length > 2 && rubricaCentroCusto.includes(palavra)
      )
    );
    detalhes.centroCustoMuseu = matchCentroCusto ? 10 : 5;
    score += detalhes.centroCustoMuseu;
  } else {
    detalhes.centroCustoMuseu = 5;
    score += 5;
  }

  // 5%: similaridade do nome
  const palavrasMetaNome = new Set(metaConfig.titulo.toLowerCase().split(' ').filter(p => p.length > 3));
  const similaridadeNome = jaccardSimilarity(palavrasRubrica, palavrasMetaNome);
  detalhes.similaridadeNome = Math.round(similaridadeNome * 5);
  score += detalhes.similaridadeNome;

  // Verificar exclusões
  const criteriosIncompativeis = [];
  if (metaConfig.excludePalavras) {
    const temExclusao = metaConfig.excludePalavras.some(excl => 
      rubricaNome.includes(normalizeText(excl)) || 
      rubricaDescricao.includes(normalizeText(excl))
    );
    if (temExclusao) {
      score -= 20;
      criteriosIncompativeis.push('Palavra excludente detectada');
    }
  }

  // Verificar origem de recurso (Meta 24)
  if (metaConfig.origemRecurso) {
    const matchOrigem = metaConfig.origemRecurso.some(orig => 
      rubricaOrigem.includes(normalizeText(orig))
    );
    if (!matchOrigem) {
      score = 0;
      criteriosIncompativeis.push('Origem de recurso incompatível');
    }
  }

  // Verificar rubrica oficial específica (Meta 16)
  if (metaConfig.rubricaOficial) {
    if (normalizeText(rubricaNome).includes(normalizeText(metaConfig.rubricaOficial))) {
      score = Math.max(score, 95);
    } else if (rubricaNome.toLowerCase().includes('diária') && !normalizeText(rubricaNome).includes('diárias mis mab mumo')) {
      score = Math.min(score, 50);
      criteriosIncompativeis.push('Rubrica de diária não é a oficial unificada');
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    detalhes,
    criteriosIncompativeis
  };
}

/**
 * Verifica regras de segurança antes de vincular
 */
async function verificarSegurancaVinculo(rubrica, metaId, base44) {
  const erros = [];

  // 1. Confirmar que a rubrica está ativa
  if (rubrica.ativo === false) {
    erros.push('Rubrica inativa');
  }

  // 2. Confirmar que não está arquivada
  if (rubrica.status === 'arquivada' || rubrica.arquivada === true) {
    erros.push('Rubrica arquivada');
  }

  // 3. Confirmar que não é duplicata
  if (rubrica.duplicidade_status === 'confirmada') {
    erros.push('Rubrica duplicata confirmada');
  }

  // 4. Verificar se já tem vínculo com outra meta
  if (rubrica.meta_id && rubrica.meta_id !== metaId) {
    // Verificar se é submeta (11A, 11B)
    const metaAtual = META_FUNCTIONAL_MAP[rubrica.meta_id];
    const metaNova = META_FUNCTIONAL_MAP[metaId];
    
    if (metaAtual?.metaPai !== metaId && metaNova?.metaPai !== rubrica.meta_id) {
      erros.push('Rubrica já vinculada a outra meta principal');
    }
  }

  // 5. Verificar se não é alias
  if (rubrica._eh_alias === true || rubrica.eh_alias === true) {
    erros.push('Rubrica é alias');
  }

  return {
    podeVincular: erros.length === 0,
    erros
  };
}

/**
 * Determina o tipo de vínculo baseado na aderência
 */
function determinarTipoVinculo(score) {
  if (score >= 75) return 'AUTOMATICO_75';
  if (score >= 60) return 'SUGERIDO_REVISAO';
  return 'REJEITADO';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dryRun = true, force = false } = await req.json().catch(() => ({}));

    // Buscar todas as rubricas ativas
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.filter({ ativo: true });
    
    // Buscar todas as metas oficiais
    const metasOficiais = await base44.asServiceRole.entities.ProjectMeta.list();

    const resultados = {
      vinculadas: [],
      sugeridasRevisao: [],
      rejeitadas: [],
      metasSemRubrica: [],
      erros: [],
      totalRubricasAnalisadas: todasRubricas.length,
      totalMetas: metasOficiais.length
    };

    // Mapear rubricas já vinculadas
    const rubricasVinculadas = new Map();
    todasRubricas.forEach(r => {
      if (r.meta_id) {
        rubricasVinculadas.set(r.id, r.meta_id);
      }
    });

    // Analisar cada meta
    for (const meta of metasOficiais) {
      const metaConfig = META_FUNCTIONAL_MAP[meta.numero] || META_FUNCTIONAL_MAP[meta.ordem?.toString()];
      
      if (!metaConfig) {
        resultados.erros.push(`Meta ${meta.numero || meta.nome} sem configuração funcional`);
        continue;
      }

      const rubricasVinculadasMeta = [];
      const sugestoesRevisao = [];

      // Analisar cada rubrica
      for (const rubrica of todasRubricas) {
        // Pular se já está vinculada a outra meta principal
        if (rubrica.meta_id && rubrica.meta_id !== meta.id) {
          const metaAtual = META_FUNCTIONAL_MAP[rubrica.meta_id];
          const metaNova = META_FUNCTIONAL_MAP[meta.numero];
          
          // Se ambas têm metaPai diferente, são metas principais distintas
          if (metaAtual?.metaPai !== meta.numero && metaNova?.metaPai !== rubrica.meta_id) {
            continue;
          }
        }

        const { score, detalhes, criteriosIncompativeis } = calculateAderencia(rubrica, metaConfig);
        const tipoVinculo = determinarTipoVinculo(score);

        const registro = {
          rubricaId: rubrica.id,
          rubricaNome: rubrica.rubrica || rubrica.nome,
          metaId: meta.id,
          metaNumero: metaConfig.numero,
          metaNome: metaConfig.titulo,
          aderencia: score,
          detalhes,
          criteriosIncompativeis,
          tipoVinculo,
          dataAnalise: new Date().toISOString(),
          origemRegra: 'AUTOMATICA_IA'
        };

        if (tipoVinculo === 'AUTOMATICO_75' && score >= 75) {
          // Verificar segurança
          const { podeVincular, erros } = await verificarSegurancaVinculo(rubrica, meta.id, base44);
          
          if (podeVincular || force) {
            rubricasVinculadasMeta.push({
              ...registro,
              valorPrevisto: rubrica.valor_rubrica || 0,
              valorUtilizado: rubrica.valor_utilizado || 0,
              centroCusto: rubrica.centro_custo
            });

            if (!dryRun) {
              // Atualizar rubrica com vínculo
              await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
                meta_id: meta.id,
                meta_numero: metaConfig.numero,
                meta_titulo: metaConfig.titulo
              });
            }
          } else {
            registro.errosSeguranca = erros;
            resultados.rejeitadas.push(registro);
          }
        } else if (tipoVinculo === 'SUGERIDO_REVISAO') {
          sugestoesRevisao.push(registro);
        } else {
          resultados.rejeitadas.push(registro);
        }
      }

      // Registrar vínculos desta meta
      if (rubricasVinculadasMeta.length > 0) {
        resultados.vinculadas.push(...rubricasVinculadasMeta);
      }

      // Verificar se meta ficou sem rubrica
      if (rubricasVinculadasMeta.length === 0 && sugestoesRevisao.length === 0) {
        resultados.metasSemRubrica.push({
          metaId: meta.id,
          metaNumero: metaConfig.numero,
          metaNome: metaConfig.titulo,
          status: meta.status || 'EM_EXECUÇÃO',
          justificativa: 'Nenhuma rubrica com aderência >= 70% encontrada'
        });
      }

      if (sugestoesRevisao.length > 0) {
        resultados.sugeridasRevisao.push(...sugestoesRevisao);
      }
    }

    // Gerar relatório consolidado
    const relatorio = {
      dataExecucao: new Date().toISOString(),
      usuario: user.email,
      dryRun,
      resumo: {
        totalRubricasAnalisadas: resultados.totalRubricasAnalisadas,
        totalMetas: resultados.totalMetas,
        totalVinculadas: resultados.vinculadas.length,
        totalSugeridasRevisao: resultados.sugeridasRevisao.length,
        totalRejeitadas: resultados.rejeitadas.length,
        metasSemRubrica: resultados.metasSemRubrica.length
      },
      vinculadas: resultados.vinculadas.map(v => ({
        meta: `${v.metaNumero} - ${v.metaNome}`,
        rubrica: v.rubricaNome,
        rubricaId: v.rubricaId,
        aderencia: v.aderencia,
        motivo: `Correspondência em: ${Object.entries(v.detalhes)
          .filter(([_, valor]) => valor > 0)
          .map(([chave, valor]) => `${chave} (${valor}%)`)
          .join(', ')}`,
        valorPrevisto: v.valorPrevisto,
        valorUtilizado: v.valorUtilizado,
        centroCusto: v.centroCusto,
        confirmacaoNaoDuplicidade: true
      })),
      metasSemRubrica: resultados.metasSemRubrica,
      sugestoesRevisao: resultados.sugeridasRevisao.slice(0, 20) // Top 20 sugestões
    };

    return Response.json({
      success: true,
      message: dryRun 
        ? `Análise concluída (dry run). ${resultados.vinculadas.length} rubricas elegíveis para vínculo.`
        : `Vínculo concluído. ${resultados.vinculadas.length} rubricas vinculadas.`,
      resultados: relatorio
    });

  } catch (error) {
    console.error('Erro ao vincular rubricas às metas:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});