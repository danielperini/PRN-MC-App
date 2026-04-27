import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Normaliza chave de rubrica para detectar duplicatas
 */
function normalizarChaveRubrica(grupo, nome, centroCusto = '') {
  let chave = `${grupo || ''} ${nome || ''} ${centroCusto || ''}`.trim();
  
  return chave
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/mês (\d+) ao m[êe]s? (\d+)/g, 'mes $1 ao $2')
    .replace(/[(),\.]/g, '')
    .trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Buscar todas as rubricas ativas
    const rubricas = await base44.entities.Rubrica.list();
    const rubricasAtivas = rubricas.filter(r => r.ativo !== false);

    // Agrupar por chave normalizada
    const grupos = {};
    rubricasAtivas.forEach(r => {
      const chave = normalizarChaveRubrica(r.grupo, r.nome, r.centro_custo);
      if (!grupos[chave]) {
        grupos[chave] = [];
      }
      grupos[chave].push(r);
    });

    // Encontrar duplicatas
    const duplicadas = [];
    Object.entries(grupos).forEach(([chave, rubricas]) => {
      if (rubricas.length > 1) {
        const valorTotalDuplicado = rubricas.reduce((sum, r) => sum + (r.valor_total || 0), 0);
        duplicadas.push({
          chaveNormalizada: chave,
          quantidade: rubricas.length,
          valorTotalDuplicado,
          rubricas: rubricas.map(r => ({
            id: r.id,
            grupo: r.grupo,
            nome: r.nome,
            centro_custo: r.centro_custo,
            valor_total: r.valor_total,
            created_date: r.created_date,
            created_by: r.created_by,
          })),
          sugestao: `Manter: ${rubricas[0].grupo} ${rubricas[0].nome}. Inativar: ${rubricas.slice(1).map(r => r.id).join(', ')}`
        });
      }
    });

    // Calcular total duplicado
    const totalDuplicado = duplicadas.reduce((sum, d) => sum + (d.valorTotalDuplicado - (d.rubricas[0]?.valor_total || 0)), 0);

    // Registrar auditoria
    if (duplicadas.length > 0) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'AUDIT',
        entity_type: 'RUBRICA',
        entity_id: 'DUPLICATAS_DETECTADAS',
        actor_email: user.email,
        actor_name: user.full_name,
        details: `Auditoria detectou ${duplicadas.length} grupos de rubricas duplicadas. Total duplicado: R$ ${totalDuplicado.toLocaleString('pt-BR')}`
      });
    }

    return Response.json({
      totalDuplicatas: duplicadas.length,
      totalDuplicado,
      duplicadas
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});