import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import pdfParse from 'npm:pdf-parse@1.1.1';

function normalizeText(value: string) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function getFileNameFromUrl(file_url: string) {
  try {
    const clean = file_url.split('?')[0];
    return decodeURIComponent(clean.split('/').pop() || 'arquivo');
  } catch {
    return 'arquivo';
  }
}

function detectFileType(file_url: string) {
  const lower = String(file_url || '').toLowerCase();

  if (lower.includes('.pdf')) return 'pdf';
  if (lower.includes('.xlsx')) return 'xlsx';
  if (lower.includes('.xls')) return 'xls';
  if (lower.includes('.csv')) return 'csv';
  if (lower.includes('.docx')) return 'docx';
  if (lower.includes('.doc')) return 'doc';
  if (lower.includes('.txt')) return 'txt';

  if (lower.includes('pdf')) return 'pdf';
  return 'outro';
}

function parseTags(tags: unknown) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map(v => String(v || '').trim())
      .filter(Boolean);
  }

  return String(tags)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function chunkText(text: string, maxSize = 3500) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxSize) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (paragraph.length <= maxSize) {
      current = paragraph;
      continue;
    }

    let rest = paragraph;
    while (rest.length > maxSize) {
      chunks.push(rest.slice(0, maxSize));
      rest = rest.slice(maxSize);
    }
    current = rest;
  }

  if (current) chunks.push(current);

  return chunks;
}

async function extractPdfText(file_url: string) {
  const response = await fetch(file_url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const data = await pdfParse(buffer);

  return normalizeText(data.text || '');
}

async function extractWithFileParser(base44: any, file_url: string) {
  const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
    file_url,
    json_schema: {
      type: 'object',
      properties: {
        conteudo_completo: {
          type: 'string',
          description: 'Todo o texto extraído do arquivo'
        }
      }
    }
  });

  if (extracted?.status === 'success' && extracted?.output?.conteudo_completo) {
    return normalizeText(extracted.output.conteudo_completo);
  }

  return '';
}

