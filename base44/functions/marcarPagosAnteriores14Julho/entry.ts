import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * marcarPagosAnteriores14Julho
 *
 * Marca como PAGAS todas as solicitações aprovadas (APROVADO_COORD, APROVADO_ADMIN, PAGO)
 * cuja data de emissão real seja ANTERIOR a 14/07/2026.
 *
 * Fluxo:
 *   1. Coleta aprovados com status_pagamento != 'pago'.
 *   2. Para cada registro, valida a data de emissão com IA (lendo o PDF da NF) quando:
 *        - data ausente/inválida, ou
 *        - data anterior a 2026 (suspeita de data de abertura de empresa), ou
 *        - data entre 01/07 e 14/07 (precisa confirmar dia exato).
 *   3. Se a data real validada for < 2026-07-14 → marca como PAGO.
 *
 * Idempotente: status_pagamento != 'pago' é o filtro — não reprocessa.
 *
 * Payload:
 *   { dry_run?: boolean, limite?: number (default 25), ids?: string[] }
 */

const LIMITE_DATA = new Date('2026-07-14T00:00:00-03:00'); // 14/07/2026 00:00 Brasília = 03:00 UTC
const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const STATUS_APROVADOS = ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'];

function safeStr(v) {
  return String(v || '').trim();
}

