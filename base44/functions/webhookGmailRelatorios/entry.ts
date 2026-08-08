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
    const body = await req.json().catch(() => ({}));

    // Pegar IDs das novas mensagens injetados pela plataforma
    const messageIds: string[] = body.data?.new_message_ids ?? [];
    if (messageIds.length === 0) {
      return Response.json({ status: 'sem_novas_mensagens' });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    let importados = 0;
    let relatoriosPreenchidos = 0;
    let ignorados = 0;
    const resultados: any[] = [];

    for (const messageId of messageIds) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          { headers: authHeader }
        );
        if (!msgRes.ok) continue;

        const message = await msgRes.json();
        const headers: Record<string, string> = {};
        (message.payload?.headers || []).forEach((h: any) => { headers[h.name?.toLowerCase()] = h.value; });

        const subject = headers['subject'] || '';
        const from = headers['from'] || '';

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

          // Checar duplicidade por nome + email
          const existing = await base44.asServiceRole.entities.DocumentIntake.filter({
            file_name_original: filename,
            user_email: VIADUTO_EMAIL,
            status_registro: 'ATIVO',
          }, '', 1).catch(() => []);
          if ((existing as any[]).length > 0) {
            resultados.push({ messageId, subject, filename, status: 'duplicado' });
            ignorados++;
            continue;
          }

          // Baixar anexo
          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`,
            { headers: authHeader }
          );
          if (!attRes.ok) continue;
          const attData = await attRes.json();
          const rawBytes = Uint8Array.from(
            atob(attData.data.replace(/-/g, '+').replace(/_/g, '/')),
            (c: string) => c.charCodeAt(0)
          );

          // Upload para storage
          const file = new File([rawBytes], filename, { type: mimeType || 'application/octet-stream' });
          const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          if (!uploadRes?.file_url) continue;

          // Analisar com IA se for PDF/DOC
          let dadosIA: any = null;
          const isPdfOrDoc = mimeType === 'application/pdf' || mimeType?.includes('word');
          if (isPdfOrDoc) {
            try {
              dadosIA = await invokeLLM(base44.asServiceRole,{
                prompt: `Analise este relatório mensal de atividades culturais dos Museus Centro (MIS, MHAB, MUMO, Viaduto das Artes) em Belo Horizonte.

