import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import pdfParse from 'npm:pdf-parse@1.1.1';

function normalizeText(value: string) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function detectFileType(file_name: string) {
  const lower = String(file_name || '').toLowerCase();

  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.doc')) return 'doc';
  if (lower.endsWith('.txt')) return 'txt';

  return 'outro';
}

async function extractPdfText(file_url: string) {
  const res = await fetch(file_url);
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
          conteudo: { type: 'string' }
        }
      }
    });

    return normalizeText(extracted?.output?.conteudo || '');
  } catch {
    return '';
  }
}

async function analyzeWithLLM(base44: any, file_url: string) {
  try {
    return await base44.integrations.Core.InvokeLLM({
      prompt: `
Analise este documento.

Extraia:
- resumo
- temas
- informações estruturadas
`,
      file_urls: [file_url]
    });
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();

    const {
      file_name,
      mime_type,
      content_base64
    } = body || {};

    if (!file_name || !content_base64) {
      return Response.json({ error: 'Arquivo inválido' }, { status: 400 });
    }

    // 🔥 upload real
    const upload = await base44.storage.upload({
      file_name,
      content_base64
    });

    const file_url = upload?.file_url;

    const fileType = detectFileType(file_name);

    // 🔥 extração texto
    let texto = '';

    if (fileType === 'pdf') {
      texto = await extractPdfText(file_url);
    } else {
      texto = await extractGenericText(base44, file_url);
    }

    // 🔥 IA
    const ia = await analyzeWithLLM(base44, file_url);

    // 🔥 SALVA NA BASE (CORREÇÃO PRINCIPAL)
    const doc = await base44.asServiceRole.entities.KnowledgeDocument.create({
      title: file_name,
      file_name,
      file_url,
      mime_type,
      conteudo: texto,
      resumo: ia?.resumo || '',
      status: 'processado'
    });

    return Response.json({
      ok: true,
      document_id: doc.id,
      file_url
    });

  } catch (err: any) {
    return Response.json(
      { error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
});
