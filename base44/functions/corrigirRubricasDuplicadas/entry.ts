import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Grupos oficiais que devem ser mantidos
const GRUPOS_OFICIAIS = [
  'Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação',
  'Realizar manutenção de rotina em exposições',
  'Educador',
  '18 pequenas mostras de baixa ou média complexidade',
  'Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
  '101 Diárias',
  'Publicações',
  'Custeios para atividades educativas contínuas',
  'Realizar 30 (trinta) ações educativas e ou culturais',
  'Realizar uma exposição e o evento de abertura no Museu da Moda',
  'Contratação de consultorias',
  'Despesas Gerais'
];

// Grupos duplicados antigos que devem ser inativados
const GRUPOS_DUPLICADOS = [
  'Equipe e gestão',
  'Manutenção e operação',
  'Mostras e exposições',
  'Noturno nos Museus 2026',
  'Diárias e publicações',
  'Alimentação, material e ações',
  'Consultorias',
  'Despesas gerais'
];

// Mapeamento de grupos duplicados para oficiais
const MAPEAMENTO_GRUPOS = {
  'Equipe e gestão': 'Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação',
  'Manutenção e operação': 'Realizar manutenção de rotina em exposições',
  'Mostras e exposições': '18 pequenas mostras de baixa ou média complexidade',
  'Noturno nos Museus 2026': 'Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
  'Diárias e publicações': '101 Diárias',
  'Alimentação, material e ações': 'Custeios para atividades educativas contínuas',
  'Consultorias': 'Contratação de consultorias',
  'Despesas gerais': 'Despesas Gerais'
};

