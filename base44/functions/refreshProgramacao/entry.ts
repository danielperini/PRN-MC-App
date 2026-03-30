import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import * as XLSX from 'npm:xlsx@0.18.5';

const MONTHS = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  março: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

function parseSheetName(sheetName) {
  if (!sheetName) return null;

  const normalized = sheetName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = normalized.split(' ');

  let month = null;
  let year = null;

  for (const part of parts) {
    if (MONTHS[part] !== undefined) {
      month = MONTHS[part];
    }

    if (/^\d{4}$/.test(part)) {
      year = parseInt(part);
    }

    if (/^\d{2}$/.test(part)) {
      const y = parseInt(part);
      year = y < 50 ? 2000 + y : 1900 + y;
    }
  }

  if (month === null || year === null) return null;

  return { month, year };
}

function parseExcelDate(value, sheetYear, sheetMonth) {
  if (!value) return null;

  if (typeof value === 'number') {
    try {
      const date = XLSX.SSF.parse_date_code(value);
      if (!date) return null;
      let year = date.y;
      if (sheetYear && year !== sheetYear) year = sheetYear;
      return new Date(year, date.m - 1, date.d);
    } catch (_) {
      return null;
    }
  }

  if (typeof value === 'string') {
    const clean = value.trim();
    const parts = clean.split(/[\/\-]/);

    if (parts.length === 3) {
      let d = parseInt(parts[0]);
      let m = parseInt(parts[1]);
      let y = parseInt(parts[2]);

      if (y < 100) y = y < 50 ? 2000 + y : 1900 + y;
      if (sheetYear && y !== sheetYear) y = sheetYear;

      return new Date(y, m - 1, d);
    }

    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      if (sheetYear && parsed.getFullYear() !== sheetYear) {
        parsed.setFullYear(sheetYear);
      }
      return parsed;
    }
  }

  return null;
}

function findHeaderRow(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const row = matrix[i];
    if (!row) continue;
    const joined = row.join(' ').toLowerCase();
    if (joined.includes('data') || joined.includes('nome') || joined.includes('atividade')) {
      return i;
    }
  }
  return -1;
}

function normalizeHeaders(row) {
  return row.map((h) =>
    String(h || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, '_')
  );
}

function normalizeRow(row, headers) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}

function toStr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return String(v).trim();
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { source_url } = body;

    if (!source_url) {
      return Response.json({ error: 'source_url obrigatório' }, { status: 400 });
    }

    // Resolve Google Sheets export URL
    let fetchUrl = source_url;
    const sheetIdMatch = source_url.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
    if (sheetIdMatch && !source_url.includes('/export?')) {
      fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetIdMatch[1]}/export?format=xlsx`;
    }

    const fileRes = await fetch(fetchUrl);
    if (!fileRes.ok) {
      return Response.json({ error: `Falha ao baixar planilha: HTTP ${fileRes.status}` }, { status: 500 });
    }

    const buffer = await fileRes.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

    let total_items = 0;
    let created = 0;
    const errors = [];
    const debug_sheets = [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    for (const sheetName of workbook.SheetNames) {
      const parsed = parseSheetName(sheetName);

      if (!parsed) {
        debug_sheets.push({ sheet: sheetName, skipped: true, reason: 'nome não reconhecido como mês/ano' });
        continue;
      }

      // Skip future months
      if (
        parsed.year > currentYear ||
        (parsed.year === currentYear && parsed.month > currentMonth)
      ) {
        debug_sheets.push({ sheet: sheetName, skipped: true, reason: 'mês futuro, ignorado' });
        continue;
      }

      const { month, year } = parsed;
      const sync_month = `${year}-${String(month + 1).padStart(2, '0')}`;

      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

      const headerIndex = findHeaderRow(matrix);
      if (headerIndex === -1) {
        debug_sheets.push({ sheet: sheetName, skipped: true, reason: 'cabeçalho não encontrado' });
        continue;
      }

      const headers = normalizeHeaders(matrix[headerIndex]);
      const rows = matrix.slice(headerIndex + 1);

      let sheetCreated = 0;

      for (const row of rows) {
        if (!row || row.every(c => !c)) continue;

        total_items++;

        try {
          const data = normalizeRow(row, headers);

          const nome =
            data['nome'] ||
            data['atividade'] ||
            data['titulo'] ||
            data['programacao'] ||
            data['nome_da_programacao'] ||
            data['nome_da_atividade'];

          if (!nome || String(nome).trim() === '') continue;

          const dataRaw =
            data['data'] ||
            data['data_da_atividade'] ||
            data['data_inicio'] ||
            data['periodo'];

          const parsedDate = parseExcelDate(dataRaw, year, month);

          const record = {
            titulo: toStr(nome),
            nome_acao: toStr(nome),
            sinopse: toStr(data['sinopse'] || data['descricao'] || data['descricao_da_atividade']),
            tipo: toStr(data['tipo'] || data['tipo_de_atividade']),
            horario: toStr(data['horario'] || data['hora']),
            local: toStr(data['local'] || data['espaco']),
            museu: toStr(data['equipamento'] || data['museu'] || data['unidade']),
            equipamento: toStr(data['equipamento'] || data['museu']),
            publico_alvo: toStr(data['publico'] || data['publico_alvo'] || data['faixa_etaria']),
            vagas: toStr(data['vagas']),
            inscricao: toStr(data['inscricao'] || data['inscricao_acesso']),
            link_inscricao: toStr(data['link'] || data['link_inscricao']),
            acessibilidade: toStr(data['acessibilidade']),
            minibios: toStr(data['minibios'] || data['minibio']),
            link_imagens: toStr(data['link_de_imagens'] || data['link_imagens'] || data['imagens']),
            material_divulgacao_aprovado: toStr(data['material_de_divulgacao_aprovado'] || data['material_aprovado']),
            data: parsedDate ? parsedDate.toISOString().slice(0, 10) : null,
            data_inicio: parsedDate ? parsedDate.toISOString() : null,
            sync_month,
            month_key: sync_month,
            origem: 'syncProgramacao',
            status: 'CONFIRMADA',
            ativo: true,
          };

          // Rate limit: small delay every 5 records
          if (created > 0 && created % 5 === 0) await sleep(300);

          await base44.asServiceRole.entities.Programacao.create(record);

          created++;
          sheetCreated++;
        } catch (err) {
          errors.push({ sheet: sheetName, error: String(err) });
        }
      }

      debug_sheets.push({ sheet: sheetName, parsed: { month: month + 1, year }, sync_month, inserted: sheetCreated });
    }

    return Response.json({ ok: true, total_items, created, errors, debug_sheets });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});