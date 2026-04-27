import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeString(value) {
  return String(value || '').trim();
}

function toNumber(v) {
  return Number(v) || 0;
}

/**
 * Cria TeamPayment com proteção contra duplicação por clique duplo.
 * 
 * IDEMPOTÊNCIA:
 * - Busca por unique_key antes de criar
 * - Se existe com mesmo unique_key, retorna o existente
 * - Se não existe, cria novo
 * - Nunca duplica pela mesma requisição
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { error: 'Não autenticado.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Campos obrigatórios
    const user_email = normalizeEmail(body?.user_email || '');
    const mes_referencia = normalizeString(body?.mes_referencia || '');
    const ano = Number(body?.ano) || 0;
    const numero_nf = normalizeString(body?.numero_nf || '');

    if (!user_email || !mes_referencia || !ano) {
      return Response.json(
        { error: 'Parâmetros obrigatórios ausentes' },
        { status: 400 }
      );
    }

    // UNIQUE_KEY para idempotência
    const unique_key = `${user_email}_${mes_referencia}_${ano}`;

    // 1. BUSCAR SE JÁ EXISTE COM MESMO unique_key
    let existingPayments = [];
    try {
      existingPayments = await base44.asServiceRole.entities.TeamPayment.filter({
        user_email: user_email,
        mes_referencia: mes_referencia,
        ano: ano
      });
    } catch (filterErr) {
      console.error('Erro ao filtrar TeamPayment:', filterErr);
      existingPayments = [];
    }

    if (!Array.isArray(existingPayments)) {
      existingPayments = [];
    }

    // 2. VALIDAR: NÃO DEVE HAVER PAGAMENTO ATIVO
    const activePayments = existingPayments.filter((p) => {
      const status = normalizeString(p?.status || '').toUpperCase();
      return ['PAGO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'].includes(status);
    });

    if (activePayments.length > 0) {
      return Response.json(
        {
          error: `Já existe um pagamento ativo para esta competência (${mes_referencia}/${ano}).`,
          existing_payment_id: activePayments[0]?.id || null,
          existing_payment_status: activePayments[0]?.status || null
        },
        { status: 409 } // Conflict
      );
    }

    // 3. CRIAR NOVO PAGAMENTO
    const payload = {
      team_member_id: normalizeString(body?.team_member_id || ''),
      user_email: user_email,
      user_name: normalizeString(body?.user_name || ''),
      funcao: normalizeString(body?.funcao || ''),
      role: normalizeString(body?.role || ''),
      mes_referencia: mes_referencia,
      ano: ano,
      numero_nf: numero_nf,
      valor_nf: toNumber(body?.valor_nf || 0),
      valor_parcela_previsto: toNumber(body?.valor_parcela_previsto || 0),
      numero_parcela: toNumber(body?.numero_parcela || 1),
      nota_fiscal_url: normalizeString(body?.nota_fiscal_url || ''),
      xml_url: normalizeString(body?.xml_url || ''),
      nota_fiscal_file_name: normalizeString(body?.nota_fiscal_file_name || ''),
      xml_file_name: normalizeString(body?.xml_file_name || ''),
      descricao_nf_modelo: normalizeString(body?.descricao_nf_modelo || ''),
      analysis_status: normalizeString(body?.analysis_status || 'ANALISADO'),
      analysis_summary: normalizeString(body?.analysis_summary || ''),
      analysis_warnings: normalizeString(body?.analysis_warnings || '[]'),
      analysis_critical_issues: normalizeString(body?.analysis_critical_issues || '[]'),
      resultado_validacao: normalizeString(body?.resultado_validacao || '{}'),
      status: 'AGUARDANDO_APROVACAO',
      rubrica_id: normalizeString(body?.rubrica_id || ''),
      rubrica_nome: normalizeString(body?.rubrica_nome || ''),
      unique_key: unique_key
    };

    // Validar campos críticos
    if (!payload.rubrica_id) {
      return Response.json(
        { error: 'Rubrica obrigatória para criar pagamento' },
        { status: 400 }
      );
    }

    if (payload.valor_nf <= 0) {
      return Response.json(
        { error: 'Valor deve ser maior que zero' },
        { status: 400 }
      );
    }

    let created;
    try {
      created = await base44.asServiceRole.entities.TeamPayment.create(payload);
    } catch (createErr) {
      console.error('Erro ao criar TeamPayment:', createErr);

      // Se falhar por chave única duplicada, retornar existente
      if (createErr?.message?.includes('unique') || createErr?.message?.includes('duplicate')) {
        const retryExisting = await base44.asServiceRole.entities.TeamPayment.filter({
          user_email: user_email,
          mes_referencia: mes_referencia,
          ano: ano
        });

        const latest = retryExisting?.sort((a, b) =>
          new Date(b?.created_date || b?.created_at || 0).getTime() -
          new Date(a?.created_date || a?.created_at || 0).getTime()
        )[0];

        if (latest) {
          return Response.json({
            ok: true,
            message: 'Pagamento já existe (criação idempotente)',
            payment_id: latest.id,
            is_existing: true,
            created_date: latest.created_date || latest.created_at
          });
        }
      }

      throw createErr;
    }

    // REGISTRAR AUDITORIA
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'CREATE',
        entity_type: 'TEAM_PAYMENT',
        entity_id: created?.id || 'N/A',
        actor_email: user.email,
        actor_name: user.full_name || user.name || '',
        previous_status: null,
        new_status: 'AGUARDANDO_APROVACAO',
        details: `Pagamento criado. Competência: ${mes_referencia}/${ano}, NF: ${numero_nf}, Valor: R$ ${payload.valor_nf.toFixed(2)}, Rubrica: ${payload.rubrica_nome}`,
        created_at: new Date().toISOString()
      });
    } catch (auditErr) {
      console.error('Erro ao registrar auditoria:', auditErr);
    }

    return Response.json({
      ok: true,
      message: 'Pagamento criado com sucesso',
      payment_id: created?.id || null,
      is_existing: false,
      created_date: created?.created_date || created?.created_at || null
    });
  } catch (e) {
    console.error('createTeamPaymentIdempotent error:', e);
    return Response.json(
      {
        error: e?.message || 'Erro interno ao criar pagamento'
      },
      { status: 500 }
    );
  }
});