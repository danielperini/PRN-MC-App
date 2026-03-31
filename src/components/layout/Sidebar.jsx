import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const SPREADSHEET_ID = '1S-MPeXcO--mwod94tmIfTKBjboJ4rQN-';

const SHEETS = {
  CONTROLE_SYNC: 'CONTROLE_SYNC',
  RELATORIOS: 'RELATORIOS',
  ATIVIDADES: 'ATIVIDADES',
  EQUIPE: 'EQUIPE',
  PAGAMENTOS_EQUIPE: 'PAGAMENTOS_EQUIPE',
  PROGRAMACAO: 'PROGRAMACAO',
  DOCUMENTOS: 'DOCUMENTOS',
  RUBRICAS: 'RUBRICAS',
};

const ALLOWED_ROLES = [
  'admin',
  'ADMIN',
  'COORDENADOR',
  'COORD_PRODUCAO',
  'COORD_ADMINISTRATIVA',
  'COORD_COMUNICACAO',
];

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toIsoNow() {
  return new Date().toISOString();
}

function safeString(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeCell(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return value.map((item) => safeString(item)).join(' | ');
    }
  }
  if (isObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return safeString(value);
    }
  }
  return String(value);
}

function buildOrderedHeaders(rows: Record<string, any>[], preferred: string[] = []) {
  const set = new Set<string>();

  for (const key of preferred) set.add(key);

  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!set.has(key)) set.add(key);
    }
  }

  return Array.from(set);
}

function rowsToMatrix(rows: Record<string, any>[], preferredHeaders: string[] = []) {
  const headers = buildOrderedHeaders(rows, preferredHeaders);
  const values = [headers];

  for (const row of rows) {
    values.push(headers.map((header) => normalizeCell(row?.[header])));
  }

  if (values.length === 1) {
    values.push(headers.map(() => ''));
  }

  return values;
}

function simpleHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

function matrixHash(values: string[][]) {
  return simpleHash(JSON.stringify(values));
}

function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function sortByUpdatedDesc<T extends Record<string, any>>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const da = safeString(a?.updated_date || a?.created_date || '');
    const db = safeString(b?.updated_date || b?.created_date || '');
    return db.localeCompare(da);
  });
}

async function googleApi(accessToken: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google API ${response.status}: ${text}`);
  }

  return response;
}

async function sheetsGetValues(accessToken: string, spreadsheetId: string, range: string) {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
    `${encodeURIComponent(range)}?majorDimension=ROWS`;

  const response = await googleApi(accessToken, url);
  return await response.json();
}

async function sheetsBatchUpdateValues(
  accessToken: string,
  spreadsheetId: string,
  data: Array<{ range: string; values: string[][] }>
) {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;

  const response = await googleApi(accessToken, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data,
    }),
  });

  return await response.json();
}

async function sheetsBatchClear(
  accessToken: string,
  spreadsheetId: string,
  ranges: string[]
) {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`;

  const response = await googleApi(accessToken, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ranges }),
  });

  return await response.json();
}

async function safeListEntity(
  base44: any,
  entityName: string,
  sort = '-updated_date',
  limit = 5000
) {
  try {
    const entity = base44.asServiceRole?.entities?.[entityName];
    if (!entity || typeof entity.list !== 'function') return [];
    const result = await entity.list(sort, limit);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn(`safeListEntity(${entityName}) falhou:`, error?.message || error);
    return [];
  }
}

function normalizeReportRow(report: Record<string, any>) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  const oportunidades = Array.isArray(report?.oportunidades) ? report.oportunidades : [];
  const momentos = Array.isArray(report?.momentos) ? report.momentos : [];
  const depoimentos = Array.isArray(report?.depoimentos) ? report.depoimentos : [];

  return {
    id_relatorio: report?.id || '',
    numero_protocolo: report?.numero_protocolo || '',
    usuario_email: report?.author_email || report?.created_by || '',
    nome_usuario: report?.author_name || '',
    funcao: report?.funcao || '',
    museu: report?.museu || '',
    mes_referencia: report?.mes_referencia || '',
    ano: report?.ano || '',
    status: report?.status || '',
    aprovado_por: report?.approved_by || report?.aprovado_por || '',
    data_aprovacao: report?.approval_date || report?.data_aprovacao || '',
    observacoes_coordenador: report?.return_comment || report?.observacoes_coordenador || '',
    resumo_executivo: report?.resumo_executivo || '',
    total_atividades: atividades.length,
    total_oportunidades: oportunidades.length,
    total_momentos: momentos.length,
    total_depoimentos: depoimentos.length,
    criado_em: report?.created_date || '',
    atualizado_em: report?.updated_date || '',
    created_by: report?.created_by || '',
    raw_json: report,
  };
}

