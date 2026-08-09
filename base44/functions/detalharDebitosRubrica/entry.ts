import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ============================================================================
// detalharDebitosRubrica
//
// Para cada Rubrica, lista explicitamente as Solicitações (PurchaseRequest) e
// as Notas Fiscais a elas vinculadas que compõem o `valor_utilizado` da rubrica.
//
// Cadeia oficial de valor de uma NF (mesma da Auditoria 360° e de
// sincronizarValorUtilizadoRubricas):
//   valor_pago -> valor_aprovado_admin -> nf_valor_total -> valor_total
//   -> valor_aprovado -> valor_solicitado
//
// Filtros de inclusão (somam no valor_utilizado):
//   status ∈ {APROVADO_ADMIN, APROVADO_COORD, PAGO}
//   incluir_no_somatorio !== false
//   duplicada_financeira !== true
//
// Parâmetros (body JSON):
//   rubrica_id?: string — se informado, retorna apenas a rubrica indicada com
//     detalhe completo (solicitações + nfs). Se omitido, retorna visão sumária
//     de todas as rubricas com pelo menos 1 débito.
//   limite?: number — máx de rubricas na visão sumária (default 200, máx 1000).
//   pular?: number — offset para paginação (visão sumária).
//
// Resposta:
//   {
//     rubrica_id?: string,
//     visao: "detalhe" | "sumaria",
//     valor_utilizado_db, valor_debitado_calculado, divergente,
//     rubrica?: {...},
//     solicitacoes: [...],     // apenas no detalhe
//     nfs: [...],              // apenas no detalhe (solicitações que têm NF)
//     rubricas: [{...}],       // apenas na visão sumária
//     total_rubricas_com_debito
//   }
// ============================================================================

const STATUS_ALVO = new Set(['APROVADO_ADMIN', 'APROVADO_COORD', 'PAGO']);

function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const p = Number(raw);
  return Number.isFinite(p) ? p : 0;
}

function money(value: any): number {
  return Math.round(toNumber(value) * 100) / 100;
}

function purchaseValue(p: any): number {
  return money(
    p?.valor_pago ||
      p?.valor_aprovado_admin ||
      p?.nf_valor_total ||
      p?.valor_total ||
      p?.valor_aprovado ||
      p?.valor_solicitado ||
      0
  );
}

function debita(p: any): boolean {
  const s = String(p.status || '').toUpperCase();
  return STATUS_ALVO.has(s) && p.incluir_no_somatorio !== false && !p.duplicada_financeira;
}

function nomeRubrica(r: any): string {
  return r?.rubrica || r?.nome || r?.item_rubrica || r?.descricao || r?.id;
}

function temNF(p: any): boolean {
  return Boolean(
    p?.nf_numero || p?.nf_pdf_url || p?.nf_xml_url || p?.nota_fiscal_url || p?.nf_emitente_nome
  );
}

function resumoSolicitacao(p: any) {
  return {
    id: p.id,
    descricao_item: p.descricao_item || '',
    status: p.status,
    centro_custo: p.centro_custo || '',
    fornecedor_nome: p.fornecedor_nome || p.nf_emitente_nome || '',
    valor_solicitado: toNumber(p.valor_solicitado),
    valor_aprovado: toNumber(p.valor_aprovado || p.valor_aprovado_admin),
    valor_pago: toNumber(p.valor_pago),
    nf_numero: p.nf_numero || '',
    nf_emitente_nome: p.nf_emitente_nome || '',
    nf_data_emissao: p.nf_data_emissao || '',
    nf_valor_total: toNumber(p.nf_valor_total),
    valor_considerado: purchaseValue(p),
    nf_pdf_url: p.nf_pdf_url || p.nota_fiscal_url || '',
    nf_xml_url: p.nf_xml_url || '',
    comprovante_url: p.comprovante_url || p.comprovante_pagamento_url || '',
    incluir_no_somatorio: p.incluir_no_somatorio !== false,
    duplicada_financeira: Boolean(p.duplicada_financeira),
    duplicidade_bloqueada: Boolean(p.duplicidade_bloqueada),
   created_date: p.created_date || null,
  };
}

async function fetchSolicitacoesPorRubrica(svc: any, rubricaId: string): Promise<any[]> {
  const all: any[] = [];
  let skip = 0;
  while (true) {
    const batch = await svc.entities.PurchaseRequest.filter(
      { rubrica_id: rubricaId },
      '-created_date',
      500,
      skip
    ).catch(() => []);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 500) break;
    skip += 500;
  }
  return all;
}

