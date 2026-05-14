import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function buscarReleasesRelevantes(base44, mes, ano, museu) {
  const releases = await base44.asServiceRole.entities.Release.filter({
    mes,
    ano,
    ativo: true
  });
  
  // Filtrar por museu se aplicável
  return releases.filter(r => !museu || r.museus.includes(museu));
}

async function buscarAtividadesAprovadas(base44, reportId) {
  const report = await base44.asServiceRole.entities.Report.get('', reportId);
  if (!report || !report.atividades) return [];
  
  const atividades = await Promise.all(
    report.atividades.map(a => 
      base44.asServiceRole.entities.Activity.get('', a).catch(() => null)
    )
  );
  
  return atividades.filter(a => a && a.classificacao);
}

async function buscarProgramacaoRelevante(base44, mes, ano, museu) {
  const programacoes = await base44.asServiceRole.entities.Programacao.filter({});
  
  return programacoes.filter(p => {
    if (!p.data_inicio) return false;
    const data = new Date(p.data_inicio);
    if (data.getFullYear() !== ano) return false;
    if (data.getMonth() + 1 !== ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].indexOf(mes) + 1) return false;
    return !museu || p.museu === museu;
  });
}

function gerarIntroducaoEditorial(releases, atividades, programacao, mes, ano) {
  if (releases.length === 0) return null;
  
  // Extrair temas principais dos releases
  const temas = [];
  releases.forEach(r => {
    if (r.tipos_atividade) temas.push(...r.tipos_atividade);
  });
  
  const temasUnicos = [...new Set(temas)];
  const temasStr = temasUnicos.slice(0, 3).join(', ');
  
  return `Em ${mes} de ${ano}, a instituição consolidou suas operações em torno de ${temasStr}. A programação refletiu o compromisso com a diversidade de públicos e a qualidade editorial, conforme documentado nos releases e atividades do período. ${releases.length} iniciativas editoriais principais marcaram o mês.`;
}

function gerarResumoExecutivo(releases, dados) {
  const destaque = releases
    .filter(r => r.conteudo_resumido || r.conteudo_completo)
    .slice(0, 2)
    .map(r => {
      const texto = r.conteudo_resumido || r.conteudo_completo.substring(0, 500);
      return `**${r.titulo}**: ${texto.substring(0, 250)}...`;
    })
    .join('\n\n');
  
  return destaque || null;
}

function gerarNarrativaMetas(atividades) {
  const metas = atividades
    .filter(a => a.classificacao === 'META')
    .slice(0, 5);
  
  if (metas.length === 0) return null;
  
  const narrativa = metas
    .map(m => `${m.titulo}: ${m.resultado_alcancado || m.status_meta}`)
    .join('; ');
  
  return `Metas alcançadas: ${narrativa}`;
}

function vincularReleaseAAtividade(releases, atividades) {
  return releases.map(r => {
    const atividadesRelacionadas = atividades.filter(a => {
      if (!r.tipos_atividade || r.tipos_atividade.length === 0) return false;
      return r.tipos_atividade.some(tipo => a.titulo.toLowerCase().includes(tipo));
    });
    
    return {
      ...r,
      atividades_relacionadas: atividadesRelacionadas.slice(0, 3)
    };
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId, mes, ano, museu } = await req.json();
    
    if (!reportId || !mes || !ano) {
      return Response.json({ 
        error: 'Parâmetros obrigatórios: reportId, mes, ano' 
      }, { status: 400 });
    }

    // Buscar dados relevantes
    const [releases, atividades, programacao] = await Promise.all([
      buscarReleasesRelevantes(base44, mes, ano, museu),
      buscarAtividadesAprovadas(base44, reportId),
      buscarProgramacaoRelevante(base44, mes, ano, museu)
    ]);

    // Gerar conteúdo editorial via IA
    const prompt = `Crie introdução editorial para relatório de ${mes}/${ano} com:
- ${releases.length} releases publicados
- ${atividades.length} atividades realizadas
- ${programacao.length} programações

Introdução deve:
1. Conectar temas principais dos releases
2. Destacar alcance e participação
3. Refletir qualidade editorial

1 parágrafo denso, tom institucional.`;

    const introducao = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      model: 'gemini_3_flash'
    });

    const resumo = releases.filter(r => r.conteudo_resumido).slice(0, 2).map(r => `**${r.titulo}**: ${r.conteudo_resumido}`).join('\n\n') || null;
    const narrativaMetas = atividades.filter(a => a.classificacao === 'META').slice(0, 3).map(m => `${m.titulo}: alcançado`).join('; ') || null;
    const releasesVinculados = vincularReleaseAAtividade(releases, atividades);

    return Response.json({
      success: true,
      editorial: {
        introducao,
        resumoExecutivo: resumo,
        narrativaMetas,
        releases: releasesVinculados.slice(0, 5),
        totalReleases: releases.length,
        totalAtividades: atividades.length,
        totalProgramacoes: programacao.length
      }
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});