import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SHEET_ID = '1jrwWeRLdoNeaELNdvUC3EFsZ6L_XZr5CxKZlApIEQys';
const SHEET_GID = '1715420706';
const CSV_EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const CSV_FILE_NAME_HINT = 'Dados de Contratação Equipe - Projeto Museu Centro 2026';

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function isFilled(value: unknown): boolean {
  return String(value || '').trim() !== '';
}

function pickFirstFilled<T = string>(...values: unknown[]): T | '' {
  for (const value of values) {
    if (isFilled(value)) return value as T;
  }
  return '';
}

function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out as T;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (ch === ',' && !insideQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result.map((v) => v.trim());
}

function parseCsv(csvText: string): Array<Record<string, string>> {
  const lines = String(csvText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

function findValueByHeader(row: Record<string, string>, candidates: string[]): string {
  const entries = Object.entries(row || {});
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate);
    const found = entries.find(([header]) => normalizeText(header) === normalizedCandidate);
    if (found && isFilled(found[1])) return String(found[1]).trim();
  }
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate);
    const found = entries.find(([header]) => normalizeText(header).includes(normalizedCandidate));
    if (found && isFilled(found[1])) return String(found[1]).trim();
  }
  return '';
}

function mapExternalRowToFields(row: Record<string, string>) {
  const nome = pickFirstFilled(
    findValueByHeader(row, ['nome completo', 'nome', 'prestador', 'contratado'])
  );

  const email = pickFirstFilled(
    findValueByHeader(row, ['e-mail', 'email', 'email pessoal', 'user_email'])
  );

  const cpf = pickFirstFilled(
    findValueByHeader(row, ['cpf', 'cpf do contratado', 'documento'])
  );

  const cnpj = pickFirstFilled(
    findValueByHeader(row, ['cnpj', 'cnpj do contratado'])
  );

  const banco = pickFirstFilled(
    findValueByHeader(row, ['banco'])
  );

  const agencia = pickFirstFilled(
    findValueByHeader(row, ['agência', 'agencia'])
  );

  const conta = pickFirstFilled(
    findValueByHeader(row, ['conta', 'conta corrente'])
  );

  const pix_key = pickFirstFilled(
    findValueByHeader(row, ['pix', 'chave pix', 'pix key'])
  );

  const funcao = pickFirstFilled(
    findValueByHeader(row, ['função', 'funcao', 'cargo'])
  );

  const valor_parcela = toNumber(
    pickFirstFilled(
      findValueByHeader(row, ['valor parcela', 'valor da parcela', 'valor mensal', 'valor'])
    )
  );

  const numero_parcelas = toNumber(
    pickFirstFilled(
      findValueByHeader(row, ['número de parcelas', 'numero de parcelas', 'parcelas'])
    )
  );

  const vigencia_inicio = pickFirstFilled(
    findValueByHeader(row, ['vigência inicial', 'vigencia inicial', 'início vigência', 'inicio vigencia', 'data inicial'])
  );

  const vigencia_fim = pickFirstFilled(
    findValueByHeader(row, ['vigência final', 'vigencia final', 'fim vigência', 'fim vigencia', 'data final'])
  );

  return {
    nome,
    email,
    cpf,
    cnpj,
    banco,
    agencia,
    conta,
    pix_key,
    funcao,
    valor_parcela,
    numero_parcelas,
    vigencia_inicio,
    vigencia_fim,
  };
}

function rowMatchesMember(row: Record<string, string>, member: any): boolean {
  const mapped = mapExternalRowToFields(row);

  const memberEmail = normalizeText(member?.user_email || member?.email_pessoal || '');
  const rowEmail = normalizeText(mapped.email);
  if (memberEmail && rowEmail && memberEmail === rowEmail) return true;

  const memberCpf = onlyDigits(member?.cpf);
  const rowCpf = onlyDigits(mapped.cpf);
  if (memberCpf && rowCpf && memberCpf === rowCpf) return true;

  const memberCnpj = onlyDigits(member?.cnpj);
  const rowCnpj = onlyDigits(mapped.cnpj);
  if (memberCnpj && rowCnpj && memberCnpj === rowCnpj) return true;

  const memberName = normalizeText(member?.user_name || member?.nome || '');
  const rowName = normalizeText(mapped.nome);
  if (memberName && rowName && (memberName === rowName || memberName.includes(rowName) || rowName.includes(memberName))) {
    return true;
  }

  return false;
}

async function fetchSheetRows(): Promise<Array<Record<string, string>>> {
  try {
    const res = await fetch(CSV_EXPORT_URL);
    if (!res.ok) return [];
    const csvText = await res.text();
    return parseCsv(csvText);
  } catch {
    return [];
  }
}

