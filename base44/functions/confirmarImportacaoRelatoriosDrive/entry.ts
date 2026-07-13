import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

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
        const usuarioId = item.usuario_vinculado?.id || null;
        const usuarioNome = item.usuario_vinculado?.nome || item.profissional_nome || dadosIA.nome_profissional || '';
        const usuarioEmail = item.usuario_vinculado?.email || item.profissional_email || dadosIA.email_profissional || null;
        const mesNum = item.mes_num || null;
        const mesNome = mesNum ? MESES_NOMES[mesNum - 1] : (dadosIA.mes_referencia || '');
        const ano = item.ano || new Date().getFullYear();
        const museu = item.museu || dadosIA.museu || 'Geral';
        const funcao = dadosIA.funcao || '';

        const statusIA = String(dadosIA.status_relatorio || '').toUpperCase();
        let reportStatus = 'SUBMITTED';
        if (statusIA.includes('APROVAD') || statusIA === 'APPROVED') reportStatus = 'APPROVED';
        else if (statusIA.includes('REVISAO') || statusIA === 'IN_REVIEW') reportStatus = 'IN_REVIEW';

        const origemObs = `Restaurado do Drive em ${new Date().toLocaleDateString('pt-BR')}. Arquivo: ${item.arquivo_nome}.`;

        // Buscar relatório existente pelo created_by_id do usuário vinculado
        let existingReport = null;
        const filtros = [];
        if (usuarioId) filtros.push({ created_by_id: usuarioId });

        for (const filtro of filtros) {
          const candidatos = await base44.asServiceRole.entities.Report.filter(filtro, '-created_date', 100).catch(() => []);
          existingReport = candidatos.find(r => {
            const mesOk = r.mes_referencia?.toLowerCase() === mesNome?.toLowerCase();
            const anoOk = !r.ano || r.ano === ano;
            return mesOk && anoOk;
          }) || null;
          if (existingReport) break;
        }

        // Fallback: buscar por nome do autor e mês/ano
        if (!existingReport && usuarioNome) {
          const nomeBusca = usuarioNome.toLowerCase().trim();
          const todos = await base44.asServiceRole.entities.Report.filter({}, '-created_date', 300).catch(() => []);
          existingReport = todos.find(r => {
            const nomeOk = String(r.author_name || '').toLowerCase().includes(nomeBusca.split(' ')[0]);
            const mesOk = r.mes_referencia?.toLowerCase() === mesNome?.toLowerCase();
            const anoOk = !r.ano || r.ano === ano;
            return nomeOk && mesOk && anoOk;
          }) || null;
        }

        let reportId = existingReport?.id || null;

        if (existingReport) {
          // Atualiza apenas campos vazios
          const updates: Record<string, unknown> = {};
          if (!existingReport.resumo_periodo && dadosIA.resumo_periodo) updates.resumo_periodo = dadosIA.resumo_periodo;
          if (!existingReport.resumo_executivo && dadosIA.resumo_executivo) updates.resumo_executivo = dadosIA.resumo_executivo;
          if (!existingReport.avaliacao_pontos_positivos && dadosIA.pontos_positivos) updates.avaliacao_pontos_positivos = dadosIA.pontos_positivos;
          if (!existingReport.avaliacao_desafios && dadosIA.desafios) updates.avaliacao_desafios = dadosIA.desafios;
          if (!existingReport.avaliacao_sugestoes && dadosIA.sugestoes) updates.avaliacao_sugestoes = dadosIA.sugestoes;
          if (!existingReport.comentarios_gerais && dadosIA.comentarios_gerais) updates.comentarios_gerais = dadosIA.comentarios_gerais;
          if (!existingReport.publico_geral_declarado && dadosIA.publico_geral) updates.publico_geral_declarado = dadosIA.publico_geral;
          if (!existingReport.funcao && funcao) updates.funcao = funcao;
          // Adicionar nota de restauração
          const obsAtual = existingReport.historico_observacoes || '';
          if (!obsAtual.includes('Restaurado')) updates.historico_observacoes = obsAtual ? obsAtual + '\n' + origemObs : origemObs;

          if (Object.keys(updates).length > 0) {
            await base44.asServiceRole.entities.Report.update(existingReport.id, updates);
          }
          itemResult.avisos.push('Relatório já existia — campos vazios preenchidos com dados do Drive');
        } else {
          // Criar novo relatório no perfil do usuário
          const novoReport = await base44.asServiceRole.entities.Report.create({
            ...(usuarioId ? { created_by_id: usuarioId } : {}),
            author_name: usuarioNome,
            funcao,
            museu,
            mes_referencia: mesNome,
            ano,
            status: reportStatus,
            resumo_periodo: dadosIA.resumo_periodo || '',
            resumo_executivo: dadosIA.resumo_executivo || '',
            avaliacao_pontos_positivos: dadosIA.pontos_positivos || '',
            avaliacao_desafios: dadosIA.desafios || '',
            avaliacao_sugestoes: dadosIA.sugestoes || '',
            comentarios_gerais: dadosIA.comentarios_gerais || '',
            publico_geral_declarado: dadosIA.publico_geral || 0,
            numero_protocolo: dadosIA.numero_protocolo || '',
            historico_observacoes: origemObs,
            drive_backup_relatorio_url: item.arquivo_url || '',
            drive_backup_status: 'concluido',
          });
          reportId = novoReport.id;
          itemResult.report_id = reportId;
        }

        // Criar atividades como array embedded no Report (campo atividades[])
        const atividadesIA = dadosIA.atividades || [];
        if (atividadesIA.length > 0) {
          // Ler report atual para pegar atividades já existentes
          const reportAtual = await base44.asServiceRole.entities.Report.get(reportId).catch(() => null);
          const atividadesExistentes: unknown[] = Array.isArray(reportAtual?.atividades) ? reportAtual.atividades : [];
          const titulosExistentes = new Set(atividadesExistentes.map((a: any) => String(a.titulo || '').toLowerCase().trim()));

          const novasAtividades = atividadesIA
            .filter((atv: any) => atv.titulo && !titulosExistentes.has(String(atv.titulo).toLowerCase().trim()))
            .map((atv: any) => {
              const classificacao = ['META','ROTINA','EXTRA'].includes(String(atv.classificacao || '').toUpperCase())
                ? atv.classificacao.toUpperCase()
                : 'ROTINA';
              return {
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
                origem: 'restaurado_do_drive',
              };
            });

          if (novasAtividades.length > 0) {
            await base44.asServiceRole.entities.Report.update(reportId, {
              atividades: [...atividadesExistentes, ...novasAtividades],
            });
            itemResult.atividades_criadas = novasAtividades.length;
            const ignoradas = atividadesIA.length - novasAtividades.length;
            if (ignoradas > 0) itemResult.avisos.push(`${ignoradas} atividade(s) já existiam e foram ignoradas`);
          }
        }

        // Registrar fotos vinculadas
        for (const foto of item.fotos_vinculadas || []) {
          const fotoExistente = await base44.asServiceRole.entities.ReportPhoto.filter(
            { report_id: reportId, drive_file_id: foto.id }
          ).catch(() => []);

          if (fotoExistente?.length > 0) {
            itemResult.avisos.push(`Foto já vinculada: ${foto.nome}`);
            continue;
          }

          const nomePad = `RELATORIO_${(museu).toUpperCase()}_${mesNum||'00'}_${ano}_${(usuarioNome).toUpperCase().replace(/\s+/g,'_')}_${(foto.nome||'FOTO').replace(/\s+/g,'_')}`;

          // Gerar legenda automática com atividade, museu, local e data
          const atividadesDoRelatorio: any[] = dadosIA.atividades || [];
          const atividadeVinculada = atividadesDoRelatorio.find((a: any) =>
            foto.nome && (String(a.titulo || '').toLowerCase().includes(foto.nome.toLowerCase().split('_')[0]) ||
            String(foto.nome).toLowerCase().includes(String(a.titulo || '').toLowerCase().split(' ')[0]))
          ) || atividadesDoRelatorio[0];

          const captionPartes: string[] = [];
          if (atividadeVinculada?.titulo) captionPartes.push(atividadeVinculada.titulo);
          const localFoto = atividadeVinculada?.local || atividadeVinculada?.local_realizacao || museu;
          if (localFoto) captionPartes.push(localFoto);
          const dataFoto = atividadeVinculada?.data_realizacao || atividadeVinculada?.data_inicio || (mesNome && ano ? `${mesNome}/${ano}` : '');
          if (dataFoto) captionPartes.push(dataFoto);
          const legendaGerada = captionPartes.length > 0 ? captionPartes.join(' — ') : (foto.nome || '');

          await base44.asServiceRole.entities.ReportPhoto.create({
            report_id: reportId,
            file_name: nomePad,
            file_url: foto.url || '',
            drive_file_id: foto.id || '',
            caption: legendaGerada,
            mes_referencia: mesNome,
            ano,
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
          details: `Restauração do Drive: ${item.arquivo_nome}. Usuário: ${usuarioNome} (${usuarioEmail||'sem email'}). Atividades: ${itemResult.atividades_criadas}. Fotos: ${itemResult.fotos_criadas}.`,
        }).catch(() => {});

      } catch (e) {
        itemResult.status = 'erro';
        itemResult.erros.push((e as Error).message);
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
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});