async function analyzeWithLLM(base44: any, file_url: string, fileType: string) {
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `
Analise este arquivo e devolva:

1. Um texto fiel e estruturado do conteúdo.
2. Um resumo executivo.
3. Principais temas.
4. Lista de cargos/funções mencionados.
5. Lista de valores salariais, pagamentos, bolsas, cachês, remunerações ou custos de pessoal encontrados.
6. Observações sobre tabelas, gráficos, imagens, fotos e quadros relevantes.
7. Indicação se o documento é útil para responder dúvidas do assistente da plataforma.

Regras:
- Preserve dados concretos como nomes, datas, valores e cargos.
- Em planilhas, interprete abas, colunas, cabeçalhos e linhas.
- Em PDFs, considere página a página.
- Se houver gráficos, tabelas, quadros ou fotos com informação relevante, descreva isso objetivamente.
- Não invente nada.
- Responda em português do Brasil.
`,
    file_urls: [file_url],
    response_json_schema: {
      type: 'object',
      properties: {
        conteudo: { type: 'string' },
        resumo: { type: 'string' },
        temas: {
          type: 'array',
          items: { type: 'string' }
        },
        cargos_identificados: {
          type: 'array',
          items: { type: 'string' }
        },
        salarios_e_pagamentos: {
          type: 'array',
          items: { type: 'string' }
        },
        observacoes_visuais: { type: 'string' },
        util_para_assistente: { type: 'boolean' }
      }
    }
  });

  return {
    conteudo: normalizeText(result?.conteudo || ''),
    resumo: normalizeText(result?.resumo || ''),
    temas: Array.isArray(result?.temas) ? result.temas : [],
    cargos_identificados: Array.isArray(result?.cargos_identificados) ? result.cargos_identificados : [],
    salarios_e_pagamentos: Array.isArray(result?.salarios_e_pagamentos) ? result.salarios_e_pagamentos : [],
    observacoes_visuais: normalizeText(result?.observacoes_visuais || ''),
    util_para_assistente: result?.util_para_assistente !== false,
    fileType,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const allowedRoles = ['admin', 'ADMIN', 'COORDENADOR', 'coordenador'];
    if (!allowedRoles.includes(String(user.role || ''))) {
      return Response.json({ error: 'Acesso restrito a coordenadores e administradores' }, { status: 403 });
    }

    const {
      file_url,
      titulo,
      categoria,
      descricao,
      versao,
      cargo_relacionado,
      tags,
    } = await req.json();

    if (!file_url || !titulo) {
      return Response.json(
        { error: 'file_url e titulo são obrigatórios' },
        { status: 400 }
      );
    }

    const fileType = detectFileType(file_url);
    const file_name = getFileNameFromUrl(file_url);

    let conteudo_extraido = '';
    let resumo_ia = '';
    let observacoes_visuais = '';
    let temas: string[] = [];
    let cargos_identificados: string[] = [];
    let salarios_e_pagamentos: string[] = [];

    if (fileType === 'pdf') {
      try {
        conteudo_extraido = await extractPdfText(file_url);
      } catch (pdfErr) {
        console.warn('Falha no pdf-parse, usando fallback:', pdfErr?.message || pdfErr);
      }
    } else {
      try {
        conteudo_extraido = await extractWithFileParser(base44, file_url);
      } catch (parseErr) {
        console.warn('Falha no parser de arquivo, usando fallback:', parseErr?.message || parseErr);
      }
    }

    const llmAnalysis = await analyzeWithLLM(base44, file_url, fileType);

    if (!conteudo_extraido || conteudo_extraido.length < 300) {
      conteudo_extraido = llmAnalysis.conteudo || conteudo_extraido;
    }

    resumo_ia = llmAnalysis.resumo || '';
    observacoes_visuais = llmAnalysis.observacoes_visuais || '';
    temas = llmAnalysis.temas || [];
    cargos_identificados = llmAnalysis.cargos_identificados || [];
    salarios_e_pagamentos = llmAnalysis.salarios_e_pagamentos || [];

    conteudo_extraido = normalizeText(conteudo_extraido);

    if (!conteudo_extraido) {
      return Response.json(
        { error: 'Não foi possível extrair conteúdo do arquivo enviado.' },
        { status: 422 }
      );
    }

    const allTags = [
      ...parseTags(tags),
      ...temas,
      ...cargos_identificados,
    ]
      .map(v => String(v || '').trim())
      .filter(Boolean);

    const uniqueTags = Array.from(new Set(allTags));

    const chunks = chunkText(conteudo_extraido, 3500);

    const payload: Record<string, unknown> = {
      titulo,
      descricao: descricao || '',
      categoria: categoria || 'Outro',
      versao: versao || '',
      file_url,
      file_name,
      conteudo_extraido,
      ativo: true,
      cargo_relacionado: cargo_relacionado || '',
      tags: uniqueTags.join(', '),
      tipo_arquivo: fileType,
      resumo_ia,
      observacoes_visuais,
      temas_identificados: temas.join(', '),
      cargos_identificados: cargos_identificados.join(', '),
      salarios_e_pagamentos: salarios_e_pagamentos.join('\n'),
      chunks_count: chunks.length,
      status_processamento: 'processado',
      created_by_email: user.email || '',
      processado_por_ia: true,
    };

    const doc = await base44.entities.KnowledgeDocument.create(payload);

    for (let i = 0; i < chunks.length; i++) {
      const chunkPayload: Record<string, unknown> = {
        knowledge_document_id: doc.id,
        chunk_index: i + 1,
        titulo: `${titulo} — trecho ${i + 1}`,
        texto_chunk: chunks[i],
        categoria: categoria || 'Outro',
        cargo_relacionado: cargo_relacionado || '',
        ativo: true,
      };

      try {
        await base44.entities.KnowledgeChunk.create(chunkPayload);
      } catch (chunkErr) {
        console.warn(`Falha ao criar chunk ${i + 1}:`, chunkErr?.message || chunkErr);
      }
    }

    return Response.json({
      success: true,
      document: doc,
      chars: conteudo_extraido.length,
      chunks: chunks.length,
      file_type: fileType,
      cargos_identificados,
      salarios_e_pagamentos,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || 'Erro interno ao processar documento' },
      { status: 500 }
    );
  }
});
