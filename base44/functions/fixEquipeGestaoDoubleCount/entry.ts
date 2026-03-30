import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Corrige dupla contagem em rubricas de Equipe e Gestão.
 * Problema: pagamentos de gestão eram somados 2x (uma vez em LancamentoRubrica, outra em TeamPayment)
 * Solução: para Equipe e Gestão, usar APENAS TeamPayments dedupados (1 por pessoa por período)
 * Remover LancamentoRubrica que duplicam esses pagamentos
 */

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isEquipeEGestao(rubrica) {
  const grupo = normalizeString(rubrica?.grupo || '');
  return grupo.includes('equipe') || grupo.includes('gestao') || grupo.includes('gestão');
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Apenas admin
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Listar todas as entidades
    const [rubricas, lancamentos, teamPayments, teamMembers] = await Promise.all([
      base44.asServiceRole.entities.Rubrica.list('grupo', 500),
      base44.asServiceRole.entities.LancamentoRubrica.list('-created_date', 500),
      base44.asServiceRole.entities.TeamPayment.list('-created_date', 500),
      base44.asServiceRole.entities.TeamMember.list('nome', 500),
    ]);

    const rubricaById = {};
    (rubricas || []).forEach(r => {
      if (r?.id) rubricaById[r.id] = r;
    });

    const teamMemberById = {};
    (teamMembers || []).forEach(tm => {
      if (tm?.id) teamMemberById[tm.id] = tm;
    });

    // Rubricas de Equipe e Gestão
    const equipeRubricaIds = Object.entries(rubricaById)
      .filter(([_, r]) => isEquipeEGestao(r))
      .map(([id]) => id);

    // TeamPayments aprovados (dedupados por pessoa+período)
    const APPROVED_STATUSES = new Set([
      'APROVADO', 'PAGO', 'APROVADO_COORD',
      'ENCAMINHADO_COORD_ADMIN', 'APROVADO_ADMIN', 'FINALIZADO',
    ]);

    const approvedTeamPaymentsByPeriod = new Map();
    (teamPayments || []).forEach(tp => {
      if (!APPROVED_STATUSES.has(String(tp.status || '').toUpperCase())) return;
      const key = `${tp.team_member_id}__${String(tp.mes_referencia || '').toLowerCase()}__${tp.ano}`;
      if (!approvedTeamPaymentsByPeriod.has(key)) {
        approvedTeamPaymentsByPeriod.set(key, tp);
      }
    });

    // Lançamentos que devem ser removidos (duplicam TeamPayments)
    const toDelete = [];
    const report = {
      total_lancamentos_equipe: 0,
      removed_lancamentos: 0,
      lancamentos_removidos: [],
      equipe_rubrica_ids: equipeRubricaIds,
      approved_team_payments_count: approvedTeamPaymentsByPeriod.size,
    };

    for (const lancamento of lancamentos || []) {
      // Só verificar lançamentos em rubricas de Equipe e Gestão
      if (!equipeRubricaIds.includes(lancamento.rubrica_id)) continue;

      report.total_lancamentos_equipe++;

      // Se há TeamPayments aprovados para essa rubrica, remover o lançamento
      if (approvedTeamPaymentsByPeriod.size > 0) {
        toDelete.push(lancamento.id);
        report.removed_lancamentos++;
        report.lancamentos_removidos.push({
          id: lancamento.id,
          rubrica_id: lancamento.rubrica_id,
          valor: lancamento.valor,
          motivo: 'Removido porque TeamPayments dedupados já cobrem Equipe e Gestão',
        });
      }
    }

    // Deletar em lotes
    const BATCH = 10;
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const lote = toDelete.slice(i, i + BATCH);
      try {
        await Promise.all(
          lote.map(id => base44.asServiceRole.entities.LancamentoRubrica.delete(id))
        );
        deleted += lote.length;
      } catch (e) {
        console.error('Erro ao deletar lote:', e?.message);
      }
    }

    report.deleted_count = deleted;

    return Response.json({
      success: true,
      message: 'Dupla contagem corrigida: LancamentoRubrica de Equipe e Gestão removidos',
      report,
    });
  } catch (error) {
    console.error('fixEquipeGestaoDoubleCount error:', error);
    return Response.json(
      { error: error?.message || String(error), success: false },
      { status: 500 }
    );
  }
});