import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import pdfParse from 'npm:pdf-parse@1.1.1';
import * as XLSX from 'npm:xlsx@0.18.5';

function normalizeText(value: any) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function normalizeLoose(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(values.map((v) => String(v || '').trim()).filter(Boolean))
  );
}

function detectFileType(fileName: string, mimeType = '') {
  const lower = String(fileName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  if (lower.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  if (lower.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
  if (lower.endsWith('.xls') || mime.includes('excel')) return 'xls';
  if (lower.endsWith('.csv') || mime.includes('csv')) return 'csv';
  if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
  if (lower.endsWith('.doc')) return 'doc';
  if (lower.endsWith('.txt') || mime.includes('text/plain')) return 'txt';

  return 'outro';
}

function normalizarEquipamento(e: string) {
  const v = normalizeLoose(e);

  if (v.includes('mis')) return 'MIS';
  if (v.includes('mab') || v.includes('mhab')) return 'MHAB';
  if (v.includes('mumo') || v.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function parseDateValue(value: any) {
  if (!value) return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed?.y && parsed?.m && parsed?.d) {
        const d = String(parsed.d).padStart(2, '0');
        const m = String(parsed.m).padStart(2, '0');
        const y = String(parsed.y);
        return `${d}/${m}/${y}`;
      }
    } catch (_) {
      // ignora
    }
  }

  const text = String(value).trim();
  if (!text) return '';

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (br) {
    const d = String(Number(br[1])).padStart(2, '0');
    const m = String(Number(br[2])).padStart(2, '0');
    const y = br[3]
      ? String(Number(br[3]) < 100 ? Number(br[3]) + 2000 : Number(br[3]))
      : '';
    return y ? `${d}/${m}/${y}` : `${d}/${m}`;
  }

  return text;
}

function stringifyCell(value: any) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return parseDateValue(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsedDate = parseDateValue(value);
    if (parsedDate && parsedDate !== String(value).trim()) return parsedDate;
  }
  return String(value).trim();
}

function normalizeHeader(header: string) {
  const h = normalizeLoose(header);

  if (h === 'equipamento') return 'equipamento';
  if (
    h === 'nome' ||
    h.includes('nome da acao') ||
    h.includes('nome da ação') ||
    h.includes('nome da programacao') ||
    h.includes('nome da programação')
  ) return 'nome';
  if (
    h.includes('nome da atividade para divulgacao') ||
    h.includes('nome da atividade para divulgação')
  ) return 'nome_divulgacao';
  if (h.includes('sinopse')) return 'sinopse';
  if (h.includes('tipo de atividade')) return 'tipo_atividade';
  if (h.includes('formato')) return 'formato';
  if (h === 'data' || h.includes('data ou periodo') || h.includes('data/periodo') || h.includes('periodo')) return 'data';
  if (h.includes('horario') || h.includes('horário') || h.includes('hora')) return 'horario';
  if (h.includes('publico-alvo') || h.includes('publico alvo') || h.includes('público-alvo')) return 'publico';
  if (h.includes('acessibilidade')) return 'acessibilidade';
  if (h.includes('classificacao indicativa') || h.includes('classificação indicativa')) return 'classificacao';
  if (h.includes('vagas')) return 'vagas';
  if (
    h.includes('inscricao/acesso') ||
    h.includes('inscrição/acesso') ||
    h.includes('inscricao') ||
    h.includes('inscrição') ||
    h.includes('link de inscricao') ||
    h.includes('link de inscrição') ||
    h.includes('acesso')
  ) return 'inscricao';
  if (h.includes('contato da atracao') || h.includes('contato da atração')) return 'contato';
  if (h === 'local') return 'local';
  if (h.includes('endereco completo') || h.includes('endereço completo') || h.includes('endereco')) return 'endereco';
  if (h.includes('link de imagens')) return 'link_imagens';
  if (h.includes('minibios') || h.includes('mini bios')) return 'minibios';
  if (h.includes('material de divulgacao') || h.includes('material de divulgação')) return 'material_divulgacao';

  return h.replace(/[^\w]+/g, '_');
}

function isLikelyHeaderRow(row: string[]) {
  const mapped = row.map(normalizeHeader);

  const scoreKeys = [
    'equipamento',
    'nome',
    'nome_divulgacao',
    'data',
    'horario',
    'tipo_atividade',
    'formato',
    'publico',
    'sinopse',
    'local',
    'inscricao',
    'vagas',
  ];

  const score = scoreKeys.filter((k) => mapped.includes(k)).length;
  return score >= 3;
}

function findHeaderRowIndex(matrix: string[][]) {
  const maxRows = Math.min(matrix.length, 8);

  for (let i = 0; i < maxRows; i++) {
    if (isLikelyHeaderRow(matrix[i] || [])) return i;
  }

  return -1;
}

function buildHeadersForSheet(matrix: string[][]) {
  if (!Array.isArray(matrix) || matrix.length < 2) {
    return { headerRowIndex: -1, headers: [] as string[] };
  }

  if (matrix.length >= 3) {
    const row2 = (matrix[1] || []).map(stringifyCell);
    const row3 = (matrix[2] || []).map(stringifyCell);

    const isLegacyMainHeader =
      normalizeHeader(row2[0]) === 'equipamento' &&
      normalizeLoose(row2[1]) === 'programacao';

    if (isLegacyMainHeader) {
      const headers = row3.map((h, idx) => {
        if (idx === 0) return 'equipamento';
        if (idx === 1 && !normalizeHeader(h)) return 'nome';
        return normalizeHeader(h);
      });

      if (!headers[1]) headers[1] = 'nome';

      return { headerRowIndex: 2, headers };
    }
  }

  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex < 0) {
    return { headerRowIndex: -1, headers: [] as string[] };
  }

  const rawHeaders = (matrix[headerRowIndex] || []).map(stringifyCell);
  const headers = rawHeaders.map((h) => normalizeHeader(h));

  return { headerRowIndex, headers };
}

