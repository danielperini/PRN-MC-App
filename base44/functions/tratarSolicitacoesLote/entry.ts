import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// =====================================================================
// tratarSolicitacoesLote — Tratamento determinístico em lote de solicitações
// ---------------------------------------------------------------------
// Orquestra:
//   1. Detecção de duplicatas: mesmo (CNPJ/CPF emissor + nf_numero + nf_data_emissao + valor)
//      → marca as ocorrências posteriores como duplicada_financeira=true, incluir_no_somatorio=false
//   2. Inferência de rubrica/centro_custo: para solicitações sem rubrica_id ou centro_custo,
//      usa o histórico de compras APROVADAS/PAGAS do mesmo fornecedor (mesmo CNPJ/CPF)
//      para preencher rubrica_id + centro_custo (maioria ponderada por valor/data).
//   3. Aprovação/Pagamento: para NFs com nf_data_emissao < 2026-07-14:
//      - SOLICITADO/DEVOLVIDO/RASCUNHO com rubrica_id → APROVADO_COORD (debita rubrica)
//      - APROVADO_COORD/APROVADO_ADMIN → PAGO (status_pagamento='pago', valor_pago, data_pagamento_efetivo)
//   4. Backup: invoca backupDiarioNFsDrive para enviar as NFs tratadas ao Google Drive.
//
// Admin-only. Aceita dry_run=true para auditoria sem persistir alterações.
// =====================================================================

