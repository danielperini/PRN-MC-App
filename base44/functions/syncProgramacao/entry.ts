import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';

function normalizeHeader(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeRow(headers: string[], row: any[]) {
  const obj: Record<string, any> = {};
  headers.forEach((h, i) => {
    if (!h) return;
    obj[h] = row[i];
  });
  return obj;
}

function excelDateToIso(value: any) {
  if (!value) return null;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString();
  }

  const text = String(value).trim();

  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    let year = Number(br[3]);
    if (year < 100) year += 2000;
    const month = String(Number(br[2])).padStart(2, '0');
    const day = String(Number(br[1])).padStart(2, '0');
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function detectMuseu(text = '') {
  const t = String(text || '').toLowerCase();

  if (t.includes('mis')) return 'MIS';
  if (t.includes('mhab')) return 'MHAB';
  if (t.includes('mumu') || t.includes('mumo')) return 'MUMO';

  return 'Externo';
}

function getCell(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
}

function buildMonthKey(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeProgramacao(row: Record<string, any>) {
  const titulo = String(
    getCell(row, ['nome da programacao','nome','titulo','atividade'])
  ).trim();

  const descricao = String(
    getCell(row, ['descricao','sinopse','resumo'])
  ).trim();

  const dataInicio = excelDateToIso(getCell(row, ['data','data inicio']));
  const dataFim = excelDateToIso(getCell(row, ['data fim']));

  const horario = String(getCell(row, ['horario'])).trim();
  const vagas = String(getCell(row, ['vagas'])).trim();
  const tipo = String(getCell(row, ['tipo','tipo de atividade'])).trim();

  const linkInscricao = String(
    getCell(row, ['link inscricao','inscricao','link'])
  ).trim();

  const materialDivulgacao = String(
    getCell(row, [
      'material de divulgacao aprovado',
      'material divulgação',
      'divulgacao'
    ])
  ).trim();

  const local = String(getCell(row, ['local'])).trim();
  const museu = detectMuseu(`${titulo} ${local}`);

  return {
    titulo,
    nome_acao: titulo,
    descricao,
    sinopse: descricao,
    data: dataInicio ? dataInicio.slice(0, 10) : '',
    data_inicio: dataInicio,
    data_fim: dataFim,
    horario,
    vagas,
    tipo,
    tipo_atividade: tipo,
    link_inscricao: linkInscricao,
    material_divulgacao: materialDivulgacao,
    local,
    museu,
    equipamento: museu,
    origem: 'planilha_publica',
    ativo: true,
    status: 'CONFIRMADA',
    month_key: buildMonthKey(dataInicio),
  };
}

function buildKnowledgeText(eventos: any[], sourceUrl: string) {
  const linhas = [
    'Base completa da programação dos Museus Centro (todas abas).',
    `Fonte: ${sourceUrl}`,
    '',
  ];

  for (const ev of eventos) {
    linhas.push(`Título: ${ev.titulo}`);
    linhas.push(`Museu: ${ev.museu}`);
    linhas.push(`Data: ${ev.data_inicio}`);
    linhas.push(`Horário: ${ev.horario}`);
    linhas.push(`Material divulgação: ${ev.material_divulgacao}`);
    linhas.push('---');
  }

  return linhas.join('\n');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
    const res = await fetch(url);

    const buffer = await res.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    let eventos: any[] = [];

    // 🔥 NOVO: LER TODAS AS ABAS
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (!Array.isArray(matrix) || matrix.length < 2) continue;

      const headers = (matrix[0] || []).map(normalizeHeader);
      const rows = matrix.slice(1);

      const eventosSheet = rows
        .map((row) => normalizeRow(headers, row as any[]))
        .map(normalizeProgramacao)
        .filter((e) => e.titulo && e.data_inicio);

      eventos = eventos.concat(eventosSheet);
    }

    // 🔥 remove duplicados
    const uniqueMap = new Map();
    for (const ev of eventos) {
      const key = `${ev.titulo}_${ev.data_inicio}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, ev);
    }

    eventos = Array.from(uniqueMap.values());

    const knowledgeText = buildKnowledgeText(eventos, url);

    const knowledgeDoc = await base44.asServiceRole.entities.KnowledgeDocument.create({
      title: 'Programação Museus Centro (completa)',
      extracted_text: knowledgeText,
      summary: `Eventos: ${eventos.length}`,
    });

    let processados = 0;

    for (const ev of eventos) {
      try {
        const existing = await base44.asServiceRole.entities.Programacao.filter({
          titulo: ev.titulo,
          data_inicio: ev.data_inicio,
        });

        if (existing.length) {
          await base44.asServiceRole.entities.Programacao.update(existing[0].id, ev);
        } else {
          await base44.asServiceRole.entities.Programacao.create(ev);
        }

        processados++;
      } catch {}
    }

    return Response.json({
      ok: true,
      total: eventos.length,
      processados,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
