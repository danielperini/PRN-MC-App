import { useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

// =====================================================================
// useAutoProcessarFilaCompleta
// ---------------------------------------------------------------------
// Pipeline automático em segundo plano da Entrada Única (somente para
// admin/coordenador). Executa uma única vez por sessão de página:
//
//  Fase 1 — Vinculação local XML↔PDF (match ≥85% por nome/número/valor)
//  Fase 2 — Busca XMLs faltantes no Drive/Gmail (conciliarEEnviarNFsPipeline)
//  Fase 3 — Preenchimento IA histórico (preencherNFsComHistoricoIA, lotes 20)
//  Fase 4 — Cálculo de score de confiança (campos obrigatórios + score IA + XML)
//  Fase 5 — Auto-aprovação direta (PurchaseRequest status=APROVADO_COORD)
//  Fase 6 — XMLs órfãos arquivados (ocultar + status ARQUIVADO + log)
//
// Critério de confiança ≥90:
//   - 50pts: rubrica_id + centro_custo + valor + CNPJ do fornecedor presentes
//   - 40pts: ia_historico_score ≥90 OU resultado_ia sem inconsistências
//   - 10pts: XML vinculado
// Score ≥90 → elegível para auto-aprovação.
// =====================================================================

const THRESHOLD_VINCULO = 85;
const THRESHOLD_CONFIANCA = 90;
const LOTE_IA = 20;

const COORD_GERAL_EMAILS_SET = new Set([
  'daniel@periniprojetos.com.br',
  'danielperini.mc@viadutodasartes.org.br',
]);

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarNomeBase(value) {
  return normalizeText(value || '')
    .replace(/\.(pdf|xml)$/i, '')
    .replace(/\b(comp|comprovante|boleto|bol|recibo|pix|pagamento)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairNumeroNF(value) {
  const m = String(value || '').match(/(?:^|\D)(\d{3,})/);
  return m ? m[1] : '';
}

function jaccard(a, b) {
  const setA = new Set(a.split(' ').filter((p) => p.length > 1));
  const setB = new Set(b.split(' ').filter((p) => p.length > 1));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

function matchPercentual(xml, pdf) {
  const xmlNome = normalizarNomeBase(xml?.file_name_original || xml?.file_name_final || '');
  const pdfNome = normalizarNomeBase(pdf?.file_name_original || pdf?.file_name_final || '');

  const xmlNf = onlyDigits(xml?.resultado_ia?.nf_numero || xml?.nf_numero || '') || extrairNumeroNF(xmlNome);
  const pdfNf = onlyDigits(pdf?.resultado_ia?.nf_numero || pdf?.nf_numero || '') || extrairNumeroNF(pdfNome);

  const xmlValor = parseValorBR(xml?.resultado_ia?.nf_valor_total || xml?.nf_valor_total) || 0;
  const pdfValor = parseValorBR(pdf?.resultado_ia?.nf_valor_total || pdf?.nf_valor_total) || 0;

  if (xmlNf && pdfNf && xmlNf === pdfNf) {
    if (xmlValor > 0 && pdfValor > 0 && Math.abs(xmlValor - pdfValor) < 0.02) return 100;
    return 92;
  }
  if (xmlNome && pdfNome && xmlNome === pdfNome) return 100;
  if (xmlNome && pdfNome) {
    const j = jaccard(xmlNome, pdfNome);
    if (j >= 0.85) return Math.round(j * 100);
  }
  return 0;
}

function getTipoArquivo(intake) {
  const name = String(intake?.file_name_original || '').toLowerCase();
  const mime = String(intake?.mime_type || '').toLowerCase();
  if (mime.includes('xml') || name.endsWith('.xml')) return 'NOTA_FISCAL_XML';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'NOTA_FISCAL_PDF';
  return '';
}

// Score de confiança combinado (0-100)
function calcularScoreConfianca(intake) {
  const ia = intake?.resultado_ia || {};
  let score = 0;

  // 50pts: campos obrigatórios presentes
  const rubrica_id = intake?.rubrica_id_sugerida || intake?.rubrica_id || ia.rubrica_id;
  const centro_custo = intake?.centro_custo || ia.centro_custo_sugerido;
  const valor = parseValorBR(ia.nf_valor_total || ia.valor || ia.valor_total || intake?.nf_valor_total || 0);
  const cnpj = onlyDigits(ia.nf_emitente_cpf_cnpj || ia.fornecedor_cpf_cnpj || intake?.nf_emitente_cpf_cnpj || '');

  const camposOk = !!(rubrica_id && centro_custo && valor > 0 && cnpj);
  if (camposOk) score += 50;

  // 40pts: score IA histórico ≥90 OU sem inconsistências
  const scoreIA = Number(ia.ia_historico_score || 0);
  const inconsistencias = Array.isArray(ia.inconsistencias) ? ia.inconsistencias : [];
  const semInconsistencias = inconsistencias.length === 0;
  const preenchidoHistorico = ia.preenchido_por_ia_historico === true;

  if (scoreIA >= 90) {
    score += 40;
  } else if (preenchidoHistorico && semInconsistencias) {
    score += 40;
  } else if (semInconsistencias && camposOk) {
    score += 20; // confiança parcial
  }

  // 10pts: XML vinculado
  if (intake?.nf_xml_intake_id) score += 10;

  return score;
}

export default function useAutoProcessarFilaCompleta({
  canSeeAll,
  loadingIntakes,
  loadIntakes,
}) {
  const autoProcessouRef = useRef(false);

  const tentarVincularXmlPdfLocal = useCallback(async (lista) => {
    const ativos = (lista || []).filter((i) => !i.ocultar_entrada_unica && i.status_registro !== 'REMOVIDO');
    const pdfs = ativos.filter((i) => getTipoArquivo(i) === 'NOTA_FISCAL_PDF');
    const xmls = ativos.filter((i) => getTipoArquivo(i) === 'NOTA_FISCAL_XML');

    let vinculados = 0;
    for (const xml of xmls) {
      if (xml.nf_pdf_intake_id || xml.grupo_status === 'COMPLETO') continue;
      let melhorPdf = null;
      let melhorScore = 0;
      for (const pdf of pdfs) {
        if (pdf.nf_xml_intake_id || pdf.grupo_status === 'COMPLETO') continue;
        const score = matchPercentual(xml, pdf);
        if (score > melhorScore) {
          melhorScore = score;
          melhorPdf = pdf;
        }
      }
      if (melhorPdf && melhorScore >= THRESHOLD_VINCULO) {
        vinculados++;
        await base44.entities.DocumentIntake.update(melhorPdf.id, {
          nf_xml_intake_id: xml.id,
          nf_xml_url: xml.arquivo_original_url,
          xml_obrigatorio_pendente: false,
          enviado_sem_xml: false,
          xml_pendente_desde: null,
        }).catch(() => {});
        await base44.entities.DocumentIntake.update(xml.id, {
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: melhorPdf.id,
          nf_pdf_url: melhorPdf.arquivo_original_url,
          ocultar_entrada_unica: true,
        }).catch(() => {});
      }
    }
    return vinculados;
  }, []);

  const arquivarXmlesOrfaos = useCallback(async (lista) => {
    const xmls = (lista || []).filter((i) => {
      const tipo = getTipoArquivo(i);
      if (tipo !== 'NOTA_FISCAL_XML') return false;
      if (i.nf_pdf_intake_id || i.grupo_status === 'COMPLETO') return false;
      if (i.ocultar_entrada_unica) return false;
      return true;
    });

    if (xmls.length === 0) return 0;

    const chave = new Date().toISOString().slice(0, 7); // YYYY-MM
    let arquivados = 0;
    for (const xml of xmls) {
      await base44.entities.DocumentIntake.update(xml.id, {
        ocultar_entrada_unica: true,
        status_processamento: 'ARQUIVADO',
      }).catch(() => {});

      try {
        await base44.entities.BackupLog.create({
          backup_type: 'auditoria_entrada_unica',
          entity_type: 'XML_ORFAO_ARQUIVADO',
          entity_id: xml.id,
          file_name: xml.file_name_original || '',
          status: 'concluido',
          processed_at: new Date().toISOString(),
          details: `XML órfão arquivado. Destino sugerido: NFs/${chave}/XMLs-Orfaos`,
          triggered_by: 'auto_background',
        });
      } catch (_) {}
      arquivados++;
    }
    return arquivados;
  }, []);

  const autoAprovarElegiveis = useCallback(async (lista) => {
    const candidatos = (lista || []).filter((i) => {
      const tipo = getTipoArquivo(i);
      if (tipo !== 'NOTA_FISCAL_PDF') return false;
      const status = String(i.status_processamento || '').toUpperCase();
      if (status !== 'AGUARDANDO_REVISAO') return false;
      const dup = String(i.duplicidade_status || '').toLowerCase();
      if (dup === 'confirmada') return false;
      if (i.duplicada_financeira === true) return false;
      return true;
    });

    if (candidatos.length === 0) return { aprovados: 0, semConfianca: 0 };

    // Idempotência: já tem PurchaseRequest?
    const jaTemPR = new Set();
    let skip = 0;
    while (true) {
      const lote = await base44.entities.PurchaseRequest.filter(
        { origem: 'EntradaUnica' },
        '-created_date', 500, skip
      ).catch(() => []);
      if (!lote || lote.length === 0) break;
      for (const p of lote) {
        if (p.intake_id) jaTemPR.add(p.intake_id);
        if (p.documento_intake_id) jaTemPR.add(p.documento_intake_id);
      }
      if (lote.length < 500) break;
      skip += 500;
    }

    // Pré-carrega rubricas
    const rubricaIds = new Set();
    for (const i of candidatos) {
      const ia = i.resultado_ia || {};
      const rid = i.rubrica_id_sugerida || i.rubrica_id || ia.rubrica_id;
      if (rid) rubricaIds.add(rid);
    }
    const rubricaCache = new Map();
    for (const rid of rubricaIds) {
      const r = await base44.entities.Rubrica.get(rid).catch(() => null);
      if (r) rubricaCache.set(rid, r);
    }

    let aprovados = 0;
    let semConfianca = 0;
    const semConfiancaIds = [];

    for (const intake of candidatos) {
      if (jaTemPR.has(intake.id)) continue;
      const score = calcularScoreConfianca(intake);
      if (score < THRESHOLD_CONFIANCA) {
        semConfianca++;
        semConfiancaIds.push(intake.id);
        continue;
      }

      try {
        const ia = intake.resultado_ia || {};
        const rubrica_id = intake.rubrica_id_sugerida || intake.rubrica_id || ia.rubrica_id;
        const centro_custo = intake.centro_custo || ia.centro_custo_sugerido;
        const valor = parseValorBR(ia.nf_valor_total || ia.valor || ia.valor_total || intake.nf_valor_total || 0);
        const fileName = intake.file_name_final || intake.file_name_original || 'Arquivo';

        if (!rubrica_id || !centro_custo || !valor) {
          semConfianca++;
          continue;
        }

        const rubrica = rubricaCache.get(rubrica_id) || null;
        const rubrica_nome = rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || intake.rubrica_nome_sugerida || '';

        // Auto-aprovação direta: status APROVADO_COORD
        const novaPurchase = await base44.entities.PurchaseRequest.create({
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
          status: 'APROVADO_COORD',
          aprov_coord_nome: 'Sistema IA (auto-aprovação)',
          aprov_coord_data: new Date().toISOString().slice(0, 10),
          aprov_coord_comentario: `Auto-aprovada em segundo plano (score ${score}/100). Xml: ${intake.nf_xml_intake_id ? 'vinculado' : 'sem XML'}.`,
          origem: 'EntradaUnica',
          tipo_origem: 'auto_aprovacao_ia',
          intake_id: intake.id,
          documento_intake_id: intake.id,
          nf_numero: ia.nf_numero || intake.nf_numero || '',
          nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
          nf_emitente_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
        });

        await base44.entities.Attachment.create({
          purchase_request_id: novaPurchase?.id || '',
          document_intake_id: intake.id,
          file_name: fileName,
          file_url: intake.arquivo_original_url || '',
          file_type: intake.mime_type || 'application/pdf',
          description: 'Entrada Única — auto-aprovação (confiança ≥90%)',
          nf_tipo_documento: 'pdf_nf',
          nf_numero: ia.nf_numero || intake.nf_numero || '',
          nf_valor_total: valor,
          nf_emitente_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
          nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
          rubrica_id,
          rubrica_nome,
        }).catch(() => null);

        const iaComFlag = { ...(intake.resultado_ia || {}), auto_aprovado_ia: true, score_confianca: score };
        await base44.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'ENVIADO_APROVACAO',
          ocultar_entrada_unica: true,
          entidade_destino: 'PurchaseRequest',
          entidade_destino_id: novaPurchase?.id || '',
          resultado_ia: iaComFlag,
        }).catch(() => {});

        // Notificação in-app para coordenadores (sem e-mail)
        const valorTxt = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const notifMsg = `${fileName} — R$ ${valorTxt} — ${ia.nf_emitente_nome || intake.fornecedor_nome || ''}`;
        await Promise.all(
          Array.from(COORD_GERAL_EMAILS_SET).map((email) =>
            base44.entities.Notification.create({
              user_email: email,
              type: 'INVOICE_APPROVED',
              title: 'NF auto-aprovada (IA)',
              message: notifMsg,
              entity_type: 'PurchaseRequest',
              entity_id: novaPurchase?.id || '',
              action_url: '/Compras',
              read: false,
              email_sent: false,
            }).catch(() => {})
          )
        );
        aprovados++;
      } catch (e) {
        console.warn('[autoAprovar] erro para', intake.id, e?.message || e);
      }
    }
    return { aprovados, semConfianca, semConfiancaIds };
  }, []);

  const executarPipeline = useCallback(async () => {
    if (autoProcessouRef.current) return;
    autoProcessouRef.current = true;

    toast.info('Processando fila automaticamente...', { icon: '⚡', duration: 4000 });

    const resumo = { vinculados: 0, xmlsArquivados: 0, aprovados: 0, baixaConfianca: 0, leiturasProfundas: 0 };

    try {
      // Carrega a lista mais recente de intakes do banco
      const lista = await base44.entities.DocumentIntake.filter(
        { status_registro: 'ATIVO' },
        '-created_date', 200
      ).catch(() => []);

      if (!lista || lista.length === 0) return resumo;

      // Fase 1: vinculação local
      const vinc = await tentarVincularXmlPdfLocal(lista);
      resumo.vinculados = vinc;

      // Fase 2: busca Drive/Gmail (backend) — melhor esforço
      try {
        await base44.functions.invoke('conciliarEEnviarNFsPipeline', {
          triggeredBy: 'auto_background',
        });
      } catch (_) {}

      // Recarrega após Drive/Gmail
      const lista2 = await base44.entities.DocumentIntake.filter(
        { status_registro: 'ATIVO' },
        '-created_date', 200
      ).catch(() => []);

      // Fase 3: preenchimento IA histórico (lotes de 20)
      const pendentesIA = (lista2 || []).filter((i) => {
        const tipo = getTipoArquivo(i);
        if (tipo !== 'NOTA_FISCAL_PDF') return false;
        const status = String(i.status_processamento || '').toUpperCase();
        if (status !== 'AGUARDANDO_REVISAO') return false;
        const ia = i.resultado_ia || {};
        const score = Number(ia.ia_historico_score || 0);
        const fonteLeituraProfunda = ia.fonte === 'lerNotaFiscalGPT';
        const jaPreenchido =
          (ia.preenchido_por_ia_historico === true && score >= 90) ||
          (fonteLeituraProfunda && score >= 70);
        if (jaPreenchido) return false;
        return true; // reprocessa para elevar score
      });

      if (pendentesIA.length > 0) {
        for (let i = 0; i < pendentesIA.length; i += LOTE_IA) {
          const lote = pendentesIA.slice(i, i + LOTE_IA);
          try {
            await base44.functions.invoke('preencherNFsComHistoricoIA', {
              intake_ids: lote.map((p) => p.id),
            });
          } catch (_) {}
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      // Recarrega após preenchimento IA
      const lista3 = await base44.entities.DocumentIntake.filter(
        { status_registro: 'ATIVO' },
        '-created_date', 200
      ).catch(() => []);

      // Fase 3.5: leitura profunda (lerNotaFiscalGPT) para PDFs sem rubrica ou
      // com score baixo após histórico. Sequencial, melhor esforço — não bloqueia
      // o restante do pipeline. Timeout de 90s por documento.
      const semRubricaOuBaixoScore = (lista3 || []).filter((i) => {
        const tipo = getTipoArquivo(i);
        if (tipo !== 'NOTA_FISCAL_PDF') return false;
        const status = String(i.status_processamento || '').toUpperCase();
        if (status !== 'AGUARDANDO_REVISAO') return false;
        if (i.ocultar_entrada_unica) return false;
        const ia = i.resultado_ia || {};
        const temRubrica = !!(i.rubrica_id_sugerida || ia.rubrica_id);
        const score = Number(ia.ia_historico_score || 0);
        const jaLeituraProfunda = ia.fonte === 'lerNotaFiscalGPT';
        return (!temRubrica || score < 70) && !jaLeituraProfunda;
      });

      let leiturasProfundas = 0;
      for (const intake of semRubricaOuBaixoScore.slice(0, 8)) {
        try {
          await base44.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'ANALISANDO_IA',
          }).catch(() => {});
          const acionar = base44.functions.invoke('lerNotaFiscalGPT', {
            intake_id: intake.id,
            file_url: intake.arquivo_original_url,
          });
          const timeout = new Promise((_, rej) =>
            setTimeout(() => rej(new Error('timeout-90s')), 90000)
          );
          const res = await Promise.race([acionar, timeout]).catch((e) => ({
            ok: false,
            error: e?.message || String(e),
          }));
          if (res?.ok && res?.resultado) {
            const r = res.resultado;
            const resultadoIa = {
              ...r,
              nf_numero: String(r.numero_nota || '').replace(/\D/g, ''),
              nf_emitente_nome: r.fornecedor_nome || '',
              nf_emitente_cpf_cnpj: String(r.fornecedor_cnpj || r.fornecedor_cpf || '').replace(/\D/g, ''),
              nf_valor_total: r.valor_total || 0,
              nf_data_emissao: r.data_emissao || '',
              valor: r.valor_total || 0,
              valor_total: r.valor_total || 0,
              rubrica_id: r.rubrica_id || null,
              rubrica_nome: r.rubrica_nome || '',
              centro_custo_sugerido: r.centro_custo || '',
              meta_id: r.meta_id || null,
              descricao_servico: r.descricao_normalizada || '',
              ia_historico_score: Math.round((r.score || 0) * 10),
              inconsistencias: r.campos_incertos || [],
              alertas: r.alertas || [],
              status_revisao: r.status_revisao || '',
              nota_cancelada: r.nota_cancelada || false,
              fonte: 'lerNotaFiscalGPT',
              processado_em: new Date().toISOString(),
            };
            await base44.entities.DocumentIntake.update(intake.id, {
              resultado_ia: resultadoIa,
              status_processamento: 'AGUARDANDO_REVISAO',
              rubrica_id_sugerida: r.rubrica_id || null,
              rubrica_nome_sugerida: r.rubrica_nome || '',
              centro_custo: r.centro_custo || '',
              nf_numero: resultadoIa.nf_numero,
              nf_emitente_nome: r.fornecedor_nome || '',
              nf_emitente_cpf_cnpj: resultadoIa.nf_emitente_cpf_cnpj,
              nf_valor_total: r.valor_total || null,
              nf_data_emissao: r.data_emissao || '',
              fornecedor_nome: r.fornecedor_nome || '',
              fornecedor_cpf_cnpj: resultadoIa.nf_emitente_cpf_cnpj,
              erros_validacao: r.alertas || [],
            }).catch(() => {});
            leiturasProfundas++;
          } else {
            await base44.entities.DocumentIntake.update(intake.id, {
              status_processamento: 'AGUARDANDO_REVISAO',
              erros_validacao: [`Leitura profunda (auto) falhou: ${res?.error || 'sem resultado'}`],
            }).catch(() => {});
          }
        } catch (e) {
          console.warn('[autoPipeline] leitura profunda falhou para', intake.id, e?.message || e);
        }
      }
      resumo.leiturasProfundas = leiturasProfundas;

      // Recarrega após leitura profunda
      const lista4 = (lista3 || []).length > 0 && leiturasProfundas > 0
        ? await base44.entities.DocumentIntake.filter(
            { status_registro: 'ATIVO' },
            '-created_date', 200
          ).catch(() => lista3 || [])
        : (lista3 || []);

      // Fase 4 + 5: score de confiança e auto-aprovação
      const aprovarRes = await autoAprovarElegiveis(lista4);
      resumo.aprovados = aprovarRes.aprovados || 0;
      resumo.baixaConfianca = aprovarRes.semConfianca || 0;

      // Fase 6: arquivar XMLs órfãos
      const xmlArq = await arquivarXmlesOrfaos(lista4);
      resumo.xmlsArquivados = xmlArq;

      return resumo;
    } catch (e) {
      console.error('[autoProcessarPipeline] erro fatal:', e?.message || e);
      return resumo;
    }
  }, [tentarVincularXmlPdfLocal, autoAprovarElegiveis, arquivarXmlesOrfaos]);

  const disparar = useCallback(async () => {
    if (!canSeeAll) return;
    if (loadingIntakes) return;
    if (autoProcessouRef.current) return;

    const resumo = await executarPipeline();
    if (resumo) {
      const totalAcao = (resumo.aprovados || 0) + (resumo.vinculados || 0) + (resumo.xmlsArquivados || 0) + (resumo.leiturasProfundas || 0);
      if (totalAcao > 0) {
        toast.success(
          `Auto-processamento: ${resumo.aprovados} aprovadas, ${resumo.leiturasProfundas} leituras profundas, ${resumo.vinculados} vinculadas, ${resumo.xmlsArquivados} XMLs arquivados, ${resumo.baixaConfianca} com baixa confiança.`,
          { duration: 6000 }
        );
      }
      await loadIntakes();
    }
  }, [canSeeAll, loadingIntakes, executarPipeline, loadIntakes]);

  return { disparar, autoProcessouRef };
}