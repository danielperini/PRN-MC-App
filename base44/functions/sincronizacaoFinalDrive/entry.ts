import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function normText(v = '') {
  return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}

function extrairAtividadeDoNome(fileName = '') {
  // Padrão ATI_ts_id__NomeAtividade__ts.ext
  const m = fileName.match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/);
  if (m) return m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  // Padrão simples __NomeAtividade__
  const m2 = fileName.match(/__(.+?)__/);
  if (m2) return m2[1].replace(/_/g, ' ').trim();
  return null;
}

function normalizeMes(text = '') {
  const t = normText(text);
  for (let i = 0; i < MESES.length; i++) {
    if (t.includes(normText(MESES[i]))) return { mes: MESES[i], mesNum: i + 1 };
  }
  return null;
}

function normalizeMuseu(text = '') {
  const t = normText(text);
  if (t.includes('mis') || t.includes('imagem') || t.includes('som')) return 'MIS';
  if (t.includes('mhab') || t.includes('abilio') || t.includes('historico')) return 'MHAB';
  if (t.includes('mumo') || t.includes('moda')) return 'MUMO';
  return null;
}

function scoreAtividade(atividade, fileName, nomeExtraido) {
  const titulo = normText(atividade.titulo || atividade.nome || '');
  if (!titulo) return 0;
  const nome = normText(nomeExtraido || fileName || '');
  if (!nome) return 0;
  // Score por palavras em comum
  const palavrasTitulo = titulo.split(' ').filter(p => p.length > 3);
  const palavrasNome = nome.split(' ').filter(p => p.length > 3);
  const comuns = palavrasTitulo.filter(p => palavrasNome.some(n => n.includes(p) || p.includes(n)));
  return comuns.length;
}

