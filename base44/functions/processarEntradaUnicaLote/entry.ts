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

Deno.serve(async (req) => {
  const startTime = Date.now();
  const base44 = createClientFromRequest(req);
  // Função batch agendada — opera em service-role, sem guard HTTP estrito
  // (apenas admin/coordenador disparam via interface; agendamento roda como service)
  const db = base44.asServiceRole.entities;

  const LIMIT = 100;
  const SCORE_THRESHOLD = 85;

  const stats = {
    total_analisados: 0,
    xmls_vinculados: 0,
    datas_preenchidas: 0,
    valores_preenchidos: 0,
    centros_custo_corrigidos: 0,
    ids_processados: [],
    detalhes_xml_pdf: [],
    detalhes_data_valor: [],
    detalhes_centro_custo: [],
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

    // ===== BackupLog de auditoria =====
    try {
      await db.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        entity_type: 'PROCESSAMENTO_ENTRADA_UNICA_LOTE',
        status: 'concluido',
        details: `Lote: ${stats.total_analisados} intakes | XMLs: ${stats.xmls_vinculados} | Datas: ${stats.datas_preenchidas} | Valores: ${stats.valores_preenchidos} | CC: ${stats.centros_custo_corrigidos}`,
        total_files: stats.total_analisados,
        files_copied: stats.xmls_vinculados + stats.datas_preenchidas + stats.valores_preenchidos + stats.centros_custo_corrigidos,
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