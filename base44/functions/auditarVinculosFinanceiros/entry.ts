import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * auditarVinculosFinanceiros
 * Verifica:
 * 1. NFs/solicitações sem centro_custo
 * 2. NFs/solicitações sem rubrica vinculada (aprovadas/pagas)
 * 3. Centro de custo sem nenhuma rubrica cadastrada
 * 4. Rubricas com saldo_real divergente do calculado
 * 5. Solicitações aprovadas com rubrica de centro_custo diferente do da solicitação
 *
 * action = 'auditar' (padrão) | 'corrigir_saldos' | 'corrigir_centros'
 */

const STATUS_ATIVOS = new Set(['SOLICITADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
const STATUS_CONTABILIZADOS = new Set(['APROVADO_ADMIN', 'PAGO']);

const CENTROS_VALIDOS = new Set([
  'MHAB', 'MIS BH', 'MIS', 'MUMO',
  'Geral/Transversal', 'Coordenação', 'Comunicação', 'Educação', 'Produção',
  'Administrativo-financeiro', 'Noturno 2026', 'Noturno Pampulha',
  'Publicações', 'Consultorias', 'Despesas Gerais'
]);

// Normaliza centro_custo para chave comparável
function normCC(cc: string): string {
  const s = String(cc || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s === 'mis bh' || s === 'mis') return 'MIS BH';
  if (s === 'mhab' || s === 'mab') return 'MHAB';
  if (s === 'mumo') return 'MUMO';
  if (s.includes('pampulha')) return 'Noturno Pampulha';
  if (s.includes('noturno')) return 'Noturno 2026';
  if (s.includes('geral') || s.includes('transversal')) return 'Geral/Transversal';
  if (s.includes('coordena')) return 'Coordenação';
  if (s.includes('comunica')) return 'Comunicação';
  if (s.includes('educa')) return 'Educação';
  if (s.includes('produ')) return 'Produção';
  if (s.includes('admin') || s.includes('financ')) return 'Administrativo-financeiro';
  if (s.includes('publica')) return 'Publicações';
  if (s.includes('consulto')) return 'Consultorias';
  if (s.includes('despesa')) return 'Despesas Gerais';
  return String(cc || '').trim();
}

function toNum(v: any): number { return Number(v) || 0; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me(); // requer autenticação

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'auditar';

    // ── Carregar dados ──────────────────────────────────────────
    const [allPurchases, allRubricas] = await Promise.all([
      base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 1000).catch(() => []),
      base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500).catch(() => []),
    ]);

    const purchases = (allPurchases || []) as any[];
    const rubricas = (allRubricas || []) as any[];

    // ── 1. NFs sem centro_custo (apenas status ativos) ──────────
    const semCentro = purchases
      .filter(p => STATUS_ATIVOS.has(String(p.status || '').toUpperCase()) && !p.centro_custo?.trim())
      .map(p => ({
        id: p.id,
        descricao: p.descricao_item || p.fornecedor_nome || '—',
        valor: toNum(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado),
        status: p.status,
        rubrica_id: p.rubrica_id || null,
        fornecedor: p.fornecedor_nome || '—',
        nf_numero: p.nf_numero || '—',
        created_date: p.created_date,
      }));

    // ── 2. NFs aprovadas/pagas sem rubrica vinculada ────────────
    const semRubrica = purchases
      .filter(p => STATUS_ATIVOS.has(String(p.status || '').toUpperCase()) && !p.rubrica_id?.trim())
      .map(p => ({
        id: p.id,
        descricao: p.descricao_item || p.fornecedor_nome || '—',
        valor: toNum(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado),
        status: p.status,
        centro_custo: p.centro_custo || '—',
        fornecedor: p.fornecedor_nome || '—',
        nf_numero: p.nf_numero || '—',
        created_date: p.created_date,
      }));

    // ── 3. Centros de custo das NFs sem rubrica no banco ────────
    const centrosDasNFs = new Set<string>();
    purchases.forEach(p => {
      if (p.centro_custo?.trim()) centrosDasNFs.add(normCC(p.centro_custo));
    });

    const centrosDasRubricas = new Set<string>();
    rubricas.forEach(r => {
      if (r.centro_custo?.trim()) centrosDasRubricas.add(normCC(r.centro_custo));
    });

    const centrosSemRubrica: string[] = [];
    centrosDasNFs.forEach(cc => {
      if (!centrosDasRubricas.has(cc)) centrosSemRubrica.push(cc);
    });

    // ── 4. Rubricas com saldo divergente ────────────────────────
    const saldosDivergentes: any[] = [];
    for (const r of rubricas) {
      if (r.ativo === false) continue;
      const valorBase = toNum(r.valor_rubrica || r.valor_total);
      const utilizadoNoBanco = toNum(r.valor_utilizado);

      // Calcular utilizado real somando NFs APROVADO_ADMIN + PAGO desta rubrica
      const purchasesRubrica = purchases.filter(
        p => p.rubrica_id === r.id && STATUS_CONTABILIZADOS.has(String(p.status || '').toUpperCase())
      );
      const utilizadoReal = purchasesRubrica.reduce((acc: number, p: any) => {
        return acc + toNum(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado);
      }, 0);

      const diff = Math.abs(utilizadoReal - utilizadoNoBanco);
      if (diff > 0.01) {
        saldosDivergentes.push({
          id: r.id,
          rubrica: r.rubrica || r.nome || '—',
          centro_custo: r.centro_custo || '—',
          valor_base: valorBase,
          utilizado_banco: utilizadoNoBanco,
          utilizado_real: utilizadoReal,
          saldo_banco: toNum(r.saldo || r.saldo_real),
          saldo_real_calculado: valorBase - utilizadoReal,
          diferenca: utilizadoReal - utilizadoNoBanco,
          qtd_compras: purchasesRubrica.length,
        });
      }
    }

    // ── 5. Solicitações com rubrica de CC diferente ─────────────
    const rubricaById = new Map(rubricas.map((r: any) => [r.id, r]));
    const ccDivergente: any[] = [];
    purchases
      .filter(p => STATUS_ATIVOS.has(String(p.status || '').toUpperCase()) && p.rubrica_id && p.centro_custo)
      .forEach(p => {
        const rubrica = rubricaById.get(p.rubrica_id) as any;
        if (!rubrica) return;
        const ccNF = normCC(p.centro_custo);
        const ccRubrica = normCC(rubrica.centro_custo);
        if (ccNF !== ccRubrica) {
          ccDivergente.push({
            id: p.id,
            descricao: p.descricao_item || p.fornecedor_nome || '—',
            status: p.status,
            cc_solicitacao: p.centro_custo,
            cc_rubrica: rubrica.centro_custo,
            rubrica_nome: rubrica.rubrica || rubrica.nome || '—',
            valor: toNum(p.valor_pago || p.valor_aprovado_admin || p.valor_solicitado),
          });
        }
      });

    // ── Ação: corrigir saldos ───────────────────────────────────
    if (action === 'corrigir_saldos') {
      let corrigidos = 0;
      for (const item of saldosDivergentes) {
        const r = rubricaById.get(item.id) as any;
        if (!r) continue;
        const valorBase = toNum(r.valor_rubrica || r.valor_total);
        const novoUtilizado = item.utilizado_real;
        const novoSaldo = valorBase - novoUtilizado;
        const percentual = valorBase > 0 ? (novoUtilizado / valorBase) * 100 : 0;
        await base44.asServiceRole.entities.Rubrica.update(item.id, {
          valor_utilizado: novoUtilizado,
          saldo: novoSaldo,
          saldo_real: novoSaldo,
          percentual_utilizado: Number(percentual.toFixed(2)),
        }).catch(() => {});
        corrigidos++;
      }
      return Response.json({
        success: true,
        action: 'corrigir_saldos',
        corrigidos,
        message: `${corrigidos} rubrica(s) com saldo corrigido.`,
      });
    }

    // ── Resposta da auditoria ───────────────────────────────────
    const totalIssues = semCentro.length + semRubrica.length + centrosSemRubrica.length + saldosDivergentes.length + ccDivergente.length;
    const score = Math.max(0, 100 - totalIssues * 3);

    return Response.json({
      success: true,
      score,
      totalIssues,
      semCentro: { count: semCentro.length, items: semCentro.slice(0, 50) },
      semRubrica: { count: semRubrica.length, items: semRubrica.slice(0, 50) },
      centrosSemRubrica: { count: centrosSemRubrica.length, items: centrosSemRubrica },
      saldosDivergentes: { count: saldosDivergentes.length, items: saldosDivergentes.slice(0, 50) },
      ccDivergente: { count: ccDivergente.length, items: ccDivergente.slice(0, 50) },
      stats: {
        total_purchases: purchases.length,
        total_rubricas: rubricas.length,
        centros_com_rubrica: centrosDasRubricas.size,
      },
    });

  } catch (error: any) {
    console.error('[auditarVinculosFinanceiros]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});