import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COORD_EMAILS = [
  'danielperini.mc@viadutodasartes.org.br',
  'danie@periniprojetos.com.br',
];

function safeStr(v) {
  return String(v || '').trim();
}

function detectMimeType(mimeType, fileName) {
  const mime = safeStr(mimeType).toLowerCase();
  const name = safeStr(fileName).toLowerCase();
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(name)) return 'FOTO_ATIVIDADE';
  if (mime === 'text/xml' || mime === 'application/xml' || name.endsWith('.xml')) return 'NOTA_FISCAL_XML';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'PDF_CANDIDATO';
  return 'OUTRO';
}

function parseValor(v) {
  const s = String(v || '0').trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function buildRenamedNF(params) {
  const numero = safeStr(params.nf_numero) || 'SEM-NUM';
  const fornecedor = safeStr(params.nf_emitente_nome || params.fornecedor).substring(0, 40).toUpperCase() || 'FORNECEDOR';
  const valorNum = parseValor(params.nf_valor_total);
  const valor = valorNum > 0 ? valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00';
  const ext = safeStr(params.extension) || 'pdf';
  return `${numero} - ${fornecedor} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const emailNorm = (user.email || '').toLowerCase().trim();
    if (!COORD_EMAILS.map(e => e.toLowerCase()).includes(emailNorm)) {
      return Response.json({ error: 'Acesso restrito a coordenadores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { intake_id, target_user_email, target_user_name } = body;

    if (!intake_id) return Response.json({ error: 'intake_id obrigatório' }, { status: 400 });

    const intake = await base44.asServiceRole.entities.DocumentIntake.get(intake_id);
    if (!intake) return Response.json({ error: 'Intake não encontrado' }, { status: 404 });

    // Atualiza owner para o usuário alvo (se informado)
    const ownerEmail = target_user_email || intake.user_email;
    const ownerName = target_user_name || intake.user_name;

    await base44.asServiceRole.entities.DocumentIntake.update(intake_id, {
      user_email: ownerEmail,
      user_name: ownerName,
      status_processamento: 'ANALISANDO_IA',
    });

    const mimeType = safeStr(intake.mime_type);
    const fileName = safeStr(intake.file_name_original);
    const fileUrl = safeStr(intake.arquivo_original_url);

    let tipoDetectado = detectMimeType(mimeType, fileName);
    let resultadoIa = {};
    let erros = [];
    let nomeFinal = fileName;
    let rubricaSugerida = null;

    // --- XML ---
    if (tipoDetectado === 'NOTA_FISCAL_XML') {
      try {
        const fileResp = await fetch(fileUrl);
        const xmlContent = await fileResp.text();
        const extractTag = (tag) => {
          const m = xmlContent.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
          return m ? safeStr(m[1]) : '';
        };
        const numero = extractTag('nNF').replace(/\D/g, '');
        const valor = extractTag('vNF');
        const dataEmissao = (extractTag('dhEmi') || extractTag('dEmi')).substring(0, 10);
        const emitNome = (() => { const m = xmlContent.match(/<emit>([\s\S]*?)<\/emit>/i); return m ? safeStr((m[1].match(/<xNome>([\s\S]*?)<\/xNome>/i) || [])[1]) : ''; })();
        const emitDoc = (() => { const m = xmlContent.match(/<emit>([\s\S]*?)<\/emit>/i); return m ? safeStr(((m[1].match(/<CNPJ>([\s\S]*?)<\/CNPJ>/i) || [])[1] || (m[1].match(/<CPF>([\s\S]*?)<\/CPF>/i) || [])[1])) : ''; })();

        resultadoIa = { nf_numero: numero, nf_valor_total: valor, nf_data_emissao: dataEmissao, nf_emitente_nome: emitNome, nf_emitente_cpf_cnpj: emitDoc };
        nomeFinal = buildRenamedNF({ ...resultadoIa, extension: 'xml' });

        try {
          const rubResp = await base44.asServiceRole.functions.invoke('suggestRubrica', { descricao: emitNome, fornecedor: emitNome, centro_custo: '' });
          rubricaSugerida = rubResp?.data?.suggestion || null;
        } catch (_) { /* silent */ }
      } catch (e) {
        erros.push(`Leitura XML: ${e.message}`);
      }
    }

    // --- PDF ---
    if (tipoDetectado === 'PDF_CANDIDATO') {
      try {
        const hoje = new Date().toISOString().slice(0, 10);
        const iaResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Analise este PDF. Determine se é nota fiscal. Se sim, extraia dados. A data atual é ${hoje} — não sinalize datas passadas como futuras.\n\nResponda SOMENTE JSON:\n{"eh_nota_fiscal":true,"nf_numero":"","nf_valor_total":"","nf_data_emissao":"","nf_emitente_nome":"","nf_emitente_cpf_cnpj":"","nf_destinatario_nome":"","descricao_servico":"","municipio":"","competencia":"","inconsistencias":[]}`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              eh_nota_fiscal: { type: 'boolean' },
              nf_numero: { type: 'string' },
              nf_valor_total: { type: 'string' },
              nf_data_emissao: { type: 'string' },
              nf_emitente_nome: { type: 'string' },
              nf_emitente_cpf_cnpj: { type: 'string' },
              nf_destinatario_nome: { type: 'string' },
              descricao_servico: { type: 'string' },
              municipio: { type: 'string' },
              competencia: { type: 'string' },
              inconsistencias: { type: 'array', items: { type: 'string' } },
            },
          },
        });

        resultadoIa = iaResp || {};
        const ehNF = resultadoIa.eh_nota_fiscal === true;
        tipoDetectado = ehNF ? 'NOTA_FISCAL_PDF' : 'DOCUMENTO_ADMINISTRATIVO';
        if (Array.isArray(resultadoIa.inconsistencias)) erros = resultadoIa.inconsistencias;

        if (ehNF) {
          nomeFinal = buildRenamedNF({ ...resultadoIa, extension: 'pdf' });
          try {
            const rubResp = await base44.asServiceRole.functions.invoke('suggestRubrica', {
              descricao: resultadoIa.descricao_servico || resultadoIa.nf_emitente_nome || '',
              fornecedor: resultadoIa.nf_emitente_nome || '',
              centro_custo: '',
            });
            rubricaSugerida = rubResp?.data?.suggestion || null;
          } catch (_) { /* silent */ }
        }
      } catch (e) {
        erros.push(`Análise PDF: ${e.message}`);
        tipoDetectado = 'DOCUMENTO_ADMINISTRATIVO';
      }
    }

    const isNF = tipoDetectado === 'NOTA_FISCAL_PDF' || tipoDetectado === 'NOTA_FISCAL_XML';

    // Auto-approve: cria PurchaseRequest e marca APROVADO diretamente
    let purchaseId = null;
    if (isNF) {
      const valorNum = parseValor(resultadoIa.nf_valor_total);
      try {
        const pr = await base44.asServiceRole.entities.PurchaseRequest.create({
          descricao_item: resultadoIa.descricao_servico || resultadoIa.nf_emitente_nome || fileName,
          fornecedor_nome: resultadoIa.nf_emitente_nome || '',
          fornecedor_cnpj: resultadoIa.nf_emitente_cpf_cnpj || '',
          valor_solicitado: valorNum || 0,
          meta_id: 'MC3A-EXTRA',
          meta_extra_descricao: `[Importação coordenação] ${resultadoIa.nf_emitente_nome || fileName}`,
          budgetline_id: rubricaSugerida?.rubrica_id || 'IMPORTACAO_COORD',
          rubrica_id: rubricaSugerida?.rubrica_id || '',
          categoria: 'Outros',
          tipo_gasto: 'Serviço',
          centro_custo: 'Geral',
          nota_fiscal_url: fileUrl,
          status: 'APROVADO_ADMIN',
          aprov_admin_nome: ownerName,
          aprov_admin_data: new Date().toISOString().slice(0, 10),
          observacoes: `[IMPORTAÇÃO COORDENAÇÃO] Proprietário: ${ownerName} (${ownerEmail}). NF ${resultadoIa.nf_numero || ''}. Arquivo: ${nomeFinal}`,
        });
        purchaseId = pr.id;

        // Attachment vinculado
        await base44.asServiceRole.entities.Attachment.create({
          report_id: '',
          file_name: nomeFinal,
          file_type: mimeType,
          file_url: fileUrl,
          description: `NF ${resultadoIa.nf_numero || ''} - ${resultadoIa.nf_emitente_nome || ''}`,
          nf_numero: resultadoIa.nf_numero || '',
          nf_valor_total: valorNum,
          nf_data_emissao: resultadoIa.nf_data_emissao || '',
          nf_emitente_nome: resultadoIa.nf_emitente_nome || '',
          nf_emitente_cpf_cnpj: resultadoIa.nf_emitente_cpf_cnpj || '',
          nf_tipo_documento: tipoDetectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
          nf_nome_original: fileName,
          nf_nome_renomeado: nomeFinal,
          nf_status_leitura: 'lido_com_sucesso',
          nf_revisado: true,
        });
      } catch (e) {
        erros.push(`Criação de compra: ${e.message}`);
      }
    }

    // Finaliza o intake como APROVADO
    await base44.asServiceRole.entities.DocumentIntake.update(intake_id, {
      user_email: ownerEmail,
      user_name: ownerName,
      tipo_detectado: tipoDetectado,
      status_processamento: 'APROVADO',
      resultado_ia: resultadoIa,
      file_name_final: nomeFinal,
      rubrica_id_sugerida: rubricaSugerida?.rubrica_id || '',
      rubrica_nome_sugerida: rubricaSugerida?.rubrica_nome || '',
      rubrica_justificativa: rubricaSugerida?.justificativa || '',
      erros_validacao: erros,
      entidade_destino: isNF ? 'PurchaseRequest' : 'Attachment',
      entidade_destino_id: purchaseId || intake.entidade_destino_id || '',
      revisado_pelo_usuario: true,
    });

    return Response.json({
      ok: true,
      tipo: tipoDetectado,
      nome_final: nomeFinal,
      purchase_id: purchaseId,
      rubrica: rubricaSugerida,
    });

  } catch (error) {
    console.error('coordBulkImport error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});