function extractEmbeddedActivities(report: Record<string, any>) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];

  return atividades.map((atividade: Record<string, any>, index: number) => {
    const embeddedId =
      atividade?.id ||
      `${report?.id || 'sem-relatorio'}::embedded::${index + 1}::${atividade?.nome || atividade?.titulo || 'atividade'}`;

    return {
      id_atividade: embeddedId,
      source: 'report_embedded',
      id_relatorio: report?.id || '',
      numero_protocolo_relatorio: report?.numero_protocolo || '',
      nome_usuario_relatorio: report?.author_name || '',
      mes_referencia: report?.mes_referencia || '',
      ano: report?.ano || '',
      status_relatorio: report?.status || '',
      nome_atividade: atividade?.nome || atividade?.titulo || '',
      titulo: atividade?.titulo || atividade?.nome || '',
      tipo_acao: atividade?.tipo_acao || '',
      tipo_acao_lista: atividade?.tipo_acao_lista || [],
      museu: atividade?.museu || '',
      museu_lista: atividade?.museu_lista || [],
      local: atividade?.local || '',
      data_inicio: atividade?.data_inicio || atividade?.data_realizacao || '',
      data_fim: atividade?.data_fim || '',
      publico_estimado: atividade?.publico_estimado || atividade?.publico_total || '',
      publico_real: atividade?.publico_real || '',
      quantas_vezes_ocorreu:
        atividade?.quantas_vezes_ocorreu ||
        atividade?.quantas_repeticoes ||
        atividade?.atividades_total ||
        1,
      produto: atividade?.produto_realizado || atividade?.produto || '',
      quantidade_produto:
        atividade?.quantidade_produto ||
        atividade?.quantidade_produtos ||
        '',
      total_produtos_gerados:
        atividade?.total_produtos_gerados ||
        atividade?.produtos_total ||
        '',
      equipe_responsavel: atividade?.equipe_responsavel || '',
      descricao: atividade?.descricao || '',
      acessibilidade: atividade?.acessibilidade || '',
      link_inscricao: atividade?.link_inscricao || '',
      fotos_urls: atividade?.fotos || [],
      status: atividade?.status || 'ativo',
      criado_em: atividade?.created_date || report?.created_date || '',
      atualizado_em: atividade?.updated_date || report?.updated_date || '',
      raw_json: atividade,
    };
  });
}

function normalizeActivityRow(activity: Record<string, any>) {
  return {
    id_atividade: activity?.id || '',
    source: 'entity_activity',
    id_relatorio: activity?.report_id || '',
    numero_protocolo_relatorio: activity?.report_numero_protocolo || '',
    nome_usuario_relatorio: activity?.report_author_name || '',
    mes_referencia: activity?.report_mes_referencia || '',
    ano: activity?.report_ano || '',
    status_relatorio: activity?.report_status || '',
    nome_atividade: activity?.nome || activity?.titulo || '',
    titulo: activity?.titulo || activity?.nome || '',
    tipo_acao: activity?.tipo_acao || '',
    tipo_acao_lista: activity?.tipo_acao_lista || [],
    museu: activity?.museu || '',
    museu_lista: activity?.museu_lista || [],
    local: activity?.local || '',
    data_inicio: activity?.data_inicio || activity?.data_realizacao || '',
    data_fim: activity?.data_fim || '',
    publico_estimado: activity?.publico_estimado || activity?.publico_total || '',
    publico_real: activity?.publico_real || '',
    quantas_vezes_ocorreu:
      activity?.quantas_vezes_ocorreu ||
      activity?.quantas_repeticoes ||
      activity?.atividades_total ||
      1,
    produto: activity?.produto_realizado || activity?.produto || '',
    quantidade_produto:
      activity?.quantidade_produto ||
      activity?.quantidade_produtos ||
      '',
    total_produtos_gerados:
      activity?.total_produtos_gerados ||
      activity?.produtos_total ||
      '',
    equipe_responsavel: activity?.equipe_responsavel || '',
    descricao: activity?.descricao || '',
    acessibilidade: activity?.acessibilidade || '',
    link_inscricao: activity?.link_inscricao || '',
    fotos_urls: activity?.fotos || [],
    status: activity?.status || 'ativo',
    criado_em: activity?.created_date || '',
    atualizado_em: activity?.updated_date || '',
    raw_json: activity,
  };
}

