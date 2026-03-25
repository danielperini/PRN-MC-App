import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';
import { format } from 'npm:date-fns@2.30.0';
import { ptBR } from 'npm:date-fns@2.30.0/locale';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '580065331';

const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

function clean(v: any) {
  return String(v || '').trim();
}

function parseDate(value: any) {
  if (!value) return null;

  if (value instanceof Date) return value;

  const txt = String(value);

  const br = txt.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (br) {
    const year = new Date().getFullYear();
    return new Date(year, Number(br[2]) - 1, Number(br[1]));
  }

  const full = new Date(txt);
  if (!isNaN(full.getTime())) return full;

  return null;
}

function detectMuseum(equipamento: string) {
  const t = equipamento.toLowerCase();

  if (t.includes('mis')) return 'MIS';
  if (t.includes('mhab')) return 'MHAB';
  if (t.includes('mumo') || t.includes('mumu')) return 'MUMO';

  return 'Externo';
}

function resumoIA(v: any) {
  return `
${v.nome}. ${v.sinopse}

A atividade acontece em ${v.data} ${v.horario ? `às ${v.horario}` : ''}.
Local: ${v.local}.

Público: ${v.publico_alvo || 'não informado'}.
Vagas: ${v.vagas || 'não informado'}.

Inscrição: ${v.inscricao || 'não informado'}.

${v.minibios ? `Sobre a atração: ${v.minibios}.` : ''}

Divulgação: ${v.material || 'não informado'}.
`.replace(/\s+/g, ' ').trim();
}

function normalizeSheet(matrix: any[][]) {
  let headers: string[] = [];
  let items: any[] = [];

  matrix.forEach((row) => {
    const r = row.map(clean);

    if (r.includes('equipamento')) {
      headers = r;
      return;
    }

    if (!headers.length) return;

    const obj: any = {};

    headers.forEach((h, i) => {
      obj[h.toLowerCase()] = r[i];
    });

    if (!obj.nome || !obj.data) return;

    const date = parseDate(obj.data);

    const item = {
      id: `${obj.nome}-${obj.data}`,
      museu: detectMuseum(obj.equipamento),
      mes: date
        ? format(date, 'MMMM yyyy', { locale: ptBR })
        : 'Sem data',
      data_iso: date ? date.toISOString() : '',
      nome: obj['nome da atividade para divulgação'] || obj.nome,
      sinopse: obj.sinopse,
      data: obj.data,
      horario: obj.horário,
      vagas: obj.vagas,
      inscricao: obj['inscrição/acesso'],
      link_imagens: obj['link de imagens'],
      local: obj.local,
      publico_alvo: obj['público-alvo'],
      minibios: obj.minibios,
      material: obj['material de divulgação'],
      resumo_ia: resumoIA(obj),
      raw: obj,
    };

    items.push(item);
  });

  return items;
}

function groupByMonthAndMuseum(items: any[]) {
  const result: any = {};

  items.forEach((item) => {
    if (!result[item.mes]) result[item.mes] = {};
    if (!result[item.mes][item.museu]) result[item.mes][item.museu] = [];

    result[item.mes][item.museu].push(item);
  });

  return result;
}

Deno.serve(async (req) => {
  createClientFromRequest(req);

  try {
    const res = await fetch(XLSX_URL);
    const buffer = await res.arrayBuffer();

    const wb = XLSX.read(buffer, { type: 'array' });

    let items: any[] = [];

    wb.SheetNames.forEach((name) => {
      const ws = wb.Sheets[name];

      const matrix = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
      }) as any[][];

      items = items.concat(normalizeSheet(matrix));
    });

    const agenda = groupByMonthAndMuseum(items);

    return new Response(
      JSON.stringify({
        ok: true,
        items,
        agenda,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e.message,
      }),
      { status: 500 }
    );
  }
});
