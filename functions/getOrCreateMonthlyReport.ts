import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getOrCreateMonthlyReport
 * Localiza o relatório mensal do utilizador logado para o mês/ano informado.
 * Se não existir, cria automaticamente um rascunho.
 * Payload: { mes_referencia, ano }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { mes_referencia, ano } = await req.json();

    if (!mes_referencia || !ano) {
      return Response.json({ error: 'Parâmetros obrigatórios: mes_referencia, ano' }, { status: 400 });
    }

    // Buscar relatório existente do utilizador para este mês/ano
    const existentes = await base44.asServiceRole.entities.Report.filter({
      created_by: user.email,
      mes_referencia,
      ano,
    });

    if (existentes.length > 0) {
      return Response.json({ report: existentes[0], created: false });
    }

    // Gerar número de protocolo
    const MESES_ABREV = {
      'Janeiro': 'JAN', 'Fevereiro': 'FEV', 'Março': 'MAR', 'Abril': 'ABR',
      'Maio': 'MAI', 'Junho': 'JUN', 'Julho': 'JUL', 'Agosto': 'AGO',
      'Setembro': 'SET', 'Outubro': 'OUT', 'Novembro': 'NOV', 'Dezembro': 'DEZ'
    };
    const mesAbrev = MESES_ABREV[mes_referencia] || mes_referencia.substring(0, 3).toUpperCase();
    const allReports = await base44.asServiceRole.entities.Report.list('-created_date', 9999);
    const seq = String(allReports.length + 1).padStart(5, '0');
    const numero_protocolo = `MC-${mesAbrev}${ano}-${seq}`;

    // Criar relatório rascunho automaticamente
    const novoRelatorio = await base44.asServiceRole.entities.Report.create({
      author_name: user.full_name || '',
      museu: user.museu || '',
      funcao: user.funcao || '',
      mes_referencia,
      ano,
      status: 'DRAFT',
      numero_protocolo,
      atividades: [],
      oportunidades: [],
    });

    return Response.json({ report: novoRelatorio, created: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});