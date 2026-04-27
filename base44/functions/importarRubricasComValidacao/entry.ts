import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ORCAMENTO_TOTAL = 1320000;

/**
 * Normaliza chave de rubrica
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
    
    if (user?.role !== 'admin' && user?.role !== 'COORDENADOR') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { rubricas } = await req.json();

    if (!Array.isArray(rubricas) || rubricas.length === 0) {
      return Response.json({ error: 'Nenhuma rubrica para importar' }, { status: 400 });
    }

    // Buscar rubricas existentes
    const rubricasExistentes = await base44.entities.Rubrica.list();
    const rubricasAtivas = rubricasExistentes.filter(r => r.ativo !== false);

    const relatorio = {
      total: rubricas.length,
      importadas: 0,
      duplicadas: [],
      erros: [],
      atualizacoes: 0,
    };

    let totalOrcamentarioNovo = rubricasAtivas.reduce((sum, r) => sum + (r.valor_total || 0), 0);

    // Validar cada rubrica
    for (const rubrica of rubricas) {
      try {
        const { grupo, nome, centro_custo, valor_total, museu } = rubrica;

        if (!grupo || !nome || valor_total === undefined) {
          relatorio.erros.push({
            rubrica: `${grupo} ${nome}`,
            motivo: 'Campos obrigatórios faltando'
          });
          continue;
        }

        const chaveNova = normalizarChaveRubrica(grupo, nome, centro_custo);

        // Verificar duplicata
        const duplicada = rubricasAtivas.find(r => {
          const chaveExistente = normalizarChaveRubrica(r.grupo, r.nome, r.centro_custo);
          return chaveExistente === chaveNova;
        });

        if (duplicada) {
          relatorio.duplicadas.push({
            rubrica: `${grupo} ${nome}`,
            existente: `${duplicada.grupo} ${duplicada.nome}`,
            valor: valor_total
          });
          continue;
        }

        // Verificar orçamento
        if (totalOrcamentarioNovo + valor_total > ORCAMENTO_TOTAL) {
          relatorio.erros.push({
            rubrica: `${grupo} ${nome}`,
            motivo: `Ultrapassa orçamento (disponível: R$ ${(ORCAMENTO_TOTAL - totalOrcamentarioNovo).toLocaleString('pt-BR')})`
          });
          continue;
        }

        // Criar rubrica
        await base44.asServiceRole.entities.Rubrica.create({
          grupo,
          nome,
          centro_custo: centro_custo || '',
          valor_total: parseFloat(valor_total),
          museu: museu || '',
          ativo: true,
          created_by: user.email
        });

        totalOrcamentarioNovo += valor_total;
        relatorio.importadas++;

      } catch (error) {
        relatorio.erros.push({
          rubrica: rubrica.nome,
          motivo: error.message
        });
      }
    }

    // Registrar auditoria
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'IMPORT',
      entity_type: 'RUBRICA',
      entity_id: 'BULK_IMPORT',
      actor_email: user.email,
      actor_name: user.full_name,
      details: `Importação em lote: ${relatorio.importadas} importadas, ${relatorio.duplicadas.length} duplicadas, ${relatorio.erros.length} erros`
    });

    return Response.json({
      sucesso: relatorio.importadas > 0,
      relatorio,
      totalOrcamentarioNovo
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});