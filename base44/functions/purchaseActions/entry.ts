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
    toNumber(p?.valor_solicitado)
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

async function findDocumentIntake(base44: any, purchaseId: string) {
  const list = await base44.asServiceRole.entities.DocumentIntake.filter({
    entidade_destino: 'PurchaseRequest',
    entidade_destino_id: purchaseId,
  });

  return list?.[0] || null;
}

async function findAttachment(base44: any, nfNumero: string) {
  if (!nfNumero) return null;

  const list = await base44.asServiceRole.entities.Attachment.filter({
    nf_numero: nfNumero,
    nf_tipo_documento: 'pdf_nf',
  });

  return list?.[0] || null;
}

async function findXml(base44: any, nfNumero: string) {
  if (!nfNumero) return null;

  const list = await base44.asServiceRole.entities.Attachment.filter({
    nf_numero: nfNumero,
    nf_tipo_documento: 'xml_nf',
  });

  return list?.[0] || null;
}

function extractNFNumber(purchase: any, intake: any) {
  const ia = intake?.resultado_ia || {};
  const fromObs = String(purchase?.observacoes || '').match(/NF\s*([A-Za-z0-9./-]+)/i)?.[1];

  return purchase?.nf_numero || ia?.nf_numero || fromObs || '';
}

function buildSearchText(purchase: any, intake: any, attachment: any) {
  const ia = intake?.resultado_ia || {};

  return normalizeText([
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
  ].filter(Boolean).join(' '));
}

async function findBestTeamMember(base44: any, searchText: string) {
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
}

async function ensureTeamPaymentFromNF(
  base44: any,
  purchase: any,
  purchaseId: string,
  rubrica: any,
  valor: number,
  userEmail: string
) {
  const existing = await base44.asServiceRole.entities.TeamPayment.filter({
    purchase_request_id: purchaseId,
  });

  if (existing?.length > 0) return existing[0];

  const intake = await findDocumentIntake(base44, purchaseId);
  const nfNumero = extractNFNumber(purchase, intake);
  const attachment = await findAttachment(base44, nfNumero);
  const xml = await findXml(base44, nfNumero);

  const searchText = buildSearchText(purchase, intake, attachment);
  const member = await findBestTeamMember(base44, searchText);

  const ia = intake?.resultado_ia || {};

  const created = await base44.asServiceRole.entities.TeamPayment.create({
    purchase_request_id: purchaseId,
    document_intake_id: intake?.id || null,
    attachment_id: attachment?.id || null,
    nf_attachment_id: attachment?.id || null,
    xml_attachment_id: xml?.id || null,

    team_member_id: member?.id || null,
    user_name: getMemberName(member) || purchase?.fornecedor_nome || ia?.nf_emitente_nome || '',
    user_email: getMemberEmail(member) || '',
    funcao: member?.funcao || '',

    numero_nf: nfNumero,
    valor_nf: valor,
    nota_fiscal_url: attachment?.file_url || intake?.arquivo_original_url || '',
    xml_url: xml?.file_url || '',

    rubrica_id: purchase.rubrica_id,
    rubrica_nome: purchase.rubrica_nome || rubrica?.rubrica || rubrica?.nome || '',

    status: 'APROVADO_COORD',
    origem: 'NF_APROVADA_COMPRA',
    origem_automatica: true,
    criado_por_aprovacao_nf: true,
    aprovado_por: userEmail,
    aprovado_em: new Date().toISOString(),

    match_equipe_automatico: !!member,
    match_equipe_score_origem: searchText ? 'nome_arquivo_nf_fornecedor_funcao_cpf_cnpj' : '',
    observacoes: member
      ? `Pagamento criado automaticamente pela aprovação da NF ${nfNumero}. Membro identificado: ${getMemberName(member)}.`
      : `Pagamento criado automaticamente pela aprovação da NF ${nfNumero}. Atenção: membro da equipe não identificado automaticamente.`,
  });

  return created;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, purchaseId, comentario } = await req.json();

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const valor = getPurchaseValue(purchase);

    if (valor <= 0) {
      return Response.json({ error: 'Valor inválido' }, { status: 400 });
    }

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id)
      : null;

    if (!rubrica) {
      return Response.json({ error: 'Compra sem rubrica' }, { status: 400 });
    }

    const saldo = computeSaldo(rubrica);

    if (action === 'approve_coord' || action === 'aprovar') {
      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({ error: 'Status inválido' }, { status: 400 });
      }

      if (saldo < valor) {
        return Response.json({ error: 'Saldo insuficiente' }, { status: 400 });
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        saldo_comprometido: toNumber(rubrica?.saldo_comprometido) + valor
      });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD',
        valor_aprovado: valor,
        comentario_aprovacao: comentario || null,
        approved_by: user.email,
        approved_at: new Date().toISOString()
      });

      let teamPayment = null;
      let teamPaymentWarning = null;

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
        console.warn('Erro TeamPayment:', teamPaymentWarning);
      }

      try {
        const intake = await findDocumentIntake(base44, purchaseId);
        if (intake?.id) {
          await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'APROVADO',
            team_payment_id: teamPayment?.id || intake?.team_payment_id || null,
          });
        }
      } catch (e: any) {
        console.warn('Erro ao atualizar DocumentIntake:', e?.message);
      }

      return Response.json({
        success: true,
        message: 'Compra aprovada com sucesso',
        team_payment_id: teamPayment?.id || null,
        team_payment_warning: teamPaymentWarning,
      });
    }

    if (action === 'reject' || action === 'rejeitar') {
      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({
          error: 'Só é possível recusar solicitações pendentes'
        }, { status: 400 });
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'RECUSADO',
        comentario_recusa: comentario || null,
        rejected_by: user.email,
        rejected_at: new Date().toISOString()
      });

      return Response.json({
        success: true,
        message: 'Solicitação recusada com sucesso'
      });
    }

    if (action === 'mark_paid') {
      if (normalize(purchase.status) !== 'aprovado_coord') {
        return Response.json({ error: 'Precisa estar aprovado' }, { status: 400 });
      }

      await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
        saldo_comprometido: Math.max(0, toNumber(rubrica?.saldo_comprometido) - valor)
      });

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        valor_pago: valor,
        pago_por: user.email,
        pago_em: new Date().toISOString()
      });

      return Response.json({
        success: true,
        message: 'Pagamento realizado'
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (e: any) {
    return Response.json({
      error: e?.message,
      stack: e?.stack
    }, { status: 500 });
  }
});
