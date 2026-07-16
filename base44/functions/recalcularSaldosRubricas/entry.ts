import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const STATUS_CONTABILIZADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const ROLES_AUTORIZADOS = new Set(['admin', 'administrator', 'administrador', 'coordenador', 'coordinator', 'coordenador geral', 'coordenador_geral']);

function normalize(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function digits(value: any) {
  return String(value || '').replace(/\D/g, '');
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
  if (status === 'PAGO') {
    return money(purchase?.valor_pago) || money(purchase?.valor_aprovado_admin) || money(purchase?.valor_aprovado) || money(purchase?.nf_valor_total) || money(purchase?.valor_solicitado);
  }
  return money(purchase?.valor_aprovado_admin) || money(purchase?.valor_aprovado) || money(purchase?.nf_valor_total) || money(purchase?.valor_final) || money(purchase?.valor_solicitado) || money(purchase?.valor_total) || money(purchase?.valor);
}

function rubricaTotal(rubrica: any): number {
  return money(rubrica?.valor_total_original ?? rubrica?.valor_original ?? rubrica?.valor_rubrica ?? rubrica?.valor_total ?? rubrica?.valor_previsto ?? 0);
}

function rubricaName(rubrica: any): string {
  return String(rubrica?.rubrica || rubrica?.nome || rubrica?.titulo || rubrica?.descricao || '').trim();
}

function rubricaCenter(rubrica: any): string {
  return String(rubrica?.centro_custo || rubrica?.centro || rubrica?.unidade || rubrica?.projeto || '').trim();
}

function rubricaNature(rubrica: any): string {
  return digits(rubrica?.natureza_despesa || rubrica?.natureza || rubrica?.codigo_natureza || rubrica?.elemento_despesa);
}

function rubricaCanonicalKey(rubrica: any): string {
  const name = normalize(rubricaName(rubrica));
  const center = normalize(rubricaCenter(rubrica));
  const nature = rubricaNature(rubrica);
  if (!name) return `id:${rubrica?.id || ''}`;
  return `${name}|${center || 'sem-centro'}|${nature || 'sem-natureza'}`;
}

function rubricaQuality(rubrica: any): number {
  let score = 0;
  const total = rubricaTotal(rubrica);
  if (rubrica?.ativo !== false) score += 100;
  if (total > 0) score += 50;
  if (rubrica?.meta_id || rubrica?.meta || rubrica?.meta_codigo) score += 12;
  if (rubrica?.grupo) score += 6;
  if (rubricaCenter(rubrica)) score += 4;
  if (rubricaNature(rubrica)) score += 4;
  score += Math.min(20, total / 100000);
  return score;
}

function selectCanonicalRubrica(group: any[]): any {
  return [...group].sort((a, b) => {
    const quality = rubricaQuality(b) - rubricaQuality(a);
    if (quality !== 0) return quality;
    const updated = String(b?.updated_date || b?.created_date || '').localeCompare(String(a?.updated_date || a?.created_date || ''));
    if (updated !== 0) return updated;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0];
}

function purchaseFiscalKey(purchase: any): string {
  const accessKey = digits(purchase?.nf_chave_acesso || purchase?.chave_acesso || purchase?.nota_fiscal_chave);
  if (accessKey.length === 44) return `chave:${accessKey}`;

  const invoice = digits(purchase?.nf_numero || purchase?.numero_nf || purchase?.numero_nota || purchase?.numero_nota_fiscal);
  const supplierDocument = digits(purchase?.fornecedor_cpf_cnpj || purchase?.nf_emitente_cpf_cnpj || purchase?.cnpj_fornecedor || purchase?.fornecedor_cnpj);
  const value = purchaseValue(purchase).toFixed(2);
  if (invoice && supplierDocument && value !== '0.00') return `nf:${invoice}:${supplierDocument}:${value}`;

  const supplier = normalize(purchase?.fornecedor_nome || purchase?.nf_emitente_nome || purchase?.fornecedor || '');
  const fiscalDate = String(purchase?.nf_data_emissao || purchase?.data_nf || purchase?.data_emissao_nf || '').slice(0, 10);
  if (invoice && supplier && fiscalDate && value !== '0.00') return `nf-fornecedor:${invoice}:${supplier}:${fiscalDate}:${value}`;

  return `id:${purchase?.id || crypto.randomUUID()}`;
}

function purchaseQuality(purchase: any): number {
  let score = 0;
  if (purchase?.comprovante_pagamento_url || purchase?.comprovante_url) score += 16;
  if (purchase?.drive_backup_status === 'concluido') score += 8;
  if (purchase?.nota_fiscal_pdf_url || purchase?.nf_pdf_url || purchase?.nota_fiscal_url) score += 4;
  if (purchase?.nota_fiscal_xml_url || purchase?.nf_xml_url || purchase?.xml_url) score += 2;
  if (String(purchase?.status || '').toUpperCase() === 'PAGO') score += 1;
  return score;
}

function isPurchaseExcluded(purchase: any): boolean {
  return purchase?.duplicada === true ||
    purchase?.duplicada_financeira === true ||
    purchase?.incluir_no_somatorio === false ||
    normalize(purchase?.duplicidade_status) === 'confirmada';
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
    const authorization = await authorize(base44);
    if (!authorization.ok) return authorization.response;

    const body = await request.json().catch(() => ({}));
    const onlyRubricaId = String(body?.rubrica_id || '');

    const [rubricasRaw, purchasesRaw] = await Promise.all([
      base44.entities.Rubrica.list('ordem_exibicao', 5000),
      base44.entities.PurchaseRequest.list('-created_date', 5000),
    ]);
    const allRubricas = (Array.isArray(rubricasRaw) ? rubricasRaw : []).filter((rubrica: any) => rubrica?.id);
    const purchases = Array.isArray(purchasesRaw) ? purchasesRaw : [];

    const groups = new Map<string, any[]>();
    for (const rubrica of allRubricas) {
      const key = rubricaCanonicalKey(rubrica);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(rubrica);
    }

    const canonicalByRubricaId = new Map<string, string>();
    const canonicalRubricas: any[] = [];
    const duplicateRubricas: Array<{ duplicate: any; canonical: any; key: string }> = [];
    const rubricaDivergences: any[] = [];

    for (const [key, group] of groups.entries()) {
      const canonical = selectCanonicalRubrica(group);
      canonicalRubricas.push(canonical);
      for (const rubrica of group) canonicalByRubricaId.set(String(rubrica.id), String(canonical.id));
      for (const duplicate of group.filter((item) => item.id !== canonical.id)) {
        duplicateRubricas.push({ duplicate, canonical, key });
        if (rubricaTotal(duplicate) > 0 && Math.abs(rubricaTotal(duplicate) - rubricaTotal(canonical)) > 0.01) {
          rubricaDivergences.push({
            chave: key,
            canonica_id: canonical.id,
            duplicada_id: duplicate.id,
            previsto_canonico: rubricaTotal(canonical),
            previsto_duplicado: rubricaTotal(duplicate),
          });
        }
      }
    }

    const eligiblePurchases = purchases.filter((purchase: any) => STATUS_CONTABILIZADOS.has(String(purchase?.status || '').toUpperCase()) && !isPurchaseExcluded(purchase));
    const purchaseMap = new Map<string, any>();
    let purchaseDuplicatesIgnored = 0;

    for (const purchase of eligiblePurchases) {
      const key = purchaseFiscalKey(purchase);
      const current = purchaseMap.get(key);
      if (!current) {
        purchaseMap.set(key, purchase);
        continue;
      }
      purchaseDuplicatesIgnored += 1;
      if (purchaseQuality(purchase) > purchaseQuality(current)) purchaseMap.set(key, purchase);
    }

    const totals = new Map<string, number>();
    let comprasContabilizadas = 0;
    let comprasSemRubrica = 0;
    for (const purchase of purchaseMap.values()) {
      const originalRubricaId = purchaseRubricaId(purchase);
      if (!originalRubricaId) {
        comprasSemRubrica += 1;
        continue;
      }
      const canonicalId = canonicalByRubricaId.get(originalRubricaId) || originalRubricaId;
      const value = purchaseValue(purchase);
      if (value <= 0) continue;
      totals.set(canonicalId, money((totals.get(canonicalId) || 0) + value));
      comprasContabilizadas += 1;
    }

    const calculatedAt = new Date().toISOString();
    const updates: any[] = [];
    const errors: any[] = [];
    const auditLogs: any[] = [];
    let unchanged = 0;
    let duplicatesDeactivated = 0;

    for (const item of duplicateRubricas) {
      if (onlyRubricaId && item.duplicate.id !== onlyRubricaId && item.canonical.id !== onlyRubricaId) continue;
      const patch = {
        ativo: false,
        valor_utilizado: 0,
        saldo: rubricaTotal(item.duplicate),
        saldo_real: rubricaTotal(item.duplicate),
        percentual_utilizado: 0,
        percentual: 0,
        recalculado_em: calculatedAt,
        recalculo_origem: 'CONSOLIDACAO_RUBRICA_DUPLICADA',
      };
      try {
        await base44.entities.Rubrica.update(item.duplicate.id, patch);
        duplicatesDeactivated += 1;
        auditLogs.push({
          action: 'RUBRICA_DUPLICADA_INATIVADA',
          entity_type: 'Rubrica',
          entity_id: item.duplicate.id,
          actor_email: authorization.user?.email || 'sistema',
          details: `Rubrica duplicada consolidada em ${item.canonical.id}. Nenhum registro foi excluído.`,
          metadata: { canonical_id: item.canonical.id, duplicate_key: item.key, valor_previsto: rubricaTotal(item.duplicate) },
        });
      } catch (error: any) {
        errors.push({ id: item.duplicate.id, error: String(error?.message || error), etapa: 'inativar_duplicada' });
      }
    }

    const activeCanonicalRubricas = canonicalRubricas.filter((rubrica: any) => rubrica?.ativo !== false && (!onlyRubricaId || rubrica.id === onlyRubricaId || canonicalByRubricaId.get(onlyRubricaId) === rubrica.id));
    for (const rubrica of activeCanonicalRubricas) {
      const total = rubricaTotal(rubrica);
      const utilizado = money(totals.get(String(rubrica.id)) || 0);
      const saldo = money(total - utilizado);
      const percentual = total > 0 ? money((utilizado / total) * 100) : 0;
      const currentUtilizado = money(rubrica?.valor_utilizado);
      const currentSaldo = money(rubrica?.saldo_real ?? rubrica?.saldo);
      const currentPercentual = money(rubrica?.percentual_utilizado ?? rubrica?.percentual);
      if (Math.abs(currentUtilizado - utilizado) < 0.01 && Math.abs(currentSaldo - saldo) < 0.01 && Math.abs(currentPercentual - percentual) < 0.01) {
        unchanged += 1;
        continue;
      }
      try {
        await base44.entities.Rubrica.update(rubrica.id, {
          valor_utilizado: utilizado,
          saldo,
          saldo_real: saldo,
          percentual_utilizado: percentual,
          percentual,
          recalculado_em: calculatedAt,
          recalculo_origem: 'PurchaseRequest_DEDUPLICADO',
        });
        updates.push({ id: rubrica.id, nome: rubricaName(rubrica), anterior: currentUtilizado, utilizado, saldo, previsto: total });
      } catch (error: any) {
        errors.push({ id: rubrica.id, error: String(error?.message || error), etapa: 'recalcular_canonica' });
      }
    }

    if (auditLogs.length && base44.entities?.AuditLog?.bulkCreate) {
      await base44.entities.AuditLog.bulkCreate(auditLogs.slice(0, 200)).catch(() => null);
    }

    const rowsForTotals = canonicalRubricas.filter((rubrica: any) => rubrica?.ativo !== false);
    const totalPrevisto = money(rowsForTotals.reduce((sum: number, rubrica: any) => sum + rubricaTotal(rubrica), 0));
    const totalUtilizado = money(rowsForTotals.reduce((sum: number, rubrica: any) => sum + (totals.get(String(rubrica.id)) || 0), 0));
    const totalSaldo = money(totalPrevisto - totalUtilizado);
    const totalPercentual = totalPrevisto > 0 ? money((totalUtilizado / totalPrevisto) * 100) : 0;

    return Response.json({
      success: errors.length === 0,
      rubricasLidas: allRubricas.length,
      rubricasCanonicas: rowsForTotals.length,
      rubricasDuplicadasDetectadas: duplicateRubricas.length,
      rubricasDuplicadasInativadas: duplicatesDeactivated,
      divergenciasPrevisto: rubricaDivergences,
      comprasLidas: purchases.length,
      comprasElegiveis: eligiblePurchases.length,
      comprasContabilizadas,
      comprasDuplicadasIgnoradas: purchaseDuplicatesIgnored,
      comprasSemRubrica,
      atualizadas: updates.length + duplicatesDeactivated,
      rubricasRecalculadas: updates.length,
      semMudanca: unchanged,
      erros: errors.length,
      atualizacoes: updates.slice(0, 100),
      falhas: errors.slice(0, 50),
      totais: {
        previsto: totalPrevisto,
        utilizado: totalUtilizado,
        saldo: totalSaldo,
        percentual: totalPercentual,
      },
      regra: 'Somente solicitações aprovadas/pagas, deduplicadas por identidade fiscal. Rubricas repetidas são consolidadas por nome + centro de custo + natureza e permanecem no histórico como inativas.',
      statusContabilizados: [...STATUS_CONTABILIZADOS],
      recalculado_em: calculatedAt,
      service_role_usado: false,
    }, { status: errors.length ? 207 : 200 });
  } catch (error: any) {
    return Response.json({ success: false, code: 'RECALCULATION_FAILED', error: String(error?.message || error), previous_data_preserved: true }, { status: 500 });
  }
});