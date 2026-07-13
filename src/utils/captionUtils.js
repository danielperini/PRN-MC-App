/**
 * Utilitários centralizados para geração automática de legendas de fotos.
 * Usa: atividade, museu, local, data — na ordem de prioridade.
 */

export function extrairDataDoNome(fileName) {
  if (!fileName) return null;
  const m1 = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (m1) return `${m1[3]}/${m1[2]}/${m1[1]}`;
  const m2 = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[3]}/${m2[2]}/${m2[1]}`;
  return null;
}

function formatarData(dataStr) {
  if (!dataStr) return null;
  // Se já está no formato DD/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) return dataStr;
  // ISO ou YYYY-MM-DD
  const d = new Date(dataStr);
  if (!isNaN(d)) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  return dataStr;
}

/**
 * Gera legenda automática para uma foto a partir dos metadados disponíveis.
 *
 * @param {object} params
 * @param {string} [params.atividadeNome]     - Nome/título da atividade
 * @param {string} [params.atividadeLocal]    - Local específico da atividade
 * @param {string[]} [params.atividadeMuseus] - Lista de museus da atividade
 * @param {string} [params.atividadeData]     - Data de realização da atividade (YYYY-MM-DD ou DD/MM/AAAA)
 * @param {string} [params.museu]             - Museu do relatório (fallback)
 * @param {string} [params.mes]               - Mês do relatório (fallback de data)
 * @param {number|string} [params.ano]        - Ano do relatório (fallback de data)
 * @param {string} [params.fileName]          - Nome do arquivo (para extrair data)
 * @param {string} [params.createdAt]         - ISO date da criação (último fallback de data)
 * @returns {string}
 */
export function gerarLegendaFoto({
  atividadeNome,
  atividadeLocal,
  atividadeMuseus,
  atividadeData,
  museu,
  mes,
  ano,
  fileName,
  createdAt,
} = {}) {
  const partes = [];

  // 1. Nome da atividade
  const nome = atividadeNome?.trim();
  if (nome && nome !== 'Atividade') partes.push(nome);

  // 2. Local: local específico > museus da atividade > museu do relatório
  const local = atividadeLocal?.trim()
    || (Array.isArray(atividadeMuseus) && atividadeMuseus.filter(Boolean).join('/'))
    || museu?.trim();
  if (local) partes.push(local);

  // 3. Data: data da atividade > extraída do nome > mês/ano > data de criação
  const dataFormatada = formatarData(atividadeData)
    || extrairDataDoNome(fileName)
    || (mes && ano ? `${mes}/${ano}` : null)
    || (createdAt ? formatarData(createdAt) : null);
  if (dataFormatada) partes.push(dataFormatada);

  return partes.join(' — ');
}

/**
 * Gera legenda a partir de um objeto de atividade embarcado no relatório.
 * Compatível com a estrutura do campo `atividades[]` da entidade Report.
 */
export function gerarLegendaDaAtividade(atividade, { museu = '', mes = '', ano = '', fileName = '', createdAt = '' } = {}) {
  if (!atividade) {
    return gerarLegendaFoto({ museu, mes, ano, fileName, createdAt });
  }
  return gerarLegendaFoto({
    atividadeNome: atividade.nome || atividade.titulo || '',
    atividadeLocal: atividade.local || atividade.local_realizacao || '',
    atividadeMuseus: Array.isArray(atividade.museu_lista) ? atividade.museu_lista : (atividade.museu ? [atividade.museu] : []),
    atividadeData: atividade.data_realizacao || atividade.data_inicio || atividade.data || '',
    museu,
    mes,
    ano,
    fileName,
    createdAt,
  });
}