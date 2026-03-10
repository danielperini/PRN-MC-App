import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar todas as atividades aprovadas
    const reports = await base44.asServiceRole.entities.Report.filter({ status: 'APPROVED' });
    const reportIds = reports.map(r => r.id);

    if (reportIds.length === 0) {
      return Response.json({ duplicates: [] });
    }

    const activities = await base44.asServiceRole.entities.Activity.filter({});
    const approvedActivities = activities.filter(a => reportIds.includes(a.report_id));

    const duplicates = [];

    // Comparar atividades em pares
    for (let i = 0; i < approvedActivities.length; i++) {
      for (let j = i + 1; j < approvedActivities.length; j++) {
        const act1 = approvedActivities[i];
        const act2 = approvedActivities[j];

        // Pular se forem do mesmo relatório
        if (act1.report_id === act2.report_id) continue;

        const riskScore = calculateDuplicationRisk(act1, act2);

        if (riskScore > 80) {
          duplicates.push({
            activity1_id: act1.id,
            activity1_titulo: act1.titulo,
            activity1_report_id: act1.report_id,
            activity2_id: act2.id,
            activity2_titulo: act2.titulo,
            activity2_report_id: act2.report_id,
            risk_score: riskScore,
            public_match: Math.abs((act1.publico_total || 0) - (act2.publico_total || 0)) < 10,
            date_proximity: Math.abs(new Date(act1.data_realizacao) - new Date(act2.data_realizacao)) < 86400000, // 1 dia
          });
        }
      }
    }

    return Response.json({ duplicates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function calculateDuplicationRisk(act1, act2) {
  let score = 0;

  // Similaridade de título (40%)
  const titleSimilarity = stringSimilarity(
    (act1.titulo || '').toLowerCase(),
    (act2.titulo || '').toLowerCase()
  );
  score += titleSimilarity * 40;

  // Similaridade de descrição (20%)
  const descSimilarity = stringSimilarity(
    (act1.descricao || '').toLowerCase(),
    (act2.descricao || '').toLowerCase()
  );
  score += descSimilarity * 20;

  // Mesmo tipo de atividade (15%)
  if (act1.tipo_equipe === act2.tipo_equipe) score += 15;

  // Público similar (15%)
  const pub1 = act1.publico_total || 0;
  const pub2 = act2.publico_total || 0;
  const maxPub = Math.max(pub1, pub2);
  if (maxPub > 0) {
    const pubSimilarity = 1 - Math.abs(pub1 - pub2) / maxPub;
    score += Math.max(0, pubSimilarity) * 15;
  }

  // Data próxima (10%)
  const date1 = new Date(act1.data_realizacao);
  const date2 = new Date(act2.data_realizacao);
  const daysDiff = Math.abs((date1 - date2) / (1000 * 60 * 60 * 24));
  if (daysDiff <= 7) score += 10;
  else if (daysDiff <= 14) score += 5;

  return Math.round(score);
}

function stringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}