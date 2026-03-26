import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';

const MONTHS_PT: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
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

function normalizeText(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function safeString(value: any) {
  return String(value || '').trim();
}

function normalizeHeader(value: any) {
  return normalizeText(value)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values: any[]) {
  return Array.from(
    new Set(
      (values || [])
        .map((v) => safeString(v))
        .filter(Boolean)
    )
  );
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function detectMuseu(text = '') {
  const t = normalizeText(text);

  if (t.includes('mhab')) return 'MHAB';
  if (t.includes('mis')) return 'MIS';
  if (t.includes('mumo') || t.includes('mumu')) return 'MUMO';
  if (t.includes('atuacao geral')) return 'Atuação Geral';

  return 'Externo';
}

function parseSheetMonthYear(sheetName: string) {
  const text = normalizeText(sheetName);
  const monthName = Object.keys(MONTHS_PT).find((m) => text.includes(m));
  const yearMatch = text.match(/(20\d{2}|\d{2})/);

  if (!monthName || !yearMatch) return null;

  let year = Number(yearMatch[1]);
  if (year < 100) year += 2000;

  return {
    month: MONTHS_PT[monthName],
    year,
  };
}

function buildISO(year: number, month: number, day: number) {
  if (!year || !month || !day) return null;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00.000Z`);

  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseFlexibleDateList(value: any, sheetName = '') {
  const original = safeString(value);
  if (!original) return [];

  const text = original
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const monthYear = parseSheetMonthYear(sheetName);
  const results: string[] = [];
  const seen = new Set<string>();

  const pushIso = (iso: string | null) => {
    if (!iso) return;
    const key = iso.slice(0, 10);
    if (seen.has(key)) return;
    seen.add(key);
    results.push(iso);
  };

  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    pushIso(buildISO(year, Number(match[2]), Number(match[1])));
  }

  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)) {
    const year = monthYear?.year;
    if (!year) continue;
    pushIso(buildISO(year, Number(match[2]), Number(match[1])));
  }

  for (const monthName of Object.keys(MONTHS_PT)) {
    const regex = new RegExp(`(\\d{1,2}(?:\\s*,\\s*\\d{1,2})*(?:\\s*e\\s*\\d{1,2})?)\\s+de\\s+${monthName}`, 'gi');

    for (const match of text.matchAll(regex)) {
      const days = (match[1] || '').match(/\d{1,2}/g) || [];
      const year = monthYear?.year || new Date().getUTCFullYear();
      const month = MONTHS_PT[monthName];

      for (const day of days) {
        pushIso(buildISO(year, month, Number(day)));
      }
    }
  }

  if (results.length === 0) {
    const parsed = new Date(original);
    if (!Number.isNaN(parsed.getTime())) {
      pushIso(parsed.toISOString());
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function buildMonthKey(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function groupByMuseumAndMonth(items: any[]) {
  const grouped: Record<string, Record<string, any[]>> = {};

  for (const item of items) {
    if (!item?.data_inicio) continue;

    const monthLabel = formatMonthLabel(item.data_inicio);
    const museu = item.museu || 'Externo';

    if (!grouped[monthLabel]) grouped[monthLabel] = {};
    if (!grouped[monthLabel][museu]) grouped[monthLabel][museu] = [];

    grouped[monthLabel][museu].push(item);
  }

  Object.values(grouped).forEach((museus: any) => {
    Object.values(museus).forEach((arr: any) => {
      arr.sort((a: any, b: any) => (a.data_inicio || '').localeCompare(b.data_inicio || ''));
    });
  });

  return grouped;
}

function scoreHeaderRow(rowA: any[] = [], rowB: any[] = []) {
  const headers: string[] = [];
  const max = Math.max(rowA.length, rowB.length);

  for (let i = 0; i < max; i++) {
    headers.push(normalizeHeader(`${rowA[i] || ''} ${rowB[i] || ''}`));
  }

  const joined = headers.join(' | ');
  let score = 0;

  if (joined.includes('equipamento')) score += 3;
  if (joined.includes('nome da acao')) score += 5;
  if (joined.includes('sinopse')) score += 3;
  if (joined.includes('tipo de atividade')) score += 3;
  if (joined.includes('data')) score += 5;
  if (joined.includes('horario')) score += 4;
  if (joined.includes('vagas')) score += 3;
  if (joined.includes('inscricao acesso')) score += 3;
  if (joined.includes('material de divulgacao aprovado')) score += 3;

  return { score, headers };
}

function detectHeader(matrix: any[][]) {
  let best = {
    score: -1,
    headerIndex: 0,
    dataStartIndex: 1,
    headers: [] as string[],
  };

  for (let i = 0; i < Math.min(matrix.length, 12); i++) {
    const singleHeaders = (matrix[i] || []).map(normalizeHeader);
    const singleJoined = singleHeaders.join(' | ');
    let singleScore = 0;

    if (singleJoined.includes('equipamento')) singleScore += 3;
    if (singleJoined.includes('nome da acao')) singleScore += 5;
    if (singleJoined.includes('sinopse')) singleScore += 3;
    if (singleJoined.includes('data')) singleScore += 5;
    if (singleJoined.includes('horario')) singleScore += 4;
    if (singleJoined.includes('vagas')) singleScore += 3;

    if (singleScore > best.score) {
      best = {
        score: singleScore,
        headerIndex: i,
        dataStartIndex: i + 1,
        headers: singleHeaders,
      };
    }

    if (i < matrix.length - 1) {
      const combined = scoreHeaderRow(matrix[i] || [], matrix[i + 1] || []);
      if (combined.score > best.score) {
        best = {
          score: combined.score,
          headerIndex: i,
          dataStartIndex: i + 2,
          headers: combined.headers,
        };
      }
    }
  }

  return best.score >= 8 ? best : null;
}

function rowToObject(headers: string[], row: any[]) {
  const obj: Record<string, any> = {};

  headers.forEach((header, index) => {
    if (!header) return;
    obj[header] = row[index];
  });

  return obj;
}

function getCell(row: Record<string, any>, keys: string[]) {
  const rowKeys = Object.keys(row);

  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);

    const exactMatch = rowKeys.find((k) => normalizeHeader(k) === normalizedKey);
    if (exactMatch) {
      const value = row[exactMatch];
      if (value !== undefined && value !== null && safeString(value) !== '') {
        return value;
      }
    }

    const partialMatch = rowKeys.find((k) => normalizeHeader(k).includes(normalizedKey));
    if (partialMatch) {
      const value = row[partialMatch];
      if (value !== undefined && value !== null && safeString(value) !== '') {
        return value;
      }
    }
  }

  return '';
}

function inferTitleFromRow(row: Record<string, any>) {
  const candidates = Object.values(row)
    .map((v) => safeString(v))
    .filter(Boolean)
    .filter((v) => v.length > 4);

  const best = candidates.find((v) => {
    const n = normalizeText(v);
    if (!n) return false;
    if (n.includes('programacao museus centro')) return false;
    if (n.includes('mes:')) return false;
    if (n.includes('data de fechamento')) return false;
    if (n.includes('equipamento')) return false;
    if (n.includes('nome da acao')) return false;
    return true;
  });

  return best || '';
}

function normalizeProgramacaoRows(row: Record<string, any>, sheetName: string) {
  const equipamento = safeString(getCell(row, ['equipamento']));
  const titulo =
    safeString(
      getCell(row, ['nome da acao', 'programacao nome da acao', 'programacao', 'nome'])
    ) || inferTitleFromRow(row);

  const descricao = safeString(getCell(row, ['sinopse', 'descricao', 'descrição', 'resumo']));
  const tipo = safeString(getCell(row, ['tipo de atividade', 'tipo']));
  const formato = safeString(getCell(row, ['formato']));
  const dataRaw = getCell(row, ['data']);
  const horario = safeString(getCell(row, ['horario']));
  const publico = safeString(getCell(row, ['publico alvo', 'público alvo']));
  const acessibilidade = safeString(getCell(row, ['acessibilidade']));
  const classificacao = safeString(
    getCell(row, ['classificacao indicativa', 'classificação indicativa'])
  );
  const vagas = safeString(getCell(row, ['vagas']));
  const inscricao = safeString(
    getCell(row, ['inscricao acesso', 'inscricao', 'link inscricao', 'link inscrição', 'link'])
  );
  const linkImagens = safeString(getCell(row, ['link de imagens', 'link imagens']));
  const minibios = safeString(getCell(row, ['minibios', 'mini bios', 'minibio']));
  const materialDivulgacao = safeString(
    getCell(row, ['material de divulgacao aprovado', 'material divulgacao aprovado'])
  );
  const observacoes = safeString(getCell(row, ['observacoes', 'observações']));
  const local = safeString(getCell(row, ['local'])) || equipamento;
  const museu = detectMuseu(`${equipamento} ${titulo} ${local}`);
  const datas = parseFlexibleDateList(dataRaw, sheetName);

  if (!titulo) {
    return [];
  }

  const datasFinais = datas.length > 0 ? datas : [new Date().toISOString()];

  return datasFinais.map((iso) => ({
    titulo,
    nome_acao: titulo,
    descricao,
    sinopse: descricao,
    data: iso.slice(0, 10),
    data_inicio: iso,
    data_fim: null,
    horario,
    vagas,
    inscricao,
    link_inscricao: inscricao,
    material_divulgacao: materialDivulgacao,
    link_imagens: linkImagens,
    minibios,
    observacoes,
    tipo,
    tipo_atividade: tipo,
    formato,
    publico_alvo: publico,
    acessibilidade,
    classificacao_indicativa: classificacao,
    local,
    museu,
    equipamento: equipamento || museu,
    origem: 'planilha_publica',
    ativo: true,
    status: 'CONFIRMADA',
    month_key: buildMonthKey(iso),
    aba_origem: sheetName,
  }));
}

function buildKnowledgeText(eventos: any[], sourceUrl: string) {
  const lines = [
    'Base espelhada da programação pública dos Museus Centro.',
    `Fonte: ${sourceUrl}`,
    `Total de eventos: ${eventos.length}`,
    '',
  ];

  for (const ev of eventos) {
    lines.push(`Título: ${ev.titulo}`);
    lines.push(`Museu: ${ev.museu}`);
    lines.push(`Aba: ${ev.aba_origem || ''}`);
    lines.push(`Data: ${ev.data_inicio || ''}`);
    lines.push(`Horário: ${ev.horario || ''}`);
    lines.push(`Vagas: ${ev.vagas || ''}`);
    lines.push(`Inscrição: ${ev.link_inscricao || ''}`);
    lines.push(`Material de divulgação: ${ev.material_divulgacao || ''}`);
    lines.push(`Descrição: ${ev.descricao || ''}`);
    lines.push('---');
  }

  return lines.join('\n');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const sourceUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
    const response = await fetch(sourceUrl);

    if (!response.ok) {
      return Response.json(
        { ok: false, error: `Falha ao baixar planilha pública: ${response.status}` },
        { status: 502 }
      );
    }

    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const contentBase64 = toBase64(buffer);

    const eventosBrutos: any[] = [];
    const debugSheets: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false,
      }) as any[][];

      if (!Array.isArray(matrix) || matrix.length < 2) {
        debugSheets.push({
          sheetName,
          ignored: true,
          reason: 'aba_sem_dados_suficientes',
        });
        continue;
      }

      const detectedHeader = detectHeader(matrix);
      const headerInfo = detectedHeader || {
        score: 0,
        headerIndex: 0,
        dataStartIndex: 1,
        headers: (matrix[0] || []).map(normalizeHeader),
      };

      const rows = matrix.slice(headerInfo.dataStartIndex);
      let eventosSheet = 0;
      let rowsValidas = 0;

      for (const row of rows) {
        const nonEmptyCount = (row || []).filter((cell) => safeString(cell) !== '').length;
        if (nonEmptyCount < 2) continue;

        rowsValidas++;
        const rowObject = rowToObject(headerInfo.headers, row as any[]);
        const eventos = normalizeProgramacaoRows(rowObject, sheetName);

        if (eventos.length > 0) {
          eventosBrutos.push(...eventos);
          eventosSheet += eventos.length;
        }
      }

      debugSheets.push({
        sheetName,
        headerDetected: Boolean(detectedHeader),
        headerIndex: headerInfo.headerIndex,
        dataStartIndex: headerInfo.dataStartIndex,
        headers: headerInfo.headers,
        totalRows: matrix.length,
        rowsValidas,
        eventosExtraidos: eventosSheet,
      });
    }

    const uniqueMap = new Map<string, any>();

    for (const ev of eventosBrutos) {
      const key = [ev.titulo, ev.data_inicio, ev.museu, ev.aba_origem].join('|');
      if (!uniqueMap.has(key)) uniqueMap.set(key, ev);
    }

    const eventos = Array.from(uniqueMap.values()).sort((a, b) =>
      `${a.data_inicio}|${a.titulo}`.localeCompare(`${b.data_inicio}|${b.titulo}`)
    );

    if (eventos.length === 0) {
      return Response.json(
        {
          ok: false,
          error: 'Nenhum evento válido foi encontrado na planilha.',
          sheets_lidas: workbook.SheetNames,
          debug_sheets: debugSheets,
        },
        { status: 400 }
      );
    }

    const upload = await base44.storage.upload({
      file_name: `programacao_museus_centro_${new Date().toISOString().slice(0, 10)}.xlsx`,
      content_base64: contentBase64,
    });

    const fileUrl = upload?.file_url || upload?.url || '';

    if (!fileUrl) {
      return Response.json(
        {
          ok: false,
          error: 'Falha ao salvar planilha no storage.',
          debug_sheets: debugSheets,
        },
        { status: 500 }
      );
    }

    const knowledgeTitle = 'Base IA Segmentada - Programação Museus Centro';
    const knowledgeText = buildKnowledgeText(eventos, sourceUrl);

    const existingDocs = await base44.asServiceRole.entities.KnowledgeDocument.filter(
      { title: knowledgeTitle },
      '-updated_date',
      10
    );

    let knowledgeDoc: any;

    const knowledgePayload = {
      title: knowledgeTitle,
      name: knowledgeTitle,
      file_name: `programacao_museus_centro_${new Date().toISOString().slice(0, 10)}.xlsx`,
      file_url: fileUrl,
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      categoria: 'Programação',
      descricao: 'Espelho da planilha pública de programação dos Museus Centro.',
      tags: uniqueStrings(['programacao', 'agenda', 'museus', 'planilha_publica']),
      processing_status: 'processado',
      status: 'processado',
      summary: `Base pública sincronizada com ${eventos.length} eventos.`,
      extracted_text: knowledgeText,
      analysis: JSON.stringify({
        source_url: sourceUrl,
        total_eventos: eventos.length,
        abas_lidas: workbook.SheetNames,
        debug_sheets: debugSheets,
        synced_at: new Date().toISOString(),
      }),
    };

    if (Array.isArray(existingDocs) && existingDocs.length > 0) {
      knowledgeDoc = await base44.asServiceRole.entities.KnowledgeDocument.update(
        existingDocs[0].id,
        knowledgePayload
      );
    } else {
      knowledgeDoc = await base44.asServiceRole.entities.KnowledgeDocument.create(knowledgePayload);
    }

    let processados = 0;
    let erros = 0;

    for (const ev of eventos) {
      const payload = {
        ...ev,
        knowledge_document_id: knowledgeDoc?.id || '',
        storage_file_url: fileUrl,
        sync_source_url: sourceUrl,
        updated_at: new Date().toISOString(),
      };

      try {
        const existing = await base44.asServiceRole.entities.Programacao.filter(
          {
            titulo: ev.titulo,
            data_inicio: ev.data_inicio,
            museu: ev.museu,
          },
          '-updated_date',
          5
        );

        if (Array.isArray(existing) && existing.length > 0) {
          await base44.asServiceRole.entities.Programacao.update(existing[0].id, payload);
        } else {
          await base44.asServiceRole.entities.Programacao.create(payload);
        }

        processados++;
      } catch (error) {
        console.error('Erro ao sincronizar evento:', ev?.titulo, ev?.data_inicio, error);
        erros++;
      }
    }

    return Response.json({
      ok: true,
      synced: true,
      total_eventos: eventos.length,
      total_processados: processados,
      total_erros: erros,
      source_url: sourceUrl,
      storage_file_url: fileUrl,
      knowledge_document_id: knowledgeDoc?.id || '',
      items: eventos,
      grouped_by_museum_and_month: groupByMuseumAndMonth(eventos),
      sheets_lidas: workbook.SheetNames,
      debug_sheets: debugSheets,
      message: 'Programação sincronizada com sucesso.',
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro inesperado ao sincronizar programação.',
      },
      { status: 500 }
    );
  }
});
