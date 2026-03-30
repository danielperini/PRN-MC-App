import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'ADMIN') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Buscar todas as compras, gastos e rubricas
    const purchases = await base44.entities.GastoRubrica.list('-created_date', 500);
    const rubricas = await base44.entities.Rubrica.list('rubrica', 100);
    const museus = await base44.entities.Museu.list('nome', 20);

    if (purchases.length === 0) {
      return Response.json({ message: 'Nenhuma compra para classificar', processed: 0 });
    }

    // Preparar contexto para a IA
    const rubricasContext = rubricas.map(r => ({
      id: r.id,
      nome: r.rubrica,
      grupo: r.grupo,
      valor: r.valor_rubrica
    }));

    const museusList = museus.map(m => ({ id: m.id, nome: m.sigla || m.nome }));

    // Processar cada compra com IA
    const results = [];
    for (const purchase of purchases) {
      try {
        const prompt = `Você é um classificador de despesas. Analise a seguinte despesa e classifique-a:

DESPESA:
- Descrição: ${purchase.descricao || 'N/A'}
- Fornecedor: ${purchase.fornecedor_nome}
- Valor: R$ ${purchase.valor}
- Categoria: ${purchase.categoria || 'N/A'}
- Mês: ${purchase.mes_referencia}

RUBRICAS DISPONÍVEIS:
${JSON.stringify(rubricasContext, null, 2)}

MUSEUS:
${JSON.stringify(museusList, null, 2)}

Responda em JSON com:
- rubrica_id (ID exato da rubrica mais adequada)
- museu_id (ID do museu - MIS, MHAB, MUMO ou deixar vazio se aplica a todos)
- tipo_pagamento (se diferente do atual)
- confianca (0-100, seu nível de confiança na classificação)
- motivo (breve explicação)`;

        const aiResponse = await base44.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              rubrica_id: { type: 'string' },
              museu_id: { type: ['string', 'null'] },
              tipo_pagamento: { type: 'string' },
              confianca: { type: 'number' },
              motivo: { type: 'string' }
            },
            required: ['rubrica_id', 'confianca', 'motivo']
          }
        });

        // Se confiança > 70%, atualizar
        if (aiResponse.confianca >= 70) {
          const updateData = {
            rubrica_id: aiResponse.rubrica_id,
            observacoes: `[IA] ${aiResponse.motivo} (confiança: ${aiResponse.confianca}%)`
          };

          if (aiResponse.tipo_pagamento && aiResponse.tipo_pagamento !== purchase.tipo_pagamento) {
            updateData.tipo_pagamento = aiResponse.tipo_pagamento;
          }

          await base44.entities.GastoRubrica.update(purchase.id, updateData);

          results.push({
            id: purchase.id,
            status: 'classified',
            confianca: aiResponse.confianca,
            motivo: aiResponse.motivo
          });
        } else {
          results.push({
            id: purchase.id,
            status: 'low_confidence',
            confianca: aiResponse.confianca,
            motivo: aiResponse.motivo
          });
        }
      } catch (itemError) {
        console.error(`Erro ao processar compra ${purchase.id}:`, itemError.message);
        results.push({
          id: purchase.id,
          status: 'error',
          error: itemError.message
        });
      }
    }

    const classified = results.filter(r => r.status === 'classified').length;
    const lowConfidence = results.filter(r => r.status === 'low_confidence').length;
    const errors = results.filter(r => r.status === 'error').length;

    return Response.json({
      message: 'Classificação concluída',
      processed: results.length,
      classified,
      lowConfidence,
      errors,
      details: results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});