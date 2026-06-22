import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito à coordenação geral.' }, { status: 403 });
    }

    // Buscar todos os DocumentIntake ativos, ordenados por data de criação
    const all = await base44.asServiceRole.entities.DocumentIntake.filter(
      { status_registro: 'ATIVO' },
      '-created_date',
      1000
    );

    // Agrupar por file_name_original normalizado
    const grouped = {};
    for (const d of all) {
      const key = (d.file_name_original || '').toLowerCase().trim();
      if (!key) continue;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d);
    }

    let deletados = 0;
    const duplicados = [];

    for (const [name, recs] of Object.entries(grouped)) {
      if (recs.length <= 1) continue;

      // Ordenar do mais recente para o mais antigo
      recs.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''));
      const [keep, ...remove] = recs;

      duplicados.push({ nome: name, mantido: keep.id.slice(-8), removidos: remove.map(r => r.id.slice(-8)) });

      for (const r of remove) {
        try {
          await base44.asServiceRole.entities.DocumentIntake.delete(r.id);
          deletados++;
          await new Promise(resolve => setTimeout(resolve, 300)); // delay anti rate-limit
        } catch (e) {
          console.error(`Erro ao deletar ${r.id}:`, e.message);
        }
      }
    }

    return Response.json({
      success: true,
      totalAnalisados: all.length,
      gruposDuplicados: duplicados.length,
      deletados,
      exemplos: duplicados.slice(0, 20)
    });

  } catch (error) {
    console.error('limparDuplicatasEntradaUnica error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});