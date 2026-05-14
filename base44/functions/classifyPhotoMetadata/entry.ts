import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { reportPhotoId, activityId, reportId, fileName } = await req.json();

    if (!reportPhotoId) {
      return Response.json({ error: 'reportPhotoId required' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obter dados da atividade se vinculada
    let classifiedMuseu = 'GERAL';
    let classifiedActivity = 'Sem Classificação';
    let classifiedMonth = new Date().toISOString().split('-').slice(0, 2).join('-');

    if (activityId) {
      try {
        const activity = await base44.entities.Activity.get(activityId);
        if (activity) {
          classifiedActivity = activity.titulo || 'Sem Classificação';
          if (activity.report_id) {
            const report = await base44.entities.Report.get(activity.report_id);
            if (report) {
              classifiedMuseu = report.museu || 'GERAL';
              // Formatar mês como MM-YYYY
              const mesNum = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                             'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
                .indexOf(report.mes_referencia) + 1;
              classifiedMonth = String(mesNum).padStart(2, '0') + '-' + report.ano;
            }
          }
        }
      } catch (e) {
        console.warn('Could not classify from activity:', e.message);
      }
    }

    // Obter dados do relatório se vinculado
    if (reportId && classifiedMuseu === 'GERAL') {
      try {
        const report = await base44.entities.Report.get(reportId);
        if (report) {
          classifiedMuseu = report.museu || 'GERAL';
          const mesNum = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                         'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
            .indexOf(report.mes_referencia) + 1;
          classifiedMonth = String(mesNum).padStart(2, '0') + '-' + report.ano;
        }
      } catch (e) {
        console.warn('Could not classify from report:', e.message);
      }
    }

    // Atualizar metadados
    await base44.entities.ReportPhoto.update(reportPhotoId, {
      classified_museu: classifiedMuseu,
      classified_activity: classifiedActivity,
      classified_month: classifiedMonth,
      auto_classified_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      classified: {
        museu: classifiedMuseu,
        activity: classifiedActivity,
        month: classifiedMonth,
      },
    });
  } catch (error) {
    console.error('Classify photo error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});