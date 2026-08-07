import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { analisarNotaFiscal } from '../_shared/lerNotaFiscalGPTCore.ts';

// ================================================================
// zerarFilaAprovarComIA — Processa fila da Entrada Única em lote:
// 1. Lê 100% de cada NF pendente via IA (lerNotaFiscalGPTCore)
// 2. Preenche valor, data, fornecedor, CNPJ, centro de custo, rubrica, meta
// 3. Cria PurchaseRequest e aprova automaticamente
//
// Reutiliza `analisarNotaFiscal` (módulo compartilhado do lerNotaFiscalGPT)
// para evitar reimplementar download Drive + upload Files API + structured outputs.
// ================================================================

const BUDGET_MS = 50000;

const onlyDigits = (v) => String(v ?? '').replace(/\D+/g, '');
const safeStr = (v) => String(v ?? '').trim();

// Map centro_custo do schema strict (uppercase) para o enum do PurchaseRequest
function traduzirCentroCusto(cc) {
  if (!cc) return 'Geral';
  const c = safeStr(cc).toUpperCase();
  if (c === 'MIS' || c === 'MUMO' || c === 'MHAB') return c;
  if (c === 'NOTURNO_2026') return 'Noturno nos Museus 2026';
  if (c === 'NOTURNO_PAMPULHA') return 'Noturno Pampulha';
  if (c === 'PUBLICACOES') return 'Publicações';
  if (c === 'NOTURNO NOS MUSEUS 2026' || c === 'NOTURNO PAMPULHA') return c;
  return 'Geral';
}

Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;
  const db = srv.entities;
  const body = await req.json().catch(() => ({}));
  const batch_size = Math.min(Math.max(Number(body.batch_size || 6), 1), 12);

  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  if (String(user.role || '').toUpperCase() !== 'ADMIN') {
    return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral' }, { status: 403 });
  }
  const aprovadorEmail = user.email;
  const aprovadorNome = safeStr(user.full_name || user.email);

  // Carrega BudgetLines para resolver budgetline_id a partir de rubrica_id
  let budgetLines = [];
  try { budgetLines = await db.BudgetLine.list('', 2000) || []; } catch {}
  const budgetLineByRubrica = new Map();
  for (const bl of budgetLines) {
    const rid = bl.rubrica_id || bl.rubrica_ref_id;
    if (rid && !budgetLineByRubrica.has(rid)) budgetLineByRubrica.set(rid, bl.id);
  }

  // Listagem de intakes pendentes
  const PENDING = new Set(['ENVIADO', 'ANALISANDO_IA', 'AGUARDANDO_REVISAO', 'RASCUNHO', 'ERRO_PROCESSAMENTO']);
  let all;
  try { all = await db.DocumentIntake.list('-created_date', 500); }
  catch (e) { return Response.json({ ok: false, error: 'Erro listar intakes: ' + String(e?.message || e) }, { status: 500 }); }

  const pendentes = (all || []).filter((i) => {
    const st = String(i.status_processamento || '').toUpperCase();
    if (!PENDING.has(st)) return false;
    if (String(i.status_registro || 'ATIVO') !== 'ATIVO') return false;
    if (i.ocultar_entrada_unica === true) return false;
    const tipo = String(i.tipo_detectado || '').toUpperCase();
    return tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML';
  });
  const total_pendentes = pendentes.length;
  const batch = pendentes.slice(0, batch_size);

  const stats = {
    processados: 0,
    analises_ia: 0,
    prs_criados: 0,
    prs_aprovados: 0,
    intakes_atualizados: 0,
    bloqueados_ia: 0,
    erros: [],
    detalhes: [],
    total_pendentes,
    pendentes_restantes: total_pendentes - batch.length,
    elapsed_ms: 0,
  };

  for (const intake of batch) {
    if (Date.now() - start > BUDGET_MS) { stats.erros.push('Budget limite atingido'); break; }
    stats.processados++;
    const fname = intake.file_name_final || intake.file_name_original || '';
    try {
      // 1. Chama lerNotaFiscalGPTCore diretamente (import inline, sem HTTP)
      const result = await analisarNotaFiscal(base44, {
        intake_id: intake.id,
        user_email: user.email,
        feature: 'zerar_fila_aprovar_ia',
      });
      if (!result?.ok) {
        stats.erros.push(`${fname}: IA falhou: ${result?.error || 'sem resultado'}`);
        continue;
      }
      stats.analises_ia++;
      const r = result.resultado || {};

      // 2. Verifica bloqueios da IA
      if (r.nota_cancelada) {
        stats.bloqueados_ia++;
        stats.erros.push(`${fname}: nota cancelada — IA bloqueou`);
        await db.DocumentIntake.update(intake.id, {
          status_processamento: 'REJEITADO',
          erros_validacao: ['Nota fiscal cancelada — bloqueada pela IA'],
          ocultar_entrada_unica: true,
          resultado_ia: { ...(intake.resultado_ia || {}), ...r, _pipeline: 'zerarFilaAprovarComIA_blocked' },
        });
        continue;
      }
      if (r.duplicado && String(r.acao_recomendada || '').includes('VINCULAR')) {
        stats.bloqueados_ia++;
        stats.erros.push(`${fname}: duplicada detectada pela IA`);
        await db.DocumentIntake.update(intake.id, {
          status_processamento: 'REJEITADO',
          erros_validacao: ['Duplicada confirmada pela IA'],
          ocultar_entrada_unica: true,
          resultado_ia: { ...(intake.resultado_ia || {}), ...r, _pipeline: 'zerarFilaAprovarComIA_duplicada' },
        });
        continue;
      }
      if (r.criar_solicitacao_financeira === false && r.tipo_documento !== 'NF_XML') {
        stats.bloqueados_ia++;
        stats.erros.push(`${fname}: IA não recomenda criação de solicitação (${r.tipo_documento})`);
        await db.DocumentIntake.update(intake.id, {
          status_processamento: 'AGUARDANDO_REVISAO',
          erros_validacao: [`IA não recomenda criação de solicitação financeira (${r.tipo_documento})`],
          resultado_ia: { ...(intake.resultado_ia || {}), ...r, _pipeline: 'zerarFilaAprovarComIA_nao_recomenda' },
        });
        continue;
      }

      // 3. Monta campos do PR a partir do resultado da IA
      const valor = Number(r.valor_total) || Number(r.valor_servicos) || 0;
      if (!valor || valor <= 0) {
        stats.erros.push(`${fname}: valor não extraído pela IA`);
        continue;
      }
      const fornecedorNome = safeStr(r.fornecedor_nome);
      const cnpj = onlyDigits(r.fornecedor_cnpj || r.fornecedor_cpf);
      const nf_numero = onlyDigits(r.numero_nota);
      const data_emissao = safeStr(r.data_emissao);
      const chave_acesso = onlyDigits(r.chave_acesso).slice(0, 44);
      const descricao = safeStr(r.descricao_normalizada || r.descricao_original) || `NF ${nf_numero || 's/número'} - ${fornecedorNome}`;
      const centro_custo = traduzirCentroCusto(r.centro_custo);
      const rubrica_id = safeStr(r.rubrica_id);
      const rubrica_nome = safeStr(r.rubrica_nome);
      const meta_id = safeStr(r.meta_id) || 'MC3A-20';
      const natureza = safeStr(r.natureza_despesa) || '339039';
      const pdfUrl = intake.arquivo_original_url || intake.nf_pdf_url || '';
      const xmlUrl = intake.nf_xml_url || '';

      // Resolve budgetline_id via rubrica_id
      const budgetline_id = rubrica_id ? (budgetLineByRubrica.get(rubrica_id) || '') : '';
      if (!rubrica_id || !budgetline_id) {
        stats.erros.push(`${fname}: sem rubrica/budgetline resolvível (IA: rubrica_id=${rubrica_id || 'null'})`);
        // Mesmo sem rubrica, marca AGUARDANDO_REVISAO para análise manual
        await db.DocumentIntake.update(intake.id, {
          status_processamento: 'AGUARDANDO_REVISAO',
          resultado_ia: { ...(intake.resultado_ia || {}), ...r, _pipeline: 'zerarFilaAprovarComIA_sem_rubrica' },
        });
        continue;
      }

      // 4. Cria PurchaseRequest com status inicial SOLICITADO
      const prData = {
        descricao_item: descricao,
        fornecedor_nome: fornecedorNome,
        fornecedor_cnpj: cnpj,
        nf_emitente_cpf_cnpj: cnpj,
        nf_emitente_nome: fornecedorNome,
        nf_numero,
        nf_data_emissao: data_emissao,
        nf_chave_acesso: chave_acesso,
        nf_valor_total: valor,
        valor_solicitado: valor,
        valor_total: valor,
        centro_custo,
        meta_id,
        categoria: 'Nota Fiscal',
        tipo_gasto: 'Serviço',
        rubrica_id,
        rubrica_nome,
        budgetline_id,
        natureza_despesa: natureza,
        nota_fiscal_url: pdfUrl,
        file_url: pdfUrl,
        xml_url: xmlUrl,
        meio_pagamento: 'PIX',
        observacoes: `Automatizado por IA (score ${r.score || 0}/10, status ${r.status_revisao || '?'}, tipo ${r.tipo_documento || '?'}). Alertas: ${(r.alertas || []).slice(0, 3).join(' | ')}`,
        status: 'SOLICITADO',
        origem: 'zerarFilaAprovarComIA',
        tipo_origem: 'entrada_unica_auto_ia',
        Arquivo_nome: fname,
      };

      let pr;
      try {
        pr = await db.PurchaseRequest.create(prData);
        stats.prs_criados++;
      } catch (e) {
        stats.erros.push(`${fname}: criar PR: ${String(e?.message || e)}`);
        continue;
      }

      // 5. Atualiza intake: vincula PR + oculta da fila
      try {
        await db.DocumentIntake.update(intake.id, {
          status_processamento: 'APROVADO',
          grupo_status: 'ENVIADO_APROVACAO',
          entidade_destino: 'PurchaseRequest',
          entidade_destino_id: pr.id,
          fornecedor_id_vinculado: intake.fornecedor_id_vinculado || undefined,
          fornecedor_nome: fornecedorNome,
          fornecedor_cpf_cnpj: cnpj,
          nf_emitente_nome: fornecedorNome,
          nf_emitente_cpf_cnpj: cnpj,
          nf_numero,
          nf_valor_total: valor,
          nf_data_emissao: data_emissao,
          centro_custo: centro_custo,
          rubrica_id: rubrica_id,
          rubrica_nome: rubrica_nome,
          rubrica_confirmada_em: new Date().toISOString(),
          rubrica_confirmada_origem: 'ia_lote',
          ocultar_entrada_unica: true,
          revisado_pelo_usuario: true,
          resultado_ia: { ...(intake.resultado_ia || {}), ...r, _pipeline: 'zerarFilaAprovarComIA', processed_at: new Date().toISOString() },
        });
        stats.intakes_atualizados++;
      } catch (e) {
        stats.erros.push(`${fname}: atualizar intake: ${String(e?.message || e)}`);
      }

      // 6. Aprova automaticamente via purchaseActions
      try {
        const apRes = await srv.functions.invoke('purchaseActions', {
          action: 'aprovar',
          purchaseId: pr.id,
          aprovadorEmail,
          aprovadorNome,
          novaRubricaId: rubrica_id,
          comentario: `Aprovação automática por IA — score ${r.score || 0}/10`,
        });
        const ap = apRes?.data || apRes || {};
        if (ap?.success) {
          stats.prs_aprovados++;
          stats.detalhes.push({
            id: intake.id, pr_id: pr.id, nf_numero, fornecedor: fornecedorNome, valor, rubrica: rubrica_nome, centro: centro_custo,
            score: r.score, aprovado: true,
          });
        } else if (ap?.blocked_by_duplicate) {
          stats.bloqueados_ia++;
          stats.erros.push(`${fname}: NF duplicada — purchaseActions bloqueou aprovação`);
          try {
            await db.DocumentIntake.update(intake.id, {
              status_processamento: 'REJEITADO',
              erros_validacao: ['NF duplicada detectada pela auditoria'],
              ocultar_entrada_unica: true,
            });
          } catch {}
        } else {
          stats.erros.push(`${fname}: aprovar: ${ap?.error || 'falha'}`);
          stats.detalhes.push({
            id: intake.id, pr_id: pr.id, nf_numero, fornecedor: fornecedorNome, valor, rubrica: rubrica_nome, centro: centro_custo,
            score: r.score, aprovado: false, erro: ap?.error || 'falha',
          });
        }
      } catch (e) {
        stats.erros.push(`${fname}: invoke aprovar: ${String(e?.message || e)}`);
      }
    } catch (e) {
      stats.erros.push(`${fname}: ${String(e?.message || e)}`);
    }
  }

  stats.elapsed_ms = Date.now() - start;

  // Registra BackupLog de auditoria
  try {
    await db.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      entity_type: 'ZERAR_FILA_APROVAR_COM_IA',
      status: stats.prs_aprovados > 0 ? 'concluido' : 'failure',
      processed_at: new Date().toISOString(),
      total_files: stats.processados,
      files_copied: stats.prs_aprovados,
      execution_time_ms: stats.elapsed_ms,
      details: JSON.stringify({
        analises_ia: stats.analises_ia,
        prs_criados: stats.prs_criados,
        prs_aprovados: stats.prs_aprovados,
        bloqueados: stats.bloqueados_ia,
        pendentes_restantes: stats.pendentes_restantes,
      }),
      triggered_by: 'manual',
    });
  } catch {}

  return Response.json({ ok: true, ...stats });
});