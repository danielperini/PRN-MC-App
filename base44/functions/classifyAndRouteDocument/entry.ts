import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { invokeLLM } from '../_shared/gatewayIA.ts';

function safeStr(v: unknown) {
  return String(v || '').trim();
}

function detectMimeType(mimeType: unknown, fileName: unknown) {
  const mime = safeStr(mimeType).toLowerCase();
  const name = safeStr(fileName).toLowerCase();

  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|bmp|svg)$/i.test(name)) {
    return 'FOTO_ATIVIDADE';
  }

  if (mime === 'text/xml' || mime === 'application/xml' || name.endsWith('.xml')) {
    return 'NOTA_FISCAL_XML';
  }

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'PDF_CANDIDATO';
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword' ||
    name.endsWith('.docx') ||
    name.endsWith('.doc')
  ) {
    return 'DOCX_CANDIDATO';
  }

  return 'OUTRO';
}

function parseValor(v: unknown) {
  if (!v && v !== 0) return 0;

  const s = String(v).trim().replace(/\s/g, '');

  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }

  return parseFloat(s.replace(',', '.')) || 0;
}

const MESES_PADRAO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function limparNomeArquivo(v: unknown) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarCentro(v: unknown) {
  const raw = safeStr(v).toUpperCase();
  if (raw.includes('MHAB')) return 'MHAB';
  if (raw.includes('MIS')) return 'MIS';
  if (raw.includes('MUMO')) return 'MUMO';
  if (raw.includes('NOTURNO')) return 'NOTURNO';
  if (raw.includes('PUBLICAC')) return 'PUBLICACOES';
  return 'GERAL';
}

function getMesExtenso(dataStr: unknown) {
  try {
    const raw = safeStr(dataStr);
    let d;
    const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
      d = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
    } else {
      d = new Date(raw);
    }
    if (isNaN(d.getTime())) return { mes: MESES_PADRAO[new Date().getMonth()], ano: String(new Date().getFullYear()) };
    return { mes: MESES_PADRAO[d.getMonth()], ano: String(d.getFullYear()) };
  } catch {
    return { mes: MESES_PADRAO[new Date().getMonth()], ano: String(new Date().getFullYear()) };
  }
}

