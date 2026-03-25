import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import pdfParse from 'npm:pdf-parse@1.1.1';
import * as XLSX from 'npm:xlsx@0.18.5';

function normalizeText(value: string) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function detectFileType(fileName: string, mimeType = '') {
  const lower = String(fileName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  if (lower.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  if (lower.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
  if (lower.endsWith('.xls') || mime.includes('excel')) return 'xls';
  if (lower.endsWith('.csv') || mime.includes('csv')) return 'csv';
  if (lower.endsWith('.txt') || mime.includes('text/plain')) return 'txt';

  return 'outro';
}

function base64ToArrayBuffer(contentBase64: string) {
  const base64 = String(contentBase64 || '').includes(',')
    ? String(contentBase64).split(',').pop() || ''
    : String(contentBase64 || '');

  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return bytes.buffer;
}

// 🔥 GARANTE QUE SEMPRE EXISTE DOCUMENTO
async function createDocumentSafe(base44: any, payload: any) {
  try {
    return await base44.asServiceRole.entities.KnowledgeDocument.create(payload);
  } catch (e) {
    console.error('ERRO CREATE:', e);

    // fallback mínimo
    return await base44.asServiceRole.entities.KnowledgeDocument.create({
      title: payload.title || payload.file_name,
      name: payload.file_name,
      file_name: payload.file_name,
      file_url: payload.file_url,
      processing_status: 'erro_parcial',
      status: 'erro_parcial',
      tags: ['erro'],
    });
  }
}

async function updateSafe(base44: any, id: string, payload: any) {
  if (!id) return;

  try {
    await base44.asServiceRole.entities.KnowledgeDocument.update(id, payload);
  } catch (e) {
    console.error('ERRO UPDATE:', e);
  }
}

Deno.serve(async (req) => {
  let base44: any = null;
  let knowledgeDocId = '';

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const {
      file_name,
      mime_type,
      content_base64,
      titulo,
      categoria,
      descricao,
    } = body || {};

    if (!file_name || !content_base64) {
      return Response.json(
        { error: 'Arquivo obrigatório' },
        { status: 400 }
      );
    }

    const fileType = detectFileType(file_name, mime_type);

    // 🔥 1. STORAGE
    const upload = await base44.storage.upload({
      file_name,
      content_base64,
    });

    const file_url = upload?.file_url;

    if (!file_url) {
      throw new Error('Falha no storage');
    }

    // 🔥 2. CRIA DOCUMENTO (IMEDIATO E COMPLETO)
    const doc = await createDocumentSafe(base44, {
      title: titulo || file_name,
      name: titulo || file_name,
      file_name,
      file_url,
      mime_type: mime_type || '',
      categoria: categoria || '',
      descricao: descricao || '',
      tags: [fileType, 'upload'],
      processing_status: 'processando',
      status: 'processando',
      uploaded_by_email: user?.email || '',
      uploaded_by_name: user?.full_name || user?.name || '',
      created_at: new Date().toISOString(),
    });

    knowledgeDocId = doc?.id;

    // 🔥 3. EXTRAÇÃO (SEGURA)
    let texto = '';

    try {
      if (fileType === 'pdf') {
        const res = await fetch(file_url);
        const buffer = Buffer.from(await res.arrayBuffer());
        const parsed = await pdfParse(buffer);
        texto = normalizeText(parsed.text || '');
      }

      if (fileType === 'xlsx' || fileType === 'xls') {
        const buffer = base64ToArrayBuffer(content_base64);
        const workbook = XLSX.read(buffer, { type: 'array' });

        texto = workbook.SheetNames.join('\n');
      }
    } catch (e) {
      console.error('Erro extração:', e);
    }

    // 🔥 4. UPDATE FINAL (GARANTIDO)
    await updateSafe(base44, knowledgeDocId, {
      extracted_text: texto || '',
      processing_status: 'processado',
      status: 'processado',
      updated_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      document_id: knowledgeDocId,
      file_url,
      saved: true,
    });

  } catch (err: any) {
    console.error('ERRO GERAL:', err);

    if (base44 && knowledgeDocId) {
      await updateSafe(base44, knowledgeDocId, {
        processing_status: 'erro',
        status: 'erro',
      });
    }

    return Response.json(
      { error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
});
