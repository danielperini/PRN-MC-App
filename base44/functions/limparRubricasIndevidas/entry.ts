import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { confirmar = false } = await req.json().catch(() => ({}));

    // Busca todas as rubricas que NÃO são do 3º ou 4º Aditivo
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.list();

    const ORIGENS_VALIDAS = ['3º ADITIVO', '4º ADITIVO'];
    const indevidas = todasRubricas.filter((r) => {
      const origem = String(r.origem_recurso || '').trim();
      return origem !== '' && !ORIGENS_VALIDAS.includes(origem);
    });

    if (!confirmar) {
      // Modo preview — retorna lista sem deletar
      return Response.json({
        preview: true,
        total_indevidas: indevidas.length,
        rubricas: indevidas.map((r) => ({
          id: r.id,
          rubrica: r.rubrica || r.nome,
          grupo: r.grupo,
          origem_recurso: r.origem_recurso,
          valor_rubrica: r.valor_rubrica,
          ativo: r.ativo,
        })),
      });
    }

    // Modo real — deleta cada rubrica indevida
    const deletadas = [];
    const erros = [];

    for (const r of indevidas) {
      try {
        await base44.asServiceRole.entities.Rubrica.delete(r.id);
        deletadas.push({ id: r.id, rubrica: r.rubrica || r.nome, origem: r.origem_recurso });
      } catch (e) {
        erros.push({ id: r.id, rubrica: r.rubrica || r.nome, erro: e.message });
      }
    }

    return Response.json({
      preview: false,
      total_deletadas: deletadas.length,
      total_erros: erros.length,
      deletadas,
      erros,
      mensagem: `${deletadas.length} rubricas indevidas removidas permanentemente.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});