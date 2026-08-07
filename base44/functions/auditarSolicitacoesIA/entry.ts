import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Auditoria IA de Solicitações de Compra
 * 
 * Recebe lista de PurchaseRequests (ou busca da base) e retorna três tipos de achados:
 *  - duplicatas: detectadas deterministicamente (nf_numero + cnpj + valor)
 *  - camposIncompletos: via IA (rubrica_id, meta_id, centro_custo, cnpj, valor)
 *  - inconsistencias: via IA (descrição vaga, fornecedor sem CNPJ com valor alto)
 * 
 * Cada achado tem: id, tipo, campo, valor_atual, valor_sugerido, justificativa, severidade.
 * Não aplica alterações — apenas analisa. O frontend confirma antes de aplicar.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { purchases, batch_limit } = body || {};

    // 1. Carregar solicitações
    let all = Array.isArray(purchases) && purchases.length
      ? purchases
      : await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 2000);

    if (!Array.isArray(all) || all.length === 0) {
      return Response.json({
        success: true,
        duplicatas: [],
        camposIncompletos: [],
        inconsistencias: [],
        total_analisado: 0,
      });
    }

    // Ignorar cancelados/recusados
    const STATUS_IGNORADOS = new Set(['CANCELADO', 'RECUSADO', 'REJEITADO']);
    const ativas = all.filter((p) => p && !STATUS_IGNORADOS.has(String(p.status || '').toUpperCase()));

    // 2. Detecção determinística de duplicatas (sem IA)
    const duplicatas = detectarDuplicatas(ativas);

    // 3. Análise de campos e inconsistências via OpenAI (lotes de 50)
    const { camposIncompletos, inconsistencias } = await analisarViaIA(ativas, batch_limit || 50);

    return Response.json({
      success: true,
      duplicatas,
      camposIncompletos,
      inconsistencias,
      total_analisado: ativas.length,
    });
  } catch (error) {
    console.error('Erro em auditarSolicitacoesIA:', error);
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
});

// ===================== Duplicatas Determinísticas =====================

function fmtValor(p) {
  const v = Number(p?.nf_valor_total ?? p?.valor_total ?? p?.valor_solicitado ?? 0);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function fmtCnpj(p) {
  const raw = String(p?.nf_emitente_cpf_cnpj ?? p?.fornecedor_cnpj ?? p?.fornecedor_cpf_cnpj ?? '');
  return raw.replace(/\D/g, '');
}

function fmtNf(p) {
  return String(p?.nf_numero || '').trim().toUpperCase();
}

function chaveFiscal(p) {
  const nf = fmtNf(p);
  const cnpj = fmtCnpj(p);
  const valor = fmtValor(p);
  if (!nf || !valor) return '';
  // CNPJ pode ser vazio (PF sem CNPJ) — usa só nf+valor
  return `${nf}|${cnpj}|${valor}`;
}

function detectarDuplicatas(ativas) {
  const grupos = new Map();
  for (const p of ativas) {
    const key = chaveFiscal(p);
    if (!key) continue;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(p);
  }

  const STATUS_RANK = {
    RASCUNHO: 0, SOLICITADO: 1, DEVOLVIDO: 1, APROVADO_COORD: 2, APROVADO_ADMIN: 3, APROVADO: 2, PAGO: 4,
  };

  const duplicatas = [];
  for (const [key, grupo] of grupos.entries()) {
    if (grupo.length < 2) continue;
    const [nf, , valor] = key.split('|');
    // Ordenar: original = mais antigo (created_date menor); desempate por status superior (preserva o mais avançado)
    const sorted = [...grupo].sort((a, b) => {
      const ta = new Date(a?.created_date || 0).getTime();
      const tb = new Date(b?.created_date || 0).getTime();
      if (ta !== tb) return ta - tb;
      return (STATUS_RANK[String(b?.status)] || 0) - (STATUS_RANK[String(a?.status)] || 0);
    });
    const original = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const dup = sorted[i];
      duplicatas.push({
        id: dup.id,
        tipo: 'duplicata',
        campo: 'duplicada_financeira',
        valor_atual: String(dup?.duplicada_financeira ?? false),
        valor_sugerido: true,
        campos_extras: {
          incluir_no_somatorio: { atual: String(dup?.incluir_no_somatorio ?? true), sugerido: false },
          duplicata_de: { atual: dup?.duplicata_de || '', sugerido: original.id },
        },
        nf_numero: nf,
        fornecedor_nome: dup?.nf_emitente_nome || dup?.fornecedor_nome || '—',
        valor: Number(valor),
        justificativa: `Nota fiscal ${nf} (R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) já cadastrada em solicitação anterior de ${new Date(original?.created_date).toLocaleDateString('pt-BR') || '—'}. Marcar como duplicata para evitar soma dupla no financeiro.`,
        justificativa_curta: 'NF idêntica (número + CNPJ + valor) a outra solicitação.',
        severidade: 'alta',
        original_id: original.id,
        original_created: original?.created_date,
      });
    }
  }
  return duplicatas;
}

// ===================== Análise via OpenAI =====================

