import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Mapeamento de museu_codigo -> centro_custo correto
const MUSEU_PARA_CENTRO = {
  'MIS': 'MIS BH',
  'MUMO': 'MUMO',
  'MHAB': 'MHAB',
  'GERAL': 'Geral/Transversal',
};

// Mapeamento de grupo -> centro_custo por grupo oficial
const GRUPO_PARA_CENTRO = {
  'Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus': 'Noturno nos Museus',
  'Publicações': 'Publicações',
  'Contratação de consultorias': 'Consultorias',
  'Despesas Gerais': 'Despesas Gerais',
};

function inferirCentroCusto(rubrica) {
  // 1. Pelo museu_codigo
  const museu = String(rubrica.museu_codigo || '').trim().toUpperCase();
  if (museu && MUSEU_PARA_CENTRO[museu]) return MUSEU_PARA_CENTRO[museu];

  // 2. Pelo grupo
  const grupo = String(rubrica.grupo || '').trim();
  if (grupo && GRUPO_PARA_CENTRO[grupo]) return GRUPO_PARA_CENTRO[grupo];

  // 3. Fallback geral
  return 'Geral/Transversal';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const rubricas = await base44.asServiceRole.entities.Rubrica.filter({ ativo: true });
    
    let corrigidas = 0;
    const log = [];

    for (const r of rubricas) {
      if (r.centro_custo === 'Atuação Geral' || !r.centro_custo) {
        const novoCentro = inferirCentroCusto(r);
        await base44.asServiceRole.entities.Rubrica.update(r.id, { centro_custo: novoCentro });
        corrigidas++;
        log.push({ id: r.id, rubrica: r.rubrica, museu_codigo: r.museu_codigo, grupo: r.grupo, centro_antigo: r.centro_custo, centro_novo: novoCentro });
        await new Promise(resolve => setTimeout(resolve, 80));
      }
    }

    return Response.json({ sucesso: true, corrigidas, log });
  } catch (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }
});