function parseSpreadsheetProgramacaoFromBuffer(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const eventos: any[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const ws = workbook.Sheets[sheetName];
    const matrixRaw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: '',
    }) as any[][];

    const matrix = (matrixRaw || []).map((row) => (row || []).map(stringifyCell));
    if (!Array.isArray(matrix) || matrix.length < 2) return;

    const { headerRowIndex, headers } = buildHeadersForSheet(matrix);
    if (headerRowIndex < 0 || !headers.length) return;

    for (let i = headerRowIndex + 1; i < matrix.length; i++) {
      const row = (matrix[i] || []).map(stringifyCell);
      const hasAnyValue = row.some((v) => String(v || '').trim() !== '');
      if (!hasAnyValue) continue;

      const values: Record<string, any> = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c];
        if (!key) continue;
        values[key] = row[c] || '';
      }

      const equipamento = values.equipamento || row[0] || '';
      const nome =
        values.nome_divulgacao ||
        values.nome ||
        row[1] ||
        row.find((cell, idx) => idx > 0 && String(cell || '').trim()) ||
        '';

      if (!nome) continue;

      eventos.push({
        nome_acao: normalizeText(nome),
        equipamento: normalizarEquipamento(equipamento || sheetName),
        data: parseDateValue(values.data || ''),
        horario: normalizeText(values.horario || ''),
        tipo_atividade: normalizeText(values.tipo_atividade || ''),
        formato: normalizeText(values.formato || ''),
        publico: normalizeText(values.publico || ''),
        acessibilidade: normalizeText(values.acessibilidade || ''),
        classificacao: normalizeText(values.classificacao || ''),
        vagas: normalizeText(values.vagas || ''),
        inscricao: normalizeText(values.inscricao || ''),
        sinopse: normalizeText(values.sinopse || ''),
        local: normalizeText(values.local || ''),
        endereco: normalizeText(values.endereco || ''),
        link_imagens: normalizeText(values.link_imagens || ''),
        minibios: normalizeText(values.minibios || ''),
        material_divulgacao: normalizeText(values.material_divulgacao || ''),
      });
    }
  });

  return eventos;
}

