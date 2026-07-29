import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Aliases conhecidos de centro_custo que devem ser normalizados para 'Noturno 2026'
const NOTURNO_ALIASES = [
  'Noturno nos Museus 2026',
  'Noturno nos Museus',
  'noturno 2026',
  'noturno nos museus',
  'Noturno nos Museus 2025',
  'noturno',
];

function isNoturnoPampulha(cc: string): boolean {
  const low = cc.toLowerCase();
  return low.includes('noturno') && (low.includes('pampulha') || low.includes('4'));
}

function isNoturo2026Alias(cc: string): boolean {
  const low = cc.toLowerCase();
  return low.includes('noturno') && !isNoturnoPampulha(cc);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch {}
    const { confirmar = false } = body as { confirmar?: boolean };

    // 1. Buscar todas as PurchaseRequests com status aprovado/pago
    const allPurchases = await base44.asServiceRole.entities.PurchaseRequest.filter(
      { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] } },
      '-created_date',
      3000
    );

    // 2. Identificar as que têm alias de Noturno errado
    const paraCorrigirNoturno2026: string[] = [];
    const paraCorrigirNoturnoPampulha: string[] = [];
    for (const p of allPurchases) {
      const cc = String(p.centro_custo || '');
      if (!cc) continue;
      if (cc === 'Noturno 2026' || cc === 'Noturno Pampulha') continue; // já correto
      if (isNoturnoPampulha(cc)) paraCorrigirNoturnoPampulha.push(p.id);
      else if (isNoturo2026Alias(cc)) paraCorrigirNoturno2026.push(p.id);
    }

    // 3. Buscar rubricas com grupo vazio/nulo e valor zero
    const allRubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 1500);
    const rubricasSemGrupo = allRubricas.filter((r: Record<string, unknown>) =>
      (!r.grupo || String(r.grupo).trim() === '') && r.ativo !== false
    );
    const rubricasSemGrupoZeradas = rubricasSemGrupo.filter((r: Record<string, unknown>) => {
      const val = Number(r.valor_rubrica || r.valor_total || 0);
      const util = Number(r.valor_utilizado || 0);
      return val === 0 && util === 0;
    });

    // 4. Detecção de rubricas com nome inválido (só números / texto sem sentido)
    const rubricasNomeInvalido = allRubricas.filter((r: Record<string, unknown>) => {
      const nome = String(r.rubrica || r.nome || '').trim();
      if (!nome) return false;
      // Nome inválido: começa com número e contém sequência numérica longa com texto misturado
      return /^\d+\s+\w+\s+\d+/.test(nome) || /^[\d\s]+$/.test(nome);
    });

    let comprasCorrigidasNoturno = 0;
    let comprasCorrigidasPampulha = 0;
    let rubricasDesativadas = 0;

    if (confirmar) {
      // Corrigir centro_custo das compras Noturno 2026
      for (const id of paraCorrigirNoturno2026) {
        await base44.asServiceRole.entities.PurchaseRequest.update(id, { centro_custo: 'Noturno 2026' });
        comprasCorrigidasNoturno++;
      }
      // Corrigir Noturno Pampulha
      for (const id of paraCorrigirNoturnoPampulha) {
        await base44.asServiceRole.entities.PurchaseRequest.update(id, { centro_custo: 'Noturno Pampulha' });
        comprasCorrigidasPampulha++;
      }
      // Desativar rubricas sem grupo e zeradas
      for (const r of rubricasSemGrupoZeradas) {
        await base44.asServiceRole.entities.Rubrica.update(r.id, { ativo: false });
        rubricasDesativadas++;
      }
    }

    return Response.json({
      success: true,
      diagnostico: {
        compras_alias_noturno2026: paraCorrigirNoturno2026.length,
        compras_alias_pampulha: paraCorrigirNoturnoPampulha.length,
        rubricas_sem_grupo: rubricasSemGrupo.length,
        rubricas_sem_grupo_zeradas: rubricasSemGrupoZeradas.length,
        rubricas_nome_invalido: rubricasNomeInvalido.length,
        exemplos_nome_invalido: rubricasNomeInvalido.slice(0, 5).map((r: Record<string, unknown>) => ({
          id: r.id,
          nome: r.rubrica || r.nome,
          valor: r.valor_rubrica || r.valor_total,
        })),
      },
      correcoes_aplicadas: confirmar ? {
        comprasCorrigidasNoturno,
        comprasCorrigidasPampulha,
        rubricasDesativadas,
      } : null,
      mensagem: confirmar
        ? `Corrigido: ${comprasCorrigidasNoturno} NFs Noturno 2026, ${comprasCorrigidasPampulha} NFs Noturno Pampulha, ${rubricasDesativadas} rubricas sem grupo desativadas.`
        : `Diagnóstico: ${paraCorrigirNoturno2026.length + paraCorrigirNoturnoPampulha.length} NFs com alias incorreto, ${rubricasSemGrupoZeradas.length} rubricas sem grupo zeradas para desativar.`,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});