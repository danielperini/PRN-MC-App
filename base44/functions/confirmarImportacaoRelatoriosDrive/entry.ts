import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MESES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'admin' && !['coordenador','coordinator'].includes(String(user.base_role || '').toLowerCase())) {
      return Response.json({ error: 'Acesso restrito a coordenadores e admins' }, { status: 403 });
    }

    const { itens_confirmados } = await req.json();
    if (!itens_confirmados || !Array.isArray(itens_confirmados) || itens_confirmados.length === 0) {
      return Response.json({ error: 'Nenhum item para importar' }, { status: 400 });
    }

    const resultados = [];

    for (const item of itens_confirmados) {
      const itemResult = {
        arquivo_nome: item.arquivo_nome,
        status: 'ok',
        report_id: null,
        atividades_criadas: 0,
        fotos_criadas: 0,
        erros: [],
        avisos: [],
      };

      try {
        const dadosIA = item.dados_ia || {};
        const usuarioEmail = item.usuario_vinculado?.email || item.profissional_email || null;
        const usuarioId = item.usuario_vinculado?.id || null;
        const mesNum = item.mes_num || null;
        const ano = item.ano || new Date().getFullYear();
        const museu = item.museu || dadosIA.museu || 'Geral';

        // Status do relatório restaurado
        const statusIA = String(dadosIA.status_relatorio || '').toUpperCase();
        let reportStatus = 'SUBMITTED';
        if (statusIA.includes('APROVAD') || statusIA === 'APPROVED') reportStatus = 'APPROVED';
        else if (statusIA.includes('REVISAO') || statusIA === 'IN_REVIEW') reportStatus = 'IN_REVIEW';

        const origemObs = `Restaurado do Drive em ${new Date().toLocaleDateString('pt-BR')}. Arquivo original: ${item.arquivo_nome}.`;

        // Check duplicate before creating
        let existingReport = null;
        if (usuarioEmail && mesNum) {
          const candidatos = await base44.asServiceRole.entities.Report.filter(
            { created_by: usuarioEmail },
            '-created_date',
            50
          ).catch(() => []);
          existingReport = candidatos.find(r =>
            r.mes_referencia === MESES_NOMES[mesNum - 1] &&
            (r.ano_referencia === ano || !r.ano_referencia)
          ) || null;
        }

        let reportId = existingReport?.id || null;

        if (existingReport) {
          // Only update empty fields — never overwrite
          const updates = {};
          if (!existingReport.resumo_periodo && dadosIA.resumo_periodo) updates.resumo_periodo = dadosIA.resumo_periodo;
          if (!existingReport.resumo_executivo && dadosIA.resumo_executivo) updates.resumo_executivo = dadosIA.resumo_executivo;
          if (!existingReport.observacoes) updates.observacoes = origemObs;
          else if (!existingReport.observacoes.includes('Restaurado')) updates.observacoes = existingReport.observacoes + '\n' + origemObs;
          if (!existingReport.origem) updates.origem = 'restaurado_do_drive';
          if (Object.keys(updates).length > 0) {
            await base44.asServiceRole.entities.Report.update(existingReport.id, updates);
          }
          itemResult.avisos.push('Relatório já existia — apenas campos vazios foram preenchidos');
        } else {
          // Create new Report
          const novoReport = await base44.asServiceRole.entities.Report.create({
            ...(usuarioId ? { created_by_id: usuarioId } : {}),
            ...(usuarioEmail ? { created_by: usuarioEmail } : {}),
            museu: museu,
            mes_referencia: MESES_NOMES[mesNum ? mesNum - 1 : 0] || dadosIA.mes_referencia || '',
            ano_referencia: ano,
            status: reportStatus,
            resumo_periodo: dadosIA.resumo_periodo || '',
            resumo_executivo: dadosIA.resumo_executivo || '',
            pontos_positivos: dadosIA.pontos_positivos || '',
            desafios: dadosIA.desafios || '',
            sugestoes: dadosIA.sugestoes || '',
            comentarios: dadosIA.comentarios_gerais || '',
            publico_total: dadosIA.publico_geral || 0,
            numero_protocolo: dadosIA.numero_protocolo || '',
            origem: 'restaurado_do_drive',
            observacoes: origemObs,
            pdf_original_drive_url: item.arquivo_url || '',
          });
          reportId = novoReport.id;
          itemResult.report_id = reportId;
        }

        // Create Activities
        const atividades = dadosIA.atividades || [];
        for (const atv of atividades) {
          if (!atv.titulo) continue;

          // Check dup activity
          const existingAtvs = await base44.asServiceRole.entities.Activity.filter(
            { report_id: reportId },
            '-created_date',
            100
          ).catch(() => []);

          const atvDup = existingAtvs.find(a => {
            const tA = String(a.titulo || '').toLowerCase().trim();
            const tB = String(atv.titulo || '').toLowerCase().trim();
            return tA === tB || (tA.length > 5 && tB.includes(tA.slice(0, 10)));
          });

          if (atvDup) {
            itemResult.avisos.push(`Atividade já existe: ${atv.titulo}`);
            continue;
          }

          const classificacao = ['META','ROTINA','EXTRA'].includes(String(atv.classificacao || '').toUpperCase())
            ? atv.classificacao.toUpperCase()
            : 'ROTINA';

          await base44.asServiceRole.entities.Activity.create({
            report_id: reportId,
            titulo: atv.titulo || '',
            descricao: atv.descricao || '',
            data_realizacao: atv.data_realizacao || null,
            data_inicio: atv.data_inicio || null,
            data_fim: atv.data_fim || null,
            publico_estimado: atv.publico_estimado || 0,
            publico_total: atv.publico_total || 0,
            classificacao,
            meta_codigo: atv.meta_vinculada || '',
            resultado_alcancado: atv.resultado_alcancado || '',
            justificativa_tecnica: atv.justificativa_tecnica || '',
            equipe_responsavel: atv.equipe_responsavel || '',
            produtos_entregues: atv.produtos_entregues || [],
          });
          itemResult.atividades_criadas++;
        }

        // Register photos
        for (const foto of item.fotos_vinculadas || []) {
          const nomePadronizado = `RELATORIO_${(museu || 'MUSEU').toUpperCase()}_${mesNum || '00'}_${ano}_${(item.profissional_nome || 'AUTOR').toUpperCase().replace(/\s+/g,'_')}_${foto.nome?.replace(/\s+/g,'_') || 'FOTO'}`;

          const fotoExistente = await base44.asServiceRole.entities.ReportPhoto.filter(
            { report_id: reportId, drive_file_id: foto.id }
          ).catch(() => []);

          if (fotoExistente?.length > 0) {
            itemResult.avisos.push(`Foto já vinculada: ${foto.nome}`);
            continue;
          }

          await base44.asServiceRole.entities.ReportPhoto.create({
            report_id: reportId,
            file_name: nomePadronizado,
            file_url: foto.url || '',
            drive_file_id: foto.id || '',
            drive_url: foto.url || '',
            legenda: foto.nome || '',
            origem: 'restaurado_do_drive',
          }).catch(() => {});
          itemResult.fotos_criadas++;
        }

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          action: 'CREATE',
          entity_type: 'REPORT',
          entity_id: reportId || 'n/a',
          actor_email: user.email,
          actor_name: user.full_name || user.email,
          details: `Restauração do Drive: ${item.arquivo_nome}. Atividades criadas: ${itemResult.atividades_criadas}. Fotos: ${itemResult.fotos_criadas}.`,
        }).catch(() => {});

      } catch (e) {
        itemResult.status = 'erro';
        itemResult.erros.push(e.message);
      }

      resultados.push(itemResult);
    }

    const totalSucesso = resultados.filter(r => r.status === 'ok').length;
    const totalErro = resultados.filter(r => r.status === 'erro').length;

    return Response.json({
      success: true,
      total_processados: resultados.length,
      total_sucesso: totalSucesso,
      total_erro: totalErro,
      resultados,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});