import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@3.6.0';
import { ptBR } from 'npm:date-fns@3.6.0/locale/pt-BR';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '580065331';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${GID}#gid=${GID}`;
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

const MIRROR_SLUG = 'base-conhecimento-ia-google-sheet';
const MIRROR_TITLE = 'Biblioteca de Conhecimento IA';
const MIRROR_FOLDER = 'Biblioteca do Conhecimento';

const MIRROR_DOC_TITLE = 'Programação Agenda Completa';
const MIRROR_TABLE_DOC_TITLE = 'Programação Espelho Estruturada';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function cleanValue(value) {
  if (value === null || value === undefined) return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return String(value).trim();
}

function normalizeHeader(value, index) {
  const clean = cleanValue(value);
  return clean || `coluna_${index + 1}`;
}

function formatDateBR(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return format(date, 'dd/MM/yyyy');
}

function safeIso(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function extractSheetMonthYear(sheetName = '') {
  const sheetText = normalizeText(sheetName);

  const monthMap = {
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

  let inferredMonth = null;
  let inferredYear = null;

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

function parseDateWithSheetContext(value, sheetName = '') {
  if (!value && value !== 0) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed?.y && parsed?.m && parsed?.d) {
        return new Date(parsed.y, parsed.m - 1, parsed.d);
      }
    } catch (_) {}
  }

  const text = String(value).trim();
  if (!text) return null;

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

function fallbackDateFromSheetName(sheetName = '') {
  const { inferredMonth, inferredYear } = extractSheetMonthYear(sheetName);
  if (!inferredMonth || !inferredYear) return null;
  return new Date(inferredYear, inferredMonth - 1, 1);
}

function detectMuseum(equipamento, values) {
  const sourceText = `${equipamento} ${values?.local || ''} ${values?.endereco_completo || ''}`;
  const text = normalizeText(sourceText);

  if (text.includes('mhab') || text.includes('abilio barreto') || text.includes('abílio barreto')) return 'MHAB';
  if (text.includes('mis') || text.includes('imagem e do som') || text.includes('imagem e som')) return 'MIS';
  if (text.includes('mumo') || text.includes('mumu') || text.includes('museu da moda')) return 'MUMO';
  return 'Externo';
}

function summarizeActivity(values) {
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

function mapHeaderKey(header) {
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

  return h
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function scoreHeaderRow(row) {
  const normalized = row.map((cell) => normalizeText(cell)).join(' | ');

  const keywords = [
    'nome', 'programacao', 'programação', 'data', 'horario', 'horário',
    'equipamento', 'sinopse', 'vagas', 'inscricao', 'inscrição', 'local',
  ];

  return keywords.reduce((score, keyword) => {
    return score + (normalized.includes(normalizeText(keyword)) ? 1 : 0);
  }, 0);
}

function findHeaderRowIndex(matrix) {
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

function normalizeSheet(sheetName, matrix, rowOffset = 0) {
  if (!Array.isArray(matrix) || !matrix.length) return [];

  const items = [];
  let headerRowIndex = -1;
  let fieldHeaders = [];

  if (matrix.length >= 3) {
    const row2 = (matrix[1] || []).map(cleanValue);
    const row3 = (matrix[2] || []).map(cleanValue);

    const isMainHeader =
      normalizeText(row2[0]) === 'equipamento' &&
      (normalizeText(row2[1]) === 'programacao' || normalizeText(row2[1]) === 'programação');

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

  let lastValidDate = null;
  const sheetFallbackDate = fallbackDateFromSheetName(sheetName);

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = Array.isArray(matrix[i]) ? matrix[i] : [];
    const cleanedRow = row.map(cleanValue);
    const hasAnyValue = cleanedRow.some((v) => String(v || '').trim() !== '');
    if (!hasAnyValue) continue;

    const values = {};

    for (let c = 0; c < fieldHeaders.length; c++) {
      const key = fieldHeaders[c];
      if (!key) continue;
      values[key] = cleanValue(cleanedRow[c]);
    }

    const equipamento = cleanValue(values.equipamento || cleanedRow[0] || '');
    const nome = cleanValue(values.nome_divulgacao) || cleanValue(values.nome) || '';

    if (!nome) continue;

    const parsedDate = parseDateWithSheetContext(values.data, sheetName);
    const effectiveDate = parsedDate || lastValidDate || sheetFallbackDate;
    const museu = detectMuseum(equipamento, values);

    if (parsedDate) {
      lastValidDate = parsedDate;
    }

    const dataTextoOriginal = cleanValue(values.data || '');
    const dataTexto = dataTextoOriginal || formatDateBR(effectiveDate);
    const dataIso = safeIso(effectiveDate);
    const monthLabel = effectiveDate
      ? format(effectiveDate, 'MMMM yyyy', { locale: ptBR })
      : 'sem data';

    const item = {
      id: `${sheetName}-${i + rowOffset}-${nome}`,
      row_index: i + rowOffset,
      sheet_name: sheetName,
      month_label: monthLabel,
      museu,
      equipamento,
      nome,
      titulo: nome,
      sinopse: values.sinopse || '',
      descricao: values.sinopse || '',
      tipo: values.tipo_de_atividade || '',
      tipo_atividade: values.tipo_de_atividade || '',
      formato: values.formato || '',
      data: dataTexto,
      data_original: dataTextoOriginal,
      data_inferida: !dataTextoOriginal && !!effectiveDate,
      data_iso: dataIso,
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
      resumo_ia: summarizeActivity({ ...values, data: dataTexto }),
      raw: values,
      raw_values: values,
    };

    items.push(item);
  }

  return items;
}

function getMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function extractMonthKeyFromValue(value) {
  const text = String(value || '').trim();

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(Number(br[2])).padStart(2, '0')}`;
  }

  return '';
}

function buildAgenda(items) {
  const agenda = {};

  items.forEach((item) => {
    if (!item?.data_iso) return;
    const date = new Date(item.data_iso);
    if (Number.isNaN(date.getTime())) return;

    const monthLabel = format(date, 'MMMM yyyy', { locale: ptBR });
    const museu = item.museu || 'Externo';

    if (!agenda[monthLabel]) agenda[monthLabel] = {};
    if (!agenda[monthLabel][museu]) agenda[monthLabel][museu] = [];
    agenda[monthLabel][museu].push(item);
  });

  Object.values(agenda).forEach((museus) => {
    Object.values(museus).forEach((arr) => {
      arr.sort((a, b) => new Date(a.data_iso).getTime() - new Date(b.data_iso).getTime());
    });
  });

  return agenda;
}

function groupByMuseumAndMonth(items) {
  const map = { MIS: {}, MHAB: {}, MUMO: {}, Externo: {}, Todos: {} };

  items.forEach((item) => {
    if (!item.data_iso) return;
    const date = new Date(item.data_iso);
    if (Number.isNaN(date.getTime())) return;

    const monthKey = getMonthKey(date);
    const museu = item.museu || 'Externo';

    if (!map[museu]) map[museu] = {};
    if (!map[museu][monthKey]) map[museu][monthKey] = [];
    if (!map.Todos[monthKey]) map.Todos[monthKey] = [];

    map[museu][monthKey].push(item);
    map.Todos[monthKey].push(item);
  });

  return map;
}

function countByMuseum(items) {
  const map = { MIS: 0, MHAB: 0, MUMO: 0, Externo: 0 };
  items.forEach((item) => {
    const key = item.museu || 'Externo';
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function dedupeItems(items) {
  const seen = new Map();

  for (const item of items || []) {
    const key = [
      normalizeText(item?.nome),
      normalizeText(item?.data || item?.data_iso),
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
      data: item.data || prev.data || '',
      data_iso: item.data_iso || prev.data_iso || '',
    });
  }

  return Array.from(seen.values());
}

function sanitizeProgramacaoString(value) {
  return String(value || '').trim();
}

function buildProgramacaoPayload(item) {
  const nome = sanitizeProgramacaoString(item.nome || item.titulo || '');
  const dataInicio = sanitizeProgramacaoString(item.data_iso || '');
  const data =
    sanitizeProgramacaoString(item.data || '') ||
    (dataInicio ? formatDateBR(new Date(dataInicio)) : '');

  const museu = sanitizeProgramacaoString(item.museu || item.equipamento || 'Externo') || 'Externo';
  const horario = sanitizeProgramacaoString(item.horario || '');
  const vagas = sanitizeProgramacaoString(item.vagas || '');
  const inscricao = sanitizeProgramacaoString(item.inscricao_acesso || item.inscricao || '');
  const descricao = sanitizeProgramacaoString(item.sinopse || item.descricao || '');
  const linkImagens = sanitizeProgramacaoString(item.link_imagens || item.link || '');
  const tipo = sanitizeProgramacaoString(item.tipo_atividade || item.tipo || '');
  const local = sanitizeProgramacaoString(item.local || '');
  const endereco = sanitizeProgramacaoString(item.endereco_completo || item.endereco || '');
  const monthKey =
    extractMonthKeyFromValue(data) ||
    extractMonthKeyFromValue(dataInicio) ||
    (dataInicio ? getMonthKey(new Date(dataInicio)) : '');

  return {
    nome_acao: nome,
    titulo: nome,
    data,
    data_inicio: dataInicio || null,
    horario,
    museu,
    equipamento: museu,
    vagas,
    inscricao,
    link_inscricao: inscricao,
    descricao,
    sinopse: descricao,
    link_imagens: linkImagens,
    tipo,
    tipo_atividade: tipo,
    local,
    endereco,
    origem: 'syncBaseConhecimento',
    ativo: true,
    status: 'CONFIRMADA',
    month_key: monthKey,
    updated_at: new Date().toISOString(),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableKey(item) {
  return [
    normalizeText(item.nome || item.titulo || item.nome_acao || ''),
    normalizeText(item.data || item.data_inicio || item.data_iso || ''),
    normalizeText(item.museu || item.equipamento || ''),
    normalizeText(item.horario || ''),
    normalizeText(item.local || ''),
  ].join('|');
}

async function upsertProgramacao(base44, items) {
  const existing = await base44.entities.Programacao.list('-created_date', 5000);
  const existingList = Array.isArray(existing) ? existing : [];

  const existingMap = new Map();
  for (const rec of existingList) {
    const k = stableKey(rec);
    existingMap.set(k, rec);
  }

  const newKeys = new Set(items.map(stableKey));

  const toDelete = [];
  for (const [k, rec] of existingMap.entries()) {
    if (!newKeys.has(k) && rec?.id) toDelete.push(rec.id);
  }

  let deleted = 0;
  for (const id of toDelete) {
    try {
      await base44.entities.Programacao.delete(id);
      deleted++;
      await sleep(150);
    } catch (_) {}
  }

  const toCreate = [];
  const toUpdate = [];
  const errors = [];

  for (const item of items) {
    const payload = buildProgramacaoPayload(item);
    if (!payload.titulo || !payload.data) {
      errors.push({
        nome: item?.nome || '',
        data: item?.data || '',
        museu: item?.museu || '',
        error: 'Registro ignorado por falta de título ou data.',
      });
      continue;
    }

    const k = stableKey(item);
    if (existingMap.has(k)) {
      toUpdate.push({ id: existingMap.get(k).id, payload });
    } else {
      toCreate.push(payload);
    }
  }

  let created = 0;
  const BATCH = 50;

  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    try {
      await base44.entities.Programacao.bulkCreate(batch);
      created += batch.length;
      await sleep(400);
    } catch (err) {
      if (String(err?.message || '').includes('429') || String(err?.message || '').includes('Rate limit')) {
        await sleep(3000);
        try {
          await base44.entities.Programacao.bulkCreate(batch);
          created += batch.length;
        } catch (retryErr) {
          errors.push({ etapa: `bulkCreate lote ${i}-${i + BATCH}`, error: retryErr?.message || String(retryErr) });
        }
      } else {
        errors.push({ etapa: `bulkCreate lote ${i}-${i + BATCH}`, error: err?.message || String(err) });
      }
    }
  }

  let updated = 0;
  for (const { id, payload } of toUpdate) {
    try {
      await base44.entities.Programacao.update(id, payload);
      updated++;
      await sleep(400);
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
        await sleep(5000);
        try {
          await base44.entities.Programacao.update(id, payload);
          updated++;
          await sleep(400);
        } catch (retryErr) {
          errors.push({ error: retryErr?.message || String(retryErr) });
        }
      } else {
        errors.push({ error: err?.message || String(err) });
      }
    }
  }

  return { deleted, created, updated, errors, total_existing: existingList.length };
}

async function upsertKnowledgeDocument(base44, titulo, docData) {
  const existing = await base44.entities.KnowledgeDocument.filter({ titulo });
  const doc = Array.isArray(existing) ? existing[0] : null;

  if (doc?.id) {
    await base44.entities.KnowledgeDocument.update(doc.id, docData);
  } else {
    await base44.entities.KnowledgeDocument.create(docData);
  }
}

async function saveAgendaToKnowledge(base44, items, nowIso) {
  const byMonth = {};

  for (const item of items) {
    const label = item.month_label || 'sem data';
    if (!byMonth[label]) byMonth[label] = [];
    byMonth[label].push(item);
  }

  const sections = [];
  for (const [month, monthItems] of Object.entries(byMonth)) {
    sections.push(`=== ${month.toUpperCase()} ===`);
    for (const item of monthItems) {
      sections.push(item.resumo_ia || item.nome || '');
    }
  }

  const conteudo =
    `PROGRAMAÇÃO COMPLETA DOS MUSEUS\nAtualizado em: ${nowIso}\nTotal de atividades: ${items.length}\n\n` +
    sections.join('\n---\n');

  const docData = {
    titulo: MIRROR_DOC_TITLE,
    categoria: 'Programação',
    versao: nowIso,
    descricao: `Agenda completa sincronizada da planilha de programação. ${items.length} atividades cadastradas (passadas, atuais e futuras).`,
    conteudo_extraido: conteudo,
    file_name: 'programacao-agenda.txt',
    ativo: true,
  };

  await upsertKnowledgeDocument(base44, MIRROR_DOC_TITLE, docData);
}

function buildMirrorTableContent(items, nowIso) {
  const lines = [];

  lines.push(`# Programação Espelho Estruturada`);
  lines.push(`Atualizado em: ${nowIso}`);
  lines.push(`Total de atividades: ${items.length}`);
  lines.push('');
  lines.push('| Museu | Data | Horário | Nome | Público-alvo | Vagas | Inscrição |');
  lines.push('|---|---|---|---|---|---|---|');

  for (const item of items) {
    const row = [
      item.museu || '',
      item.data || '',
      item.horario || '',
      String(item.nome || '').replace(/\|/g, '/'),
      String(item.publico_alvo || '').replace(/\|/g, '/'),
      String(item.vagas || '').replace(/\|/g, '/'),
      String(item.inscricao_acesso || item.inscricao || '').replace(/\|/g, '/'),
    ];
    lines.push(`| ${row.join(' | ')} |`);
  }

  lines.push('');
  lines.push('## JSON espelho');
  lines.push('```json');
  lines.push(JSON.stringify(
    items.map((item) => ({
      museu: item.museu || '',
      data: item.data || '',
      data_iso: item.data_iso || '',
      horario: item.horario || '',
      nome: item.nome || '',
      sinopse: item.sinopse || '',
      publico_alvo: item.publico_alvo || '',
      vagas: item.vagas || '',
      inscricao_acesso: item.inscricao_acesso || item.inscricao || '',
      local: item.local || '',
      tipo_atividade: item.tipo_atividade || item.tipo || '',
      link_imagens: item.link_imagens || item.link || '',
      data_inferida: !!item.data_inferida,
      sheet_name: item.sheet_name || '',
      row_index: item.row_index ?? null,
    })),
    null,
    2
  ));
  lines.push('```');

  return lines.join('\n');
}

async function saveMirrorTableToKnowledge(base44, items, nowIso) {
  const content = buildMirrorTableContent(items, nowIso);

  const docData = {
    titulo: MIRROR_TABLE_DOC_TITLE,
    categoria: 'Programação',
    versao: nowIso,
    descricao: `Tabela espelho estruturada da programação com ${items.length} registros. Campos: museu, data, horário, nome da ação, sinopse, público-alvo, vagas, inscrição.`,
    conteudo_extraido: content,
    file_name: 'programacao-espelho-estruturada.md',
    ativo: true,
  };

  await upsertKnowledgeDocument(base44, MIRROR_TABLE_DOC_TITLE, docData);
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
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    let allItems = [];
    let runningOffset = 0;

    workbook.SheetNames.forEach((sheetName) => {
      const ws = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const items = normalizeSheet(sheetName, matrix, runningOffset);
      allItems = allItems.concat(items);
      runningOffset += items.length + 10;
    });

    allItems = dedupeItems(allItems);

    const agenda = buildAgenda(allItems);
    const groupedByMuseumAndMonth = groupByMuseumAndMonth(allItems);
    const countsByMuseum = countByMuseum(allItems);

    let programacaoSync = { deleted: 0, created: 0, updated: 0, errors: [] };

    try {
      programacaoSync = await upsertProgramacao(base44, allItems);
    } catch (error) {
      programacaoSync = {
        deleted: 0,
        created: 0,
        updated: 0,
        errors: [{ etapa: 'upsertProgramacao', error: error?.message || String(error) }],
      };
    }

    try {
      await saveAgendaToKnowledge(base44, allItems, nowIso);
    } catch (_) {}

    try {
      await saveMirrorTableToKnowledge(base44, allItems, nowIso);
    } catch (_) {}

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Base carregada com sucesso a partir da planilha de programação.',
        slug: MIRROR_SLUG,
        titulo: MIRROR_TITLE,
        pasta: MIRROR_FOLDER,
        tipo: 'google_sheet_runtime',
        origem: 'google_sheets_xlsx',
        source_url: SOURCE_URL,
        source_sheet_id: SHEET_ID,
        source_gid: GID,
        sheet_names: workbook.SheetNames,
        items: allItems,
        total_items: allItems.length,
        agenda,
        grouped_by_museum_and_month: groupedByMuseumAndMonth,
        counts_by_museum: countsByMuseum,
        last_sync: nowIso,
        sync_mode: mode,
        programacao_sync: programacaoSync,
        mirror_documents: [MIRROR_DOC_TITLE, MIRROR_TABLE_DOC_TITLE],
        changes_summary: {
          criados: programacaoSync.created || 0,
          atualizados: programacaoSync.updated || 0,
          deletados: programacaoSync.deleted || 0,
          erros: (programacaoSync.errors || []).length,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Erro inesperado na sincronização.',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
});