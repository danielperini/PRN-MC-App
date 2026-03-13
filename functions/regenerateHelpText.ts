import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { componentKey, label, componentType, contextDescription } = await req.json();

    if (!label || !componentType) {
      return Response.json({ error: 'label and componentType required' }, { status: 400 });
    }

    // Chamar Claude para gerar texto
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um especialista em ajuda contextual de interface. Gere um texto curto e útil para esta funcionalidade:

Tipo: ${componentType}
Label: "${label}"
Contexto: ${contextDescription || 'N/A'}

Padrão de resposta:
1. Primeira frase: o que é / o que faz
2. Segunda frase: para que serve / quando usar
3. Opcional: efeito esperado da ação

Escreva SEMPRE em português do Brasil. Seja claro, objetivo, elegante e profissional. Sem texto genérico. Máximo 3 linhas.

Responda APENAS com o texto de ajuda, sem explicações adicionais.`,
      model: 'automatic',
    });

    return Response.json({
      help_text_ptbr: response,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});