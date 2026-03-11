import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), { status: 401 });
    }

    const payload = await req.json();
    const { fornecedor_id, valor_pago, tipo_pagamento, data_pagamento, comprovante_url, descricao, referencia_bancaria, termo_id } = payload;

    // Validar dados obrigatórios
    if (!fornecedor_id || !valor_pago || !tipo_pagamento) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios faltando' }), { status: 400 });
    }

    // Buscar fornecedor
    const fornecedor = await base44.asServiceRole.entities.Fornecedor.get(fornecedor_id);
    if (!fornecedor) {
      return new Response(JSON.stringify({ error: 'Fornecedor não encontrado' }), { status: 404 });
    }

    // Criar registro de pagamento
    const pagamento = await base44.asServiceRole.entities.PagamentoFornecedor.create({
      fornecedor_id,
      termo_id: termo_id || null,
      tipo_pagamento,
      valor_pago,
      data_pagamento: data_pagamento || new Date().toISOString().split('T')[0],
      data_confirmacao: new Date().toISOString(),
      status: 'pago',
      comprovante_url: comprovante_url || null,
      descricao_pagamento: descricao || null,
      confirmado_por_email: user.email,
      confirmado_por_nome: user.full_name,
      referencia_bancaria: referencia_bancaria || null,
    });

    // Enviar notificação ao fornecedor
    if (fornecedor.email) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: fornecedor.email,
        subject: `Pagamento Confirmado - ${fornecedor.nome}`,
        body: `Olá ${fornecedor.nome},

Confirmamos o pagamento de R$ ${valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} referente aos nossos serviços.

Tipo de pagamento: ${tipo_pagamento === 'transferencia_bancaria' ? 'Transferência Bancária' : tipo_pagamento === 'pix' ? 'PIX' : 'Depósito'}
Data do pagamento: ${new Date(data_pagamento).toLocaleDateString('pt-BR')}
${referencia_bancaria ? `Referência: ${referencia_bancaria}` : ''}

Se houver qualquer dúvida, favor entrar em contato conosco.

Obrigado!`
      });
    }

    // Criar notificação no app
    await base44.asServiceRole.entities.Notification.create({
      user_email: fornecedor.email,
      type: 'FORNECEDOR_PAGAMENTO_RECEBIDO',
      title: 'Pagamento Recebido',
      message: `Pagamento de R$ ${valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} foi confirmado como recebido.`,
      read: false,
      email_sent: true,
    });

    return new Response(JSON.stringify({
      sucesso: true,
      pagamento_id: pagamento.id,
      mensagem: 'Pagamento registrado com sucesso',
    }), { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar pagamento:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});