function normalizeTeamMemberRow(member: Record<string, any>) {
  return {
    id_membro: member?.id || '',
    nome: member?.user_name || member?.nome || '',
    email: member?.user_email || member?.email || '',
    funcao: member?.funcao || member?.role || '',
    telefone: member?.telefone || member?.phone || '',
    banco: member?.banco || '',
    cpf_cnpj: member?.cpf_cnpj || member?.cpf || member?.cnpj || '',
    valor_parcela: member?.valor_parcela || '',
    numero_parcelas: member?.numero_parcelas || member?.parcelas || '',
    valor_total: member?.valor_total || '',
    status: member?.status || '',
    rubrica_id: member?.budgetline_id || member?.budget_line_id || '',
    criado_em: member?.created_date || '',
    atualizado_em: member?.updated_date || '',
    raw_json: member,
  };
}

function normalizeTeamPaymentRow(payment: Record<string, any>) {
  return {
    id_pagamento: payment?.id || '',
    id_membro: payment?.team_member_id || payment?.member_id || '',
    nome_membro: payment?.member_name || payment?.nome_membro || '',
    email_membro: payment?.member_email || payment?.email_membro || '',
    mes_referencia: payment?.mes_referencia || '',
    ano: payment?.ano || '',
    valor: payment?.valor || payment?.valor_pagamento || '',
    status: payment?.status || '',
    nota_fiscal_url: payment?.nota_fiscal_url || '',
    xml_url: payment?.xml_url || '',
    aprovado_por: payment?.approved_by || payment?.aprovado_por || '',
    data_pagamento: payment?.data_pagamento || '',
    criado_em: payment?.created_date || '',
    atualizado_em: payment?.updated_date || '',
    raw_json: payment,
  };
}

function normalizeProgramacaoRow(item: Record<string, any>) {
  return {
    id_programacao: item?.id || '',
    nome: item?.nome || item?.titulo || '',
    titulo: item?.titulo || item?.nome || '',
    museu: item?.museu || '',
    local: item?.local || '',
    data_inicio: item?.data_inicio || item?.data || '',
    data_fim: item?.data_fim || '',
    horario: item?.horario || '',
    tipo_atividade: item?.tipo_atividade || item?.tipo || '',
    sinopse: item?.sinopse || '',
    publico_alvo: item?.publico_alvo || '',
    acessibilidade: item?.acessibilidade || '',
    vagas: item?.vagas || '',
    inscricao_link: item?.inscricao_link || item?.link_inscricao || '',
    material_divulgacao_aprovado: item?.material_divulgacao_aprovado || '',
    origem: item?.origem || '',
    status: item?.status || '',
    criado_em: item?.created_date || '',
    atualizado_em: item?.updated_date || '',
    raw_json: item,
  };
}

function normalizeDocumentRow(document: Record<string, any>) {
  return {
    id_documento: document?.id || '',
    nome: document?.titulo || document?.nome || document?.file_name || '',
    tipo: document?.categoria || document?.tipo || document?.file_type || '',
    descricao: document?.descricao || '',
    file_name: document?.file_name || '',
    file_url: document?.file_url || '',
    ativo: document?.ativo ?? '',
    conteudo_extraido: document?.conteudo_extraido || '',
    report_id: document?.report_id || '',
    activity_id: document?.activity_id || '',
    data_upload: document?.created_date || '',
    atualizado_em: document?.updated_date || '',
    raw_json: document,
  };
}

function normalizeRubricaRow(rubrica: Record<string, any>) {
  return {
    id_rubrica: rubrica?.id || '',
    nome: rubrica?.nome || rubrica?.descricao || '',
    codigo: rubrica?.codigo || '',
    museu: rubrica?.museu || rubrica?.centro_custo || '',
    valor_previsto: rubrica?.valor_previsto || rubrica?.orcado || '',
    valor_utilizado: rubrica?.valor_utilizado || '',
    saldo: rubrica?.saldo || '',
    status: rubrica?.status || '',
    criado_em: rubrica?.created_date || '',
    atualizado_em: rubrica?.updated_date || '',
    raw_json: rubrica,
  };
}

