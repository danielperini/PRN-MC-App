import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const DRIVE_FOLDER_ID = '1gMPRXyamu9YANVFg6Xf7VtWoOoF-3CbQ';
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

async function listFolderContents(accessToken: string, folderId: string) {
  const q = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,mimeType,webViewLink,webContentLink,createdTime,size)';
  let allFiles: any[] = [];
  let pageToken: string | null = null;
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    allFiles = allFiles.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return allFiles;
}

async function listAllFilesRecursive(accessToken: string, folderId: string, depth = 0): Promise<any[]> {
  if (depth > 8) return [];
  const items = await listFolderContents(accessToken, folderId);
  const subfolders = items.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');
  const files = items.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');
  let allFiles = [...files];
  const BATCH = 4;
  for (let i = 0; i < subfolders.length; i += BATCH) {
    const batch = subfolders.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((sf: any) => listAllFilesRecursive(accessToken, sf.id, depth + 1)));
    for (const r of results) allFiles = allFiles.concat(r);
  }
  return allFiles;
}

function normalizeMes(text: string) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (let i = 0; i < MESES.length; i++) {
    const m = MESES[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (t.includes(m)) return { mes: MESES[i], mesNum: i + 1 };
  }
  const match = t.match(/\b(0?[1-9]|1[0-2])\b/);
  if (match) { const n = parseInt(match[1]); return { mes: MESES[n - 1], mesNum: n }; }
  return null;
}

