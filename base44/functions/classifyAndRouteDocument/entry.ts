import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function safeStr(v) {
  return String(v || '').trim();
}

function detectMimeType(mimeType, fileName) {
  const mime = safeStr(mimeType).toLowerCase();
  const name = safeStr(fileName).toLowerCase();

  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|bmp|svg)$/i.test(name)) {
    return 'FOTO_ATIVIDADE';
  }
  if (mime === 'text/xml' || mime === 'application/xml' || name.endsWith('.xml')) {
    return 'NOTA_FISCAL_XML';
  }
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    // Will be refined by AI below
    return 'PDF_CANDIDATO';
  }
  return 'OUTRO';
}

function buildRenamedNF(params) {
  const numero = safeStr(params.nf_numero) || 'SEM-NUM';
  const fornecedor = safeStr(params.nf_emitente_nome || params.fornecedor).substring(0, 40).toUpperCase() || 'FORNECEDOR';
  const valor = params.nf_valor_total ? Number(params.nf_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00';
  const ext = safeStr(params.extension) || 'pdf';
  return `${numero} - ${fornecedor} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const intakeId = safeStr(body.intake_id);
    const orientacoesUsuario = safeStr(body.orientacoes_usuario);

    if (!intakeId) {
      return Response.json({ ok: false, error: 'intake_id obrigatório' }, { status: 400 });
    }

    // Busca o registro da entrada única
    const intake = await base44.asServiceRole.entities.DocumentIntake.get(intakeId);
    if (!intake) {
      return Response.json({ ok: false, error: 'DocumentIntake não encontrado' }, { status: 404 });
    }

    // Marca como ANALISANDO_IA
    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ANALISANDO_IA'
    });

    const mimeType = safeStr(intake.mime_type);
    const fileName = safeStr(intake.file_name_original);
    const fileUrl = safeStr(intake.arquivo_original_url);

    // Detecção primária por MIME/extensão
    let tipoDetectado = detectMimeType(mimeType, fileName);

    let resultadoIa = {};
    let erros = [];
    let rubricaSugerida = null;
    let nomeFinal = fileName;

    // --- FOTO ---
    if (tipoDetectado === 'FOTO_ATIVIDADE') {
      // IA sugere legenda
      try {
        const iaResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Analise esta imagem de uma atividade cultural em museu e sugira:
1. Uma legenda curta (máx 100 caracteres)
2. Uma descrição mais longa (máx 300 caracteres)
3. Local provável (museu, sala, externo)
4. Data provável se visível

Responda SOMENTE em JSON válido:
{"legenda":"","descricao":"","local_provavel":"","data_provavel":""}`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: "object",
            properties: {
              legenda: { type: "string" },
              descricao: { type: "string" },
              local_provavel: { type: "string" },
              data_provavel: { type: "string" }
            }
          }
        });
        resultadoIa = iaResp || {};
      } catch (e) {
        erros.push(`IA de legenda falhou: ${e.message}`);
      }

      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        tipo_detectado: 'FOTO_ATIVIDADE',
        status_processamento: 'AGUARDANDO_REVISAO',
        resultado_ia: resultadoIa,
        legenda_sugerida: resultadoIa.legenda || '',
        erros_validacao: erros,
        file_name_final: fileName,
        revisado_pelo_usuario: false
      });

      return Response.json({ ok: true, tipo: 'FOTO_ATIVIDADE', resultado_ia: resultadoIa });
    }

    // --- XML DE NOTA FISCAL ---
    if (tipoDetectado === 'NOTA_FISCAL_XML') {
      try {
        const fileResp = await fetch(fileUrl);
        const xmlContent = await fileResp.text();

        // Extração direta do XML
        const extractTag = (tag) => {
          const m = xmlContent.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
          return m ? safeStr(m[1]) : '';
        };

        const numero = extractTag('nNF').replace(/\D/g, '');
        const valor = extractTag('vNF');
        const dataEmissao = (extractTag('dhEmi') || extractTag('dEmi')).substring(0, 10);
        const emitNome = (() => { const m = xmlContent.match(/<emit>([\s\S]*?)<\/emit>/i); return m ? safeStr((m[1].match(/<xNome>([\s\S]*?)<\/xNome>/i)||[])[1]) : ''; })();
        const emitDoc = (() => { const m = xmlContent.match(/<emit>([\s\S]*?)<\/emit>/i); return m ? safeStr(((m[1].match(/<CNPJ>([\s\S]*?)<\/CNPJ>/i)||[])[1] || (m[1].match(/<CPF>([\s\S]*?)<\/CPF>/i)||[])[1])) : ''; })();

        resultadoIa = {
          nf_numero: numero,
          nf_valor_total: valor,
          nf_data_emissao: dataEmissao,
          nf_emitente_nome: emitNome,
          nf_emitente_cpf_cnpj: emitDoc,
          tipo_documento: 'NOTA_FISCAL_XML'
        };

        nomeFinal = buildRenamedNF({ ...resultadoIa, extension: 'xml' });

        // Sugere rubrica
        if (emitNome || valor) {
          try {
            const rubResp = await base44.asServiceRole.functions.invoke('suggestRubrica', {
              descricao: emitNome,
              fornecedor: emitNome,
              centro_custo: ''
            });
            rubricaSugerida = rubResp?.data?.suggestion || null;
          } catch (e) {
            erros.push(`Sugestão de rubrica falhou: ${e.message}`);
          }
        }
      } catch (e) {
        erros.push(`Leitura do XML falhou: ${e.message}`);
        tipoDetectado = 'NOTA_FISCAL_XML'; // mantém tipo mesmo com erro
      }

      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        tipo_detectado: 'NOTA_FISCAL_XML',
        status_processamento: 'AGUARDANDO_REVISAO',
        resultado_ia: resultadoIa,
        file_name_final: nomeFinal,
        rubrica_id_sugerida: rubricaSugerida?.rubrica_id || '',
        rubrica_nome_sugerida: rubricaSugerida?.rubrica_nome || '',
        rubrica_justificativa: rubricaSugerida?.justificativa || '',
        erros_validacao: erros,
        revisado_pelo_usuario: false
      });

      return Response.json({ ok: true, tipo: 'NOTA_FISCAL_XML', resultado_ia: resultadoIa, rubrica: rubricaSugerida });
    }

    // --- PDF (NOTA FISCAL OU DOCUMENTO) ---
    if (tipoDetectado === 'PDF_CANDIDATO') {
      try {
        const iaResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Analise este documento PDF e determine:
1. Se é uma NOTA FISCAL (NF, NFS-e, RPA, fatura) ou um DOCUMENTO ADMINISTRATIVO comum
2. Se for nota fiscal, extraia os dados principais
3. Liste possíveis inconsistências${orientacoesUsuario ? `\n\nOrientações do usuário: ${orientacoesUsuario}` : ''}

Responda SOMENTE em JSON válido:
{
  "eh_nota_fiscal": true,
  "nf_numero": "",
  "nf_valor_total": "",
  "nf_data_emissao": "",
  "nf_emitente_nome": "",
  "nf_emitente_cpf_cnpj": "",
  "nf_destinatario_nome": "",
  "descricao_servico": "",
  "municipio": "",
  "competencia": "",
  "inconsistencias": []
}`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: "object",
            properties: {
              eh_nota_fiscal: { type: "boolean" },
              nf_numero: { type: "string" },
              nf_valor_total: { type: "string" },
              nf_data_emissao: { type: "string" },
              nf_emitente_nome: { type: "string" },
              nf_emitente_cpf_cnpj: { type: "string" },
              nf_destinatario_nome: { type: "string" },
              descricao_servico: { type: "string" },
              municipio: { type: "string" },
              competencia: { type: "string" },
              inconsistencias: { type: "array", items: { type: "string" } }
            }
          }
        });

        resultadoIa = iaResp || {};
        const ehNF = resultadoIa.eh_nota_fiscal === true;
        tipoDetectado = ehNF ? 'NOTA_FISCAL_PDF' : 'DOCUMENTO_ADMINISTRATIVO';

        if (Array.isArray(resultadoIa.inconsistencias)) {
          erros = resultadoIa.inconsistencias;
        }

        if (ehNF) {
          nomeFinal = buildRenamedNF({ ...resultadoIa, extension: 'pdf' });

          // Sugere rubrica
          try {
            const rubResp = await base44.asServiceRole.functions.invoke('suggestRubrica', {
              descricao: resultadoIa.descricao_servico || resultadoIa.nf_emitente_nome || '',
              fornecedor: resultadoIa.nf_emitente_nome || '',
              centro_custo: ''
            });
            rubricaSugerida = rubResp?.data?.suggestion || null;
          } catch (e) {
            erros.push(`Sugestão de rubrica falhou: ${e.message}`);
          }
        }
      } catch (e) {
        erros.push(`Análise de PDF falhou: ${e.message}`);
        tipoDetectado = 'DOCUMENTO_ADMINISTRATIVO';
      }

      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        tipo_detectado: tipoDetectado,
        status_processamento: 'AGUARDANDO_REVISAO',
        resultado_ia: resultadoIa,
        file_name_final: nomeFinal,
        rubrica_id_sugerida: rubricaSugerida?.rubrica_id || '',
        rubrica_nome_sugerida: rubricaSugerida?.rubrica_nome || '',
        rubrica_justificativa: rubricaSugerida?.justificativa || '',
        erros_validacao: erros,
        revisado_pelo_usuario: false
      });

      return Response.json({ ok: true, tipo: tipoDetectado, resultado_ia: resultadoIa, rubrica: rubricaSugerida });
    }

    // --- OUTRO ---
    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      tipo_detectado: 'OUTRO',
      status_processamento: 'AGUARDANDO_REVISAO',
      resultado_ia: {},
      erros_validacao: [],
      revisado_pelo_usuario: false
    });

    return Response.json({ ok: true, tipo: 'OUTRO' });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});