import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 });

    const url = new URL(req.url);
    const mes = url.searchParams.get('mes') || String(new Date().getMonth() + 1).padStart(2, '0');
    const ano = url.searchParams.get('ano') || String(new Date().getFullYear());

    // Coletar todas as PurchaseRequests aprovadas/pagas
    const todas = [];
    let skip = 0;
    while (true) {
      const lote = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 200, skip);
      if (!lote || !lote.length) break;
      todas.push(...lote);
      skip += 200;
    }

    const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

    // Filtrar apenas aprovadas com NF e dentro do mês/ano
    const aprovadas = todas.filter(p => {
      if (!STATUS_APROVADOS.has(p.status)) return false;
      if (!p.nf_numero && !p.nf_chave_acesso && !p.nota_fiscal_url && !p.nf_pdf_url) return false;
      // Filtrar por mês de aprovação ou data de pagamento
      const dataRef = p.data_pagamento_efetivo || p.aprov_admin_data || p.aprov_coord_data || p.rubrica_debitada_em || p.created_date;
      if (!dataRef) return false;
      const d = new Date(dataRef);
      const mesStr = String(d.getMonth() + 1).padStart(2, '0');
      const anoStr = String(d.getFullYear());
      return mesStr === mes && anoStr === ano;
    });

    function toNum(v) { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }
    function fmtBRL(v) {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v);
    }

    function normalizeCentro(v) {
      const raw = String(v || '').trim();
      if (!raw) return 'Geral/Transversal';
      const lower = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (lower.includes('mhab') || lower.includes('abilio')) return 'MHAB';
      if (lower.includes('mis') || lower.includes('imagem e som')) return 'MIS';
      if (lower.includes('mumo') || lower.includes('moda')) return 'MUMO';
      if (lower.includes('noturno')) return 'Noturno nos Museus 2026';
      if (lower.includes('publicac')) return 'Publicações';
      if (lower.includes('geral') || lower.includes('atuacao') || lower.includes('transversal')) return 'Geral/Transversal';
      return raw;
    }

    function normalizeNatureza(v) {
      const raw = String(v || '').trim();
      if (!raw) return 'Não classificada';
      if (raw === '339030') return '339030 - Material de Consumo';
      if (raw === '339035') return '339035 - Serviços de Consultoria';
      if (raw === '339037') return '339037 - Locação de Mão de Obra';
      if (raw === '339039') return '339039 - Outros Serviços PJ';
      if (raw === '339033') return '339033 - Passagens e Despesas';
      return raw;
    }

    // Agrupar por centro_custo e natureza_despesa
    const agrupamento = {};
    let totalGeral = 0;
    let countGeral = 0;

    for (const p of aprovadas) {
      const centro = normalizeCentro(p.centro_custo);
      const natureza = normalizeNatureza(p.natureza_despesa || p.natureza_despesa_purchase);
      const valor = toNum(p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || p.nf_valor_total);
      if (valor <= 0) continue;

      if (!agrupamento[centro]) agrupamento[centro] = {};
      if (!agrupamento[centro][natureza]) {
        agrupamento[centro][natureza] = { total: 0, count: 0, itens: [] };
      }
      agrupamento[centro][natureza].total += valor;
      agrupamento[centro][natureza].count += 1;
      agrupamento[centro][natureza].itens.push({
        id: p.id,
        descricao: p.descricao_item || p.objeto || '—',
        fornecedor: p.fornecedor_nome || p.nf_emitente_nome || '—',
        nf_numero: p.nf_numero || '—',
        valor,
        valor_fmt: fmtBRL(valor),
        meta: p.meta_id || '',
        rubrica: p.rubrica_nome || p.rubrica || ''
      });
      totalGeral += valor;
      countGeral += 1;
    }

    // Construir totais por centro
    const totaisPorCentro = {};
    for (const [centro, naturezas] of Object.entries(agrupamento)) {
      let totalCentro = 0;
      for (const [, n] of Object.entries(naturezas)) {
        totalCentro += n.total;
      }
      totaisPorCentro[centro] = totalCentro;
    }

    // Construir totais por natureza
    const totaisPorNatureza = {};
    for (const [, naturezas] of Object.entries(agrupamento)) {
      for (const [nat, n] of Object.entries(naturezas)) {
        if (!totaisPorNatureza[nat]) totaisPorNatureza[nat] = 0;
        totaisPorNatureza[nat] += n.total;
      }
    }

    // Ordenar centros
    const centrosOrdenados = Object.keys(agrupamento).sort((a, b) => {
      const ordem = ['MHAB', 'MIS', 'MUMO', 'Noturno nos Museus 2026', 'Publicações', 'Geral/Transversal'];
      const ia = ordem.indexOf(a);
      const ib = ordem.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

    // Construir resultado ordenado
    const relatorio = [];
    for (const centro of centrosOrdenados) {
      const naturezas = agrupamento[centro];
      const naturezasOrdenadas = Object.keys(naturezas).sort();
      const secoes = [];
      let totalCentro = 0;
      let countCentro = 0;

      for (const nat of naturezasOrdenadas) {
        const n = naturezas[nat];
        secoes.push({
          natureza: nat,
          total: n.total,
          total_fmt: fmtBRL(n.total),
          count: n.count,
          itens: n.itens
        });
        totalCentro += n.total;
        countCentro += n.count;
      }

      relatorio.push({
        centro_custo: centro,
        total: totalCentro,
        total_fmt: fmtBRL(totalCentro),
        count: countCentro,
        naturezas: secoes
      });
    }

    return Response.json({
      success: true,
      mes,
      ano,
      mes_extenso: new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      total_geral: totalGeral,
      total_geral_fmt: fmtBRL(totalGeral),
      count_geral: countGeral,
      totais_por_centro: totaisPorCentro,
      totais_por_natureza: totaisPorNatureza,
      centros: centrosOrdenados,
      relatorio
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});