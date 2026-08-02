/**
 * contratoConstants.js
 * Valores contratuais oficiais dos aditivos — ÚNICA fonte de verdade.
 * Importar em todos os componentes que exibem "Previsto" por aditivo.
 */

export const CONTRATO_3_ADITIVO = 1_320_000;
export const CONTRATO_4_ADITIVO = 81_719.85;
export const CONTRATO_5_ADITIVO = 15_800;
export const CONTRATO_TOTAL = CONTRATO_3_ADITIVO + CONTRATO_4_ADITIVO + CONTRATO_5_ADITIVO;

/**
 * Retorna o valor contratual fixo para um aditivo pelo seu número/identificador.
 * @param {string|number} aditivo — '3', '4', '5', '3º ADITIVO', etc.
 * @returns {number}
 */
export function getContratoAditivo(aditivo) {
  const s = String(aditivo || '');
  if (s.includes('3')) return CONTRATO_3_ADITIVO;
  if (s.includes('4')) return CONTRATO_4_ADITIVO;
  if (s.includes('5')) return CONTRATO_5_ADITIVO;
  return 0;
}