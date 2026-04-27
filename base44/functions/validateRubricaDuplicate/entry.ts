import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Normaliza chave de rubrica para detectar duplicatas
 * Exemplo: "Material MIS / MUMO / MHAB (mês 19 ao 28)" → "material mis mumo mhab mes 19 ao 28"
 */
function normalizarChaveRubrica(grupo, nome, centroCusto = '') {
  let chave = `${grupo || ''} ${nome || ''} ${centroCusto || ''}`.trim();
  
  return chave
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remover acentos
    .replace(/\s+/g, ' ') // espaços duplicados → espaço único
    .replace(/mês (\d+) ao m[êe]s? (\d+)/g, 'mes $1 ao $2') // padronizar "mês 19 ao mês 28" → "mes 19 ao 28"
    .replace(/[(),\.]/g, '') // remover pontuação
    .trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { grupo, nome, centro_custo, rubrica_id_exclude } = await req.json();

    if (!grupo || !nome) {
      return Response.json({ error: 'grupo e nome são obrigatórios' }, { status: 400 });
    }

    const chaveNova = normalizarChaveRubrica(grupo, nome, centro_custo);

    // Buscar todas as rubricas ativas
    const todasRubricas = await base44.entities.Rubrica.list();
    const rubricasAtivas = todasRubricas.filter(r => r.ativo !== false);

    // Procurar duplicatas (excluindo a própria rubrica se for atualização)
    const duplicada = rubricasAtivas.find(r => {
      if (rubrica_id_exclude && r.id === rubrica_id_exclude) return false;
      
      const chaveExistente = normalizarChaveRubrica(r.grupo, r.nome, r.centro_custo);
      return chaveExistente === chaveNova;
    });

    if (duplicada) {
      return Response.json({
        isDuplicate: true,
        message: 'Já existe uma rubrica com este grupo, nome e centro de custo.',
        duplicate: {
          id: duplicada.id,
          grupo: duplicada.grupo,
          nome: duplicada.nome,
          centro_custo: duplicada.centro_custo,
          valor_total: duplicada.valor_total,
        }
      }, { status: 409 });
    }

    return Response.json({
      isDuplicate: false,
      message: 'Rubrica válida, sem duplicatas detectadas.'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});