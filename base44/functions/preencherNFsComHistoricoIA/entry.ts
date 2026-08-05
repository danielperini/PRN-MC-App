import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

function norm(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function digits(v) {
  return String(v || '').replace(/\D/g, '');
}

function parseValor(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  return Number(
    String(v)
      .replace('R$', '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim()
  ) || 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const intakeIds = Array.isArray(body?.intake_ids) ? body.intake_ids.filter(Boolean) : [];

    if (intakeIds.length === 0) {
      return Response.json({ success: false, error: 'intake_ids obrigatório' }, { status: 400 });
    }

    // Carrega intakes enviados
    const intakes = [];
    for (const id of intakeIds) {
      try {
        const intake = await base44.asServiceRole.entities.DocumentIntake.get(id);
        if (intake) intakes.push(intake);
      } catch (e) {
        // intake não carregado — registra erro depois
      }
    }

    if (intakes.length === 0) {
      return Response.json({ success: false, error: 'Nenhum intake encontrado.' }, { status: 404 });
    }

    // Histórico: PurchaseRequests aprovadas/pagas com rubrica/centro_custo preenchidos
    const historicoPR = await base44.asServiceRole.entities.PurchaseRequest.list('-updated_date', 2000);
    const aprovadas = (historicoPR || []).filter((p) => {
      const status = String(p.status || '').toUpperCase();
      return ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(status) &&
        (p.rubrica_id || p.centro_custo || p.meta_id);
    });

    // DocumentIntakes já aprovados (também serve de histórico)
    const intakesAprovados = await base44.asServiceRole.entities.DocumentIntake.filter(
      { status_processamento: 'APROVADO' },
      '-created_date',
      200
    ).catch(() => []);

    // Carrega rubricas para mapear id → nome
    const rubricas = await base44.asServiceRole.entities.Rubrica.list('', 2000).catch(() => []);
    const rubricaNomePorId = new Map();
    for (const r of rubricas || []) {
      if (r?.id) rubricaNomePorId.set(r.id, r.rubrica || r.nome || r.descricao || '');
    }

    // Inicializa OpenAI (gpt-4o-mini) apenas se necessário
    let openai = null;
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      try {
        const OpenAIModule = await import('npm:openai@4.20.0');
        const OpenAI = OpenAIModule.default || OpenAIModule;
        openai = new OpenAI({ apiKey: openaiKey });
      } catch (_) {}
    }

    const resultados = [];

    for (const intake of intakes) {
      try {
        const ia = intake.resultado_ia || {};
        const cnpj = digits(
          ia.nf_emitente_cpf_cnpj ||
          intake.nf_emitente_cpf_cnpj ||
          intake.fornecedor_cpf_cnpj ||
          ''
        );
        const emitente = norm(
          ia.nf_emitente_nome ||
          intake.nf_emitente_nome ||
          intake.fornecedor_nome ||
          ''
        );
        const descricao = norm(
          ia.descricao_servico ||
          intake.file_name_original ||
          ''
        );

        let match = null;
        let fonte = 'historico';
        let score = 0;
        let rubrica_id = '';
        let meta_id = '';
        let centro_custo = '';

        // 1. Match por CNPJ exato no histórico de PRs
        if (cnpj) {
          match = aprovadas.find((p) =>
            digits(p.fornecedor_cnpj || p.fornecedor_cpf_cnpj || '') === cnpj &&
            (p.rubrica_id || p.centro_custo)
          );
          if (match) score = 95;
        }

        // 2. Match por nome de emitente normalizado (substring bidirecional)
        if (!match && emitente) {
          const token = emitente.slice(0, 20);
          match = aprovadas.find((p) => {
            const pNome = norm(p.fornecedor_nome || p.nf_emitente_nome || '');
            if (!pNome) return false;
            return pNome.includes(token) || emitente.includes(pNome.slice(0, 20));
          });
          if (match) score = 80;
        }

        // 3. Match em DocumentIntakes aprovados
        if (!match && cnpj) {
          match = (intakesAprovados || []).find((i) =>
            digits(i.nf_emitente_cpf_cnpj || i.fornecedor_cpf_cnpj || '') === cnpj &&
            (i.rubrica_id_sugerida || i.centro_custo)
          );
          if (match) score = 82;
        }

        if (match) {
          rubrica_id = match.rubrica_id || match.rubrica_id_sugerida || '';
          meta_id = match.meta_id || match.resultado_ia?.meta_id || '';
          centro_custo = match.centro_custo || '';
          fonte = 'historico';
        }

        // 4. Fallback IA (gpt-4o-mini) — apenas se match determinístico não encontrado
        if (!match && openai && (descricao || emitente)) {
          try {
            const nomesRubricas = Array.from(rubricaNomePorId.values()).slice(0, 200);
            const resp = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'Você é um especialista em orçamento de projetos culturais. Sugira a rubrica, meta e centro de custo mais prováveis para a nota fiscal fornecida. Responda sempre com JSON válido.',
                },
                {
                  role: 'user',
                  content: `NF: fornecedor="${emitente}", descricao="${descricao}". Rubricas possíveis: ${JSON.stringify(nomesRubricas)}. Metas possíveis: MC3A-20, MC3A-21, MC3A-22, MC3A-23, MC3A-24, MC3A-25, MC3A-EXTRA. Centros de custo possíveis: MHAB, MIS, MUMO, Noturno 2026, Noturno Pampulha, Atuação Geral. Retorne JSON {rubrica_nome, meta_id, centro_custo, confianca} com confianca 0-100.`,
                },
              ],
              response_format: { type: 'json_object' },
            });
            const content = resp?.choices?.[0]?.message?.content || '{}';
            const data = JSON.parse(content || '{}');
            const rubrica_nome = norm(data.rubrica_nome || '');
            const found = (rubricas || []).find((r) =>
              norm(r.rubrica || r.nome || r.descricao || '') === rubrica_nome
            );
            if (found) {
              rubrica_id = found.id;
              meta_id = data.meta_id || '';
              centro_custo = data.centro_custo || '';
              score = Math.max(70, Math.min(95, Number(data.confianca || 0)));
              fonte = 'ia';
              match = found;
            }
          } catch (_) {
            // IA falhou — segue sem preenchimento
          }
        }

        // Persistir — apenas se score >= 70 e rubrica_id preenchido
        if (score >= 70 && rubrica_id) {
          const resultadoIaAtualizado = {
            ...ia,
            preenchido_por_ia_historico: true,
            ia_historico_score: score,
            ia_historico_fonte: fonte,
            rubrica_id,
            rubrica_nome_sugerida: rubricaNomePorId.get(rubrica_id) || '',
            meta_id,
            centro_custo_sugerido: centro_custo,
          };
          const updateData = {
            status_processamento: 'AGUARDANDO_REVISAO',
            resultado_ia: resultadoIaAtualizado,
            rubrica_id_sugerida: rubrica_id,
            rubrica_nome_sugerida: rubricaNomePorId.get(rubrica_id) || '',
            centro_custo: centro_custo,
          };
          await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updateData);
        }

        resultados.push({
          intake_id: intake.id,
          rubrica_id,
          rubrica_nome: rubrica_id ? (rubricaNomePorId.get(rubrica_id) || '') : '',
          meta_id,
          centro_custo,
          score,
          fonte,
        });
      } catch (e) {
        resultados.push({
          intake_id: intake.id,
          erro: String(e?.message || e),
          score: 0,
        });
      }
    }

    return Response.json({
      success: true,
      total: resultados.length,
      preenchidos: resultados.filter((r) => r.score >= 70 && r.rubrica_id).length,
      resultados,
    });
  } catch (err) {
    return Response.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
});