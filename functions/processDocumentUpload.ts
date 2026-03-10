import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import pdfParse from 'npm:pdf-parse@1.1.1';

async function extractPdfText(file_url) {
  const response = await fetch(file_url);
  if (!response.ok) throw new Error(`Falha ao baixar arquivo: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const data = await pdfParse(buffer);
  return data.text || '';
}

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

    const isPdf = file_url.toLowerCase().includes('.pdf') || file_url.toLowerCase().includes('pdf');
    let conteudo_extraido = '';

    if (isPdf) {
      // Leitura direta do PDF com pdf-parse
      try {
        const rawText = await extractPdfText(file_url);
        // Limpa e normaliza o texto
        conteudo_extraido = rawText
          .replace(/\r\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      } catch (pdfErr) {
        console.warn('pdf-parse falhou, tentando fallback via LLM:', pdfErr.message);
        // Fallback via LLM com visão
        const llmResult = await base44.integrations.Core.InvokeLLM({
          prompt: `Extraia todo o conteúdo textual deste documento PDF de forma fiel e completa. Preserve a estrutura original incluindo metas, valores, datas, nomes e quaisquer informações relevantes. Organize em seções claras.`,
          file_urls: [file_url],
          response_json_schema: {
            type: 'object',
            properties: {
              conteudo: { type: 'string', description: 'Conteúdo completo extraído do documento' }
            }
          }
        });
        conteudo_extraido = llmResult?.conteudo || 'Conteúdo não pôde ser extraído.';
      }
    } else {
      // Para outros formatos (docx, xlsx, etc), usa a integração de extração
      const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            conteudo_completo: { type: 'string', description: 'Todo o texto extraído do documento' }
          }
        }
      });
      if (extracted.status === 'success' && extracted.output?.conteudo_completo) {
        conteudo_extraido = extracted.output.conteudo_completo;
      } else {
        const llmResult = await base44.integrations.Core.InvokeLLM({
          prompt: 'Extraia todo o conteúdo textual deste documento de forma completa e estruturada.',
          file_urls: [file_url],
          response_json_schema: {
            type: 'object',
            properties: { conteudo: { type: 'string' } }
          }
        });
        conteudo_extraido = llmResult?.conteudo || 'Conteúdo não pôde ser extraído.';
      }
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