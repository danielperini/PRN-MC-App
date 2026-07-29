/**
 * Utilitário de inferência de gênero e flexão de função/cargo.
 * Baseado em heurística de terminação de nome, sem campo adicional de cadastro.
 */

const EXCECOES_MASCULINAS = new Set([
  'lucas', 'luca', 'nikita', 'tuca', 'joshua', 'elias', 'jonas',
  'matias', 'tobias', 'dimas', 'isaias', 'esdras', 'thomas',
  'nicolas', 'bautista',
]);

function normalizar(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Infere o gênero pelo primeiro nome.
 * @param {string} primeiroNome
 * @returns {'feminino' | 'masculino'}
 */
export function inferirGenero(primeiroNome) {
  const norm = normalizar(primeiroNome);
  if (!norm) return 'masculino';
  if (EXCECOES_MASCULINAS.has(norm)) return 'masculino';
  if (norm.endsWith('a')) return 'feminino';
  return 'masculino';
}

/**
 * Retorna o artigo correto para o título "Sala da/do [Nome]".
 * @param {string} primeiroNome
 * @returns {'da' | 'do'}
 */
export function artigoSala(primeiroNome) {
  return inferirGenero(primeiroNome) === 'feminino' ? 'da' : 'do';
}

// Dicionário de substituições exatas (chave: masculino normalizado → valor feminino)
const SUBSTITUICOES_EXATAS = {
  'produtor cultural': 'Produtora Cultural',
  'coordenador': 'Coordenadora',
  'educador': 'Educadora',
  'administrador': 'Administradora',
  'gestor': 'Gestora',
  'diretor': 'Diretora',
  'supervisor': 'Supervisora',
  'produtor': 'Produtora',
};

/**
 * Flexiona o texto do cargo/função conforme o gênero inferido.
 * Para feminino: aplica dicionário de substituições exatas e, como fallback,
 * substitui sufixo -or → -ora e -dor → -dora.
 * Para masculino: retorna o texto sem alteração.
 * Sufixos epicenos (-ista, -ente, -ável, -ar, -er) são mantidos inalterados.
 * @param {string} funcaoTexto
 * @param {'feminino' | 'masculino'} genero
 * @returns {string}
 */
export function flexionarFuncao(funcaoTexto, genero) {
  if (!funcaoTexto) return funcaoTexto || '';
  if (genero !== 'feminino') return funcaoTexto;

  // Tenta substituição exata (case-insensitive)
  const normFuncao = normalizar(funcaoTexto);
  for (const [chave, valor] of Object.entries(SUBSTITUICOES_EXATAS)) {
    if (normFuncao === normalizar(chave)) return valor;
  }

  // Sufixos epicenos — retorna sem alteração
  const epicenos = ['ista', 'ente', 'ável', 'avel', 'ante'];
  if (epicenos.some(s => normFuncao.endsWith(s))) return funcaoTexto;

  // Fallback: substitui -dor → -dora ou -or → -ora
  if (/dor$/i.test(funcaoTexto)) return funcaoTexto.replace(/dor$/i, 'dora');
  if (/or$/i.test(funcaoTexto)) return funcaoTexto.replace(/or$/i, 'ora');

  return funcaoTexto;
}