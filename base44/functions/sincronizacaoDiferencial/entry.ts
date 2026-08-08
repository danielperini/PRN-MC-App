import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

// Pasta raiz de exportações do Drive
const DRIVE_EXPORTS_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

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

async function listFolder(accessToken: string, folderId: string): Promise<any[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,parents)';
  let all: any[] = [];
  let pageToken: string | null = null;
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    all = all.concat(data.files || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return all;
}

// Varredura recursiva com limite de profundidade e rastreamento de pasta pai
async function varrerRecursivo(accessToken: string, folderId: string, folderPath: string, depth = 0): Promise<{ pdfs: any[], imagens: any[] }> {
  if (depth > 8) return { pdfs: [], imagens: [] };
  const items = await listFolder(accessToken, folderId);

  const pdfs: any[] = [];
  const imagens: any[] = [];

  for (const item of items) {
    // Enriquecer com metadados da pasta pai para vinculação
    const enriched = { ...item, _folderPath: folderPath, _folderId: folderId };

    if (item.mimeType === 'application/vnd.google-apps.folder') {
      const sub = await varrerRecursivo(accessToken, item.id, `${folderPath}/${item.name}`, depth + 1);
      pdfs.push(...sub.pdfs);
      imagens.push(...sub.imagens);
    } else if (item.mimeType === 'application/pdf') {
      pdfs.push(enriched);
    } else if (item.mimeType?.startsWith('image/')) {
      imagens.push(enriched);
    }
  }

  return { pdfs, imagens };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Suporta execução por automação agendada (sem contexto de user)
    let runnerEmail = 'automacao@sistema';
    try {
      const isAuth = await base44.auth.isAuthenticated();
      if (isAuth) {
        const user = await base44.auth.me();
        if (user) runnerEmail = user.email || runnerEmail;
      }
    } catch { /* execução agendada, sem user */ }

    const body = await req.json().catch(() => ({})) as any;
    const dry_run = body?.dry_run === true;
    const folder_id = body?.folder_id || DRIVE_EXPORTS_FOLDER_ID;
    const limite_pdfs = Math.min(body?.limite_pdfs || 20, 50); // máximo 50 por execução

    // Obter token do Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // ── 1. Carregar IDs de arquivos já processados (drive_file_id nos logs de backup) ──
    const [logsExistentes, reportsFotos, relatoriosExistentes, usuariosExistentes] = await Promise.all([
      base44.asServiceRole.entities.BackupLog.filter({ entity_type: 'REPORT_DRIVE_SYNC' }, '-created_date', 2000).catch(() => []),
      base44.asServiceRole.entities.ReportPhoto.filter({}, '-created_date', 2000).catch(() => []),
      base44.asServiceRole.entities.Report.list('-created_date', 500).catch(() => []),
      base44.asServiceRole.entities.User.list().catch(() => []),
    ]);

    // Set de file_ids já processados (PDFs já sincronizados)
    const idsProcessados = new Set<string>(
      (logsExistentes as any[])
        .filter((l: any) => l.drive_file_id)
        .map((l: any) => String(l.drive_file_id))
    );

    // Set de file_ids de fotos já vinculadas
    const fotosDriveIdsVinculados = new Set<string>(
      (reportsFotos as any[])
        .filter((f: any) => f.drive_file_id)
        .map((f: any) => String(f.drive_file_id))
    );

    // ── 2. Varrer pasta de exportações ──
    const { pdfs: todosPDFs, imagens: todasImagens } = await varrerRecursivo(accessToken, folder_id, '/');

    // ── 3. Filtrar apenas PDFs NOVOS (não processados ainda) ──
    const pdfsNovos = todosPDFs
      .filter((f: any) => f.id && !idsProcessados.has(String(f.id)))
      .slice(0, limite_pdfs);

    const stats = {
      pdfs_total_drive: todosPDFs.length,
      imagens_total_drive: todasImagens.length,
      pdfs_ja_processados: todosPDFs.length - pdfsNovos.length,
      pdfs_novos: pdfsNovos.length,
      relatorios_criados: 0,
      relatorios_atualizados: 0,
      atividades_adicionadas: 0,
      fotos_vinculadas: 0,
      fotos_ja_vinculadas: 0,
      erros: 0,
      detalhes: [] as any[],
    };

    if (pdfsNovos.length === 0) {
      return Response.json({
        success: true,
        mensagem: 'Nenhum arquivo novo encontrado. Sistema já está sincronizado.',
        dry_run,
        stats,
      });
    }

    // ── 4. Processar cada PDF novo ──
    for (const pdf of pdfsNovos) {
      const detalhe: any = {
        arquivo: pdf.name,
        drive_file_id: pdf.id,
        pasta: pdf._folderPath,
        status: 'ok',
        acoes: [],
      };

      try {
        const fileUrl = pdf.webContentLink || pdf.webViewLink;
        if (!fileUrl) {
          detalhe.status = 'sem_url';
          detalhe.acoes.push('Sem URL de acesso ao arquivo');
          stats.erros++;
          stats.detalhes.push(detalhe);
          continue;
        }

        // ── 4a. Extrair dados com IA ──
        let dadosIA: any = {};
        try {
          dadosIA = await invokeLLM(base44.asServiceRole,{
            prompt: `Analise este PDF de relatório mensal de museu cultural e extraia os dados estruturados em JSON.

Extraia:
- nome_profissional: nome completo do autor do relatório
- email_profissional: email do autor (null se não encontrado)
- museu: sigla ou nome do museu (MIS, MHAB, MUMO, ou nome completo)
- mes_referencia: nome do mês em português (ex: "março")
- ano: número do ano (ex: 2026)
- funcao: cargo ou função do profissional
- status_relatorio: APROVADO, SUBMETIDO, EM_REVISAO ou RASCUNHO
- resumo_periodo: texto de resumo ou apresentação do período
- resumo_executivo: síntese executiva das realizações
- pontos_positivos: destaques positivos do mês
- desafios: dificuldades enfrentadas
- sugestoes: sugestões de melhoria
- publico_geral: número total de público registrado
- atividades: lista de atividades com: titulo, descricao, data_realizacao (YYYY-MM-DD ou null), publico_total, classificacao (META/ROTINA/EXTRA), meta_vinculada, resultado_alcancado, local

Retorne apenas os dados que realmente constam no PDF. Não invente informações.`,
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
                      local: { type: 'string' },
                    }
                  }
                }
              }
            },
            model: 'claude_sonnet_4_6',
          });
        } catch (e: any) {
          detalhe.status = 'erro_ia';
          detalhe.acoes.push(`Falha na análise por IA: ${e.message}`);
          stats.erros++;
          stats.detalhes.push(detalhe);

          // Registrar mesmo com erro para não reprocessar eternamente
          if (!dry_run) {
            await base44.asServiceRole.entities.BackupLog.create({
              entity_type: 'REPORT_DRIVE_SYNC',
              drive_file_id: pdf.id,
              file_name: pdf.name,
              status: 'erro_ia',
              error_message: e.message,
              processed_at: new Date().toISOString(),
            }).catch(() => {});
          }
          continue;
        }

        // ── 4b. Normalizar campos — usar path da pasta como fallback ──
        const pathCompleto = `${pdf._folderPath || ''} ${pdf.name || ''}`;
        const mesInfo = normalizeMes(dadosIA.mes_referencia || pathCompleto);
        const museuNorm = normalizeMuseu(dadosIA.museu || pathCompleto) || dadosIA.museu || 'Geral';
        const ano = dadosIA.ano || (() => {
          const m = pathCompleto.match(/20\d{2}/); return m ? parseInt(m[0]) : new Date(pdf.createdTime || Date.now()).getFullYear();
        })();
        const mesNome = mesInfo?.mes || dadosIA.mes_referencia || '';
        const mesNum = mesInfo?.mesNum || 0;

        // Extrair nome do profissional do path da pasta se a IA não encontrou
        // Padrão: "Mês AAAA - Nome Completo (STATUS)" ou "Nome Completo - Mês AAAA"
        if (!dadosIA.nome_profissional) {
          const folderName = (pdf._folderPath || '').split('/').filter(Boolean).pop() || '';
          const matchNome = folderName.match(/(?:\w+ \d{4}\s*-\s*)(.+?)(?:\s*\(|$)/) ||
                            folderName.match(/^(.+?)\s*-\s*\w+ \d{4}/);
          if (matchNome) {
            const candidato = matchNome[1].trim();
            // Excluir nomes genéricos como "Produção Viaduto das Artes"
            if (!candidato.toLowerCase().includes('viaduto') && !candidato.toLowerCase().includes('produção') && candidato.split(' ').length >= 2) {
              dadosIA.nome_profissional = candidato;
            }
          }
        }

        if (!dadosIA.nome_profissional) {
          detalhe.status = 'sem_autor';
          detalhe.acoes.push('PDF sem identificação do profissional — pulado');
          stats.detalhes.push(detalhe);

          if (!dry_run) {
            await base44.asServiceRole.entities.BackupLog.create({
              entity_type: 'REPORT_DRIVE_SYNC',
              drive_file_id: pdf.id,
              file_name: pdf.name,
              status: 'sem_autor',
              processed_at: new Date().toISOString(),
            }).catch(() => {});
          }
          continue;
        }

        // ── 4c. Localizar usuário ──
        let usuarioVinculado: any = null;
        if (dadosIA.email_profissional) {
          usuarioVinculado = (usuariosExistentes as any[]).find((u: any) =>
            String(u.email || '').toLowerCase() === String(dadosIA.email_profissional || '').toLowerCase()
          ) || null;
        }
        if (!usuarioVinculado && dadosIA.nome_profissional) {
          const nomeBusca = String(dadosIA.nome_profissional || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          usuarioVinculado = (usuariosExistentes as any[]).find((u: any) => {
            const un = String(u.full_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return un && nomeBusca && (un.includes(nomeBusca.split(' ')[0]) || nomeBusca.includes(un.split(' ')[0]));
          }) || null;
        }

        const usuarioNome = usuarioVinculado?.full_name || dadosIA.nome_profissional || '';

        if (dry_run) {
          const existeJa = (relatoriosExistentes as any[]).find((r: any) => {
            const nomeOk = String(r.author_name || '').toLowerCase().includes(usuarioNome.toLowerCase().split(' ')[0]);
            return nomeOk && r.mes_referencia?.toLowerCase() === mesNome.toLowerCase() && r.ano === ano;
          });
          detalhe.acoes.push(`[DRY_RUN] ${existeJa ? 'Atualizaria' : 'Criaria'} relatório: ${usuarioNome} — ${mesNome}/${ano} — ${museuNorm}`);
          stats.detalhes.push(detalhe);
          continue;
        }

        // ── 4d. Verificar relatório existente ──
        let existingReport = (relatoriosExistentes as any[]).find((r: any) => {
          const nomeOk = usuarioVinculado?.id
            ? r.created_by_id === usuarioVinculado.id
            : String(r.author_name || '').toLowerCase().includes(usuarioNome.toLowerCase().split(' ')[0]);
          return nomeOk && r.mes_referencia?.toLowerCase() === mesNome.toLowerCase() && r.ano === ano;
        }) || null;

        const origemObs = `Drive sync em ${new Date().toLocaleDateString('pt-BR')}: ${pdf.name}`;
        let reportId: string;

        if (existingReport) {
          // Atualizar somente campos vazios — NUNCA sobrescrever
          const updates: any = {};
          if (!existingReport.resumo_periodo && dadosIA.resumo_periodo) updates.resumo_periodo = dadosIA.resumo_periodo;
          if (!existingReport.resumo_executivo && dadosIA.resumo_executivo) updates.resumo_executivo = dadosIA.resumo_executivo;
          if (!existingReport.avaliacao_pontos_positivos && dadosIA.pontos_positivos) updates.avaliacao_pontos_positivos = dadosIA.pontos_positivos;
          if (!existingReport.avaliacao_desafios && dadosIA.desafios) updates.avaliacao_desafios = dadosIA.desafios;
          if (!existingReport.avaliacao_sugestoes && dadosIA.sugestoes) updates.avaliacao_sugestoes = dadosIA.sugestoes;
          if (!existingReport.publico_geral_declarado && dadosIA.publico_geral) updates.publico_geral_declarado = dadosIA.publico_geral;
          if (!existingReport.drive_backup_relatorio_url) updates.drive_backup_relatorio_url = pdf.webViewLink;
          const obsAtual = existingReport.historico_observacoes || '';
          if (!obsAtual.includes(pdf.id)) updates.historico_observacoes = (obsAtual ? obsAtual + '\n' : '') + origemObs;

          if (Object.keys(updates).length > 0) {
            await base44.asServiceRole.entities.Report.update(existingReport.id, updates);
          }
          reportId = existingReport.id;
          stats.relatorios_atualizados++;
          detalhe.acoes.push(`Relatório atualizado: ${usuarioNome} — ${mesNome}/${ano}`);
        } else {
          // Criar relatório novo
          const statusIA = String(dadosIA.status_relatorio || '').toUpperCase();
          const reportStatus = statusIA.includes('APROVAD') ? 'APPROVED' : statusIA.includes('REVISAO') ? 'IN_REVIEW' : 'SUBMITTED';

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

          // Adicionar ao cache local para evitar duplicatas no mesmo lote
          (relatoriosExistentes as any[]).push({ ...novoReport, author_name: usuarioNome, mes_referencia: mesNome, ano, created_by_id: usuarioVinculado?.id });
          reportId = novoReport.id;
          existingReport = novoReport;
          stats.relatorios_criados++;
          detalhe.acoes.push(`Relatório criado: ${usuarioNome} — ${mesNome}/${ano} — ${museuNorm}`);
        }

        // ── 4e. Injetar atividades novas (acumulativo, não substitui) ──
        const atividadesIA: any[] = dadosIA.atividades || [];
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
              publico_total: a.publico_total || 0,
              publico_estimado: a.publico_total || 0,
              classificacao: ['META','ROTINA','EXTRA'].includes(String(a.classificacao || '').toUpperCase()) ? a.classificacao.toUpperCase() : 'ROTINA',
              meta_codigo: a.meta_vinculada || '',
              resultado_alcancado: a.resultado_alcancado || '',
              local: a.local || museuNorm,
              museu_lista: [museuNorm],
              origem: 'drive_diferencial',
            }));

          if (novas.length > 0) {
            await base44.asServiceRole.entities.Report.update(reportId, {
              atividades: [...atividadesExistentes, ...novas],
            });
            stats.atividades_adicionadas += novas.length;
            detalhe.acoes.push(`${novas.length} atividade(s) adicionada(s) (${atividadesIA.length - novas.length} já existiam)`);
          }
        }

        // ── 4f. Vincular fotos da MESMA pasta — somente as novas ──
        // Fotos que estão na mesma pasta ou subpastas do PDF
        const fotosNaPasta = todasImagens.filter((img: any) =>
          img._folderId === pdf._folderId || img._folderPath?.startsWith(pdf._folderPath)
        );

        // Também tenta correspondência por nome (museu + profissional + mês)
        const fotosRelacionadas = todasImagens.filter((img: any) => {
          if (fotosNaPasta.find((f: any) => f.id === img.id)) return true; // já incluída
          const nome = String(img.name || '').toLowerCase();
          const primeiroNome = usuarioNome.toLowerCase().split(' ')[0];
          return nome.includes(museuNorm.toLowerCase()) &&
            (nome.includes(primeiroNome) || mesNome && nome.includes(mesNome.toLowerCase().substring(0, 3)));
        });

        // Mesclar sem duplicatas
        const fotosUnicas = [...new Map([...fotosNaPasta, ...fotosRelacionadas].map(f => [f.id, f])).values()];

        for (const foto of fotosUnicas.slice(0, 30)) {
          // Pular fotos já vinculadas (pelo drive_file_id)
          if (fotosDriveIdsVinculados.has(String(foto.id))) {
            stats.fotos_ja_vinculadas++;
            continue;
          }

          // Inferir atividade mais próxima pelo nome do arquivo
          const atividadesDoRelatorio: any[] = dadosIA.atividades || [];
          const fotoNomeLower = String(foto.name || '').toLowerCase();
          const atividadeVinculada = atividadesDoRelatorio.find((a: any) => {
            const tituloWords = String(a.titulo || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
            return tituloWords.some(w => fotoNomeLower.includes(w));
          }) || atividadesDoRelatorio[0] || null;

          // Legenda enriquecida
          const captionParts: string[] = [];
          if (atividadeVinculada?.titulo) captionParts.push(atividadeVinculada.titulo);
          captionParts.push(museuNorm);
          if (mesNome && ano) captionParts.push(`${mesNome}/${ano}`);
          const caption = captionParts.join(' — ');

          await base44.asServiceRole.entities.ReportPhoto.create({
            report_id: reportId,
            file_name: foto.name,
            file_url: foto.webViewLink || foto.webContentLink || '',
            drive_file_id: foto.id,
            caption,
            mes_referencia: mesNome,
            ano,
            ordem: stats.fotos_vinculadas,
          }).catch(() => {});

          // Marcar como vinculada para não reprocessar neste lote
          fotosDriveIdsVinculados.add(String(foto.id));
          stats.fotos_vinculadas++;
        }

        detalhe.usuario = usuarioNome;
        detalhe.museu = museuNorm;
        detalhe.mes_ano = `${mesNome}/${ano}`;

        // ── 4g. Registrar no BackupLog para não reprocessar ──
        await base44.asServiceRole.entities.BackupLog.create({
          entity_type: 'REPORT_DRIVE_SYNC',
          drive_file_id: pdf.id,
          file_name: pdf.name,
          entity_id: reportId,
          status: 'concluido',
          processed_at: new Date().toISOString(),
          details: `Relatório: ${usuarioNome} — ${mesNome}/${ano}. Atividades: ${stats.atividades_adicionadas}. Fotos: ${stats.fotos_vinculadas}.`,
        }).catch(() => {});

      } catch (e: any) {
        detalhe.status = 'erro';
        detalhe.erro = e.message;
        stats.erros++;
        console.error(`Erro ao processar ${pdf.name}:`, e);
      }

      stats.detalhes.push(detalhe);
    }

    // ── 5. Registrar log de auditoria global ──
    if (!dry_run && (stats.relatorios_criados + stats.relatorios_atualizados) > 0) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'SYNC',
        entity_type: 'REPORT',
        entity_id: 'batch_diferencial',
        actor_email: runnerEmail,
        details: `Sync diferencial Drive. Novos PDFs: ${stats.pdfs_novos}. Criados: ${stats.relatorios_criados}. Atualizados: ${stats.relatorios_atualizados}. Atividades: ${stats.atividades_adicionadas}. Fotos: ${stats.fotos_vinculadas}. Erros: ${stats.erros}.`,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      dry_run,
      mensagem: dry_run
        ? `[DRY RUN] ${stats.pdfs_novos} PDF(s) novo(s) seriam processados.`
        : `${stats.relatorios_criados} criado(s), ${stats.relatorios_atualizados} atualizado(s), ${stats.fotos_vinculadas} foto(s) vinculada(s). ${stats.pdfs_ja_processados} arquivo(s) já processados ignorados.`,
      stats,
    });

  } catch (error: any) {
    console.error('sincronizacaoDiferencial error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});