function buildRenamedNF(params: Record<string, unknown>) {
  const numero = safeStr(params.nf_numero) || 'SN';
  const fornecedor = limparNomeArquivo(params.nf_emitente_nome || params.fornecedor || 'Fornecedor').substring(0, 50) || 'Fornecedor';
  const centro = normalizarCentro(params.centro_custo_sugerido || params.centro_custo || 'GERAL');

  // Natureza da despesa: primeiras 4 palavras significativas
  const naturezaRaw = limparNomeArquivo(
    params.rubrica_nome || params.categoria_sugerida || params.descricao_servico || ''
  );
  const natureza = naturezaRaw.split(' ').filter(w => w.length > 1).slice(0, 4).join(' ') || 'Geral';

  const { mes, ano } = getMesExtenso(params.nf_data_emissao || params.data_emissao);

  const valorNum = parseValor(params.nf_valor_total);
  const valor = valorNum > 0
    ? valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : '0,00';

  const ext = safeStr(params.extension) || 'pdf';
  const prefixo = ext === 'xml' ? 'XML' : 'NF';

  const nome = `${prefixo}-${numero}-${centro}-${fornecedor}-${natureza}-MuseusCentro-${mes}-${ano}-R$-${valor}.${ext}`;

  // Sanitizar caracteres inválidos (mas manter hífens)
  return nome.replace(/[\/\:\;\?\*\"\'\(\)\[\]\{\}]/g, '').replace(/\s+/g, '-');
}

function buildRenamedComp(params) {
  const numero = safeStr(params.nf_numero || params.recibo_numero) || 'SN';
  const fornecedor = limparNomeArquivo(params.nf_emitente_nome || params.fornecedor_nome || params.fornecedor || 'Fornecedor').substring(0, 50) || 'Fornecedor';
  const centro = normalizarCentro(params.centro_custo_sugerido || params.centro_custo || 'GERAL');
  const naturezaRaw = limparNomeArquivo(
    params.rubrica_nome || params.categoria_sugerida || params.descricao_servico || 'Comprovante'
  );
  const natureza = naturezaRaw.split(' ').filter(w => w.length > 1).slice(0, 4).join(' ') || 'Comprovante';

  const { mes, ano } = getMesExtenso(params.nf_data_emissao || params.data_emissao || params.created_date);

  const valorNum = parseValor(params.nf_valor_total || params.valor_total);
  const valor = valorNum > 0
    ? valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : '0,00';

  const nome = `COMP-${numero}-${centro}-${fornecedor}-${natureza}-MuseusCentro-${mes}-${ano}-R$-${valor}.pdf`;
  return nome.replace(/[\/\:\;\?\*\"\'\(\)\[\]\{\}]/g, '').replace(/\s+/g, '-');
}

async function updateSafe(entity: any, id: string, payload: Record<string, unknown>) {
  if (!id) return null;

  try {
    return await entity.update(id, payload);
  } catch (e) {
    console.warn(`Falha ao atualizar ${id}:`, e?.message || e);
    return null;
  }
}

async function getAttachment(base44: any, intake: any) {
  const attachmentId = safeStr(intake.entidade_destino_id);
  if (!attachmentId) return null;

  try {
    return await base44.asServiceRole.entities.Attachment.get(attachmentId);
  } catch (e) {
    console.warn('Attachment vinculado ao intake não encontrado:', e?.message || e);
    return null;
  }
}

async function findGroupPdfAttachment(base44: any, intake: any) {
  if (!intake.grupo_upload_id) return null;

  try {
    const groupIntakes = await base44.asServiceRole.entities.DocumentIntake.filter({
      grupo_upload_id: intake.grupo_upload_id,
      status_registro: 'ATIVO',
    });

    for (const doc of groupIntakes || []) {
      if (doc.id === intake.id) continue;

      const isPdf =
        doc.tipo_detectado === 'NOTA_FISCAL_PDF' ||
        safeStr(doc.mime_type).toLowerCase().includes('pdf') ||
        safeStr(doc.file_name_original).toLowerCase().endsWith('.pdf');

      if (!isPdf || !doc.entidade_destino_id) continue;

      try {
        const attachment = await base44.asServiceRole.entities.Attachment.get(doc.entidade_destino_id);
        if (attachment) return attachment;
      } catch (e) {
        console.warn('PDF do grupo não encontrado:', e?.message || e);
      }
    }
  } catch (e) {
    console.warn('Erro ao buscar PDF do grupo:', e?.message || e);
  }

  return null;
}

async function findGroupXmlAttachment(base44: any, intake: any) {
  if (!intake.grupo_upload_id) return null;

  try {
    const groupIntakes = await base44.asServiceRole.entities.DocumentIntake.filter({
      grupo_upload_id: intake.grupo_upload_id,
      status_registro: 'ATIVO',
    });

    for (const doc of groupIntakes || []) {
      if (doc.id === intake.id) continue;

      const isXml =
        doc.tipo_detectado === 'NOTA_FISCAL_XML' ||
        safeStr(doc.mime_type).toLowerCase().includes('xml') ||
        safeStr(doc.file_name_original).toLowerCase().endsWith('.xml');

      if (!isXml || !doc.entidade_destino_id) continue;

      try {
        const attachment = await base44.asServiceRole.entities.Attachment.get(doc.entidade_destino_id);
        if (attachment) return attachment;
      } catch (e) {
        console.warn('XML do grupo não encontrado:', e?.message || e);
      }
    }
  } catch (e) {
    console.warn('Erro ao buscar XML do grupo:', e?.message || e);
  }

  return null;
}

async function resolveGrupoStatus(base44: any, intake: any, tipoAtual: string) {
  let grupoStatus = intake.grupo_status || 'INCOMPLETO';

  if (!intake.grupo_upload_id) return grupoStatus;

  try {
    const outrosDoGrupo = await base44.asServiceRole.entities.DocumentIntake.filter({
      grupo_upload_id: intake.grupo_upload_id,
      status_registro: 'ATIVO',
    });

    const temPDF = (outrosDoGrupo || []).some((d: any) => {
      if (d.id === intake.id) return tipoAtual === 'NOTA_FISCAL_PDF';
      return (
        d.tipo_detectado === 'NOTA_FISCAL_PDF' ||
        safeStr(d.mime_type).toLowerCase().includes('pdf') ||
        safeStr(d.file_name_original).toLowerCase().endsWith('.pdf')
      );
    });

    const temXML = (outrosDoGrupo || []).some((d: any) => {
      if (d.id === intake.id) return tipoAtual === 'NOTA_FISCAL_XML';
      return (
        d.tipo_detectado === 'NOTA_FISCAL_XML' ||
        safeStr(d.mime_type).toLowerCase().includes('xml') ||
        safeStr(d.file_name_original).toLowerCase().endsWith('.xml')
      );
    });

    if (temPDF && temXML) grupoStatus = 'COMPLETO';
  } catch (e) {
    console.warn('Erro ao validar grupo:', e?.message || e);
  }

  return grupoStatus;
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

    const intake = await base44.asServiceRole.entities.DocumentIntake.get(intakeId);

    if (!intake) {
      return Response.json({ ok: false, error: 'DocumentIntake não encontrado' }, { status: 404 });
    }

    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ANALISANDO_IA',
    });

    const mimeType = safeStr(intake.mime_type);
    const fileName = safeStr(intake.file_name_original);
    const fileUrl = safeStr(intake.arquivo_original_url);
    const attachment = await getAttachment(base44, intake);

    let tipoDetectado = detectMimeType(mimeType, fileName);
    let resultadoIa: Record<string, any> = {};
    let erros: string[] = [];
    let rubricaSugerida: any = null;
    let nomeFinal = fileName;

    if (tipoDetectado === 'FOTO_ATIVIDADE') {
      try {
        const iaResp = await invokeLLM(base44.asServiceRole,{
          prompt: `Analise esta imagem de uma atividade cultural em museu e sugira:
1. Uma legenda curta (máx 100 caracteres)
2. Uma descrição mais longa (máx 300 caracteres)
3. Local provável (museu, sala, externo)
4. Data provável se visível

Responda SOMENTE em JSON válido:
{"legenda":"","descricao":"","local_provavel":"","data_provavel":""}`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              legenda: { type: 'string' },
              descricao: { type: 'string' },
              local_provavel: { type: 'string' },
              data_provavel: { type: 'string' },
            },
          },
        });

        resultadoIa = iaResp || {};
      } catch (e) {
        erros.push(`IA de legenda falhou: ${e.message}`);
      }

      await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
        description: resultadoIa.legenda || 'Foto enviada pela Entrada Única',
        categoria: 'foto_atividade',
        backup_done: attachment?.backup_done || false,
      });

      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        tipo_detectado: 'FOTO_ATIVIDADE',
        status_processamento: 'AGUARDANDO_REVISAO',
        resultado_ia: resultadoIa,
        legenda_sugerida: resultadoIa.legenda || '',
        erros_validacao: erros,
        file_name_final: fileName,
        revisado_pelo_usuario: false,
      });

      return Response.json({ ok: true, tipo: 'FOTO_ATIVIDADE', resultado_ia: resultadoIa });
    }

    if (tipoDetectado === 'NOTA_FISCAL_XML') {
      try {
        const xmlResp = await invokeLLM(base44.asServiceRole,{
          prompt: `Leia INTEGRALMENTE este arquivo XML de nota fiscal eletrônica (NF-e ou NFS-e) e extraia TODOS os dados fiscais disponíveis. Não omita nenhum campo presente no XML.

Responda SOMENTE em JSON válido:
{
  "nf_numero": "",
  "nf_serie": "",
  "nf_chave_acesso": "",
  "nf_valor_total": "",
  "nf_valor_servicos": "",
  "nf_valor_iss": "",
  "nf_aliquota_iss": "",
  "nf_data_emissao": "",
  "nf_emitente_nome": "",
  "nf_emitente_cpf_cnpj": "",
  "nf_emitente_municipio": "",
  "nf_emitente_uf": "",
  "nf_emitente_inscricao_municipal": "",
  "nf_emitente_email": "",
  "nf_emitente_telefone": "",
  "nf_emitente_banco": "",
  "nf_emitente_agencia": "",
  "nf_emitente_conta": "",
  "nf_emitente_pix": "",
  "nf_destinatario_nome": "",
  "nf_destinatario_cpf_cnpj": "",
  "descricao_servico": "",
  "municipio": "",
  "competencia": ""
}`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              nf_numero: { type: 'string' },
              nf_serie: { type: 'string' },
              nf_chave_acesso: { type: 'string' },
              nf_valor_total: { type: 'string' },
              nf_valor_servicos: { type: 'string' },
              nf_valor_iss: { type: 'string' },
              nf_aliquota_iss: { type: 'string' },
              nf_data_emissao: { type: 'string' },
              nf_emitente_nome: { type: 'string' },
              nf_emitente_cpf_cnpj: { type: 'string' },
              nf_emitente_municipio: { type: 'string' },
              nf_emitente_uf: { type: 'string' },
              nf_emitente_inscricao_municipal: { type: 'string' },
              nf_emitente_email: { type: 'string' },
              nf_emitente_telefone: { type: 'string' },
              nf_emitente_banco: { type: 'string' },
              nf_emitente_agencia: { type: 'string' },
              nf_emitente_conta: { type: 'string' },
              nf_emitente_pix: { type: 'string' },
              nf_destinatario_nome: { type: 'string' },
              nf_destinatario_cpf_cnpj: { type: 'string' },
              descricao_servico: { type: 'string' },
              municipio: { type: 'string' },
              competencia: { type: 'string' },
            },
          },
        });

        resultadoIa = xmlResp || {};
      } catch (e) {
        erros.push(`Leitura automática do XML falhou: ${e.message}`);
        resultadoIa = {};
      }

      nomeFinal = buildRenamedNF({ ...resultadoIa, extension: 'xml' });
      const pdfAttachment = await findGroupPdfAttachment(base44, intake);
      const grupoStatus = await resolveGrupoStatus(base44, intake, 'NOTA_FISCAL_XML');

      await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
        file_name: nomeFinal || fileName,
        description: pdfAttachment
          ? `Entrada Única - XML de Nota Fiscal vinculado ao PDF`
          : `Entrada Única - XML de Nota Fiscal aguardando vínculo com PDF`,
        nf_categoria: 'nota_fiscal',
        nf_numero: safeStr(resultadoIa.nf_numero),
        nf_valor_total: parseValor(resultadoIa.nf_valor_total),
        nf_data_emissao: safeStr(resultadoIa.nf_data_emissao),
        nf_emitente_nome: safeStr(resultadoIa.nf_emitente_nome),
        nf_emitente_cpf_cnpj: safeStr(resultadoIa.nf_emitente_cpf_cnpj),
        nf_destinatario_nome: safeStr(resultadoIa.nf_destinatario_nome),
        nf_chave_acesso: safeStr(resultadoIa.nf_chave_acesso),
        nf_tipo_documento: 'xml_nf',
        nf_nome_original: fileName,
        nf_nome_renomeado: nomeFinal || fileName,
        nf_status_leitura: erros.length ? 'erro_leitura_parcial' : 'lido_com_sucesso',
        nf_revisado: false,
        nf_pdf_attachment_id: pdfAttachment?.id || '',
        nf_xml_sem_pdf: !pdfAttachment,
        municipio: safeStr(resultadoIa.municipio || resultadoIa.nf_emitente_municipio),
        backup_done: attachment?.backup_done || false,
      });

      if (pdfAttachment?.id && attachment?.id) {
        await updateSafe(base44.asServiceRole.entities.Attachment, pdfAttachment.id, {
          nf_xml_attachment_id: attachment.id,
          nf_categoria: 'nota_fiscal',
          nf_tipo_documento: 'pdf_nf',
          nf_numero: safeStr(resultadoIa.nf_numero) || pdfAttachment.nf_numero || '',
          nf_valor_total: parseValor(resultadoIa.nf_valor_total) || pdfAttachment.nf_valor_total || 0,
          nf_data_emissao: safeStr(resultadoIa.nf_data_emissao) || pdfAttachment.nf_data_emissao || '',
          nf_emitente_nome: safeStr(resultadoIa.nf_emitente_nome) || pdfAttachment.nf_emitente_nome || '',
          nf_emitente_cpf_cnpj:
            safeStr(resultadoIa.nf_emitente_cpf_cnpj) || pdfAttachment.nf_emitente_cpf_cnpj || '',
        });
      }

      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        tipo_detectado: 'NOTA_FISCAL_XML',
        status_processamento: 'AGUARDANDO_REVISAO',
        resultado_ia: resultadoIa,
        entidade_destino: 'Attachment',
        entidade_destino_id: attachment?.id || intake.entidade_destino_id || '',
        file_name_final: nomeFinal || fileName,
        erros_validacao: erros,
        revisado_pelo_usuario: false,
        grupo_status: grupoStatus,
      });

      return Response.json({
        ok: true,
        tipo: 'NOTA_FISCAL_XML',
        resultado_ia: resultadoIa,
        vinculado_pdf: !!pdfAttachment,
      });
    }

    if (tipoDetectado === 'PDF_CANDIDATO') {
      try {
        const hoje = new Date().toISOString().slice(0, 10);

        const iaResp = await invokeLLM(base44.asServiceRole,{
          prompt: `Leia INTEGRALMENTE este documento PDF e classifique-o com precisão. Analise CADA PÁGINA sem pular nenhuma.

          Tipos possíveis:
          - NOTA_FISCAL: NF-e, NFS-e, RPA, fatura, recibo com dados fiscais (CNPJ/CPF emitente, número, valor)
          - CONTRATO: contrato de prestação de serviço, termo de serviço, contrato de trabalho, instrumento de acordo entre partes
          - DOCUMENTO_ADMINISTRATIVO: ata, ofício, declaração, proposta, memorando, planilha, relatório ou outro

          IMPORTANTE — DISTINÇÃO ENTRE ORÇAMENTO E NOTA FISCAL:
          - Um ORÇAMENTO/PROPOSTA tem: título "Orçamento" ou "Proposta", CNPJ do emitente, lista de itens/serviços, valor total, prazo de validade, condições de pagamento. NÃO tem número de NF, DANFE, CFOP, dados do fisco.
          - Uma NOTA FISCAL tem: número da NF, DANFE, CFOP, natureza da operação, dados do fisco (inscrição estadual/municipal), chave de acesso (44 dígitos).
          - Se for ORÇAMENTO → classifique como DOCUMENTO_ADMINISTRATIVO.
          - Se for NOTA FISCAL → classifique como NOTA_FISCAL.

          Leia TODO o texto visível do documento. Para NOTAS FISCAIS extraia absolutamente todos os campos fiscais disponíveis, incluindo o HORÁRIO de emissão. Para CONTRATOS, extraia todas as partes, valores, vigência e objeto.

          A data atual é ${hoje}. Não sinalize datas passadas como "futuras".
          ${orientacoesUsuario ? `\nOrientações do usuário: ${orientacoesUsuario}` : ''}

          Responda SOMENTE em JSON válido:
          {
          "tipo_documento": "NOTA_FISCAL|CONTRATO|DOCUMENTO_ADMINISTRATIVO",
          "eh_nota_fiscal": false,
          "eh_contrato": false,
          "nf_numero": "",
          "nf_serie": "",
          "nf_chave_acesso": "",
          "nf_valor_total": "",
          "nf_valor_servicos": "",
          "nf_valor_deducoes": "",
          "nf_valor_iss": "",
          "nf_aliquota_iss": "",
          "nf_data_emissao": "",
          "nf_horario_emissao": "",
          "nf_competencia": "",
          "nf_emitente_nome": "",
          "nf_emitente_cpf_cnpj": "",
          "nf_emitente_municipio": "",
          "nf_emitente_uf": "",
          "nf_emitente_endereco": "",
          "nf_emitente_cep": "",
          "nf_emitente_inscricao_municipal": "",
          "nf_emitente_email": "",
          "nf_emitente_telefone": "",
          "nf_emitente_banco": "",
          "nf_emitente_agencia": "",
          "nf_emitente_conta": "",
          "nf_emitente_pix": "",
          "nf_destinatario_nome": "",
          "nf_destinatario_cpf_cnpj": "",
          "descricao_servico": "",
          "municipio": "",
          "competencia": "",
          "indicios_duplicidade": "",
          "contrato_numero": "",
          "contrato_objeto": "",
          "contrato_fornecedor_nome": "",
          "contrato_fornecedor_cpf_cnpj": "",
          "contrato_responsavel_tecnico": "",
          "contrato_vigencia_inicio": "",
          "contrato_vigencia_fim": "",
          "contrato_valor_total": "",
          "contrato_numero_parcelas": "",
          "contrato_valor_parcela": "",
          "contrato_banco": "",
          "contrato_agencia": "",
          "contrato_conta": "",
          "contrato_pix": "",
          "contrato_museu": "",
          "contrato_meta": "",
          "contrato_rubrica_sugerida": "",
          "contrato_membros_equipe": [],
          "inconsistencias": []
          }`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              tipo_documento: { type: 'string' },
              eh_nota_fiscal: { type: 'boolean' },
              eh_contrato: { type: 'boolean' },
              nf_numero: { type: 'string' },
              nf_serie: { type: 'string' },
              nf_chave_acesso: { type: 'string' },
              nf_valor_total: { type: 'string' },
              nf_valor_servicos: { type: 'string' },
              nf_valor_deducoes: { type: 'string' },
              nf_valor_iss: { type: 'string' },
              nf_aliquota_iss: { type: 'string' },
              nf_data_emissao: { type: 'string' },
              nf_horario_emissao: { type: 'string' },
              nf_competencia: { type: 'string' },
              nf_emitente_nome: { type: 'string' },
              nf_emitente_cpf_cnpj: { type: 'string' },
              nf_emitente_municipio: { type: 'string' },
              nf_emitente_uf: { type: 'string' },
              nf_emitente_endereco: { type: 'string' },
              nf_emitente_cep: { type: 'string' },
              nf_emitente_inscricao_municipal: { type: 'string' },
              nf_emitente_email: { type: 'string' },
              nf_emitente_telefone: { type: 'string' },
              nf_emitente_banco: { type: 'string' },
              nf_emitente_agencia: { type: 'string' },
              nf_emitente_conta: { type: 'string' },
              nf_emitente_pix: { type: 'string' },
              nf_destinatario_nome: { type: 'string' },
              nf_destinatario_cpf_cnpj: { type: 'string' },
              descricao_servico: { type: 'string' },
              municipio: { type: 'string' },
              competencia: { type: 'string' },
              indicios_duplicidade: { type: 'string' },
              contrato_numero: { type: 'string' },
              contrato_objeto: { type: 'string' },
              contrato_fornecedor_nome: { type: 'string' },
              contrato_fornecedor_cpf_cnpj: { type: 'string' },
              contrato_responsavel_tecnico: { type: 'string' },
              contrato_vigencia_inicio: { type: 'string' },
              contrato_vigencia_fim: { type: 'string' },
              contrato_valor_total: { type: 'string' },
              contrato_numero_parcelas: { type: 'string' },
              contrato_valor_parcela: { type: 'string' },
              contrato_banco: { type: 'string' },
              contrato_agencia: { type: 'string' },
              contrato_conta: { type: 'string' },
              contrato_pix: { type: 'string' },
              contrato_museu: { type: 'string' },
              contrato_meta: { type: 'string' },
              contrato_rubrica_sugerida: { type: 'string' },
              contrato_membros_equipe: { type: 'array', items: { type: 'string' } },
              inconsistencias: { type: 'array', items: { type: 'string' } },
            },
          },
          model: 'claude_sonnet_4_6',
        });

        resultadoIa = iaResp?.response || iaResp || {};
        const tipoDocumento = safeStr(resultadoIa.tipo_documento).toUpperCase();
        const ehNF = resultadoIa.eh_nota_fiscal === true || tipoDocumento === 'NOTA_FISCAL';
        const ehContrato = resultadoIa.eh_contrato === true || tipoDocumento === 'CONTRATO';

        // Normalizar campos municipio/competencia que podem vir com prefixo nf_
        if (!resultadoIa.municipio && resultadoIa.nf_emitente_municipio) {
          resultadoIa.municipio = resultadoIa.nf_emitente_municipio;
        }
        if (!resultadoIa.competencia && resultadoIa.nf_competencia) {
          resultadoIa.competencia = resultadoIa.nf_competencia;
        }

        // Mapear campos de contrato para o formato esperado pelo ReviewModalContrato
        if (ehContrato) {
          resultadoIa.fornecedor_nome = resultadoIa.contrato_fornecedor_nome || resultadoIa.fornecedor_nome || '';
          resultadoIa.fornecedor_cpf_cnpj = resultadoIa.contrato_fornecedor_cpf_cnpj || resultadoIa.fornecedor_cpf_cnpj || '';
          resultadoIa.responsavel_tecnico = resultadoIa.contrato_responsavel_tecnico || '';
          resultadoIa.objeto_contrato = resultadoIa.contrato_objeto || '';
          resultadoIa.numero_contrato = resultadoIa.contrato_numero || '';
          resultadoIa.vigencia_inicio = resultadoIa.contrato_vigencia_inicio || '';
          resultadoIa.vigencia_fim = resultadoIa.contrato_vigencia_fim || '';
          resultadoIa.valor_total = resultadoIa.contrato_valor_total || '';
          resultadoIa.numero_parcelas = resultadoIa.contrato_numero_parcelas || '';
          resultadoIa.valor_parcela = resultadoIa.contrato_valor_parcela || '';
          resultadoIa.fornecedor_banco = resultadoIa.contrato_banco || '';
          resultadoIa.fornecedor_agencia = resultadoIa.contrato_agencia || '';
          resultadoIa.fornecedor_conta = resultadoIa.contrato_conta || '';
          resultadoIa.fornecedor_pix = resultadoIa.contrato_pix || '';
          resultadoIa.museu_relacionado = resultadoIa.contrato_museu || '';
          resultadoIa.meta_contrato = resultadoIa.contrato_meta || '';
          resultadoIa.rubrica_sugerida = resultadoIa.contrato_rubrica_sugerida || '';
          resultadoIa.membros_equipe = (resultadoIa.contrato_membros_equipe || []).map(n => ({ nome: n }));
        }

        const ehRecibo = tipoDocumento === 'RECIBO_PDF' || tipoDocumento === 'RECIBO' ||
          (safeStr(fileName).toLowerCase().includes('comp') && !ehNF);

        if (ehRecibo) {
          tipoDetectado = 'RECIBO_PDF';
        } else if (tipoDocumento !== 'NOTA_FISCAL' && tipoDocumento !== 'CONTRATO') {
          tipoDetectado = 'DOCUMENTO_ADMINISTRATIVO';
        } else if (ehContrato) {
          tipoDetectado = 'CONTRATO';
        } else {
          tipoDetectado = 'NOTA_FISCAL_PDF';
        }

        if (Array.isArray(resultadoIa.inconsistencias)) {
          erros = resultadoIa.inconsistencias;
        }

        if (ehContrato) {
          const nomeFornecedor = safeStr(resultadoIa.fornecedor_nome || resultadoIa.contrato_fornecedor_nome).substring(0, 40).toUpperCase() || 'CONTRATO';
          const numContrato = safeStr(resultadoIa.numero_contrato || resultadoIa.contrato_numero) || 'SEM-NUM';
          nomeFinal = `CONTRATO - ${numContrato} - ${nomeFornecedor} - MUSEUS CENTRO.pdf`;

          await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
            description: `Entrada Única - Contrato: ${resultadoIa.objeto_contrato || nomeFornecedor}`,
            categoria: 'contrato',
            backup_done: attachment?.backup_done || false,
          });
        }

        if (ehRecibo) {
          nomeFinal = buildRenamedComp({ ...resultadoIa, file_name_original: fileName });

          await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
            file_name: nomeFinal,
            description: 'Entrada Única - Comprovante/Recibo',
            categoria: 'comprovante',
            nf_nome_original: fileName,
            nf_nome_renomeado: nomeFinal,
            backup_done: attachment?.backup_done || false,
          });
        }

        if (ehNF) {
          nomeFinal = buildRenamedNF({ ...resultadoIa, extension: 'pdf' });

          try {
            const rubResp = await base44.asServiceRole.functions.invoke('suggestRubrica', {
              descricao: resultadoIa.descricao_servico || resultadoIa.nf_emitente_nome || '',
              fornecedor: resultadoIa.nf_emitente_nome || '',
              centro_custo: '',
            });

            rubricaSugerida = rubResp?.data?.suggestion || null;
          } catch (e) {
            console.warn(`Sugestão de rubrica falhou: ${e.message}`);
          }

          try {
            const infoAdicionais = await invokeLLM(base44.asServiceRole,{
              prompt: `Baseado nestes dados de nota fiscal, sugira informações complementares para classificação:

Fornecedor: ${resultadoIa.nf_emitente_nome}
Descrição: ${resultadoIa.descricao_servico}
Valor: ${resultadoIa.nf_valor_total}
Data: ${resultadoIa.nf_data_emissao}

Responda em JSON:
{
  "categoria": "Serviços de comunicação|Serviços administrativos|Logística|Alimentação|Materiais|Outro",
  "tipo_servico": "Serviço|Produto|Manutenção|Consultoria",
  "tipo_gasto": "Serviço|Produto",
  "centro_custo": "MHAB|MIS|MUMO|Atuação Geral",
  "competencia": "Mês/Ano (ex: Abril/2026)",
  "justificativa": "Breve motivo da classificação"
}`,
              response_json_schema: {
                type: 'object',
                properties: {
                  categoria: { type: 'string' },
                  tipo_servico: { type: 'string' },
                  tipo_gasto: { type: 'string' },
                  centro_custo: { type: 'string' },
                  competencia: { type: 'string' },
                  justificativa: { type: 'string' },
                },
              },
            });

            resultadoIa = {
              ...resultadoIa,
              categoria_sugerida: infoAdicionais.categoria,
              tipo_servico: infoAdicionais.tipo_servico,
              tipo_gasto: infoAdicionais.tipo_gasto,
              centro_custo_sugerido: infoAdicionais.centro_custo,
              competencia: infoAdicionais.competencia,
              classificacao_justificativa: infoAdicionais.justificativa,
            };
          } catch (e) {
            console.warn(`Busca de informações adicionais falhou: ${e.message}`);
          }

          try {
            const xmlAttachment = await findGroupXmlAttachment(base44, intake);
            const temXMLCorrespondente = !!xmlAttachment;

            const validacaoIA = await invokeLLM(base44.asServiceRole,{
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
                  duplicada_suspeita: { type: 'boolean' },
                },
              },
            });

            if (validacaoIA.requer_xml_obrigatorio && !temXMLCorrespondente) {
              erros.push(
                '❌ OBRIGATÓRIO: XML DA NF-e É NECESSÁRIO. PDF sozinho não é suficiente para validação fiscal. Solicitar ao fornecedor.'
              );
            }

            if (validacaoIA.problemas?.length > 0) erros.push(...validacaoIA.problemas);
            if (validacaoIA.avisos?.length > 0) erros.push(...validacaoIA.avisos);
            if (validacaoIA.duplicada_suspeita) {
              erros.push('⚠️ SUSPEITA DE DUPLICAÇÃO: Verifique se já existe NF similar deste fornecedor.');
            }

            if (xmlAttachment?.id && attachment?.id) {
              await updateSafe(base44.asServiceRole.entities.Attachment, attachment.id, {
                nf_xml_attachment_id: xmlAttachment.id,
              });

              await updateSafe(base44.asServiceRole.entities.Attachment, xmlAttachment.id, {
                nf_pdf_attachment_id: attachment.id,
                nf_numero: safeStr(resultadoIa.nf_numero) || xmlAttachment.nf_numero || '',
                nf_valor_total: parseValor(resultadoIa.nf_valor_total) || xmlAttachment.nf_valor_total || 0,
                nf_data_emissao: safeStr(resultadoIa.nf_data_emissao) || xmlAttachment.nf_data_emissao || '',
                nf_emitente_nome: safeStr(resultadoIa.nf_emitente_nome) || xmlAttachment.nf_emitente_nome || '',
                nf_emitente_cpf_cnpj:
                  safeStr(resultadoIa.nf_emitente_cpf_cnpj) || xmlAttachment.nf_emitente_cpf_cnpj || '',
                nf_xml_sem_pdf: false,
              });
            }
          } catch (e) {
            console.warn('Validação IA de PDF NF falhou:', e.message);
          }

          await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
            file_name: nomeFinal,
            description: 'Entrada Única - Nota Fiscal em PDF',
            nf_categoria: 'nota_fiscal',
            nf_numero: safeStr(resultadoIa.nf_numero),
            nf_valor_total: parseValor(resultadoIa.nf_valor_total),
            nf_data_emissao: safeStr(resultadoIa.nf_data_emissao),
            nf_emitente_nome: safeStr(resultadoIa.nf_emitente_nome),
            nf_emitente_cpf_cnpj: safeStr(resultadoIa.nf_emitente_cpf_cnpj),
            nf_tipo_documento: 'pdf_nf',
            nf_nome_original: fileName,
            nf_nome_renomeado: nomeFinal,
            nf_status_leitura: erros.length ? 'lido_com_alertas' : 'lido_com_sucesso',
            nf_revisado: false,
            backup_done: attachment?.backup_done || false,
          });
        } else if (!ehRecibo) {
          await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
            description: 'Entrada Única - Documento Administrativo',
            categoria: 'documento_administrativo',
            backup_done: attachment?.backup_done || false,
          });
        }
      } catch (e) {
        erros.push(`Análise de PDF falhou: ${e.message}`);
        tipoDetectado = 'DOCUMENTO_ADMINISTRATIVO';

        await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
          description: 'Entrada Única - Documento Administrativo',
          categoria: 'documento_administrativo',
          backup_done: attachment?.backup_done || false,
        });
      }

      const grupoStatus = await resolveGrupoStatus(base44, intake, tipoDetectado);

      const updatePayload = {
        tipo_detectado: tipoDetectado,
        status_processamento: 'AGUARDANDO_REVISAO',
        resultado_ia: resultadoIa,
        entidade_destino: 'Attachment',
        entidade_destino_id: attachment?.id || intake.entidade_destino_id || '',
        file_name_final: nomeFinal,
        rubrica_id_sugerida: rubricaSugerida?.rubrica_id || '',
        rubrica_nome_sugerida: rubricaSugerida?.rubrica_nome || '',
        rubrica_justificativa: rubricaSugerida?.justificativa || '',
        erros_validacao: erros,
        revisado_pelo_usuario: false,
        grupo_status: grupoStatus,
        // Campos de contrato (preenchidos apenas quando for CONTRATO)
        contrato_numero: tipoDetectado === 'CONTRATO' ? (safeStr(resultadoIa.numero_contrato) || '') : (intake.contrato_numero || ''),
        fornecedor_nome: tipoDetectado === 'CONTRATO' ? (safeStr(resultadoIa.fornecedor_nome) || '') : (intake.fornecedor_nome || ''),
        nf_emitente_cpf_cnpj: tipoDetectado !== 'CONTRATO' ? safeStr(resultadoIa.nf_emitente_cpf_cnpj) : (intake.nf_emitente_cpf_cnpj || ''),
        municipio: safeStr(resultadoIa.municipio || resultadoIa.nf_emitente_municipio),
      };

      // Para NOTA_FISCAL_PDF, persistir campos fiscais diretamente no intake
      if (tipoDetectado === 'NOTA_FISCAL_PDF') {
        updatePayload.nf_numero = safeStr(resultadoIa.nf_numero);
        updatePayload.nf_valor_total = parseValor(resultadoIa.nf_valor_total);
        updatePayload.centro_custo = safeStr(resultadoIa.centro_custo_sugerido || resultadoIa.centro_custo || '');
        updatePayload.fornecedor_cpf_cnpj = safeStr(resultadoIa.nf_emitente_cpf_cnpj || resultadoIa.fornecedor_cpf_cnpj);
      }

      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, updatePayload);

      return Response.json({
        ok: true,
        tipo: tipoDetectado,
        resultado_ia: resultadoIa,
        rubrica: rubricaSugerida,
      });
    }

    if (tipoDetectado === 'DOCX_CANDIDATO') {
      try {
        const hoje = new Date().toISOString().slice(0, 10);

        const iaResp = await invokeLLM(base44.asServiceRole,{
          prompt: `Analise este documento Word (.docx) e determine seu tipo e conteúdo principal.
Pode ser: contrato, termo, proposta, relatório, ata, ofício, declaração, currículo, memorial descritivo ou outro.
Extraia as informações principais.${orientacoesUsuario ? `\n\nOrientações do usuário: ${orientacoesUsuario}` : ''}

A data atual é ${hoje}.

Responda SOMENTE em JSON válido:
{
  "tipo_documento": "contrato|termo|proposta|relatorio|ata|oficio|declaracao|outro",
  "titulo": "",
  "resumo": "",
  "partes_envolvidas": [],
  "valor_estimado": "",
  "data_documento": "",
  "vigencia": "",
  "pontos_principais": [],
  "inconsistencias": []
}`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              tipo_documento: { type: 'string' },
              titulo: { type: 'string' },
              resumo: { type: 'string' },
              partes_envolvidas: { type: 'array', items: { type: 'string' } },
              valor_estimado: { type: 'string' },
              data_documento: { type: 'string' },
              vigencia: { type: 'string' },
              pontos_principais: { type: 'array', items: { type: 'string' } },
              inconsistencias: { type: 'array', items: { type: 'string' } },
            },
          },
        });

        resultadoIa = iaResp || {};
        if (Array.isArray(resultadoIa.inconsistencias)) {
          erros = resultadoIa.inconsistencias;
        }
      } catch (e) {
        erros.push(`Análise do documento Word falhou: ${e.message}`);
      }

      const tituloDocx = safeStr(resultadoIa.titulo) || fileName;
      nomeFinal = tituloDocx.length > 5 ? `${tituloDocx.substring(0, 60)} - MUSEUS CENTRO.docx` : fileName;

      await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
        description: resultadoIa.resumo || 'Entrada Única - Documento Word',
        categoria: 'documento_administrativo',
        backup_done: attachment?.backup_done || false,
      });

      const grupoStatusDocx = await resolveGrupoStatus(base44, intake, 'DOCUMENTO_ADMINISTRATIVO');

      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        tipo_detectado: 'DOCUMENTO_ADMINISTRATIVO',
        status_processamento: 'AGUARDANDO_REVISAO',
        resultado_ia: resultadoIa,
        entidade_destino: 'Attachment',
        entidade_destino_id: attachment?.id || intake.entidade_destino_id || '',
        file_name_final: nomeFinal,
        erros_validacao: erros,
        revisado_pelo_usuario: false,
        grupo_status: grupoStatusDocx,
      });

      return Response.json({ ok: true, tipo: 'DOCUMENTO_ADMINISTRATIVO', subtipo: 'docx', resultado_ia: resultadoIa });
    }

    const grupoStatus = await resolveGrupoStatus(base44, intake, 'OUTRO');

    await updateSafe(base44.asServiceRole.entities.Attachment, attachment?.id, {
      description: 'Entrada Única - Outro Documento',
      categoria: 'outro',
      backup_done: attachment?.backup_done || false,
    });

    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      tipo_detectado: 'OUTRO',
      status_processamento: 'AGUARDANDO_REVISAO',
      resultado_ia: {},
      erros_validacao: [],
      revisado_pelo_usuario: false,
      grupo_status: grupoStatus,
    });

    return Response.json({ ok: true, tipo: 'OUTRO' });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});