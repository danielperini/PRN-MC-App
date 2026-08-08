import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Limpa registros de Notas Fiscais com arquivos PERMANENTEMENTE AUSENTES no Google Drive.
 *
 * Critério estrito — registro é considerado "permanentemente ausente" quando:
 *  - PurchaseRequest: nenhum ponteiro de arquivo em QUALQUER campo (nf_pdf_url, nf_xml_url,
 *    arquivo_url, documento_url, drive_backup_nf_*_link, drive_backup_comprovante_link,
 *    drive_backup_folder_url, documento_intake_id, intake_id, attachment_id)
 *    E drive_backup_nf_ok = false.
 *  - DocumentIntake (NF): status = ERRO_PROCESSAMENTO E arquivo_original_url/nf_pdf_url/nf_xml_url
 *    todos vazios.
 *
 * Ação:
 *  - PurchaseRequest (não-PAGO): soft-cancel — status=CANCELADO, incluir_no_somatorio=false.
 *  - PurchaseRequest (PAGO sem arquivo): apenas sinaliza em observacoes (risco financeiro).
 *  - DocumentIntake: hard-delete (preferência confirmada pelo coordenador geral).
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const COORD_GERAL_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];
    if (user && user.role !== 'admin' && !COORD_GERAL_EMAILS.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden — apenas administradores / coordenadores gerais' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limite_prs = Number(body.limite_prs ?? 300);
    const limite_intakes = Number(body.limite_intakes ?? 300);
    const dry_run = Boolean(body.dry_run ?? true);

    const hoje = new Date().toISOString().slice(0, 10);
    const stats = {
      audit_date: hoje,
      dry_run,
      prs_analisados: 0,
      prs_sem_arquivo: 0,
      prs_cancelados: 0,
      prs_flag_pagos: 0,
      intakes_analisados: 0,
      intakes_sem_url: 0,
      intakes_removidos: 0,
      erros: 0,
      amostra_prs: [],
      amostra_intakes: []
    };

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    // ============================================================
    // 1) PurchaseRequest — NFs sem qualquer ponteiro de arquivo
    // ============================================================
    const prs = await base44.asServiceRole.entities.PurchaseRequest.filter(
      {
        status: { $nin: ['CANCELADO', 'RECUSADO', 'DEVOLVIDO'] },
        incluir_no_somatorio: true,
        drive_backup_nf_ok: false
      },
      '-updated_date',
      limite_prs
    );

    for (const pr of prs) {
      stats.prs_analisados++;

      const temAlgumArquivo = !!(
        pr.nf_pdf_url ||
        pr.nf_xml_url ||
        pr.arquivo_url ||
        pr.documento_url ||
        pr.nota_fiscal_url ||
        pr.comprovante_url ||
        pr.orcamento_url ||
        pr.file_url ||
        pr.drive_backup_nf_pdf_link ||
        pr.drive_backup_nf_xml_link ||
        pr.drive_backup_comprovante_link ||
        pr.drive_backup_folder_url ||
        pr.documento_intake_id ||
        pr.intake_id ||
        pr.attachment_id
      );
      if (temAlgumArquivo) continue;
      stats.prs_sem_arquivo++;

      // Bypass: NF já PAGA sem arquivo — apenas sinaliza (risco financeiro)
      if (pr.status === 'PAGO' || pr.pago === true) {
        if (!dry_run) {
          try {
            const obsExistente = pr.observacoes || '';
            const marcador = `[ALERTA_AUDITORIA_${hoje}]`;
            if (!obsExistente.includes(marcador)) {
              await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
                observacoes: (obsExistente ? obsExistente + '\n\n' : '') +
                  `${marcador} Arquivo permanentemente ausente no Google Drive, mas NF marcada como PAGA. Revisão manual necessária — possível perda documental.`
              });
            }
            stats.prs_flag_pagos++;
          } catch (e) {
            stats.erros++;
          }
        } else {
          stats.prs_flag_pagos++;
        }
        if (stats.amostra_prs.length < 20) {
          stats.amostra_prs.push({
            id: pr.id, tipo: 'PAGO_SEM_ARQUIVO',
            descricao: (pr.descricao_item || '').substring(0, 50),
            valor: pr.valor_total || pr.valor_solicitado
          });
        }
        continue;
      }

      // Soft-cancel para NFs em trânsito (RASCUNHO, SOLICITADO, APROVADO_*, etc)
      if (!dry_run) {
        try {
          await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, {
            status: 'CANCELADO',
            incluir_no_somatorio: false,
            duplicada_bloqueada: true,
            comentario_devolucao: `NF cancelada automaticamente — arquivo permanentemente ausente no Google Drive após múltiplas tentativas de recuperação (auditoria ${hoje}). Critério: ausência total de ponteiros de arquivo (PDF/XML/Drive/intake/attachment) em todos os campos do registro. Reabertura: reenviar NF via Sala de Espera.`
          });
          stats.prs_cancelados++;
          await delay(120);
        } catch (e) {
          stats.erros++;
        }
      } else {
        stats.prs_cancelados++;
      }

      if (stats.amostra_prs.length < 20) {
        stats.amostra_prs.push({
          id: pr.id, tipo: 'CANCELADO',
          descricao: (pr.descricao_item || '').substring(0, 50),
          valor: pr.valor_total || pr.valor_solicitado
        });
      }
    }

    // ============================================================
    // 2) DocumentIntake — NFs em ERRO_PROCESSAMENTO sem URL válida
    // ============================================================
    const intakes = await base44.asServiceRole.entities.DocumentIntake.filter(
      {
        tipo_detectado: { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML'] },
        status_registro: { $ne: 'REMOVIDO' },
        status_processamento: 'ERRO_PROCESSAMENTO'
      },
      '-created_date',
      limite_intakes
    );

    for (const intake of intakes) {
      stats.intakes_analisados++;

      const url = intake.arquivo_original_url || intake.nf_pdf_url || intake.nf_xml_url;
      if (url) continue; // tem URL — não é permanentemente ausente
      stats.intakes_sem_url++;

      if (!dry_run) {
        try {
          await base44.asServiceRole.entities.DocumentIntake.delete(intake.id);
          stats.intakes_removidos++;
          await delay(250);
        } catch (e) {
          stats.erros++;
        }
      } else {
        stats.intakes_removidos++;
      }

      if (stats.amostra_intakes.length < 20) {
        stats.amostra_intakes.push({
          id: intake.id,
          file: (intake.file_name_original || '').substring(0, 60),
          status: intake.status_processamento
        });
      }
    }

    return Response.json({ ok: true, stats });
  } catch (error) {
    console.error('limparNFsArquivosAusentes error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});