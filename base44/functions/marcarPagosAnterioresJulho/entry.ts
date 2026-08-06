import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Função de atuação única (one-shot): marca como PAGAS todas as PurchaseRequests
// aprovadas cuja NF foi emitida antes de julho/2026 (nf_data_emissao < 2026-07-01).
// Hoje a maioria dos registros já tem status='PAGO' porém status_pagamento='pendente'
// (exibidos no UI como "Aguardando pagamento"). Esta função alinha status_pagamento='pago'
// + data_pagamento_efetivo + valor_pago, idempotente.
// Fallback de data: nf_data_emissao > aprov_admin_data > aprov_coord_data > approved_at.

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

    // Busca tudo que ainda está com status_pagamento != 'pago'
    const pendentes = await base44.asServiceRole.entities.PurchaseRequest.filter({
      status_pagamento: { $ne: 'pago' }
    }, '-updated_date', 500);

    // + segunda página (caso existam mais de 500)
    let skip = 500;
    while (pendentes.length >= skip) {
      const mais = await base44.asServiceRole.entities.PurchaseRequest.filter({
        status_pagamento: { $ne: 'pago' }
      }, '-updated_date', 500, skip);
      if (!mais || mais.length === 0) break;
      pendentes.push(...mais);
      skip += 500;
    }

    if (!pendentes || pendentes.length === 0) {
      return Response.json({ ok: true, mensagem: 'Nenhuma solicitação pendente de pagamento.', processados: 0 });
    }

    function parseData(valor) {
      if (!valor) return null;
      const d = new Date(valor);
      return isNaN(d.getTime()) ? null : d;
    }

    function dataReferencia(p) {
      return parseData(p.nf_data_emissao)
        || parseData(p.aprov_admin_data)
        || parseData(p.aprov_coord_data)
        || parseData(p.approved_at);
    }

    const alvos = pendentes.filter(p => {
      if (!STATUS_ATIVOS_APROVADOS.has(p.status)) return false;
      if (STATUS_INATIVOS.has(p.status)) return false;
      const dt = dataReferencia(p);
      if (!dt) return false;
      return dt < LIMITE_DATA;
    });

    if (alvos.length === 0) {
      return Response.json({
        ok: true,
        mensagem: 'Nenhuma solicitação aprovada com NF emitida antes de julho/2026 encontrada.',
        total_avaliadas: pendentes.length,
        processados: 0
      });
    }

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        total_avaliadas: pendentes.length,
        alvos: alvos.length,
        amostra: alvos.slice(0, 25).map(p => {
          const dt = dataReferencia(p);
          return {
            id: p.id,
            descricao: (p.descricao_item || '').substring(0, 50),
            fornecedor: p.fornecedor_nome,
            status: p.status,
            status_pagamento: p.status_pagamento,
            nf_data_emissao: p.nf_data_emissao,
            data_ref: dt ? dt.toISOString().slice(0, 10) : null,
            valor: p.valor_solicitado
          };
        })
      });
    }

    const agora = new Date();
    const executante = user.email;
    const executanteNome = user.full_name || '';

    const atualizacoes = alvos.map(p => {
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
        valor_pago: p.valor_aprovado ?? p.valor_aprovado_admin ?? p.valor_solicitado ?? null
      };
    });

    const resultados = { atualizados: 0, erros: 0, detalhes_erros: [] };

    for (let i = 0; i < atualizacoes.length; i += 500) {
      const lote = atualizacoes.slice(i, i + 500);
      try {
        await base44.asServiceRole.entities.PurchaseRequest.bulkUpdate(lote);
        resultados.atualizados += lote.length;
      } catch (err) {
        resultados.erros += lote.length;
        resultados.detalhes_erros.push({ lote_index: i, erro: String(err?.message || err) });
      }
    }

    return Response.json({
      ok: true,
      total_avaliadas: pendentes.length,
      alvos_encontrados: alvos.length,
      atualizados: resultados.atualizados,
      erros: resultados.erros,
      detalhes_erros: resultados.detalhes_erros,
      executado_em: agora.toISOString(),
      executado_por: executante,
      criterio: 'status_pagamento != pago AND status in (APROVADO/PAGO) AND nf_data_emissao < 2026-07-01'
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});