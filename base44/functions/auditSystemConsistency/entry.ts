import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(v) {
  return Number(v) || 0;
}

// ============================================================================
// AUDITORIA COMPLETA DO SISTEMA
// ============================================================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user?.role !== 'admin') {
      return Response.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const skipFix = body?.skip_fix === true;

    const audit = {
      timestamp: new Date().toISOString(),
      user_email: user.email,
      critical_errors: [],
      medium_errors: [],
      data_inconsistencies: [],
      financial_risks: [],
      suggestions: [],
      stats: {
        team_payments_total: 0,
        team_payments_duplicated: 0,
        purchase_requests_total: 0,
        purchase_requests_without_rubrica: 0,
        reports_total: 0,
        documents_total: 0,
        documents_orphan: 0,
        rubricas_inconsistent: 0,
        audit_logs_total: 0
      }
    };

    // ========== ETAPA 1: TeamPayment Duplicação ==========
    console.log('[AUDIT] Verificando TeamPayment duplicação...');
    try {
      const allPayments = await base44.asServiceRole.entities.TeamPayment.list('created_date', 1000);
      audit.stats.team_payments_total = (allPayments || []).length;

      const paymentMap = {};
      (allPayments || []).forEach((p) => {
        const key = `${normalizeString(p?.user_email)}_${normalizeString(p?.mes_referencia)}_${p?.ano || 0}`;
        if (!paymentMap[key]) paymentMap[key] = [];
        paymentMap[key].push(p);
      });

      Object.entries(paymentMap).forEach(([key, payments]) => {
        const active = payments.filter((p) =>
          ['PAGO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'].includes(
            String(p?.status || '').toUpperCase()
          )
        );

        if (active.length > 1) {
          audit.stats.team_payments_duplicated += active.length - 1;
          audit.critical_errors.push({
            type: 'DUPLICATE_TEAM_PAYMENT',
            severity: 'CRITICAL',
            key: key,
            count: active.length,
            payment_ids: active.map((p) => p.id),
            message: `${active.length} pagamentos ATIVOS para a mesma competência (${key})`,
            statuses: active.map((p) => p.status)
          });
        }
      });
    } catch (e) {
      audit.critical_errors.push({
        type: 'ERROR_FETCHING_TEAM_PAYMENTS',
        message: e.message
      });
    }

    // ========== ETAPA 2: Valores de Pagamento ==========
    console.log('[AUDIT] Verificando consistência de valores...');
    try {
      const allPayments = await base44.asServiceRole.entities.TeamPayment.list('created_date', 1000);

      (allPayments || []).forEach((p) => {
        const nfValue = toNumber(p?.valor_nf);
        const expectedValue = toNumber(p?.valor_parcela_previsto);

        if (nfValue > 0 && expectedValue > 0 && Math.abs(nfValue - expectedValue) > 0.01) {
          audit.medium_errors.push({
            type: 'VALUE_MISMATCH',
            payment_id: p.id,
            valor_nf: nfValue,
            valor_esperado: expectedValue,
            diferenca: (nfValue - expectedValue).toFixed(2),
            message: `Valor da NF diferente do esperado`
          });
        }

        if (!p?.rubrica_id && ['PAGO', 'APROVADO_COORD'].includes(String(p?.status || '').toUpperCase())) {
          audit.critical_errors.push({
            type: 'PAYMENT_WITHOUT_RUBRICA',
            payment_id: p.id,
            status: p.status,
            message: `Pagamento ${p.status} sem rubrica vinculada`
          });
        }

        if (String(p?.status || '').toUpperCase() === 'PAGO' && !p?.data_pagamento) {
          audit.medium_errors.push({
            type: 'PAID_WITHOUT_DATE',
            payment_id: p.id,
            message: `Pagamento marcado como PAGO mas sem data_pagamento`
          });
        }
      });
    } catch (e) {
      audit.critical_errors.push({
        type: 'ERROR_VALIDATING_PAYMENTS',
        message: e.message
      });
    }

    // ========== ETAPA 3: Rubricas Consistência ==========
    console.log('[AUDIT] Auditando rubricas...');
    try {
      const rubricas = await base44.asServiceRole.entities.Rubrica.list('nome', 500);

      (rubricas || []).forEach((r) => {
        const total = toNumber(r?.valor_total || r?.valor_rubrica);
        const utilizado = toNumber(r?.valor_utilizado);
        const comprometido = toNumber(r?.saldo_comprometido);

        const saldoCalculado = total - utilizado - comprometido;

        if (saldoCalculado < 0 && Math.abs(saldoCalculado) > 0.01) {
          audit.financial_risks.push({
            type: 'RUBRICA_NEGATIVE_BALANCE',
            rubrica_id: r.id,
            rubrica_nome: r.rubrica || r.nome,
            valor_total: total,
            valor_utilizado: utilizado,
            saldo_comprometido: comprometido,
            saldo_calculado: saldoCalculado.toFixed(2),
            message: `Saldo negativo em rubrica (${saldoCalculado.toFixed(2)})`
          });
        }

        if (utilizado > total) {
          audit.critical_errors.push({
            type: 'RUBRICA_OVERUSED',
            rubrica_id: r.id,
            rubrica_nome: r.rubrica || r.nome,
            valor_total: total,
            valor_utilizado: utilizado,
            message: `Valor utilizado (${utilizado}) > total (${total})`
          });
          audit.stats.rubricas_inconsistent++;
        }
      });
    } catch (e) {
      audit.critical_errors.push({
        type: 'ERROR_AUDITING_RUBRICAS',
        message: e.message
      });
    }

    // ========== ETAPA 4: Relatórios ==========
    console.log('[AUDIT] Verificando relatórios...');
    try {
      const reports = await base44.asServiceRole.entities.Report.list('created_date', 500);
      audit.stats.reports_total = (reports || []).length;

      (reports || []).forEach((r) => {
        const atividades = r?.atividades || [];
        const equipeIds = new Set();

        atividades.forEach((a) => {
          const ids = Array.isArray(a?.equipe_participante_ids) ? a.equipe_participante_ids : [];
          ids.forEach((id) => equipeIds.add(id));
        });

        if (equipeIds.size !== new Set(equipeIds).size) {
          audit.medium_errors.push({
            type: 'REPORT_DUPLICATE_PARTICIPANTS',
            report_id: r.id,
            numero_protocolo: r.numero_protocolo,
            message: `Relatório contém participantes duplicados`
          });
        }
      });
    } catch (e) {
      audit.critical_errors.push({
        type: 'ERROR_AUDITING_REPORTS',
        message: e.message
      });
    }

    // ========== ETAPA 5: Documentos Órfãos ==========
    console.log('[AUDIT] Verificando documentos órfãos...');
    try {
      const attachments = await base44.asServiceRole.entities.Attachment.list('created_date', 1000);
      audit.stats.documents_total = (attachments || []).length;

      (attachments || []).forEach((att) => {
        const hasParent = (att?.report_id || att?.activity_id);
        if (!hasParent) {
          audit.medium_errors.push({
            type: 'ORPHAN_DOCUMENT',
            attachment_id: att.id,
            file_name: att.file_name,
            message: `Documento sem vínculo (report_id ou activity_id)`
          });
          audit.stats.documents_orphan++;
        }
      });
    } catch (e) {
      audit.critical_errors.push({
        type: 'ERROR_AUDITING_DOCUMENTS',
        message: e.message
      });
    }

    // ========== ETAPA 6: Entrada Única (DocumentIntake) ==========
    console.log('[AUDIT] Verificando Entrada Única...');
    try {
      const intakes = await base44.asServiceRole.entities.DocumentIntake.list('created_date', 500);

      const grupoMap = {};
      (intakes || []).forEach((d) => {
        const groupId = d?.grupo_upload_id || 'SEM_GRUPO';
        if (!grupoMap[groupId]) grupoMap[groupId] = [];
        grupoMap[groupId].push(d);
      });

      Object.entries(grupoMap).forEach(([groupId, docs]) => {
        const statuses = new Set(docs.map((d) => d?.grupo_status));
        if (statuses.size > 1) {
          audit.medium_errors.push({
            type: 'INCONSISTENT_INTAKE_GROUP_STATUS',
            grupo_upload_id: groupId,
            statuses: Array.from(statuses),
            message: `Grupo de documentos com status inconsistentes`
          });
        }
      });
    } catch (e) {
      audit.critical_errors.push({
        type: 'ERROR_AUDITING_DOCUMENT_INTAKE',
        message: e.message
      });
    }

    // ========== ETAPA 7: Auditoria de Logs ==========
    console.log('[AUDIT] Contando logs de auditoria...');
    try {
      const logs = await base44.asServiceRole.entities.AuditLog.list('created_date', 2000);
      audit.stats.audit_logs_total = (logs || []).length;

      const entityCounts = {};
      (logs || []).forEach((log) => {
        const key = `${log?.action}_${log?.entity_type}`;
        entityCounts[key] = (entityCounts[key] || 0) + 1;
      });

      audit.stats.audit_logs_by_action = entityCounts;
    } catch (e) {
      audit.medium_errors.push({
        type: 'ERROR_READING_AUDIT_LOGS',
        message: e.message
      });
    }

    // ========== ETAPA 8: PurchaseRequest ==========
    console.log('[AUDIT] Verificando PurchaseRequest...');
    try {
      const purchases = await base44.asServiceRole.entities.PurchaseRequest.list('created_date', 500);
      audit.stats.purchase_requests_total = (purchases || []).length;

      (purchases || []).forEach((p) => {
        if (!p?.rubrica_id && ['APROVADO', 'PAGAMENTO_FEITO'].includes(String(p?.status || '').toUpperCase())) {
          audit.critical_errors.push({
            type: 'PURCHASE_WITHOUT_RUBRICA',
            purchase_id: p.id,
            status: p.status,
            message: `Compra ${p.status} sem rubrica`
          });
          audit.stats.purchase_requests_without_rubrica++;
        }
      });
    } catch (e) {
      audit.critical_errors.push({
        type: 'ERROR_AUDITING_PURCHASES',
        message: e.message
      });
    }

    // ========== RESUMO E SUGESTÕES ==========
    audit.suggestions.push(
      'Revisar todos os pagamentos duplicados identificados',
      'Recalcular rubricas com saldos inconsistentes',
      'Revindicar documentos órfãos ou removê-los',
      'Validar dados de IA que geraram as inconsistências',
      'Fazer backup antes de corrigir qualquer dado',
      'Registrar todas as correções em AuditLog'
    );

    console.log('[AUDIT] Auditoria completa');

    return Response.json({
      ok: true,
      audit_summary: {
        timestamp: audit.timestamp,
        critical_error_count: audit.critical_errors.length,
        medium_error_count: audit.medium_errors.length,
        inconsistencies_found: audit.data_inconsistencies.length,
        financial_risks: audit.financial_risks.length
      },
      audit: audit
    });
  } catch (e) {
    console.error('auditSystemConsistency error:', e);
    return Response.json(
      {
        error: e?.message || 'Erro ao executar auditoria'
      },
      { status: 500 }
    );
  }
});