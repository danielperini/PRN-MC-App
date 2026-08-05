import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ===== Normalizadores (determinísticos, sem IA) =====
function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
function digits(v) {
  return String(v || '').replace(/\D/g, '');
}
function asNumber(v) {
  const t = String(v || '').trim();
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
}
function nomeBaseNormalizado(v) {
  const raw = String(v || '').replace(/\.[^.]+$/, '');
  return norm(raw)
    .replace(/\b(comp|comprovante|boleto|bol|recibo|pix|pagamento)\b/g, '')
    .replace(/\b(pdf|xml)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ===== Extrações determinísticas do nome do arquivo =====
function extrairNumeroNFDoNome(value) {
  const base = String(value || '').replace(/\.[^.]+$/, '');
  const nums = base.match(/\d{3,}/g) || [];
  const candidatos = nums.filter((n) => n.length >= 3 && n.length <= 10);
  return candidatos.length ? candidatos[0] : nums[0] || '';
}

function extrairValorDoNome(value) {
  const s = String(value || '');
  const m = s.match(/r\$?\s*([\d][\d.,]{2,})/i);
  if (!m) return 0;
  const str = m[1];
  const n = Number(str.includes(',') ? str.replace(/\./g, '').replace(',', '.') : str);
  return Number.isFinite(n) ? n : 0;
}

const MESES_PT = {
  janeiro: 1, janeiro: 1, fevereiro: 2, fevereiro: 2, marco: 3, marco: 3, marco: 3,
  abril: 4, maio: 5, junho: 6, junho: 6, julho: 7, julho: 7, agosto: 8, agosto: 8,
  setembro: 9, setembro: 9, outubro: 10, outubro: 10, novembro: 11, novembro: 11, dezembro: 12, dezembro: 12,
};

function extrairDataDoNome(value) {
  const s = String(value || '');

  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  m = s.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  for (const [nome, num] of Object.entries(MESES_PT)) {
    const re = new RegExp(`${nome}\\s+(?:de\\s+)?(20\\d{2})`, 'i');
    const mm = s.match(re);
    if (mm) {
      const ano = mm[1];
      const mes = String(num).padStart(2, '0');
      return `${ano}-${mes}-01`;
    }
  }

  return '';
}

// ===== Mapeamento de centro de custo por palavra-chave =====
const KEYWORD_CENTRO_CUSTO = [
  { keys: ['mumo', 'museu da mineira'], valor: 'MUMO' },
  { keys: ['mis'], valor: 'MIS' },
  { keys: ['mhab', 'mahb'], valor: 'MHAB' },
  {
    keys: ['noturno', 'pampulha'],
    valor: 'Noturno nos Museus 2026',
  },
  { keys: ['viaduto'], valor: 'Geral' },
];

function inferirCentroCusto(nome) {
  const n = norm(nome);
  if (!n) return '';
  for (const regra of KEYWORD_CENTRO_CUSTO) {
    for (const k of regra.keys) {
      if (n.includes(k)) return regra.valor;
    }
  }
  return '';
}

// ===== Matching XML <-> PDF (score composto, threshold 85) =====
function jaccard(a, b) {
  const setA = new Set(a.split(' ').filter((p) => p.length > 1));
  const setB = new Set(b.split(' ').filter((p) => p.length > 1));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union > 0 ? Math.round((inter / union) * 100) : 0;
}

function matchPercentualXmlPdf(xml, pdf) {
  const xmlNome = nomeBaseNormalizado(xml?.file_name_final || xml?.file_name_original || '');
  const pdfNome = nomeBaseNormalizado(pdf?.file_name_final || pdf?.file_name_original || '');

  const xmlNum = digits(xml?.nf_numero || xml?.resultado_ia?.nf_numero) || extrairNumeroNFDoNome(xmlNome);
  const pdfNum = digits(pdf?.nf_numero || pdf?.resultado_ia?.nf_numero) || extrairNumeroNFDoNome(pdfNome);

  const xmlValor = asNumber(xml?.nf_valor_total || xml?.resultado_ia?.nf_valor_total) || extrairValorDoNome(xmlNome);
  const pdfValor = asNumber(pdf?.nf_valor_total || pdf?.resultado_ia?.nf_valor_total) || extrairValorDoNome(pdfNome);

  if (xmlNum && pdfNum && xmlNum === pdfNum) {
    if (xmlValor > 0 && pdfValor > 0 && Math.abs(xmlValor - pdfValor) < 0.02) return 100;
    return 92;
  }
  if (xmlNome && pdfNome && xmlNome === pdfNome) return 100;
  if (xmlNome && pdfNome) {
    const j = jaccard(xmlNome, pdfNome);
    if (j >= 85) return j;
  }
  return 0;
}

function pickIa(ia, ...keys) {
  for (const k of keys) {
    const v = ia?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  const LIMIT = 100;
  const SCORE_THRESHOLD = 85;
  const MAX_FORNECEDORES_CRIAR = 20;
  const STATUS_APROVADOS_COMPRA = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

  const stats = {
    total_analisados: 0,
    xmls_vinculados: 0,
    datas_preenchidas: 0,
    valores_preenchidos: 0,
    centros_custo_corrigidos: 0,
    fornecedores_promovidos: 0,
    fornecedores_criados: 0,
    fornecedores_vinculados: 0,
    rubricas_confirmadas_historico: 0,
    ids_processados: [],
    detalhes_xml_pdf: [],
    detalhes_data_valor: [],
    detalhes_centro_custo: [],
    detalhes_fornecedor: [],
    detalhes_rubrica: [],
    erros: [],
  };

  try {
    const todos = await db.DocumentIntake.filter({
      status_registro: 'ATIVO',
    }, '-created_date', LIMIT);

    const intakes = (todos || []).filter((i) => {
      const st = String(i.status_processamento || '').toUpperCase();
      return !['APROVADO', 'ENVIADO_APROVACAO', 'DELETADO', 'REJEITADO'].includes(st);
    });

    stats.total_analisados = intakes.length;
    for (const i of intakes) if (i.id) stats.ids_processados.push(i.id);

    // ===== FRENTES 2 e 3: preenchimento de campos (não-sobrescrita) =====
    const patchPorId = {};
    for (const intake of intakes) {
      if (!intake?.id) continue;
      const nome = intake.file_name_final || intake.file_name_original || '';
      const patch = {};
      const ia = intake.resultado_ia || {};

      const dataAtual = String(intake.nf_data_emissao || ia.nf_data_emissao || '').trim();
      if (!dataAtual) {
        const extraida = extrairDataDoNome(nome);
        if (extraida) {
          patch.nf_data_emissao = extraida;
          stats.datas_preenchidas++;
          stats.detalhes_data_valor.push({ id: intake.id, campo: 'nf_data_emissao', valor: extraida });
        }
      }

      const valorAtual = asNumber(intake.nf_valor_total || ia.nf_valor_total || 0);
      if (!valorAtual) {
        const extraido = extrairValorDoNome(nome);
        if (extraido > 0) {
          patch.nf_valor_total = extraido;
          stats.valores_preenchidos++;
          stats.detalhes_data_valor.push({ id: intake.id, campo: 'nf_valor_total', valor: extraido });
        }
      }

      const ccAtual = String(intake.centro_custo || '').trim();
      if (!ccAtual) {
        const inferido = inferirCentroCusto(nome);
        if (inferido) {
          patch.centro_custo = inferido;
          stats.centros_custo_corrigidos++;
          stats.detalhes_centro_custo.push({ id: intake.id, centro_custo: inferido, nome });
        }
      }

      if (Object.keys(patch).length > 0) patchPorId[intake.id] = patch;
    }

    const bulkPatch = Object.keys(patchPorId).map((id) => ({ id, ...patchPorId[id] }));
    if (bulkPatch.length > 0) {
      try {
        await db.DocumentIntake.bulkUpdate(bulkPatch);
      } catch (e) {
        for (const item of bulkPatch) {
          try { await db.DocumentIntake.update(item.id, item); }
          catch (err) { stats.erros.push({ id: item.id, fase: 'campos', msg: String(err?.message || err) }); }
        }
      }
    }

    // ===== FRENTE 1: vínculo XML <-> PDF (após refresh dos campos) =====
    let atualizados = intakes;
    if (bulkPatch.length > 0) {
      try {
        const refresh = await db.DocumentIntake.filter({
          status_registro: 'ATIVO',
        }, '-created_date', LIMIT);
        atualizados = (refresh || []).filter((i) => {
          const st = String(i.status_processamento || '').toUpperCase();
          return !['APROVADO', 'ENVIADO_APROVACAO', 'DELETADO', 'REJEITADO'].includes(st);
        });
      } catch (_) {}
    }

    const pdfs = atualizados.filter((i) => {
      const tipo = i.tipo_detectado || '';
      const mime = String(i.mime_type || '').toLowerCase();
      const nome = String(i.file_name_final || i.file_name_original || '').toLowerCase();
      return tipo === 'NOTA_FISCAL_PDF' || mime.includes('pdf') || nome.endsWith('.pdf');
    });
    const xmls = atualizados.filter((i) => {
      const tipo = i.tipo_detectado || '';
      const mime = String(i.mime_type || '').toLowerCase();
      const nome = String(i.file_name_final || i.file_name_original || '').toLowerCase();
      return tipo === 'NOTA_FISCAL_XML' || mime.includes('xml') || nome.endsWith('.xml');
    });

    const xmlUpdates = [];
    const pdfUpdates = [];
    const xmlUsados = new Set();
    const pdfUsados = new Set();

    for (const xml of xmls) {
      if (xmlUsados.has(xml.id)) continue;
      if (xml.nf_pdf_intake_id || xml.grupo_status === 'COMPLETO') {
        xmlUsados.add(xml.id);
        continue;
      }
      let melhorPdf = null;
      let melhorScore = 0;
      for (const pdf of pdfs) {
        if (pdfUsados.has(pdf.id)) continue;
        if (pdf.nf_xml_intake_id || pdf.grupo_status === 'COMPLETO') continue;
        const score = matchPercentualXmlPdf(xml, pdf);
        if (score > melhorScore) {
          melhorScore = score;
          melhorPdf = pdf;
        }
      }
      if (melhorPdf && melhorScore >= SCORE_THRESHOLD) {
        xmlUsados.add(xml.id);
        pdfUsados.add(melhorPdf.id);
        stats.xmls_vinculados++;
        stats.detalhes_xml_pdf.push({
          xml_id: xml.id,
          pdf_id: melhorPdf.id,
          score: melhorScore,
        });

        xmlUpdates.push({
          id: xml.id,
          grupo_status: 'COMPLETO',
          nf_pdf_intake_id: melhorPdf.id,
          nf_pdf_url: melhorPdf.arquivo_original_url || '',
          ocultar_entrada_unica: true,
        });
        pdfUpdates.push({
          id: melhorPdf.id,
          nf_xml_intake_id: xml.id,
          nf_xml_url: xml.arquivo_original_url || '',
          xml_obrigatorio_pendente: false,
          enviado_sem_xml: false,
          xml_pendente_desde: null,
        });
      }
    }

    if (xmlUpdates.length > 0) {
      try {
        await db.DocumentIntake.bulkUpdate(xmlUpdates);
      } catch (e) {
        for (const u of xmlUpdates) {
          try { await db.DocumentIntake.update(u.id, u); }
          catch (err) { stats.erros.push({ id: u.id, fase: 'xml_link', msg: String(err?.message || err) }); }
        }
      }
    }
    if (pdfUpdates.length > 0) {
      try {
        await db.DocumentIntake.bulkUpdate(pdfUpdates);
      } catch (e) {
        for (const u of pdfUpdates) {
          try { await db.DocumentIntake.update(u.id, u); }
          catch (err) { stats.erros.push({ id: u.id, fase: 'pdf_link', msg: String(err?.message || err) }); }
        }
      }
    }

    // ===== FRENTE 4: promoção de campos de fornecedor da IA para a raiz =====
    const patchFornecedorPorId = {};
    for (const intake of intakes) {
      if (!intake?.id) continue;
      const tipo = String(intake.tipo_detectado || '').toUpperCase();
      if (tipo !== 'NOTA_FISCAL_PDF' && tipo !== 'NOTA_FISCAL_XML') continue;

      const ia = intake.resultado_ia || {};
      const patch = {};

      if (!String(intake.fornecedor_nome || '').trim()) {
        const v = String(pickIa(ia, 'fornecedor_nome', 'emitente_nome', 'razao_social', 'fornecedor_razao_social') || '').trim();
        if (v) patch.fornecedor_nome = v;
      }
      if (!String(intake.nf_emitente_nome || '').trim()) {
        const v = String(pickIa(ia, 'nf_emitente_nome', 'emitente_nome', 'razao_social_emitente', 'emitente_razao_social') || '').trim();
        if (v) patch.nf_emitente_nome = v;
      }
      if (!String(intake.nf_emitente_cpf_cnpj || '').trim()) {
        const v = String(pickIa(ia, 'nf_emitente_cpf_cnpj', 'emitente_cpf_cnpj', 'emitente_cnpj', 'emitente_cpf', 'cnpj_emitente', 'cpf_emitente') || '').trim();
        if (v) patch.nf_emitente_cpf_cnpj = digits(v);
      }
      if (!String(intake.fornecedor_cpf_cnpj || '').trim()) {
        const v = String(pickIa(ia, 'fornecedor_cpf_cnpj', 'fornecedor_cnpj', 'fornecedor_cpf', 'cnpj_fornecedor', 'cpf_fornecedor') || '').trim();
        if (v) patch.fornecedor_cpf_cnpj = digits(v);
      }

      if (Object.keys(patch).length > 0) {
        patchFornecedorPorId[intake.id] = patch;
        stats.fornecedores_promovidos++;
        stats.detalhes_fornecedor.push({ id: intake.id, acao: 'promover_campos', campos: Object.keys(patch) });
      }
    }

    const bulkFornecedor = Object.keys(patchFornecedorPorId).map((id) => ({ id, ...patchFornecedorPorId[id] }));
    if (bulkFornecedor.length > 0) {
      try {
        await db.DocumentIntake.bulkUpdate(bulkFornecedor);
      } catch (e) {
        for (const item of bulkFornecedor) {
          try { await db.DocumentIntake.update(item.id, item); }
          catch (err) { stats.erros.push({ id: item.id, fase: 'fornecedor_promover', msg: String(err?.message || err) }); }
        }
      }
    }

    // ===== FRENTE 5: criação/vinculação de Fornecedor no cadastro =====
    let intakesComFornecedor = [];
    try {
      const refreshF = await db.DocumentIntake.filter({
        status_registro: 'ATIVO',
      }, '-created_date', LIMIT);
      intakesComFornecedor = (refreshF || []).filter((i) => {
        const st = String(i.status_processamento || '').toUpperCase();
        return !['APROVADO', 'ENVIADO_APROVACAO', 'DELETADO', 'REJEITADO'].includes(st);
      });
    } catch (_) {
      intakesComFornecedor = intakes;
    }

    let fornecedoresCadastrados = [];
    try {
      fornecedoresCadastrados = await db.Fornecedor.list('-updated_date', 500) || [];
    } catch (e) {
      stats.erros.push({ fase: 'fornecedor_list', msg: String(e?.message || e) });
    }
    const fornecedoresPorDoc = new Map();
    for (const f of fornecedoresCadastrados) {
      const doc = digits(f.cpf_cnpj || f.cnpj || f.cpf || '');
      if (doc && !fornecedoresPorDoc.has(doc)) fornecedoresPorDoc.set(doc, f);
    }

    let criados = 0;
    const patchFornVincPorId = {};

    for (const intake of intakesComFornecedor) {
      if (!intake?.id) continue;
      if (intake.fornecedor_id_vinculado) continue;
      const tipo = String(intake.tipo_detectado || '').toUpperCase();
      if (tipo !== 'NOTA_FISCAL_PDF' && tipo !== 'NOTA_FISCAL_XML') continue;

      const doc = digits(intake.fornecedor_cpf_cnpj || intake.nf_emitente_cpf_cnpj || '');
      const nomeForn = String(intake.fornecedor_nome || intake.nf_emitente_nome || '').trim();
      if (!doc || !nomeForn) continue;

      const existente = fornecedoresPorDoc.get(doc);
      if (existente) {
        patchFornVincPorId[intake.id] = { fornecedor_id_vinculado: existente.id };
        stats.fornecedores_vinculados++;
        stats.detalhes_fornecedor.push({ id: intake.id, acao: 'vincular', fornecedor_id: existente.id, doc });
        const nfs = Array.isArray(existente.nfs_intake_ids) ? existente.nfs_intake_ids : [];
        if (!nfs.includes(intake.id)) {
          nfs.push(intake.id);
          try { await db.Fornecedor.update(existente.id, { nfs_intake_ids: nfs }); }
          catch (err) { stats.erros.push({ id: existente.id, fase: 'fornecedor_nfs_push', msg: String(err?.message || err) }); }
        }
      } else if (criados < MAX_FORNECEDORES_CRIAR) {
        const tipoPessoa = doc.length === 14 ? 'pessoa_juridica' : doc.length === 11 ? 'pessoa_fisica' : 'prestador';
        const novoForn = {
          nome: nomeForn,
          cpf_cnpj: doc,
          tipo_pessoa: tipoPessoa,
          status: 'ATIVO',
          ativo: true,
          nfs_intake_ids: [intake.id],
        };
        if (doc.length === 14) novoForn.cnpj = doc;
        else if (doc.length === 11) novoForn.cpf = doc;
        if (String(intake.municipio || '').trim()) novoForn.municipio = String(intake.municipio).trim();

        try {
          const created = await db.Fornecedor.create(novoForn);
          if (created?.id) {
            fornecedoresPorDoc.set(doc, created);
            patchFornVincPorId[intake.id] = { fornecedor_id_vinculado: created.id };
            criados++;
            stats.fornecedores_criados++;
            stats.detalhes_fornecedor.push({ id: intake.id, acao: 'criar', fornecedor_id: created.id, doc, nome: nomeForn });
          }
        } catch (err) {
          stats.erros.push({ id: intake.id, fase: 'fornecedor_criar', msg: String(err?.message || err) });
        }
      }
    }

    const bulkFornVinc = Object.keys(patchFornVincPorId).map((id) => ({ id, ...patchFornVincPorId[id] }));
    if (bulkFornVinc.length > 0) {
      try {
        await db.DocumentIntake.bulkUpdate(bulkFornVinc);
      } catch (e) {
        for (const item of bulkFornVinc) {
          try { await db.DocumentIntake.update(item.id, item); }
          catch (err) { stats.erros.push({ id: item.id, fase: 'fornecedor_vincular', msg: String(err?.message || err) }); }
        }
      }
    }

    // ===== FRENTE 6: confirmação automática de rubrica por histórico do fornecedor =====
    let comprasAprovadas = [];
    try {
      comprasAprovadas = await db.PurchaseRequest.list('-updated_date', 500) || [];
    } catch (e) {
      stats.erros.push({ fase: 'compras_list', msg: String(e?.message || e) });
    }
    const histPorDoc = new Map();
    for (const c of comprasAprovadas) {
      if (!c) continue;
      const st = String(c.status || '').toUpperCase();
      if (!STATUS_APROVADOS_COMPRA.has(st)) continue;
      const rid = String(c.rubrica_id || '').trim();
      if (!rid) continue;
      const doc = digits(c.nf_emitente_cpf_cnpj || c.fornecedor_cnpj || c.fornecedor_cpf || '');
      if (!doc) continue;
      if (!histPorDoc.has(doc)) histPorDoc.set(doc, new Map());
      const m = histPorDoc.get(doc);
      m.set(rid, (m.get(rid) || 0) + 1);
    }

    let intakesComRubrica = [];
    try {
      const refreshR = await db.DocumentIntake.filter({
        status_registro: 'ATIVO',
      }, '-created_date', LIMIT);
      intakesComRubrica = (refreshR || []).filter((i) => {
        const st = String(i.status_processamento || '').toUpperCase();
        return !['APROVADO', 'ENVIADO_APROVACAO', 'DELETADO', 'REJEITADO'].includes(st);
      });
    } catch (_) {
      intakesComRubrica = intakesComFornecedor;
    }

    const patchRubricaPorId = {};
    const agoraISO = new Date().toISOString();
    for (const intake of intakesComRubrica) {
      if (!intake?.id) continue;
      const sugerida = String(intake.rubrica_id_sugerida || '').trim();
      if (!sugerida) continue;
      if (String(intake.rubrica_id || '').trim()) continue;

      let doc = digits(intake.fornecedor_cpf_cnpj || intake.nf_emitente_cpf_cnpj || '');
      if (!doc && intake.fornecedor_id_vinculado) {
        try {
          const f = await db.Fornecedor.get(intake.fornecedor_id_vinculado);
          doc = digits(f?.cpf_cnpj || f?.cnpj || f?.cpf || '');
        } catch (_) {}
      }
      if (!doc) continue;

      const hist = histPorDoc.get(doc);
      if (!hist || !hist.has(sugerida)) continue;

      const nomeSugerido = String(intake.rubrica_nome_sugerida || '').trim();
      patchRubricaPorId[intake.id] = {
        rubrica_id: sugerida,
        rubrica_nome: nomeSugerido,
        rubrica_confirmada_em: agoraISO,
        rubrica_confirmada_origem: 'historico_fornecedor',
      };
      stats.rubricas_confirmadas_historico++;
      stats.detalhes_rubrica.push({ id: intake.id, rubrica_id: sugerida, doc, frequencia: hist.get(sugerida) });
    }

    const bulkRubrica = Object.keys(patchRubricaPorId).map((id) => ({ id, ...patchRubricaPorId[id] }));
    if (bulkRubrica.length > 0) {
      try {
        await db.DocumentIntake.bulkUpdate(bulkRubrica);
      } catch (e) {
        for (const item of bulkRubrica) {
          try { await db.DocumentIntake.update(item.id, item); }
          catch (err) { stats.erros.push({ id: item.id, fase: 'rubrica_confirmar', msg: String(err?.message || err) }); }
        }
      }
    }

    // ===== BackupLog de auditoria =====
    try {
      await db.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        entity_type: 'PROCESSAMENTO_ENTRADA_UNICA_LOTE',
        status: 'concluido',
        details: `Lote: ${stats.total_analisados} intakes | XMLs: ${stats.xmls_vinculados} | Datas: ${stats.datas_preenchidas} | Valores: ${stats.valores_preenchidos} | CC: ${stats.centros_custo_corrigidos} | Forn. promovidos: ${stats.fornecedores_promovidos} | Forn. criados: ${stats.fornecedores_criados} | Forn. vinculados: ${stats.fornecedores_vinculados} | Rubricas confirmadas: ${stats.rubricas_confirmadas_historico}`,
        total_files: stats.total_analisados,
        files_copied: stats.xmls_vinculados + stats.datas_preenchidas + stats.valores_preenchidos + stats.centros_custo_corrigidos + stats.fornecedores_promovidos + stats.fornecedores_criados + stats.fornecedores_vinculados + stats.rubricas_confirmadas_historico,
        execution_time_ms: Date.now() - startTime,
        triggered_by: 'scheduled',
      });
    } catch (e) {
      stats.erros.push({ fase: 'backuplog', msg: String(e?.message || e) });
    }

    return Response.json({
      success: true,
      ...stats,
      resumo: {
        total: stats.total_analisados,
        xmls_vinculados: stats.xmls_vinculados,
        datas_preenchidas: stats.datas_preenchidas,
        valores_preenchidos: stats.valores_preenchidos,
        centros_custo_corrigidos: stats.centros_custo_corrigidos,
        fornecedores_promovidos: stats.fornecedores_promovidos,
        fornecedores_criados: stats.fornecedores_criados,
        fornecedores_vinculados: stats.fornecedores_vinculados,
        rubricas_confirmadas_historico: stats.rubricas_confirmadas_historico,
      },
    });
  } catch (e) {
    try {
      await db.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        entity_type: 'PROCESSAMENTO_ENTRADA_UNICA_LOTE',
        status: 'erro',
        error_message: String(e?.message || e),
        details: 'Falha durante o processamento do lote',
        triggered_by: 'scheduled',
      });
    } catch (_) {}

    return Response.json(
      { success: false, error: String(e?.message || e), stats },
      { status: 500 }
    );
  }
});