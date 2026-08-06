import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// =====================================================================
// zerarFilaEntradaUnica — Processamento automático em lote da fila da
// Entrada Única. Zera a lista visível aplicando a triagem correta por tipo:
//   - NF-PDF: completa dados via IA (processarNotaFiscalComClaude) +
//     sugere rubrica/meta/centro (suggestRubrica) e envia para aprovação
//     como PurchaseRequest (replica enviarIntakeParaAprovacao).
//     Fallback sem rubrica: cria PurchaseRequest em RASCUNHO com
//     rubrica_nome='A classificar' e oculta o intake (pendente de
//     classificação manual em Compras).
//   - Comprovante (RECIBO_PDF ou nome com "COMP" ou sem valor/nf_numero):
//     backup best-effort + oculta da fila sem criar solicitação.
//   - XML órfão: casa com PDF pelo nf_numero+CNPJ ou valor ±1%; se não
//     achar, backup + oculta.
// OCR: se a primeira leitura falhar, reprocessa uma vez (retry=true).
// Se falhar de novo, marca DocumentIntake com status_processamento=
// 'ERRO_PROCESSAMENTO' e inclui no relatório de erros com tentativas=2.
// Idempotente: ignora ocultar_entrada_unica=true e status ENVIADO_APROVACAO.
// Limite: 25 itens por invocação (frontend faz polling). 45s/item no pior caso.
// =====================================================================

const STATUS_PENDENTES = new Set(['ENVIADO', 'AGUARDANDO_REVISAO', 'ANALISANDO_IA', 'RASCUNHO']);
const LIMITE_PADRAO = 25;
const LIMITE_MAX = 25;