function gerarLegenda(fileName, atividade, museu, mesNome, ano) {
  const partes = [];
  const nomeAtv = atividade?.titulo || atividade?.nome || extrairAtividadeDoNome(fileName) || '';
  if (nomeAtv) partes.push(nomeAtv);
  const local = atividade?.local || atividade?.local_realizacao || museu || '';
  if (local) partes.push(local);
  const data = atividade?.data_realizacao || atividade?.data_inicio || '';
  if (data) {
    const d = new Date(data);
    if (!isNaN(d.getTime())) partes.push(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
    else partes.push(data);
  } else if (mesNome && ano) {
    partes.push(`${mesNome}/${ano}`);
  }
  return partes.length > 0 ? partes.join(' — ') : (fileName || 'Foto');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'admin' && !['coordenador','coordinator'].includes(normText(user.base_role || ''))) {
      return Response.json({ error: 'Acesso restrito a coordenadores e admins' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run === true;

    // ── Carregar dados base ───────────────────────────────────────────────
    const [reports, reportPhotos, attachments] = await Promise.all([
      base44.asServiceRole.entities.Report.list('-created_date', 600),
      base44.asServiceRole.entities.ReportPhoto.list('-created_date', 3000),
      base44.asServiceRole.entities.Attachment.list('-created_date', 3000),
    ]);

    // Índice de relatórios por ID
    const reportById = new Map((reports || []).map(r => [r.id, r]));

    const stats = {
      report_photos_vinculadas_a_report: 0,
      report_photos_atividade_vinculada: 0,
      report_photos_legenda_atualizada: 0,
      attachments_legenda_atualizada: 0,
      attachments_report_vinculado: 0,
      relatorios_fotos_vinculadas: 0,
      erros: 0,
    };
    const log: string[] = [];
    const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i;

    // ── 1. Vincular ReportPhotos órfãs a relatórios ───────────────────────
    for (const foto of (reportPhotos || [])) {
      const updates: Record<string, unknown> = {};

      // 1a. Sem report_id — tentar vincular por museu + mês
      if (!foto.report_id) {
        const mesInfo = normalizeMes(foto.mes_referencia || foto.file_name || '');
        const museuFoto = normalizeMuseu(foto.file_name || '') || normalizeMuseu(foto.caption || '');
        const ano = foto.ano || new Date().getFullYear();

        let reportMatch = null;
        if (mesInfo && museuFoto) {
          reportMatch = (reports || []).find(r =>
            normalizeMuseu(r.museu) === museuFoto &&
            normText(r.mes_referencia || '') === normText(mesInfo.mes) &&
            (!r.ano || r.ano === ano)
          ) || null;
        }
        // Fallback: por atividade extraída do nome
        if (!reportMatch && mesInfo) {
          const nomeAtv = extrairAtividadeDoNome(foto.file_name || '');
          if (nomeAtv) {
            const nAtv = normText(nomeAtv);
            reportMatch = (reports || []).find(r => {
              const mesOk = normText(r.mes_referencia || '') === normText(mesInfo.mes);
              const anoOk = !r.ano || r.ano === ano;
              const temAtv = (r.atividades || []).some((a: any) => {
                const t = normText(a.titulo || a.nome || '');
                return t && (t.includes(nAtv.split(' ')[0]) || nAtv.includes(t.split(' ')[0]));
              });
              return mesOk && anoOk && temAtv;
            }) || null;
          }
        }

        if (reportMatch) {
          updates.report_id = reportMatch.id;
          updates.author = updates.author || reportMatch.author_name || '';
          stats.report_photos_vinculadas_a_report++;
          log.push(`ReportPhoto ${foto.id}: vinculada ao relatório ${reportMatch.id} (${reportMatch.author_name})`);
        }
      }

      // 1b. Tem report_id — tentar vincular atividade e atualizar legenda
      const reportId = (updates.report_id as string) || foto.report_id;
      if (reportId) {
        const report = reportById.get(reportId);
        const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
        const nomeArq = extrairAtividadeDoNome(foto.file_name || '');

        if (atividades.length > 0) {
          // Pontuar cada atividade
          const scored = atividades
            .map((a: any) => ({ a, score: scoreAtividade(a, foto.file_name || '', nomeArq) }))
            .filter(x => x.score > 0)
            .sort((x, y) => y.score - x.score);

          const melhor = scored[0]?.a || (atividades.length === 1 ? atividades[0] : null);

          if (melhor) {
            const novaLegenda = gerarLegenda(
              foto.file_name || '',
              melhor,
              report?.museu || '',
              report?.mes_referencia || '',
              report?.ano || new Date().getFullYear()
            );

            if (novaLegenda && novaLegenda !== (foto.caption || '')) {
              updates.caption = novaLegenda;
              stats.report_photos_legenda_atualizada++;
              log.push(`ReportPhoto ${foto.id}: legenda atualizada → "${novaLegenda}"`);
            }
            stats.report_photos_atividade_vinculada++;
          }
        }
      }

      if (Object.keys(updates).length > 0 && !dry_run) {
        await base44.asServiceRole.entities.ReportPhoto.update(foto.id, updates).catch(() => { stats.erros++; });
      }
    }

    // ── 2. Atualizar legendas de Attachments (imagens) ───────────────────
    const imageAttachments = (attachments || []).filter(a =>
      IMAGE_EXT.test(a.file_name || '') || String(a.file_type || '').startsWith('image/')
    );

    for (const att of imageAttachments) {
      const updates: Record<string, unknown> = {};

      // 2a. Sem report_id — tentar encontrar relatório
      if (!att.report_id) {
        const mesInfo = normalizeMes(att.file_name || '');
        const museuAtt = normalizeMuseu(att.file_name || '') || normalizeMuseu(att.description || '');
        const ano = att.created_date ? new Date(att.created_date).getFullYear() : new Date().getFullYear();

        if (mesInfo && museuAtt) {
          const rm = (reports || []).find(r =>
            normalizeMuseu(r.museu) === museuAtt &&
            normText(r.mes_referencia || '') === normText(mesInfo.mes) &&
            (!r.ano || r.ano === ano)
          ) || null;
          if (rm) {
            updates.report_id = rm.id;
            stats.attachments_report_vinculado++;
            log.push(`Attachment ${att.id}: vinculado ao relatório ${rm.id}`);
          }
        }
      }

      // 2b. Atualizar legenda com contexto da atividade
      const reportId = (updates.report_id as string) || att.report_id;
      if (reportId) {
        const report = reportById.get(reportId);
        const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
        const nomeArq = extrairAtividadeDoNome(att.file_name || '');

        // Vincular pelo activity_id se já existe
        let melhor = att.activity_id ? atividades.find((a: any) => a.id === att.activity_id) : null;
        if (!melhor && atividades.length > 0) {
          const scored = atividades
            .map((a: any) => ({ a, score: scoreAtividade(a, att.file_name || '', nomeArq) }))
            .filter(x => x.score > 0)
            .sort((x, y) => y.score - x.score);
          melhor = scored[0]?.a || (atividades.length === 1 ? atividades[0] : null);
        }

        if (melhor) {
          const novaLegenda = gerarLegenda(
            att.file_name || '',
            melhor,
            report?.museu || '',
            report?.mes_referencia || '',
            report?.ano || new Date().getFullYear()
          );
          if (novaLegenda && novaLegenda !== (att.description || '')) {
            updates.description = novaLegenda;
            stats.attachments_legenda_atualizada++;
            log.push(`Attachment ${att.id}: legenda → "${novaLegenda}"`);
          }
        }
      }

      if (Object.keys(updates).length > 0 && !dry_run) {
        await base44.asServiceRole.entities.Attachment.update(att.id, updates).catch(() => { stats.erros++; });
      }
    }

    // ── 3. Vincular Attachments de fotos de volta ao campo fotos[] do Report ─
    // Para cada relatório, garantir que suas fotos do campo atividades[] estão referenciadas
    let relatoriosAtualizados = 0;
    for (const report of (reports || [])) {
      const atividades = Array.isArray(report.atividades) ? report.atividades : [];
      if (atividades.length === 0) continue;

      // Fotos deste relatório
      const fotosDoReport = (reportPhotos || []).filter(f => f.report_id === report.id);
      if (fotosDoReport.length === 0) continue;

      // Atualizar campo fotos[] embarcado no Report com URLs das fotos vinculadas
      const fotosAtuais: unknown[] = Array.isArray(report.fotos) ? report.fotos : [];
      const urlsExistentes = new Set(fotosAtuais.map((f: any) => f?.url || f?.file_url || '').filter(Boolean));

      const novasFotos = fotosDoReport
        .filter(f => f.file_url && !urlsExistentes.has(f.file_url))
        .map(f => ({
          url: f.file_url,
          file_url: f.file_url,
          legenda: f.caption || f.file_name || '',
          drive_file_id: f.drive_file_id || '',
        }));

      if (novasFotos.length > 0 && !dry_run) {
        await base44.asServiceRole.entities.Report.update(report.id, {
          fotos: [...fotosAtuais, ...novasFotos],
        }).catch(() => { stats.erros++; });
        relatoriosAtualizados++;
        stats.relatorios_fotos_vinculadas += novasFotos.length;
        log.push(`Relatório ${report.id} (${report.author_name}): ${novasFotos.length} fotos vinculadas ao campo fotos[]`);
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    if (!dry_run) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'SYNC',
        entity_type: 'GALERIA_SINCRONIZACAO',
        entity_id: 'batch',
        actor_email: user.email,
        actor_name: user.full_name || user.email,
        details: `Sincronização final Drive: ${JSON.stringify(stats)}`,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      dry_run,
      stats: {
        ...stats,
        relatorios_atualizados: relatoriosAtualizados,
        total_report_photos_processadas: (reportPhotos || []).length,
        total_attachments_imagens: imageAttachments.length,
        total_relatorios: (reports || []).length,
      },
      log_resumo: log.slice(0, 50),
      mensagem: dry_run
        ? `Simulação concluída. ${stats.report_photos_legenda_atualizada + stats.attachments_legenda_atualizada} legendas seriam atualizadas, ${stats.report_photos_vinculadas_a_report + stats.attachments_report_vinculado} fotos seriam vinculadas.`
        : `Sincronização concluída. ${stats.report_photos_legenda_atualizada + stats.attachments_legenda_atualizada} legendas atualizadas, ${stats.report_photos_vinculadas_a_report + stats.attachments_report_vinculado} fotos vinculadas a relatórios.`,
    });

  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});