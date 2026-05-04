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

// ❌ REMOVIDA: Consultoria de programação (30000)
const RUBRICAS_OFICIAIS = [
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

    for (let i = 0; i < RUBRICAS_OFICIAIS.length; i++) {
      const item = RUBRICAS_OFICIAIS[i];
      const key = rubricaKey(item);
      const existentes = existentesPorChave[key] || [];
      const principal = existentes[0];
      const total = money(item.valor_rubrica);

      const payload = {
        codigo: `3AD-${String(i + 1).padStart(3, '0')}`,
        grupo: item.grupo,
        rubrica: item.rubrica,
        valor_rubrica: total,
        valor_total: total,
        oficial_3_aditivo: true,
        ativo: true,
        ordem_exibicao: i + 1
      };

      if (principal?.id) {
        await base44.asServiceRole.entities.Rubrica.update(principal.id, payload);
      } else {
        await base44.asServiceRole.entities.Rubrica.create({
          ...payload,
          valor_utilizado: 0,
          saldo: total
        });
      }
    }

    rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 3000);

    const acumulado: Record<string, number> = {};

    for (const p of purchases || []) {
      if (!p?.rubrica_id) continue;
      if (!isStatusAprovado(p.status)) continue;

      const valor = getPurchaseValue(p);
      if (valor <= 0) continue;

      acumulado[p.rubrica_id] = money((acumulado[p.rubrica_id] || 0) + valor);
    }

    for (const r of rubricas || []) {
      if (!oficiaisKeys.has(rubricaKey(r))) continue;

      const total = money(r.valor_rubrica || r.valor_total);
      const utilizado = money(acumulado[r.id] || 0);
      const saldo = money(total - utilizado);

      await base44.asServiceRole.entities.Rubrica.update(r.id, {
        valor_utilizado: utilizado,
        saldo,
        saldo_real: saldo,
        percentual_utilizado: total > 0 ? (utilizado / total) * 100 : 0
      });
    }

    return json({ success: true });
  } catch (error: any) {
    console.error('recalculateAllRubricas error:', error);
    return json({ success: false, error: error?.message }, 500);
  }
});
