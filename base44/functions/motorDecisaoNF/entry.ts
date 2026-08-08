import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * motorDecisaoNF —Motor de decisões IA para NFs em PDF na Sala de Espera.
 * Resolve 100% do envelope de decisão para uma NF: meta, rubrica, centro_custo, descricao, data abertura empresa.
 * NÃO duplica renomeio de arquivos (processarSalaDeEspera cuida disso).
 */
const BATCH_SIZE_DEFAULT = 3;
const MAX_INTAKES_TO_SCAN = 50;
const DEADLINE_MS = 85000;

function safeStr(v) { return String(v || '').trim(); }
function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }
function isValidDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

function normalizarMuseu(raw) {
  if (!raw) return null;
  const v = String(raw).trim().toUpperCase();
  if (!v) return null;
  if (v.includes('MUMO') || v.includes('MOU')) return 'MUMO';
  if (v.includes('MIS')) return 'MIS';
  if (v.includes('MHAB') || v.includes('MAB')) return 'MHAB';
  if (v.includes('NOTURNO')) return 'Noturno nos Museus 2026';
  if (v.includes('GERAL')) return 'Geral';
  if (v.includes('PUBLICA')) return 'Publicações';
  return null;
}

export async function serve(req, ctx) {
  const startedAt = Date.now();
  const base44 = createClientFromRequest(req);
  const srv = base44.asServiceRole;

  const body = await req.json().catch(() => ({})) || {};
  const batchSize = Math.min(Number(body.batchSize) || BATCH_SIZE_DEFAULT, 5);
  const force = body.force === true;
  const intakeId = body.intake_id || null;

  const filterObj = { tipo_detectado: 'NOTA_FISCAL_PDF', status_registro: 'ATIVO' };
  if (intakeId) filterObj.id = intakeId;

  const recent = await srv.entities.DocumentIntake.filter(filterObj, '-created_date', MAX_INTAKES_TO_SCAN).catch((err) => {
    throw new Error('Falha ao listar intakes: ' + (err?.message || err));
  });

  const needsDecision = (recent || []).filter((i) =>
    force || !i.rubrica_id || !i.descricao_nota || !i.centro_custo || !i.data_abertura_empresa
  );

  if (needsDecision.length === 0) {
    return { ok: true, processados: 0, restantes: 0, message: 'Nenhuma NF pendente de decisão.' };
  }

  const batch = needsDecision.slice(0, batchSize);

  const rubricas = await srv.entities.Rubrica.filter({ ativo: true }, '-created_date', 250).catch(() => []);
  const rubricasAtivas = (rubricas || []).filter((r) => safeStr(r.rubrica));
  const rubricOptions = rubricasAtivas.slice(0, 200).map((r, i) => {
    const grupo = safeStr(r.grupo) ? ' (grupo: ' + r.grupo + ')' : '';
    const museu = safeStr(r.museu_codigo) ? ' [' + r.museu_codigo + ']' : '';
    return i + '|' + r.rubrica + grupo + museu;
  }).join('\n');

  const results = [];
  for (const intake of batch) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      results.push({ id: intake.id, skipped: true, motivo: 'deadline_proximo' });
      break;
    }
    try {
      const res = await decidirNF(srv, intake, rubricasAtivas, rubricOptions);
      results.push(res);
    } catch (e) {
      results.push({ id: intake.id, erro: String(e?.message || e) });
    }
  }

  return {
    ok: true,
    processados: results.length,
    restantes: Math.max(0, needsDecision.length - results.length),
    results,
  };
}