function minificar(p) {
  return {
    id: p?.id,
    descricao_item: String(p?.descricao_item || '').slice(0, 200),
    fornecedor_nome: String(p?.nf_emitente_nome || p?.fornecedor_nome || '').slice(0, 80),
    nf_numero: String(p?.nf_numero || ''),
    nf_valor_total: Number(p?.nf_valor_total ?? p?.valor_total ?? p?.valor_solicitado ?? 0),
    rubrica_id: String(p?.rubrica_id || ''),
    rubrica_nome: String(p?.rubrica_nome || ''),
    meta_id: String(p?.meta_id || ''),
    centro_custo: String(p?.centro_custo || ''),
    fornecedor_cnpj: String(p?.nf_emitente_cpf_cnpj || p?.fornecedor_cnpj || ''),
    valor_solicitado: Number(p?.valor_solicitado ?? 0),
    status: String(p?.status || ''),
  };
}

async function analisarViaIA(ativas, batchSize) {
  const camposIncompletos = [];
  const inconsistencias = [];

  // Pré-filtro determinístico: campos claramente vazios não precisam de IA
  const suspeitos = ativas.filter((p) => {
    const semRubrica = !String(p?.rubrica_id || '').trim();
    const semMeta = !String(p?.meta_id || '').trim();
    const semCentro = !String(p?.centro_custo || '').trim();
    const semCnpj = !fmtCnpj(p);
    const semValor = !fmtValor(p);
    const descCurta = String(p?.descricao_item || '').trim().length < 15;
    return semRubrica || semMeta || semCentro || semCnpj || semValor || descCurta;
  });

  // Lotes para IA — só envia suspeitos
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    // Sem chave OpenAI: retorna só o que deu para detectar deterministicamente
    for (const p of suspeitos) {
      if (!String(p?.rubrica_id || '').trim()) camposIncompletos.push(achadoCampo(p, 'rubrica_id', '', '', 'Rubrica orçamentária ausente — sem vínculo com plano de aplicação.'));
      if (!String(p?.meta_id || '').trim()) camposIncompletos.push(achadoCampo(p, 'meta_id', '', '', 'Meta orçamentária ausente — necessário para prestação de contas.'));
      if (!String(p?.centro_custo || '').trim()) camposIncompletos.push(achadoCampo(p, 'centro_custo', '', '', 'Centro de custo vazio — impossível agrupar por museu.'));
    }
    return { camposIncompletos, inconsistencias };
  }

  for (let i = 0; i < suspeitos.length; i += batchSize) {
    const lote = suspeitos.slice(i, i + batchSize).map(minificar);
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Você é um auditor financeiro de uma ONG cultural (Museus Centro - Viaduto das Artes). ' +
                'Analise a lista de solicitações de compra JSON e identifique APENAS problemas reais e acionáveis. ' +
                'Tipos válidos: "campo_vazio" (rubrica_id, meta_id, centro_custo, fornecedor_cnpj, valor_solicitado vazios) ' +
                'ou "inconsistencia" (descrição_item muito vaga — menos de 15 chars ou genérica como "servico"/"material"; ' +
                'fornecedor sem CNPJ mas com valor > 1000; nf_numero presente mas sem fornecedor_nome). ' +
                'NÃO sugira valor_sugerido inventado: para campo_vazio, valor_sugerido deve ser uma string curta sugerindo o que preencher (ex: "informar rubrica", "informar meta MC3A-XX", "validar CNPJ") ou vazio se não houver base. ' +
                'Retorne: { "achados": [{ "id": string, "tipo": "campo_vazio"|"inconsistencia", "campo": string, "valor_atual": string, "valor_sugerido": string, "justificativa": string }] }. ' +
                'Não invente problemas que não estão na lista. Se um item não tem problema, não o inclua.',
            },
            {
              role: 'user',
              content: JSON.stringify(lote),
            },
          ],
        }),
      });

      if (!resp.ok) {
        console.warn('OpenAI erro status', resp.status);
        continue;
      }

      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      const achados = Array.isArray(parsed?.achados) ? parsed.achados : [];

      for (const a of achados) {
        const original = suspeitos.find((p) => p?.id === a?.id);
        if (!original) continue;
        const item = {
          id: a.id,
          tipo: a.tipo === 'campo_vazio' ? 'campo_vazio' : 'inconsistencia',
          campo: String(a.campo || ''),
          valor_atual: String(a.valor_atual ?? ''),
          valor_sugerido: String(a.valor_sugerido ?? ''),
          fornecedor_nome: original?.nf_emitente_nome || original?.fornecedor_nome || '—',
          nf_numero: String(original?.nf_numero || ''),
          valor: fmtValor(original),
          descricao_item: String(original?.descricao_item || '').slice(0, 120),
          justificativa: String(a.justificativa || ''),
          justificativa_curta: String(a.justificativa || '').slice(0, 120),
          severidade: a.tipo === 'campo_vazio' ? 'media' : 'baixa',
        };
        if (item.tipo === 'campo_vazio') camposIncompletos.push(item);
        else inconsistencias.push(item);
      }
    } catch (err) {
      console.warn('Erro lote IA', i, err?.message || err);
    }
  }

  return { camposIncompletos, inconsistencias };
}

function achadoCampo(p, campo, valorAtual, valorSugerido, justificativa) {
  return {
    id: p?.id,
    tipo: 'campo_vazio',
    campo,
    valor_atual: String(valorAtual ?? ''),
    valor_sugerido: String(valorSugerido ?? ''),
    fornecedor_nome: p?.nf_emitente_nome || p?.fornecedor_nome || '—',
    nf_numero: String(p?.nf_numero || ''),
    valor: fmtValor(p),
    descricao_item: String(p?.descricao_item || '').slice(0, 120),
    justificativa,
    justificativa_curta: justificativa,
    severidade: 'media',
  };
}