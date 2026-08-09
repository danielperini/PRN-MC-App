/**
 * removeSolicitacoesDuplicadas — Limpeza em massa de PurchaseRequests duplicadas.
 *
 * Regra: agrupa por nf_numero idêntico e dentro de cada grupo,
 * considera duplicata quando pelo menos 2 de 3 campos (CNPJ, valor, data de emissão) batem.
 * Mantém a solicitação com melhor status (Pago > Aprovado > Solicitado).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }

function toNumber(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(p) {
  return toNumber(p?.valor_pago) || toNumber(p?.valor_aprovado_admin) || toNumber(p?.valor_aprovado) || toNumber(p?.valor_solicitado) || toNumber(p?.valor_total) || toNumber(p?.nf_valor_total) || 0;
}

function getNFNumber(p) {
  return String(p?.nf_numero || '').trim();
}

function getNFDate(p) {
  const d = String(p?.nf_data_emissao || '').trim();
  return d ? d.slice(0, 10) : '';
}

function getCNPJ(p) {
  return onlyDigits(p?.fornecedor_cnpj || p?.fornecedor_cpf_cnpj || p?.nf_emitente_cpf_cnpj || '');
}

/**
 * Conta quantos dos 3 campos (CNPJ, valor, data) são idênticos entre duas PurchaseRequests.
 * Retorna um número de 0 a 3.
 */
function matchCount(a, b) {
  let count = 0;

  // CNPJ
  const cnpjA = getCNPJ(a);
  const cnpjB = getCNPJ(b);
  if (cnpjA && cnpjB && cnpjA === cnpjB) count++;

  // Valor (arredondado para 2 casas)
  const valA = Math.round(getPurchaseValue(a) * 100) / 100;
  const valB = Math.round(getPurchaseValue(b) * 100) / 100;
  if (valA > 0 && valB > 0 && valA === valB) count++;

  // Data de emissão
  const dataA = getNFDate(a);
  const dataB = getNFDate(b);
  if (dataA && dataB && dataA === dataB) count++;

  return count;
}

const STATUS_PRIORITY = {
  'PAGO': 100,
  'APROVADO': 90,
  'APROVADO_ADMIN': 85,
  'APROVADO_COORD': 80,
  'SOLICITADO': 50,
  'RASCUNHO': 20,
  'DEVOLVIDO': 10,
  'RECUSADO': 5,
  'CANCELADO': 0,
};

function getStatusPriority(p) {
  const s = String(p?.status || '').trim().toUpperCase();
  return STATUS_PRIORITY[s] ?? 30;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const triggeredByScheduled =
      body?.triggered_by === 'scheduled' || body?.scheduled === true || !!body?.automation_id;

    const user = await base44.auth.me().catch(() => null);
    if (!triggeredByScheduled) {
      if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
      const isAdmin = user.role === 'admin';
      const isCoord = ['COORDENADOR', 'COORD_COMUNICACAO', 'COORD_ADMINISTRATIVA', 'COORD_PRODUCAO'].includes(user.role);
      if (!isAdmin && !isCoord) {
        return Response.json({ error: 'Apenas coordenadores podem executar esta ação.' }, { status: 403 });
      }
    }

    // 1. Carregar todas as PurchaseRequests
    const all = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 1000);
    if (!Array.isArray(all) || all.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma solicitação encontrada.', removidas: 0, mantidas: 0 });
    }

    // 2. Agrupar por nf_numero (ignorar vazios)
    const byNF = {};
    for (const p of all) {
      const nf = getNFNumber(p);
      if (!nf) continue;
      if (!byNF[nf]) byNF[nf] = [];
      byNF[nf].push(p);
    }

    // 3. Dentro de cada grupo com >1, aplicar regra:
    //    nf_numero idêntico + pelo menos 2 de 3 (CNPJ, valor, data) batem → duplicata
    const toDelete = [];
    const toKeep = [];
    const stats = { totalGruposNF: 0, totalRemovidas: 0, totalMantidas: 0, gruposComDuplicatas: 0 };

    for (const [nf, grupo] of Object.entries(byNF)) {
      if (grupo.length < 2) continue;

      stats.totalGruposNF++;

      // Ordenar: maior prioridade de status primeiro; empate: mais antigo primeiro
      grupo.sort((a, b) => {
        const pa = getStatusPriority(a);
        const pb = getStatusPriority(b);
        if (pa !== pb) return pb - pa;
        return new Date(a.created_date || 0) - new Date(b.created_date || 0);
      });

      const keeper = grupo[0];
      toKeep.push(keeper.id);

      let hasDupes = false;

      for (let i = 1; i < grupo.length; i++) {
        const candidate = grupo[i];
        const matches = matchCount(keeper, candidate);

        // Regra: nf_numero já é idêntico (agrupamento), + pelo menos 2 dos 3 batem
        if (matches >= 2) {
          toDelete.push(candidate.id);
          hasDupes = true;
        } else {
          // Não bateu o suficiente — mantém também
          toKeep.push(candidate.id);
        }
      }

      if (hasDupes) {
        stats.gruposComDuplicatas++;
      }
    }

    stats.totalRemovidas = toDelete.length;
    stats.totalMantidas = toKeep.length;

    if (toDelete.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhuma duplicata encontrada.',
        removidas: 0,
        mantidas: all.length,
        stats,
      });
    }

    // 4. Deletar as duplicatas em lotes
    let deleted = 0;
    let errors = 0;

    for (const id of toDelete) {
      try {
        await base44.asServiceRole.entities.PurchaseRequest.delete(id);
        deleted++;
      } catch (e) {
        errors++;
      }
    }

    // 5. Deduplicar attachments: manter apenas 1 arquivo único por solicitação
    let attachRemoved = 0;
    try {
      const attachments = await base44.asServiceRole.entities.Attachment.list('-created_date', 1000);
      const attachByPurchase = {};
      for (const a of (attachments || [])) {
        const pid = a?.purchase_id || a?.purchase_request_id || a?.solicitacao_id;
        if (!pid) continue;
        if (!attachByPurchase[pid]) attachByPurchase[pid] = [];
        attachByPurchase[pid].push(a);
      }

      for (const [pid, atts] of Object.entries(attachByPurchase)) {
        if (atts.length <= 1) continue;
        atts.sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
        const extras = atts.slice(1);
        for (const a of extras) {
          try {
            await base44.asServiceRole.entities.Attachment.delete(a.id);
            attachRemoved++;
          } catch (_) {}
        }
      }
    } catch (_) {}

    return Response.json({
      success: true,
      message: `Limpeza concluída: ${deleted} duplicatas removidas, ${toKeep.length} mantidas. ${errors > 0 ? `${errors} erros.` : ''} ${attachRemoved} anexos duplicados removidos.`,
      removidas: deleted,
      mantidas: all.length - deleted,
      erros: errors,
      anexosRemovidos: attachRemoved,
      stats,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});