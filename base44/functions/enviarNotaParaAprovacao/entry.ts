import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value: any) {
  if (typeof value === 'number') return value;

  const raw = String(value || '').trim();

  if (/^\d{5,}$/.test(raw)) {
    return Number(raw) / 100;
  }

  const clean = raw
    .replace('R$', '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(clean) || 0;
}

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getRubricaNome(rubrica: any) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '';
}

function isEquipe(form: any, ia: any, intake: any, rubricaNome: string) {
  const raw = [
    form?.tipo_gasto,
    form?.descricao_servico,
    form?.rubrica_nome,
    rubricaNome,
    ia?.tipo_gasto,
    ia?.categoria,
    ia?.tipo_solicitacao,
    ia?.classificacao,
    ia?.descricao_servico,
    intake?.tipo_gasto,
    intake?.categoria,
    intake?.tipo_solicitacao,
  ]
    .map(normalizeText)
    .join(' ');

  return (
    raw.includes('equipe') ||
    raw.includes('pagamento equipe') ||
    raw.includes('pagamento da equipe') ||
    raw.includes('profissional') ||
    raw.includes('educador') ||
    raw.includes('coordenação') ||
    raw.includes('coordenacao')
  );
}

function parseCompetencia(value: any) {
  const raw = String(value || '').trim();

  const meses = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  const mmYYYY = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYYYY) {
    const mesIndex = Math.max(1, Math.min(12, Number(mmYYYY[1]))) - 1;
    return {
      mes_referencia: meses[mesIndex],
      ano: Number(mmYYYY[2]),
    };
  }

  const yyyyMM = raw.match(/^(\d{4})-(\d{1,2})/);
  if (yyyyMM) {
    const mesIndex = Math.max(1, Math.min(12, Number(yyyyMM[2]))) - 1;
    return {
      mes_referencia: meses[mesIndex],
      ano: Number(yyyyMM[1]),
    };
  }

  const now = new Date();

  return {
    mes_referencia: meses[now.getMonth()],
    ano: now.getFullYear(),
  };
}

async function findBestTeamMember(base44: any, form: any) {
  try {
    const members = await base44.asServiceRole.entities.TeamMember.list('', 1000);

    const busca = normalizeText([
      form?.nf_emitente_nome,
      form?.nf_emitente_cpf_cnpj,
      form?.descricao_servico,
    ].join(' '));

    let best: any = null;
    let score = 0;

    for (const member of members || []) {
      let localScore = 0;

      const nome = normalizeText(member?.user_name || member?.nome || member?.name);
      const email = normalizeText(member?.user_email || member?.email || member?.email_pessoal);
      const cpf = normalizeText(member?.cpf);
      const cnpj = normalizeText(member?.cnpj);
      const funcao = normalizeText(member?.funcao);

      if (nome && busca.includes(nome)) localScore += 100;
      if (cpf && busca.includes(cpf)) localScore += 80;
      if (cnpj && busca.includes(cnpj)) localScore += 80;
      if (email && busca.includes(email)) localScore += 50;
      if (funcao && busca.includes(funcao)) localScore += 20;

      for (const parte of nome.split(' ').filter((p: string) => p.length >= 3)) {
        if (busca.includes(parte)) localScore += 5;
      }

      if (localScore > score) {
        best = member;
        score = localScore;
      }
    }

    return score >= 30 ? best : null;
  } catch {
    return null;
  }
}

