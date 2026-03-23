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

  return 'outro';
}

function parseTags(tags: unknown) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(v => String(v).trim()).filter(Boolean);

  return String(tags)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function chunkText(text: string, maxSize = 2000) {
  const paragraphs = normalizeText(text).split('\n\n');
  const chunks: string[] = [];
  let current = '';

  for (const p of paragraphs) {
    const next = current ? `${current}\n\n${p}` : p;
    if (next.length <= maxSize) {
      current = next;
    } else {
      if (current) chunks.push(current);
      current = p;
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

async function extractPdfText(file_url: string) {
  const res = await fetch(file_url);
  const buffer = Buffer.from(await res.arrayBuffer());
  const data = await pdfParse(buffer);
  return normalizeText(data.text || '');
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
5. Valores (salários, pagamentos, contratos)
6. Tags relevantes para busca

Responda em JSON.
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
        tags: { type: 'array', items: { type: 'string' } }
      }
    }
  });

  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await req.json();

    const { file_url, titulo, categoria, descricao, cargo_relacionado } = body;

    if (!file_url || !titulo) {
      return Response.json({ error: 'Arquivo e título obrigatórios' }, { status: 400 });
    }

    const fileType = detectFileType(file_url);
    const file_name = getFileNameFromUrl(file_url);

    let texto = '';

    if (fileType === 'pdf') {
      texto = await extractPdfText(file_url);
    }

    const ia = await analyzeWithLLM(base44, file_url);

    if (!texto || texto.length < 200) {
      texto = ia.conteudo;
    }

    const tags = [
      ...(ia.tags || []),
      ...(ia.temas || []),
      ...(ia.cargos || [])
    ];

    const chunks = chunkText(texto);

    const doc = await base44.entities.KnowledgeDocument.create({
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
      ativo: true,
      processado_por_ia: true
    });

    for (let i = 0; i < chunks.length; i++) {
      await base44.entities.KnowledgeChunk.create({
        knowledge_document_id: doc.id,
        chunk_index: i,
        texto_chunk: chunks[i],
        categoria,
        cargo_relacionado,
        tags: tags.join(', ')
      });
    }

    return Response.json({
      success: true,
      chunks: chunks.length,
      documento: doc
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});
