import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@2.30.0';
import { ptBR } from 'npm:date-fns@2.30.0/locale';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function cleanValue(value: any) {
  if (value === null || value === undefined) return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return String(value).trim();
}

function normalizeHeader(value: any, index: number) {
  const clean = cleanValue(value);
  return clean || `coluna_${index + 1}`;
}

function extractSheetMonthYear(sheetName = '') {
  const sheetText = normalizeText(sheetName);

  const monthMap: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };

  let inferredMonth: number | null = null;
  let inferredYear: number | null = null;

  for (const [name, num] of Object.entries(monthMap)) {
    if (sheetText.includes(name)) {
      inferredMonth = num;
      break;
    }
  }

  const yearMatch = sheetText.match(/(20\d{2}|\d{2})/);
  if (yearMatch) {
    inferredYear = Number(yearMatch[1]);
    if (inferredYear < 100) inferredYear += 2000;
  }

  return { inferredMonth, inferredYear, monthMap };
}

function parseDateWithSheetContext(value: any, sheetName = ''): Date | null {
  if (!value && value !== 0) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value).trim();
  if (!text) return null;

  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed?.y && parsed?.m && parsed?.d) {
        return new Date(parsed.y, parsed.m - 1, parsed.d);
      }
    } catch (_) {
      // ignora
    }
  }

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime()) && /\d{4}/.test(text)) return direct;

  const { inferredMonth, inferredYear, monthMap } = extractSheetMonthYear(sheetName);

  const fullBr = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (fullBr) {
    let year = Number(fullBr[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(fullBr[2]) - 1, Number(fullBr[1]));
  }

  const partialBr = text.match(/^(\d{1,2})[\/.-](\d{1,2})$/);
  if (partialBr && inferredYear) {
    return new Date(inferredYear, Number(partialBr[2]) - 1, Number(partialBr[1]));
  }

  const textual = text.match(/(\d{1,2})(?:\s*a\s*\d{1,2})?\s+de\s+([a-zç]+)(?:\s+de\s+(20\d{2}|\d{2}))?/i);
  if (textual) {
    const day = Number(textual[1]);
    const monthName = normalizeText(textual[2]);
    const month = monthMap[monthName];
    let year = textual[3] ? Number(textual[3]) : inferredYear || new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month) return new Date(year, month - 1, day);
  }

  const firstDatePeriod = text.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
  if (firstDatePeriod) {
    const day = Number(firstDatePeriod[1]);
    const month = Number(firstDatePeriod[2]);
    let year = firstDatePeriod[3] ? Number(firstDatePeriod[3]) : inferredYear || new Date().getFullYear();
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day);
  }

  if (inferredMonth && inferredYear) {
    const dayOnly = text.match(/^(\d{1,2})$/);
    if (dayOnly) {
      return new Date(inferredYear, inferredMonth - 1, Number(dayOnly[1]));
    }
  }

  return null;
}

