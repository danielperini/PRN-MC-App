import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { texto, autor, museu } = await req.json();

    if (!texto || !museu) {
      return Response.json({ error: 'texto e museu são obrigatórios' }, { status: 400 });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'API key não configurada' }, { status: 500 });
    }

    const prompt = `Você é um curador de notícias para um museu.

Transforme o seguinte depoimento ou fato marcante em uma notícia de blog/redes sociais, mantendo EXATAMENTE as citações originais (entre aspas) e sem inventar informações.

Depoimento: "${texto}"
${autor ? `Autor/Fonte: ${autor}` : ''}
Museu: ${museu}

Responda APENAS com um JSON válido, sem markdown, sem explicações:
{
  "titulo": "Título atrativo para a notícia (máx 100 caracteres)",
  "subtitulo": "Um subtítulo resumido",
  "corpo": "Corpo da notícia (200-300 palavras), mantendo as citações exatas entre aspas",
  "destaques": ["Ponto 1 destacável", "Ponto 2 destacável"],
  "chamada": "Frase de chamariz para redes sociais (máx 150 caracteres)"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const responseText = data.content[0]?.text || '';
    
    // Parse JSON do response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const noticia = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!noticia) {
      return Response.json({ error: 'Falha ao gerar notícia' }, { status: 500 });
    }

    // Salvar como NewsHighlight para curadoria
    const newsRecord = await base44.asServiceRole.entities.NewsHighlight.create({
      titulo: noticia.titulo,
      subtitulo: noticia.subtitulo,
      conteudo: noticia.corpo,
      fonte: `Depoimento de ${autor || 'visitante'}`,
      museu: museu,
      tipo: 'DEPOIMENTO',
      chamada_redes: noticia.chamada,
      destaques: noticia.destaques,
      status: 'PENDENTE_CURA',
      autor_email: user.email,
      data_criacao: new Date().toISOString()
    });

    return Response.json({
      success: true,
      noticia: newsRecord,
      message: 'Notícia gerada com sucesso e enviada para curadoria'
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});