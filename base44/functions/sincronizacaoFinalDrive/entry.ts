import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function normText(v = '') {
  return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normalizeMuseu(text = '') {
  const t = normText(text);
  if (t.includes('mis') || t.includes('imagem') || t.includes('som')) return 'MIS';
  if (t.includes('mhab') || t.includes('abilio') || t.includes('historico')) return 'MHAB';
  if (t.includes('mumo') || t.includes('moda')) return 'MUMO';
  return null;
}

function normalizeMes(text = '') {
  const t = normText(text);
  for (let i = 0; i < MESES.length; i++) {
    if (t.includes(normText(MESES[i]))) return { mes: MESES[i], mesNum: i + 1 };
  }
  const match = t.match(/\b(0?[1-9]|1[0-2])\b/);
  if (match) { const n = parseInt(match[1]); return { mes: MESES[n - 1], mesNum: n }; }
  return null;
}

function extrairAtividadeDoNome(fileName = '') {
  const m = fileName.match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/);
  if (m) return m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const m2 = fileName.match(/__(.+?)__/);
  if (m2) return m2[1].replace(/_/g, ' ').trim();
  return null;
}

// Usa IA para vincular uma foto às atividades/programações do museu e gerar legenda
async function vincularFotoComIA(base44, foto: any, museu: string, mesNome: string, ano: number, programacoes: any[], atividadesRelatorio: any[]) {
  const candidatos = [
    ...programacoes.map(p => ({
      id: p.id,
      tipo: 'programacao',
      titulo: p.titulo || p.nome_acao || '',
      descricao: p.descricao || p.sinopse || '',
      local: p.local || '',
      data: p.data_inicio || p.data || '',
      publico_alvo: p.publico_alvo || '',
    })),
    ...atividadesRelatorio.map(a => ({
      id: a.id,
      tipo: 'atividade_relatorio',
      titulo: a.titulo || a.nome || '',
      descricao: a.descricao || '',
      local: a.local || a.local_realizacao || '',
      data: a.data_realizacao || a.data_inicio || '',
      publico_alvo: '',
    })),
  ].filter(c => c.titulo);

  if (candidatos.length === 0) {
    // Sem candidatos, gera legenda genérica com IA
    const res = await invokeLLM(base44.asServiceRole,{
      prompt: `Gere uma legenda descritiva e institucional para uma foto tirada no museu ${museu} no mês de ${mesNome}/${ano}. Nome do arquivo: "${foto.file_name || foto.caption || ''}". A legenda deve ter no máximo 15 palavras, no formato: "Atividade — Local — Data".`,
      model: 'gemini_3_flash',
    });
    return { legenda: String(res || '').trim(), programacao_id: null, atividade_titulo: null };
  }

  const listaTexto = candidatos.map((c, i) => `${i + 1}. [${c.tipo}] ${c.titulo}${c.local ? ' — ' + c.local : ''}${c.data ? ' — ' + c.data : ''}${c.descricao ? ' | ' + c.descricao.substring(0, 80) : ''}`).join('\n');

  const res = await invokeLLM(base44.asServiceRole,{
    prompt: `Você está ajudando a vincular uma foto institucional à atividade/programação mais provável do museu ${museu} (${mesNome}/${ano}).

Nome do arquivo da foto: "${foto.file_name || ''}"
Legenda atual (se houver): "${foto.caption || foto.description || ''}"

Atividades e programações previstas para este museu no período:
${listaTexto}

Escolha o índice da atividade mais provável para esta foto (ou 0 se nenhuma for adequada).
Depois gere uma legenda descritiva e institucional no formato: "Título da Atividade — ${museu} — Data".
A legenda deve ter no máximo 20 palavras.

Responda SOMENTE em JSON com os campos: { "indice": number, "legenda": string }`,
    model: 'gemini_3_flash',
    response_json_schema: {
      type: 'object',
      properties: {
        indice: { type: 'number' },
        legenda: { type: 'string' },
      },
    },
  });

  const indice = (res?.indice || 0) - 1;
  const candidatoEscolhido = indice >= 0 ? candidatos[indice] : null;

  return {
    legenda: String(res?.legenda || '').trim() || `${museu} — ${mesNome}/${ano}`,
    programacao_id: candidatoEscolhido?.tipo === 'programacao' ? candidatoEscolhido.id : null,
    atividade_titulo: candidatoEscolhido?.titulo || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    if (user.role !== 'admin' && !['coordenador', 'coordinator'].includes(normText(user.base_role || ''))) {
      return Response.json({ error: 'Acesso restrito a coordenadores e admins' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run === true;
    // Limitar processamento para evitar timeout: processa até N fotos sem legenda boa por execução
    const limite = Number(body.limite || 60);

    // ── Carregar dados base em paralelo ─────────────────────────────────
    const [reports, reportPhotos, attachments, programacoes] = await Promise.all([
      base44.asServiceRole.entities.Report.list('-created_date', 400),
      base44.asServiceRole.entities.ReportPhoto.list('-created_date', 2000),
      base44.asServiceRole.entities.Attachment.filter({}, '-created_date', 1500),
      base44.asServiceRole.entities.Programacao.filter({ ativo: true }, '-data_inicio', 500),
    ]);

    const reportById = new Map((reports || []).map(r => [r.id, r]));
    const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i;

    const stats = {
      fotos_processadas: 0,
      legendas_geradas_ia: 0,
      vinculadas_programacao: 0,
      erros_ia: 0,
    };
    const log: string[] = [];

    // ── Função auxiliar: obter programações do museu no mês/ano ─────────
    function getProgramacoesMuseuMes(museu: string, mesNome: string, ano: number) {
      if (!museu || !mesNome) return [];
      const mesNum = MESES.indexOf(normText(mesNome)) + 1;
      return (programacoes || []).filter(p => {
        const museuOk = normalizeMuseu(p.museu || '') === museu;
        if (!museuOk) return false;
        // Verificar pelo month_key (YYYY-MM) ou data_inicio
        const mk = p.month_key || '';
        if (mk) {
          const [y, m] = mk.split('-').map(Number);
          return y === ano && m === mesNum;
        }
        const dataP = p.data_inicio || p.data || '';
        if (dataP) {
          const d = new Date(dataP);
          if (!isNaN(d.getTime())) return d.getFullYear() === ano && (d.getMonth() + 1) === mesNum;
        }
        return false;
      });
    }

    // ── 1. Processar ReportPhotos ────────────────────────────────────────
    // Fotos sem legenda contextual (sem " — " ou com legenda muito curta)
    const fotosSemLegenda = (reportPhotos || []).filter(f =>
      f.report_id && (!f.caption || f.caption.length < 10 || !f.caption.includes('—'))
    ).slice(0, Math.floor(limite * 0.6));

    for (const foto of fotosSemLegenda) {
      if (stats.fotos_processadas >= limite) break;
      const report = reportById.get(foto.report_id);
      if (!report) continue;

      const museu = normalizeMuseu(report.museu || '') || normalizeMuseu(foto.file_name || '') || '';
      if (!museu) continue;

      const mesInfo = normalizeMes(report.mes_referencia || '');
      const mesNome = mesInfo?.mes || '';
      const ano = report.ano || new Date().getFullYear();

      const progMuseu = getProgramacoesMuseuMes(museu, mesNome, ano);
      const atvsRelatorio = Array.isArray(report.atividades) ? report.atividades : [];

      stats.fotos_processadas++;
      try {
        const resultado = await vincularFotoComIA(base44, foto, museu, mesNome, ano, progMuseu, atvsRelatorio);
        if (resultado.legenda && !dry_run) {
          const updates: Record<string, unknown> = { caption: resultado.legenda };
          if (resultado.programacao_id) updates.programacao_id = resultado.programacao_id;
          await base44.asServiceRole.entities.ReportPhoto.update(foto.id, updates).catch(() => { stats.erros_ia++; });
        }
        stats.legendas_geradas_ia++;
        if (resultado.programacao_id) stats.vinculadas_programacao++;
        log.push(`ReportPhoto ${foto.id}: "${resultado.legenda}"${resultado.atividade_titulo ? ` → [${resultado.atividade_titulo}]` : ''}`);
      } catch (e) {
        stats.erros_ia++;
        log.push(`ERRO ReportPhoto ${foto.id}: ${(e as Error).message}`);
      }
    }

    // ── 2. Processar Attachments de imagem ──────────────────────────────
    const attachImagens = (attachments || []).filter(a =>
      (IMAGE_EXT.test(a.file_name || '') || String(a.file_type || '').startsWith('image/')) &&
      a.report_id &&
      (!a.description || a.description.length < 10 || !a.description.includes('—'))
    ).slice(0, Math.floor(limite * 0.4));

    for (const att of attachImagens) {
      if (stats.fotos_processadas >= limite) break;
      const report = reportById.get(att.report_id);
      if (!report) continue;

      const museu = normalizeMuseu(report.museu || '') || normalizeMuseu(att.file_name || '') || '';
      if (!museu) continue;

      const mesInfo = normalizeMes(report.mes_referencia || '');
      const mesNome = mesInfo?.mes || '';
      const ano = report.ano || new Date().getFullYear();

      const progMuseu = getProgramacoesMuseuMes(museu, mesNome, ano);
      const atvsRelatorio = Array.isArray(report.atividades) ? report.atividades : [];

      // Montar objeto foto compatível
      const fotoObj = { file_name: att.file_name, caption: att.description || '' };

      stats.fotos_processadas++;
      try {
        const resultado = await vincularFotoComIA(base44, fotoObj, museu, mesNome, ano, progMuseu, atvsRelatorio);
        if (resultado.legenda && !dry_run) {
          await base44.asServiceRole.entities.Attachment.update(att.id, { description: resultado.legenda }).catch(() => { stats.erros_ia++; });
        }
        stats.legendas_geradas_ia++;
        if (resultado.programacao_id) stats.vinculadas_programacao++;
        log.push(`Attachment ${att.id} (${att.file_name}): "${resultado.legenda}"`);
      } catch (e) {
        stats.erros_ia++;
        log.push(`ERRO Attachment ${att.id}: ${(e as Error).message}`);
      }
    }

    // ── Audit log ────────────────────────────────────────────────────────
    if (!dry_run && stats.legendas_geradas_ia > 0) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'SYNC',
        entity_type: 'GALERIA_SINCRONIZACAO_IA',
        entity_id: 'batch',
        actor_email: user.email,
        actor_name: user.full_name || user.email,
        details: `Sincronização IA Drive: ${JSON.stringify(stats)}`,
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      dry_run,
      stats,
      log_resumo: log.slice(0, 80),
      mensagem: dry_run
        ? `Simulação: ${stats.fotos_processadas} fotos analisadas, ${stats.legendas_geradas_ia} legendas seriam geradas pela IA.`
        : `Concluído: ${stats.legendas_geradas_ia} legendas geradas pela IA usando programação do museu, ${stats.vinculadas_programacao} vinculadas a atividades. ${stats.erros_ia} erros.`,
    });

  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});