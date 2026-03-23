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
  if (lower.includes('xlsx')) return 'xlsx';
  if (lower.includes('xls')) return 'xls';
  if (lower.includes('csv')) return 'csv';
  if (lower.includes('docx')) return 'docx';
  if (lower.includes('doc')) return 'doc';
  if (lower.includes('txt')) return 'txt';

  return 'outro';
}

function parseTags(tags: unknown) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((v) => String(v).trim()).filter(Boolean);
  }

  return String(tags)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function chunkText(text: string, maxSize = 2000) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  for (const p of paragraphs) {
    const next = current ? `${current}\n\n${p}` : p;

    if (next.length <= maxSize) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);

    if (p.length <= maxSize) {
      current = p;
      continue;
    }

    let rest = p;
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
  const res = await fetch(file_url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar PDF: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const data = await pdfParse(buffer);
  return normalizeText(data.text || '');
}

async function extractGenericText(base44: any, file_url: string) {
  try {
    const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: 'object',
        properties: {
          conteudo_completo: { type: 'string' },
        },
      },
    });

    return normalizeText(extracted?.output?.conteudo_completo || '');
  } catch {
    return '';
  }
}

async function analyzeWithLLM(base44: any, file_url: string) {
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `
Analise profundamente este documento.

Extraia:
1. Conteúdo completo estruturado
2. Resumo executivo
3. Temas principais
4. Cargos identificados
5. Valores relevantes (salários, pagamentos, contratos, parcelas)
6. Tags relevantes para busca

Regras:
- Não invente.
- Preserve nomes, datas, cargos e valores.
- Se for planilha, interprete colunas, linhas e abas.
- Se for PDF, interprete o conteúdo de forma estruturada.
- Responda em português do Brasil.
`,
    file_urls: [file_url],
    response_json_schema: {
      type: 'object',
      properties: {
        conteudo: { type: 'string' },
        resumo: { type: 'string' },
        temas: { type: 'array', items: { type: 'string' } },
        cargos: { type: 'array', items: { type: 'string' } },
        valores: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  });

  return {
    conteudo: normalizeText(result?.conteudo || ''),
    resumo: normalizeText(result?.resumo || ''),
    temas: Array.isArray(result?.temas) ? result.temas : [],
    cargos: Array.isArray(result?.cargos) ? result.cargos : [],
    valores: Array.isArray(result?.valores) ? result.valores : [],
    tags: Array.isArray(result?.tags) ? result.tags : [],
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const {
      file_url,
      titulo,
      categoria,
      descricao,
      cargo_relacionado,
      tags: rawTags,
    } = body || {};

    if (!file_url || !titulo) {
      return Response.json(
        { error: 'Arquivo e título obrigatórios' },
        { status: 400 }
      );
    }

    const fileType = detectFileType(file_url);
    const file_name = getFileNameFromUrl(file_url);

    let texto = '';

    if (fileType === 'pdf') {
      try {
        texto = await extractPdfText(file_url);
      } catch (error) {
        console.warn('Falha na leitura direta do PDF, seguindo para fallback:', error);
      }
    } else {
      texto = await extractGenericText(base44, file_url);
    }

    const ia = await analyzeWithLLM(base44, file_url);

    if (!texto || texto.length < 200) {
      texto = ia.conteudo || texto;
    }

    texto = normalizeText(texto);

    if (!texto) {
      return Response.json(
        { error: 'Não foi possível extrair conteúdo do documento.' },
        { status: 422 }
      );
    }

    const tags = Array.from(
      new Set([
        ...parseTags(rawTags),
        ...(ia.tags || []),
        ...(ia.temas || []),
        ...(ia.cargos || []),
      ].map((v) => String(v || '').trim()).filter(Boolean))
    );

    const chunks = chunkText(texto);
    const finalChunks = chunks.length > 0 ? chunks : [texto.slice(0, 2000)];

    const docPayload: Record<string, unknown> = {
      titulo,
      descricao: descricao || '',
      categoria: categoria || 'Outro',
      file_url,
      file_name,
      conteudo_extraido: texto,
      resumo_ia: ia.resumo || '',
      cargos_identificados: (ia.cargos || []).join(', '),
      salarios_e_pagamentos: (ia.valores || []).join('\n'),
      tags: tags.join(', '),
      cargo_relacionado: cargo_relacionado || '',
      tipo_arquivo: fileType,
      ativo: true,
      processado_por_ia: true,
      status_processamento: 'processado',
      created_by_email: user.email || '',
    };

    const doc = await base44.asServiceRole.entities.KnowledgeDocument.create(docPayload);

    for (let i = 0; i < finalChunks.length; i++) {
      try {
        await base44.asServiceRole.entities.KnowledgeChunk.create({
          knowledge_document_id: doc.id,
          chunk_index: i + 1,
          titulo: `${titulo} — trecho ${i + 1}`,
          texto_chunk: finalChunks[i],
          categoria: categoria || 'Outro',
          cargo_relacionado: cargo_relacionado || '',
          tags: tags.join(', '),
          ativo: true,
          document_title: titulo,
        });
      } catch (chunkError) {
        console.warn(`Erro ao criar chunk ${i + 1}:`, chunkError);
      }
    }

    return Response.json({
      success: true,
      chunks: finalChunks.length,
      document: doc,
    });
  } catch (err: any) {
    console.error('processDocumentUpload error:', err);
    return Response.json(
      { error: err?.message || 'Erro interno ao processar documento' },
      { status: 500 }
    );
  }
});