async function decidirNF(srv, intake, rubricasAtivas, rubricOptions) {
  // 1. Localiza XML pareado
  let xmlIntake = null;
  if (intake.nf_xml_intake_id) {
    xmlIntake = await srv.entities.DocumentIntake.get(intake.nf_xml_intake_id).catch(() => null);
  }
  if (!xmlIntake) {
    if (intake.grupo_upload_id) {
      const byGroup = await srv.entities.DocumentIntake.filter({
        tipo_detectado: 'NOTA_FISCAL_XML',
        grupo_upload_id: intake.grupo_upload_id,
        status_registro: 'ATIVO',
      }).catch(() => []);
      if (byGroup && byGroup.length) xmlIntake = byGroup[0];
    }
    if (!xmlIntake && intake.nf_numero) {
      const byNum = await srv.entities.DocumentIntake.filter({
        tipo_detectado: 'NOTA_FISCAL_XML',
        nf_numero: intake.nf_numero,
        status_registro: 'ATIVO',
      }).catch(() => []);
      if (byNum && byNum.length) xmlIntake = byNum[0];
    }
  }

  const pdfUrl = intake.arquivo_original_url || intake.nf_pdf_url;
  if (!pdfUrl) {
    return { id: intake.id, erro: 'Sem URL de PDF para análise' };
  }

  const prompt =
    'Analise a NOTA FISCAL em anexo e extraia os campos abaixo.\n\n' +
    'REGRAS:\n' +
    '- nf_numero: apenas dígitos\n' +
    '- nf_data_emissao: data de EMISSÃO da NF (YYYY-MM-DD)\n' +
    '- data_abertura_empresa: data de CONSTITUIÇÃO/abertura da empresa emitente (YYYY-MM-DD) — pode aparecer no cabeçalho da NF como "Abertura" ou "Constituição". Se não houver, retorne null.\n' +
    '- nf_emitente_nome: razão social do emissor (prestador)\n' +
    '- nf_emitente_cpf_cnpj: apenas dígitos\n' +
    '- nf_valor_total: valor total numérico (use ponto decimal)\n' +
    '- municipio: cidade do emitente/tomador\n' +
    '- descricao_nota: discriminação do serviço em 1-3 frases (concisa, factual, sem interpretar)\n' +
    '- museu_detectado: detecte APENAS a partir da DESCRIÇÃO da nota:\n' +
    '    * "MIS" se a descrição menciona MIS\n' +
    '    * "MHAB" se a descrição menciona MHAB ou MAB\n' +
    '    * "MUMO" se a descrição menciona MUMO, MOU ou Museu da Mulher\n' +
    '    * "Noturno nos Museus 2026" se a descrição menciona "Noturno 2026" ou "Noturno nos Museus"\n' +
    '    * "Geral" APENAS se NÃO mencionar nenhum dos acima\n' +
    '- rubrica_id_oportunidade: índice (0..N) da rubrica MAIS compatível, comparando a descrição da nota com o nome da rubrica\n\n' +
    'Lista de rubricas disponíveis (formato ÍNDICE|NOME):\n' +
    rubricOptions;

  const response = await srv.integrations.Core.InvokeLLM({
    prompt,
    model: 'gemini_3_flash',
    file_urls: [pdfUrl],
    response_json_schema: {
      type: 'object',
      properties: {
        nf_numero: { type: 'string' },
        nf_data_emissao: { type: 'string' },
        data_abertura_empresa: { type: 'string' },
        nf_emitente_nome: { type: 'string' },
        nf_emitente_cpf_cnpj: { type: 'string' },
        nf_valor_total: { type: 'number' },
        municipio: { type: 'string' },
        descricao_nota: { type: 'string' },
        museu_detectado: { type: 'string' },
        rubrica_id_oportunidade: { type: 'number' },
      },
    },
  });

  let rubricaMatch = null;
  const idx = Number(response && response.rubrica_id_oportunidade);
  if (!isNaN(idx) && idx >= 0 && idx < rubricasAtivas.length) {
    rubricaMatch = rubricasAtivas[idx];
  }

  let metaId = null;
  if (rubricaMatch && rubricaMatch.meta_manual_ids && Array.isArray(rubricaMatch.meta_manual_ids) && rubricaMatch.meta_manual_ids.length > 0) {
    metaId = String(rubricaMatch.meta_manual_ids[0]);
  }

  const museuNormalizado = normalizarMuseu(response && response.museu_detectado);
  const updateData = {};

  if (safeStr(response && response.descricao_nota)) updateData.descricao_nota = safeStr(response.descricao_nota);

  if (museuNormalizado) {
    updateData.centro_custo = museuNormalizado;
    updateData.centro_custo_origem = 'descricao_nota';
  }

  if (isValidDate(response && response.nf_data_emissao) && !intake.nf_data_emissao) {
    updateData.nf_data_emissao = response.nf_data_emissao;
  }
  if (isValidDate(response && response.data_abertura_empresa) && !intake.data_abertura_empresa) {
    updateData.data_abertura_empresa = response.data_abertura_empresa;
  }
  if (!intake.nf_numero && onlyDigits(response && response.nf_numero)) {
    updateData.nf_numero = onlyDigits(response.nf_numero);
  }
  if (!intake.nf_emitente_nome && safeStr(response && response.nf_emitente_nome)) {
    updateData.nf_emitente_nome = safeStr(response.nf_emitente_nome);
  }
  if (!intake.nf_emitente_cpf_cnpj && onlyDigits(response && response.nf_emitente_cpf_cnpj)) {
    updateData.nf_emitente_cpf_cnpj = onlyDigits(response.nf_emitente_cpf_cnpj);
  }
  if (!intake.municipio && safeStr(response && response.municipio)) {
    updateData.municipio = safeStr(response.municipio);
  }
  const valorResp = Number(response && response.nf_valor_total);
  if (!isNaN(valorResp) && (intake.nf_valor_total == null || intake.nf_valor_total === 0)) {
    updateData.nf_valor_total = valorResp;
  }

  if (rubricaMatch) {
    updateData.rubrica_id = rubricaMatch.id;
    updateData.rubrica_nome = rubricaMatch.rubrica;
    updateData.rubrica_id_sugerida = rubricaMatch.id;
    updateData.rubrica_nome_sugerida = rubricaMatch.rubrica;
    updateData.rubrica_justificativa = 'Auto-vinculado pelo motor de decisões IA (descrição da nota)';
    updateData.rubrica_confirmada_em = new Date().toISOString();
    updateData.rubrica_confirmada_origem = 'historico_fornecedor';
  }
  if (metaId) updateData.meta_id = metaId;

  if (xmlIntake && !intake.nf_xml_intake_id) {
    updateData.nf_xml_intake_id = xmlIntake.id;
    updateData.nf_xml_url = xmlIntake.arquivo_original_url || xmlIntake.nf_xml_url;
  }

  if (Object.keys(updateData).length > 0) {
    await srv.entities.DocumentIntake.update(intake.id, updateData);
  }

  return {
    id: intake.id,
    nf_numero: updateData.nf_numero || intake.nf_numero,
    nf_data_emissao: updateData.nf_data_emissao || intake.nf_data_emissao,
    data_abertura_empresa: updateData.data_abertura_empresa || intake.data_abertura_empresa,
    museu: updateData.centro_custo || intake.centro_custo,
    rubrica_id: updateData.rubrica_id || intake.rubrica_id,
    rubrica_nome: updateData.rubrica_nome || intake.rubrica_nome,
    meta_id: updateData.meta_id || intake.meta_id,
    descricao: (updateData.descricao_nota || intake.descricao_nota || '').substring(0, 120),
    xml_vinculado: !!(updateData.nf_xml_intake_id || intake.nf_xml_intake_id),
  };
}