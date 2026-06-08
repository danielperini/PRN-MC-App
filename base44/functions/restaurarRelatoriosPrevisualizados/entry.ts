import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Restaura relatórios a partir de um JSON de pré-visualização + mídias já subidas
// O frontend envia: { preview_json: {...}, midias: [{nome_arquivo, file_url, sha256}] }

const MESES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

async function calcSha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizarNome(nome) {
  return String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function matchMidia(nomeFoto, midias) {
  const nomeNorm = normalizarNome(nomeFoto);
  // Exact match
  let found = midias.find(m => normalizarNome(m.nome_arquivo) === nomeNorm);
  if (found) return found;
  // Partial match — basename without extension
  const base = nomeNorm.replace(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|pdf)$/, '');
  found = midias.find(m => {
    const mb = normalizarNome(m.nome_arquivo).replace(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|pdf)$/, '');
    return mb === base || mb.includes(base.slice(0, 12)) || base.includes(mb.slice(0, 12));
  });
  return found || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'admin' && !['coordenador', 'coordinator'].includes(String(user.base_role || '').toLowerCase())) {
      return Response.json({ error: 'Acesso restrito a coordenadores e admins' }, { status: 403 });
    }

    const body = await req.json();
    const { preview_json, midias = [], itens_selecionados = null } = body;

    if (!preview_json) return Response.json({ error: 'preview_json é obrigatório' }, { status: 400 });

    // Support both: array of report items directly, or wrapped { resultados: [...] }
    const todosItens = Array.isArray(preview_json) ? preview_json : (preview_json.resultados || []);
    const itens = itens_selecionados
      ? todosItens.filter(item => itens_selecionados.includes(item.arquivo_id || item.numero_protocolo || item.arquivo_nome))
      : todosItens.filter(item => item.selecionado !== false);

    if (itens.length === 0) return Response.json({ error: 'Nenhum item selecionado para importação' }, { status: 400 });

    // Build mídia index keyed by normalized filename
    const midiaIndex = {};
    for (const m of midias) {
      midiaIndex[normalizarNome(m.nome_arquivo)] = m;
    }

    const resultados = [];

    for (const item of itens) {
      const itemResult = {
        arquivo_nome: item.arquivo_nome || item.titulo || 'sem_nome',
        status: 'ok',
        report_id: null,
        atividades_criadas: 0,
        fotos_criadas: 0,
        fotos_puladas: 0,
        erros: [],
        avisos: [],
      };

      try {
        // Normalize data — support both dados_ia wrapper and flat structure
        const d = item.dados_ia || item;
        const usuarioEmail = item.usuario_vinculado?.email || item.profissional_email || d.email_profissional || null;
        const usuarioId = item.usuario_vinculado?.id || null;
        const mesNum = item.mes_num || null;
        const mesNome = mesNum ? MESES_NOMES[mesNum - 1] : (d.mes_referencia || item.mes || '');
        const ano = item.ano || d.ano || new Date().getFullYear();
        const museu = item.museu || d.museu || 'Geral';
        const protocolo = d.numero_protocolo || item.numero_protocolo || '';

        const statusIA = String(d.status_relatorio || item.status_relatorio || '').toUpperCase();
        let reportStatus = 'SUBMITTED';
        if (statusIA.includes('APROVAD') || statusIA === 'APPROVED') reportStatus = 'APPROVED';
        else if (statusIA.includes('REVISAO') || statusIA === 'IN_REVIEW') reportStatus = 'IN_REVIEW';

        const dataRestauracao = new Date().toLocaleDateString('pt-BR');
        const origemObs = `Restaurado via importação JSON em ${dataRestauracao}. Arquivo original: ${item.arquivo_nome || '?'}.`;

        // ── Duplicate check ──
        let existingReport = null;
        if (usuarioEmail && mesNome) {
          const candidatos = await base44.asServiceRole.entities.Report.filter(
            { created_by: usuarioEmail },
            '-created_date',
            100
          ).catch(() => []);

          existingReport = candidatos.find(r => {
            const mesMatch = r.mes_referencia?.toLowerCase() === mesNome.toLowerCase();
            const anoMatch = !r.ano_referencia || r.ano_referencia === ano;
            const museuMatch = !r.museu || r.museu === museu;
            const protMatch = protocolo ? (r.numero_protocolo === protocolo) : true;
            return mesMatch && anoMatch && museuMatch && protMatch;
          }) || null;
        }

        let reportId = existingReport?.id || null;

        if (existingReport) {
          // Only patch empty fields — NEVER overwrite
          const updates = {};
          if (!existingReport.resumo_periodo && d.resumo_periodo) updates.resumo_periodo = d.resumo_periodo;
          if (!existingReport.resumo_executivo && d.resumo_executivo) updates.resumo_executivo = d.resumo_executivo;
          if (!existingReport.pontos_positivos && d.pontos_positivos) updates.pontos_positivos = d.pontos_positivos;
          if (!existingReport.desafios && d.desafios) updates.desafios = d.desafios;
          if (!existingReport.sugestoes && d.sugestoes) updates.sugestoes = d.sugestoes;
          if (!existingReport.origem) updates.origem = 'restaurado_do_pacote';
          if (!existingReport.observacoes) updates.observacoes = origemObs;
          else if (!existingReport.observacoes.includes('Restaurado')) {
            updates.observacoes = existingReport.observacoes + '\n' + origemObs;
          }
          if (Object.keys(updates).length > 0) {
            await base44.asServiceRole.entities.Report.update(existingReport.id, updates);
          }
          itemResult.avisos.push('Relatório já existia — apenas campos vazios foram preenchidos');
        } else {
          const novoReport = await base44.asServiceRole.entities.Report.create({
            ...(usuarioId ? { created_by_id: usuarioId } : {}),
            ...(usuarioEmail ? { created_by: usuarioEmail } : {}),
            museu,
            mes_referencia: mesNome,
            ano_referencia: ano,
            status: reportStatus,
            resumo_periodo: d.resumo_periodo || '',
            resumo_executivo: d.resumo_executivo || '',
            pontos_positivos: d.pontos_positivos || '',
            desafios: d.desafios || '',
            sugestoes: d.sugestoes || '',
            comentarios: d.comentarios_gerais || '',
            publico_total: d.publico_geral || item.publico_total || 0,
            numero_protocolo: protocolo,
            origem: 'restaurado_do_pacote',
            observacoes: origemObs,
            pdf_original_drive_url: item.arquivo_url || '',
          });
          reportId = novoReport.id;
          itemResult.report_id = reportId;
        }

        // ── Activities ──
        const atividades = d.atividades || item.atividades || [];

        // Load existing once
        const existingAtvs = reportId
          ? await base44.asServiceRole.entities.Activity.filter({ report_id: reportId }, '-created_date', 200).catch(() => [])
          : [];

        for (const atv of atividades) {
          if (!atv.titulo) continue;

          const dupAtv = existingAtvs.find(a => {
            const tA = normalizarNome(a.titulo);
            const tB = normalizarNome(atv.titulo);
            return tA === tB || (tA.length > 8 && tB.startsWith(tA.slice(0, 10)));
          });

          if (dupAtv) {
            itemResult.avisos.push(`Atividade já existe: ${atv.titulo}`);
            continue;
          }

          const classificacao = ['META', 'ROTINA', 'EXTRA'].includes(String(atv.classificacao || '').toUpperCase())
            ? atv.classificacao.toUpperCase()
            : 'ROTINA';

          const novaAtv = await base44.asServiceRole.entities.Activity.create({
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
          existingAtvs.push(novaAtv); // prevent same-run dups
          itemResult.atividades_criadas++;

          // Attach photos cited in this activity
          for (const fotoRef of atv.fotos_citadas || []) {
            const midiaMapped = matchMidia(fotoRef, midias);
            if (!midiaMapped?.file_url) {
              itemResult.avisos.push(`Mídia não encontrada para atividade "${atv.titulo}": ${fotoRef}`);
              continue;
            }

            // Dup check by sha256 or file_url
            const existFoto = await base44.asServiceRole.entities.ReportPhoto.filter(
              { report_id: reportId, activity_id: novaAtv.id }
            ).catch(() => []);

            const fotoJaExiste = existFoto.some(f => f.file_url === midiaMapped.file_url || (midiaMapped.sha256 && f.sha256 === midiaMapped.sha256));
            if (fotoJaExiste) {
              itemResult.avisos.push(`Foto já vinculada à atividade: ${fotoRef}`);
              itemResult.fotos_puladas++;
              continue;
            }

            const nomePadrao = `RELATORIO_${museu.toUpperCase()}_${mesNum || '00'}_${ano}_${(item.profissional_nome || d.nome_profissional || 'AUTOR').toUpperCase().replace(/\s+/g, '_')}_${midiaMapped.nome_arquivo.replace(/\s+/g, '_')}`;

            await base44.asServiceRole.entities.ReportPhoto.create({
              report_id: reportId,
              activity_id: novaAtv.id,
              file_name: nomePadrao,
              file_url: midiaMapped.file_url,
              sha256: midiaMapped.sha256 || '',
              legenda: midiaMapped.legenda || fotoRef || '',
              origem: 'restaurado_do_pacote',
              drive_file_id: midiaMapped.drive_file_id || '',
            }).catch(e => {
              itemResult.avisos.push(`Erro ao criar ReportPhoto: ${e.message}`);
            });
            itemResult.fotos_criadas++;
          }
        }

        // ── Fotos de nível de relatório (não ligadas a atividade específica) ──
        const fotosRelatorio = d.fotos || item.fotos_vinculadas || [];
        for (const fotoRef of fotosRelatorio) {
          const nomeRef = fotoRef.nome_arquivo || fotoRef.nome || (typeof fotoRef === 'string' ? fotoRef : '');
          const midiaMapped = matchMidia(nomeRef, midias) || (fotoRef.file_url ? fotoRef : null);

          if (!midiaMapped?.file_url) {
            itemResult.fotos_puladas++;
            continue;
          }

          // Dup check
          const existFotos = await base44.asServiceRole.entities.ReportPhoto.filter(
            { report_id: reportId }
          ).catch(() => []);

          const jaExiste = existFotos.some(f => f.file_url === midiaMapped.file_url || (midiaMapped.sha256 && f.sha256 === midiaMapped.sha256));
          if (jaExiste) {
            itemResult.fotos_puladas++;
            continue;
          }

          const nomePadrao = `RELATORIO_${museu.toUpperCase()}_${mesNum || '00'}_${ano}_${(item.profissional_nome || d.nome_profissional || 'AUTOR').toUpperCase().replace(/\s+/g, '_')}_${nomeRef.replace(/\s+/g, '_') || 'FOTO'}`;

          // Find best activity match
          let activityId = null;
          const atvRel = fotoRef.atividade_relacionada || '';
          if (atvRel) {
            const atvMatch = existingAtvs.find(a => normalizarNome(a.titulo).includes(normalizarNome(atvRel).slice(0, 10)));
            if (atvMatch) activityId = atvMatch.id;
          }

          await base44.asServiceRole.entities.ReportPhoto.create({
            report_id: reportId,
            ...(activityId ? { activity_id: activityId } : {}),
            file_name: nomePadrao,
            file_url: midiaMapped.file_url,
            sha256: midiaMapped.sha256 || '',
            legenda: fotoRef.legenda || midiaMapped.legenda || nomeRef || '',
            origem: 'restaurado_do_pacote',
            drive_file_id: midiaMapped.drive_file_id || fotoRef.id || '',
          }).catch(e => {
            itemResult.avisos.push(`Erro ao criar foto de relatório: ${e.message}`);
          });
          itemResult.fotos_criadas++;
        }

        // ── Audit log ──
        await base44.asServiceRole.entities.AuditLog.create({
          action: 'CREATE',
          entity_type: 'REPORT',
          entity_id: reportId || 'n/a',
          actor_email: user.email,
          actor_name: user.full_name || user.email,
          details: `Restauração via pacote JSON. Arquivo: ${item.arquivo_nome || '?'}. Atividades: ${itemResult.atividades_criadas}. Fotos criadas: ${itemResult.fotos_criadas}. Fotos puladas: ${itemResult.fotos_puladas}.`,
        }).catch(() => {});

      } catch (e) {
        itemResult.status = 'erro';
        itemResult.erros.push(e.message);
      }

      resultados.push(itemResult);
    }

    return Response.json({
      success: true,
      total_processados: resultados.length,
      total_sucesso: resultados.filter(r => r.status === 'ok').length,
      total_erro: resultados.filter(r => r.status === 'erro').length,
      resultados,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});