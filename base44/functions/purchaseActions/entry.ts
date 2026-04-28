import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalize(value: any) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s@.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function computeSaldo(rubrica: any) {
  const total = toNumber(rubrica?.valor_total) || toNumber(rubrica?.valor_rubrica);
  const utilizado = toNumber(rubrica?.valor_utilizado);
  const comprometido = toNumber(rubrica?.saldo_comprometido);
  return total - utilizado - comprometido;
}

function getPurchaseValue(p: any) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_final) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_total) ||
    toNumber(p?.valor_solicitado)
  );
}

function getRubricaNome(rubrica: any, purchase: any) {
  return purchase?.rubrica_nome || rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '';
}

function isEquipePurchase(purchase: any, intake: any) {
  const ia = intake?.resultado_ia || {};

  const raw = [
    purchase?.tipo_gasto,
    purchase?.categoria,
    purchase?.tipo_origem,
    purchase?.tipo_solicitacao,
    purchase?.descricao_item,
    purchase?.observacoes,
    purchase?.rubrica_nome,
    ia?.tipo_gasto,
    ia?.categoria,
    ia?.tipo_solicitacao,
    ia?.classificacao,
    ia?.descricao_servico,
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

function getMemberName(m: any) {
  return m?.user_name || m?.nome || m?.nome_completo || m?.name || m?.full_name || '';
}

function getMemberEmail(m: any) {
  return m?.user_email || m?.email || m?.email_pessoal || '';
}

function scoreMember(member: any, searchText: string) {
  const nome = normalizeText(getMemberName(member));
  const email = normalizeText(getMemberEmail(member));
  const funcao = normalizeText(member?.funcao);
  const cpf = normalizeText(member?.cpf);
  const cnpj = normalizeText(member?.cnpj);

  let score = 0;

  if (nome && searchText.includes(nome)) score += 100;
  if (email && searchText.includes(email)) score += 80;
  if (cpf && searchText.includes(cpf)) score += 70;
  if (cnpj && searchText.includes(cnpj)) score += 70;
  if (funcao && searchText.includes(funcao)) score += 25;

  for (const parte of nome.split(' ').filter((p) => p.length >= 3)) {
    if (searchText.includes(parte)) score += 8;
  }

  return score;
}

async function safeFindDocumentIntake(base44: any, purchaseId: string) {
  try {
    const list = await base44.asServiceRole.entities.DocumentIntake.filter({
      entidade_destino: 'PurchaseRequest',
      entidade_destino_id: purchaseId,
    });

    return list?.[0] || null;
  } catch (e: any) {
    console.warn('DocumentIntake não localizado:', e?.message);
    return null;
  }
}

async function safeFindAttachment(base44: any, nfNumero: string, tipo: string) {
  if (!nfNumero) return null;

  try {
    const list = await base44.asServiceRole.entities.Attachment.filter({
      nf_numero: nfNumero,
      nf_tipo_documento: tipo,
    });

    return list?.[0] || null;
  } catch (e: any) {
    console.warn(`Attachment ${tipo} não localizado:`, e?.message);
    return null;
  }
}

function extractNFNumber(purchase: any, intake: any) {
  const ia = intake?.resultado_ia || {};
  const fromObs = String(purchase?.observacoes || '').match(/NF\s*([A-Za-z0-9./-]+)/i)?.[1];

  return purchase?.nf_numero || ia?.nf_numero || fromObs || '';
}

function buildSearchText(purchase: any, intake: any, attachment: any) {
  const ia = intake?.resultado_ia || {};

  return normalizeText(
    [
      purchase?.descricao_item,
      purchase?.fornecedor_nome,
      purchase?.fornecedor_cnpj,
      purchase?.observacoes,
      purchase?.rubrica_nome,
      intake?.file_name_original,
      intake?.file_name_final,
      intake?.arquivo_original_url,
      attachment?.file_name,
      attachment?.nf_nome_original,
      attachment?.nf_nome_renomeado,
      ia?.nf_emitente_nome,
      ia?.nf_emitente_cpf_cnpj,
      ia?.descricao_servico,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

async function safeFindBestTeamMember(base44: any, searchText: string) {
  try {
    const members = await base44.asServiceRole.entities.TeamMember.list('', 1000);

    let best = null;
    let bestScore = 0;

    for (const member of members || []) {
      const score = scoreMember(member, searchText);

      if (score > bestScore) {
        best = member;
        bestScore = score;
      }
    }

    return bestScore >= 35 ? best : null;
  } catch (e: any) {
    console.warn('Erro ao buscar TeamMember:', e?.message);
    return null;
  }
}

function parseCompetenciaFromPurchase(purchase: any, intake: any) {
  const ia = intake?.resultado_ia || {};
  const raw = String(
    purchase?.nf_competencia ||
      ia?.nf_competencia ||
      ia?.competencia ||
      ''
  ).trim();

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

async function ensureTeamPaymentFromNF(
  base44: any,
  purchase: any,
  purchaseId: string,
  rubrica: any,
  valor: number,
  userEmail: string
) {
  try {
    const existing = await base44.asServiceRole.entities.TeamPayment.filter({
      purchase_request_id: purchaseId,
    });

    if (existing?.length > 0) return existing[0];
  } catch (e: any) {
    console.warn('Não foi possível verificar TeamPayment existente:', e?.message);
  }

  const intake = await safeFindDocumentIntake(base44, purchaseId);
  const nfNumero = extractNFNumber(purchase, intake);
  const attachment = await safeFindAttachment(base44, nfNumero, 'pdf_nf');
  const xml = await safeFindAttachment(base44, nfNumero, 'xml_nf');
  const searchText = buildSearchText(purchase, intake, attachment);
  const member = await safeFindBestTeamMember(base44, searchText);
  const ia = intake?.resultado_ia || {};
  const competencia = parseCompetenciaFromPurchase(purchase, intake);
  const rubricaNome = getRubricaNome(rubrica, purchase);

  const payloadSeguro = {
    purchase_request_id: purchaseId,
    documento_intake_id: intake?.id || null,

    team_member_id: member?.id || null,
    user_name: getMemberName(member) || purchase?.fornecedor_nome || ia?.nf_emitente_nome || '',
    user_email: getMemberEmail(member) || '',
    funcao: member?.funcao || '',
    role: member?.funcao || '',

    mes_referencia: competencia.mes_referencia,
    ano: competencia.ano,

    numero_nf: nfNumero,
    valor_nf: valor,
    valor_total: valor,
    valor_parcela_previsto: valor,

    nota_fiscal_url: attachment?.file_url || intake?.arquivo_original_url || intake?.file_url || '',
    nota_fiscal_file_name:
      attachment?.file_name ||
      intake?.nome_padronizado_arquivo ||
      intake?.file_name_final ||
      intake?.file_name ||
      '',

    xml_url: xml?.file_url || '',
    xml_file_name: xml?.file_name || '',

    nf_numero_extraido: nfNumero,
    nf_valor_extraido: valor,
    nf_cnpj_emitente: purchase?.fornecedor_cnpj || ia?.nf_emitente_cpf_cnpj || '',
    nf_razao_social: purchase?.fornecedor_nome || ia?.nf_emitente_nome || '',
    nf_data_emissao: purchase?.nf_data_emissao || ia?.nf_data_emissao || '',
    nf_competencia: purchase?.nf_competencia || ia?.nf_competencia || '',

    rubrica_id: purchase.rubrica_id,
    rubrica_nome: rubricaNome,

    status: 'APROVADO_COORD',
    origem_automatica: true,
    origem: 'Aprovação de Solicitação',
    tipo_origem: 'PURCHASE_APPROVAL_NF',
    criado_por_aprovacao_nf: true,
    aprovado_por: userEmail,
    aprovado_em: new Date().toISOString(),

    observacoes: member
      ? `Pagamento criado automaticamente pela aprovação da NF ${nfNumero}. Membro identificado: ${getMemberName(member)}.`
      : `Pagamento criado automaticamente pela aprovação da NF ${nfNumero}. Atenção: membro da equipe não identificado automaticamente.`,
  };

  return await base44.asServiceRole.entities.TeamPayment.create(payloadSeguro);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, purchaseId, comentario } = body || {};

    if (!purchaseId) {
      return Response.json({ success: false, error: 'purchaseId obrigatório' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json({ success: false, error: 'Compra não encontrada' }, { status: 404 });
    }

    const valor = getPurchaseValue(purchase);

    if (valor <= 0) {
      return Response.json({
        success: false,
        error: 'Valor inválido',
        debug: { valor, purchaseId },
      }, { status: 400 });
    }

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id)
      : null;

    if (!rubrica) {
      return Response.json({
        success: false,
        error: 'Compra sem rubrica',
        debug: { purchaseId, rubrica_id: purchase?.rubrica_id },
      }, { status: 400 });
    }

    const saldo = computeSaldo(rubrica);

    if (action === 'approve_coord' || action === 'aprovar' || action === 'approve') {
      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({
          success: false,
          error: 'Status inválido para aprovação',
          debug: { status: purchase.status },
        }, { status: 400 });
      }

      if (saldo < valor) {
        return Response.json({
          success: false,
          error: 'Saldo insuficiente',
          debug: { saldo, valor },
        }, { status: 400 });
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        saldo_comprometido: toNumber(rubrica?.saldo_comprometido) + valor,
      });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD',
        valor_aprovado: valor,
        comentario_aprovacao: comentario || null,
        approved_by: user.email,
        approved_at: new Date().toISOString(),
      });

      let teamPayment = null;
      let teamPaymentWarning = null;
      const intake = await safeFindDocumentIntake(base44, purchaseId);
      const deveCriarTeamPayment = isEquipePurchase(purchase, intake);

      if (deveCriarTeamPayment) {
        try {
          teamPayment = await ensureTeamPaymentFromNF(
            base44,
            purchase,
            purchaseId,
            rubrica,
            valor,
            user.email
          );
        } catch (e: any) {
          teamPaymentWarning = e?.message || 'Falha ao criar TeamPayment automático';
          console.warn('TeamPayment automático falhou sem bloquear aprovação:', teamPaymentWarning);
        }
      }

      try {
        if (intake?.id) {
          await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'APROVADO',
            team_payment_id: teamPayment?.id || intake?.team_payment_id || null,
          });
        }
      } catch (e: any) {
        console.warn('Erro ao atualizar DocumentIntake sem bloquear aprovação:', e?.message);
      }

      return Response.json({
        success: true,
        message: 'Compra aprovada com sucesso',
        team_payment_id: teamPayment?.id || null,
        team_payment_created: !!teamPayment?.id,
        team_payment_warning: teamPaymentWarning,
      });
    }

    if (action === 'devolver' || action === 'reject' || action === 'rejeitar') {
      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({
          success: false,
          error: 'Só é possível devolver solicitações pendentes',
          debug: { status: purchase.status },
        }, { status: 400 });
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'DEVOLVIDO',
        comentario_devolucao: comentario || null,
        devolvido_por: user.email,
        devolvido_em: new Date().toISOString(),
      });

      try {
        const intake = await safeFindDocumentIntake(base44, purchaseId);
        if (intake?.id) {
          await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'DEVOLVIDO',
            comentario_devolucao: comentario || null,
          });
        }
      } catch (e: any) {
        console.warn('Erro ao atualizar DocumentIntake na devolução:', e?.message);
      }

      return Response.json({
        success: true,
        message: 'Solicitação devolvida com sucesso',
      });
    }

    if (action === 'mark_paid') {
      if (normalize(purchase.status) !== 'aprovado_coord') {
        return Response.json({
          success: false,
          error: 'Precisa estar aprovado para pagar',
          debug: { status: purchase.status },
        }, { status: 400 });
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
        saldo_comprometido: Math.max(0, toNumber(rubrica?.saldo_comprometido) - valor),
      });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        valor_pago: valor,
        pago_por: user.email,
        pago_em: new Date().toISOString(),
      });

      return Response.json({
        success: true,
        message: 'Pagamento realizado com sucesso',
      });
    }

    return Response.json({
      success: false,
      error: 'Ação inválida',
      debug: { action },
    }, { status: 400 });
  } catch (e: any) {
    console.error('purchaseActions fatal:', e?.message, e?.stack);

    return Response.json({
      success: false,
      error: e?.message || 'Erro interno em purchaseActions',
      stack: e?.stack || null,
    }, { status: 500 });
  }
});
