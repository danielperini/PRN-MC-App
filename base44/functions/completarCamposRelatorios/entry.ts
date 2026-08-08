import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const MESES_NUM: Record<string, number> = {
  janeiro:1, fevereiro:2, março:3, abril:4, maio:5, junho:6,
  julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12
};

function mesParaNum(mes: string): number {
  return MESES_NUM[String(mes || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()] || 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Não autenticado.' }, { status: 401 });
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Usuário não encontrado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // Modo: 'todos' preenche todos os relatórios incompletos, ou passa report_ids para preencher específicos
    const modoTodos = body.modo === 'todos' || !body.report_ids;
    const reportIdsFiltro: string[] = body.report_ids || [];
    const apenasVazios = body.apenas_vazios !== false; // default: true
    const limiteRelatorios = body.limite || 30;

    // ── Buscar todos os relatórios ──
    let relatorios: any[] = [];
    if (modoTodos) {
      relatorios = await base44.asServiceRole.entities.Report.filter({}, '-created_date', limiteRelatorios);
    } else {
      for (const id of reportIdsFiltro) {
        const r = await base44.asServiceRole.entities.Report.get(id).catch(() => null);
        if (r) relatorios.push(r);
      }
    }

    // Filtrar apenas os que têm campos vazios (se apenasVazios=true)
    if (apenasVazios) {
      relatorios = relatorios.filter(r =>
        !r.resumo_periodo ||
        !r.resumo_executivo ||
        !r.avaliacao_pontos_positivos ||
        !r.avaliacao_desafios ||
        (r.atividades || []).length === 0
      );
    }

    if (relatorios.length === 0) {
      return Response.json({ success: true, mensagem: 'Nenhum relatório com campos vazios encontrado.', processados: 0 });
    }

    // ── Buscar dados de suporte ──
    const [todasAtividades, programacoes, fotos] = await Promise.all([
      base44.asServiceRole.entities.Activity.filter({}, '-data_realizacao', 500).catch(() => []),
      base44.asServiceRole.entities.Programacao.filter({}, '-data_inicio', 500).catch(() => []),
      base44.asServiceRole.entities.ReportPhoto.filter({}, '-created_date', 500).catch(() => []),
    ]);

    // ── Buscar usuários para vincular ──
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 200).catch(() => []);
    const userMap = new Map<string, any>();
    for (const u of allUsers as any[]) {
      userMap.set(String(u.id), u);
      if (u.email) userMap.set(String(u.email).toLowerCase(), u);
    }

    const resultados: any[] = [];
    let preenchidos = 0;
    let erros = 0;

    for (const relatorio of relatorios) {
      const result: any = {
        report_id: relatorio.id,
        author: relatorio.author_name,
        museu: relatorio.museu,
        mes: relatorio.mes_referencia,
        ano: relatorio.ano,
        campos_preenchidos: [],
        status: 'ok',
      };

      try {
        const mesNum = mesParaNum(relatorio.mes_referencia || '');
        const ano = relatorio.ano || 2026;
        const museu = relatorio.museu || '';
        const authoNome = relatorio.author_name || '';

        // Filtrar atividades do museu/período
        const atividadesMuseu = (todasAtividades as any[]).filter(a => {
          const aMuseu = String(a.museu || a.centro_custo || (a.museu_lista || [])[0] || '').toLowerCase();
          const museuOk = !museu || museu === 'Atua\u00e7\u00e3o Geral' || museu === 'Geral'
            ? true
            : aMuseu.includes(museu.toLowerCase()) || museu.toLowerCase().includes(aMuseu);

          // Verificar mês/ano da atividade
          const dataA = a.data_realizacao || a.data_inicio || '';
          if (dataA && mesNum) {
            const dObj = new Date(dataA + 'T12:00:00');
            const mesOk = dObj.getMonth() + 1 === mesNum;
            const anoOk = dObj.getFullYear() === ano;
            return museuOk && mesOk && anoOk;
          }
          return museuOk;
        });

        // Filtrar programação do museu/período
        const progMuseu = (programacoes as any[]).filter(p => {
          const pMuseu = String(p.museu || p.local || '').toLowerCase();
          const museuOk = !museu || museu === 'Atua\u00e7\u00e3o Geral'
            ? true
            : pMuseu.includes(museu.toLowerCase());

          const dataP = p.data_inicio || p.data_realizacao || '';
          if (dataP && mesNum) {
            const dObj = new Date(dataP + 'T12:00:00');
            return museuOk && dObj.getMonth() + 1 === mesNum && dObj.getFullYear() === ano;
          }
          return museuOk;
        });

        // Fotos do relatório
        const fotosRelatorio = (fotos as any[]).filter(f => f.report_id === relatorio.id);

        // Atividades já no relatório
        const atividadesEmbedded: any[] = Array.isArray(relatorio.atividades) ? relatorio.atividades : [];

        // Montar contexto rico para a IA
        const contextoAtividades = atividadesMuseu.length > 0
          ? atividadesMuseu.slice(0, 20).map((a: any) =>
              `- ${a.titulo || 'Atividade'}${a.data_realizacao ? ` (${a.data_realizacao})` : ''}: ${a.descricao || ''} | Público: ${a.publico_total || a.publico_estimado || 0}`
            ).join('\n')
          : atividadesEmbedded.slice(0, 20).map((a: any) =>
              `- ${a.titulo || a.nome || 'Atividade'}: ${a.descricao || ''}`
            ).join('\n');

        const contextoProg = progMuseu.slice(0, 10).map((p: any) =>
          `- ${p.titulo || p.nome_atividade || ''} (${p.data_inicio || ''}) — ${p.tipo_atividade || ''} — ${p.local || museu}`
        ).join('\n');

        const totalPublico = atividadesMuseu.reduce((s: number, a: any) => s + (Number(a.publico_total) || 0), 0)
          || atividadesEmbedded.reduce((s: number, a: any) => s + (Number(a.publico_total) || 0), 0);

        // Campos já preenchidos para não sobrescrever
        const jaTemResumo = !!relatorio.resumo_periodo;
        const jaTemExec = !!relatorio.resumo_executivo;
        const jaTemPositivos = !!relatorio.avaliacao_pontos_positivos;
        const jaTemDesafios = !!relatorio.avaliacao_desafios;
        const jaTemSugestoes = !!relatorio.avaliacao_sugestoes;
        const jaTemAtividades = atividadesEmbedded.length > 0;

        // Campos que precisam ser gerados
        const camposNecessarios: string[] = [];
        if (!jaTemResumo) camposNecessarios.push('resumo_periodo');
        if (!jaTemExec) camposNecessarios.push('resumo_executivo');
        if (!jaTemPositivos) camposNecessarios.push('avaliacao_pontos_positivos');
        if (!jaTemDesafios) camposNecessarios.push('avaliacao_desafios');
        if (!jaTemSugestoes) camposNecessarios.push('avaliacao_sugestoes');
        if (!jaTemAtividades && (atividadesMuseu.length > 0 || contextoProg)) camposNecessarios.push('atividades');

        if (camposNecessarios.length === 0) {
          result.status = 'ja_completo';
          resultados.push(result);
          continue;
        }

        // ── Chamar IA para gerar os campos ──
        const iaResult = await invokeLLM(base44.asServiceRole,{
          prompt: `Você é um redator especializado em relatórios mensais de atividades culturais de museus.

Gere os campos solicitados para o RELATÓRIO MENSAL abaixo. Use linguagem profissional, institucional e objetiva.
Seja específico com base nas atividades e programação fornecidas.

DADOS DO RELATÓRIO:
- Profissional: ${authoNome}
- Função: ${relatorio.funcao || 'Coordenador(a)/Profissional'}
- Museu: ${museu}
- Mês/Ano: ${relatorio.mes_referencia || ''}/${ano}
- Status: ${relatorio.status}
- Público total registrado: ${totalPublico}
- Fotos vinculadas: ${fotosRelatorio.length}

ATIVIDADES DO PERÍODO (${atividadesMuseu.length || atividadesEmbedded.length} registros):
${contextoAtividades || 'Sem atividades registradas no período. Gere baseado no museu e mês.'}

PROGRAMAÇÃO PREVISTA:
${contextoProg || 'Sem programação cadastrada.'}

CAMPOS JÁ PREENCHIDOS (NÃO gerar esses):
${jaTemResumo ? '- resumo_periodo (JÁ EXISTE)\n' : ''}${jaTemExec ? '- resumo_executivo (JÁ EXISTE)\n' : ''}${jaTemPositivos ? '- avaliacao_pontos_positivos (JÁ EXISTE)\n' : ''}${jaTemDesafios ? '- avaliacao_desafios (JÁ EXISTE)\n' : ''}

CAMPOS A GERAR: ${camposNecessarios.join(', ')}

Retorne APENAS os campos solicitados. Para atividades, inclua apenas as que constam nos dados acima.
Não invente atividades que não existam nos dados fornecidos.`,
          response_json_schema: {
            type: 'object',
            properties: {
              resumo_periodo: { type: 'string', description: 'Resumo do período (2-3 parágrafos, texto corrido, profissional)' },
              resumo_executivo: { type: 'string', description: 'Síntese executiva das principais realizações (1-2 parágrafos curtos)' },
              avaliacao_pontos_positivos: { type: 'string', description: 'Pontos positivos e conquistas do mês (lista ou parágrafo)' },
              avaliacao_desafios: { type: 'string', description: 'Desafios e dificuldades enfrentados (lista ou parágrafo)' },
              avaliacao_sugestoes: { type: 'string', description: 'Sugestões de melhoria para o próximo período' },
              atividades: {
                type: 'array',
                description: 'Lista de atividades extraídas dos dados fornecidos',
                items: {
                  type: 'object',
                  properties: {
                    titulo: { type: 'string' },
                    descricao: { type: 'string' },
                    data_realizacao: { type: 'string' },
                    local: { type: 'string' },
                    publico_total: { type: 'number' },
                    classificacao: { type: 'string', enum: ['META', 'ROTINA', 'EXTRA'] },
                    resultado_alcancado: { type: 'string' },
                  }
                }
              }
            }
          }
        });

        // ── Montar updates apenas com campos vazios ──
        const updates: Record<string, any> = {};

        if (!jaTemResumo && iaResult.resumo_periodo) {
          updates.resumo_periodo = iaResult.resumo_periodo;
          result.campos_preenchidos.push('resumo_periodo');
        }
        if (!jaTemExec && iaResult.resumo_executivo) {
          updates.resumo_executivo = iaResult.resumo_executivo;
          result.campos_preenchidos.push('resumo_executivo');
        }
        if (!jaTemPositivos && iaResult.avaliacao_pontos_positivos) {
          updates.avaliacao_pontos_positivos = iaResult.avaliacao_pontos_positivos;
          result.campos_preenchidos.push('avaliacao_pontos_positivos');
        }
        if (!jaTemDesafios && iaResult.avaliacao_desafios) {
          updates.avaliacao_desafios = iaResult.avaliacao_desafios;
          result.campos_preenchidos.push('avaliacao_desafios');
        }
        if (!jaTemSugestoes && iaResult.avaliacao_sugestoes) {
          updates.avaliacao_sugestoes = iaResult.avaliacao_sugestoes;
          result.campos_preenchidos.push('avaliacao_sugestoes');
        }

        // Atividades: adicionar apenas as novas
        if (!jaTemAtividades && Array.isArray(iaResult.atividades) && iaResult.atividades.length > 0) {
          const novasAtividades = iaResult.atividades.map((a: any) => ({
            titulo: a.titulo || '',
            nome: a.titulo || '',
            descricao: a.descricao || '',
            data_realizacao: a.data_realizacao || null,
            local: a.local || museu,
            publico_total: a.publico_total || 0,
            publico_estimado: a.publico_total || 0,
            classificacao: ['META','ROTINA','EXTRA'].includes(String(a.classificacao||'').toUpperCase())
              ? a.classificacao.toUpperCase() : 'ROTINA',
            resultado_alcancado: a.resultado_alcancado || '',
            museu_lista: [museu],
            origem: 'completado_ia',
          }));
          updates.atividades = [...atividadesEmbedded, ...novasAtividades];
          result.campos_preenchidos.push(`atividades(${novasAtividades.length})`);
        }

        // Vincular ao usuário correto se não tiver created_by_id
        if (!relatorio.created_by_id) {
          const usuarioEmail = relatorio.author_email || relatorio.reviewer_email || null;
          if (usuarioEmail) {
            const uMatch = userMap.get(String(usuarioEmail).toLowerCase());
            if (uMatch) updates.created_by_id = uMatch.id;
          }
        }

        // Marcar como restaurado
        const obsAtual = relatorio.historico_observacoes || '';
        if (!obsAtual.includes('IA completou')) {
          updates.historico_observacoes = (obsAtual ? obsAtual + '\n' : '') +
            `IA completou campos vazios em ${new Date().toLocaleDateString('pt-BR')}.`;
        }

        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.Report.update(relatorio.id, updates);
          preenchidos++;
          result.status = 'preenchido';
        } else {
          result.status = 'sem_alteracoes';
        }

      } catch (e) {
        result.status = 'erro';
        result.erro = (e as Error).message;
        erros++;
        console.error(`Erro no relatório ${relatorio.id}:`, e);
      }

      resultados.push(result);
    }

    return Response.json({
      success: true,
      mensagem: `${preenchidos} relatório(s) completados com IA. ${erros} erro(s).`,
      total_verificados: relatorios.length,
      preenchidos,
      erros,
      resultados,
    });

  } catch (error) {
    console.error('completarCamposRelatorios error:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});