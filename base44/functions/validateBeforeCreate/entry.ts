import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================================
// VALIDAÇÃO PRÉ-CRIAÇÃO — Bloqueia duplicação e dados inválidos
// ============================================================================

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(v) {
  return Number(v) || 0;
}

function validateStatusTransition(oldStatus, newStatus, entityType) {
  const validTransitions = {
    TeamPayment: {
      'RASCUNHO': ['AGUARDANDO_APROVACAO', 'RASCUNHO'],
      'AGUARDANDO_APROVACAO': ['RASCUNHO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'],
      'APROVADO_COORD': ['PAGO', 'AGUARDANDO_APROVACAO', 'APROVADO_COORD'],
      'PAGO': ['PAGO'],
      'REJEITADO': ['RASCUNHO']
    },
    PurchaseRequest: {
      'RASCUNHO': ['ENVIADO', 'RASCUNHO'],
      'ENVIADO': ['RASCUNHO', 'APROVADO', 'ENVIADO'],
      'APROVADO': ['PAGAMENTO_FEITO', 'APROVADO'],
      'PAGAMENTO_FEITO': ['PAGAMENTO_FEITO'],
      'REJEITADO': ['RASCUNHO']
    }
  };

  const transitions = validTransitions[entityType];
  if (!transitions) return true;
  const allowed = transitions[oldStatus] || [];
  return allowed.includes(newStatus);
}

function validatePermission(user, action) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'coordenador' && ['review_report', 'approve_purchase'].includes(action)) return true;
  return false;
}

function validateRequiredFields(data, requiredFields) {
  const missing = [];
  requiredFields.forEach((field) => {
    if (data[field] === undefined || data[field] === null || String(data[field]).trim() === '') {
      missing.push(field);
    }
  });
  return missing.length === 0 ? null : missing;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { entity_type, data } = body;

    // ========== VALIDAÇÃO 1: Campos Obrigatórios ==========
    const requiredFields = {
      TeamPayment: ['user_email', 'mes_referencia', 'ano', 'valor_nf'],
      PurchaseRequest: ['titulo', 'valor', 'rubrica_id'],
      DocumentIntake: ['user_email', 'arquivo_original_url', 'file_name_original'],
      Report: ['author_name', 'museu', 'mes_referencia', 'ano']
    };

    const required = requiredFields[entity_type];
    if (required) {
      const missing = validateRequiredFields(data, required);
      if (missing) {
        return Response.json(
          {
            ok: false,
            error: 'VALIDATION_ERROR',
            message: `Campos obrigatórios faltando: ${missing.join(', ')}`,
            missing_fields: missing
          },
          { status: 400 }
        );
      }
    }

    // ========== VALIDAÇÃO 2: Duplicação ==========
    if (entity_type === 'TeamPayment') {
      const existing = await base44.asServiceRole.entities.TeamPayment.filter({
        user_email: data.user_email,
        mes_referencia: data.mes_referencia,
        ano: toNumber(data.ano)
      });

      const activeDuplicate = (existing || []).find((e) =>
        ['PAGO', 'APROVADO_COORD', 'AGUARDANDO_APROVACAO'].includes(
          String(e.status || '').toUpperCase()
        )
      );

      if (activeDuplicate) {
        return Response.json(
          {
            ok: false,
            error: 'DUPLICATE_PAYMENT',
            message: `Já existe pagamento ATIVO para ${data.mes_referencia}/${data.ano}`,
            existing_id: activeDuplicate.id,
            existing_status: activeDuplicate.status,
            action: 'Edite o pagamento existente ou marque-o como RASCUNHO'
          },
          { status: 409 }
        );
      }
    }

    if (entity_type === 'PurchaseRequest') {
      const existing = await base44.asServiceRole.entities.PurchaseRequest.filter({
        titulo: data.titulo,
        rubrica_id: data.rubrica_id
      });

      const activeDuplicate = (existing || []).find((e) =>
        !['REJEITADO'].includes(String(e.status || '').toUpperCase())
      );

      if (activeDuplicate) {
        return Response.json(
          {
            ok: false,
            error: 'DUPLICATE_PURCHASE',
            message: 'Já existe compra com mesmo título e rubrica',
            existing_id: activeDuplicate.id,
            action: 'Use a compra existente ou mude o título'
          },
          { status: 409 }
        );
      }
    }

    // ========== VALIDAÇÃO 3: Status Válido ==========
    if (data.status) {
      const validTransition = validateStatusTransition('RASCUNHO', data.status, entity_type);
      if (!validTransition) {
        return Response.json(
          {
            ok: false,
            error: 'INVALID_STATUS',
            message: `Status "${data.status}" não é válido`,
            allowed: {
              TeamPayment: ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO_COORD', 'PAGO'],
              PurchaseRequest: ['RASCUNHO', 'ENVIADO', 'APROVADO', 'PAGAMENTO_FEITO']
            }[entity_type]
          },
          { status: 400 }
        );
      }
    }

    // ========== VALIDAÇÃO 4: Valores ==========
    if (data.valor) {
      const valor = toNumber(data.valor);
      if (valor <= 0) {
        return Response.json(
          {
            ok: false,
            error: 'INVALID_VALUE',
            message: 'Valor deve ser maior que 0'
          },
          { status: 400 }
        );
      }
    }

    // ========== VALIDAÇÃO 5: Rubrica (se necessário) ==========
    if (entity_type === 'PurchaseRequest' && data.rubrica_id) {
      try {
        const rubrica = await base44.asServiceRole.entities.Rubrica.filter({
          id: data.rubrica_id
        });

        if (!rubrica || rubrica.length === 0) {
          return Response.json(
            {
              ok: false,
              error: 'RUBRICA_NOT_FOUND',
              message: `Rubrica não existe`
            },
            { status: 404 }
          );
        }

        const r = rubrica[0];
        const total = toNumber(r.valor_total || r.valor_rubrica);
        const utilizado = toNumber(r.valor_utilizado);
        const saldo = total - utilizado;

        if (saldo <= 0) {
          return Response.json(
            {
              ok: false,
              error: 'RUBRICA_NO_BALANCE',
              message: `Rubrica sem saldo (disponível: R$ ${saldo.toFixed(2)})`,
              available_balance: saldo
            },
            { status: 400 }
          );
        }
      } catch (e) {
        return Response.json(
          {
            ok: false,
            error: 'RUBRICA_CHECK_ERROR',
            message: e.message
          },
          { status: 500 }
        );
      }
    }

    // ========== VALIDAÇÃO 6: Permissão ==========
    if (data.user_email && user.email !== data.user_email) {
      if (!validatePermission(user, 'create_for_others')) {
        return Response.json(
          {
            ok: false,
            error: 'PERMISSION_DENIED',
            message: 'Você não pode criar registros para outros usuários'
          },
          { status: 403 }
        );
      }
    }

    return Response.json({
      ok: true,
      message: 'Validações aprovadas',
      validation_results: {
        required_fields: 'OK',
        duplicates: 'OK',
        status: 'OK',
        values: 'OK',
        rubrica: 'OK',
        permissions: 'OK'
      }
    });
  } catch (e) {
    console.error('validateBeforeCreate error:', e);
    return Response.json(
      { error: e.message || 'Erro de validação' },
      { status: 500 }
    );
  }
});