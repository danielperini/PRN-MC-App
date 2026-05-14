import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Auditoria automática de duplicidade financeira
 * Analisa todas as solicitações e detecta padrões de duplicação
 * Cria registros de auditoria e registra anomalias
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todas as solicitações ativas
    const all = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 2000);
    
    if (!Array.isArray(all) || all.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhuma solicitação encontrada',
        duplicates: [],
        audit_count: 0
      });
    }

    const duplicateGroups = {};
    const auditRecords = [];

    // Agrupar por chave de duplicidade
    for (const purchase of all) {
      // Ignorar status cancelados
      if (['CANCELADO', 'RECUSADO', 'REJEITADO'].includes(purchase.status)) continue;

      const key = buildKey(purchase);
      if (!key) continue;

      if (!duplicateGroups[key]) {
        duplicateGroups[key] = [];
      }
      duplicateGroups[key].push(purchase);
    }

    // Processar grupos com múltiplas ocorrências
    for (const [key, group] of Object.entries(duplicateGroups)) {
      if (group.length > 1) {
        // Ordenar por data de criação
        const sorted = group.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        
        // A primeira é a original, as demais são potencialmente duplicadas
        for (let i = 1; i < sorted.length; i++) {
          const duplicate = sorted[i];
          const original = sorted[0];

          auditRecords.push({
            duplicate_id: duplicate.id,
            original_id: original.id,
            nf_numero: getNFNumber(duplicate),
            fornecedor: duplicate.fornecedor_nome,
            valor: duplicate.valor_solicitado,
            status_duplicate: duplicate.status,
            status_original: original.status,
            created_by_duplicate: duplicate.created_by,
            created_date_duplicate: duplicate.created_date,
            confianca: 95, // Score de confiança
            tipo_duplicidade: 'NF_IDENTICA_OU_SIMILAR',
            recomendacao: 'Revisar manualmente e consolidar'
          });
        }
      }
    }

    // Salvar auditoria se houver duplicidades
    if (auditRecords.length > 0) {
      // Criar registro de auditoria de duplicidade
      try {
        for (const record of auditRecords) {
          await base44.asServiceRole.entities.AuditLog.create({
            entity_type: 'PurchaseRequest',
            entity_id: record.duplicate_id,
            action: 'DUPLICATE_DETECTED',
            details: JSON.stringify(record),
            severity: 'warning',
            status: 'unresolved',
            created_by_system: true,
            system_name: 'auditarDuplicidadeIA'
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Erro ao registrar auditoria:', err);
      }
    }

    return Response.json({
      success: true,
      message: `Auditoria concluída: ${auditRecords.length} possível(eis) duplicidade(s) detectada(s)`,
      duplicates: auditRecords,
      audit_count: auditRecords.length,
      grupos_analisados: Object.keys(duplicateGroups).length
    });

  } catch (error) {
    console.error('Erro na auditoria de duplicidade:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});

function buildKey(item) {
  const nf = String(item.nf_numero || '').trim().toUpperCase();
  const doc = String(item.nf_emitente_cpf_cnpj || item.fornecedor_cnpj || '').replace(/\D/g, '');
  
  if (nf && doc) return `NF:${doc}:${nf}`;
  return '';
}

function getNFNumber(item = {}) {
  return String(item.nf_numero || '').trim().toUpperCase();
}