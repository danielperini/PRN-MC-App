import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function toNumber(value: unknown): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value: unknown): string {
  const raw = normalizeString(value);

  if (!raw) return '';
  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';
  if (raw.includes('imagem e som')) return 'MIS';
  if (raw.includes('abilio barreto')) return 'MHAB';
  if (raw.includes('moda')) return 'MUMO';
  if (raw === 'geral' || raw === 'global') return 'GLOBAL';
  if (raw.includes('publica')) return 'PUBLICAÇÕES';
  if (raw.includes('noturno')) return 'NOTURNO NOS MUSEUS 2026';

  return String(value || '').trim().toUpperCase();
}

function getPurchaseValue(purchase: any): number {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function getPurchaseCentroCusto(purchase: any): string {
  return normalizeMuseu(
    purchase?.centro_custo ||
    purchase?.museu ||
    purchase?.unidade ||
    ''
  );
}

function sameMuseuOrGlobal(entity: string, selected: string): boolean {
  if (!selected) return true;
  if (!entity) return true;
  if (entity === 'GLOBAL') return true;
  return entity === selected;
}

// 🔥 NOVO: valida contrato vs NF
async function validarContratoVsNF(base44: any, purchase: any) {
  if (!purchase?.team_payment_id) return { ok: true };

  let tp = null;
  try {
    tp = await base44.asServiceRole.entities.TeamPayment.get(purchase.team_payment_id);
  } catch {}

  if (!tp) return { ok: true };

  let validation = null;
  try {
    if (tp.resultado_validacao) {
      validation = JSON.parse(tp.resultado_validacao);
    }
  } catch {}

  if (validation?.status === 'divergente') {
    return {
      ok: false,
      error: 'NF divergente do contrato',
    };
  }

  // 🔥 valida valor contrato vs NF
  const valorNF = toNumber(tp?.valor_nf);
  const valorContrato = toNumber(tp?.valor_parcela);

  if (valorContrato && valorNF && Math.abs(valorNF - valorContrato) > 1) {
    return {
      ok: false,
      error: 'Valor da NF diferente do contrato',
    };
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { action = '', purchaseId, ...data } = payload || {};

    if (!purchaseId) {
      return Response.json({ error: 'purchaseId obrigatório' }, { status: 400 });
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json({ error: 'Compra não encontrada' }, { status: 404 });
    }

    const isCoordinator =
      user.role === 'admin' ||
      user.role === 'ADMIN' ||
      user.role === 'COORDENADOR';

    if (action === 'aprovar') {
      if (!isCoordinator) {
        return Response.json({ error: 'Sem permissão' }, { status: 403 });
      }

      const validacao = await validarContratoVsNF(base44, purchase);

      if (!validacao.ok) {
        return Response.json({ error: validacao.error }, { status: 400 });
      }

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'APROVADO_COORD',
        valor_aprovado: getPurchaseValue(purchase),
      });

      return Response.json({ success: true });
    }

    if (action === 'mark_paid') {
      if (!isCoordinator) {
        return Response.json({ error: 'Sem permissão' }, { status: 403 });
      }

      const validacao = await validarContratoVsNF(base44, purchase);

      if (!validacao.ok) {
        return Response.json({ error: validacao.error }, { status: 400 });
      }

      const valor = getPurchaseValue(purchase);

      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        valor_pago: valor,
        pago_em: new Date().toISOString(),
      });

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (error: any) {
    console.error(error);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});