function detectMuseum(equipamento: string, values: Record<string, any>) {
  const sourceText = `${equipamento} ${values?.local || ''} ${values?.endereco_completo || ''}`;
  const text = normalizeText(sourceText);

  if (text.includes('mhab') || text.includes('abilio barreto') || text.includes('abílio barreto')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem e do som') || text.includes('imagem e som')) return 'MIS';
  if (text.includes('mumo') || text.includes('mumu') || text.includes('museu da moda')) return 'MUMO';
  return 'Externo';
}

function summarizeActivity(values: Record<string, any>) {
  const nome = values.nome_divulgacao || values.nome || '';
  const sinopse = values.sinopse || '';
  const tipo = values.tipo_de_atividade || '';
  const formato = values.formato || '';
  const data = values.data || '';
  const horario = values.horario || '';
  const publico = values.publico_alvo || '';
  const acessibilidade = values.acessibilidade || '';
  const vagas = values.vagas || '';
  const inscricao = values.inscricao_acesso || '';
  const contato = values.contato_da_atracao || '';
  const local = values.local || '';
  const endereco = values.endereco_completo || '';
  const status = values.status || '';
  const referencia = values.pessoa_de_referencia || '';
  const contratacao = values.contratacao || '';
  const insumos = values.insumos || '';
  const fotografia = values.fotografia || '';
  const necessidades = values.outras_necessidades || '';
  const divulgacao = values.material_de_divulgacao || '';
  const servico = values.servico || '';
  const briefing = values.briefing || '';
  const classificacao = values.classificacao_indicativa || '';
  const minibios = values.minibios || '';
  const valor = values.valor || '';

  return [
    nome ? `${nome}.` : '',
    sinopse || '',
    tipo || formato ? `Trata-se de uma atividade ${[tipo, formato].filter(Boolean).join(', ')}.` : '',
    data || horario ? `A programação acontece ${[data && `em ${data}`, horario && `às ${horario}`].filter(Boolean).join(' ')}.` : '',
    local || endereco ? `Será realizada em ${[local, endereco].filter(Boolean).join(', ')}.` : '',
    publico ? `Público-alvo: ${publico}.` : '',
    acessibilidade ? `Acessibilidade: ${acessibilidade}.` : '',
    classificacao ? `Classificação indicativa: ${classificacao}.` : '',
    vagas ? `Número de vagas: ${vagas}.` : '',
    inscricao ? `Forma de inscrição ou acesso: ${inscricao}.` : '',
    contato ? `Contato da atração: ${contato}.` : '',
    referencia ? `Pessoa de referência: ${referencia}.` : '',
    valor ? `Valor informado: ${valor}.` : '',
    status ? `Status da atividade: ${status}.` : '',
    contratacao ? `Situação de contratação: ${contratacao}.` : '',
    insumos ? `Insumos previstos: ${insumos}.` : '',
    fotografia ? `Necessidade de fotografia: ${fotografia}.` : '',
    necessidades ? `Outras necessidades: ${necessidades}.` : '',
    divulgacao ? `Divulgação prevista em: ${divulgacao}.` : '',
    servico ? `Serviços relacionados: ${servico}.` : '',
    briefing ? `Briefing disponível em: ${briefing}.` : '',
    minibios ? `Minibio(s): ${minibios}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function mapHeaderKey(header: string) {
  const h = normalizeText(header);

  if (h === 'equipamento') return 'equipamento';
  if (h === 'nome' || h.includes('nome da acao') || h.includes('nome da ação')) return 'nome';
  if (h.includes('nome da programacao') || h.includes('nome da programação')) return 'nome';
  if (h.includes('nome da atividade para divulgacao') || h.includes('nome da atividade para divulgação')) return 'nome_divulgacao';
  if (h.includes('sinopse')) return 'sinopse';
  if (h.includes('tipo de atividade')) return 'tipo_de_atividade';
  if (h.includes('formato')) return 'formato';
  if (h === 'data' || h.includes('data ou periodo') || h.includes('data/periodo') || h.includes('periodo')) return 'data';
  if (h.includes('horario') || h.includes('horário') || h.includes('hora')) return 'horario';
  if (h.includes('publico-alvo') || h.includes('público-alvo') || h.includes('publico alvo')) return 'publico_alvo';
  if (h.includes('acessibilidade')) return 'acessibilidade';
  if (h.includes('classificacao indicativa') || h.includes('classificação indicativa')) return 'classificacao_indicativa';
  if (h.includes('vagas')) return 'vagas';
  if (
    h.includes('inscricao/acesso') ||
    h.includes('inscrição/acesso') ||
    h.includes('inscricao') ||
    h.includes('inscrição')
  ) return 'inscricao_acesso';
  if (h.includes('contato da atracao') || h.includes('contato da atração')) return 'contato_da_atracao';
  if (h === 'valor') return 'valor';
  if (h.includes('requisicao feita') || h.includes('requisição feita')) return 'requisicao_feita';
  if (h === 'local') return 'local';
  if (h.includes('endereco completo') || h.includes('endereço completo')) return 'endereco_completo';
  if (h === 'status') return 'status';
  if (h.includes('data de fechamento')) return 'data_de_fechamento';
  if (h.includes('pessoa de referencia') || h.includes('pessoa de referência')) return 'pessoa_de_referencia';
  if (h.includes('contratacao') || h.includes('contratação')) return 'contratacao';
  if (h.includes('insumos')) return 'insumos';
  if (h.includes('fotografia')) return 'fotografia';
  if (h.includes('outras necessidades')) return 'outras_necessidades';
  if (h.includes('link de imagens')) return 'link_imagens';
  if (h.includes('minibios')) return 'minibios';
  if (h.includes('material de divulgacao') || h.includes('material de divulgação')) return 'material_de_divulgacao';
  if (h === 'servico' || h === 'serviço') return 'servico';
  if (h.includes('briefing')) return 'briefing';

  return h.replace(/[^\w]+/g, '_');
}

function scoreHeaderRow(row: any[]) {
  const normalized = (row || []).map((cell) => normalizeText(cell)).join(' ');

  const keywords = [
    'nome',
    'atividade',
    'programacao',
    'programação',
    'data',
    'horario',
    'horário',
    'equipamento',
    'sinopse',
    'vagas',
    'inscricao',
    'inscrição',
    'local',
  ];

  return keywords.reduce((score, keyword) => {
    return score + (normalized.includes(normalizeText(keyword)) ? 1 : 0);
  }, 0);
}

function findHeaderRowIndex(matrix: any[][]) {
  const maxRows = Math.min(matrix.length, 8);
  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < maxRows; i++) {
    const score = scoreHeaderRow(matrix[i] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestScore >= 2 ? bestIndex : -1;
}

function normalizeSheet(sheetName: string, matrix: any[][], rowOffset = 0) {
  if (!Array.isArray(matrix) || !matrix.length) return [];

  const items: any[] = [];

  let headerRowIndex = -1;
  let fieldHeaders: string[] = [];

  if (matrix.length >= 3) {
    const row2 = (matrix[1] || []).map(cleanValue);
    const row3 = (matrix[2] || []).map(cleanValue);

    const isMainHeader =
      normalizeText(row2[0]) === 'equipamento' &&
      (
        normalizeText(row2[1]) === 'programacao' ||
        normalizeText(row2[1]) === 'programação'
      );

    if (isMainHeader) {
      headerRowIndex = 2;
      fieldHeaders = row3.map((h, idx) => mapHeaderKey(normalizeHeader(h, idx)));
    }
  }

  if (headerRowIndex === -1) {
    const detectedHeaderIndex = findHeaderRowIndex(matrix);
    if (detectedHeaderIndex === -1) return items;

    headerRowIndex = detectedHeaderIndex;
    fieldHeaders = (matrix[headerRowIndex] || []).map((h, idx) =>
      mapHeaderKey(normalizeHeader(h, idx))
    );
  }

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : [];
    const cleanedRow = row.map(cleanValue);
    const hasAnyValue = cleanedRow.some((v) => String(v || '').trim() !== '');
    if (!hasAnyValue) continue;

    const values: Record<string, any> = {};

    for (let c = 0; c < fieldHeaders.length; c++) {
      const key = fieldHeaders[c];
      if (!key) continue;
      values[key] = cleanValue(cleanedRow[c]);
    }

    const equipamento = cleanValue(values.equipamento || cleanedRow[0] || '');
    const nome =
      cleanValue(values.nome_divulgacao) ||
      cleanValue(values.nome) ||
      '';

    if (!nome) continue;

    const parsedDate = parseDateWithSheetContext(values.data, sheetName);
    const date = parsedDate || new Date();
    const museu = detectMuseum(equipamento, values);

    const item = {
      id: `${sheetName}-${i + rowOffset}-${nome}`,
      row_index: i + rowOffset,
      sheet_name: sheetName,
      month_label: format(date, 'MMMM yyyy', { locale: ptBR }),
      museu,
      equipamento,
      nome,
      titulo: nome,
      sinopse: values.sinopse || '',
      descricao: values.sinopse || '',
      tipo: values.tipo_de_atividade || '',
      tipo_atividade: values.tipo_de_atividade || '',
      formato: values.formato || '',
      data: values.data || '',
      data_iso: date.toISOString(),
      horario: values.horario || '',
      publico_alvo: values.publico_alvo || '',
      acessibilidade: values.acessibilidade || '',
      classificacao_indicativa: values.classificacao_indicativa || '',
      vagas: values.vagas || '',
      inscricao: values.inscricao_acesso || '',
      inscricao_acesso: values.inscricao_acesso || '',
      contato_da_atracao: values.contato_da_atracao || '',
      valor: values.valor || '',
      requisicao_feita: values.requisicao_feita || '',
      local: values.local || '',
      endereco_completo: values.endereco_completo || '',
      status: values.status || '',
      data_de_fechamento: values.data_de_fechamento || '',
      pessoa_de_referencia: values.pessoa_de_referencia || '',
      contratacao: values.contratacao || '',
      insumos: values.insumos || '',
      fotografia: values.fotografia || '',
      outras_necessidades: values.outras_necessidades || '',
      nome_divulgacao: values.nome_divulgacao || '',
      link: values.link_imagens || '',
      link_imagens: values.link_imagens || '',
      minibios: values.minibios || '',
      material_de_divulgacao: values.material_de_divulgacao || '',
      servico: values.servico || '',
      briefing: values.briefing || '',
      resumo_ia: summarizeActivity(values),
      raw: values,
      raw_values: values,
    };

    items.push(item);
  }

  return items;
}

function dedupeItems(items: any[]) {
  const seen = new Map<string, any>();

  for (const item of items || []) {
    const key = [
      normalizeText(item?.nome),
      normalizeText(item?.data),
      normalizeText(item?.horario),
      normalizeText(item?.museu),
      normalizeText(item?.local),
    ].join('|');

    if (!key.replace(/\|/g, '')) continue;

    if (!seen.has(key)) {
      seen.set(key, item);
      continue;
    }

    const prev = seen.get(key) || {};
    seen.set(key, {
      ...prev,
      ...item,
      sinopse: item.sinopse || prev.sinopse || '',
      descricao: item.descricao || prev.descricao || '',
      link_imagens: item.link_imagens || prev.link_imagens || '',
      minibios: item.minibios || prev.minibios || '',
      material_de_divulgacao: item.material_de_divulgacao || prev.material_de_divulgacao || '',
    });
  }

  return Array.from(seen.values());
}

function buildProgramacaoPayload(item: any) {
  return {
    nome: item.nome || '',
    titulo: item.titulo || item.nome || '',
    nome_acao: item.nome || '',
    data: item.data || '',
    data_inicio: item.data_iso || '',
    data_iso: item.data_iso || '',
    horario: item.horario || '',
    museu: item.museu || 'Externo',
    equipamento: item.equipamento || item.museu || 'Externo',
    local: item.local || '',
    endereco_completo: item.endereco_completo || '',
    sinopse: item.sinopse || '',
    descricao: item.descricao || '',
    tipo: item.tipo || '',
    tipo_atividade: item.tipo_atividade || item.tipo || '',
    formato: item.formato || '',
    vagas: item.vagas || '',
    inscricao: item.inscricao || '',
    link_inscricao: item.inscricao_acesso || item.inscricao || '',
    material_divulgacao: item.material_de_divulgacao || '',
    link_imagens: item.link_imagens || '',
    minibios: item.minibios || '',
    resumo_ia: item.resumo_ia || '',
    publico_alvo: item.publico_alvo || '',
    acessibilidade: item.acessibilidade || '',
    classificacao_indicativa: item.classificacao_indicativa || '',
    status: item.status || '',
    briefing: item.briefing || '',
    servico: item.servico || '',
    valor: item.valor || '',
    origem: 'syncProgramacao',
    sheet_name: item.sheet_name || '',
    month_label: item.month_label || '',
    row_index: item.row_index ?? null,
    raw_values: item.raw_values || item.raw || {},
  };
}

async function replaceProgramacao(base44: any, items: any[]) {
  const existing = await base44.entities.Programacao.list('-created_date', 5000);
  const existingList = Array.isArray(existing) ? existing : [];

  for (const record of existingList) {
    if (!record?.id) continue;
    await base44.entities.Programacao.delete(record.id);
  }

  let created = 0;
  const errors: any[] = [];

  for (const item of items) {
    try {
      const payload = buildProgramacaoPayload(item);
      await base44.entities.Programacao.create(payload);
      created++;
    } catch (error: any) {
      errors.push({
        nome: item?.nome || '',
        data: item?.data || '',
        museu: item?.museu || '',
        error: error?.message || String(error),
      });
    }
  }

  return {
    deleted_previous: existingList.length,
    created,
    errors,
  };
}

function countByMuseum(items: any[]) {
  const map: Record<string, number> = {
    MIS: 0,
    MHAB: 0,
    MUMO: 0,
    Externo: 0,
  };

  items.forEach((item) => {
    const key = item.museu || 'Externo';
    map[key] = (map[key] || 0) + 1;
  });

  return map;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = body?.args?.mode || body?.mode || 'manual';
    const nowIso = new Date().toISOString();

    const response = await fetch(XLSX_URL);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Falha ao ler planilha. HTTP ${response.status}`,
          source_url: SOURCE_URL,
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    let allItems: any[] = [];
    let runningOffset = 0;
    const debugSheets: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      try {
        const ws = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
          defval: '',
        }) as any[][];

        const items = normalizeSheet(sheetName, matrix, runningOffset);
        allItems = allItems.concat(items);

        debugSheets.push({
          sheetName,
          totalRows: Array.isArray(matrix) ? matrix.length : 0,
          eventosExtraidos: items.length,
        });

        runningOffset += items.length + 10;
      } catch (error: any) {
        debugSheets.push({
          sheetName,
          totalRows: 0,
          eventosExtraidos: 0,
          error: error?.message || String(error),
        });
      }
    }

    allItems = dedupeItems(allItems);

    const programacaoSync = await replaceProgramacao(base44, allItems);
    const countsByMuseum = countByMuseum(allItems);

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Programação sincronizada com sucesso.',
        source_url: SOURCE_URL,
        source_sheet_id: SHEET_ID,
        sheet_names: workbook.SheetNames,
        total_items: allItems.length,
        counts_by_museum: countsByMuseum,
        last_sync: nowIso,
        sync_mode: mode,
        debug_sheets: debugSheets,
        programacao_sync: programacaoSync,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Erro inesperado na sincronização.',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
});
