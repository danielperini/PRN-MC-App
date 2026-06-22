import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }

function toNumber(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(p) {
  return toNumber(p?.valor_pago) || toNumber(p?.valor_aprovado_admin) || toNumber(p?.valor_aprovado) || toNumber(p?.valor_solicitado) || toNumber(p?.valor_total) || 0;
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

function buildFiscalKey(p) {
  const cnpj = getCNPJ(p);
  const nf = getNFNumber(p);
  const valor = getPurchaseValue(p);
  const data = getNFDate(p);
  if (cnpj && nf && valor > 0) return `${cnpj}|${nf}|${valor.toFixed(2)}|${data}`;
  return null;
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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const isCoord = ['COORDENADOR', 'COORD_COMUNICACAO', 'COORD_ADMINISTRATIVA', 'COORD_PRODUCAO'].includes(user.role);
    if (!isAdmin && !isCoord) {
      return Response.json({ error: 'Apenas coordenadores podem executar esta ação.' }, { status: 403 });
    }

    // 1. Carregar todas as PurchaseRequests
    const all = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 1000);
    if (!Array.isArray(all) || all.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma solicitação encontrada.', removidas: 0, mantidas: 0 });
    }

    // 2. Agrupar por chave fiscal
    const groups = {};
    for (const p of all) {
      const key = buildFiscalKey(p);
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }

    // 3. Para cada grupo com >1, decidir qual manter
    const toDelete = [];
    const toKeep = [];
    const stats = { totalGrupos: 0, totalRemovidas: 0, totalMantidas: 0, gruposComMultiplos: 0 };

    for (const [key, items] of Object.entries(groups)) {
      if (items.length <= 1) continue;
      stats.gruposComMultiplos++;
      stats.totalGrupos++;

      // Ordenar: maior prioridade de status primeiro; empate: mais antigo primeiro
      items.sort((a, b) => {
        const pa = getStatusPriority(a);
        const pb = getStatusPriority(b);
        if (pa !== pb) return pb - pa; // maior prioridade primeiro
        return new Date(a.created_date || 0) - new Date(b.created_date || 0); // mais antigo primeiro
      });

      const keeper = items[0]; // melhor status ou mais antigo
      const dupes = items.slice(1);

      toKeep.push(keeper.id);
      for (const d of dupes) {
        toDelete.push(d.id);
      }
      stats.totalMantidas++;
      stats.totalRemovidas += dupes.length;
    }

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
    const errorIds = [];

    for (let i = 0; i < toDelete.length; i += 25) {
      const batch = toDelete.slice(i, i + 25);
      for (const id of batch) {
        try {
          await base44.asServiceRole.entities.PurchaseRequest.delete(id);
          deleted++;
        } catch (e) {
          errors++;
          errorIds.push(id);
        }
      }
      // Pequena pausa entre lotes
      if (i + 25 < toDelete.length) {
        await new Promise((r) => setTimeout(r, 300));
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
        // Manter o mais antigo
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
      message: `Limpeza concluída: ${deleted} solicitações duplicadas removidas, ${toKeep.length} mantidas. ${errors > 0 ? `${errors} erros.` : ''} ${attachRemoved} anexos duplicados removidos.`,
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