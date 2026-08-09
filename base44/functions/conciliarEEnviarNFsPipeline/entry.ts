import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// conciliarEEnviarNFsPipeline — Orquestrador noturno da Entrada Única.
// ---------------------------------------------------------------------
// Executa em sequência as 4 fases da conciliação automática de NFs:
//   FASE 1 — casamento local (processarEntradaUnicaLote): vínculo XML↔PDF
//            já existente na fila da Entrada Única.
//   FASE 2 — busca no Google Drive (buscarXmlsNoDrive): localiza XMLs
//            órfãos na pasta raiz de NFs e os vincula aos PDFs pendentes.
//   FASE 3 — busca no Gmail (buscarXmlsNoGmail): localiza anexos XML
//            enviados nos últimos 90 dias e os vincula aos PDFs pendentes.
//   FASE 4 — envio para aprovação (enviarNFsVinculadasParaAprovacao):
//            cria PurchaseRequest + Attachment e gera Notification in-app.
//
// Cada fase é idempotente (verifica nf_xml_intake_id / nf_pdf_intake_id /
// entidade_destino_id antes de processar). Ao final, marca os PDFs que
// permaneceram sem XML com xml_obrigatorio_pendente=true + xml_pendente_desde
// atualizado, e registra um BackupLog consolidado com os totais por fase.
//
// Aceiona por cron (header x-base44-trigger: cron) ou manualmente pelo
// botão "Conciliar e enviar tudo" na EntradaUnica.jsx. Em chamada manual
// exige admin; em cron opera em service-role sem guard HTTP.
// =====================================================================

function safeStr(v) {
  return String(v || '').trim();
}

Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;
  const body = await req.json().catch(() => ({}));
  const isCron = req.headers.get('x-base44-trigger') === 'cron' || body.cron === '1' || body.cron === true;
  const triggeredBy = String(body.triggeredBy || (isCron ? 'scheduled' : 'manual')).toLowerCase() === 'scheduled' ? 'scheduled' : 'manual';

  if (!isCron) {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    if (String(user.role || '').toLowerCase() !== 'admin') {
      return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral' }, { status: 403 });
    }
  }

  // Diagnóstico: valida deploy + conta pendentes atuais sem executar o pipeline.
  if (body.lint === '1' || body.lint === true) {
    try {
      const pend = await srv.entities.DocumentIntake.filter({
        status_registro: 'ATIVO',
        status_processamento: 'AGUARDANDO_REVISAO',
        tipo_detectado: 'NOTA_FISCAL_PDF',
      }, '-created_date', 200).catch(() => []);
      const remaining = (pend || []).filter((p) => !p.nf_xml_intake_id);
      const elegiveis = (pend || []).filter((p) => p.nf_xml_intake_id);
      return Response.json({
        ok: true,
        lint: true,
        total_pdf_pendentes: pend?.length || 0,
        pendentes_sem_xml: remaining.length,
        elegiveis_com_xml: elegiveis.length,
      });
    } catch (e) {
      return Response.json({ ok: false, lint: true, error: String(e?.message || e) }, { status: 500 });
    }
  }

  const totals = {
    vinculados_local: 0,
    encontrados_drive: 0,
    encontrados_gmail: 0,
    enviados_aprovacao: 0,
    pendentes_sem_xml: 0,
    erros: [],
  };

  async function callFn(name, payload) {
    try {
      const res = await base44.functions.invoke(name, payload);
      const data = res?.data ?? res;
      return { ok: true, data: data || {} };
    } catch (e) {
      totals.erros.push(`${name}: ${String(e?.message || e)}`);
      return { ok: false, data: {} };
    }
  }

  // FASE 1 — casamento local (sem auth guard; opera em service-role)
  const f1 = await callFn('processarEntradaUnicaLote', {});
  if (f1.ok) {
    totals.vinculados_local = f1.data?.resumo?.xmls_vinculados ?? f1.data?.xmls_vinculados ?? 0;
  }

  // FASE 2 — busca no Google Drive
  const f2 = await callFn('buscarXmlsNoDrive', { cron: '1', triggeredBy });
  if (f2.ok) totals.encontrados_drive = f2.data?.vinculados ?? f2.data?.encontrados ?? 0;

  // FASE 3 — busca no Gmail
  const f3 = await callFn('buscarXmlsNoGmail', { cron: '1', triggeredBy });
  if (f3.ok) totals.encontrados_gmail = f3.data?.vinculados ?? f3.data?.encontrados ?? 0;

  // FASE 4 — envio para aprovação (já vinculadas)
  const f4 = await callFn('enviarNFsVinculadasParaAprovacao', { cron: '1', triggeredBy });
  if (f4.ok) totals.enviados_aprovacao = f4.data?.enviados ?? 0;

  // Atualiza xml_pendente_desde dos PDFs que ainda ficaram sem XML
  try {
    const pend = await srv.entities.DocumentIntake.filter({
      status_registro: 'ATIVO',
      status_processamento: 'AGUARDANDO_REVISAO',
      tipo_detectado: 'NOTA_FISCAL_PDF',
    }, '-created_date', 200).catch(() => []);
    const remaining = (pend || []).filter((p) => !p.nf_xml_intake_id);
    totals.pendentes_sem_xml = remaining.length;
    const now = new Date().toISOString();
    const updates = remaining
      .filter((p) => !p.xml_pendente_desde)
      .map((p) => ({ id: p.id, xml_obrigatorio_pendente: true, xml_pendente_desde: now }));
    if (updates.length > 0) {
      try {
        await srv.entities.DocumentIntake.bulkUpdate(updates);
      } catch (_) {
        for (const u of updates) {
          try { await srv.entities.DocumentIntake.update(u.id, u); }
          catch (e) { totals.erros.push(`pendencia:${u.id}: ${String(e?.message || e)}`); }
        }
      }
    }
  } catch (e) {
    totals.erros.push(`pendencia_list: ${String(e?.message || e)}`);
  }

  // BackupLog consolidado
  try {
    await srv.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'conciliarEEnviarNFsPipeline',
      status: 'concluido',
      processed_at: new Date().toISOString(),
      triggered_by: triggeredBy,
      execution_time_ms: Date.now() - start,
      details: JSON.stringify(totals),
      error_message: totals.erros.length > 0 ? totals.erros.slice(0, 5).join('; ').slice(0, 500) : '',
    });
  } catch (_) {}

  return Response.json({ ok: true, totals, execution_ms: Date.now() - start });
});