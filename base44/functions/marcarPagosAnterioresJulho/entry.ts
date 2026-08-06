import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Função de atuação única (one-shot): alinha status_pagamento='pago' de registros
// históricos da empresa. Dois critérios de captura, executados em paralelo:
//
//   1. por_status_pago: registros com status='PAGO' mas status_pagamento != 'pago'.
//      Independente de data — se o fluxo já está PAGO, o pagamento é fato, então
//      apenas alinhamos os campos de pagamento para refletir a realidade.
//   2. por_data_anterior_julho: registros APROVADO_COORD/APROVADO_ADMIN com
//      status_pagamento != 'pago' e data de referência (nf_data_emissao →
//      aprov_admin_data → aprov_coord_data → approved_at) < 2026-07-01.
//
// Idempotente: só atua quando status_pagamento != 'pago'; após alinhamento,
// status='PAGO', pago=true, status_pagamento='pago', data_pagamento_efetivo
// + data_pagamento + usuario_pagamento(*_nome) + valor_pago são preenchidos.

const LIMITE_DATA = new Date('2026-07-01T00:00:00.000Z'); // antes de julho/2026

const STATUS_ATIVOS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_INATIVOS = new Set(['RASCUNHO', 'SOLICITADO', 'RECUSADO', 'CANCELADO', 'DEVOLVIDO']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    const srv = base44.asServiceRole;

    // ===== Critério 1: status='PAGO' mas status_pagamento != 'pago' =====
    // Snapshot da fila "apagar". Independente de data.
    const porStatusPago: any[] = [];
    {
      let skip = 0;
      while (true) {
        const lote = await srv.entities.PurchaseRequest.filter(
          { status: 'PAGO', status_pagamento: { $ne: 'pago' } },
          '-updated_date',
          500,
          skip
        ).catch(() => []);
        if (!lote || lote.length === 0) break;
        porStatusPago.push(...lote);
        if (lote.length < 500) break;
        skip += 500;
      }
    }

    // ===== Critério 2: APROVADO_COORD/APROVADO_ADMIN antes de julho/2026 =====
    const aprovados: any[] = [];
    {
      let skip = 0;
      while (true) {
        const lote = await srv.entities.PurchaseRequest.filter(
          { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN'] }, status_pagamento: { $ne: 'pago' } },
          '-updated_date',
          500,
          skip
        ).catch(() => []);
        if (!lote || lote.length === 0) break;
        aprovados.push(...lote);
        if (lote.length < 500) break;
        skip += 500;
      }
    }

    if (porStatusPago.length === 0 && aprovados.length === 0) {
      return Response.json({
        ok: true,
        mensagem: 'Nenhum registro pendente de alinhamento de pagamento.',
        processados: 0,
        por_status_pago: 0,
        por_data_anterior_julho: 0,
      });
    }

    function parseData(valor: any): Date | null {
      if (!valor) return null;
      const d = new Date(valor);
      return isNaN(d.getTime()) ? null : d;
    }

    function dataReferencia(p: any): Date | null {
      return (
        parseData(p.nf_data_emissao) ||
        parseData(p.aprov_admin_data) ||
        parseData(p.aprov_coord_data) ||
        parseData(p.approved_at)
      );
    }

    // Dedupe por id — prioriza crivério 1 (PAGO), que deve alinhar antes de tudo.
    const vistos = new Set<string>();
    const alvosPorStatusPago: any[] = [];
    const alvosPorData: any[] = [];

    for (const p of porStatusPago) {
      if (!p?.id) continue;
      if (vistos.has(p.id)) continue;
      // PAGO sem status_pagamento = 'pago' é exatamente o alvo
      if (!STATUS_ATIVOS_APROVADOS.has(p.status)) continue;
      if (STATUS_INATIVOS.has(p.status)) continue;
      vistos.add(p.id);
      alvosPorStatusPago.push(p);
    }

    for (const p of aprovados) {
      if (!p?.id) continue;
      if (vistos.has(p.id)) continue;
      if (!STATUS_ATIVOS_APROVADOS.has(p.status)) continue;
      if (STATUS_INATIVOS.has(p.status)) continue;
      const dt = dataReferencia(p);
      if (!dt) continue;
      if (dt >= LIMITE_DATA) continue;
      vistos.add(p.id);
      alvosPorData.push(p);
    }

    const alvos = [...alvosPorStatusPago, ...alvosPorData];

    if (alvos.length === 0) {
      return Response.json({
        ok: true,
        mensagem: 'Nenhuma solicitação aprovada elegível encontrada.',
        total_avaliadas: porStatusPago.length + aprovados.length,
        por_status_pago: alvosPorStatusPago.length,
        por_data_anterior_julho: alvosPorData.length,
        processados: 0,
      });
    }

    if (dryRun) {
      const amostra = alvos.slice(0, 50).map((p) => {
        const dt = dataReferencia(p);
        return {
          id: p.id,
          descricao: (p.descricao_item || '').substring(0, 50),
          fornecedor: p.fornecedor_nome,
          status: p.status,
          status_pagamento: p.status_pagamento,
          nf_data_emissao: p.nf_data_emissao,
          data_ref: dt ? dt.toISOString().slice(0, 10) : null,
          valor: p.valor_solicitado,
          criterio: alvosPorStatusPago.some((x) => x.id === p.id)
            ? 'por_status_pago'
            : 'por_data_anterior_julho',
        };
      });
      return Response.json({
        ok: true,
        dry_run: true,
        total_avaliadas: porStatusPago.length + aprovados.length,
        alvos: alvos.length,
        por_status_pago: alvosPorStatusPago.length,
        por_data_anterior_julho: alvosPorData.length,
        amostra,
      });
    }

    const agora = new Date();
    const executante = user.email;
    const executanteNome = user.full_name || '';

    const atualizacoes = alvos.map((p) => {
      const dt = dataReferencia(p);
      const dataEfetivo = dt ? dt.toISOString().slice(0, 10) : agora.toISOString().slice(0, 10);
      return {
        id: p.id,
        status: 'PAGO',
        pago: true,
        status_pagamento: 'pago',
        data_pagamento: agora.toISOString(),
        data_pagamento_efetivo: dataEfetivo,
        usuario_pagamento: executante,
        usuario_pagamento_nome: executanteNome,
        valor_pago: p.valor_aprovado ?? p.valor_aprovado_admin ?? p.valor_solicitado ?? null,
      };
    });

    const resultados = { atualizados: 0, erros: 0, detalhes_erros: [] as any[] };

    for (let i = 0; i < atualizacoes.length; i += 500) {
      const lote = atualizacoes.slice(i, i + 500);
      try {
        await srv.entities.PurchaseRequest.bulkUpdate(lote);
        resultados.atualizados += lote.length;
      } catch (err: any) {
        resultados.erros += lote.length;
        resultados.detalhes_erros.push({ lote_index: i, erro: String(err?.message || err) });
      }
    }

    return Response.json({
      ok: true,
      total_avaliadas: porStatusPago.length + aprovados.length,
      alvos_encontrados: alvos.length,
      por_status_pago: alvosPorStatusPago.length,
      por_data_anterior_julho: alvosPorData.length,
      atualizados: resultados.atualizados,
      erros: resultados.erros,
      detalhes_erros: resultados.detalhes_erros,
      executado_em: agora.toISOString(),
      executado_por: executante,
      criterios:
        'por_status_pago (status=PAGO AND status_pagamento!=pago, sem validação de data) + por_data_anterior_julho (APROVADO_* AND nf_data_emissao<2026-07-01)',
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});