function dedupeActivities(rows: Record<string, any>[]) {
  const map = new Map<string, Record<string, any>>();

  for (const row of rows) {
    const key =
      row?.id_atividade ||
      `${row?.id_relatorio || ''}::${row?.nome_atividade || row?.titulo || ''}::${row?.data_inicio || ''}`;

    const existing = map.get(key);

    if (!existing) {
      map.set(key, row);
      continue;
    }

    const existingIsEntity = existing?.source === 'entity_activity';
    const currentIsEntity = row?.source === 'entity_activity';

    if (!existingIsEntity && currentIsEntity) {
      map.set(key, row);
      continue;
    }

    const existingUpdated = safeString(existing?.atualizado_em || existing?.criado_em || '');
    const currentUpdated = safeString(row?.atualizado_em || row?.criado_em || '');

    if (currentUpdated > existingUpdated) {
      map.set(key, row);
    }
  }

  return Array.from(map.values());
}

async function getControleSyncMap(accessToken: string) {
  const range = `${quoteSheetName(SHEETS.CONTROLE_SYNC)}!A1:Z500`;
  const response = await sheetsGetValues(accessToken, SPREADSHEET_ID, range);
  const values = Array.isArray(response?.values) ? response.values : [];

  if (values.length < 2) return new Map<string, Record<string, string>>();

  const headers = values[0].map((item: any) => safeString(item));
  const rows = values.slice(1);
  const map = new Map<string, Record<string, string>>();

  for (const row of rows) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = safeString(row[index] ?? '');
    });

    const aba = record.aba || record.sheet_name || '';
    if (aba) map.set(aba, record);
  }

  return map;
}

async function syncSheetIfChanged(
  accessToken: string,
  sheetName: string,
  values: string[][],
  controleMap: Map<string, Record<string, string>>,
  syncMeta: {
    syncedAt: string;
    syncedBy: string;
  }
) {
  const newHash = matrixHash(values);
  const currentMeta = controleMap.get(sheetName);
  const oldHash = currentMeta?.hash || '';

  if (oldHash === newHash) {
    return {
      sheet: sheetName,
      changed: false,
      hash: newHash,
      rows: Math.max(values.length - 1, 0),
      action: 'skipped',
    };
  }

  const clearRange = `${quoteSheetName(sheetName)}!A:ZZ`;
  const writeRange = `${quoteSheetName(sheetName)}!A1`;

  await sheetsBatchClear(accessToken, SPREADSHEET_ID, [clearRange]);
  await sheetsBatchUpdateValues(accessToken, SPREADSHEET_ID, [
    {
      range: writeRange,
      values,
    },
  ]);

  controleMap.set(sheetName, {
    aba: sheetName,
    hash: newHash,
    ultima_sync: syncMeta.syncedAt,
    atualizado_por: syncMeta.syncedBy,
    linhas: String(Math.max(values.length - 1, 0)),
    status: 'updated',
  });

  return {
    sheet: sheetName,
    changed: true,
    hash: newHash,
    rows: Math.max(values.length - 1, 0),
    action: 'updated',
  };
}

