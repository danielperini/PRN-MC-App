/**
 * Função pura determinística: resolve qual percentual é o principal para uma meta.
 * Regra: se a meta possui quantitativo físico definido, usa % físico como principal.
 * Caso contrário, usa % financeiro.
 *
 * @param {object} meta - objeto com numero, percentual (financeiro), etc.
 * @param {number} atividadesContadas - total de atividades contadas no período
 * @param {object} METAS_FISICAS_QUANTITATIVAS - mapa { '5': { meta: 60 }, ... }
 * @returns {{ principal: number, secundario: number|null, tipoPrincipal: 'fisico'|'financeiro' }}
 */
export function resolveMetaPercentual(meta, atividadesContadas, METAS_FISICAS_QUANTITATIVAS) {
  const metaNumero = String(meta._numero || meta.numero || '').replace('META ', '').replace(/^0+/, '');
  const defFisica = METAS_FISICAS_QUANTITATIVAS[metaNumero];

  const percentualFinanceiro = meta.percentual ?? 0;

  if (defFisica && defFisica.meta > 0) {
    const pctFisicoReal = Math.round((atividadesContadas / defFisica.meta) * 100);
    const pctFisico = Math.min(100, pctFisicoReal);
    return {
      principal: pctFisico,
      principalReal: pctFisicoReal,
      secundario: percentualFinanceiro,
      tipoPrincipal: 'fisico',
      metaFisica: defFisica.meta,
      realizadoFisico: atividadesContadas,
    };
  }

  return {
    principal: percentualFinanceiro,
    secundario: null,
    tipoPrincipal: 'financeiro',
    metaFisica: null,
    realizadoFisico: null,
  };
}