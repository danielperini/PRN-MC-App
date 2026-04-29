import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const MESES: Record<string, string> = {
  '01': 'Janeiro',
  '1': 'Janeiro',
  janeiro: 'Janeiro',
  '02': 'Fevereiro',
  '2': 'Fevereiro',
  fevereiro: 'Fevereiro',
  '03': 'Março',
  '3': 'Março',
  março: 'Março',
  marco: 'Março',
  '04': 'Abril',
  '4': 'Abril',
  abril: 'Abril',
  '05': 'Maio',
  '5': 'Maio',
  maio: 'Maio',
  '06': 'Junho',
  '6': 'Junho',
  junho: 'Junho',
  '07': 'Julho',
  '7': 'Julho',
  julho: 'Julho',
  '08': 'Agosto',
  '8': 'Agosto',
  agosto: 'Agosto',
  '09': 'Setembro',
  '9': 'Setembro',
  setembro: 'Setembro',
  '10': 'Outubro',
  outubro: 'Outubro',
  '11': 'Novembro',
  novembro: 'Novembro',
  '12': 'Dezembro',
  dezembro: 'Dezembro',
};

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function parseValor(v: any) {
  if (!v) return 0;
  if (typeof v === 'number') return v;

  const clean = String(v)
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  return Number(clean) || 0;
}

function normalizarMes(value: any) {
  const raw = String(value || '').trim().toLowerCase();

  if (!raw) return '';

  const match = raw.match(/^(\d{1,2})[\/.-](\d{4})$/);
  if (match) return MESES[match[1].padStart(2, '0')] || '';

  return MESES[raw] || '';
}

function extrairAno(value: any) {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{4})/);
  if (match) return Number(match[1]);

  const anoAtual = new Date().getFullYear();
  return anoAtual;
}

