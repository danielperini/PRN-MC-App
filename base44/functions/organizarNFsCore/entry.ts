// ================================================================
// organizarNFsCore
// Substituto estável de `organizarNFsComIA` (que falha recorrentemente
// no deploy). Reprocessa NFs em lote chamando diretamente o módulo
// compartilhado `_shared/lerNotaFiscalGPTCore.ts` (mesmo runtime,
// sem HTTP/SDK cross-function). Preenche campos faltantes e espelha
// no PurchaseRequest vinculado (salvo status imutável). Ao final
// envia e-mail e registra em BackupLog + AIUsageLog.
// ================================================================
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { analisarNotaFiscal } from '../_shared/lerNotaFiscalGPTCore.ts';
// redeploy trigger

const EMAIL_DESTINO = 'danielperini.mc@viadutodasartes.org.br';
const TIPOS_ALVO = ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML', 'RECIBO_PDF'];
const MAX_POR_INVOCACAO = 50;
const BATCH_SIZE = 5;
const PAUSA_MS = 2000;
const TIMEOUT_POR_NF_MS = 45_000;

const ehVazio = (v) => v == null || v === '' || (typeof v === 'number' && v === 0);

function deveAtualizar(atual, novo, score, revisadoManualmente) {
  if (revisadoManualmente === true) return false;
  if (novo == null || novo === '') return false;
  if (typeof novo === 'number' && Number(novo) === 0) return false;
  if (ehVazio(atual)) return true;
  if (score >= 8 && String(novo) !== String(atual)) return true;
  return false;
}

