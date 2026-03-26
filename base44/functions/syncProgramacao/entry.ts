import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as XLSX from 'npm:xlsx@0.18.5';

const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const GID = '580065331';

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

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`).toISOString();
  }

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
  if (t.includes('mumu')) return 'MUMO';
  if (t.includes('mumo')) return 'MUMO';

  return 'Externo';
}

function buildMonthKeyFromIso(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function uniqueStrings(values: any[]) {
  return Array.from(
    new Set(
      (values || [])
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    )
  );
}

function getCell(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
}

function normalizeProgramacao(row: Record<string, any>) {
  const titulo = String(
    getCell(row, [
      'nome da programacao',
      'nome da programação',
      'nome',
      'titulo',
      'título',
      'atividade',
      'programacao',
      'programação',
    ])
  ).trim();

  const descricao = String(
    getCell(row, ['descricao', 'descrição', 'sinopse', 'resumo'])
  ).trim();

  const dataInicio = excelDateToIso(
    getCell(row, ['data', 'data inicio', 'data início', 'data_inicio'])
  );

  const dataFim = excelDateToIso(
    getCell(row, ['data fim', 'data_fim', 'data final', 'data_final'])
  );

  const horario = String(
    getCell(row, ['horario', 'horário'])
  ).trim();

  const vagas = String(
    getCell(row, ['vagas', 'numero de vagas', 'número de vagas'])
  ).trim();

  const tipo = String(
    getCell(row, ['tipo', 'tipo de atividade', 'tipo_atividade'])
  ).trim();

  const linkInscricao = String(
    getCell(row, [
      'link',
      'link inscricao',
      'link inscrição',
      'inscricao',
      'inscrição',
    ])
  ).trim();

  const local = String(
    getCell(row, ['local', 'espaco', 'espaço'])
  ).trim();

  const nomeComMuseu = `${titulo} ${local}`.trim();
  const museu = detectMuseu(nomeComMuseu);

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
    inscricao: linkInscricao,
    local,
    museu,
    equipamento: museu,
    origem: 'planilha_publica',
    ativo: true,
    status: 'CONFIRMADA',
    month_key: buildMonthKeyFromIso(dataInicio),
  };
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

function buildKnowledgeText(eventos: any[], sourceUrl: string) {
  const linhas: string[] = [
    'Base espelhada da programação pública dos Museus Centro.',
    `Fonte: ${sourceUrl}`,
    '',
  ];

  for (const ev of eventos) {
    linhas.push(`Título: ${ev.titulo || ''}`);
    linhas.push(`Museu: ${ev.museu || ''}`);
    linhas.push(`Data início: ${ev.data_inicio || ''}`);
    linhas.push(`Data fim: ${ev.data_fim || ''}`);
    linhas.push(`Horário: ${ev.horario || ''}`);
    linhas.push(`Tipo: ${ev.tipo || ''}`);
    linhas.push(`Vagas: ${ev.vagas || ''}`);
    linhas.push(`Inscrição: ${ev.link_inscricao || ''}`);
    linhas.push(`Descrição: ${ev.descricao || ''}`);
    linhas.push('---');
  }

  return linhas.join('\n');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const sourceUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx&gid=${GID}`;

    const res = await fetch(sourceUrl);
    if (!res.ok) {
      return Response.json(
        { error: `Falha ao baixar planilha pública: ${res.status}` },
        { status: 502 }
      );
    }

    const buffer = await res.arrayBuffer();
    const contentBase64 = toBase64(buffer);

    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (!Array.isArray(matrix) || matrix.length < 2) {
      return Response.json({ error: 'Planilha vazia ou inválida.' }, { status: 400 });
    }

    const headers = (matrix[0] || []).map(normalizeHeader);
    const rows = matrix.slice(1);

    const eventos = rows
      .map((row) => normalizeRow(headers, row as any[]))
      .map(normalizeProgramacao)
      .filter((item) => item.titulo && item.data_inicio);

    const upload = await base44.storage.upload({
      file_name: `programacao_museus_centro_${new Date().toISOString().slice(0, 10)}.xlsx`,
      content_base64: contentBase64,
    });

    const fileUrl = upload?.file_url || '';
    if (!fileUrl) {
      return Response.json({ error: 'Falha ao salvar planilha no storage.' }, { status: 500 });
    }

    const knowledgeTitle = 'Base IA Segmentada - Programação Museus Centro';
    const knowledgeText = buildKnowledgeText(eventos, sourceUrl);

    const existingDocs = await base44.asServiceRole.entities.KnowledgeDocument.filter(
      { title: knowledgeTitle },
      '-updated_date',
      10
    );

    let knowledgeDoc: any = null;

    if (Array.isArray(existingDocs) && existingDocs.length > 0) {
      knowledgeDoc = await base44.asServiceRole.entities.KnowledgeDocument.update(existingDocs[0].id, {
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
        summary: `Base pública sincronizada com ${eventos.length} registros.`,
        extracted_text: knowledgeText,
        analysis: JSON.stringify({
          source_url: sourceUrl,
          total_eventos: eventos.length,
          synced_at: new Date().toISOString(),
        }),
      });
    } else {
      knowledgeDoc = await base44.asServiceRole.entities.KnowledgeDocument.create({
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
        summary: `Base pública sincronizada com ${eventos.length} registros.`,
        extracted_text: knowledgeText,
        analysis: JSON.stringify({
          source_url: sourceUrl,
          total_eventos: eventos.length,
          synced_at: new Date().toISOString(),
        }),
      });
    }

    let processados = 0;
    let erros = 0;

    for (const ev of eventos) {
      const payload = {
        nome_acao: ev.nome_acao,
        titulo: ev.titulo,
        data: ev.data,
        data_inicio: ev.data_inicio,
        data_fim: ev.data_fim,
        horario: ev.horario,
        museu: ev.museu,
        equipamento: ev.equipamento,
        local: ev.local,
        descricao: ev.descricao,
        sinopse: ev.sinopse,
        tipo: ev.tipo,
        tipo_atividade: ev.tipo_atividade,
        vagas: ev.vagas,
        inscricao: ev.inscricao,
        link_inscricao: ev.link_inscricao,
        origem: ev.origem,
        ativo: ev.ativo,
        status: ev.status,
        month_key: ev.month_key,
        knowledge_document_id: knowledgeDoc?.id || '',
        storage_file_url: fileUrl,
        sync_source_url: sourceUrl,
      };

      try {
        const existing = await base44.asServiceRole.entities.Programacao.filter(
          {
            titulo: ev.titulo,
            data_inicio: ev.data_inicio,
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
      } catch (err) {
        console.error('Erro ao sincronizar programação:', ev?.titulo, err);
        erros++;
      }
    }

    return Response.json({
      ok: true,
      synced: true,
      total_lidos: eventos.length,
      total_processados: processados,
      total_erros: erros,
      knowledge_document_id: knowledgeDoc?.id || '',
      storage_file_url: fileUrl,
      source_url: sourceUrl,
      message: 'Programação sincronizada com Programacao + KnowledgeDocument + Storage.',
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Erro inesperado ao sincronizar programação.' },
      { status: 500 }
    );
  }
});