function normalizeMuseu(text: string) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t.includes('mis') || t.includes('imagem e som')) return 'MIS';
  if (t.includes('mhab') || t.includes('abilio') || t.includes('historico')) return 'MHAB';
  if (t.includes('mumo') || t.includes('moda')) return 'MUMO';
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Suporta: chamada autenticada (admin/coord) OU automação agendada (service role)
    let runnerEmail = 'automacao@sistema';
    let runnerName = 'Automação Agendada';
    let isScheduled = false;

    try {
      const user = await base44.auth.me();
      if (!user) {
        // Pode ser execução via automação sem contexto de usuário
        isScheduled = true;
      } else {
        if (user.role !== 'admin' && !['coordenador','coordinator'].includes(String(user.base_role || '').toLowerCase())) {
          return Response.json({ error: 'Acesso restrito a coordenadores e admins' }, { status: 403 });
        }
        runnerEmail = user.email || runnerEmail;
        runnerName = user.full_name || user.email || runnerName;
      }
    } catch {
      isScheduled = true;
    }

    const body = await req.json().catch(() => ({})) as any;
    const targetFolder = body?.folder_id || DRIVE_FOLDER_ID;
    const dry_run = body?.dry_run === true;
    const limite_pdfs = body?.limite_pdfs || 30; // máximo de PDFs por execução

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // 1. Listar todos os arquivos recursivamente
    const arquivos = await listAllFilesRecursive(accessToken, targetFolder);
    const pdfs = arquivos
      .filter((f: any) => f.mimeType === 'application/pdf')
      .slice(0, limite_pdfs);
    const imagens = arquivos.filter((f: any) => f.mimeType?.startsWith('image/'));

    // 2. Carregar dados do sistema para cruzamento
    const [existingReports, existingUsers] = await Promise.all([
      base44.asServiceRole.entities.Report.list('-created_date', 500).catch(() => []),
      base44.asServiceRole.entities.User.list().catch(() => []),
    ]);

    const stats = {
      total_pdfs_varridos: pdfs.length,
      total_imagens: imagens.length,
      relatorios_criados: 0,
      relatorios_atualizados: 0,
      atividades_restauradas: 0,
      fotos_vinculadas: 0,
      ja_existentes_pulados: 0,
      erros: 0,
      detalhes: [] as any[],
    };

    // 3. Processar cada PDF
    for (const pdf of pdfs) {
      const detalhe: any = { arquivo: pdf.name, status: 'ok', acoes: [] };

      try {
        // Obter URL acessível
        const fileUrl = pdf.webContentLink || pdf.webViewLink;

        // 3a. Extrair dados com IA
        let dadosIA: any = {};
        try {
          dadosIA = await invokeLLM(base44.asServiceRole,{
            prompt: `Analise este PDF de relatório mensal de museu cultural e extraia os dados em JSON.
Campos obrigatórios:
- nome_profissional: nome completo do autor
- email_profissional: email do autor (null se não encontrado)
- museu: sigla (MIS, MHAB, MUMO) ou nome
- mes_referencia: nome do mês em português
- ano: número do ano
- funcao: cargo/função
- status_relatorio: APROVADO, SUBMETIDO, EM_REVISAO ou RASCUNHO
- resumo_periodo: texto do resumo
- resumo_executivo: resumo executivo
- pontos_positivos: pontos positivos
- desafios: desafios
- sugestoes: sugestões
- publico_geral: número total de público
- atividades: array com titulo, descricao, data_realizacao (YYYY-MM-DD), publico_total, classificacao (META/ROTINA/EXTRA), meta_vinculada, resultado_alcancado`,
            file_urls: [fileUrl],
            response_json_schema: {
              type: 'object',
              properties: {
                nome_profissional: { type: 'string' },
                email_profissional: { type: 'string' },
                museu: { type: 'string' },
                mes_referencia: { type: 'string' },
                ano: { type: 'number' },
                funcao: { type: 'string' },
                status_relatorio: { type: 'string' },
                resumo_periodo: { type: 'string' },
                resumo_executivo: { type: 'string' },
                pontos_positivos: { type: 'string' },
                desafios: { type: 'string' },
                sugestoes: { type: 'string' },
                publico_geral: { type: 'number' },
                atividades: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      titulo: { type: 'string' },
                      descricao: { type: 'string' },
                      data_realizacao: { type: 'string' },
                      publico_total: { type: 'number' },
                      classificacao: { type: 'string' },
                      meta_vinculada: { type: 'string' },
                      resultado_alcancado: { type: 'string' },
                    }
                  }
                }
              }
            },
            model: 'claude_sonnet_4_6',
          });
        } catch (e: any) {
          detalhe.status = 'erro_ia';
          detalhe.erro = e.message;
          stats.erros++;
          stats.detalhes.push(detalhe);
          continue;
        }

        // 3b. Normalizar campos
        const mesInfo = normalizeMes(dadosIA.mes_referencia || pdf.name);
        const museuNorm = normalizeMuseu(dadosIA.museu || pdf.name) || dadosIA.museu || 'Geral';
        const ano = dadosIA.ano || new Date(pdf.createdTime || Date.now()).getFullYear();
        const mesNome = mesInfo?.mes || dadosIA.mes_referencia || '';

        if (!dadosIA.nome_profissional && !dadosIA.email_profissional) {
          detalhe.status = 'sem_autor';
          detalhe.acoes.push('Pulado: sem nome/email do profissional no PDF');
          stats.detalhes.push(detalhe);
          continue;
        }

        // 3c. Localizar usuário no sistema
        let usuarioVinculado: any = null;
        if (dadosIA.email_profissional) {
          usuarioVinculado = existingUsers.find((u: any) =>
            u.email?.toLowerCase() === dadosIA.email_profissional?.toLowerCase()
          ) || null;
        }
        if (!usuarioVinculado && dadosIA.nome_profissional) {
          const nomeBusca = String(dadosIA.nome_profissional || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          usuarioVinculado = existingUsers.find((u: any) => {
            const un = String(u.full_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return un && nomeBusca && un.includes(nomeBusca.split(' ')[0]);
          }) || null;
        }

        // 3d. Verificar se relatório já existe
        const usuarioNome = usuarioVinculado?.full_name || dadosIA.nome_profissional || '';
        let existingReport = existingReports.find((r: any) => {
          const nomeOk = String(r.author_name || '').toLowerCase().includes(usuarioNome.toLowerCase().split(' ')[0]);
          const mesOk = mesNome && r.mes_referencia?.toLowerCase() === mesNome.toLowerCase();
          const anoOk = r.ano === ano;
          return nomeOk && mesOk && anoOk;
        }) || null;

        const origemObs = `Restaurado automaticamente do Drive em ${new Date().toLocaleDateString('pt-BR')}. Arquivo: ${pdf.name}.`;

        if (dry_run) {
          detalhe.acoes.push(`[DRY_RUN] ${existingReport ? 'Atualizaria' : 'Criaria'} relatório: ${usuarioNome} — ${mesNome}/${ano} — ${museuNorm}`);
          stats.detalhes.push(detalhe);
          continue;
        }

        let reportId: string;

        if (existingReport) {
          // Atualizar apenas campos vazios
          const updates: any = {};
          if (!existingReport.resumo_periodo && dadosIA.resumo_periodo) updates.resumo_periodo = dadosIA.resumo_periodo;
          if (!existingReport.resumo_executivo && dadosIA.resumo_executivo) updates.resumo_executivo = dadosIA.resumo_executivo;
          if (!existingReport.avaliacao_pontos_positivos && dadosIA.pontos_positivos) updates.avaliacao_pontos_positivos = dadosIA.pontos_positivos;
          if (!existingReport.avaliacao_desafios && dadosIA.desafios) updates.avaliacao_desafios = dadosIA.desafios;
          if (!existingReport.avaliacao_sugestoes && dadosIA.sugestoes) updates.avaliacao_sugestoes = dadosIA.sugestoes;
          if (!existingReport.publico_geral_declarado && dadosIA.publico_geral) updates.publico_geral_declarado = dadosIA.publico_geral;
          if (!existingReport.drive_backup_relatorio_url && pdf.webViewLink) updates.drive_backup_relatorio_url = pdf.webViewLink;
          const obsAtual = existingReport.historico_observacoes || '';
          if (!obsAtual.includes(pdf.name)) updates.historico_observacoes = (obsAtual ? obsAtual + '\n' : '') + origemObs;

          if (Object.keys(updates).length > 0) {
            await base44.asServiceRole.entities.Report.update(existingReport.id, updates);
          }
          reportId = existingReport.id;
          stats.relatorios_atualizados++;
          detalhe.acoes.push('Relatório atualizado com campos vazios preenchidos');
        } else {
          const statusIA = String(dadosIA.status_relatorio || '').toUpperCase();
          let reportStatus = 'SUBMITTED';
          if (statusIA.includes('APROVAD')) reportStatus = 'APPROVED';
          else if (statusIA.includes('REVISAO')) reportStatus = 'IN_REVIEW';

          const novoReport = await base44.asServiceRole.entities.Report.create({
            ...(usuarioVinculado?.id ? { created_by_id: usuarioVinculado.id } : {}),
            author_name: usuarioNome,
            funcao: dadosIA.funcao || '',
            museu: museuNorm,
            mes_referencia: mesNome,
            ano,
            status: reportStatus,
            resumo_periodo: dadosIA.resumo_periodo || '',
            resumo_executivo: dadosIA.resumo_executivo || '',
            avaliacao_pontos_positivos: dadosIA.pontos_positivos || '',
            avaliacao_desafios: dadosIA.desafios || '',
            avaliacao_sugestoes: dadosIA.sugestoes || '',
            publico_geral_declarado: dadosIA.publico_geral || 0,
            historico_observacoes: origemObs,
            drive_backup_relatorio_url: pdf.webViewLink || '',
            drive_backup_status: 'concluido',
          });

          // Também adiciona ao cache local para evitar duplicatas dentro do mesmo lote
          existingReports.push({ ...novoReport, author_name: usuarioNome, mes_referencia: mesNome, ano });

          reportId = novoReport.id;
          stats.relatorios_criados++;
          detalhe.acoes.push(`Relatório criado: ${usuarioNome} — ${mesNome}/${ano} — ${museuNorm}`);
        }

        // 3e. Injetar atividades faltantes
        const atividadesIA = dadosIA.atividades || [];
        if (atividadesIA.length > 0) {
          const reportAtual = await base44.asServiceRole.entities.Report.get(reportId).catch(() => null);
          const atividadesExistentes: any[] = Array.isArray(reportAtual?.atividades) ? reportAtual.atividades : [];
          const titulosExistentes = new Set(atividadesExistentes.map((a: any) => String(a.titulo || a.nome || '').toLowerCase().trim()));

          const novas = atividadesIA
            .filter((a: any) => {
              const key = String(a.titulo || '').toLowerCase().trim();
              return key && !titulosExistentes.has(key);
            })
            .map((a: any) => ({
              titulo: a.titulo || '',
              nome: a.titulo || '',
              descricao: a.descricao || '',
              data_realizacao: a.data_realizacao || null,
              publico_estimado: a.publico_total || 0,
              publico_total: a.publico_total || 0,
              classificacao: ['META','ROTINA','EXTRA'].includes(String(a.classificacao || '').toUpperCase()) ? a.classificacao.toUpperCase() : 'ROTINA',
              meta_codigo: a.meta_vinculada || '',
              resultado_alcancado: a.resultado_alcancado || '',
              museu_lista: museuNorm ? [museuNorm] : [],
              origem: 'restaurado_do_drive',
            }));

          if (novas.length > 0) {
            await base44.asServiceRole.entities.Report.update(reportId, {
              atividades: [...atividadesExistentes, ...novas],
            });
            stats.atividades_restauradas += novas.length;
            detalhe.acoes.push(`${novas.length} atividade(s) restaurada(s)`);
          }
        }

        // 3f. Vincular fotos da mesma pasta ao relatório
        const fotosMuseu = imagens.filter((img: any) => {
          const imgName = img.name.toLowerCase();
          const museuStr = museuNorm.toLowerCase();
          const primeiroNome = usuarioNome.toLowerCase().split(' ')[0];
          return imgName.includes(museuStr) || imgName.includes(primeiroNome);
        });

        for (const foto of fotosMuseu.slice(0, 20)) {
          const jaVinculada = await base44.asServiceRole.entities.ReportPhoto.filter(
            { report_id: reportId, file_url: foto.webViewLink }
          ).catch(() => []);
          if (jaVinculada?.length > 0) continue;

          await base44.asServiceRole.entities.ReportPhoto.create({
            report_id: reportId,
            file_name: foto.name,
            file_url: foto.webViewLink || '',
            caption: `${museuNorm} — ${mesNome}/${ano}`,
            mes_referencia: mesNome,
            ano,
          }).catch(() => {});
          stats.fotos_vinculadas++;
        }

        detalhe.usuario = usuarioNome;
        detalhe.museu = museuNorm;
        detalhe.mes_ano = `${mesNome}/${ano}`;

      } catch (e: any) {
        detalhe.status = 'erro';
        detalhe.erro = e.message;
        stats.erros++;
      }

      stats.detalhes.push(detalhe);
    }

    // 4. Registrar log de auditoria
    if (!dry_run) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'SYNC',
        entity_type: 'REPORT',
        entity_id: 'batch',
        actor_email: runnerEmail,
        actor_name: runnerName,
        details: `Sincronização automática Drive → Sistema. PDFs: ${stats.total_pdfs_varridos}. Criados: ${stats.relatorios_criados}. Atualizados: ${stats.relatorios_atualizados}. Atividades: ${stats.atividades_restauradas}. Fotos: ${stats.fotos_vinculadas}. Erros: ${stats.erros}.`,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      dry_run,
      pasta_id: targetFolder,
      stats,
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});