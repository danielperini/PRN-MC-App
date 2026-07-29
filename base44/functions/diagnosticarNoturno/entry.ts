import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Aliases de centro_custo que devem ser normalizados para 'Noturno 2026'
const NOTURNO_2026_ALIASES = [
  'Noturno nos Museus 2026',
  'Noturno nos Museus',
  'noturno 2026',
  'noturno nos museus',
  'Noturno nos museus 2026',
];

function isNoturnoAlias(cc: string): boolean {
  if (!cc) return false;
  const low = cc.toLowerCase().trim();
  // Já está normalizado
  if (cc.trim() === 'Noturno 2026') return false;
  // É algum alias do Noturno 2026 (não Pampulha)
  return (
    low.includes('noturno') &&
    !low.includes('pampulha') &&
    !low.includes('4') &&
    cc.trim() !== 'Noturno 2026'
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Buscar todas as PurchaseRequests com status aprovado/pago
    const compras = await base44.asServiceRole.entities.PurchaseRequest.filter(
      { status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] } },
      '-created_date',
      3000
    );

    // 2. Identificar compras com alias errado de Noturno
    const parasNormalizar = (compras || []).filter((c: any) => isNoturnoAlias(c.centro_custo));

    // 3. Normalizar em lote (até 50 por vez)
    let normalizadas = 0;
    const BATCH = 50;
    for (let i = 0; i < parasNormalizar.length; i += BATCH) {
      const lote = parasNormalizar.slice(i, i + BATCH);
      await Promise.all(
        lote.map((c: any) =>
          base44.asServiceRole.entities.PurchaseRequest.update(c.id, {
            centro_custo: 'Noturno 2026',
          }).catch(() => {})
        )
      );
      normalizadas += lote.length;
    }

    // 4. Buscar rubricas com grupo vazio/nulo
    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 2000);
    const rubricasSemGrupo = (rubricas || []).filter(
      (r: any) => r.ativo !== false && (!r.grupo || String(r.grupo).trim() === '')
    );

    // 5. Detectar rubricas com nome claramente inválido
    // Nome inválido: começa com número seguido de texto genérico não-rubrica
    const NOME_INVALIDO_REGEX = /^\d+\s+\w+\s+\d+/;
    const rubricasInvalidas = (rubricas || []).filter((r: any) => {
      const nome = String(r.rubrica || r.nome || '').trim();
      return NOME_INVALIDO_REGEX.test(nome) && nome.length < 30;
    });

    return Response.json({
      success: true,
      normalizacaoNoturno: {
        comprasAnalisadas: (compras || []).length,
        comprasNormalizadas: normalizadas,
        aliases: parasNormalizar.map((c: any) => ({
          id: c.id,
          descricao: c.descricao_item,
          centro_custo_antigo: c.centro_custo,
          centro_custo_novo: 'Noturno 2026',
        })),
      },
      rubricasSemGrupo: rubricasSemGrupo.map((r: any) => ({
        id: r.id,
        rubrica: r.rubrica || r.nome,
        centro_custo: r.centro_custo,
        valor_rubrica: r.valor_rubrica,
      })),
      rubricasInvalidas: rubricasInvalidas.map((r: any) => ({
        id: r.id,
        rubrica: r.rubrica || r.nome,
        grupo: r.grupo,
        centro_custo: r.centro_custo,
      })),
    });
  } catch (error) {
    console.error('diagnosticarNoturno error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});