Extraia em JSON estruturado:
- nome_profissional, email_profissional, funcao, museu
- mes_referencia (mês em minúsculo, ex: "maio"), ano (número)
- resumo_periodo, resumo_executivo, pontos_positivos, desafios, sugestoes, comentarios_gerais
- publico_geral (número inteiro total de visitantes), numero_protocolo
- atividades: array com titulo, descricao, data_realizacao (YYYY-MM-DD), local, publico_estimado, publico_total, classificacao (META/ROTINA/EXTRA), meta_vinculada, resultado_alcancado`,
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
                          local: { type: 'string' },
                          publico_estimado: { type: 'number' },
                          publico_total: { type: 'number' },
                          classificacao: { type: 'string' },
                          meta_vinculada: { type: 'string' },
                          resultado_alcancado: { type: 'string' },
                        }
                      }
                    }
                  }
                }
              });
            } catch (iaErr) {
              console.error(`[IA] Erro ao processar ${filename}:`, iaErr);
            }
          }

          // Registrar DocumentIntake
          await base44.asServiceRole.entities.DocumentIntake.create({
            user_email: VIADUTO_EMAIL,
            user_name: VIADUTO_USER_NAME,
            arquivo_original_url: uploadRes.file_url,
            file_name_original: filename,
            mime_type: mimeType || 'application/octet-stream',
            status_processamento: dadosIA ? 'AGUARDANDO_REVISAO' : 'ENVIADO',
            tipo_detectado: 'DOCUMENTO_ADMINISTRATIVO',
            origem: 'gmail_webhook',
            resultado_ia: dadosIA || null,
            revisado_pelo_usuario: false,
            status_registro: 'ATIVO',
            grupo_status: 'INCOMPLETO',
          });
          importados++;

          // Preencher/criar relatório automaticamente se IA extraiu dados
          if (dadosIA?.mes_referencia) {
            try {
              const mesNome = dadosIA.mes_referencia.toLowerCase().trim();
              const ano = dadosIA.ano || new Date().getFullYear();
              const museu = dadosIA.museu || 'Viaduto das Artes';

              const todos = await base44.asServiceRole.entities.Report.filter({}, '-created_date', 200).catch(() => []);
              const existingReport = (todos as any[]).find((r: any) => {
                const nomeOk = String(r.author_name || '').toLowerCase().includes('daniel') ||
                  String(r.author_name || '').toLowerCase() === String(dadosIA.nome_profissional || '').toLowerCase();
                const mesOk = r.mes_referencia?.toLowerCase() === mesNome;
                const anoOk = !r.ano || r.ano === ano;
                return nomeOk && mesOk && anoOk;
              }) || null;

              const origemObs = `Preenchido via Gmail webhook em ${new Date().toLocaleDateString('pt-BR')}. Arquivo: ${filename}.`;
              const atividadesIA = (dadosIA.atividades || []).map((a: any) => {
                const classificacao = ['META','ROTINA','EXTRA'].includes(String(a.classificacao||'').toUpperCase())
                  ? String(a.classificacao).toUpperCase()
                  : 'ROTINA';
                // data_realizacao → data_inicio (campo usado pela UI)
                const dataRealizacao = a.data_realizacao || a.data_inicio || null;
                const dataFim = a.data_fim || null;
                // publico_total preferido; fallback para publico_estimado
                const publicoTotal = Number(a.publico_total || a.publico_estimado || 0);
                return {
                  id: `ia_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
                  // campo principal usado pela UI
                  nome: a.titulo || a.nome || '',
                  // alias para compatibilidade com entity Activity
                  titulo: a.titulo || a.nome || '',
                  descricao: a.descricao || '',
                  data_inicio: dataRealizacao,
                  data_fim: dataFim,
                  data_realizacao: dataRealizacao,
                  local: a.local || '',
                  // publico_total é o campo exibido pela UI
                  publico_total: publicoTotal,
                  publico_estimado: Number(a.publico_estimado || 0),
                  classificacao,
                  // meta_codigo armazena o código da meta (MC3A-XX)
                  meta_codigo: a.meta_vinculada || '',
                  // meta_id: tenta mapear pelo código se for um dos conhecidos
                  meta_id: a.meta_vinculada || '',
                  resultado_alcancado: a.resultado_alcancado || '',
                  equipe_responsavel: a.equipe_responsavel || '',
                  // equipe_participante_ids: vazio — usuário preenche manualmente na UI
                  equipe_participante_ids: [],
                  museu_lista: [museu],
                  origem: 'gmail_webhook',
                };
              });

              if (existingReport) {
                const updates: Record<string, any> = {};
                if (!existingReport.resumo_periodo && dadosIA.resumo_periodo) updates.resumo_periodo = dadosIA.resumo_periodo;
                if (!existingReport.resumo_executivo && dadosIA.resumo_executivo) updates.resumo_executivo = dadosIA.resumo_executivo;
                if (!existingReport.avaliacao_pontos_positivos && dadosIA.pontos_positivos) updates.avaliacao_pontos_positivos = dadosIA.pontos_positivos;
                if (!existingReport.avaliacao_desafios && dadosIA.desafios) updates.avaliacao_desafios = dadosIA.desafios;
                if (!existingReport.avaliacao_sugestoes && dadosIA.sugestoes) updates.avaliacao_sugestoes = dadosIA.sugestoes;
                if (!existingReport.comentarios_gerais && dadosIA.comentarios_gerais) updates.comentarios_gerais = dadosIA.comentarios_gerais;
                if (!existingReport.publico_geral_declarado && dadosIA.publico_geral) updates.publico_geral_declarado = dadosIA.publico_geral;

                const reportAtual = await base44.asServiceRole.entities.Report.get(existingReport.id).catch(() => null);
                const atExist: any[] = Array.isArray(reportAtual?.atividades) ? reportAtual.atividades : [];
                const titulosExist = new Set(atExist.map((a: any) => normalize(a.titulo || a.nome || '')));
                const novas = atividadesIA.filter((a: any) => (a.nome || a.titulo) && !titulosExist.has(normalize(a.nome || a.titulo || '')));
                if (novas.length > 0) updates.atividades = [...atExist, ...novas];
                updates.historico_observacoes = (existingReport.historico_observacoes ? existingReport.historico_observacoes + '\n' : '') + origemObs;

                if (Object.keys(updates).length > 0) {
                  await base44.asServiceRole.entities.Report.update(existingReport.id, updates);
                }
                relatoriosPreenchidos++;
                resultados.push({ messageId, subject, filename, status: 'relatorio_preenchido', report_id: existingReport.id, atividades: novas.length });
              } else {
                const novoReport = await base44.asServiceRole.entities.Report.create({
                  author_name: dadosIA.nome_profissional || VIADUTO_USER_NAME,
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
                  atividades: atividadesIA,
                });
                relatoriosPreenchidos++;
                resultados.push({ messageId, subject, filename, status: 'relatorio_criado', report_id: novoReport.id, atividades: atividadesIA.length });
              }
            } catch (fillErr) {
              console.error(`[Relatório] Erro ao preencher para ${filename}:`, fillErr);
              resultados.push({ messageId, subject, filename, status: 'importado_sem_relatorio', erro: String(fillErr) });
            }
          } else {
            resultados.push({ messageId, subject, filename, status: 'importado_aguardando_revisao' });
          }
        }
      } catch (msgErr) {
        console.error(`[Webhook] Erro processando mensagem ${messageId}:`, msgErr);
      }
    }

    console.log(`[webhookGmailRelatorios] ${importados} importados, ${relatoriosPreenchidos} relatórios, ${ignorados} ignorados`);
    return Response.json({
      status: 'ok',
      importados,
      relatoriosPreenchidos,
      ignorados,
      resultados,
    });

  } catch (error) {
    console.error('[webhookGmailRelatorios] Erro geral:', error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});