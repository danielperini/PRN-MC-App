import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function calcularSimilaridade(texto1, texto2) {
  const t1 = texto1.toLowerCase();
  const t2 = texto2.toLowerCase();
  
  // Buscar palavras-chave em comum
  const palavras1 = new Set(t1.split(/\s+/).filter(p => p.length > 3));
  const palavras2 = new Set(t2.split(/\s+/).filter(p => p.length > 3));
  
  const interseccao = [...palavras1].filter(p => palavras2.has(p));
  const uniao = new Set([...palavras1, ...palavras2]);
  
  const jaccard = (interseccao.length / uniao.size) * 100;
  
  // Bonus por museu em comum
  let bonusMus = 0;
  if (t1.includes('mhab') && t2.includes('mhab')) bonusMus += 20;
  if (t1.includes('mis') && t2.includes('mis')) bonusMus += 20;
  if (t1.includes('mumo') && t2.includes('mumo')) bonusMus += 20;
  
  // Bonus por tipo de atividade
  let bonusTipo = 0;
  const tipos = ['oficina', 'palestra', 'exposição', 'workshop', 'visita', 'evento'];
  for (const tipo of tipos) {
    if (t1.includes(tipo) && t2.includes(tipo)) {
      bonusTipo += 15;
    }
  }
  
  return Math.min(100, jaccard + bonusMus + bonusTipo);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Obter releases não processados
    const releases = await base44.asServiceRole.entities.Release.filter({
      status: 'novo'
    });
    
    if (releases.length === 0) {
      return Response.json({ mensagem: 'Nenhum release para processar' });
    }
    
    let vinculados = 0;
    
    for (const release of releases) {
      try {
        // Buscar atividades do mesmo período e museu
        const atividades = await base44.asServiceRole.entities.Activity.filter({});
        
        // Calcular similaridade e vincular se > 40%
        const matches = atividades
          .map(ativ => ({
            activity_id: ativ.id,
            titulo_atividade: ativ.titulo,
            confianca: calcularSimilaridade(
              `${release.titulo} ${release.conteudo_resumido || ''}`,
              `${ativ.titulo} ${ativ.descricao || ''}`
            )
          }))
          .filter(m => m.confianca >= 40)
          .sort((a, b) => b.confianca - a.confianca);
        
        // Atualizar release
        if (matches.length > 0) {
          await base44.asServiceRole.entities.Release.update(release.id, {
            atividades_vinculadas: matches.slice(0, 5),
            status: 'vinculado'
          });
          vinculados++;
        } else {
          await base44.asServiceRole.entities.Release.update(release.id, {
            status: 'indexado'
          });
        }
        
      } catch (e) {
        console.error(`Erro ao processar release ${release.id}: ${e.message}`);
      }
    }
    
    return Response.json({
      success: true,
      processados: releases.length,
      vinculados,
      mensagem: `${vinculados} releases vinculados a atividades`
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});