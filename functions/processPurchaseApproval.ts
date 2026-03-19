import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    createClientFromRequest(req);

    return Response.json(
      {
        error: 'LEGADO: esta function não deve mais ser usada. Use purchaseActions.'
      },
      { status: 410 }
    );
  } catch (error) {
    console.error('processPurchaseApproval legado:', error);
    return Response.json(
      { error: error.message || 'Erro interno' },
      { status: 500 }
    );
  }
});