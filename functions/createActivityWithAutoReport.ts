import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * createActivityWithAutoReport
 * Cria uma atividade na entidade Activity e vincula automaticamente
 * ao relatório mensal do utilizador logado (localizando ou criando o relatório).
 * Payload: { titulo, descricao, classificacao, data_realizacao, museu, equipe_responsavel, mes_referencia, ano, ...outros_campos }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const { mes_referencia, ano, ...atividadeData } = body;

    if (!mes_referencia || !ano) {
      return Response.json({ error: 'Parâmetros obrigatórios: mes_referencia, ano' }, { status: 400 });
    }

    if (!atividadeData.classificacao) {
      return Response.json({ error: 'Campo obrigatório: classificacao' }, { status: 400 });
    }

    // Localizar ou criar relatório mensal
    let report;
    const existentes = await base44.asServiceRole.entities.Report.filter({
      created_by: user.email,
      mes_referencia,
      ano,
    });

    if (existentes.length > 0) {
      report = existentes[0];
    } else {
      // Criar relatório rascunho
      const MESES_ABREV = {
        'Janeiro': 'JAN', 'Fevereiro': 'FEV', 'Março': 'MAR', 'Abril': 'ABR',
        'Maio': 'MAI', 'Junho': 'JUN', 'Julho': 'JUL', 'Agosto': 'AGO',
        'Setembro': 'SET', 'Outubro': 'OUT', 'Novembro': 'NOV', 'Dezembro': 'DEZ'
      };
      const mesAbrev = MESES_ABREV[mes_referencia] || mes_referencia.substring(0, 3).toUpperCase();
      const allReports = await base44.asServiceRole.entities.Report.list('-created_date', 9999);
      const seq = String(allReports.length + 1).padStart(5, '0');

      report = await base44.asServiceRole.entities.Report.create({
        author_name: user.full_name || '',
        museu: user.museu || '',
        funcao: user.funcao || '',
        mes_referencia,
        ano,
        status: 'DRAFT',
        numero_protocolo: `MC-${mesAbrev}${ano}-${seq}`,
        atividades: [],
        oportunidades: [],
      });
    }

    // Criar atividade vinculada ao relatório
    const atividade = await base44.asServiceRole.entities.Activity.create({
      report_id: report.id,
      user_email: user.email,
      ...atividadeData,
    });

    return Response.json({ atividade, report_id: report.id, report_created: existentes.length === 0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});