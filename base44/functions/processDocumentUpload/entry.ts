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

function normalizeLoose(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

function parseTags(tags: unknown) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((v) => String(v || '').trim()).filter(Boolean);
  }

  return String(tags)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(values.map((v) => String(v || '').trim()).filter(Boolean))
  );
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

    if (current) {
      chunks.push(current);
      current = '';
    }

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
  if (h.includes('minibios') || h.includes('mini bios') || h.includes('mini bios')) return 'minibios';
  if (h.includes('material de divulgacao') || h.includes('material de divulgação')) return 'material_divulgacao';

  return h.replace(/[^\w]+/g, '_');
}

function seemsProgramacaoFile(fileName: string, categoria = '', descricao = '') {
  const text = normalizeLoose(`${fileName} ${categoria} ${descricao}`);

  const strongSignals = [
    'programacao',
    'programação',
    'agenda',
    'atividade',
    'atividades',
    'museu',
    'museus',
    'mis',
    'mab',
    'mhab',
    'mumo',
    'mumu',
    'oficina',
    'curso',
    'visita',
    'caderno de artista',
    'programa cultural',
  ];

  let score = 0;
  for (const token of strongSignals) {
    if (text.includes(normalizeLoose(token))) score += 1;
  }

  return score >= 2 || (text.includes('programacao') && text.includes('museu'));
}

function base64ToArrayBuffer(contentBase64: string) {
  const base64 = String(contentBase64 || '').includes(',')
    ? String(contentBase64).split(',').pop() || ''
    : String(contentBase64 || '');

  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function extractSpreadsheetText(arrayBuffer: ArrayBuffer) {
  try {
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const ws = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(ws);
      const text = normalizeText(csv || '');
      if (text) {
        parts.push(`ABA: ${sheetName}\n${text}`);
      }
    }

    return normalizeText(parts.join('\n\n'));
  } catch (error) {
    console.error('Erro ao extrair texto da planilha:', error);
    return '';
  }
}

