import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const STATUS_CONTABILIZADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const ROLES_AUTORIZADOS = new Set(['admin', 'administrator', 'administrador', 'coordenador', 'coordinator', 'coordenador geral', 'coordenador_geral']);

function normalize(value: any) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s-]+/g, ' ');
}
function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value: any): number {
  return Math.round(toNumber(value) * 100) / 100;
}
function purchaseRubricaId(purchase: any): string {
  return String(purchase?.rubrica_id || purchase?.budgetline_id || purchase?.budget_line_id || purchase?.linha_orcamentaria_id || '');
}
function purchaseValue(purchase: any): number {
  const status = String(purchase?.status || '').toUpperCase();
  if (status === 'PAGO') return money(purchase?.valor_pago) || money(purchase?.valor_aprovado_admin) || money(purchase?.valor_aprovado) || money(purchase?.nf_valor_total) || money(purchase?.valor_solicitado);
  return money(purchase?.valor_aprovado_admin) || money(purchase?.valor_aprovado) || money(purchase?.nf_valor_total) || money(purchase?.valor_final) || money(purchase?.valor_solicitado) || money(purchase?.valor_total) || money(purchase?.valor);
}
function rubricaTotal(rubrica: any): number {
  return money(rubrica?.valor_total_original ?? rubrica?.valor_original ?? rubrica?.valor_rubrica ?? rubrica?.valor_total ?? rubrica?.valor_previsto ?? 0);
}
function digits(value: any): string {
  return String(value || '').replace(/\D/g, '');
}
function purchaseDate(purchase: any): string {
  const value = String(purchase?.nf_data_emissao || purchase?.data_pagamento || purchase?.created_date || '');
  return value.slice(0, 10);
}
function duplicateKey(purchase: any): string {
  const accessKey = digits(purchase?.nf_chave_acesso);
  if (accessKey.length === 44) return `chave:${accessKey}`;

  const invoiceNumber = String(purchase?.nf_numero || '').trim();
  const supplierDocument = digits(
    purchase?.fornecedor_cnpj || purchase?.fornecedor_cpf_cnpj || purchase?.nf_emitente_cpf_cnpj,
  );
  const value = purchaseValue(purchase);
  const date = purchaseDate(purchase);
  if (invoiceNumber && supplierDocument && value > 0) {
    return `nf:${invoiceNumber}:${supplierDocument}:${value.toFixed(2)}:${date}`;
  }

  const supplier = normalize(purchase?.fornecedor_nome || purchase?.nf_emitente_nome);
  const rubricaId = purchaseRubricaId(purchase);
  if (supplier && value > 0 && date && rubricaId) {
    return `fallback:${supplier}:${value.toFixed(2)}:${date}:${rubricaId}`;
  }
  return purchase?.id ? `id:${purchase.id}` : '';
}
function duplicatePriority(purchase: any): number {
  let score = 0;
  if (purchase?.comprovante_pagamento_url || purchase?.comprovante_url) score += 16;
  if (purchase?.drive_backup_status === 'concluido') score += 8;
  if (purchase?.nota_fiscal_url || purchase?.nf_pdf_url) score += 4;
  if (purchase?.nf_chave_acesso) score += 2;
  if (String(purchase?.status || '').toUpperCase() === 'PAGO') score += 1;
  return score;
}
function isAlreadyExcluded(purchase: any): boolean {
  const duplicateStatus = normalize(purchase?.duplicidade_status);
  return purchase?.duplicada === true ||
    purchase?.duplicada_financeira === true ||
    purchase?.incluir_no_somatorio === false ||
    duplicateStatus === 'confirmada' ||
    duplicateStatus === 'arquivada';
}
async function authorize(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user) return { ok: false, response: Response.json({ success: false, code: 'AUTH_REQUIRED', error: 'Sessão não identificada.' }, { status: 401 }) };
  const directRoles = [user?.role, user?.base_role, user?.app_role, user?.metadata?.role].map(normalize).filter(Boolean);
  if (directRoles.some((role: string) => ROLES_AUTORIZADOS.has(role) || role.startsWith('coordenador '))) return { ok: true, user };
  if (user?.email) {
    const permissions = await base44.entities.UserPermission.filter({ user_email: String(user.email).trim().toLowerCase() }).catch(() => []);
    const permission = Array.isArray(permissions) ? permissions[0] : null;
    const roles = [permission?.base_role, permission?.role, permission?.app_role].map(normalize).filter(Boolean);
    if (roles.some((role: string) => ROLES_AUTORIZADOS.has(role) || role.startsWith('coordenador ')) || permission?.pode_gerenciar_rubricas === true || permission?.gestao_compras === true) return { ok: true, user, permission };
  }
  return { ok: false, response: Response.json({ success: false, code: 'INSUFFICIENT_PERMISSION', error: 'A operação exige permissão para gerenciar rubricas.' }, { status: 403 }) };
}