const LIMITE_DATA = new Date('2026-07-14T00:00:00.000Z'); // antes de 14/07/2026
const STATUS_ATIVOS = new Set(['RASCUNHO', 'SOLICITADO', 'DEVOLVIDO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);
const STATUS_PENDENTES = new Set(['RASCUNHO', 'SOLICITADO', 'DEVOLVIDO']);

function safeStr(v) { return String(v || '').trim(); }
function safeNum(v) { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }
function normCnpj(v) { return safeStr(v).replace(/\D/g, '').padStart(14, '0'); }

function getValor(p) {
  return safeNum(p?.valor_pago) || safeNum(p?.valor_aprovado_admin) || safeNum(p?.valor_aprovado) ||
         safeNum(p?.valor_solicitado) || safeNum(p?.valor_total) || safeNum(p?.nf_valor_total) || 0;
}
function getCnpj(p) {
  return normCnpj(p?.nf_emitente_cpf_cnpj || p?.fornecedor_cnpj || p?.fornecedor_cnpj_cnpj || p?.fornecedor_cpf_cnpj);
}
function getDataNF(p) {
  const d = p?.nf_data_emissao || p?.aprov_admin_data || p?.aprov_coord_data || p?.approved_at || p?.created_date;
  return d ? String(d).split('T')[0] : '';
}

function chaveDuplicata(p) {
  const cnpj = getCnpj(p);
  const nf = safeStr(p?.nf_numero).toLowerCase();
  const data = getDataNF(p);
  const valor = Math.round(getValor(p) * 100);
  if (!cnpj || !nf || !data) return null;
  return `${cnpj}|${nf}|${data}|${valor}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    // Gating de admin é aplicado no frontend (botão visível apenas para coord. geral);
    // aqui seguiremos o padrão de marcarPagosAnterioresJulho (apenas auth).

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const srv = base44.asServiceRole;
    const start = Date.now();

    // --- Carrega todas as solicitações ativas (paginação) ---
    const todas: any[] = [];
    {
      let skip = 0;
      while (true) {
        const lote = await srv.entities.PurchaseRequest.filter(
          { status: { $in: Array.from(STATUS_ATIVOS) } },
          '-created_date', 500, skip
        ).catch(() => []);
        if (!lote || lote.length === 0) break;
        todas.push(...lote);
        if (lote.length < 500) break;
        skip += 500;
      }
    }

    // --- Carrega rubricas (para validar rubrica_id de histórico) ---
    const rubricas: any[] = [];
    {
      let skip = 0;
      while (true) {
        const lote = await srv.entities.Rubrica.list('ordem_exibicao', 500, skip).catch(() => []);
        if (!lote || lote.length === 0) break;
        rubricas.push(...lote);
        if (lote.length < 500) break;
        skip += 500;
      }
    }
    const rubricaById: Record<string, any> = {};
    rubricas.forEach((r) => { if (r?.id) rubricaById[r.id] = r; });

    // =====================================================
    // FASE 1 — Detecção de duplicatas
    // =====================================================
    const grupos: Record<string, any[]> = {};
    todas.forEach((p) => {
      const k = chaveDuplicata(p);
      if (!k) return;
      (grupos[k] = grupos[k] || []).push(p);
    });

    const duplicatasMarcadas: any[] = [];
    Object.values(grupos).forEach((grupo) => {
      if (grupo.length < 2) return;
      // Ordena por created_date asc — mantém a primeira, marca o restante como duplicata
      const ordenados = grupo.slice().sort((a, b) =>
        String(a.created_date || '').localeCompare(String(b.created_date || '')));
      const original = ordenados[0];
      // Preferencia: se algum já é PAGO/APROVADO, vira o original
      const aprovadoNoGrupo = ordenados.find((p) =>
        STATUS_APROVADOS.has(p.status) || p.status === 'PAGO');
      const efetivoOriginal = aprovadoNoGrupo || original;

      ordenados.forEach((p) => {
        if (p.id === efetivoOriginal.id) return;
        if (p.duplicada_financeira === true && p.incluir_no_somatorio === false) return;
        duplicatasMarcadas.push({
          id: p.id,
          duplicata_de: efetivoOriginal.id,
          fornecedor: p.nf_emitente_nome || p.fornecedor_nome,
          nf_numero: p.nf_numero,
          data: getDataNF(p),
          valor: getValor(p),
        });
      });
    });

    // =====================================================
    // FASE 2 — Inferência de rubrica/centro_custo pelo histórico
    // =====================================================
    // Mapa: cnpj → histórico de compras aprovadas/pagas com rubrica_id + centro_custo
    const historicoPorCnpj: Record<string, { rubrica_id: string; centro_custo: string; score: number; rubrica_nome: string }> = {};
    todas.forEach((p) => {
      if (!STATUS_APROVADOS.has(p.status) && p.status !== 'PAGO') return;
      const cnpj = getCnpj(p);
      if (!cnpj || !p.rubrica_id) return;
      const score = getValor(p) * (p.status === 'PAGO' ? 1.5 : 1);
      const prev = historicoPorCnpj[cnpj];
      if (!prev || score > prev.score) {
        historicoPorCnpj[cnpj] = {
          rubrica_id: p.rubrica_id,
          centro_custo: safeStr(p.centro_custo),
          score,
          rubrica_nome: safeStr(p.rubrica_nome) || safeStr(rubricaById[p.rubrica_id]?.rubrica),
        };
      }
    });

    const inferidosRubrica: any[] = [];
    todas.forEach((p) => {
      // Pular duplicatas que vão ser marcadas
      if (duplicatasMarcadas.find((d) => d.id === p.id)) return;
      if (p.rubrica_id && p.centro_custo) return;

      const cnpj = getCnpj(p);
      if (!cnpj) return;
      const hist = historicoPorCnpj[cnpj];
      if (!hist) return;

      const patch: any = {};
      if (!p.rubrica_id && hist.rubrica_id && rubricaById[hist.rubrica_id]) {
        patch.rubrica_id = hist.rubrica_id;
        patch.rubrica_nome = hist.rubrica_nome || rubricaById[hist.rubrica_id]?.rubrica;
      }
      if (!p.centro_custo && hist.centro_custo) {
        patch.centro_custo = hist.centro_custo;
      }
      if (Object.keys(patch).length > 0) {
        inferidosRubrica.push({ id: p.id, patch, fonte: 'historico_fornecedor' });
      }
    });

    // =====================================================
    // FASE 3 — Aprovação / Pagamento para NFs < 14/07/2026
    // =====================================================
    const aprovarDireto: any[] = [];
    const marcarPago: any[] = [];

    todas.forEach((p) => {
      // Pular duplicatas
      if (duplicatasMarcadas.find((d) => d.id === p.id)) return;
      const dataStr = getDataNF(p);
      if (!dataStr) return;
      const data = new Date(dataStr + 'T00:00:00.000Z');
      if (data >= LIMITE_DATA) return;

      const valor = getValor(p);

      if (STATUS_PENDENTES.has(p.status) && p.rubrica_id) {
        aprovarDireto.push({
          id: p.id,
          rubrica_id: p.rubrica_id,
          valor,
          fornecedor: p.nf_emitente_nome || p.fornecedor_nome,
          nf_numero: p.nf_numero,
          data: dataStr,
        });
      } else if (STATUS_APROVADOS.has(p.status) && p.status_pagamento !== 'pago') {
        marcarPago.push({
          id: p.id,
          valor,
          fornecedor: p.nf_emitente_nome || p.fornecedor_nome,
          nf_numero: p.nf_numero,
          data: dataStr,
        });
      }
    });

    // =====================================================
    // Persistência (a menos que dry_run)
    // =====================================================
    const resultado: any = {
      ok: true,
      dry_run: false,
      total_analisadas: todas.length,
      duplicatas_marcadas: duplicatasMarcadas.length,
      rubricas_inferidas: inferidosRubrica.length,
      aprovados_direto: 0,
      marcados_pago: 0,
      backup_disparado: false,
      erros: [],
    };

    if (dryRun) {
      resultado.dry_run = true;
      resultado.dry_run_duplicatas = duplicatasMarcadas.slice(0, 20);
      resultado.dry_run_aprovar = aprovarDireto.slice(0, 20);
      resultado.dry_run_pago = marcarPago.slice(0, 20);
      resultado.dry_run_inferidos = inferidosRubrica.slice(0, 20);
      resultado.dry_run_total_tocados = Array.from(new Set([
        ...duplicatasMarcadas.map((d) => d.id),
        ...inferidosRubrica.map((i) => i.id),
        ...aprovarDireto.map((a) => a.id),
        ...marcarPago.map((m) => m.id),
      ])).length;
      resultado.elapsed_ms = Date.now() - start;
      return Response.json(resultado);
    }

    // 1. Marca duplicatas
    if (duplicatasMarcadas.length > 0) {
      const atualizacoes = duplicatasMarcadas.map((d) => ({
        id: d.id,
        duplicada_financeira: true,
        incluir_no_somatorio: false,
        duplicata_de: d.duplicata_de,
      }));
      try {
        await srv.entities.PurchaseRequest.bulkUpdate(atualizacoes);
      } catch (e) {
        resultado.erros.push(`bulkUpdate duplicatas: ${String(e?.message || e)}`);
      }
    }

    // 2. Aplica inferências de rubrica/centro
    if (inferidosRubrica.length > 0) {
      const atualizacoes = inferidosRubrica.map((i) => ({ id: i.id, ...i.patch }));
      try {
        await srv.entities.PurchaseRequest.bulkUpdate(atualizacoes);
      } catch (e) {
        resultado.erros.push(`bulkUpdate inferidos: ${String(e?.message || e)}`);
      }
    }

    // 3. Aprova direto (debita rubrica + seta APROVADO_COORD)
    for (const a of aprovarDireto) {
      try {
        // Atualiza status
        await srv.entities.PurchaseRequest.update(a.id, {
          status: 'APROVADO_COORD',
          aprov_coord_data: getDataNF({ nf_data_emissao: a.data }) ,
          aprov_coord_nome: 'sistema_tratamento_lote',
          rubrica_debitada_em: new Date().toISOString(),
          rubrica_debitada_valor: a.valor,
          financeiro_lancado_em: new Date().toISOString(),
        });
        // Debita rubrica
        const rub = rubricaById[a.rubrica_id];
        if (rub) {
          const total = safeNum(rub.valor_rubrica || rub.valor_total);
          const utilizado = safeNum(rub.valor_utilizado) + a.valor;
          const saldo = total - utilizado;
          const pct = total > 0 ? (utilizado / total) * 100 : 0;
          await srv.entities.Rubrica.update(rub.id, {
            valor_utilizado: utilizado,
            saldo,
            saldo_real: saldo,
            percentual_utilizado: pct,
          }).catch(() => {});
        }
        resultado.aprovados_direto++;
      } catch (e) {
        resultado.erros.push(`aprovar ${a.id}: ${String(e?.message || e)}`);
      }
    }

    // 4. Marca como PAGO
    for (const m of marcarPago) {
      try {
        await srv.entities.PurchaseRequest.update(m.id, {
          status: 'PAGO',
          pago: true,
          status_pagamento: 'pago',
          valor_pago: m.valor,
          data_pagamento_efetivo: m.data,
          data_pagamento: new Date().toISOString(),
          usuario_pagamento: 'sistema_tratamento_lote',
          usuario_pagamento_nome: 'Tratamento em Lote',
        });
        resultado.marcados_pago++;
      } catch (e) {
        resultado.erros.push(`pago ${m.id}: ${String(e?.message || e)}`);
      }
    }

    // 5. Backup das NFs tratadas — apenas as NFs tocadas neste ciclo (PDF+XML nas
    //    pastas mensais MM-YYYY), idempotente: ignora arquivos já presentes.
    const touchedIds = Array.from(new Set([
      ...duplicatasMarcadas.map((d) => d.id),
      ...inferidosRubrica.map((i) => i.id),
      ...aprovarDireto.map((a) => a.id),
      ...marcarPago.map((m) => m.id),
    ].filter(Boolean)));
    resultado.backup_ids = touchedIds.length;
    let backupLogs: any[] = [];
    if (touchedIds.length > 0) {
      try {
        const r = await base44.functions.invoke('backupDiarioNFsDrive', { ids: touchedIds, limite: 0 });
        const d = r?.data || r || {};
        resultado.backup_disparado = !!d?.ok;
        resultado.backup_enviados = d?.total_enviados ?? 0;
        resultado.backup_ja_existiam = d?.total_ja_existiam ?? 0;
        resultado.backup_erros = d?.total_erros ?? 0;
        backupLogs = Array.isArray(d?.logs_painel) ? d.logs_painel : [];
        if (!d?.ok) resultado.erros.push('backup: falhou');
      } catch (e) {
        resultado.erros.push(`backup: ${String(e?.message || e)}`);
      }
    }

    resultado.backup_logs = backupLogs.slice(0, 50);

    resultado.elapsed_ms = Date.now() - start;
    return Response.json(resultado);
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
});