import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '580065331';

function normalizeRow(headers: string[], row: any[]) {
  const obj: any = {};

  headers.forEach((h, i) => {
    if (!h) return;
    obj[h.toLowerCase().trim()] = row[i];
  });

  return obj;
}

function parseMuseu(nome: string = '') {
  const n = nome.toLowerCase();

  if (n.includes('mis')) return 'MIS';
  if (n.includes('mhab')) return 'MHAB';
  if (n.includes('mumu')) return 'MUMU';

  return 'OUTRO';
}

function parseData(value: any) {
  if (!value) return null;

  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d).toISOString();
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx&gid=${GID}`;

    const res = await fetch(url);
    const buffer = await res.arrayBuffer();

    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!matrix || matrix.length < 2) {
      return Response.json({ error: 'Planilha vazia' }, { status: 400 });
    }

    const headers = matrix[0];
    const rows = matrix.slice(1);

    let total = 0;

    for (const row of rows) {
      const item = normalizeRow(headers, row);

      const nome = item['nome da programação'] || item['nome'] || '';
      const data = item['data'] || item['data início'] || item['data_inicio'];

      if (!nome) continue;

      const registro = {
        nome,
        descricao: item['descrição'] || '',
        museu: parseMuseu(nome),
        data_inicio: parseData(data),
        data_fim: parseData(item['data fim'] || item['data_fim']),
        tipo: item['tipo'] || '',
        horario: item['horário'] || '',
        vagas: item['vagas'] || '',
        link_inscricao: item['link'] || '',
        origem: 'planilha',
      };

      await base44.entities.Programacao.upsert({
        unique_by: ['nome', 'data_inicio'],
        data: registro,
      });

      total++;
    }

    return Response.json({
      success: true,
      total_processado: total,
    });
  } catch (e) {
    return Response.json(
      { error: e.message || 'Erro inesperado' },
      { status: 500 }
    );
  }
});
