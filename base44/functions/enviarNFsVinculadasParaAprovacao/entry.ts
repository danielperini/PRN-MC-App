import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// enviarNFsVinculadasParaAprovacao
// ---------------------------------------------------------------------
// Automatização noturna da Entrada Única: percorre NF PDFs em
// AGUARDANDO_REVISAO com XML vinculado e sem duplicidade confirmada e
// envia cada uma para aprovação (cria PurchaseRequest + Attachment,
// atualiza o intake para ENVIADO_APROVACAO + ocultar_entrada_unica=true
// e gera Notification in-app para os coordenadores gerais — sem e-mail).
//
// Reutiliza exatamente a lógica de enviarIntakeParaAprovacao do frontend
// (src/pages/EntradaUnica.jsx). Idempotente: pula intakes que já têm
// PurchaseRequest vinculado. Sem guard de role HTTP — a função é
// chamada pelo scheduler. Registra resultado em BackupLog
// (backup_type='auditoria_entrada_unica', triggered_by='scheduled').
// =====================================================================

const COORD_GERAL_EMAILS = [
  'daniel@periniprojetos.com.br',
  'danielperini.mc@viadutodasartes.org.br',
];

function safeStr(v) {
  return String(v || '').trim();
}

function parseValorBR(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const raw = String(value).trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(raw.replace(',', '.')) || 0;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  const resumo = {
    total: 0,
    enviados: 0,
    falhas: 0,
    pulados_idempotentes: 0,
    sem_xml: 0,
    duplicados: 0,
    erros: [],
  };

  try {
    const base44 = createClientFromRequest(req);
    const srv = base44.asServiceRole;
    if (!srv) return Response.json({ ok: false, error: 'Service role indisponível' }, { status: 500 });

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const isCron = url.searchParams.get('cron') === '1'
      || req.headers.get('x-base44-trigger') === 'cron'
      || body.cron === '1'
      || body.cron === true;
    const triggeredBy = safeStr(body.triggeredBy || (isCron ? 'scheduled' : 'manual'));

    // Sem guard de role HTTP — função chamada pelo scheduler. Em
    // chamadas HTTP manuais, exige admin para evitar uso indevido.
    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
      if (user.role !== 'admin') {
        return Response.json({ ok: false, error: 'Função exclusiva da coordenação geral' }, { status: 403 });
      }
    }

    // ---- 1. Carrega NF PDFs elegíveis (AGUARDANDO_REVISAO + ativos) ----
    const elegiveis = [];
    let skip = 0;
    while (true) {
      const batch = await srv.entities.DocumentIntake.filter(
        { status_registro: 'ATIVO', status_processamento: 'AGUARDANDO_REVISAO' },
        '-created_date', 500, skip,
      ).catch(() => []);
      if (!batch || batch.length === 0) break;
      for (const d of batch) {
        const tipo = safeStr(d.tipo_detectado).toUpperCase();
        if (tipo !== 'NOTA_FISCAL_PDF') continue;
        if (!d.nf_xml_intake_id) { resumo.sem_xml++; continue; }
        const dup = String(d.duplicidade_status || '').toLowerCase();
        if (dup === 'confirmada') { resumo.duplicados++; continue; }
        if (d.duplicada_financeira === true) { resumo.duplicados++; continue; }
        elegiveis.push(d);
      }
      if (batch.length < 500) break;
      skip += 500;
    }

    resumo.total = elegiveis.length;

    if (elegiveis.length === 0) {
      await registrarBackupLog(srv, {
        status: 'concluido', total: 0, enviados: 0, falhas: 0, execution_ms: Date.now() - startTime,
        triggeredBy, erro: '',
      });
      return Response.json({
        ok: true, total: 0, enviados: 0, falhas: 0, pulados_idempotentes: 0, sem_xml: resumo.sem_xml, duplicados: resumo.duplicados,
      });
    }

    // ---- 2. Idempotência: intake_ids que já têm PurchaseRequest ----
    const jaEnviadosSet = new Set();
    let pskip = 0;
    while (true) {
      const prBatch = await srv.entities.PurchaseRequest.filter(
        { origem: 'EntradaUnica' }, '-created_date', 500, pskip,
      ).catch(() => []);
      if (!prBatch || prBatch.length === 0) break;
      for (const p of prBatch) {
        if (p.intake_id) jaEnviadosSet.add(p.intake_id);
        if (p.documento_intake_id) jaEnviadosSet.add(p.documento_intake_id);
      }
      if (prBatch.length < 500) break;
      pskip += 500;
    }

    const aEnviar = elegiveis.filter((e) => !jaEnviadosSet.has(e.id));
    resumo.pulados_idempotentes = elegiveis.length - aEnviar.length;

    // ---- 3. Envia para aprovação reutilizando enviarIntakeParaAprovacao ----
    // Pré-carrega rubricas referenciadas para evitar N gets.
    const rubricaIds = new Set();
    for (const i of aEnviar) {
      const ia = i.resultado_ia || {};
      const rid = i.rubrica_id_sugerida || i.rubrica_id || ia.rubrica_id;
      if (rid) rubricaIds.add(rid);
    }
    const rubricaCache = new Map();
    for (const rid of rubricaIds) {
      const r = await srv.entities.Rubrica.get(rid).catch(() => null);
      if (r) rubricaCache.set(rid, r);
    }

    for (const intake of aEnviar) {
      try {
        const ia = intake.resultado_ia || {};
        const rubrica_id = intake.rubrica_id_sugerida || intake.rubrica_id || ia.rubrica_id;
        const centro_custo = intake.centro_custo || ia.centro_custo_sugerido;
        const valor = parseValorBR(
          ia.nf_valor_total || ia.valor || ia.valor_total || intake.nf_valor_total || 0
        );
        const fileName = intake.file_name_final || intake.file_name_original || 'Arquivo';

        if (!rubrica_id || !centro_custo || !valor) {
          resumo.falhas++;
          resumo.erros.push(`${fileName}: rubrica/centro_custo/valor ausente`);
          continue;
        }

        const rubrica = rubricaCache.get(rubrica_id) || null;
        const rubrica_nome =
          rubrica?.rubrica || rubrica?.nome || rubrica?.descricao ||
          intake.rubrica_nome_sugerida || ia.rubrica_nome_sugerida || '';

        // Cria PurchaseRequest (SOLICITADO)
        const novaPurchase = await srv.entities.PurchaseRequest.create({
          descricao_item: ia.descricao_servico || ia.nf_emitente_nome || intake.fornecedor_nome || fileName,
          fornecedor_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
          fornecedor_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
          valor_solicitado: valor,
          valor_total: valor,
          valor: valor,
          rubrica_id,
          rubrica_nome,
          budgetline_id: rubrica_id,
          centro_custo,
          nota_fiscal_url: intake.arquivo_original_url || '',
          arquivo_url: intake.arquivo_original_url || '',
          file_url: intake.arquivo_original_url || '',
          status: 'SOLICITADO',
          origem: 'EntradaUnica',
          tipo_origem: 'entrada_unica',
          intake_id: intake.id,
          documento_intake_id: intake.id,
          nf_numero: ia.nf_numero || intake.nf_numero || '',
          nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
          nf_emitente_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
        });

        // Cria Attachment
        await srv.entities.Attachment.create({
          purchase_request_id: novaPurchase?.id || '',
          document_intake_id: intake.id,
          file_name: fileName,
          file_url: intake.arquivo_original_url || '',
          file_type: intake.mime_type || 'application/pdf',
          description: 'Entrada Única — envio para aprovação (automação noturna)',
          nf_tipo_documento: 'pdf_nf',
          nf_numero: ia.nf_numero || intake.nf_numero || '',
          nf_valor_total: valor,
          nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || intake.nf_data_emissao || '',
          nf_emitente_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
          nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
          rubrica_id,
          rubrica_nome,
        }).catch(() => null);

        // Atualiza intake
        await srv.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'ENVIADO_APROVACAO',
          ocultar_entrada_unica: true,
          entidade_destino: 'PurchaseRequest',
          entidade_destino_id: novaPurchase?.id || '',
        });

        // Notificação in-app para coordenadores gerais (sem e-mail — e-mails pausados)
        const valorTxt = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        await Promise.all(
          COORD_GERAL_EMAILS.map((email) =>
            srv.entities.Notification.create({
              user_email: email,
              type: 'INVOICE_SUBMITTED',
              title: 'NF enviada para aprovação',
              message: `${fileName} — R$ ${valorTxt} — ${ia.nf_emitente_nome || intake.fornecedor_nome || ''}`,
              entity_type: 'PurchaseRequest',
              entity_id: novaPurchase?.id || '',
              action_url: '/Compras',
              read: false,
              email_sent: false,
            }).catch(() => {})
          )
        );

        resumo.enviados++;
      } catch (e) {
        resumo.falhas++;
        resumo.erros.push(`${intake.file_name_original || intake.id}: ${e?.message || e}`);
      }
    }

    // ---- 4. BackupLog ----
    const execution_ms = Date.now() - startTime;
    await registrarBackupLog(srv, {
      status: resumo.falhas > 0 && resumo.enviados === 0 ? 'failure' : 'concluido',
      total: resumo.total,
      enviados: resumo.enviados,
      falhas: resumo.falhas,
      pulados_idempotentes: resumo.pulados_idempotentes,
      execution_ms,
      triggeredBy,
      erro: resumo.erros.length > 0 ? resumo.erros.slice(0, 10).join('; ').slice(0, 500) : '',
    });

    return Response.json({
      ok: true,
      total: resumo.total,
      enviados: resumo.enviados,
      falhas: resumo.falhas,
      pulados_idempotentes: resumo.pulados_idempotentes,
      sem_xml: resumo.sem_xml,
      duplicados: resumo.duplicados,
      execution_ms,
    });
  } catch (error) {
    console.error('[enviarNFsVinculadasParaAprovacao]', error.message);
    await registrarBackupLogSafe(error.message, resumo).catch(() => {});
    return Response.json({ ok: false, error: error.message, resumo }, { status: 500 });
  }
});

async function registrarBackupLog(srv, dados) {
  try {
    await srv.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'enviarNFsVinculadasParaAprovacao',
      status: dados.erro && dados.enviados === 0 ? 'failure' : 'concluido',
      processed_at: new Date().toISOString(),
      total_files: dados.total || 0,
      files_copied: dados.enviados || 0,
      execution_time_ms: dados.execution_ms || 0,
      triggered_by: dados.triggeredBy || 'scheduled',
      details: safeStr(JSON.stringify({
        enviados: dados.enviados,
        falhas: dados.falhas,
        pulados_idempotentes: dados.pulados_idempotentes,
      })),
      error_message: dados.erro || '',
    });
  } catch (e) {
    console.warn('[BackupLog] falha ao registrar:', e.message);
  }
}

async function registrarBackupLogSafe(errorMessage, resumoLocal) {
  try {
    const { createClientFromRequest } = await import('npm:@base44/sdk@0.8.41');
    // Best-effort: o fluxo principal já tentou registrar via srv; este helper existe
    // apenas como fallback se o srv foi perdido antes do log final.
    console.warn('[enviarNFsVinculadasParaAprovacao] erro fatal:', errorMessage, resumoLocal);
  } catch (e) {
    // silencioso
  }
}