const VALOR_TOTAL_OFICIAL = 1320000.00;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem executar esta correção' }, { status: 403 });
    }

    const logs = [];
    let rubricasInativadas = 0;
    let rubricasExcluidas = 0;
    let vinculosMigrados = 0;

    // 1. Carregar todas as rubricas
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.list();
    
    // 2. Identificar rubricas oficiais ativas (grupos oficiais)
    const rubricasOficiais = todasRubricas.filter(r => 
      r.ativo !== false && 
      GRUPOS_OFICIAIS.includes(r.grupo)
    );

    // 3. Identificar rubricas duplicadas (grupos antigos)
    const rubricasDuplicadas = todasRubricas.filter(r => 
      GRUPOS_DUPLICADOS.includes(r.grupo) ||
      (r.grupo && r.grupo.toLowerCase() === 'despesas gerais' && !GRUPOS_OFICIAIS.includes(r.grupo))
    );

    console.log(`Total de rubricas: ${todasRubricas.length}`);
    console.log(`Rubricas oficiais ativas: ${rubricasOficiais.length}`);
    console.log(`Rubricas duplicadas identificadas: ${rubricasDuplicadas.length}`);

    // 4. Processar cada rubrica duplicada (em lotes para evitar rate limit)
    const LOTE_TAMANHO = 5;
    for (let i = 0; i < rubricasDuplicadas.length; i += LOTE_TAMANHO) {
      const lote = rubricasDuplicadas.slice(i, i + LOTE_TAMANHO);
      console.log(`Processando lote ${Math.floor(i/LOTE_TAMANHO) + 1}/${Math.ceil(rubricasDuplicadas.length/LOTE_TAMANHO)}`);
      
      for (const duplicada of lote) {
        const grupoOficial = MAPEAMENTO_GRUPOS[duplicada.grupo];
        
        if (!grupoOficial) {
          logs.push({
            acao: 'GRUPO_SE_MAPEAMENTO',
            rubrica_id: duplicada.id,
            rubrica_nome: duplicada.rubrica,
            grupo: duplicada.grupo,
            mensagem: 'Grupo duplicado sem mapeamento para oficial'
          });
          continue;
        }

        // Buscar rubrica oficial correspondente
        const oficialCorrespondente = rubricasOficiais.find(r => 
          r.grupo === grupoOficial && 
          normalizarNome(r.rubrica) === normalizarNome(duplicada.rubrica)
        );

        // Verificar se tem valor utilizado ou vínculos
        const temValorUtilizado = (duplicada.valor_utilizado || 0) > 0;
        const temSaldo = (duplicada.saldo || 0) > 0;
        
        // Buscar solicitações vinculadas
        const solicitacoesVinculadas = await base44.asServiceRole.entities.PurchaseRequest.filter({
          rubrica_id: duplicada.id
        });

        const temSolicitacoes = solicitacoesVinculadas.length > 0;
        const temSolicitacoesAprovadas = solicitacoesVinculadas.some(s => 
          ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(s.status)
        );

        // Decisão: excluir fisicamente ou apenas inativar
        if (!temValorUtilizado && !temSolicitacoes && !temSaldo) {
          // Pode excluir fisicamente
          try {
            await base44.asServiceRole.entities.Rubrica.delete(duplicada.id);
            rubricasExcluidas++;
            logs.push({
              acao: 'EXCLUIDA_FISICAMENTE',
              rubrica_id: duplicada.id,
              rubrica_nome: duplicada.rubrica,
              grupo_original: duplicada.grupo,
              grupo_oficial: grupoOficial,
              motivo: 'Sem valor utilizado, sem solicitações, sem saldo',
              data: new Date().toISOString()
            });
          } catch (e) {
            logs.push({
              acao: 'ERRO_EXCLUSAO',
              rubrica_id: duplicada.id,
              rubrica_nome: duplicada.rubrica,
              erro: e.message
            });
          }
        } else {
          // Migrar vínculos e inativar
          if (oficialCorrespondente) {
            // Migrar solicitações
            for (const solicitacao of solicitacoesVinculadas) {
              try {
                await base44.asServiceRole.entities.PurchaseRequest.update(solicitacao.id, {
                  rubrica_id: oficialCorrespondente.id,
                  rubrica_nome: oficialCorrespondente.rubrica
                });
                vinculosMigrados++;
              } catch (e) {
                logs.push({
                  acao: 'ERRO_MIGRACAO_SOLICITACAO',
                  solicitacao_id: solicitacao.id,
                  rubrica_origem: duplicada.id,
                  rubrica_destino: oficialCorrespondente.id,
                  erro: e.message
                });
              }
            }

            // Migrar valor utilizado se houver
            if (temValorUtilizado) {
              const novoValorUtilizadoOficial = (oficialCorrespondente.valor_utilizado || 0) + (duplicada.valor_utilizado || 0);
              const novoSaldoOficial = (oficialCorrespondente.valor_total || 0) - novoValorUtilizadoOficial;
              
              await base44.asServiceRole.entities.Rubrica.update(oficialCorrespondente.id, {
                valor_utilizado: novoValorUtilizadoOficial,
                saldo: novoSaldoOficial,
                percentual_utilizado: novoValorUtilizadoOficial / (oficialCorrespondente.valor_total || 1) * 100
              });
            }
          }

          // Inativar rubrica duplicada
          await base44.asServiceRole.entities.Rubrica.update(duplicada.id, {
            ativo: false,
            observacao_uso: `INATIVADA EM CORREÇÃO: ${new Date().toISOString()}. Grupo original: ${duplicada.grupo}. ${oficialCorrespondente ? 'Vínculos migrados para rubrica oficial.' : 'Sem rubrica oficial correspondente.'}`
          });

          rubricasInativadas++;
          logs.push({
            acao: 'INATIVADA_COM_MIGRACAO',
            rubrica_id: duplicada.id,
            rubrica_nome: duplicada.rubrica,
            grupo_original: duplicada.grupo,
            grupo_oficial: grupoOficial,
            rubrica_oficial_id: oficialCorrespondente?.id,
            valor_utilizado_migrado: duplicada.valor_utilizado || 0,
            solicitacoes_migradas: solicitacoesVinculadas.length,
            data: new Date().toISOString()
          });
        }
        
        // Pequeno delay entre processamentos
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Delay entre lotes
      if (i + LOTE_TAMANHO < rubricasDuplicadas.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 5. Recalcular saldos de todas as rubricas ativas
    const rubricasAtivas = await base44.asServiceRole.entities.Rubrica.filter({ ativo: true });
    let totalPrevistoAtivo = 0;

    for (const rubrica of rubricasAtivas) {
      const saldo = (rubrica.valor_total || rubrica.valor_rubrica || 0) - (rubrica.valor_utilizado || 0);
      const percentual = (rubrica.valor_utilizado || 0) / (rubrica.valor_total || rubrica.valor_rubrica || 1) * 100;
      
      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        saldo,
        percentual_utilizado: percentual,
        saldo_real: saldo
      });

      totalPrevistoAtivo += (rubrica.valor_total || rubrica.valor_rubrica || 0);
    }

    // 6. Gerar log de auditoria consolidado
    const auditoriaLog = {
      tipo: 'CORRECAO_RUBRICAS_DUPLICADAS',
      executado_por: user.email,
      data: new Date().toISOString(),
      resumo: {
        total_rubricas_analisadas: todasRubricas.length,
        rubricas_oficiais_mantidas: rubricasOficiais.length,
        rubricas_inativadas: rubricasInativadas,
        rubricas_excluidas_fisicamente: rubricasExcluidas,
        vinculos_migrados: vinculosMigrados,
        total_previsto_ativo: totalPrevistoAtivo,
        diferenca_valor_oficial: VALOR_TOTAL_OFICIAL - totalPrevistoAtivo
      },
      logs_detalhados: logs
    };

    // Salvar log em entidade de auditoria se existir
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'UPDATE',
        entity_type: 'RUBRICA',
        entity_id: 'CORRECAO_EM_MASSA',
        actor_email: user.email,
        actor_name: user.full_name,
        details: JSON.stringify(auditoriaLog)
      });
    } catch (e) {
      console.log('Não foi possível salvar log em AuditLog:', e.message);
    }

    return Response.json({
      sucesso: true,
      mensagem: `Correção concluída. ${rubricasInativadas} rubricas inativadas, ${rubricasExcluidas} excluídas, ${vinculosMigrados} vínculos migrados.`,
      resumo: auditoriaLog.resumo,
      logs
    });

  } catch (error) {
    return Response.json({
      erro: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});

function normalizarNome(nome) {
  if (!nome) return '';
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}