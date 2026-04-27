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
  const total =
    toNumber(rubrica?.valor_total) ||
    toNumber(rubrica?.valor_rubrica);

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

function isNotaFiscalPurchase(purchase: any, intake: any) {
  const categoria = normalizeText(purchase?.categoria);
  const obs = normalizeText(purchase?.observacoes);
  const tipoDetectado = normalizeText(intake?.tipo_detectado);
  const ia = intake?.resultado_ia || {};

  return (
    categoria.includes('nota fiscal') ||
    obs.includes('nf ') ||
    obs.includes('nota fiscal') ||
    tipoDetectado.includes('nota_fiscal') ||
    !!ia?.nf_numero
  );
}

function getIA(intake: any) {
  return intake?.resultado_ia || {};
}

function getNFNumero(purchase: any, intake: any) {
  const ia = getIA(intake);

  return (
    purchase?.nf_numero ||
    ia?.nf_numero ||
    String(purchase?.observacoes || '').match(/NF\s*([A-Za-z0-9./-]+)/i)?.[1] ||
    ''
  );
}

function getNFDataEmissao(intake: any) {
  const ia = getIA(intake);

  return (
    ia?.nf_data_emissao ||
    ia?.data_emissao ||
    ia?.dataEmissao ||
    ia?.emissao ||
    ''
  );
}

function getCompetencia(intake: any) {
  const ia = getIA(intake);

  return (
    ia?.competencia ||
    ia?.competencia_sugerida ||
    ''
  );
}

function parseAnoCompetencia(competencia: any) {
  const txt = String(competencia || '');

  const anoMatch = txt.match(/20\d{2}/);
  if (anoMatch) return Number(anoMatch[0]);

  return new Date().getFullYear();
}

function parseMesCompetencia(competencia: any, dataEmissao: any) {
  const txt = normalizeText(competencia);

  const meses: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    março: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };

  for (const [nome, mes] of Object.entries(meses)) {
    if (txt.includes(nome)) return mes;
  }

  const numeric = txt.match(/\b(0?[1-9]|1[0-2])\b/);
  if (numeric) return Number(numeric[1]);

  const data = String(dataEmissao || '');
  const dataMatch = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dataMatch) return Number(dataMatch[2]);

  return new Date().getMonth() + 1;
}

function getFileSearchText(purchase: any, intake: any, attachment: any) {
  const ia = getIA(intake);

  return normalizeText([
    purchase?.descricao_item,
    purchase?.fornecedor_nome,
    purchase?.observacoes,
    purchase?.rubrica_nome,
    intake?.file_name_final,
    intake?.file_name_original,
    intake?.arquivo_original_url,
    attachment?.file_name,
    attachment?.nf_nome_original,
    attachment?.nf_nome_renomeado,
    ia?.nf_emitente_nome,
    ia?.descricao_servico,
  ].filter(Boolean).join(' '));
}

function getMemberName(member: any) {
  return (
    member?.user_name ||
    member?.nome ||
    member?.nome_completo ||
    member?.name ||
    member?.full_name ||
    ''
  );
}

function getMemberEmail(member: any) {
  return (
    member?.user_email ||
    member?.email ||
    member?.email_pessoal ||
    ''
  );
}

function scoreMemberMatch(member: any, haystack: string) {
  const name = normalizeText(getMemberName(member));
  const email = normalizeText(getMemberEmail(member));
  const funcao = normalizeText(member?.funcao);
  const cpf = normalizeText(member?.cpf);
  const cnpj = normalizeText(member?.cnpj);

  let score = 0;

  if (name && haystack.includes(name)) score += 100;
  if (email && haystack.includes(email)) score += 80;
  if (funcao && haystack.includes(funcao)) score += 25;
  if (cpf && haystack.includes(cpf)) score += 40;
  if (cnpj && haystack.includes(cnpj)) score += 40;

  const nameParts = name.split(' ').filter((p) => p.length >= 3);
  for (const part of nameParts) {
    if (haystack.includes(part)) score += 8;
  }

  return score;
}

async function findLinkedDocumentIntake(base44: any, purchaseId: string) {
  const intakes = await base44.asServiceRole.entities.DocumentIntake.filter({
    entidade_destino: 'PurchaseRequest',
    entidade_destino_id: purchaseId,
  });

  return intakes && intakes.length > 0 ? intakes[0] : null;
}

async function findLinkedAttachment(base44: any, intake: any, nfNumero: string) {
  if (intake?.entidade_destino_id) {
    try {
      const byId = await base44.asServiceRole.entities.Attachment.get(intake.entidade_destino_id);
      if (byId) return byId;
    } catch (_) {}
  }

  if (nfNumero) {
    const attachments = await base44.asServiceRole.entities.Attachment.filter({
      nf_numero: nfNumero,
      nf_tipo_documento: 'pdf_nf',
    });

    if (attachments && attachments.length > 0) return attachments[0];
  }

  return null;
}

async function findXmlAttachment(base44: any, nfNumero: string) {
  if (!nfNumero) return null;

  const xmls = await base44.asServiceRole.entities.Attachment.filter({
    nf_numero: nfNumero,
    nf_tipo_documento: 'xml_nf',
  });

  return xmls && xmls.length > 0 ? xmls[0] : null;
}

async function findTeamMember(base44: any, searchText: string) {
  const members = await base44.asServiceRole.entities.TeamMember.list('', 1000);

  let best: any = null;
  let bestScore = 0;

  for (const member of members || []) {
    const score = scoreMemberMatch(member, searchText);

    if (score > bestScore) {
      best = member;
      bestScore = score;
    }
  }

  return bestScore >= 35 ? best : null;
}