function safeStr(v: any): string {
  return String(v ?? '').trim();
}
function onlyDigits(v: any): string {
  return safeStr(v).replace(/\D/g, '');
}
function normalizeText(v: any): string {
  return safeStr(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function parseValorBR(v: any): number {
  const raw = safeStr(v).replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(',', '.')) || 0;
}
function isXmlIntake(p: any): boolean {
  const t = safeStr(p?.tipo_detectado).toUpperCase();
  const name = safeStr(p?.file_name_original).toLowerCase();
  return t === 'NOTA_FISCAL_XML' || name.endsWith('.xml');
}
function isComprovanteIntake(p: any): boolean {
  const t = safeStr(p?.tipo_detectado).toUpperCase();
  if (t === 'RECIBO_PDF') return true;
  const name = normalizeText(p?.file_name_original);
  if (/\b(comp|comprovante|recibo|boleto|pix|pagamento)\b/.test(name)) {
    return true;
  }
  const ia = p?.resultado_ia || {};
  const valor = parseValorBR(ia.nf_valor_total || ia.valor_total || ia.valor || p?.nf_valor_total);
  const nfNum = onlyDigits(ia.nf_numero || p?.nf_numero);
  if (!valor && !nfNum && !isXmlIntake(p)) return true;
  return false;
}
function getNFNumero(p: any): string {
  const ia = p?.resultado_ia || {};
  return onlyDigits(ia.nf_numero || p?.nf_numero || '');
}
function getCnpj(p: any): string {
  const ia = p?.resultado_ia || {};
  return onlyDigits(ia.nf_emitente_cpf_cnpj || ia.fornecedor_cpf_cnpj || p?.nf_emitente_cpf_cnpj || p?.fornecedor_cpf_cnpj || '');
}
function getValor(p: any): number {
  const ia = p?.resultado_ia || {};
  return parseValorBR(ia.nf_valor_total || ia.valor_total || ia.valor || p?.nf_valor_total);
}
function getCentroCusto(p: any): string {
  const ia = p?.resultado_ia || {};
  return safeStr(p?.centro_custo || ia.centro_custo_sugerido || ia.centro_custo || '');
}

Deno.serve(async (req) => {
  const start = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;

  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
  const rolesUsuario = [
    String(user?.role || ''),
    String(user?.base_role || ''),
    String(user?.app_role || ''),
  ].map((r) => r.toLowerCase()).filter(Boolean);
  const ehAutorizado = rolesUsuario.some((r) =>
    r === 'admin' || r === 'administrator' || r === 'administrador' ||
    r.includes('coord') || r.includes('admin')
  );
  if (!ehAutorizado) {
    return Response.json({ ok: false, error: 'Acesso restrito à coordenação geral' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const limite = Math.min(Math.max(Number(body?.limit ?? body?.limite ?? LIMITE_PADRAO) || LIMITE_PADRAO, 1), LIMITE_MAX);
  const apenasContar = body?.count === true;

  // Busca todos os pendentes visíveis na fila
  const todos = await srv.entities.DocumentIntake.filter(
    { status_registro: 'ATIVO' },
    '-created_date',
    300
  ).catch(() => []);

  const pendentes = (todos || []).filter((p: any) => {
    const status = safeStr(p?.status_processamento).toUpperCase();
    if (!STATUS_PENDENTES.has(status)) return false;
    if (p?.ocultar_entrada_unica === true) return false;
    if (status === 'ENVIADO_APROVACAO') return false;
    return true;
  });

  if (apenasContar) {
    return Response.json({ ok: true, total_pendentes: pendentes.length });
  }

  const lote = pendentes.slice(0, limite);
  const resumo: any = {
    total: lote.length,
    enviados_aprovacao: 0,
    rascunhos_criados: 0,
    comprovantes_ocultados: 0,
    xmls_vinculados: 0,
    xmls_backup: 0,
    erros: [] as any[],
    itens: [] as any[],
  };

  // Carrega PDFs disponíveis para casamento XML (uma vez)
  let pdfsParaMatch: any[] = [];
  const precisaMatchXml = lote.some(isXmlIntake);
  if (precisaMatchXml) {
    pdfsParaMatch = (todos || []).filter((p: any) => {
      const t = safeStr(p?.tipo_detectado).toUpperCase();
      const name = safeStr(p?.file_name_original).toLowerCase();
      const isPdf = t === 'NOTA_FISCAL_PDF' || name.endsWith('.pdf');
      if (!isPdf) return false;
      const status = safeStr(p?.status_processamento).toUpperCase();
      return STATUS_PENDENTES.has(status) && p?.ocultar_entrada_unica !== true;
    });
  }

  async function invokeFn(name: string, payload: any) {
    try {
      const res = await base44.functions.invoke(name, payload);
      return res?.data ?? res;
    } catch (err: any) {
      return { ok: false, error: String(err?.message || err) };
    }
  }

  // Reprocessa NF-PDF via IA. Retorna { ok, tentativas, intakeAtual }.
  async function reprocessarOCR(intake: any): Promise<{ ok: boolean; tentativas: number; intakeAtual: any; error?: string }> {
    // 1ª tentativa
    let resp = await invokeFn('processarNotaFiscalComClaude', {
      intake_id: intake.id,
      file_url: intake.arquivo_original_url,
    });
    if (resp?.ok !== false) {
      const atualizado = await srv.entities.DocumentIntake.get(intake.id).catch(() => intake);
      return { ok: true, tentativas: 1, intakeAtual: atualizado };
    }
    // 2ª tentativa com retry=true
    resp = await invokeFn('processarNotaFiscalComClaude', {
      intake_id: intake.id,
      file_url: intake.arquivo_original_url,
      retry: true,
    });
    if (resp?.ok !== false) {
      const atualizado = await srv.entities.DocumentIntake.get(intake.id).catch(() => intake);
      return { ok: true, tentativas: 2, intakeAtual: atualizado };
    }
    // Falhou 2x — marca o intake como ERRO_PROCESSAMENTO
    await srv.entities.DocumentIntake.update(intake.id, {
      status_processamento: 'ERRO_PROCESSAMENTO',
    }).catch(() => {});
    return {
      ok: false,
      tentativas: 2,
      intakeAtual: intake,
      error: 'OCR falhou após 2 tentativas: ' + (resp?.error || 'sem resposta'),
    };
  }

  for (const intake of lote) {
    const itemResultado: any = {
      id: intake.id,
      nome: intake.file_name_original || intake.file_name_final || '',
    };
    try {
      // ---- XML órfão ----
      if (isXmlIntake(intake)) {
        if (intake.nf_pdf_intake_id) {
          // já vinculado — apenas oculta
          await srv.entities.DocumentIntake.update(intake.id, {
            ocultar_entrada_unica: true,
            status_processamento: 'ENVIADO_APROVACAO',
          }).catch(() => {});
          resumo.xmls_vinculados++;
          itemResultado.acao = 'xml_ja_vinculado';
          resumo.itens.push(itemResultado);
          continue;
        }

        // tenta casar com PDF
        const nfXml = getNFNumero(intake);
        const cnpjXml = getCnpj(intake);
        const valorXml = getValor(intake);
        let melhorPdf: any = null;
        let melhorScore = 0;
        for (const pdf of pdfsParaMatch) {
          if (pdf.id === intake.id) continue;
          if (pdf.nf_xml_intake_id) continue;
          let score = 0;
          if (nfXml && getNFNumero(pdf) === nfXml) score += 4;
          if (cnpjXml && getCnpj(pdf) === cnpjXml) score += 4;
          if (valorXml > 0 && getValor(pdf) > 0 && Math.abs(valorXml - getValor(pdf)) / Math.max(valorXml, 1) <= 0.01) score += 3;
          if (score > melhorScore) { melhorScore = score; melhorPdf = pdf; }
        }
        if (melhorPdf && melhorScore >= 4) {
          await srv.entities.DocumentIntake.update(melhorPdf.id, {
            nf_xml_intake_id: intake.id,
            nf_xml_url: intake.arquivo_original_url,
            grupo_status: 'COMPLETO',
            xml_obrigatorio_pendente: false,
            enviado_sem_xml: false,
            xml_pendente_desde: null,
          }).catch(() => {});
          await srv.entities.DocumentIntake.update(intake.id, {
            nf_pdf_intake_id: melhorPdf.id,
            nf_pdf_url: melhorPdf.arquivo_original_url,
            grupo_status: 'COMPLETO',
            ocultar_entrada_unica: true,
            status_processamento: 'ENVIADO_APROVACAO',
          }).catch(() => {});
          // remove PDF da lista de match para não reusar
          pdfsParaMatch = pdfsParaMatch.filter((p) => p.id !== melhorPdf.id);
          resumo.xmls_vinculados++;
          itemResultado.acao = 'xml_vinculado_pdf';
          resumo.itens.push(itemResultado);
          continue;
        }

        // sem match — backup best-effort e oculta
        await invokeFn('backupSingleFile', { intake_id: intake.id }).catch(() => {});
        await srv.entities.DocumentIntake.update(intake.id, {
          ocultar_entrada_unica: true,
          status_processamento: 'APROVADO',
        }).catch(() => {});
        resumo.xmls_backup++;
        itemResultado.acao = 'xml_backup_sem_match';
        resumo.itens.push(itemResultado);
        continue;
      }

      // ---- Comprovante ----
      if (isComprovanteIntake(intake)) {
        await invokeFn('backupSingleFile', { intake_id: intake.id }).catch(() => {});
        await srv.entities.DocumentIntake.update(intake.id, {
          ocultar_entrada_unica: true,
          status_processamento: 'APROVADO',
          tipo_detectado: 'RECIBO_PDF',
        }).catch(() => {});
        resumo.comprovantes_ocultados++;
        itemResultado.acao = 'comprovante_backup_oculto';
        resumo.itens.push(itemResultado);
        continue;
      }

      // ---- NF PDF ----
      const ia = intake.resultado_ia || {};
      const temDados = parseValorBR(ia.nf_valor_total || ia.valor_total || ia.valor || intake.nf_valor_total) > 0
        && safeStr(ia.nf_emitente_nome || intake.fornecedor_nome || intake.nf_emitente_nome || '').length > 0;
      let intakeAtual: any = intake;

      // Se faltam dados, reprocessa com IA (com retry automático em caso de erro)
      if (!temDados) {
        const ocr = await reprocessarOCR(intake);
        if (!ocr.ok) {
          resumo.erros.push({
            id: intake.id,
            nome: itemResultado.nome,
            arquivo_url: safeStr(intake.arquivo_original_url),
            tipo_detectado: safeStr(intake.tipo_detectado),
            tentativas: ocr.tentativas,
            motivo: ocr.error || 'OCR falhou',
          });
          itemResultado.acao = 'erro_ocr';
          resumo.itens.push(itemResultado);
          continue;
        }
        intakeAtual = ocr.intakeAtual;
      }

      // Sugere rubrica se não houver
      let rubrica_id = safeStr(intakeAtual?.rubrica_id_sugerida || intakeAtual?.rubrica_id);
      let rubrica_nome = safeStr(intakeAtual?.rubrica_nome_sugerida || intakeAtual?.rubrica_nome);
      let centro_custo = getCentroCusto(intakeAtual);
      const iaAtual = intakeAtual?.resultado_ia || {};
      const valor = parseValorBR(iaAtual.nf_valor_total || iaAtual.valor_total || iaAtual.valor || intakeAtual?.nf_valor_total);

      if (!rubrica_id || !centro_custo) {
        const desc = safeStr(iaAtual.descricao_servico || iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome || intakeAtual?.file_name_original);
        const sugResp = await invokeFn('suggestRubrica', {
          descricao: desc,
          fornecedor: safeStr(iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome),
          centro_custo: centro_custo || 'Geral',
        });
        const sug = sugResp?.suggestion;
        if (sug?.rubrica_id) {
          rubrica_id = sug.rubrica_id;
          rubrica_nome = sug.rubrica_nome || rubrica_nome;
          if (sug.centro_custo && !centro_custo) centro_custo = sug.centro_custo;
        }
      }

      // Fallback sem rubrica: cria PurchaseRequest em RASCUNHO e oculta o intake.
      // O item sai da fila visível e fica pendente de classificação em Compras.
      const semRubrica = !rubrica_id;
      const semValor = valor <= 0;

      if (semRubrica || semValor) {
        const fileName = safeStr(intakeAtual?.file_name_final || intakeAtual?.file_name_original) || 'Arquivo';
        const rascunho = await base44.entities.PurchaseRequest.create({
          descricao_item: safeStr(iaAtual.descricao_servico || iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome || fileName),
          fornecedor_nome: safeStr(iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome || ''),
          fornecedor_cnpj: safeStr(iaAtual.nf_emitente_cpf_cnpj || intakeAtual?.fornecedor_cpf_cnpj || ''),
          fornecedor_cpf_cnpj: safeStr(iaAtual.nf_emitente_cpf_cnpj || intakeAtual?.fornecedor_cpf_cnpj || ''),
          valor_solicitado: valor > 0 ? valor : 0,
          valor_total: valor > 0 ? valor : 0,
          rubrica_id: null,
          rubrica_nome: 'A classificar',
          centro_custo: centro_custo || 'Geral',
          nota_fiscal_url: safeStr(intakeAtual?.arquivo_original_url),
          arquivo_url: safeStr(intakeAtual?.arquivo_original_url),
          status: 'RASCUNHO',
          origem: 'EntradaUnica',
          intake_id: intake.id,
          documento_intake_id: intake.id,
          nf_numero: safeStr(iaAtual.nf_numero || intakeAtual?.nf_numero || ''),
          nf_emitente_nome: safeStr(iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome || ''),
          nf_emitente_cpf_cnpj: safeStr(iaAtual.nf_emitente_cpf_cnpj || intakeAtual?.fornecedor_cpf_cnpj || ''),
          nf_valor_total: valor > 0 ? valor : null,
          nf_data_emissao: safeStr(iaAtual.nf_data_emissao || iaAtual.data_emissao || intakeAtual?.nf_data_emissao || '') || undefined,
        }).catch((err: any) => {
          resumo.erros.push({
            id: intake.id,
            nome: itemResultado.nome,
            arquivo_url: safeStr(intake.arquivo_original_url),
            tipo_detectado: safeStr(intake.tipo_detectado),
            tentativas: 1,
            motivo: 'create RASCUNHO fallback: ' + String(err?.message || err),
          });
          return null;
        });

        if (!rascunho) {
          itemResultado.acao = 'erro_purchase_rascunho';
          resumo.itens.push(itemResultado);
          continue;
        }

        await srv.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'APROVADO',
          ocultar_entrada_unica: true,
          entidade_destino: 'PurchaseRequest',
          entidade_destino_id: rascunho?.id || '',
          rubrica_id_sugerida: rubrica_id || null,
          rubrica_nome_sugerida: rubrica_nome || 'A classificar',
          centro_custo: centro_custo || 'Geral',
        }).catch(() => {});

        if (intakeAtual?.nf_xml_intake_id) {
          await srv.entities.DocumentIntake.update(intakeAtual.nf_xml_intake_id, {
            entidade_destino: 'PurchaseRequest',
            entidade_destino_id: rascunho?.id || '',
          }).catch(() => {});
        }

        resumo.rascunhos_criados++;
        itemResultado.acao = 'rascunho_sem_rubrica';
        resumo.itens.push(itemResultado);
        continue;
      }

      // Replica enviarIntakeParaAprovacao
      const rubrica = await srv.entities.Rubrica.get(rubrica_id).catch(() => null);
      const rubricaNomeFinal = safeStr(rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || rubrica_nome);
      const fileName = safeStr(intakeAtual?.file_name_final || intakeAtual?.file_name_original) || 'Arquivo';

      const novaPurchase = await base44.entities.PurchaseRequest.create({
        descricao_item: safeStr(iaAtual.descricao_servico || iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome || fileName),
        fornecedor_nome: safeStr(iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome || ''),
        fornecedor_cnpj: safeStr(iaAtual.nf_emitente_cpf_cnpj || intakeAtual?.fornecedor_cpf_cnpj || ''),
        fornecedor_cpf_cnpj: safeStr(iaAtual.nf_emitente_cpf_cnpj || intakeAtual?.fornecedor_cpf_cnpj || ''),
        valor_solicitado: valor,
        valor_total: valor,
        valor: valor,
        rubrica_id,
        rubrica_nome: rubricaNomeFinal,
        budgetline_id: rubrica_id,
        centro_custo,
        nota_fiscal_url: safeStr(intakeAtual?.arquivo_original_url),
        arquivo_url: safeStr(intakeAtual?.arquivo_original_url),
        status: 'SOLICITADO',
        origem: 'EntradaUnica',
        intake_id: intake.id,
        documento_intake_id: intake.id,
        nf_numero: safeStr(iaAtual.nf_numero || intakeAtual?.nf_numero || ''),
        nf_emitente_nome: safeStr(iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome || ''),
        nf_emitente_cpf_cnpj: safeStr(iaAtual.nf_emitente_cpf_cnpj || intakeAtual?.fornecedor_cpf_cnpj || ''),
        nf_valor_total: valor,
        nf_data_emissao: safeStr(iaAtual.nf_data_emissao || iaAtual.data_emissao || intakeAtual?.nf_data_emissao || '') || undefined,
      }).catch((err: any) => {
        resumo.erros.push({
          id: intake.id,
          nome: itemResultado.nome,
          arquivo_url: safeStr(intake.arquivo_original_url),
          tipo_detectado: safeStr(intake.tipo_detectado),
          tentativas: 1,
          motivo: 'create PurchaseRequest: ' + String(err?.message || err),
        });
        return null;
      });

      if (!novaPurchase) {
        itemResultado.acao = 'erro_purchase';
        resumo.itens.push(itemResultado);
        continue;
      }

      await srv.entities.Attachment.create({
        purchase_request_id: novaPurchase?.id || '',
        document_intake_id: intake.id,
        file_name: fileName,
        file_url: safeStr(intakeAtual?.arquivo_original_url),
        file_type: safeStr(intakeAtual?.mime_type) || 'application/pdf',
        description: 'Entrada Única — zerar fila automático',
        nf_tipo_documento: 'pdf_nf',
        nf_numero: safeStr(iaAtual.nf_numero || intakeAtual?.nf_numero || ''),
        nf_valor_total: valor,
        nf_data_emissao: safeStr(iaAtual.nf_data_emissao || iaAtual.data_emissao || intakeAtual?.nf_data_emissao || '') || undefined,
        nf_emitente_nome: safeStr(iaAtual.nf_emitente_nome || intakeAtual?.fornecedor_nome || ''),
        nf_emitente_cpf_cnpj: safeStr(iaAtual.nf_emitente_cpf_cnpj || intakeAtual?.fornecedor_cpf_cnpj || ''),
        rubrica_id,
        rubrica_nome: rubricaNomeFinal,
      }).catch(() => {});

      await srv.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        ocultar_entrada_unica: true,
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: novaPurchase?.id || '',
        rubrica_id_sugerida: rubrica_id,
        rubrica_nome_sugerida: rubricaNomeFinal,
        centro_custo,
      }).catch(() => {});

      if (intakeAtual?.nf_xml_intake_id) {
        await srv.entities.DocumentIntake.update(intakeAtual.nf_xml_intake_id, {
          entidade_destino: 'PurchaseRequest',
          entidade_destino_id: novaPurchase?.id || '',
        }).catch(() => {});
      }

      resumo.enviados_aprovacao++;
      itemResultado.acao = 'enviado_aprovacao';
      resumo.itens.push(itemResultado);
    } catch (err: any) {
      resumo.erros.push({
        id: intake.id,
        nome: itemResultado.nome,
        arquivo_url: safeStr(intake.arquivo_original_url),
        tipo_detectado: safeStr(intake.tipo_detectado),
        tentativas: 1,
        motivo: String(err?.message || err),
      });
      itemResultado.acao = 'erro';
      resumo.itens.push(itemResultado);
    }
  }

  resumo.duracao_ms = Date.now() - start;
  resumo.restantes_fila = Math.max(0, pendentes.length - lote.length);
  resumo.ok = true;

  // BackupLog consolidado
  try {
    await srv.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      status: 'concluido',
      processed_at: new Date().toISOString(),
      total_files: resumo.total,
      files_copied: resumo.enviados_aprovacao + resumo.rascunhos_criados + resumo.comprovantes_ocultados + resumo.xmls_vinculados + resumo.xmls_backup,
      details: `zerarFilaEntradaUnica: ${resumo.enviados_aprovacao} enviados, ${resumo.rascunhos_criados} rascunhos criados, ${resumo.comprovantes_ocultados} comprovantes, ${resumo.xmls_vinculados} xmls vinculados, ${resumo.xmls_backup} xmls backup, ${resumo.erros.length} erros`,
      triggered_by: 'manual',
    }).catch(() => {});
  } catch {}

  return Response.json(resumo);
});