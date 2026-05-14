import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function validarDadosRelatorio(base44, report) {
  const issues = [];
  const alertas = [];

  // Validar números
  if (report.publico_geral_declarado && report.publico_geral_declarado < 0) {
    issues.push('Público geral negativo detectado');
  }

  // Validar atividades
  if (report.atividades && Array.isArray(report.atividades)) {
    const atividadesIds = report.atividades.map(a => a.id || a).filter(Boolean);
    
    for (const atividadeId of atividadesIds) {
      try {
        const atividade = await base44.asServiceRole.entities.Activity.get('', atividadeId);
        if (!atividade) {
          issues.push(`Atividade ${atividadeId} não encontrada`);
        } else if (atividade.publico_total && atividade.publico_total < 0) {
          issues.push(`Atividade ${atividade.titulo} tem público negativo`);
        }
      } catch {
        issues.push(`Erro ao validar atividade ${atividadeId}`);
      }
    }
  }

  // Validar fotos
  if (report.fotos && Array.isArray(report.fotos)) {
    for (const foto of report.fotos) {
      if (!foto.url && !foto.file_url) {
        issues.push(`Foto "${foto.fileName || foto.file_name || 'sem nome'}" sem URL`);
      }
    }
  }

  // Validar período
  if (!report.mes_referencia || !report.ano) {
    issues.push('Período do relatório incompleto');
  }

  // Validar museu
  if (!report.museu) {
    alertas.push('Museu não especificado');
  }

  // Validar datas de atividades
  if (report.atividades && Array.isArray(report.atividades)) {
    for (const atividade of report.atividades) {
      if (atividade.data_realizacao) {
        const dataAtiv = new Date(atividade.data_realizacao);
        const mesMap = {
          'Janeiro': 0, 'Fevereiro': 1, 'Março': 2, 'Abril': 3,
          'Maio': 4, 'Junho': 5, 'Julho': 6, 'Agosto': 7,
          'Setembro': 8, 'Outubro': 9, 'Novembro': 10, 'Dezembro': 11
        };
        const mesRel = mesMap[report.mes_referencia];
        if (dataAtiv.getMonth() !== mesRel) {
          alertas.push(`Atividade "${atividade.titulo}" em período diferente`);
        }
      }
    }
  }

  // Validar releases
  try {
    const releases = await base44.asServiceRole.entities.Release.filter({
      mes: report.mes_referencia,
      ano: report.ano
    });
    
    if (releases.length === 0) {
      alertas.push('Nenhum release encontrado para este período');
    }
  } catch {
    alertas.push('Não foi possível verificar releases');
  }

  return { issues, alertas };
}

async function contarValidacoesBaixaConfianca(base44, reportId) {
  try {
    const validacoes = await base44.asServiceRole.entities.TrustValidation.filter({
      report_id: reportId,
      nivel_confianca: 'BAIXA'
    });
    
    return validacoes.length;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reportId } = await req.json();

    if (!reportId) {
      return Response.json({ error: 'reportId obrigatório' }, { status: 400 });
    }

    const report = await base44.asServiceRole.entities.Report.get('', reportId);
    if (!report) {
      return Response.json({ error: 'Relatório não encontrado' }, { status: 404 });
    }

    const { issues, alertas } = await validarDadosRelatorio(base44, report);
    const validacoesBaixas = await contarValidacoesBaixaConfianca(base44, reportId);
    const podeExportar = issues.length === 0 && validacoesBaixas === 0;

    return Response.json({
      success: true,
      podeExportar,
      issues,
      alertas,
      validacoesBaixas,
      recomendacoes: [
        ...issues.map(i => `❌ CRÍTICO: ${i}`),
        ...alertas.map(a => `⚠️  ATENÇÃO: ${a}`),
        ...(validacoesBaixas > 0 ? [`⚠️  ${validacoesBaixas} dados com baixa confiança`] : [])
      ],
      mensagem: podeExportar 
        ? '✅ Relatório aprovado para exportação' 
        : `❌ ${issues.length} problema(s) crítico(s). Revisão recomendada.`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});