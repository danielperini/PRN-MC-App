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

function normalizarEquipamento(e: string) {
  const v = String(e || '').toUpperCase();
  if (v.includes('MIS')) return 'MIS';
  if (v.includes('MAB') || v.includes('MHAB')) return 'MHAB';
  if (v.includes('MUMO') || v.includes('MUMU')) return 'MUMO';
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
  return String(value).trim();
}

function normalizeHeader(header: string) {
  const h = String(header || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (h === 'equipamento') return 'equipamento';
  if (h === 'nome' || h.includes('nome da acao') || h.includes('nome da ação')) return 'nome';
  if (h.includes('nome da atividade para divulgacao') || h.includes('nome da atividade para divulgação')) return 'nome_divulgacao';
  if (h.includes('sinopse')) return 'sinopse';
  if (h.includes('tipo de atividade')) return 'tipo_atividade';
  if (h.includes('formato')) return 'formato';
  if (h === 'data') return 'data';
  if (h.includes('horario') || h.includes('horário')) return 'horario';
  if (h.includes('publico-alvo') || h.includes('público-alvo') || h.includes('publico alvo')) return 'publico';
  if (h.includes('acessibilidade')) return 'acessibilidade';
  if (h.includes('classificacao indicativa') || h.includes('classificação indicativa')) return 'classificacao';
  if (h.includes('vagas')) return 'vagas';
  if (h.includes('inscricao/acesso') || h.includes('inscrição/acesso')) return 'inscricao';
  if (h.includes('contato da atracao') || h.includes('contato da atração')) return 'contato';
  if (h === 'local') return 'local';
  if (h.includes('endereco completo') || h.includes('endereço completo')) return 'endereco';
  if (h.includes('link de imagens')) return 'link_imagens';
  if (h.includes('minibios')) return 'minibios';
  if (h.includes('material de divulgacao') || h.includes('material de divulgação')) return 'material_divulgacao';

  return h.replace(/[^\w]+/g, '_');
}

function seemsProgramacaoFile(fileName: string, categoria = '', descricao = '') {
  const text = `${fileName} ${categoria} ${descricao}`.toLowerCase();
  return (
    text.includes('programa') ||
    text.includes('agenda') ||
    text.includes('atividade') ||
    text.includes('museu')
  );
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
- responder em JSON
`
      : `
Analise profundamente este documento.

Extraia:
- resumo
- temas
- cargos
- valores
- tags
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

function parseSpreadsheetProgramacao(arrayBuffer: ArrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const eventos: any[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const ws = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: '',
    }) as any[][];

    if (!Array.isArray(matrix) || matrix.length < 4) return;

    const row2 = (matrix[1] || []).map(stringifyCell);
    const row3 = (matrix[2] || []).map(stringifyCell);

    const isMainHeader =
      normalizeHeader(row2[0]) === 'equipamento' &&
      normalizeText(row2[1]) === 'programacao';

    if (!isMainHeader) return;

    const headers = row3.map(normalizeHeader);

    for (let i = 3; i < matrix.length; i++) {
      const row = (matrix[i] || []).map(stringifyCell);
      const hasAnyValue = row.some((v) => String(v || '').trim() !== '');
      if (!hasAnyValue) continue;

      const equipamento = row[0] || '';
      const nome = row[1] || '';

      if (!equipamento || !nome) continue;

      const values: Record<string, any> = { equipamento };

      for (let c = 1; c < headers.length; c++) {
        values[headers[c]] = row[c] || '';
      }

      eventos.push({
        nome_acao: values.nome_divulgacao || values.nome || nome,
        equipamento: normalizarEquipamento(equipamento),
        data: parseDateValue(values.data),
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

async function upsertProgramacaoEvents(base44: any, eventos: any[]) {
  let salvos = 0;

  for (const ev of eventos) {
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

  return salvos;
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

    // 1. SALVA ARQUIVO NO STORAGE
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

    // 2. CRIA DOCUMENTO PERSISTIDO ANTES DA IA
    const initialTags = uniqueStrings([
      ...parseTags(rawTags),
      fileType,
      isProgramacao ? 'programacao' : '',
    ]);

    const knowledgeDoc = await base44.asServiceRole.entities.KnowledgeDocument.create({
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

    try {
      // 3. EXTRAÇÃO DE TEXTO
      let texto = '';

      if (fileType === 'pdf') {
        texto = await extractPdfText(file_url);
      } else {
        texto = await extractGenericText(base44, file_url);
      }

      // 4. ANÁLISE COM IA
      const ia = await analyzeWithLLM(base44, file_url, isProgramacao);

      let eventos: any[] = [];

      // 5. SE FOR PLANILHA DE PROGRAMAÇÃO, LÊ DIRETO DA PLANILHA PRIMEIRO
      if (isProgramacao && (fileType === 'xlsx' || fileType === 'xls' || fileType === 'csv')) {
        try {
          const buffer = Uint8Array.from(atob(content_base64), (c) => c.charCodeAt(0)).buffer;
          eventos = parseSpreadsheetProgramacao(buffer);
        } catch (e) {
          console.error('Erro ao ler planilha enviada', e);
        }
      }

      // 6. FALLBACK IA PARA EVENTOS
      if (!eventos.length && isProgramacao && Array.isArray(ia?.eventos)) {
        eventos = ia.eventos.map((ev: any) => ({
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
        }));
      }

      // 7. SALVA EVENTOS NA AGENDA
      const totalEventosSalvos = eventos.length
        ? await upsertProgramacaoEvents(base44, eventos)
        : 0;

      const finalTags = uniqueStrings([
        ...initialTags,
        ...(Array.isArray(ia?.tags) ? ia.tags : []),
      ]);

      // 8. ATUALIZA DOCUMENTO APÓS IA
      await base44.asServiceRole.entities.KnowledgeDocument.update(knowledgeDoc.id, {
        tags: finalTags,
        processing_status: 'processado',
        status: 'processado',
        summary: ia?.resumo || '',
        analysis: JSON.stringify(ia || {}),
        extracted_text: texto || '',
        total_eventos_extraidos: eventos.length,
        total_eventos_salvos: totalEventosSalvos,
        agenda_updated: totalEventosSalvos > 0,
      });

      return Response.json({
        ok: true,
        success: true,
        document_id: knowledgeDoc?.id,
        file_url,
        file_type: fileType,
        listed_in_library: true,
        ia_processed: true,
        programacao_processada: isProgramacao,
        agenda_updated: totalEventosSalvos > 0,
        total_eventos_extraidos: eventos.length,
        total_eventos_salvos: totalEventosSalvos,
      });
    } catch (processingError: any) {
      // 9. SE IA FALHAR, O ARQUIVO CONTINUA SALVO E O STATUS FICA VISÍVEL
      await base44.asServiceRole.entities.KnowledgeDocument.update(knowledgeDoc.id, {
        processing_status: 'erro',
        status: 'erro',
        summary: '',
        analysis: JSON.stringify({
          error: processingError?.message || 'Erro no processamento automático',
        }),
        extracted_text: '',
      });

      return Response.json({
        ok: false,
        listed_in_library: true,
        document_id: knowledgeDoc?.id,
        file_url,
        error: processingError?.message || 'Erro no processamento automático',
      }, { status: 500 });
    }
  } catch (err: any) {
    return Response.json(
      { error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
});
