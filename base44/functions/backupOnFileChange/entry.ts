import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * backupOnFileChange — DESATIVADO
 * Backup para a pasta legada 1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7 cancelado.
 * Substituído pelo fluxo syncComprasDocsToDrive (Compras/{Mês}/{Tipo}/).
 */

Deno.serve(async (req) => {
  return Response.json({
    skipped: true,
    reason: 'Função desativada. Backup legado para pasta raiz cancelado.',
    info: 'Use syncComprasDocsToDrive para sincronizar documentos de compras.'
  });
});