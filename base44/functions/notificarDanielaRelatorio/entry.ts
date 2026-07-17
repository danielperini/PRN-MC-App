import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const reportId = payload.report_id || null;

    // Buscar o relatório criado para incluir o link
    let driveUrl = 'https://museos-centro.base44.app/BancoRelatorios';
    let reportInfo = '';
    if (reportId) {
      try {
        const report = await base44.asServiceRole.entities.Report.get(reportId);
        if (report?.drive_backup_relatorio_url) {
          driveUrl = report.drive_backup_relatorio_url;
        }
        reportInfo = `Relatório: ${report?.mes_referencia || ''} ${report?.ano || ''} — ${report?.museu || ''}`;
      } catch (_) {/* ignora se não achar */}
    }

    // Registrar relatório do Noturno 2026 no sistema (produção de Daniela)
    let novoRelatorioId = null;
    try {
      const existing = await base44.asServiceRole.entities.Report.filter({
        author_name: 'Daniela Isis de Souza Araújo',
        mes_referencia: 'junho',
        ano: 2026
      });
      if (!existing || existing.length === 0) {
        const novoRelatorio = await base44.asServiceRole.entities.Report.create({
          author_name: 'Daniela Isis de Souza Araújo',
          funcao: 'Produtor Cultural',
          museu: 'Noturno nos Museus',
          equipe: 'PRODUCAO',
          mes_referencia: 'junho',
          ano: 2026,
          tipo: 'mensal',
          status: 'SUBMITTED',
          submitted_at: new Date().toISOString(),
          resumo_executivo: 'Relatório Parcial — 11ª Edição Noturno nos Museus 2026. Período: maio a julho/2026. Data do Evento: 26/06/2026.',
          resumo_periodo: 'Coordenação e produção da 11ª edição do Noturno nos Museus 2026, realizado em 26/06/2026 com 35 instituições participantes, 90 atividades culturais e público estimado de 1.659 pessoas nos museus municipais. Foram realizadas visitas técnicas, articulação com centros culturais (16 CCs, aprox. 655 visitantes), logística de 37 veículos e distribuição de sinalização em 34 museus.',
          publico_geral_declarado: 1659,
          atividades: [
            {
              id: `noturno_atv_1`,
              titulo: 'Agenda de Reuniões e Visitas Técnicas — Noturno 2026',
              classificacao: 'META',
              descricao: 'Realização de 24 reuniões e visitas técnicas no período 29/04 a 24/06/2026, incluindo reuniões MROSC, visitas técnicas de iluminação e sonorização aos museus municipais.',
              data_inicio: '2026-04-29',
              data_fim: '2026-06-24',
              publico_total: 0,
              museu_lista: ['MHAB', 'MIS', 'MUMO']
            },
            {
              id: `noturno_atv_2`,
              titulo: 'Articulação Institucional — 35 Instituições Participantes',
              classificacao: 'META',
              descricao: 'Levantamento, consolidação e revisão da programação completa de 35 instituições. 90 atividades culturais entre shows, exposições, oficinas, visitas mediadas.',
              data_inicio: '2026-05-01',
              data_fim: '2026-06-26',
              publico_total: 1659,
              museu_lista: ['MHAB', 'MIS', 'MUMO']
            },
            {
              id: `noturno_atv_3`,
              titulo: 'Articulação com Centros Culturais — 16 CCs, 655 visitantes',
              classificacao: 'META',
              descricao: 'Logística de transporte para 16 Centros Culturais. 37 veículos contratados (24 vans, 11 micro-ônibus, 2 ônibus). Público aproximado de 655 pessoas.',
              data_inicio: '2026-06-01',
              data_fim: '2026-06-26',
              publico_total: 655,
              museu_lista: ['MHAB', 'MIS', 'MUMO']
            },
            {
              id: `noturno_atv_4`,
              titulo: 'Sinalização — Distribuição a 34 Museus',
              classificacao: 'META',
              descricao: 'Orçamentação e distribuição de windbanners e bandeirolas nos 34 museus e centros de referência participantes.',
              data_inicio: '2026-06-20',
              data_fim: '2026-06-27',
              publico_total: 0,
              museu_lista: ['MHAB', 'MIS', 'MUMO']
            }
          ],
          comentarios_gerais: 'Relatório importado do PDF: Relatório Parcial — 11ª Edição Noturno nos Museus 2026.',
          historico_observacoes: `Importado via PDF em ${new Date().toLocaleDateString('pt-BR')}. Arquivo: Relatório Parcial de Produção 11ª Edição Noturno nos Museus 2026.pdf`
        });
        novoRelatorioId = novoRelatorio.id;
        driveUrl = `https://museos-centro.base44.app/Relatorios`;
        reportInfo = 'Relatório Parcial — 11ª Edição Noturno nos Museus 2026 (maio a julho/2026)';
      } else {
        novoRelatorioId = existing[0].id;
        reportInfo = 'Relatório Parcial — 11ª Edição Noturno nos Museus 2026 (já existente)';
      }
    } catch (e) {
      console.error('Erro ao criar relatório:', e.message);
    }

    // Enviar email para Daniela
    const appUrl = 'https://museos-centro.base44.app';
    const relatoriosUrl = `${appUrl}/Relatorios`;

    const emailBody = `Olá, Daniela Isis!

Seu Relatório Parcial de Produção — 11ª Edição Noturno nos Museus 2026 foi recebido, processado e está disponível para revisão e aprovação no sistema Museus Centro.

📋 RELATÓRIO: ${reportInfo}
📅 Período: maio a julho/2026
🎭 Evento: 26/06/2026

✅ INFORMAÇÕES REGISTRADAS:
• 35 instituições participantes
• 90 atividades culturais
• Público estimado: 1.659 pessoas nos museus municipais
• 16 Centros Culturais atendidos (~655 visitantes)
• 37 veículos contratados (24 vans, 11 micro-ônibus, 2 ônibus)
• Sinalização distribuída em 34 museus e centros de referência

🔗 ACESSE SEU RELATÓRIO:
${relatoriosUrl}

O relatório está disponível para edição e segue o fluxo normal de revisão e aprovação pela coordenação.

Atenciosamente,
Equipe Museus Centro — Viaduto das Artes`;

    let emailResult = null;
    try {
      emailResult = await base44.asServiceRole.integrations.Core.SendEmail({
        to: 'danielaisis.souza@gmail.com',
        subject: '✅ Relatório Noturno nos Museus 2026 — Recebido e disponível para aprovação',
        body: emailBody
      });
    } catch (emailErr) {
      console.error('Erro ao enviar email:', emailErr.message);
      emailResult = { error: emailErr.message };
    }

    return Response.json({
      success: true,
      novoRelatorioId,
      reportInfo,
      emailEnviado: !emailResult?.error,
      emailError: emailResult?.error || null,
      driveUrl,
      mensagem: `Relatório criado/localizado e email enviado para danielaisis.souza@gmail.com`
    });

  } catch (error) {
    console.error('Erro geral:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});