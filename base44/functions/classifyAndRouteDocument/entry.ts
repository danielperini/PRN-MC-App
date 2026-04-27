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

function parseValor(v) {
  if (!v && v !== 0) return 0;
  const s = String(v).trim().replace(/\s/g, '');
  // Se tem vírgula como separador decimal (pt-BR: 1.234,56)
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Padrão numérico (1234.56 ou "1234,56" sem separador de milhar)
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

      // Validação adicional com IA para NF-e
      try {
        const validacaoIA = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Analise esta nota fiscal XML extraída e identifique problemas comuns de validação. Responda em JSON:
{
  "requer_xml_danfe": boolean,
  "problemas": string[],
  "avisos": string[],
  "score_confiabilidade": number
}

Dados extraídos:
- NF: ${numero}
- Emitente: ${emitNome}
- CNPJ: ${emitDoc}
- Valor: ${valor}
- Data: ${dataEmissao}

Procure por:
1. Valores zerados ou inválidos
2. CNPJ inválido (formato)
3. Data futura ou muito antiga (>5 anos)
4. Descrição genérica ou faltando
5. Possível duplicação por padrão`,
          response_json_schema: {
            type: 'object',
            properties: {
              requer_xml_danfe: { type: 'boolean' },
              problemas: { type: 'array', items: { type: 'string' } },
              avisos: { type: 'array', items: { type: 'string' } },
              score_confiabilidade: { type: 'number' }
            }
          }
        });
        
        if (validacaoIA.problemas?.length > 0) {
          erros.push(...validacaoIA.problemas);
        }
        if (validacaoIA.avisos?.length > 0) {
          erros.push(...validacaoIA.avisos);
        }
        if (validacaoIA.requer_xml_danfe) {
          erros.push('⚠️ Para validação completa, é recomendado ter também o DANFE (PDF) desta NF-e para cruzamento de dados.');
        }
      } catch (e) {
        console.warn('Validação adicional IA falhou:', e.message);
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
        const hoje = new Date().toISOString().slice(0, 10);
        const iaResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Analise este documento PDF e determine:
1. Se é uma NOTA FISCAL (NF, NFS-e, RPA, fatura) ou um DOCUMENTO ADMINISTRATIVO comum
2. Se for nota fiscal, extraia os dados principais
3. Liste possíveis inconsistências REAIS no documento (ex: valores zerados, campos obrigatórios ausentes, CPF/CNPJ inválido). NÃO sinalize como inconsistência datas passadas ou presentes. A data atual é ${hoje}, portanto qualquer data até ${hoje} é válida e NÃO deve ser reportada como "data futura".${orientacoesUsuario ? `\n\nOrientações do usuário: ${orientacoesUsuario}` : ''}

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

          // Validação adicional com IA para PDF de NF
          try {
            const validacaoIA = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt: `Analise este PDF de nota fiscal e identifique problemas críticos. Responda em JSON:
{
  "requer_xml_obrigatorio": boolean,
  "problemas": string[],
  "avisos": string[],
  "duplicada_suspeita": boolean
}

Dados encontrados:
- NF: ${resultadoIa.nf_numero}
- Emitente: ${resultadoIa.nf_emitente_nome}
- Valor: ${resultadoIa.nf_valor_total}
- Data: ${resultadoIa.nf_data_emissao}

Procure por:
1. Se é PDF DE NF apenas (sem XML) = obrigatório solicitar XML
2. Divergências internas DANFE (valor/destinatário)
3. Suspeita de duplicação
4. Dados faltando ou ilegíveis`,
              response_json_schema: {
                type: 'object',
                properties: {
                  requer_xml_obrigatorio: { type: 'boolean' },
                  problemas: { type: 'array', items: { type: 'string' } },
                  avisos: { type: 'array', items: { type: 'string' } },
                  duplicada_suspeita: { type: 'boolean' }
                }
              }
            });
            
            if (validacaoIA.requer_xml_obrigatorio) {
              erros.push('❌ OBRIGATÓRIO: XML DA NF-e É NECESSÁRIO. PDF sozinho não é suficiente para validação fiscal. Solicitar ao fornecedor.');
            }
            if (validacaoIA.problemas?.length > 0) {
              erros.push(...validacaoIA.problemas);
            }
            if (validacaoIA.avisos?.length > 0) {
              erros.push(...validacaoIA.avisos);
            }
            if (validacaoIA.duplicada_suspeita) {
              erros.push('⚠️ SUSPEITA DE DUPLICAÇÃO: Verifique se já existe NF similar deste fornecedor.');
            }
          } catch (e) {
            console.warn('Validação IA de PDF NF falhou:', e.message);
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