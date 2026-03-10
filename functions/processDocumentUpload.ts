import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const { file_url, titulo, categoria, descricao, versao } = await req.json();

    if (!file_url || !titulo) {
      return Response.json({ error: 'file_url e titulo são obrigatórios' }, { status: 400 });
    }

    // Extrai o conteúdo do arquivo usando a integração
    const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: 'object',
        properties: {
          conteudo_completo: {
            type: 'string',
            description: 'Todo o texto extraído do documento'
          },
          resumo: {
            type: 'string',
            description: 'Resumo executivo do documento em até 500 palavras'
          },
          pontos_chave: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de pontos-chave, metas e informações importantes'
          }
        }
      }
    });

    let conteudo_extraido = '';

    if (extracted.status === 'success' && extracted.output) {
      const out = extracted.output;
      const partes = [];
      if (out.resumo) partes.push(`RESUMO:\n${out.resumo}`);
      if (out.pontos_chave?.length) partes.push(`PONTOS-CHAVE:\n${out.pontos_chave.join('\n')}`);
      if (out.conteudo_completo) partes.push(`CONTEÚDO COMPLETO:\n${out.conteudo_completo}`);
      conteudo_extraido = partes.join('\n\n');
    } else {
      // Fallback: tenta obter texto básico via LLM com o arquivo
      const llmResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Extraia e organize todo o conteúdo textual deste documento em formato estruturado. Inclua todas as metas, valores, prazos, nomes e informações relevantes.`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            conteudo: { type: 'string' }
          }
        }
      });
      conteudo_extraido = llmResult?.conteudo || 'Conteúdo não pôde ser extraído automaticamente.';
    }

    // Salva o documento na base
    const doc = await base44.entities.KnowledgeDocument.create({
      titulo,
      descricao: descricao || '',
      categoria: categoria || 'Outro',
      versao: versao || '',
      file_url,
      file_name: file_url.split('/').pop(),
      conteudo_extraido,
      ativo: true
    });

    return Response.json({ success: true, document: doc, chars: conteudo_extraido.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});