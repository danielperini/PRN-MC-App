import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================================
// DETECT AND FIX DUPLICATES — Remove duplicações sem quebrar dados
// ============================================================================

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(v) {
  return Number(v) || 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user?.role !== 'admin') {
      return Response.json({ error: 'Admin required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { entity_type, dry_run = true } = body;

    const results = {
      entity_type,
      dry_run,
      duplicates_found: [],
      duplicates_fixed: 0,
      timestamp: new Date().toISOString()
    };

    // ========== DETECTAR DUPLICATAS: TeamPayment ==========
    if (entity_type === 'TeamPayment' || !entity_type) {
      const allPayments = await base44.asServiceRole.entities.TeamPayment.list(
        'created_date',
        1000
      );

      const paymentMap = {};
      (allPayments || []).forEach((p) => {
        const key = `${normalizeString(p?.user_email)}_${normalizeString(
          p?.mes_referencia
        )}_${toNumber(p?.ano)}`;
        if (!paymentMap[key]) paymentMap[key] = [];
        paymentMap[key].push(p);
      });

      for (const [key, payments] of Object.entries(paymentMap)) {
        const active = payments.filter((p) =>
          ['PAGO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'].includes(
            String(p?.status || '').toUpperCase()
          )
        );

        if (active.length > 1) {
          results.duplicates_found.push({
            type: 'TeamPayment',
            key: key,
            count: active.length,
            ids: active.map((p) => p.id),
            statuses: active.map((p) => p.status),
            created_dates: active.map((p) => p.created_date)
          });

          // Mantém o primeiro (mais antigo), marca outros como RASCUNHO
          if (!dry_run) {
            const sortedByDate = active.sort(
              (a, b) => new Date(a.created_date) - new Date(b.created_date)
            );

            for (let i = 1; i < sortedByDate.length; i++) {
              await base44.asServiceRole.entities.TeamPayment.update(
                sortedByDate[i].id,
                {
                  status: 'RASCUNHO',
                  status_anterior: sortedByDate[i].status
                }
              );

              // Log
              await base44.asServiceRole.entities.AuditLog.create({
                action: 'UPDATE',
                entity_type: 'TeamPayment',
                entity_id: sortedByDate[i].id,
                actor_email: user.email,
                actor_name: user.full_name,
                previous_status: sortedByDate[i].status,
                new_status: 'RASCUNHO',
                details: `Duplicado automaticamente marcado como RASCUNHO (mantido: ${sortedByDate[0].id})`
              });

              results.duplicates_fixed++;
            }
          }
        }
      }
    }

    // ========== DETECTAR DUPLICATAS: DocumentIntake ==========
    if (entity_type === 'DocumentIntake' || !entity_type) {
      const allDocs = await base44.asServiceRole.entities.DocumentIntake.list(
        'created_date',
        1000
      );

      const docMap = {};
      (allDocs || []).forEach((d) => {
        const key = `${normalizeString(d?.user_email)}_${normalizeString(
          d?.file_name_original
        )}`;
        if (!docMap[key]) docMap[key] = [];
        docMap[key].push(d);
      });

      for (const [key, docs] of Object.entries(docMap)) {
        if (docs.length > 1) {
          results.duplicates_found.push({
            type: 'DocumentIntake',
            key: key,
            count: docs.length,
            ids: docs.map((d) => d.id),
            statuses: docs.map((d) => d.status_processamento)
          });

          if (!dry_run) {
            // Mantém o primeiro, marca outros como REMOVIDO
            const sortedByDate = docs.sort(
              (a, b) => new Date(a.created_date) - new Date(b.created_date)
            );

            for (let i = 1; i < sortedByDate.length; i++) {
              await base44.asServiceRole.entities.DocumentIntake.update(
                sortedByDate[i].id,
                {
                  status_registro: 'REMOVIDO',
                  deleted_at: new Date().toISOString()
                }
              );

              results.duplicates_fixed++;
            }
          }
        }
      }
    }

    // ========== DETECTAR DUPLICATAS: Relatórios ==========
    if (entity_type === 'Report' || !entity_type) {
      const allReports = await base44.asServiceRole.entities.Report.list(
        'created_date',
        500
      );

      const reportMap = {};
      (allReports || []).forEach((r) => {
        const key = `${normalizeString(r?.author_email || r?.created_by)}_${normalizeString(
          r?.mes_referencia
        )}_${toNumber(r?.ano)}`;
        if (!reportMap[key]) reportMap[key] = [];
        reportMap[key].push(r);
      });

      for (const [key, reports] of Object.entries(reportMap)) {
        if (reports.length > 1) {
          results.duplicates_found.push({
            type: 'Report',
            key: key,
            count: reports.length,
            ids: reports.map((r) => r.id),
            statuses: reports.map((r) => r.status)
          });

          if (!dry_run) {
            const sortedByDate = reports.sort(
              (a, b) => new Date(a.created_date) - new Date(b.created_date)
            );

            // Arquiva os antigos
            for (let i = 1; i < sortedByDate.length; i++) {
              await base44.asServiceRole.entities.Report.update(
                sortedByDate[i].id,
                {
                  status: 'ARCHIVED'
                }
              );

              results.duplicates_fixed++;
            }
          }
        }
      }
    }

    // ========== RESUMO ==========
    return Response.json({
      ok: true,
      summary: {
        total_duplicates: results.duplicates_found.length,
        total_fixed: results.duplicates_fixed,
        dry_run: results.dry_run
      },
      results: results
    });
  } catch (e) {
    console.error('detectAndFixDuplicates error:', e);
    return Response.json(
      { error: e.message || 'Erro ao detectar duplicatas' },
      { status: 500 }
    );
  }
});