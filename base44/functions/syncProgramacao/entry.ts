import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

function safeString(v: any) {
  return String(v || '').trim();
}

function parseDate(value: any) {
  if (!value) return null;

  if (value instanceof Date) return value;

  if (typeof value === 'number') {
    return XLSX.SSF.parse_date_code(value);
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Não autenticado' }, { status: 401 });
    }

    // 1. pegar último arquivo de programação
    const docs = await base44.entities.KnowledgeDocument.filter({
      categoria: 'Programação',
    });

    if (!docs || docs.length === 0) {
      return Response.json({
        ok: false,
        error: 'Nenhum arquivo de programação encontrado',
      });
    }

    const latest = docs.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];

    // 2. baixar arquivo
    const fileResponse = await fetch(latest.file_url);
    const arrayBuffer = await fileResponse.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet);

    let created = 0;

    for (const row of rows as any[]) {
      const titulo =
        safeString(row['nome da programação']) ||
        safeString(row['atividade']) ||
        safeString(row['titulo']);

      if (!titulo) continue;

      const dataRaw = row['data'] || row['Data'] || row['DATA'];
      const data = parseDate(dataRaw);

      const museu =
        safeString(row['museu']) ||
        safeString(row['local']) ||
        'Museus Centro';

      await base44.asServiceRole.entities.Activity.create({
        title: titulo,
        description: '',
        location: museu,
        date: data ? new Date(data).toISOString() : null,
        source: 'planilha',
        status: 'confirmada',
      });

      created++;
    }

    return Response.json({
      ok: true,
      created,
      message: `${created} atividades criadas`,
    });

  } catch (err) {
    console.error(err);

    return Response.json(
      {
        ok: false,
        error: err?.message || 'Erro ao sincronizar programação',
      },
      { status: 500 }
    );
  }
});