function buildControleSyncValues(
  controleMap: Map<string, Record<string, string>>,
  summary: {
    syncedAt: string;
    syncedBy: string;
    results: Array<{
      sheet: string;
      changed: boolean;
      hash: string;
      rows: number;
      action: string;
    }>;
  }
) {
  const preferredHeaders = [
    'aba',
    'hash',
    'ultima_sync',
    'atualizado_por',
    'linhas',
    'status',
  ];

  const rows: Record<string, any>[] = [];

  for (const sheetName of [
    SHEETS.RELATORIOS,
    SHEETS.ATIVIDADES,
    SHEETS.EQUIPE,
    SHEETS.PAGAMENTOS_EQUIPE,
    SHEETS.PROGRAMACAO,
    SHEETS.DOCUMENTOS,
    SHEETS.RUBRICAS,
  ]) {
    const base = controleMap.get(sheetName) || {};
    const result = summary.results.find((item) => item.sheet === sheetName);

    rows.push({
      aba: sheetName,
      hash: base.hash || result?.hash || '',
      ultima_sync: summary.syncedAt,
      atualizado_por: summary.syncedBy,
      linhas: base.linhas || String(result?.rows || 0),
      status: result?.action || base.status || 'ok',
    });
  }

  return rowsToMatrix(rows, preferredHeaders);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      return Response.json(
        {
          ok: false,
          error: 'Forbidden: apenas coordenadores podem sincronizar o backup',
        },
        { status: 403 }
      );
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    if (!accessToken) {
      return Response.json(
        { ok: false, error: 'Google Drive/Sheets não conectado' },
        { status: 400 }
      );
    }

    const syncedAt = toIsoNow();
    const syncedBy = user.email || '';

    const [
      reports,
      activityEntities,
      teamMembers,
      teamPayments,
      programacoes,
      knowledgeDocuments,
      attachments,
      rubricas,
    ] = await Promise.all([
      safeListEntity(base44, 'Report', '-updated_date', 5000),
      safeListEntity(base44, 'Activity', '-updated_date', 10000),
      safeListEntity(base44, 'TeamMember', '-updated_date', 5000),
      safeListEntity(base44, 'TeamPayment', '-updated_date', 10000),
      safeListEntity(base44, 'Programacao', '-updated_date', 10000),
      safeListEntity(base44, 'KnowledgeDocument', '-updated_date', 5000),
      safeListEntity(base44, 'Attachment', '-updated_date', 10000),
      safeListEntity(base44, 'Rubrica', '-updated_date', 5000),
    ]);

    const reportRows = sortByUpdatedDesc((reports || []).map(normalizeReportRow));
    const embeddedActivities = (reports || []).flatMap((report) => extractEmbeddedActivities(report));
    const activityRows = sortByUpdatedDesc(
      dedupeActivities([
        ...(activityEntities || []).map(normalizeActivityRow),
        ...embeddedActivities,
      ])
    );

    const teamRows = sortByUpdatedDesc((teamMembers || []).map(normalizeTeamMemberRow));
    const paymentRows = sortByUpdatedDesc((teamPayments || []).map(normalizeTeamPaymentRow));
    const programacaoRows = sortByUpdatedDesc((programacoes || []).map(normalizeProgramacaoRow));
    const documentRows = sortByUpdatedDesc([
      ...(knowledgeDocuments || []).map(normalizeDocumentRow),
      ...(attachments || []).map(normalizeDocumentRow),
    ]);
    const rubricaRows = sortByUpdatedDesc((rubricas || []).map(normalizeRubricaRow));

    const relatoriosValues = rowsToMatrix(reportRows, [
      'id_relatorio',
      'numero_protocolo',
      'usuario_email',
      'nome_usuario',
      'funcao',
      'museu',
      'mes_referencia',
      'ano',
      'status',
      'aprovado_por',
      'data_aprovacao',
      'observacoes_coordenador',
      'resumo_executivo',
      'total_atividades',
      'total_oportunidades',
      'total_momentos',
      'total_depoimentos',
      'criado_em',
      'atualizado_em',
      'created_by',
      'raw_json',
    ]);

    const atividadesValues = rowsToMatrix(activityRows, [
      'id_atividade',
      'source',
      'id_relatorio',
      'numero_protocolo_relatorio',
      'nome_usuario_relatorio',
      'mes_referencia',
      'ano',
      'status_relatorio',
      'nome_atividade',
      'titulo',
      'tipo_acao',
      'tipo_acao_lista',
      'museu',
      'museu_lista',
      'local',
      'data_inicio',
      'data_fim',
      'publico_estimado',
      'publico_real',
      'quantas_vezes_ocorreu',
      'produto',
      'quantidade_produto',
      'total_produtos_gerados',
      'equipe_responsavel',
      'descricao',
      'acessibilidade',
      'link_inscricao',
      'fotos_urls',
      'status',
      'criado_em',
      'atualizado_em',
      'raw_json',
    ]);

    const equipeValues = rowsToMatrix(teamRows, [
      'id_membro',
      'nome',
      'email',
      'funcao',
      'telefone',
      'banco',
      'cpf_cnpj',
      'valor_parcela',
      'numero_parcelas',
      'valor_total',
      'status',
      'rubrica_id',
      'criado_em',
      'atualizado_em',
      'raw_json',
    ]);

    const pagamentosEquipeValues = rowsToMatrix(paymentRows, [
      'id_pagamento',
      'id_membro',
      'nome_membro',
      'email_membro',
      'mes_referencia',
      'ano',
      'valor',
      'status',
      'nota_fiscal_url',
      'xml_url',
      'aprovado_por',
      'data_pagamento',
      'criado_em',
      'atualizado_em',
      'raw_json',
    ]);

    const programacaoValues = rowsToMatrix(programacaoRows, [
      'id_programacao',
      'nome',
      'titulo',
      'museu',
      'local',
      'data_inicio',
      'data_fim',
      'horario',
      'tipo_atividade',
      'sinopse',
      'publico_alvo',
      'acessibilidade',
      'vagas',
      'inscricao_link',
      'material_divulgacao_aprovado',
      'origem',
      'status',
      'criado_em',
      'atualizado_em',
      'raw_json',
    ]);

    const documentosValues = rowsToMatrix(documentRows, [
      'id_documento',
      'nome',
      'tipo',
      'descricao',
      'file_name',
      'file_url',
      'ativo',
      'conteudo_extraido',
      'report_id',
      'activity_id',
      'data_upload',
      'atualizado_em',
      'raw_json',
    ]);

    const rubricasValues = rowsToMatrix(rubricaRows, [
      'id_rubrica',
      'nome',
      'codigo',
      'museu',
      'valor_previsto',
      'valor_utilizado',
      'saldo',
      'status',
      'criado_em',
      'atualizado_em',
      'raw_json',
    ]);

    const controleMap = await getControleSyncMap(accessToken);

    const results = await Promise.all([
      syncSheetIfChanged(accessToken, SHEETS.RELATORIOS, relatoriosValues, controleMap, {
        syncedAt,
        syncedBy,
      }),
      syncSheetIfChanged(accessToken, SHEETS.ATIVIDADES, atividadesValues, controleMap, {
        syncedAt,
        syncedBy,
      }),
      syncSheetIfChanged(accessToken, SHEETS.EQUIPE, equipeValues, controleMap, {
        syncedAt,
        syncedBy,
      }),
      syncSheetIfChanged(accessToken, SHEETS.PAGAMENTOS_EQUIPE, pagamentosEquipeValues, controleMap, {
        syncedAt,
        syncedBy,
      }),
      syncSheetIfChanged(accessToken, SHEETS.PROGRAMACAO, programacaoValues, controleMap, {
        syncedAt,
        syncedBy,
      }),
      syncSheetIfChanged(accessToken, SHEETS.DOCUMENTOS, documentosValues, controleMap, {
        syncedAt,
        syncedBy,
      }),
      syncSheetIfChanged(accessToken, SHEETS.RUBRICAS, rubricasValues, controleMap, {
        syncedAt,
        syncedBy,
      }),
    ]);

    const controleValues = buildControleSyncValues(controleMap, {
      syncedAt,
      syncedBy,
      results,
    });

    await sheetsBatchClear(accessToken, SPREADSHEET_ID, [
      `${quoteSheetName(SHEETS.CONTROLE_SYNC)}!A:Z`,
    ]);

    await sheetsBatchUpdateValues(accessToken, SPREADSHEET_ID, [
      {
        range: `${quoteSheetName(SHEETS.CONTROLE_SYNC)}!A1`,
        values: controleValues,
      },
    ]);

    return Response.json({
      ok: true,
      spreadsheet_id: SPREADSHEET_ID,
      synced_at: syncedAt,
      synced_by: syncedBy,
      updated_sheets: results.filter((item) => item.changed).map((item) => item.sheet),
      skipped_sheets: results.filter((item) => !item.changed).map((item) => item.sheet),
      counts: {
        reports: reportRows.length,
        activities_entity: activityEntities.length,
        activities_embedded: embeddedActivities.length,
        activities_exported: activityRows.length,
        team_members: teamRows.length,
        team_payments: paymentRows.length,
        programacao: programacaoRows.length,
        documents: documentRows.length,
        rubricas: rubricaRows.length,
      },
      results,
    });
  } catch (error) {
    console.error('syncBackupDrive error:', error);

    return Response.json(
      {
        ok: false,
        error: error?.message || 'Erro inesperado ao sincronizar backup no Google Sheets',
      },
      { status: 500 }
    );
  }
});