async function fetchRubricas(svc: any, limite: number, pular: number): Promise<any[]> {
  const rubs = await svc.entities.Rubrica.list('-created_date', limite, pular).catch(() => []);
  return Array.isArray(rubs) ? rubs : [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rubricaId = String(body?.rubrica_id || '').trim();
    const svc = base44.asServiceRole;

    // -------------------------------------------------------------------
    // MODO DETALHE: rubrica_id informado
    // -------------------------------------------------------------------
    if (rubricaId) {
      const rubrica = await svc.entities.Rubrica.get(rubricaId).catch(() => null);
      if (!rubrica) {
        return Response.json(
          { error: 'Rubrica não encontrada.', rubrica_id: rubricaId },
          { status: 404 }
        );
      }

      const todas = await fetchSolicitacoesPorRubrica(svc, rubricaId);
      const debitantes = todas.filter(debita);

      const solicitacoes = debitantes.map(resumoSolicitacao);
      const nfs = debitantes.filter(temNF).map((p) => ({
        solicitacao_id: p.id,
        nf_numero: p.nf_numero || '',
        nf_emitente_nome: p.nf_emitente_nome || p.fornecedor_nome || '',
        nf_data_emissao: p.nf_data_emissao || '',
        nf_valor_total: toNumber(p.nf_valor_total),
        valor_considerado: purchaseValue(p),
        nf_pdf_url: p.nf_pdf_url || p.nota_fiscal_url || '',
        nf_xml_url: p.nf_xml_url || '',
      }));

      const valorDebitado = money(debitantes.reduce((s, p) => s + purchaseValue(p), 0));
      const valorDb = money(rubrica.valor_utilizado);
      const divergente = Math.abs(valorDb - valorDebitado) >= 0.01;

      return Response.json({
        visao: 'detalhe',
        rubrica_id: rubricaId,
        rubrica: {
          id: rubrica.id,
          nome: nomeRubrica(rubrica),
          grupo: rubrica.grupo || '',
          centro_custo: rubrica.centro_custo || '',
          valor_rubrica: money(rubrica.valor_rubrica || rubrica.valor_total),
          valor_utilizado_db: valorDb,
          saldo: money(rubrica.saldo),
          percentual_utilizado: toNumber(rubrica.percentual_utilizado),
        },
        valor_utilizado_db: valorDb,
        valor_debitado_calculado: valorDebitado,
        divergente,
        quantidade_solicitacoes: solicitacoes.length,
        quantidade_nfs: nfs.length,
        solicitacoes,
        nfs,
      });
    }

    // -------------------------------------------------------------------
    // MODO SUMÁRIO: todas as rubricas com débito
    // -------------------------------------------------------------------
    const limite = Math.min(Number(body?.limite || 200), 1000);
    const pular = Number(body?.pular || 0);

    const rubricas = await fetchRubricas(svc, limite, pular);
    const saida: any[] = [];
    let totalComDebito = 0;

    for (const r of rubricas) {
      const todas = await fetchSolicitacoesPorRubrica(svc, r.id);
      const debitantes = todas.filter(debita);
      if (!debitantes.length) continue;
      totalComDebito++;

      const valorDebitado = money(debitantes.reduce((s, p) => s + purchaseValue(p), 0));
      const valorDb = money(r.valor_utilizado);
      saida.push({
        rubrica_id: r.id,
        nome: nomeRubrica(r),
        grupo: r.grupo || '',
        centro_custo: r.centro_custo || '',
        valor_rubrica: money(r.valor_rubrica || r.valor_total),
        valor_utilizado_db: valorDb,
        valor_debitado_calculado: valorDebitado,
        divergente: Math.abs(valorDb - valorDebitado) >= 0.01,
        quantidade_solicitacoes: debitantes.length,
        quantidade_com_nf: debitantes.filter(temNF).length,
      });
    }

    const hasMore = rubricas.length === limite;

    return Response.json({
      visao: 'sumaria',
      rubricas: saida,
      total_rubricas_com_debito: totalComDebito,
      total_retornadas: saida.length,
      has_more: hasMore,
      proximo_pular: pular + rubricas.length,
      mensagem: hasMore
        ? `Listadas ${saida.length} rubricas com débito. Execute novamente com pular=${pular + rubricas.length} para continuar.`
        : 'Visão sumária concluída.',
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});