function dedupeProgramacaoEvents(eventos: any[]) {
  const map = new Map<string, any>();

  for (const ev of eventos || []) {
    if (!ev?.nome_acao) continue;

    const key = [
      normalizeLoose(ev.nome_acao),
      normalizeLoose(ev.equipamento),
      normalizeLoose(ev.data),
      normalizeLoose(ev.horario),
      normalizeLoose(ev.local),
    ].join('|');

    if (!map.has(key)) {
      map.set(key, ev);
      continue;
    }

    const prev = map.get(key) || {};
    map.set(key, {
      ...prev,
      ...ev,
      sinopse: ev.sinopse || prev.sinopse || '',
      endereco: ev.endereco || prev.endereco || '',
      link_imagens: ev.link_imagens || prev.link_imagens || '',
      minibios: ev.minibios || prev.minibios || '',
      material_divulgacao: ev.material_divulgacao || prev.material_divulgacao || '',
    });
  }

  return Array.from(map.values());
}

async function extractPdfText(fileUrl: string) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Falha ao baixar PDF: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const data = await pdfParse(buffer);
  return normalizeText(data.text || '');
}

async function extractGenericText(base44: any, fileUrl: string) {
  try {
    const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: fileUrl,
      json_schema: {
        type: 'object',
        properties: {
          conteudo_completo: { type: 'string' },
        },
      },
    });

    return normalizeText(extracted?.output?.conteudo_completo || '');
  } catch (error) {
    console.error('Erro no ExtractDataFromUploadedFile:', error);
    return '';
  }
}

async function analyzeWithLLM(base44: any, fileUrl: string) {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `
Analise o documento e classifique.

Responda com:
- tipo_documento: programacao | contrato | nota_fiscal | recibo | relatorio | outro
- resumo
- tags
- eventos (somente se for programação)

Para cada evento de programação, extraia:
- nome_acao
- equipamento
- data
- horario
- tipo_atividade
- formato
- publico
- acessibilidade
- classificacao
- vagas
- inscricao
- sinopse
- local
- endereco
- link_imagens
- minibios
- material_divulgacao

Regras:
- não inventar
- se não for programação, eventos deve vir vazio
- responder em JSON
`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          tipo_documento: { type: 'string' },
          resumo: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          eventos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome_acao: { type: 'string' },
                equipamento: { type: 'string' },
                data: { type: 'string' },
                horario: { type: 'string' },
                tipo_atividade: { type: 'string' },
                formato: { type: 'string' },
                publico: { type: 'string' },
                acessibilidade: { type: 'string' },
                classificacao: { type: 'string' },
                vagas: { type: 'string' },
                inscricao: { type: 'string' },
                sinopse: { type: 'string' },
                local: { type: 'string' },
                endereco: { type: 'string' },
                link_imagens: { type: 'string' },
                minibios: { type: 'string' },
                material_divulgacao: { type: 'string' },
              },
            },
          },
        },
      },
    });

    return result || {};
  } catch (error) {
    console.error('Erro na análise com LLM:', error);
    return {};
  }
}

function inferTipoDocumento(doc: any, fileType: string, extractedText: string, llmType: string) {
  const llm = normalizeLoose(llmType || '');
  if (llm.includes('programacao')) return 'programacao';
  if (llm.includes('contrato')) return 'contrato';
  if (llm.includes('nota_fiscal')) return 'nota_fiscal';
  if (llm.includes('recibo')) return 'recibo';
  if (llm.includes('relatorio')) return 'relatorio';

  const joined = normalizeLoose([
    doc?.title,
    doc?.name,
    doc?.file_name,
    doc?.categoria,
    doc?.descricao,
    extractedText?.slice(0, 3000),
  ].join(' '));

  if (
    joined.includes('programacao') ||
    joined.includes('agenda') ||
    joined.includes('atividade') ||
    joined.includes('museu') ||
    joined.includes('oficina') ||
    joined.includes('caderno de artista')
  ) return 'programacao';

  if (joined.includes('contrato') || joined.includes('vigencia') || joined.includes('vigência')) return 'contrato';
  if (joined.includes('nota fiscal') || joined.includes('danfe') || joined.includes('nf-e')) return 'nota_fiscal';
  if (joined.includes('recibo')) return 'recibo';
  if (joined.includes('relatorio') || joined.includes('relatório')) return 'relatorio';

  if (fileType === 'pdf' || fileType === 'docx' || fileType === 'doc') return 'documento';
  return 'outro';
}