async function lerNFCore(base44, intake_id, user_email) {
  let timer;
  const promise = analisarNotaFiscal(base44, {
    intake_id,
    user_email: user_email || 'service_role',
    feature: 'organizar_nfs_core_lote',
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timeout Interno (45s)')), TIMEOUT_POR_NF_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function aplicarMergeEPersistir(svc, intake, resultado, dryRun) {
  if (!resultado) return { atualizado: false, campos: [] };
  const camposAtualizados = [];
  const atualizacoesIntake = { resultado_ia: resultado };
  const mapIntake = {
    nf_numero: resultado.numero_nota,
    nf_valor_total: resultado.valor_total,
    nf_emitente_cpf_cnpj: resultado.fornecedor_cnpj || resultado.fornecedor_cpf,
    nf_emitente_nome: resultado.fornecedor_nome,
    fornecedor_cpf_cnpj: resultado.fornecedor_cnpj || resultado.fornecedor_cpf,
    fornecedor_nome: resultado.fornecedor_nome,
    centro_custo: resultado.centro_custo,
    rubrica_id: resultado.rubrica_id,
    rubrica_nome: resultado.rubrica_nome,
    municipio: resultado.municipio_emissao,
  };
  const revisado = intake?.revisado_pelo_usuario === true;
  for (const [campo, valor] of Object.entries(mapIntake)) {
    if (deveAtualizar(intake?.[campo], valor, resultado.score, revisado)) {
      atualizacoesIntake[campo] = valor;
      camposAtualizados.push(campo);
    }
  }
  if (!dryRun) {
    await svc.entities.DocumentIntake.update(intake.id, atualizacoesIntake);
  }
  return {
    atualizado: camposAtualizados.length > 0,
    campos: camposAtualizados.length ? camposAtualizados : ['resultado_ia'],
  };
}

async function espelharEmPurchaseRequest(svc, intake, resultado, dryRun) {
  if (intake?.entidade_destino !== 'PurchaseRequest' || !intake?.entidade_destino_id) return null;
  let compra;
  try {
    compra = await svc.entities.PurchaseRequest.get(intake.entidade_destino_id);
  } catch {
    return null;
  }
  if (!compra) return null;
  if (['APROVADO_ADMIN', 'PAGO'].includes(compra.status)) {
    return { pulado: 'status imutavel' };
  }
  const camposAtualizados = [];
  const atualizacoesCompra = {};
  const mapCompra = {
    nf_numero: resultado.numero_nota,
    nf_emitente_nome: resultado.fornecedor_nome,
    nf_emitente_cpf_cnpj: resultado.fornecedor_cnpj || resultado.fornecedor_cpf,
    nf_valor_total: resultado.valor_total,
    nf_data_emissao: resultado.data_emissao,
    fornecedor_nome: resultado.fornecedor_nome,
    fornecedor_cnpj: resultado.fornecedor_cnpj || resultado.fornecedor_cpf,
    centro_custo: resultado.centro_custo,
    rubrica_id: resultado.rubrica_id,
    rubrica_nome: resultado.rubrica_nome,
    natureza_despesa: resultado.natureza_despesa,
    meta_id: resultado.meta_id,
  };
  for (const [campo, valor] of Object.entries(mapCompra)) {
    if (deveAtualizar(compra[campo], valor, resultado.score, false)) {
      atualizacoesCompra[campo] = valor;
      camposAtualizados.push(campo);
    }
  }
  if (camposAtualizados.length && !dryRun) {
    await svc.entities.PurchaseRequest.update(compra.id, atualizacoesCompra);
  }
  return { atualizado: camposAtualizados.length > 0, campos: camposAtualizados };
}

function gerarCorpoEmail(stats, scoreMedio, appUrl) {
  const entradaLink = appUrl ? `${appUrl}/EntradaUnica` : '/EntradaUnica';
  const errosHtml = stats.erros.length
    ? `<h3 style="margin-top:20px;">Erros (${stats.erro})</h3><ul style="font-family:monospace;font-size:12px;">${stats.erros.map((e) => `<li><b>${e.intake_id || 's/id'}</b>: ${(e.erro || '').replace(/</g, '&lt;')}</li>`).join('')}</ul>`
    : '<p style="margin-top:20px;color:#16a34a;">Nenhum erro registrado.</p>';
  return `
<html><body style="font-family: Inter, Arial, sans-serif; color: #111827; max-width: 640px;">
<h2 style="margin-bottom:8px;">Organização automática de NFs com IA 🤖</h2>
<p style="color:#475569;margin-top:0;">Resumo do processamento em lote:</p>
<table style="border-collapse:collapse;width:100%;margin-top:8px;">
<tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;">Total listado</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">${stats.total}</td></tr>
<tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;">Pulados (score≥9 / PRE_APROVADO)</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">${stats.pulado}</td></tr>
<tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;">Atualizados</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;color:#16a34a;">${stats.atualizado}</td></tr>
<tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;">Erros</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;color:${stats.erro ? '#dc2626' : '#16a34a'};">${stats.erro}</td></tr>
<tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8fafc;">Score médio</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">${scoreMedio}</td></tr>
</table>
${errosHtml}
<p style="margin-top:24px;">Acompanhe o resultado na <a href="${entradaLink}" style="color:#2563eb;">Entrada Única</a>.</p>
<p style="color:#94a3b8;font-size:11px;margin-top:24px;">Função organizarNFsCore · processado em ${new Date().toISOString()}</p>
</body></html>`;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    let user = null;
    try { user = await base44.auth.me(); } catch { /* service role ok */ }

    const body = await req.json().catch(() => ({}));
    const limite = Math.min(Number(body?.limite) || MAX_POR_INVOCACAO, 500);
    const skipInicial = Math.max(0, Number(body?.skip) || 0);
    const dryRun = !!body?.dry_run;
    const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');

    let todos = [];
    let skip = skipInicial;
    while (todos.length < limite) {
      const batch = await svc.entities.DocumentIntake.filter(
        { tipo_detectado: { $in: TIPOS_ALVO }, status_registro: 'ATIVO' },
        '-created_date', 50, skip,
      );
      if (!batch?.length) break;
      todos = todos.concat(batch);
      skip += 50;
      if (batch.length < 50) break;
    }
    todos = todos.slice(0, limite);

    const stats = {
      total: todos.length,
      pulado: 0,
      atualizado: 0,
      erro: 0,
      erros: [],
      scores: [],
    };

    for (let i = 0; i < todos.length; i += BATCH_SIZE) {
      const batch = todos.slice(i, i + BATCH_SIZE);

      const resultados = await Promise.all(batch.map(async (intake) => {
        const temAltaConfianca =
          intake?.resultado_ia?.status_revisao === 'PRE_APROVADO' &&
          Number(intake?.resultado_ia?.score ?? 0) >= 9;
        if (temAltaConfianca) {
          return { tipo: 'pulado', intake_id: intake.id };
        }
        try {
          const r = await lerNFCore(base44, intake.id, user?.email);
          if (!r?.ok) throw new Error(r?.error || 'analisarNotaFiscal falhou');
          return { tipo: 'ok', intake, resultado: r.resultado };
        } catch (e) {
          return { tipo: 'erro', intake_id: intake.id, erro: e?.message || String(e) };
        }
      }));

      for (const r of resultados) {
        if (r.tipo === 'pulado') { stats.pulado++; continue; }
        if (r.tipo === 'erro') {
          stats.erro++;
          stats.erros.push({ intake_id: r.intake_id, erro: r.erro });
          continue;
        }
        try {
          await aplicarMergeEPersistir(svc, r.intake, r.resultado, dryRun);
          try {
            await espelharEmPurchaseRequest(svc, r.intake, r.resultado, dryRun);
          } catch (e) {
            console.warn('[organizarNFsCore] espelho PurchaseRequest falhou:', e.message);
          }
          stats.atualizado++;
          stats.scores.push(Number(r.resultado?.score ?? 0));
        } catch (e) {
          stats.erro++;
          stats.erros.push({ intake_id: r.intake?.id, erro: 'persistência: ' + e.message });
        }
      }

      if (i + BATCH_SIZE < todos.length) {
        await new Promise((r) => setTimeout(r, PAUSA_MS));
      }
    }

    const scoreMedio = stats.scores.length
      ? (stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(2)
      : '0.00';

    let emailStatus = 'enviado';
    try {
      await svc.integrations.Core.SendEmail({
        to: EMAIL_DESTINO,
        subject: `Organização de NFs com IA — ${stats.atualizado} atualizadas, ${stats.erro} erros`,
        body: gerarCorpoEmail(stats, scoreMedio, appUrl),
      });
    } catch (e) {
      emailStatus = 'falhou: ' + e.message;
      console.warn('[organizarNFsCore] e-mail de conclusão falhou:', e.message);
      try {
        await svc.entities.Notification.create({
          user_email: EMAIL_DESTINO,
          type: 'INVOICE_SUBMITTED',
          title: 'Organização de NFs com IA concluída',
          message: `Atualizados: ${stats.atualizado} | Erros: ${stats.erro} | Score médio: ${scoreMedio}`,
        });
      } catch {}
    }

    try {
      await svc.entities.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        status: stats.erro > 0 ? 'erro' : 'concluido',
        details: `organizarNFsCore — total:${stats.total} pulado:${stats.pulado} atualizado:${stats.atualizado} erro:${stats.erro} score_medio:${scoreMedio} email:${emailStatus}`,
        total_files: stats.total,
        execution_time_ms: Date.now() - t0,
        triggered_by: user ? 'manual' : 'scheduled',
      });
    } catch (e) {
      console.warn('[organizarNFsCore] BackupLog falhou:', e.message);
    }

    try {
      await svc.entities.AIUsageLog.create({
        task_type: 'organizar_nfs_lote',
        model_used: 'gpt-4o-2024-08-06',
        user_email: user?.email || 'service_role',
        feature: 'organizar_nfs_core',
        duration_ms: Date.now() - t0,
        error: stats.erro > 0 ? `${stats.erro} erros de ${stats.total} processados` : null,
      });
    } catch (e) {
      console.warn('[organizarNFsCore] AIUsageLog falhou:', e.message);
    }

    return Response.json({
      ok: true,
      stats,
      score_medio: scoreMedio,
      email_status: emailStatus,
      has_more: todos.length === limite,
      next_skip: skipInicial + todos.length,
      duration_ms: Date.now() - t0,
      _marker: 'organizarNFsCore_v1_shared_core',
    });
  } catch (err) {
    console.error('[organizarNFsCore] erro fatal:', err);
    return Response.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
});