function parseData(valor) {
  if (!valor) return null;
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    const d = new Date(valor.substring(0, 10) + 'T12:00:00Z');
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

function dataReferencia(p) {
  return parseData(p.nf_data_emissao) ||
    parseData(p.aprov_admin_data) ||
    parseData(p.aprov_coord_data) ||
    parseData(p.approved_at);
}

/**
 * Determina se a data do registro precisa ser validada/reanalisada por IA.
 *   - Sem data: sim (precisa descobrir)
 *   - Ano < 2026: sim (suspeita: data de abertura da empresa Viaduto das Artes 2023)
 *   - Data entre 01/07 e 14/07/2026: sim (precisa confirmar o dia exato)
 *   - Demais: não (data confiável)
 */
function precisaReanalise(p) {
  const dt = dataReferencia(p);
  if (!dt) return true;
  const ano = dt.getUTCFullYear();
  if (ano < 2026) return true;
  const inicioJulho = new Date('2026-07-01T00:00:00Z');
  const limiteJulho = LIMITE_DATA;
  if (dt >= inicioJulho && dt <= limiteJulho) return true;
  return false;
}

/**
 * Reanalisa o PDF da NF com IA para extrair a data real de emissão.
 * Retorna Date ou null.
 */
async function reanaliseDataComIA(base44, p) {
  const pdfUrl = p.nota_fiscal_url || p.nota_fiscal_pdf_url || p.nf_pdf_url || '';
  if (!pdfUrl) return null;

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const ia = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: `Este documento é uma Nota Fiscal. Extraia EXATAMENTE a data de EMISSÃO da nota fiscal (campo "Data de Emissão" ou "Data Emissão").
IMPORTANTE:
- Ignore datas de abertura de empresa, datas de contratos, datas de convênios.
- O CNPJ 23.843.648/0001-25 (Viaduto das Artes) foi aberto em 2023 — esse ano NÃO é a data da nota.
- Notas fiscais do projeto são de 2026 em diante.
- Data atual: ${hoje}.

Retorne JSON:
{
  "nf_data_emissao_corrigida": "YYYY-MM-DD ou null",
  "confianca": "alta|media|baixa",
  "explicacao": "..."
}`,
      file_urls: [pdfUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          nf_data_emissao_corrigida: { type: 'string' },
          confianca: { type: 'string' },
          explicacao: { type: 'string' },
        },
      },
    });

    const corrigida = ia?.nf_data_emissao_corrigida || '';
    const d = parseData(corrigida);
    if (!d) return null;

    // Só aceita data >= 2026 (evita alucinações com data de abertura da empresa)
    const ano = d.getUTCFullYear();
    if (ano < 2026) return null;

    // Atualiza o banco com a data corrigida (idempotente — só se diferente)
    try {
      await base44.asServiceRole.entities.PurchaseRequest.update(p.id, {
        nf_data_emissao: corrigida.substring(0, 10),
      });
    } catch (_) { /* não bloquear por falha de update */ }

    return d;
  } catch (e) {
    console.error(`[IA] Erro reanalisando ${p.id}:`, e.message);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const limite = typeof body.limite === 'number' && body.limite > 0 ? body.limite : 25;
    const idsSolicitados = Array.isArray(body.ids)
      ? body.ids.map((id) => String(id || '').trim()).filter(Boolean)
      : null;

    const srv = base44.asServiceRole;

    // ===== Coleta de aprovados sem status_pagamento = 'pago' =====
    const candidatos = [];
    let skip = 0;
    while (true) {
      const lote = await srv.entities.PurchaseRequest.filter(
        { status: { $in: STATUS_APROVADOS }, status_pagamento: { $ne: 'pago' } },
        '-updated_date', 500, skip
      ).catch(() => []);
      if (!lote || lote.length === 0) break;
      for (const p of lote) {
        if (idsSolicitados && !idsSolicitados.includes(p.id)) continue;
        candidatos.push(p);
      }
      if (lote.length < 500) break;
      skip += 500;
    }

    if (candidatos.length === 0) {
      return Response.json({
        ok: true,
        mensagem: 'Nenhuma solicitação aprovada pendente de pagamento.',
        processados: 0,
      });
    }

    // ===== Para cada candidato, valida a data com IA quando necessário =====
    const agora = new Date();
    const executante = user.email;
    const executanteNome = user.full_name || '';

    const alvos = [];
    const logs = [];
    const ignorados = [];
    let reanalisados = 0;
    let iaErros = 0;

    const aProcessar = candidatos.slice(0, limite);

    for (const p of aProcessar) {
      const dtAntes = dataReferencia(p);
      let dtFinal = dtAntes;
      let origemData = 'banco';
      let reanaliseExecutada = false;
      let explicacao = '';

      if (precisaReanalise(p)) {
        reanaliseExecutada = true;
        reanalisados++;
        const dtIA = await reanaliseDataComIA(base44, p);
        if (dtIA) {
          dtFinal = dtIA;
          origemData = 'ia';
          explicacao = `data IA: ${dtIA.toISOString().slice(0, 10)}`;
        } else {
          iaErros++;
          // Se a data original era >= 14/07 ou nula → não marcar (falta confirmação)
          // Se era < 14/07 e já confiável (ano >= 2026 e fora de 01-14/07), usa banco mesmo assim
          if (dtAntes && dtAntes.getFullYear() >= 2026 && dtAntes < LIMITE_DATA &&
              !(dtAntes >= new Date('2026-07-01T00:00:00Z') && dtAntes <= LIMITE_DATA)) {
            explicacao = 'IA falhou; usando data do banco (confiável)';
          } else {
            ignorados.push({ id: p.id, motivo: 'data inválida/IA falhou', data_banco: dtAntes ? dtAntes.toISOString().slice(0, 10) : null });
            logs.push({ id: p.id, reanalisado: true, origem: origemData, ia_ok: false, decisao: 'ignorado' });
            continue;
          }
        }
      } else {
        explicacao = `data banco: ${dtAntes?.toISOString().slice(0, 10)}`;
      }

      // Decisão final: data < 14/07 → marcar como pago
      if (dtFinal && dtFinal < LIMITE_DATA) {
        alvos.push({
          id: p.id,
          status: 'PAGO',
          pago: true,
          status_pagamento: 'pago',
          data_pagamento: agora.toISOString(),
          data_pagamento_efetivo: dtFinal.toISOString().slice(0, 10),
          usuario_pagamento: executante,
          usuario_pagamento_nome: executanteNome,
          valor_pago: p.valor_aprovado ?? p.valor_aprovado_admin ?? p.valor_solicitado ?? null,
        });
        logs.push({
          id: p.id,
          reanalisado: reanaliseExecutada,
          origem: origemData,
          ia_ok: reanaliseExecutada ? true : null,
          decisao: 'marcar_pago',
          data_final: dtFinal.toISOString().slice(0, 10),
        });
      } else {
        ignorados.push({
          id: p.id,
          motivo: 'data >= 14/07/2026',
          data_final: dtFinal ? dtFinal.toISOString().slice(0, 10) : null,
        });
        logs.push({
          id: p.id,
          reanalisado: reanaliseExecutada,
          origem: origemData,
          ia_ok: reanaliseExecutada ? true : null,
          decisao: 'nao_marcar',
          data_final: dtFinal ? dtFinal.toISOString().slice(0, 10) : null,
        });
      }
    }

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        corte: LIMITE_DATA.toISOString(),
        total_candidatos: candidatos.length,
        processados_avaliados: aProcessar.length,
        reanalisados_ia: reanalisados,
        ia_erros: iaErros,
        alvos_a_marcar: alvos.length,
        ignorados: ignorados.length,
        amostra_alvos: alvos.slice(0, 30).map((a) => ({
          id: a.id,
          data_efetivo: a.data_pagamento_efetivo,
        })),
        amostra_ignorados: ignorados.slice(0, 30),
      });
    }

    // ===== Aplica bulkUpdate em lotes de 500 =====
    let atualizados = 0;
    let erros = 0;
    const detalhesErros = [];
    for (let i = 0; i < alvos.length; i += 500) {
      const lote = alvos.slice(i, i + 500);
      try {
        await srv.entities.PurchaseRequest.bulkUpdate(lote);
        atualizados += lote.length;
      } catch (err) {
        erros += lote.length;
        detalhesErros.push({ lote: i, erro: String(err?.message || err) });
      }
    }

    return Response.json({
      ok: true,
      corte: LIMITE_DATA.toISOString(),
      total_candidatos: candidatos.length,
      processados_avaliados: aProcessar.length,
      reanalisados_ia: reanalisados,
      ia_erros: iaErros,
      marcados_pago: atualizados,
      erros: erros,
      ignorados: ignorados.length,
      detalhes_erros: detalhesErros,
      executado_em: agora.toISOString(),
      executado_por: executante,
      logs: logs.slice(-100),
    });
  } catch (error) {
    console.error('marcarPagosAnteriores14Julho error:', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});