async function getDocumentById(base44: any, documentId: string) {
  if (!documentId) return null;

  try {
    return await base44.asServiceRole.entities.KnowledgeDocument.get(documentId);
  } catch (error) {
    console.error('Erro ao buscar KnowledgeDocument por get:', error);
  }

  try {
    const list = await base44.asServiceRole.entities.KnowledgeDocument.list({ limit: 1, where: { id: documentId } });
    if (Array.isArray(list)) return list[0] || null;
    if (Array.isArray(list?.items)) return list.items[0] || null;
    return null;
  } catch (error) {
    console.error('Erro ao buscar KnowledgeDocument por list:', error);
    return null;
  }
}

async function updateKnowledgeDocumentSafe(base44: any, id: string, payload: Record<string, any>) {
  if (!id) return;
  try {
    await base44.asServiceRole.entities.KnowledgeDocument.update(id, payload);
  } catch (error) {
    console.error('Erro ao atualizar KnowledgeDocument:', error);
  }
}

async function upsertProgramacaoEvents(base44: any, eventos: any[]) {
  const unicos = dedupeProgramacaoEvents(eventos);
  let salvos = 0;

  for (const ev of unicos) {
    try {
      const equipment = normalizarEquipamento(ev.equipamento || '');
      const existing = await base44.asServiceRole.entities.Programacao.list({
        limit: 1,
        where: {
          nome_acao: ev.nome_acao || '',
          data: ev.data || '',
          equipamento: equipment,
        },
      });

      const found = Array.isArray(existing)
        ? existing[0]
        : Array.isArray(existing?.items)
          ? existing.items[0]
          : null;

      const payload = {
        nome_acao: ev.nome_acao || '',
        equipamento: equipment,
        data: ev.data || '',
        horario: ev.horario || '',
        tipo_atividade: ev.tipo_atividade || '',
        formato: ev.formato || '',
        publico: ev.publico || '',
        acessibilidade: ev.acessibilidade || '',
        classificacao: ev.classificacao || '',
        vagas: ev.vagas || '',
        inscricao: ev.inscricao || '',
        sinopse: ev.sinopse || '',
        local: ev.local || '',
        endereco: ev.endereco || '',
        link_imagens: ev.link_imagens || '',
        minibios: ev.minibios || '',
        material_divulgacao: ev.material_divulgacao || '',
        origem: 'knowledge_document_ia',
        ativo: true,
      };

      if (found?.id) {
        await base44.asServiceRole.entities.Programacao.update(found.id, payload);
      } else {
        await base44.asServiceRole.entities.Programacao.create(payload);
      }

      salvos += 1;
    } catch (error) {
      console.error('Erro ao salvar programação:', error);
    }
  }

  return {
    totalRecebido: eventos.length,
    totalUnico: unicos.length,
    totalSalvo: salvos,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const documentId = String(
      body?.args?.document_id ||
      body?.document_id ||
      ''
    ).trim();

    if (!documentId) {
      return Response.json(
        { ok: false, error: 'document_id é obrigatório.' },
        { status: 400 }
      );
    }

    const doc = await getDocumentById(base44, documentId);

    if (!doc) {
      return Response.json(
        { ok: false, error: 'KnowledgeDocument não encontrado.' },
        { status: 404 }
      );
    }

    const fileUrl = doc.file_url || '';
    const fileName = doc.file_name || doc.name || doc.title || 'arquivo';
    const mimeType = doc.mime_type || '';
    const fileType = detectFileType(fileName, mimeType);

    if (!fileUrl) {
      await updateKnowledgeDocumentSafe(base44, documentId, {
        processing_status: 'erro',
        status: 'erro',
        analysis: JSON.stringify({ error: 'Arquivo sem file_url.' }),
      });

      return Response.json(
        { ok: false, error: 'Documento sem file_url.' },
        { status: 400 }
      );
    }

    await updateKnowledgeDocumentSafe(base44, documentId, {
      processing_status: 'processando',
      status: 'processando',
    });

    let extractedText = '';
    let eventos: any[] = [];
    let analysis: any = {};
    let tipoDocumento = 'outro';

    try {
      if (fileType === 'pdf') {
        extractedText = await extractPdfText(fileUrl);
      } else if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'csv') {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Falha ao baixar planilha: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        eventos = parseSpreadsheetProgramacaoFromBuffer(buffer);

        try {
          const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
          const parts: string[] = [];

          for (const sheetName of workbook.SheetNames) {
            const ws = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(ws);
            const text = normalizeText(csv || '');
            if (text) parts.push(`ABA: ${sheetName}\n${text}`);
          }

          extractedText = normalizeText(parts.join('\n\n'));
        } catch (error) {
          console.error('Erro ao extrair texto da planilha:', error);
        }
      } else {
        extractedText = await extractGenericText(base44, fileUrl);
      }

      analysis = await analyzeWithLLM(base44, fileUrl);

      tipoDocumento = inferTipoDocumento(doc, fileType, extractedText, analysis?.tipo_documento || '');

      if (!eventos.length && tipoDocumento === 'programacao' && Array.isArray(analysis?.eventos)) {
        eventos = analysis.eventos.map((ev: any) => ({
          nome_acao: normalizeText(ev?.nome_acao || ''),
          equipamento: normalizarEquipamento(ev?.equipamento || ''),
          data: parseDateValue(ev?.data || ''),
          horario: normalizeText(ev?.horario || ''),
          tipo_atividade: normalizeText(ev?.tipo_atividade || ''),
          formato: normalizeText(ev?.formato || ''),
          publico: normalizeText(ev?.publico || ''),
          acessibilidade: normalizeText(ev?.acessibilidade || ''),
          classificacao: normalizeText(ev?.classificacao || ''),
          vagas: normalizeText(ev?.vagas || ''),
          inscricao: normalizeText(ev?.inscricao || ''),
          sinopse: normalizeText(ev?.sinopse || ''),
          local: normalizeText(ev?.local || ''),
          endereco: normalizeText(ev?.endereco || ''),
          link_imagens: normalizeText(ev?.link_imagens || ''),
          minibios: normalizeText(ev?.minibios || ''),
          material_divulgacao: normalizeText(ev?.material_divulgacao || ''),
        })).filter((ev: any) => ev.nome_acao);
      }

      const resultadoProgramacao =
        tipoDocumento === 'programacao' && eventos.length
          ? await upsertProgramacaoEvents(base44, eventos)
          : { totalRecebido: eventos.length, totalUnico: eventos.length, totalSalvo: 0 };

      const finalTags = uniqueStrings([
        ...(Array.isArray(doc.tags) ? doc.tags : []),
        fileType,
        tipoDocumento,
        ...(Array.isArray(analysis?.tags) ? analysis.tags : []),
      ]);

      await updateKnowledgeDocumentSafe(base44, documentId, {
        tags: finalTags,
        processing_status: 'processado',
        status: 'processado',
        extracted_text: extractedText || '',
        conteudo_extraido: extractedText || '',
        summary: normalizeText(analysis?.resumo || ''),
        analysis: JSON.stringify({
          ...analysis,
          tipo_documento_inferido: tipoDocumento,
        }),
        tipo_documento: tipoDocumento,
        processado_ia: true,
        total_eventos_extraidos: resultadoProgramacao.totalRecebido,
        total_eventos_salvos: resultadoProgramacao.totalSalvo,
        agenda_updated: resultadoProgramacao.totalSalvo > 0,
      });

      return Response.json({
        ok: true,
        success: true,
        document_id: documentId,
        tipo_documento: tipoDocumento,
        processado_ia: true,
        agenda_updated: resultadoProgramacao.totalSalvo > 0,
        total_eventos_extraidos: resultadoProgramacao.totalRecebido,
        total_eventos_unicos: resultadoProgramacao.totalUnico,
        total_eventos_salvos: resultadoProgramacao.totalSalvo,
      });
    } catch (processingError: any) {
      await updateKnowledgeDocumentSafe(base44, documentId, {
        processing_status: 'erro',
        status: 'erro',
        processado_ia: false,
        analysis: JSON.stringify({
          error: processingError?.message || 'Erro no processamento automático',
        }),
      });

      return Response.json(
        {
          ok: false,
          document_id: documentId,
          error: processingError?.message || 'Erro no processamento automático',
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || 'Erro interno',
      },
      { status: 500 }
    );
  }
});
