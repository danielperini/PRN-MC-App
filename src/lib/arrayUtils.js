/**
 * Utilitários globais para controle seguro de arrays
 * Previne duplicidade, null/undefined e mantém integridade de dados
 */

/**
 * Remove duplicados de um array baseado em um ID único
 * @param {Array} lista - Array a ser normalizado
 * @param {String} keyId - Campo de identificação (padrão: 'id')
 * @returns {Array} Array sem duplicados
 */
export function removeDuplicatesById(lista, keyId = 'id') {
  if (!Array.isArray(lista)) return [];
  
  const seen = new Set();
  return lista.filter(item => {
    if (!item || typeof item !== 'object') return false;
    
    const id = item[keyId];
    if (!id) return false;
    
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Remove duplicados de um array de strings
 * @param {Array} lista - Array de strings
 * @returns {Array} Array sem duplicados
 */
export function removeDuplicatesString(lista) {
  if (!Array.isArray(lista)) return [];
  return Array.from(new Set(lista.filter(item => item && String(item).trim())));
}

/**
 * Normaliza um array garantindo que seja sempre válido
 * @param {*} value - Valor a ser normalizado
 * @returns {Array} Array válido
 */
export function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== null && item !== undefined);
  }
  if (!value) return [];
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Adiciona um item a um array sem criar duplicados (por ID)
 * @param {Array} lista - Array atual
 * @param {Object} novoItem - Item a ser adicionado
 * @param {String} keyId - Campo de identificação
 * @returns {Array} Array atualizado
 */
export function addItemWithoutDuplicate(lista, novoItem, keyId = 'id') {
  if (!novoItem || typeof novoItem !== 'object') return lista;
  if (!Array.isArray(lista)) lista = [];
  
  const id = novoItem[keyId];
  if (!id) return [...lista, novoItem];
  
  // Verifica se já existe
  const exists = lista.some(item => item && item[keyId] === id);
  if (exists) return lista;
  
  return removeDuplicatesById([...lista, novoItem], keyId);
}

/**
 * Remove um item de um array por ID
 * @param {Array} lista - Array atual
 * @param {*} idToRemove - ID do item a remover
 * @param {String} keyId - Campo de identificação
 * @returns {Array} Array atualizado
 */
export function removeItemById(lista, idToRemove, keyId = 'id') {
  if (!Array.isArray(lista)) return [];
  return lista.filter(item => item && item[keyId] !== idToRemove);
}

/**
 * Atualiza um item no array mantendo ordem e sem duplicados
 * @param {Array} lista - Array atual
 * @param {Object} itemAtualizado - Item com dados atualizados
 * @param {String} keyId - Campo de identificação
 * @returns {Array} Array atualizado
 */
export function updateItemInArray(lista, itemAtualizado, keyId = 'id') {
  if (!Array.isArray(lista) || !itemAtualizado) return lista;
  
  const id = itemAtualizado[keyId];
  if (!id) return lista;
  
  const updated = lista.map(item => 
    item && item[keyId] === id ? { ...item, ...itemAtualizado } : item
  );
  
  return removeDuplicatesById(updated, keyId);
}

/**
 * Valida se um array de IDs existe no array de objetos
 * @param {Array} objetos - Array de objetos
 * @param {Array} ids - Array de IDs a validar
 * @param {String} keyId - Campo de identificação
 * @returns {Array} Array de objetos válidos
 */
export function filterByIds(objetos, ids, keyId = 'id') {
  if (!Array.isArray(objetos) || !Array.isArray(ids)) return [];
  const idSet = new Set(ids.filter(Boolean));
  return objetos.filter(obj => obj && idSet.has(obj[keyId]));
}

/**
 * Mescla dois arrays removendo duplicados
 * @param {Array} lista1 - Primeiro array
 * @param {Array} lista2 - Segundo array
 * @param {String} keyId - Campo de identificação
 * @returns {Array} Array mesclado sem duplicados
 */
export function mergeArrays(lista1, lista2, keyId = 'id') {
  const merged = [...(Array.isArray(lista1) ? lista1 : []), ...(Array.isArray(lista2) ? lista2 : [])];
  return removeDuplicatesById(merged, keyId);
}