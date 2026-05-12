import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function toNumber(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value ?? '')
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function money(value: any): number {
  return Math.round(toNumber(value) * 100) / 100;
}

function normalize(value: any): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function rubricaKey(r: any): string {
  return `${normalize(r.grupo || r.categoria || '')}|${normalize(r.rubrica || r.nome || r.item_rubrica || '')}`;
}

function is3Aditivo(r: any): boolean {
  const raw = normalize(
    `${r?.origem_recurso || ''} ${r?.fonte_recurso || ''} ${r?.aditivo || ''} ${r?.plano_trabalho || ''}`
  );

  return (
    r?.oficial_3_aditivo === true ||
    raw.includes('3 aditivo') ||
    raw.includes('3º aditivo') ||
    raw.includes('3o aditivo')
  );
}

function getPurchaseValue(p: any): number {
  return money(
    p?.valor_pago ||
      p?.valor_aprovado_admin ||
      p?.valor_aprovado ||
      p?.valor_final ||
      p?.valor_solicitado ||
      p?.valor_total ||
      p?.valor ||
      p?.rubrica_debitada_valor ||
      0
  );
}

function isStatusAprovado(status: any): boolean {
  return ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(
    String(status || '').trim().toUpperCase()
  );
}

const TOTAL_OFICIAL = 1320000;

