export function normalizeHeaders(headers = []) {
  return headers.map((h) =>
    String(h || '')
      .toLowerCase()
      .trim()
  );
}

export function mapRowToObject(headers = [], row = []) {
  const obj = {};

  headers.forEach((h, i) => {
    if (!h) return;
    obj[h] = row[i];
  });

  return obj;
}

export function parseDate(value) {
  if (!value) return null;

  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const parsed = new Date(excelEpoch.getTime() + value * 86400000);
    return parsed.toISOString();
  }

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

export function detectMuseu(text = '') {
  const t = String(text).toLowerCase();

  if (t.includes('mis')) return 'MIS';
  if (t.includes('mhab')) return 'MHAB';
  if (t.includes('mumo')) return 'MUMO';

  return 'Externo';
}

export function normalizeProgramacaoRow(row = {}) {
  const nome =
    row['nome da programação'] ||
    row['nome'] ||
    row['título'] ||
    row['titulo'] ||
    '';

  const descricao =
    row['descrição'] ||
    row['descricao'] ||
    row['sinopse'] ||
    '';

  const dataInicio =
    parseDate(
      row['data'] ||
        row['data início'] ||
        row['data_inicio']
    );

  const dataFim =
    parseDate(
      row['data fim'] ||
        row['data_fim']
    );

  const horario = row['horário'] || row['horario'] || '';
  const vagas = row['vagas'] || '';
  const tipo = row['tipo'] || row['tipo de atividade'] || '';

  const link =
    row['link'] ||
    row['inscrição'] ||
    row['link inscrição'] ||
    '';

  const museu = detectMuseu(nome);

  return {
    titulo: nome,
    nome_acao: nome,
    descricao,
    sinopse: descricao,
    data_inicio: dataInicio,
    data_fim: dataFim,
    horario,
    vagas,
    tipo,
    tipo_atividade: tipo,
    link_inscricao: link,
    inscricao: link,
    museu,
    equipamento: museu,
    origem: 'planilha_publica',
    ativo: true,
  };
}
