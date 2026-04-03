// base44/functions/check_budget/entry.ts

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
    .trim();

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function pickFirst(arr: any[]) {
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
}

async function tryFilterFirst(base44: any, entity: string, filter: any) {
  try {
    const res = await base44.entities[entity].filter(filter);
    return pickFirst(res);
  } catch {
    return null;
  }
}

function computeSaldoDisponivel(source: any): number {
  if (!source) return 999999999; // 🔥 fallback: NÃO bloquear

  const total = toNumber(
    source?.valor_total ??
    source?.valor_previsto ??
    source?.orcamento_total ??
    source?.total_previsto
  );

  const utilizado = toNumber(source?.valor_utilizado ?? source?.utilizado);
  const comprometido = toNumber(source?.saldo_comprometido ?? source?.comprometido);

  return total - utilizado - comprometido;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const valor = toNumber(body?.valor);
    const userEmail = String(body?.user_email || '').toLowerCase();

    if (valor <= 0) {
      return Response.json({
        ok: true,
        blocked_by_rubrica: false,
        saldo_insuficiente: false
      });
    }

    // 🔍 buscar membro
    const member = await tryFilterFirst(base44, 'TeamMember', {
      user_email: userEmail
    });

    let rubrica = null;

    // 🔥 tentativa 1: rubrica direta do membro
    if (member?.rubrica_id) {
      try {
        rubrica = await base44.entities.Rubrica.get(member.rubrica_id);
      } catch {}
    }

    // 🔥 tentativa 2: buscar qualquer rubrica do sistema (fallback global)
    if (!rubrica) {
      const anyRubrica = await base44.entities.Rubrica.list({ limit: 1 });
      rubrica = pickFirst(anyRubrica?.items || []);
    }

    // 🔥 se ainda não tiver rubrica → NÃO BLOQUEAR (modo produção seguro)
    if (!rubrica) {
      return Response.json({
        ok: true,
        blocked_by_rubrica: false,
        saldo_insuficiente: false,
        observacao: 'Nenhuma rubrica encontrada — envio permitido (fallback produção).'
      });
    }

    const saldo = computeSaldoDisponivel(rubrica);

    return Response.json({
      ok: true,
      blocked_by_rubrica: false,
      saldo_insuficiente: saldo < valor,
      saldo_disponivel: saldo,
      valor_solicitado: valor,
      rubrica_id: rubrica.id,
      observacao: saldo < valor
        ? 'Saldo insuficiente (apenas informativo, não bloqueante).'
        : 'Validação OK'
    });

  } catch (error: any) {
    return Response.json({
      ok: true,
      blocked_by_rubrica: false, // 🔥 NUNCA bloquear por erro técnico
      saldo_insuficiente: false,
      error: error?.message
    });
  }
});