async function findExistingTeamPayment(base44: any, purchaseId: string, nfNumero: string, rubricaId: string) {
  const byPurchase = await base44.asServiceRole.entities.TeamPayment.filter({
    purchase_request_id: purchaseId,
  });

  if (byPurchase && byPurchase.length > 0) return byPurchase[0];

  if (nfNumero) {
    const byNF = await base44.asServiceRole.entities.TeamPayment.filter({
      numero_nf: nfNumero,
      rubrica_id: rubricaId,
    });

    if (byNF && byNF.length > 0) return byNF[0];
  }

  return null;
}

async function ensureTeamPaymentFromNF(base44: any, purchase: any, purchaseId: string, rubrica: any, valor: number, userEmail: string) {
  const intake = await findLinkedDocumentIntake(base44, purchaseId);

  if (!isNotaFiscalPurchase(purchase, intake)) {
    return null;
  }

  const nfNumero = getNFNumero(purchase, intake);
  const dataEmissao = getNFDataEmissao(intake);
  const competencia = getCompetencia(intake);
  const mesReferencia = parseMesCompetencia(competencia, dataEmissao);
  const ano = parseAnoCompetencia(competencia);

  const existing = await findExistingTeamPayment(base44, purchaseId, nfNumero, purchase.rubrica_id);

  if (existing) {
    return existing;
  }

  const attachment = await findLinkedAttachment(base44, intake, nfNumero);
  const xml = await findXmlAttachment(base44, nfNumero);

  const searchText = getFileSearchText(purchase, intake, attachment);
  const member = await findTeamMember(base44, searchText);

  const ia = getIA(intake);

  const payload = {
    purchase_request_id: purchaseId,
    document_intake_id: intake?.id || null,
    attachment_id: attachment?.id || null,

    user_email: getMemberEmail(member) || '',
    user_name: getMemberName(member) || purchase?.fornecedor_nome || ia?.nf_emitente_nome || '',
    team_member_id: member?.id || null,
    funcao: member?.funcao || '',

    mes_referencia: mesReferencia,
    ano,

    numero_nf: nfNumero,
    valor_nf: valor,
    nota_fiscal_url: attachment?.file_url || intake?.arquivo_original_url || '',
    xml_url: xml?.file_url || '',
    nf_attachment_id: attachment?.id || null,
    xml_attachment_id: xml?.id || null,
    nf_data_emissao: dataEmissao,

    rubrica_id: purchase.rubrica_id,
    rubrica_nome: purchase.rubrica_nome || rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '',

    centro_custo: purchase.centro_custo || '',
    status: 'APROVADO_COORD',

    origem: 'NF_APROVADA_COMPRA',
    origem_automatica: true,
    criado_por_aprovacao_nf: true,
    aprovado_por: userEmail,
    aprovado_em: new Date().toISOString(),

    observacoes: `Pagamento criado automaticamente a partir da aprovação da NF ${nfNumero || 'sem número'} vinculada à compra ${purchaseId}.`,
  };

  return await base44.asServiceRole.entities.TeamPayment.create(payload);
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
      return Response.json({
        error: 'Valor inválido',
        debug: { valor }
      }, { status: 400 });
    }

    const rubrica = purchase?.rubrica_id
      ? await base44.asServiceRole.entities.Rubrica.get(purchase.rubrica_id)
      : null;

    if (!rubrica) {
      return Response.json({
        error: 'Compra sem rubrica vinculada',
        debug: {
          purchase_id: purchaseId,
          rubrica_id: purchase?.rubrica_id
        }
      }, { status: 400 });
    }

    const saldo = computeSaldo(rubrica);

    /* =========================
       APROVAR
    ========================= */
    if (action === 'approve_coord' || action === 'aprovar') {

      if (normalize(purchase.status) !== 'solicitado') {
        return Response.json({
          error: 'Status inválido',
          debug: { status: purchase.status }
        }, { status: 400 });
      }

      if (saldo < valor) {
        return Response.json({
          error: 'Saldo insuficiente',
          debug: {
            rubrica: rubrica?.nome,
            saldo,
            valor
          }
        }, { status: 400 });
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

      let teamPaymentCriado = null;
      let teamPaymentErro = null;

      try {
        teamPaymentCriado = await ensureTeamPaymentFromNF(
          base44,
          purchase,
          purchaseId,
          rubrica,
          valor,
          user.email
        );
      } catch (e: any) {
        teamPaymentErro = e?.message || 'Erro ao criar TeamPayment automático';
        console.warn('Aviso: não foi possível criar TeamPayment automático:', teamPaymentErro);
      }

      try {
        const intakes = await base44.asServiceRole.entities.DocumentIntake.filter({
          entidade_destino: 'PurchaseRequest',
          entidade_destino_id: purchaseId,
        });

        if (intakes && intakes.length > 0) {
          await base44.asServiceRole.entities.DocumentIntake.update(intakes[0].id, {
            status_processamento: 'APROVADO',
            team_payment_id: teamPaymentCriado?.id || intakes[0]?.team_payment_id || null,
          });
        }
      } catch (e: any) {
        console.warn('Aviso: não foi possível atualizar DocumentIntake:', e?.message);
      }

      return Response.json({
        success: true,
        message: 'Compra aprovada com sucesso',
        team_payment_id: teamPaymentCriado?.id || null,
        team_payment_warning: teamPaymentErro,
      });
    }

    /* =========================
       PAGAR
    ========================= */
    if (action === 'mark_paid') {

      if (normalize(purchase.status) !== 'aprovado_coord') {
        return Response.json({
          error: 'Compra precisa estar aprovada',
          debug: { status: purchase.status }
        }, { status: 400 });
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
        message: 'Pagamento realizado com sucesso'
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
