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

    // Campos obrigatórios para checar duplicação
    const user_email = normalizeEmail(body?.user_email || user?.email || '');
    const mes_referencia = normalizeString(body?.mes_referencia || '');
    const ano = Number(body?.ano) || 0;
    const numero_nf = normalizeString(body?.numero_nf || '');

    if (!user_email || !mes_referencia || !ano || !numero_nf) {
      return Response.json(
        {
          error: 'Parâmetros obrigatórios ausentes',
          debug: {
            user_email,
            mes_referencia,
            ano,
            numero_nf
          }
        },
        { status: 400 }
      );
    }

    // BUSCAR EXISTENTES COM MESMO user_email + mês + ano
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

    // FILTRAR APENAS OS ATIVOS (com status que importam)
    const activePayments = existingPayments.filter((p) => {
      const status = normalizeString(p?.status || '').toUpperCase();
      return ['PAGO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'].includes(status);
    });

    // SE NÃO HÁ PAGAMENTO ATIVO COM MESMO MÊS/ANO, É SEGURO CRIAR
    if (activePayments.length === 0) {
      return Response.json({
        ok: true,
        can_create: true,
        message: 'Nenhum pagamento duplicado detectado. Seguro criar.',
        existing_count: existingPayments.length,
        active_count: 0
      });
    }

    // EXISTE PAGAMENTO ATIVO → BUSCAR O MELHOR EXISTENTE PARA ANEXAR DOCUMENTO
    // (ordenar por valor, depois por data)
    const bestExisting = activePayments.sort((a, b) => {
      const va = toNumber(a?.valor_nf || a?.valor_parcela_previsto || 0);
      const vb = toNumber(b?.valor_nf || b?.valor_parcela_previsto || 0);

      if (vb !== va) return vb - va;

      const dataA = new Date(a?.created_date || a?.created_at || 0).getTime();
      const dataB = new Date(b?.created_date || b?.created_at || 0).getTime();
      return dataB - dataA;
    })[0];

    // REGISTRAR TENTATIVA DE DUPLICAÇÃO NA AUDITORIA
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'CREATE',
        entity_type: 'TEAM_PAYMENT',
        entity_id: bestExisting?.id || 'N/A',
        actor_email: user.email,
        actor_name: user.full_name || user.name || '',
        previous_status: null,
        new_status: 'DUPLICACAO_BLOQUEADA',
        details: `Tentativa de criar pagamento duplicado bloqueada. User: ${user_email}, Mês: ${mes_referencia}/${ano}, NF: ${numero_nf}. Pagamento existente: ${bestExisting?.id || 'N/A'} (Status: ${bestExisting?.status || '?'})`,
        created_at: new Date().toISOString()
      });
    } catch (auditErr) {
      console.error('Erro ao registrar auditoria:', auditErr);
    }

    // REJEITAR CRIAÇÃO, MAS INDICAR ONDE ANEXAR DOCUMENTO
    return Response.json(
      {
        ok: false,
        can_create: false,
        error: `Já existe um pagamento registrado para esta nota fiscal neste período (${mes_referencia}/${ano}).`,
        message: 'Anexe o documento (PDF/XML) ao pagamento existente em vez de criar um novo.',
        existing_payment: {
          id: bestExisting?.id || null,
          numero_nf: bestExisting?.numero_nf || null,
          valor_nf: toNumber(bestExisting?.valor_nf || bestExisting?.valor_parcela_previsto || 0),
          status: bestExisting?.status || null,
          created_date: bestExisting?.created_date || bestExisting?.created_at || null,
          nota_fiscal_url: bestExisting?.nota_fiscal_url || null,
          xml_url: bestExisting?.xml_url || null
        },
        existing_count: existingPayments.length,
        active_count: activePayments.length
      },
      { status: 409 } // Conflict
    );
  } catch (e) {
    console.error('checkTeamPaymentDuplication error:', e);
    return Response.json(
      {
        error: e?.message || 'Erro interno ao verificar duplicação'
      },
      { status: 500 }
    );
  }
});