Deno.serve(async (request) => {
  try {
    const base44 = createClientFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const isScheduled = body?.mode === 'scheduled';
    if (!isScheduled) {
      const authorization = await authorize(base44);
      if (!authorization.ok) return authorization.response;
    }
    const entities = isScheduled ? base44.asServiceRole.entities : base44.entities;

    const onlyRubricaId = String(body?.rubrica_id || '');
    const fixDuplicates = !isScheduled && body?.corrigir_duplicidades === true;

    const [rubricasRaw, purchasesRaw] = await Promise.all([
      entities.Rubrica.list('ordem_exibicao', 5000),
      entities.PurchaseRequest.list('-created_date', 5000),
    ]);
    const rubricas = (Array.isArray(rubricasRaw) ? rubricasRaw : []).filter((rubrica: any) => rubrica?.id && rubrica?.ativo !== false && (!onlyRubricaId || rubrica.id === onlyRubricaId));
    const purchases = Array.isArray(purchasesRaw) ? purchasesRaw : [];
    const activeRubricaIds = new Set(rubricas.map((rubrica: any) => String(rubrica.id)));

    const totals = new Map<string, number>();
    let comprasContabilizadas = 0;
    let comprasSemRubrica = 0;
    const duplicates: Array<{ duplicate: any; principal: any; key: string }> = [];
    const canonicalByKey = new Map<string, any>();

    for (const purchase of purchases) {
      const status = String(purchase?.status || '').toUpperCase();
      if (!STATUS_CONTABILIZADOS.has(status)) continue;
      if (isAlreadyExcluded(purchase)) continue;

      const key = duplicateKey(purchase);
      const current = key ? canonicalByKey.get(key) : null;
      if (current) {
        if (duplicatePriority(purchase) > duplicatePriority(current)) {
          canonicalByKey.set(key, purchase);
          duplicates.push({ duplicate: current, principal: purchase, key });
        } else {
          duplicates.push({ duplicate: purchase, principal: current, key });
        }
        continue;
      }
      if (key) canonicalByKey.set(key, purchase);
    }

    let duplicatesFixed = 0;
    if (fixDuplicates) {
      for (const item of duplicates) {
        try {
          await entities.PurchaseRequest.update(item.duplicate.id, {
            duplicada_financeira: true,
            incluir_no_somatorio: false,
            duplicata_de: item.principal.id,
            duplicidade_status: 'confirmada',
            duplicidade_nota_original_id: item.principal.id,
            duplicidade_motivo: `Duplicidade financeira detectada no recálculo (${item.key}).`,
          });
          duplicatesFixed += 1;
        } catch (_) {
          // O recálculo dos saldos continua mesmo se uma marcação não puder ser salva.
        }
      }
    }

    for (const purchase of canonicalByKey.values()) {
      const rubricaId = purchaseRubricaId(purchase);
      if (!rubricaId || !activeRubricaIds.has(rubricaId)) { comprasSemRubrica += 1; continue; }
      const value = purchaseValue(purchase);
      if (value <= 0) continue;
      totals.set(rubricaId, money((totals.get(rubricaId) || 0) + value));
      comprasContabilizadas += 1;
    }

    const calculatedAt = new Date().toISOString();
    const updates: any[] = [];
    const errors: any[] = [];
    let unchanged = 0;

    for (const rubrica of rubricas) {
      const total = rubricaTotal(rubrica);
      const utilizado = money(totals.get(rubrica.id) || 0);
      const saldo = money(total - utilizado);
      const percentual = total > 0 ? money((utilizado / total) * 100) : 0;
      const currentUtilizado = money(rubrica?.valor_utilizado);
      const currentSaldo = money(rubrica?.saldo_real ?? rubrica?.saldo);
      const currentPercentual = money(rubrica?.percentual_utilizado ?? rubrica?.percentual);
      if (Math.abs(currentUtilizado - utilizado) < 0.01 && Math.abs(currentSaldo - saldo) < 0.01 && Math.abs(currentPercentual - percentual) < 0.01) { unchanged += 1; continue; }
      try {
        await entities.Rubrica.update(rubrica.id, {
          valor_utilizado: utilizado,
          saldo,
          saldo_real: saldo,
          percentual_utilizado: percentual,
        });
        updates.push({ id: rubrica.id, nome: rubrica.rubrica || rubrica.nome || '', anterior: currentUtilizado, utilizado, saldo });
      } catch (error: any) {
        errors.push({ id: rubrica.id, error: String(error?.message || error) });
      }
    }

    return Response.json({
      success: errors.length === 0,
      rubricasAtivas: rubricas.length,
      comprasLidas: purchases.length,
      comprasContabilizadas,
      comprasSemRubrica,
      duplicatasDetectadas: duplicates.length,
      duplicatasCorrigidas: duplicatesFixed,
      totalUtilizado: money([...totals.values()].reduce((sum, value) => sum + value, 0)),
      atualizadas: updates.length,
      semMudanca: unchanged,
      erros: errors.length,
      atualizacoes: updates.slice(0, 50),
      falhas: errors.slice(0, 20),
      statusContabilizados: [...STATUS_CONTABILIZADOS],
      recalculado_em: calculatedAt,
      service_role_usado: isScheduled,
    }, { status: errors.length ? 207 : 200 });
  } catch (error: any) {
    return Response.json({ success: false, code: 'RECALCULATION_FAILED', error: String(error?.message || error), previous_data_preserved: true }, { status: 500 });
  }
});