function safeString(value: any) {
  return String(value || '').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { intakeId, form = {} } = body || {};

    if (!intakeId) {
      return Response.json({ success: false, error: 'intakeId obrigatório' }, { status: 400 });
    }

    if (!form?.rubrica_id) {
      return Response.json({ success: false, error: 'Rubrica obrigatória' }, { status: 400 });
    }

    const intake = await base44.asServiceRole.entities.DocumentIntake.get(intakeId);

    if (!intake?.id) {
      return Response.json({ success: false, error: 'DocumentIntake não encontrado' }, { status: 404 });
    }

    const ia = intake?.resultado_ia || {};
    const rubrica = await base44.asServiceRole.entities.Rubrica.get(form.rubrica_id);

    if (!rubrica?.id) {
      return Response.json({ success: false, error: 'Rubrica não encontrada' }, { status: 400 });
    }

    const valor = toNumber(form.nf_valor_total);

    if (valor <= 0) {
      return Response.json({ success: false, error: 'Valor da nota inválido' }, { status: 400 });
    }

    const rubricaNome = getRubricaNome(rubrica);
    const destinoEquipe = isEquipe(form, ia, intake, rubricaNome);

    const arquivoUrl = intake?.arquivo_original_url || intake?.file_url || '';
    const nomeArquivo =
      form?.nome_padronizado_arquivo ||
      form?.nome_arquivo_padronizado ||
      intake?.file_name ||
      intake?.nome_arquivo ||
      `NF ${form?.nf_numero || ''}`;

    let attachment = null;

    try {
      if (arquivoUrl) {
        attachment = await base44.asServiceRole.entities.Attachment.create({
          report_id: '',
          file_name: nomeArquivo,
          file_type: intake?.mime_type || 'application/pdf',
          file_url: arquivoUrl,
          description: 'Entrada Única - Nota Fiscal',
          nf_categoria: 'nota_fiscal',
          nf_numero: safeString(form?.nf_numero),
          nf_valor_total: valor,
          nf_data_emissao: safeString(form?.nf_data_emissao),
          nf_emitente_nome: safeString(form?.nf_emitente_nome),
          nf_emitente_cpf_cnpj: safeString(form?.nf_emitente_cpf_cnpj),
          nf_tipo_documento: intake?.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
          nf_nome_original: intake?.file_name_original || intake?.file_name || '',
          nf_nome_renomeado: nomeArquivo,
          nf_status_leitura: 'lido_com_sucesso',
          nf_revisado: true,
          rubrica_id: form.rubrica_id,
          rubrica_nome: rubricaNome,
        });
      }
    } catch (e: any) {
      console.warn('Attachment não criado:', e?.message);
    }

    if (destinoEquipe) {
      const competencia = parseCompetencia(form?.nf_competencia || ia?.nf_competencia);
      const member = await findBestTeamMember(base44, form);

      const teamPaymentPayload = {
        team_member_id: member?.id || null,
        user_email: member?.user_email || member?.email || member?.email_pessoal || user.email || '',
        user_name: member?.user_name || member?.nome || member?.name || form?.nf_emitente_nome || '',
        funcao: member?.funcao || '',
        role: member?.funcao || '',

        mes_referencia: competencia.mes_referencia,
        ano: competencia.ano,

        rubrica_id: form.rubrica_id,
        rubrica_nome: rubricaNome,

        nota_fiscal_url: arquivoUrl || attachment?.file_url || '',
        nota_fiscal_file_name: nomeArquivo,
        xml_url: safeString(form?.xml_url),
        xml_file_name: safeString(form?.xml_vinculado_nome),

        numero_nf: safeString(form?.nf_numero),
        valor_nf: valor,
        valor_total: valor,
        valor_parcela_previsto: valor,

        nf_numero_extraido: safeString(form?.nf_numero),
        nf_valor_extraido: valor,
        nf_cnpj_emitente: safeString(form?.nf_emitente_cpf_cnpj),
        nf_razao_social: safeString(form?.nf_emitente_nome),
        nf_data_emissao: safeString(form?.nf_data_emissao),
        nf_competencia: safeString(form?.nf_competencia),

        status: 'AGUARDANDO_APROVACAO',
        origem_automatica: true,
        origem: 'Entrada Única',
        tipo_origem: 'NOTA_FISCAL_EQUIPE',
        observacoes: `Entrada Única — NF ${safeString(form?.nf_numero)}. ${safeString(form?.descricao_servico)}`,
        documento_intake_id: intake.id,
        nome_padronizado_arquivo: nomeArquivo,
      };

      const teamPayment = await base44.asServiceRole.entities.TeamPayment.create(teamPaymentPayload);

      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
        entidade_destino: 'TeamPayment',
        entidade_destino_id: teamPayment.id,
        team_payment_id: teamPayment.id,
        status_processamento: 'ENVIADO_PAGAMENTO_EQUIPE',
        nome_padronizado_arquivo: nomeArquivo,
        nome_arquivo_padronizado: nomeArquivo,
        file_name_final: nomeArquivo,
        centro_custo: form?.centro_custo || '',
        rubrica_id_sugerida: form.rubrica_id,
        rubrica_nome_sugerida: rubricaNome,
        revisado_pelo_usuario: true,
        resultado_ia: {
          ...ia,
          ...form,
          destino_fluxo: 'PAGAMENTO_EQUIPE',
          nf_valor_total: valor,
        },
      });

      return Response.json({
        success: true,
        destino: 'equipe',
        entity: 'TeamPayment',
        id: teamPayment.id,
      });
    }

    const purchasePayload = {
      descricao_item: form?.descricao_servico || form?.nf_emitente_nome || `NF ${safeString(form?.nf_numero)}`,
      fornecedor_nome: form?.nf_emitente_nome || '',
      fornecedor_cnpj: form?.nf_emitente_cpf_cnpj || '',
      valor_solicitado: valor,
      valor_total: valor,
      meta_id: form?.meta_id || 'MC3A-20',
      categoria: 'Nota Fiscal',
      tipo_gasto: form?.tipo_gasto || 'Serviço',
      centro_custo: form?.centro_custo || '',
      rubrica_id: form.rubrica_id,
      rubrica_nome: rubricaNome,
      status: 'SOLICITADO',
      observacoes: `Entrada Única — NF ${safeString(form?.nf_numero)}. ${safeString(form?.descricao_servico)}`,
      documento_intake_id: intake.id,
      nf_numero: safeString(form?.nf_numero),
      nf_data_emissao: safeString(form?.nf_data_emissao),
      nf_competencia: safeString(form?.nf_competencia),
      nome_padronizado_arquivo: nomeArquivo,
      nome_arquivo_padronizado: nomeArquivo,
    };

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.create(purchasePayload);

    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
      entidade_destino: 'PurchaseRequest',
      entidade_destino_id: purchase.id,
      status_processamento: 'ENVIADO_APROVACAO',
      nome_padronizado_arquivo: nomeArquivo,
      nome_arquivo_padronizado: nomeArquivo,
      file_name_final: nomeArquivo,
      centro_custo: form?.centro_custo || '',
      rubrica_id_sugerida: form.rubrica_id,
      rubrica_nome_sugerida: rubricaNome,
      revisado_pelo_usuario: true,
      resultado_ia: {
        ...ia,
        ...form,
        destino_fluxo: 'SOLICITACOES',
        nf_valor_total: valor,
      },
    });

    return Response.json({
      success: true,
      destino: 'solicitacoes',
      entity: 'PurchaseRequest',
      id: purchase.id,
    });
  } catch (e: any) {
    console.error('enviarNotaParaAprovacao fatal:', e?.message, e?.stack);

    return Response.json({
      success: false,
      error: e?.message || 'Erro interno ao enviar nota para aprovação',
      stack: e?.stack || null,
    }, { status: 500 });
  }
});