function detectarEquipe(form: any) {
  const tipoPagamento = String(form?.tipo_pagamento || '').toLowerCase();
  const destino = String(form?.destino_aprovacao || '').toLowerCase();
  const tipoGasto = String(form?.tipo_gasto || '').toLowerCase();
  const categoria = String(form?.categoria || '').toLowerCase();

  return (
    tipoPagamento === 'equipe' ||
    destino === 'equipe' ||
    tipoGasto === 'equipe' ||
    categoria.includes('equipe')
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { intakeId, form = {} } = body;

    console.log('🚀 enviarNotaParaAprovacao START', { intakeId, form });

    if (!intakeId) {
      return json({ success: false, error: 'intakeId obrigatório' }, 400);
    }

    if (!form.rubrica_id) {
      return json({ success: false, error: 'Rubrica obrigatória' }, 400);
    }

    const valor = parseValor(
      form.nf_valor_total ||
      form.valor_total ||
      form.valor ||
      form.valor_solicitado
    );

    if (!valor) {
      return json({ success: false, error: 'Valor da nota inválido' }, 400);
    }

    const intake = await base44.asServiceRole.entities.DocumentIntake.get(intakeId);

    if (!intake) {
      return json({ success: false, error: 'DocumentIntake não encontrado' }, 404);
    }

    const isEquipe = detectarEquipe(form);

    const fileUrl =
      form.file_url ||
      form.nota_fiscal_url ||
      intake.arquivo_original_url ||
      intake.file_url ||
      intake.url ||
      intake.nota_fiscal_url ||
      '';

    if (!fileUrl) {
      return json({
        success: false,
        error: 'Arquivo original não encontrado no DocumentIntake.'
      }, 400);
    }

    const nomePadronizado =
      form.nome_padronizado_arquivo ||
      form.nome_arquivo_padronizado ||
      intake.file_name_final ||
      intake.file_name_original ||
      intake.file_name ||
      'nota-fiscal.pdf';

    const xmlUrl =
      form.xml_url ||
      intake.xml_url ||
      '';

    const rubricaNome =
      form.rubrica_nome ||
      form.rubrica_nome_sugerida ||
      intake.rubrica_nome_sugerida ||
      '';

    const descricao =
      form.descricao_servico ||
      form.descricao_item ||
      form.descricao ||
      form.nf_emitente_nome ||
      'Nota Fiscal';

    const centroCusto = form.centro_custo || intake.centro_custo || 'Geral';

    const mesReferencia =
      normalizarMes(form.mes_referencia) ||
      normalizarMes(form.nf_competencia) ||
      normalizarMes(intake.resultado_ia?.nf_competencia) ||
      normalizarMes(new Date().getMonth() + 1);

    const anoReferencia =
      Number(form.ano) ||
      extrairAno(form.nf_competencia) ||
      extrairAno(intake.resultado_ia?.nf_competencia);

    const attachment = await base44.asServiceRole.entities.Attachment.create({
      report_id: '',
      file_name: nomePadronizado,
      file_type: intake.mime_type || 'application/pdf',
      file_url: fileUrl,
      description: `Entrada Única - NF ${form.nf_numero || ''} - ${form.nf_emitente_nome || ''}`,
      nf_tipo_documento: intake.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
      nf_numero: form.nf_numero || '',
      nf_valor_total: valor,
      nf_data_emissao: form.nf_data_emissao || '',
      nf_emitente_nome: form.nf_emitente_nome || '',
      nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj || '',
      nf_status_leitura: 'lido_com_sucesso',
      nf_nome_original: intake.file_name_original || '',
      nf_nome_renomeado: nomePadronizado,
      nf_revisado: true,
    });

    let created: any;

    if (isEquipe) {
      created = await base44.asServiceRole.entities.TeamPayment.create({
        team_member_id:
          form.team_member_id ||
          form.team_memberId ||
          intake.user_email ||
          `entrada_unica_${intakeId}`,

        user_email:
          form.user_email ||
          intake.user_email ||
          'sem-email@entrada-unica.local',

        user_name:
          form.user_name ||
          intake.user_name ||
          form.nf_emitente_nome ||
          'Profissional',

        funcao: form.funcao || form.tipo_gasto || 'Equipe',
        role: form.funcao || form.tipo_gasto || 'Equipe',

        mes_referencia: mesReferencia || 'Abril',
        ano: anoReferencia,

        rubrica_id: form.rubrica_id,
        rubrica_nome: rubricaNome,

        nota_fiscal_url: fileUrl,
        nota_fiscal_file_name: nomePadronizado,
        xml_url: xmlUrl,
        xml_file_name: form.xml_vinculado_nome || '',

        numero_nf: form.nf_numero || '',
        valor_nf: valor,

        nf_numero_extraido: form.nf_numero || '',
        nf_valor_extraido: valor,
        nf_cnpj_emitente: form.nf_emitente_cpf_cnpj || '',
        nf_razao_social: form.nf_emitente_nome || '',
        nf_data_emissao: form.nf_data_emissao || '',
        nf_competencia: form.nf_competencia || '',

        status: 'AGUARDANDO_APROVACAO',
        observacoes: `Entrada Única. ${descricao}`,

        resultado_validacao: JSON.stringify({
          origem: 'entrada_unica',
          intake_id: intakeId,
          attachment_id: attachment.id,
        }),
      });
    } else {
      created = await base44.asServiceRole.entities.PurchaseRequest.create({
        descricao_item: descricao,
        fornecedor_nome: form.nf_emitente_nome || '',
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj || '',
        valor_solicitado: valor,
        valor_total: valor,

        meta_id: form.meta_id || 'MC3A-20',
        categoria: form.categoria || 'Nota Fiscal',
        tipo_gasto: form.tipo_gasto || 'Serviço',
        centro_custo: centroCusto,

        rubrica_id: form.rubrica_id,
        rubrica_nome: rubricaNome,

        nota_fiscal_url: fileUrl,
        file_url: fileUrl,
        xml_url: xmlUrl,

        status: 'SOLICITADO',
        origem: 'entrada_unica',
        tipo_origem: 'entrada_unica',

        solicitante_email: form.user_email || intake.user_email || '',
        created_by: form.user_email || intake.user_email || '',

        observacoes: `Entrada Única. NF ${form.nf_numero || ''}. Arquivo: ${nomePadronizado}`,
      });
    }

    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ENVIADO_APROVACAO',
      grupo_status: 'ENVIADO_APROVACAO',
      file_name_final: nomePadronizado,
      entidade_destino: isEquipe ? 'TeamPayment' : 'PurchaseRequest',
      entidade_destino_id: created.id,
      rubrica_id_sugerida: form.rubrica_id,
      rubrica_nome_sugerida: rubricaNome,
      centro_custo: centroCusto,
      revisado_pelo_usuario: true,
      resultado_ia: {
        ...(intake.resultado_ia || {}),
        ...form,
        nf_valor_total: valor,
        attachment_id: attachment.id,
        entidade_destino: isEquipe ? 'TeamPayment' : 'PurchaseRequest',
        entidade_destino_id: created.id,
      },
    });

    console.log('✅ enviarNotaParaAprovacao OK', {
      destino: isEquipe ? 'equipe' : 'solicitacao',
      id: created.id,
    });

    return json({
      success: true,
      destino: isEquipe ? 'equipe' : 'solicitacao',
      id: created.id,
      attachment_id: attachment.id,
      data: created,
    });
  } catch (err: any) {
    console.error('❌ enviarNotaParaAprovacao ERROR', err);

    return json({
      success: false,
      error: err?.message || 'Erro interno ao enviar para aprovação',
    }, 500);
  }
});