const RUBRICAS_OFICIAIS = [
  { grupo: 'Equipe e gestão', rubrica: 'Consultoria de programação', parcelas_unidades: '5 meses', valor_rubrica: 30000 },
  { grupo: 'Equipe e gestão', rubrica: 'Coordenador Geral (mês 19 ao 28)', parcelas_unidades: '10 meses', valor_rubrica: 70000 },
  { grupo: 'Equipe e gestão', rubrica: 'Assistente de Coordenação e Produção', parcelas_unidades: '10 meses', valor_rubrica: 50000 },
  { grupo: 'Equipe e gestão', rubrica: 'Coordenador de Comunicação (mês 19 ao 28)', parcelas_unidades: '10 meses', valor_rubrica: 60000 },
  { grupo: 'Equipe e gestão', rubrica: 'Analista Adm. Financeira (mês 19 ao 28)', parcelas_unidades: '10 meses', valor_rubrica: 50000 },
  { grupo: 'Equipe e gestão', rubrica: 'Assistente Administrativo (mês 19 ao 28)', parcelas_unidades: '10 meses', valor_rubrica: 40000 },
  { grupo: 'Equipe e gestão', rubrica: 'Produção MIS/MUMO/MHAB (mês 19 ao 28)', parcelas_unidades: '10 meses', valor_rubrica: 113400 },
  { grupo: 'Equipe e gestão', rubrica: 'Assessor de Imprensa (mês 19 ao 28)', parcelas_unidades: '9 meses', valor_rubrica: 27000 },
  { grupo: 'Equipe e gestão', rubrica: 'Rede Social / Marketing Cultural (mês 19 ao 28)', parcelas_unidades: '9 meses', valor_rubrica: 22500 },
  { grupo: 'Equipe e gestão', rubrica: 'Fotógrafo (mês 19 ao 28)', parcelas_unidades: '9 serviços', valor_rubrica: 27000 },
  { grupo: 'Equipe e gestão', rubrica: 'Designer (mês 19 ao 28)', parcelas_unidades: '10 meses', valor_rubrica: 52000 },
  { grupo: 'Manutenção e operação', rubrica: 'Manutenção MIS (mês 19 ao 28)', parcelas_unidades: '9 meses', valor_rubrica: 13500 },
  { grupo: 'Manutenção e operação', rubrica: 'Manutenção MUMO (mês 19 ao 28)', parcelas_unidades: '9 meses', valor_rubrica: 13500 },
  { grupo: 'Manutenção e operação', rubrica: 'Manutenção MHAB (mês 19 ao 28)', parcelas_unidades: '9 meses', valor_rubrica: 18000 },
  { grupo: 'Manutenção e operação', rubrica: 'Educador MIS / MUMO / MHAB (mês 19 ao 28)', parcelas_unidades: '10 meses', valor_rubrica: 138000 },
  { grupo: 'Mostras e exposições', rubrica: 'Mostra de baixa complexidade MIS', parcelas_unidades: '1 mostra', valor_rubrica: 4000 },
  { grupo: 'Mostras e exposições', rubrica: 'Mostra de média complexidade MHAB', parcelas_unidades: '1 mostra', valor_rubrica: 7000 },
  { grupo: 'Mostras e exposições', rubrica: 'Peça em destaque MHAB', parcelas_unidades: '1 peça/ação', valor_rubrica: 1000 },
  { grupo: 'Mostras e exposições', rubrica: 'Exposição MUMO', parcelas_unidades: '1 exposição', valor_rubrica: 210000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Produção (Ed. 2026)', parcelas_unidades: '1', valor_rubrica: 6000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Assistente de Produção (Ed. 2026)', parcelas_unidades: '1', valor_rubrica: 4000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'ID / designer (Ed. 2026)', parcelas_unidades: '1', valor_rubrica: 7000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Sinalização (Ed. 2026)', parcelas_unidades: '45', valor_rubrica: 11250 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Monitores (Ed. 2026)', parcelas_unidades: '10', valor_rubrica: 3000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Kit de Iluminação (Ed. 2026)', parcelas_unidades: '6', valor_rubrica: 12000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Segurança (Ed. 2026)', parcelas_unidades: '6', valor_rubrica: 3000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Limpeza (Ed. 2026)', parcelas_unidades: '6', valor_rubrica: 2700 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Vans (Ed. 2026)', parcelas_unidades: '32', valor_rubrica: 30400 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Vídeo e Fotografia (Ed. 2026)', parcelas_unidades: '1', valor_rubrica: 20000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Apresentações – MIS/MUMO/MHAB/3 museus PBH (Ed. 2026)', parcelas_unidades: '6', valor_rubrica: 15000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Infraestrutura MIS/MUMO/MHAB (Ed. 2026)', parcelas_unidades: '3', valor_rubrica: 12000 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Apresentações culturais – 3 museus PBH (Ed. 2026)', parcelas_unidades: '3', valor_rubrica: 7500 },
  { grupo: 'Noturno nos Museus 2026', rubrica: 'Infraestrutura 3 museus PBH (Ed. 2026)', parcelas_unidades: '3', valor_rubrica: 7500 },
  { grupo: 'Diárias e publicações', rubrica: 'Diárias MIS / MUMO / MHAB', parcelas_unidades: '21', valor_rubrica: 6300 },
  { grupo: 'Diárias e publicações', rubrica: 'Designer MHAB', parcelas_unidades: '1', valor_rubrica: 7000 },
  { grupo: 'Diárias e publicações', rubrica: 'Fotógrafo MHAB', parcelas_unidades: '1', valor_rubrica: 5675 },
  { grupo: 'Diárias e publicações', rubrica: 'Pesquisa e texto MHAB (2ª publicação)', parcelas_unidades: '1', valor_rubrica: 3000 },
  { grupo: 'Diárias e publicações', rubrica: 'Revisão MHAB', parcelas_unidades: '55', valor_rubrica: 1375 },
  { grupo: 'Diárias e publicações', rubrica: 'Tradução MHAB', parcelas_unidades: '55', valor_rubrica: 2200 },
  { grupo: 'Diárias e publicações', rubrica: 'Impressão MHAB', parcelas_unidades: '350', valor_rubrica: 21000 },
  { grupo: 'Alimentação, material e ações', rubrica: 'Lanches/buffet (mês 19 ao 28)', parcelas_unidades: '3', valor_rubrica: 9000 },
  { grupo: 'Alimentação, material e ações', rubrica: 'Alimentação (mês 19 ao 28)', parcelas_unidades: '30', valor_rubrica: 9000 },
  { grupo: 'Alimentação, material e ações', rubrica: 'Material MIS / MUMO / MHAB (mês 19 ao 28)', parcelas_unidades: '10 meses', valor_rubrica: 24000 },
  { grupo: 'Alimentação, material e ações', rubrica: 'Ações educativo-culturais MIS / MUMO / MHAB', parcelas_unidades: '10 meses', valor_rubrica: 90000 },
  { grupo: 'Alimentação, material e ações', rubrica: 'Fornecimento de som e iluminação', parcelas_unidades: '5', valor_rubrica: 7500 },
  { grupo: 'Consultorias', rubrica: 'Consultorias de temas transversais diversos', parcelas_unidades: '2', valor_rubrica: 5000 },
  { grupo: 'Consultorias', rubrica: 'Formação sobre Ambiente Seguro, Diversidade e Inclusão', parcelas_unidades: '1', valor_rubrica: 2500 },
  { grupo: 'Despesas gerais', rubrica: 'Transporte', parcelas_unidades: '10 meses', valor_rubrica: 4000 },
  { grupo: 'Despesas gerais', rubrica: 'Material de escritório', parcelas_unidades: '9 meses', valor_rubrica: 2700 },
  { grupo: 'Despesas gerais', rubrica: 'Assessoria jurídica', parcelas_unidades: '10 meses', valor_rubrica: 17000 },
  { grupo: 'Despesas gerais', rubrica: 'Energia elétrica', parcelas_unidades: '10 meses', valor_rubrica: 4500 },
  { grupo: 'Despesas gerais', rubrica: 'Contador', parcelas_unidades: '10 meses', valor_rubrica: 10000 }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const totalBase = money(RUBRICAS_OFICIAIS.reduce((acc, r) => acc + money(r.valor_rubrica), 0));

    if (totalBase !== TOTAL_OFICIAL) {
      return json({ success: false, error: 'Base oficial não fecha.', totalBase }, 500);
    }

    let rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 3000);
    const purchases = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 3000);

    const oficiaisKeys = new Set(RUBRICAS_OFICIAIS.map(rubricaKey));
    const existentesPorChave: Record<string, any[]> = {};

    for (const r of rubricas || []) {
      const key = rubricaKey(r);
      if (!key || key === '|') continue;
      if (!existentesPorChave[key]) existentesPorChave[key] = [];
      existentesPorChave[key].push(r);
    }

    let criadas = 0;
    let atualizadas = 0;
    let inativadas = 0;
    let consultoriasProgramacaoInativadas = 0;

    for (let i = 0; i < RUBRICAS_OFICIAIS.length; i++) {
      const item = RUBRICAS_OFICIAIS[i];
      const key = rubricaKey(item);
      const existentes = existentesPorChave[key] || [];
      const principal = existentes.find((r) => money(r.valor_rubrica || r.valor_total) > 0) || existentes[0];
      const total = money(item.valor_rubrica);

      const payload = {
        codigo: `3AD-${String(i + 1).padStart(3, '0')}`,
        grupo: item.grupo,
        categoria: item.grupo,
        rubrica: item.rubrica,
        nome: item.rubrica,
        item_rubrica: item.rubrica,
        parcelas_unidades: item.parcelas_unidades,
        numero_parcelas_unidades: item.parcelas_unidades,
        valor_rubrica: total,
        valor_total: total,
        origem_recurso: '3º ADITIVO',
        fonte_recurso: '3º ADITIVO',
        aditivo: '3º ADITIVO',
        plano_trabalho: '3º Aditivo - Museus Centro / OSC Viaduto das Artes',
        oficial_3_aditivo: true,
        ativo: true,
        status: 'ATIVA',
        ordem_exibicao: i + 1,
        saldo_comprometido: 0,
        valor_comprometido: 0
      };

      if (principal?.id) {
        await base44.asServiceRole.entities.Rubrica.update(principal.id, payload);
        atualizadas++;

        for (const duplicada of existentes.filter((r) => r.id !== principal.id)) {
          await base44.asServiceRole.entities.Rubrica.update(duplicada.id, {
            ativo: false,
            status: 'INATIVA_DUPLICADA',
            duplicada_de: principal.id,
            motivo_inativacao: 'Rubrica duplicada substituída pela rubrica oficial ativa.'
          });
          inativadas++;
        }
      } else {
        await base44.asServiceRole.entities.Rubrica.create({
          ...payload,
          valor_utilizado: 0,
          saldo: total,
          saldo_real: total,
          percentual_utilizado: 0
        });
        criadas++;
      }
    }

    rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 3000);

    for (const r of rubricas || []) {
      const key = rubricaKey(r);
      const ehOficialAtual = oficiaisKeys.has(key);
      const grupo = normalize(r.grupo || r.categoria || '');
      const nome = normalize(r.rubrica || r.nome || r.item_rubrica || '');
      const isDuplicadaConsultoriaProgramacao = grupo === 'consultorias' && nome === 'consultoria de programacao';

      if (isDuplicadaConsultoriaProgramacao && r?.ativo !== false) {
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          ativo: false,
          status: 'INATIVA_DUPLICADA',
          valor_rubrica: money(r.valor_rubrica || r.valor_total || 0),
          valor_total: money(r.valor_rubrica || r.valor_total || 0),
          motivo_inativacao: 'Duplicada removida: manter Equipe e gestão → Consultoria de programação → R$ 30.000,00.'
        });
        inativadas++;
        consultoriasProgramacaoInativadas++;
        continue;
      }

      if (is3Aditivo(r) && !ehOficialAtual && r?.ativo !== false) {
        await base44.asServiceRole.entities.Rubrica.update(r.id, {
          ativo: false,
          status: 'INATIVA_FORA_BASE_OFICIAL',
          motivo_inativacao: 'Rubrica antiga do 3º Aditivo substituída pela base oficial de 52 linhas.'
        });
        inativadas++;
      }
    }

    rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 3000);

    const oficiaisAtivas = (rubricas || []).filter((r: any) => oficiaisKeys.has(rubricaKey(r)) && r?.ativo !== false);
    const acumulado: Record<string, number> = {};

    for (const p of purchases || []) {
      if (!p?.rubrica_id) continue;
      if (!isStatusAprovado(p.status)) continue;
      if (p?.duplicada === true) continue;

      const valor = getPurchaseValue(p);
      if (valor <= 0) continue;

      acumulado[p.rubrica_id] = money((acumulado[p.rubrica_id] || 0) + valor);
    }

    for (const r of oficiaisAtivas) {
      const total = money(r.valor_rubrica || r.valor_total);
      const utilizado = money(acumulado[r.id] || 0);
      const saldo = money(total - utilizado);
      const percentual = total > 0 ? money((utilizado / total) * 100) : 0;

      await base44.asServiceRole.entities.Rubrica.update(r.id, {
        valor_rubrica: total,
        valor_total: total,
        valor_utilizado: utilizado,
        saldo_comprometido: 0,
        valor_comprometido: 0,
        saldo,
        saldo_real: saldo,
        percentual_utilizado: percentual,
        regra_financeira: 'APROVADO = UTILIZADO',
        recalculado_em: new Date().toISOString()
      });
    }

    const totalAtivo = money(oficiaisAtivas.reduce((acc: number, r: any) => acc + money(r.valor_rubrica || r.valor_total), 0));

    return json({
      success: true,
      totalOficial: TOTAL_OFICIAL,
      totalBase,
      totalAtivo,
      totalRubricasOficiais: RUBRICAS_OFICIAIS.length,
      criadas,
      atualizadas,
      inativadas,
      consultoriasProgramacaoInativadas,
      regra: 'APROVADO = UTILIZADO',
      ajuste: 'Mantida Equipe e gestão → Consultoria de programação → R$ 30.000,00; inativada Consultorias → Consultoria de programação quando existir.'
    });
  } catch (error: any) {
    console.error('recalculateAllRubricas error:', error);

    return json(
      {
        success: false,
        error: error?.message || 'Erro ao restaurar e recalcular rubricas.'
      },
      500
    );
  }
});
