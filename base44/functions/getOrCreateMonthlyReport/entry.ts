import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getOrCreateMonthlyReport
 * Localiza o relatório mensal do utilizador logado para o mês/ano informado.
 * Se não existir, cria automaticamente um rascunho.
 * Payload: { mes_referencia, ano }
 */

function normalizeReport(report: any = {}) {
  return {
    ...report,
    atividades: Array.isArray(report?.atividades)
      ? report.atividades.map((item: any) => ({ ...item }))
      : [],
    oportunidades: Array.isArray(report?.oportunidades)
      ? report.oportunidades.map((item: any) => ({ ...item }))
      : [],
    momentos: Array.isArray(report?.momentos)
      ? report.momentos.map((item: any) => ({ ...item }))
      : [],
    resumo_executivo: report?.resumo_executivo || '',
    avaliacao_pontos_positivos: report?.avaliacao_pontos_positivos || '',
    avaliacao_desafios: report?.avaliacao_desafios || '',
    avaliacao_sugestoes: report?.avaliacao_sugestoes || '',
    return_comment: report?.return_comment || '',
    status: report?.status || 'DRAFT',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { mes_referencia, ano } = await req.json();

    if (!mes_referencia || !ano) {
      return Response.json(
        { error: 'Parâmetros obrigatórios: mes_referencia, ano' },
        { status: 400 }
      );
    }

    // Buscar relatórios do mês/ano e localizar o do usuário atual
    const existentes = await base44.asServiceRole.entities.Report.filter({
      mes_referencia,
      ano,
    });

    const relatorioDoUsuario = (existentes || []).find((report: any) => {
      return (
        report?.created_by === user.email ||
        report?.author_email === user.email ||
        report?.user_email === user.email ||
        report?.author_name === user.full_name
      );
    });

    if (relatorioDoUsuario) {
      return Response.json({
        report: normalizeReport(relatorioDoUsuario),
        created: false,
      });
    }

    // Gerar número de protocolo
    const MESES_ABREV: Record<string, string> = {
      Janeiro: 'JAN',
      Fevereiro: 'FEV',
      Março: 'MAR',
      Abril: 'ABR',
      Maio: 'MAI',
      Junho: 'JUN',
      Julho: 'JUL',
      Agosto: 'AGO',
      Setembro: 'SET',
      Outubro: 'OUT',
      Novembro: 'NOV',
      Dezembro: 'DEZ',
    };

    const mesAbrev =
      MESES_ABREV[mes_referencia] || String(mes_referencia).substring(0, 3).toUpperCase();

    const allReports = await base44.asServiceRole.entities.Report.list('-created_date', 9999);
    const seq = String((allReports || []).length + 1).padStart(5, '0');
    const numero_protocolo = `MC-${mesAbrev}${ano}-${seq}`;

    // Criar relatório rascunho automaticamente
    const novoRelatorio = await base44.asServiceRole.entities.Report.create({
      author_name: user.full_name || '',
      author_email: user.email || '',
      user_email: user.email || '',
      museu: user.museu || '',
      funcao: user.funcao || '',
      mes_referencia,
      ano,
      status: 'DRAFT',
      numero_protocolo,
      resumo_executivo: '',
      atividades: [],
      oportunidades: [],
      momentos: [],
      avaliacao_pontos_positivos: '',
      avaliacao_desafios: '',
      avaliacao_sugestoes: '',
      return_comment: '',
    });

    return Response.json({
      report: normalizeReport(novoRelatorio),
      created: true,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
});