async function fetchKnowledgeCsvRows(base44: any): Promise<Array<Record<string, string>>> {
  try {
    const docs = await base44.asServiceRole.entities.KnowledgeDocument.list('-created_date', 200);
    const target = (docs || []).find((d: any) => {
      const title = normalizeText(d?.titulo || d?.title || d?.file_name || d?.nome || '');
      return title.includes(normalizeText(CSV_FILE_NAME_HINT));
    });

    if (!target) return [];

    if (isFilled(target?.conteudo_extraido)) {
      return parseCsv(String(target.conteudo_extraido || ''));
    }

    if (isFilled(target?.file_url)) {
      const res = await fetch(String(target.file_url));
      if (!res.ok) return [];
      const csvText = await res.text();
      return parseCsv(csvText);
    }

    return [];
  } catch {
    return [];
  }
}

async function fetchContractData(base44: any, member: any) {
  const contractUrl = member?.contrato_url || member?.file_url || '';
  if (!isFilled(contractUrl)) return null;

  try {
    const result = await base44.asServiceRole.functions.invoke('extractTeamContractData', {
      file_url: contractUrl,
      contrato_url: contractUrl,
    });
    return result?.data?.dados || result?.data || null;
  } catch {
    return null;
  }
}

function buildPatch(member: any, contractData: any, rowData: any) {
  const patch: Record<string, any> = {};

  const fillIfEmpty = (field: string, ...candidates: unknown[]) => {
    if (isFilled(member?.[field])) return;
    const value = pickFirstFilled(...candidates);
    if (isFilled(value)) patch[field] = value;
  };

  fillIfEmpty('user_name', contractData?.nome, rowData?.nome);
  fillIfEmpty('funcao', contractData?.cargo, rowData?.funcao);

  if (!isFilled(member?.cpf) && !isFilled(member?.cnpj)) {
    if (isFilled(contractData?.cpf)) patch.cpf = contractData.cpf;
    else if (isFilled(rowData?.cpf)) patch.cpf = rowData.cpf;

    if (isFilled(contractData?.cnpj)) patch.cnpj = contractData.cnpj;
    else if (isFilled(rowData?.cnpj)) patch.cnpj = rowData.cnpj;
  }

  fillIfEmpty('banco', contractData?.banco, rowData?.banco);
  fillIfEmpty('agencia', contractData?.agencia, rowData?.agencia);
  fillIfEmpty('conta', contractData?.conta, rowData?.conta);
  fillIfEmpty('pix_key', contractData?.pix_key, rowData?.pix_key);

  if (!toNumber(member?.valor_parcela)) {
    const valor = toNumber(contractData?.valor_parcela) || toNumber(rowData?.valor_parcela);
    if (valor > 0) patch.valor_parcela = valor;
  }

  if (!toNumber(member?.numero_parcelas)) {
    const parcelas = toNumber(contractData?.numero_parcelas) || toNumber(rowData?.numero_parcelas);
    if (parcelas > 0) patch.numero_parcelas = parcelas;
  }

  fillIfEmpty('vigencia_inicio', contractData?.vigencia_inicio, rowData?.vigencia_inicio);
  fillIfEmpty('vigencia_fim', contractData?.vigencia_fim, rowData?.vigencia_fim);

  return sanitizeObject(patch);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const team_member_id = String(body?.team_member_id || '').trim();
    const user_email = String(body?.user_email || user.email || '').trim();

    let member = null;

    if (team_member_id) {
      member = await base44.asServiceRole.entities.TeamMember.get(team_member_id).catch(() => null);
    }

    if (!member && user_email) {
      const rows = await base44.asServiceRole.entities.TeamMember.filter({ user_email }).catch(() => []);
      member = Array.isArray(rows) ? rows[0] || null : null;
    }

    if (!member) {
      return Response.json({ success: false, error: 'TeamMember não encontrado' }, { status: 404 });
    }

    const [contractData, sheetRows, knowledgeCsvRows] = await Promise.all([
      fetchContractData(base44, member),
      fetchSheetRows(),
      fetchKnowledgeCsvRows(base44),
    ]);

    const rowFromSheet = (sheetRows || []).find((row) => rowMatchesMember(row, member)) || null;
    const rowFromKnowledgeCsv = (knowledgeCsvRows || []).find((row) => rowMatchesMember(row, member)) || null;

    const mergedRowData = {
      ...mapExternalRowToFields(rowFromKnowledgeCsv || {}),
      ...mapExternalRowToFields(rowFromSheet || {}),
    };

    const patch = buildPatch(member, contractData, mergedRowData);

    if (Object.keys(patch).length > 0) {
      await base44.asServiceRole.entities.TeamMember.update(member.id, patch);
    }

    const updatedMember = Object.keys(patch).length > 0
      ? await base44.asServiceRole.entities.TeamMember.get(member.id).catch(() => ({ ...member, ...patch }))
      : member;

    return Response.json({
      success: true,
      updated: Object.keys(patch).length > 0,
      updated_fields: Object.keys(patch),
      sources: {
        contract: !!contractData,
        google_sheet: !!rowFromSheet,
        knowledge_csv: !!rowFromKnowledgeCsv,
      },
      member: updatedMember,
    });
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        error: error?.message || 'Erro ao completar dados do membro',
      },
      { status: 500 }
    );
  }
});
