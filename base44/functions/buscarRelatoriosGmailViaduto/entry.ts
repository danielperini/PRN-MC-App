import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const VIADUTO_EMAIL = 'danielperini.mc@viadutodasartes.org.br';
const VIADUTO_USER_NAME = 'Daniel Perini';

const RELATORIO_KEYWORDS = [
  'relatório', 'relatorio', 'report', 'mensal', 'atividade', 'museu',
  'mis', 'mhab', 'mumo', 'viaduto', 'museus centro', 'execução', 'execucao',
  'programação', 'programacao', 'cultural', 'mediação', 'mediacao',
];

const BLOCKED_KEYWORDS = ['spam', 'promoção', 'newsletter', 'propaganda', 'marketing'];

function normalize(str: string) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isRelevant(subject: string, from: string, snippet: string) {
  const combined = normalize(`${subject} ${from} ${snippet}`);
  for (const kw of BLOCKED_KEYWORDS) if (combined.includes(normalize(kw))) return false;
  for (const kw of RELATORIO_KEYWORDS) if (combined.includes(normalize(kw))) return true;
  return false;
}

function isAllowedAttachment(filename: string, mimeType: string) {
  const name = normalize(filename || '');
  const allowedExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls'];
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  if (mimeType && allowedMimes.includes(mimeType)) return true;
  for (const ext of allowedExts) if (name.endsWith(ext)) return true;
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (!isAuthenticated) return Response.json({ error: 'Não autenticado.' }, { status: 401 });
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Usuário não encontrado.' }, { status: 401 });
    const userRole = String(user.role || user.base_role || '').toLowerCase();
    const isAdmin = userRole === 'admin' || user.role === 'admin';
    const isCoord = ['coordenador', 'coordinator'].includes(userRole);
    if (!isAdmin && !isCoord) {
      return Response.json({ error: 'Acesso restrito a admins e coordenadores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const maxResults = body.maxResults || 50;
    // dryRun = true: analisa e retorna preview com dados_ia mas NÃO salva nada
    // dryRun = false: aplica (salva e preenche relatórios)
    const dryRun = body.dryRun === true;
    const pageToken = body.pageToken || null;
    const preencherRelatorios = body.preencherRelatorios !== false;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Buscar emails com anexo de 2026 em diante
    const searchQuery = `has:attachment after:2026/01/01`;
    let listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${maxResults}`;
    if (pageToken) listUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

    const listRes = await fetch(listUrl, { headers: authHeader });
    if (!listRes.ok) {
      const err = await listRes.text();
      return Response.json({ error: `Erro ao listar e-mails: ${listRes.status} - ${err}` }, { status: 500 });
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];
    const nextPageToken = listData.nextPageToken || null;

    if (messages.length === 0) {
      return Response.json({ success: true, mensagem: 'Nenhum e-mail com anexo encontrado.', processados: 0, nextPageToken: null });
    }

    const resultados: any[] = [];
    let importados = 0;
    let ignorados = 0;
    let erros = 0;
    let relatoriosPreenchidos = 0;

    for (const msg of messages) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: authHeader }
        );
        if (!msgRes.ok) { erros++; continue; }

        const message = await msgRes.json();
        const headers: Record<string, string> = {};
        (message.payload?.headers || []).forEach((h: any) => { headers[h.name?.toLowerCase()] = h.value; });

        const subject = headers['subject'] || '';
        const from = headers['from'] || '';
        const dateStr = headers['date'] || '';

        if (!isRelevant(subject, from, message.snippet || '')) {
          ignorados++;
          continue;
        }

        // Coletar partes com anexo
        const parts: any[] = [];
        function collectParts(part: any) {
          if (part.parts) part.parts.forEach(collectParts);
          else if (part.filename && part.body?.attachmentId) parts.push(part);
        }
        collectParts(message.payload);

        if (parts.length === 0) { ignorados++; continue; }

        for (const part of parts) {
          const filename = part.filename;
          const mimeType = part.mimeType;

          if (!isAllowedAttachment(filename, mimeType)) continue;

          // Verificar duplicidade
          const existing = await base44.asServiceRole.entities.DocumentIntake.filter({
            file_name_original: filename,
            user_email: VIADUTO_EMAIL,
            status_registro: 'ATIVO',
          }, '', 1).catch(() => []);

          if (existing.length > 0) {
            resultados.push({ messageId: msg.id, subject, filename, status: 'duplicado' });
            ignorados++;
            continue;
          }

          // Baixar e fazer upload do anexo para poder analisar com IA
          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
            { headers: authHeader }
          );
          if (!attRes.ok) { erros++; continue; }

          const attData = await attRes.json();
          const rawBytes = Uint8Array.from(
            atob(attData.data.replace(/-/g, '+').replace(/_/g, '/')),
            c => c.charCodeAt(0)
          );

          const file = new File([rawBytes], filename, { type: mimeType || 'application/octet-stream' });
          const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          if (!uploadRes?.file_url) { erros++; continue; }

          // Analisar com IA — sempre, inclusive no dryRun (é o ponto de validação)
          let dadosIA: any = null;
          const isPdfOrDoc = mimeType === 'application/pdf' ||
            mimeType === 'application/msword' ||
            mimeType?.includes('wordprocessingml');

          if (isPdfOrDoc) {
            try {
              dadosIA = await invokeLLM(base44.asServiceRole,{
                prompt: `Você é especialista em análise de relatórios mensais de atividades culturais de museus.
Analise este documento PDF/DOCX — é um RELATÓRIO MENSAL de um profissional dos Museus Centro (MIS, MHAB, MUMO, Viaduto das Artes) em Belo Horizonte.

Extraia TODAS as informações estruturadas. Seja preciso e completo.

Retorne JSON com:
- nome_profissional: nome completo do autor
- email_profissional: email se mencionado
- funcao: função/cargo
- museu: museu principal (MIS, MHAB, MUMO, Viaduto das Artes, ou nome exato encontrado)
- mes_referencia: mês em português minúsculo (ex: "maio", "junho")
- ano: ano numérico (ex: 2026)
- resumo_periodo: resumo geral do período (texto corrido, 1-3 parágrafos)
- resumo_executivo: síntese das principais realizações (1-2 parágrafos curtos)
- pontos_positivos: conquistas e pontos positivos do mês
- desafios: dificuldades enfrentadas
- sugestoes: sugestões de melhoria
- comentarios_gerais: observações gerais
- publico_geral: número total de visitantes/público declarado (número inteiro)
- numero_protocolo: número de protocolo se houver
- atividades: array com cada atividade descrita. Para cada uma:
  - titulo: nome da atividade
  - descricao: descrição detalhada
  - data_realizacao: data no formato YYYY-MM-DD se possível
  - data_inicio: data início se for período
  - data_fim: data fim se for período
  - local: local de realização
  - publico_estimado: público estimado (número)
  - publico_total: público total contabilizado (número)
  - classificacao: "META", "ROTINA" ou "EXTRA"
  - meta_vinculada: código da meta (ex: MC3A-20) se mencionado
  - resultado_alcancado: resultado concreto alcançado
  - equipe_responsavel: equipe/responsáveis mencionados
  - justificativa_tecnica: justificativa técnica se houver

Campos ausentes: retorne null ou string vazia.`,
                file_urls: [uploadRes.file_url],
                response_json_schema: {
                  type: 'object',
                  properties: {
                    nome_profissional: { type: 'string' },
                    email_profissional: { type: 'string' },
                    funcao: { type: 'string' },
                    museu: { type: 'string' },
                    mes_referencia: { type: 'string' },
                    ano: { type: 'number' },
                    resumo_periodo: { type: 'string' },
                    resumo_executivo: { type: 'string' },
                    pontos_positivos: { type: 'string' },
                    desafios: { type: 'string' },
                    sugestoes: { type: 'string' },
                    comentarios_gerais: { type: 'string' },
                    publico_geral: { type: 'number' },
                    numero_protocolo: { type: 'string' },
                    atividades: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          titulo: { type: 'string' },
                          descricao: { type: 'string' },
                          data_realizacao: { type: 'string' },
                          data_inicio: { type: 'string' },
                          data_fim: { type: 'string' },
                          local: { type: 'string' },
                          publico_estimado: { type: 'number' },
                          publico_total: { type: 'number' },
                          classificacao: { type: 'string' },
                          meta_vinculada: { type: 'string' },
                          resultado_alcancado: { type: 'string' },
                          equipe_responsavel: { type: 'string' },
                          justificativa_tecnica: { type: 'string' },
                        }
                      }
                    }
                  }
                }
              });
            } catch (iaErr) {
              console.error(`IA falhou para ${filename}:`, iaErr);
            }
          }

          // ── DryRun: retorna preview sem salvar ──
          if (dryRun) {
            importados++;
            resultados.push({
              messageId: msg.id,
              subject,
              filename,
              file_url: uploadRes.file_url,
              mimeType,
              status: 'dry-run',
              dados_ia: dadosIA || null,
              campos_encontrados: dadosIA ? Object.entries(dadosIA)
                .filter(([k, v]) => v && k !== 'atividades')
                .map(([k]) => k) : [],
              atividades_count: (dadosIA?.atividades || []).length,
              atividades_preview: (dadosIA?.atividades || []).slice(0, 5).map((a: any) => ({
                titulo: a.titulo || '',
                data: a.data_realizacao || '',
                publico: a.publico_total || a.publico_estimado || 0,
                classificacao: a.classificacao || 'ROTINA',
              })),
            });
            continue;
          }

          // ── Modo real: salvar e preencher ──
          const intake = await base44.asServiceRole.entities.DocumentIntake.create({
            user_email: VIADUTO_EMAIL,
            user_name: VIADUTO_USER_NAME,
            arquivo_original_url: uploadRes.file_url,
            file_name_original: filename,
            mime_type: mimeType || 'application/octet-stream',
            status_processamento: dadosIA ? 'AGUARDANDO_REVISAO' : 'ENVIADO',
            tipo_detectado: 'DOCUMENTO_ADMINISTRATIVO',
            origem: 'gmail_viaduto',
            resultado_ia: dadosIA || null,
            revisado_pelo_usuario: false,
            status_registro: 'ATIVO',
            grupo_status: 'INCOMPLETO',
          });

          importados++;

          // Preencher relatório se temos dados da IA
          if (dadosIA && preencherRelatorios && intake?.id) {
            try {
              const mesNome = (dadosIA.mes_referencia || '').toLowerCase().trim();
              const ano = dadosIA.ano || new Date().getFullYear();
              const museu = dadosIA.museu || 'Viaduto das Artes';
              const usuarioNome = dadosIA.nome_profissional || VIADUTO_USER_NAME;

              // Buscar relatório existente (por usuário ou por nome)
              const usuarios = await base44.asServiceRole.entities.User.filter({ email: VIADUTO_EMAIL }).catch(() => []);
              const usuarioId = (usuarios as any[])[0]?.id || null;

              let existingReport: any = null;
              if (usuarioId) {
                const candidatos = await base44.asServiceRole.entities.Report.filter(
                  { created_by_id: usuarioId }, '-created_date', 50
                ).catch(() => []);
                existingReport = (candidatos as any[]).find((r: any) =>
                  r.mes_referencia?.toLowerCase() === mesNome && (!r.ano || r.ano === ano)
                ) || null;
              }

              if (!existingReport && mesNome) {
                const todos = await base44.asServiceRole.entities.Report.filter({}, '-created_date', 200).catch(() => []);
                existingReport = (todos as any[]).find((r: any) => {
                  const nomeOk = String(r.author_name || '').toLowerCase().includes('daniel');
                  const mesOk = r.mes_referencia?.toLowerCase() === mesNome;
                  const anoOk = !r.ano || r.ano === ano;
                  return nomeOk && mesOk && anoOk;
                }) || null;
              }

              const origemObs = `Preenchido via Gmail (${VIADUTO_EMAIL}) em ${new Date().toLocaleDateString('pt-BR')}. Arquivo: ${filename}.`;
              const camposPreenchidos: string[] = [];

              if (existingReport) {
                const updates: Record<string, any> = {};
                if (!existingReport.resumo_periodo && dadosIA.resumo_periodo) { updates.resumo_periodo = dadosIA.resumo_periodo; camposPreenchidos.push('resumo_periodo'); }
                if (!existingReport.resumo_executivo && dadosIA.resumo_executivo) { updates.resumo_executivo = dadosIA.resumo_executivo; camposPreenchidos.push('resumo_executivo'); }
                if (!existingReport.avaliacao_pontos_positivos && dadosIA.pontos_positivos) { updates.avaliacao_pontos_positivos = dadosIA.pontos_positivos; camposPreenchidos.push('pontos_positivos'); }
                if (!existingReport.avaliacao_desafios && dadosIA.desafios) { updates.avaliacao_desafios = dadosIA.desafios; camposPreenchidos.push('desafios'); }
                if (!existingReport.avaliacao_sugestoes && dadosIA.sugestoes) { updates.avaliacao_sugestoes = dadosIA.sugestoes; camposPreenchidos.push('sugestoes'); }
                if (!existingReport.comentarios_gerais && dadosIA.comentarios_gerais) { updates.comentarios_gerais = dadosIA.comentarios_gerais; camposPreenchidos.push('comentarios_gerais'); }
                if (!existingReport.publico_geral_declarado && dadosIA.publico_geral) { updates.publico_geral_declarado = dadosIA.publico_geral; camposPreenchidos.push('publico_geral'); }
                if (!existingReport.funcao && dadosIA.funcao) { updates.funcao = dadosIA.funcao; camposPreenchidos.push('funcao'); }

                const obsAtual = existingReport.historico_observacoes || '';
                if (!obsAtual.includes('Gmail')) updates.historico_observacoes = obsAtual ? obsAtual + '\n' + origemObs : origemObs;

                // Adicionar atividades novas
                const atividadesIA = dadosIA.atividades || [];
                if (atividadesIA.length > 0) {
                  const reportAtual = await base44.asServiceRole.entities.Report.get(existingReport.id).catch(() => null);
                  const atividadesExist: any[] = Array.isArray(reportAtual?.atividades) ? reportAtual.atividades : [];
                  const titulosExist = new Set(atividadesExist.map((a: any) => String(a.titulo || a.nome || '').toLowerCase().trim()));
                  const novas = atividadesIA.filter((a: any) => {
                    const key = String(a.titulo || a.nome || '').toLowerCase().trim();
                    return key && !titulosExist.has(key);
                  }).map((a: any) => {
                    const classificacao = ['META','ROTINA','EXTRA'].includes(String(a.classificacao||'').toUpperCase())
                      ? String(a.classificacao).toUpperCase() : 'ROTINA';
                    const dataRealizacao = a.data_realizacao || a.data_inicio || null;
                    const publicoTotal = Number(a.publico_total || a.publico_estimado || 0);
                    return {
                      id: `ia_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                      nome: a.titulo || a.nome || '',
                      titulo: a.titulo || a.nome || '',
                      descricao: a.descricao || '',
                      data_inicio: dataRealizacao,
                      data_fim: a.data_fim || null,
                      data_realizacao: dataRealizacao,
                      local: a.local || '',
                      publico_total: publicoTotal,
                      publico_estimado: Number(a.publico_estimado || 0),
                      classificacao,
                      meta_codigo: a.meta_vinculada || '',
                      meta_id: a.meta_vinculada || '',
                      resultado_alcancado: a.resultado_alcancado || '',
                      equipe_responsavel: a.equipe_responsavel || '',
                      equipe_participante_ids: [],
                      justificativa_tecnica: a.justificativa_tecnica || '',
                      museu_lista: [museu],
                      origem: 'gmail_viaduto',
                    };
                  });
                  if (novas.length > 0) {
                    updates.atividades = [...atividadesExist, ...novas];
                    camposPreenchidos.push(`atividades(${novas.length})`);
                  }
                }

                if (Object.keys(updates).length > 0) {
                  await base44.asServiceRole.entities.Report.update(existingReport.id, updates);
                }
                relatoriosPreenchidos++;
                resultados.push({
                  messageId: msg.id, subject, filename, status: 'preenchido',
                  report_id: existingReport.id, campos_preenchidos: camposPreenchidos,
                  atividades: (dadosIA.atividades || []).length, museu, mes: mesNome, ano,
                });
              } else {
                // Criar novo relatório
                const atividades = (dadosIA.atividades || []).map((a: any) => {
                  const classificacao = ['META','ROTINA','EXTRA'].includes(String(a.classificacao||'').toUpperCase())
                    ? String(a.classificacao).toUpperCase() : 'ROTINA';
                  const dataRealizacao = a.data_realizacao || a.data_inicio || null;
                  const publicoTotal = Number(a.publico_total || a.publico_estimado || 0);
                  return {
                    id: `ia_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                    nome: a.titulo || a.nome || '',
                    titulo: a.titulo || a.nome || '',
                    descricao: a.descricao || '',
                    data_inicio: dataRealizacao,
                    data_fim: a.data_fim || null,
                    data_realizacao: dataRealizacao,
                    local: a.local || '',
                    publico_total: publicoTotal,
                    publico_estimado: Number(a.publico_estimado || 0),
                    classificacao,
                    meta_codigo: a.meta_vinculada || '',
                    meta_id: a.meta_vinculada || '',
                    resultado_alcancado: a.resultado_alcancado || '',
                    equipe_responsavel: a.equipe_responsavel || '',
                    equipe_participante_ids: [],
                    justificativa_tecnica: a.justificativa_tecnica || '',
                    museu_lista: [museu],
                    origem: 'gmail_viaduto',
                  };
                });

                const novoReport = await base44.asServiceRole.entities.Report.create({
                  ...(usuarioId ? { created_by_id: usuarioId } : {}),
                  author_name: usuarioNome,
                  funcao: dadosIA.funcao || '',
                  museu,
                  mes_referencia: mesNome,
                  ano,
                  status: 'SUBMITTED',
                  resumo_periodo: dadosIA.resumo_periodo || '',
                  resumo_executivo: dadosIA.resumo_executivo || '',
                  avaliacao_pontos_positivos: dadosIA.pontos_positivos || '',
                  avaliacao_desafios: dadosIA.desafios || '',
                  avaliacao_sugestoes: dadosIA.sugestoes || '',
                  comentarios_gerais: dadosIA.comentarios_gerais || '',
                  publico_geral_declarado: dadosIA.publico_geral || 0,
                  numero_protocolo: dadosIA.numero_protocolo || '',
                  historico_observacoes: origemObs,
                  atividades,
                });
                relatoriosPreenchidos++;
                resultados.push({
                  messageId: msg.id, subject, filename, status: 'criado',
                  report_id: novoReport.id, campos_preenchidos: ['relatorio_completo'],
                  atividades: atividades.length, museu, mes: mesNome, ano,
                });
              }

              await base44.asServiceRole.entities.AuditLog.create({
                action: 'CREATE',
                entity_type: 'REPORT',
                actor_email: user.email,
                actor_name: user.full_name || user.email,
                details: `Relatório preenchido via Gmail Viaduto. Arquivo: ${filename}. Mês: ${mesNome}/${ano}.`,
              }).catch(() => {});

            } catch (fillErr) {
              console.error(`Erro ao preencher relatório para ${filename}:`, fillErr);
              resultados.push({ messageId: msg.id, subject, filename, status: 'importado_sem_relatorio', erro: (fillErr as Error).message });
            }
          } else {
            resultados.push({ messageId: msg.id, subject, filename, status: 'importado', dados_ia: !!dadosIA });
          }
        }
      } catch (msgErr) {
        console.error(`Erro processando mensagem ${msg.id}:`, msgErr);
        erros++;
      }
    }

    return Response.json({
      success: true,
      mensagem: dryRun
        ? `Simulação: ${importados} arquivo(s) analisados pela IA. Nenhum dado salvo.`
        : `${importados} arquivo(s) importados · ${relatoriosPreenchidos} relatório(s) preenchidos/criados · ${ignorados} ignorados · ${erros} erros.`,
      importados,
      relatoriosPreenchidos,
      ignorados,
      erros,
      dryRun,
      nextPageToken,
      resultados,
    });

  } catch (error) {
    console.error('buscarRelatoriosGmailViaduto error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});