async function extractPdfText(fileUrl: string) {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Falha ao baixar PDF: ${res.status}`);
  }

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

async function analyzeWithLLM(base44: any, fileUrl: string, isProgramacao = false) {
  try {
    const prompt = isProgramacao
      ? `
Analise este arquivo de programação cultural e extraia eventos.

Para cada atividade, extraia:
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
- uma linha = uma atividade
- se houver "data ou período", preserve o texto
- se houver nome da programação e nome para divulgação, prefira o nome para divulgação
- responder em JSON
`
      : `
Analise profundamente este documento.

Extraia:
1. conteudo
2. resumo
3. temas
4. cargos
5. valores
6. tags
`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      file_urls: [fileUrl],
      response_json_schema: isProgramacao
        ? {
            type: 'object',
            properties: {
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
                    material_divulgacao: { type: 'string' }
                  }
                }
              }
            }
          }
        : {
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

    return result || {};
  } catch (error) {
    console.error('Erro na análise com LLM:', error);
    return {};
  }
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
  const headers = rawHeaders.map((h, idx) => {
    const normalized = normalizeHeader(h);
    if (idx === 0 && normalized !== 'equipamento' && rawHeaders.some((cell) => normalizeHeader(cell) === 'equipamento')) {
      return normalized;
    }
    return normalized;
  });

  return { headerRowIndex, headers };
}

function parseSpreadsheetProgramacao(arrayBuffer: ArrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
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

      const data = parseDateValue(values.data || '');

      const hasCoreData =
        String(nome || '').trim() &&
        (
          String(equipamento || '').trim() ||
          String(data || '').trim() ||
          String(values.horario || '').trim() ||
          String(values.tipo_atividade || '').trim()
        );

      if (!hasCoreData) continue;

      eventos.push({
        nome_acao: nome,
        equipamento: normalizarEquipamento(equipamento || sheetName),
        data,
        horario: values.horario || '',
        tipo_atividade: values.tipo_atividade || '',
        formato: values.formato || '',
        publico: values.publico || '',
        acessibilidade: values.acessibilidade || '',
        classificacao: values.classificacao || '',
        vagas: values.vagas || '',
        inscricao: values.inscricao || '',
        sinopse: values.sinopse || '',
        local: values.local || '',
        endereco: values.endereco || '',
        link_imagens: values.link_imagens || '',
        minibios: values.minibios || '',
        material_divulgacao: values.material_divulgacao || '',
      });
    }
  });

  return eventos;
}

function normalizeProgramacaoEvent(ev: any) {
  return {
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
  };
}

function dedupeProgramacaoEvents(eventos: any[]) {
  const map = new Map<string, any>();

  for (const raw of eventos || []) {
    const ev = normalizeProgramacaoEvent(raw);

    if (!ev.nome_acao) continue;

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

async function upsertProgramacaoEvents(base44: any, eventos: any[]) {
  let salvos = 0;
  const unicos = dedupeProgramacaoEvents(eventos);

  for (const ev of unicos) {
    try {
      await base44.asServiceRole.entities.Programacao.create({
        nome_acao: ev.nome_acao || '',
        equipamento: normalizarEquipamento(ev.equipamento),
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
        origem: 'upload_biblioteca',
        ativo: true,
      });
      salvos += 1;
    } catch (e) {
      console.error('Erro ao salvar programação', e);
    }
  }

  return {
    totalRecebido: eventos.length,
    totalUnico: unicos.length,
    totalSalvo: salvos,
  };
}

async function safeCreateKnowledgeDocument(base44: any, payload: Record<string, any>) {
  try {
    return await base44.asServiceRole.entities.KnowledgeDocument.create(payload);
  } catch (error) {
    console.error('Erro ao criar KnowledgeDocument:', error);
    return null;
  }
}

async function safeUpdateKnowledgeDocument(base44: any, id: string, payload: Record<string, any>) {
  if (!id) return null;

  try {
    return await base44.asServiceRole.entities.KnowledgeDocument.update(id, payload);
  } catch (error) {
    console.error('Erro ao atualizar KnowledgeDocument:', error);
    return null;
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
      cargo_relacionado,
      tags: rawTags,
    } = body || {};

    if (!file_name || !content_base64) {
      return Response.json(
        { error: 'Arquivo e conteúdo obrigatórios' },
        { status: 400 }
      );
    }

    const fileType = detectFileType(file_name, mime_type);
    const isProgramacao = seemsProgramacaoFile(
      titulo || file_name,
      categoria || '',
      descricao || ''
    );

    const upload = await base44.storage.upload({
      file_name,
      content_base64,
    });

    const file_url = upload?.file_url || '';

    if (!file_url) {
      return Response.json(
        { error: 'Falha ao salvar arquivo no storage.' },
        { status: 500 }
      );
    }

    const initialTags = uniqueStrings([
      ...parseTags(rawTags),
      fileType,
      isProgramacao ? 'programacao' : '',
    ]);

    const initialDoc = await safeCreateKnowledgeDocument(base44, {
      title: titulo || file_name,
      name: titulo || file_name,
      file_name,
      file_url,
      mime_type: mime_type || '',
      categoria: categoria || '',
      descricao: descricao || '',
      cargo_relacionado: cargo_relacionado || '',
      tags: initialTags,
      processing_status: 'processando',
      status: 'processando',
      summary: '',
      analysis: '',
      extracted_text: '',
      uploaded_by_email: user?.email || '',
      uploaded_by_name: user?.full_name || user?.name || '',
    });

    knowledgeDocId = initialDoc?.id || '';

    let texto = '';
    let textoPlanilha = '';
    let ia: any = {};
    let eventos: any[] = [];

    if (fileType === 'pdf') {
      texto = await extractPdfText(file_url);
    } else if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'csv') {
      try {
        const buffer = base64ToArrayBuffer(content_base64);
        textoPlanilha = extractSpreadsheetText(buffer);
        texto = textoPlanilha;

        if (isProgramacao) {
          eventos = parseSpreadsheetProgramacao(buffer);
        }
      } catch (e) {
        console.error('Erro ao ler planilha enviada', e);
      }

      if (!texto) {
        texto = await extractGenericText(base44, file_url);
      }
    } else {
      texto = await extractGenericText(base44, file_url);
    }

    ia = await analyzeWithLLM(base44, file_url, isProgramacao);

    const tags = uniqueStrings([
      ...initialTags,
      ...(Array.isArray(ia?.tags) ? ia.tags : []),
    ]);

    if (!eventos.length && isProgramacao && Array.isArray(ia?.eventos)) {
      eventos = ia.eventos.map((ev: any) => ({
        nome_acao: ev.nome_acao || '',
        equipamento: ev.equipamento || '',
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
      }));
    }

    const resultadoProgramacao = eventos.length
      ? await upsertProgramacaoEvents(base44, eventos)
      : { totalRecebido: 0, totalUnico: 0, totalSalvo: 0 };

    if (knowledgeDocId) {
      await safeUpdateKnowledgeDocument(base44, knowledgeDocId, {
        tags,
        processing_status: 'processado',
        status: 'processado',
        summary: ia?.resumo || '',
        analysis: JSON.stringify(ia || {}),
        extracted_text: texto || '',
      });
    } else {
      const fallbackDoc = await safeCreateKnowledgeDocument(base44, {
        title: titulo || file_name,
        name: titulo || file_name,
        file_name,
        file_url,
        mime_type: mime_type || '',
        categoria: categoria || '',
        descricao: descricao || '',
        cargo_relacionado: cargo_relacionado || '',
        tags,
        processing_status: 'processado',
        status: 'processado',
        summary: ia?.resumo || '',
        analysis: JSON.stringify(ia || {}),
        extracted_text: texto || '',
        uploaded_by_email: user?.email || '',
        uploaded_by_name: user?.full_name || user?.name || '',
      });

      knowledgeDocId = fallbackDoc?.id || '';
    }

    return Response.json({
      ok: true,
      success: true,
      document_id: knowledgeDocId || null,
      file_url,
      file_type: fileType,
      listed_in_library: Boolean(knowledgeDocId),
      ia_processed: true,
      programacao_processada: isProgramacao,
      agenda_updated: resultadoProgramacao.totalSalvo > 0,
      total_eventos_extraidos: resultadoProgramacao.totalRecebido,
      total_eventos_unicos: resultadoProgramacao.totalUnico,
      total_eventos_salvos: resultadoProgramacao.totalSalvo,
    });
  } catch (err: any) {
    console.error('Erro em processDocumentUpload:', err);

    if (base44 && knowledgeDocId) {
      await safeUpdateKnowledgeDocument(base44, knowledgeDocId, {
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
