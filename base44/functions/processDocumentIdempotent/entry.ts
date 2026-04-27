import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function generateHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { document_id, action, idempotency_key } = body;

    if (!document_id || !action || !idempotency_key) {
      return Response.json({ error: 'Parâmetros obrigatórios faltam' }, { status: 400 });
    }

    // Gerar hash da chave de idempotência
    const hash = await generateHash(idempotency_key);

    // Verificar se já foi processado
    const existingResult = await base44.asServiceRole.entities.DocumentIntake.filter({
      idempotency_key_hash: hash,
      document_id: document_id
    });

    if (existingResult && existingResult.length > 0) {
      // Retornar resultado anterior
      return Response.json({
        status: 'already_processed',
        previous_result: existingResult[0],
        message: 'Esta operação já foi executada. Retornando resultado anterior.'
      });
    }

    // Obter documento
    const document = await base44.asServiceRole.entities.DocumentIntake.filter({
      id: document_id
    });

    if (!document || document.length === 0) {
      return Response.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    const doc = document[0];

    // Executar ação idempotente
    let result = {};
    const startTime = new Date();

    switch (action) {
      case 'approve':
        result = await approveDocumentIdempotent(base44, doc, user);
        break;
      case 'reject':
        result = await rejectDocumentIdempotent(base44, doc, user);
        break;
      case 'delete':
        result = await deleteDocumentIdempotent(base44, doc, user);
        break;
      case 'reprocess':
        result = await reprocessDocumentIdempotent(base44, doc, user);
        break;
      default:
        return Response.json({ error: 'Ação não reconhecida' }, { status: 400 });
    }

    const endTime = new Date();

    // Salvar chave de idempotência e resultado
    await base44.asServiceRole.entities.DocumentIntake.update(document_id, {
      idempotency_key_hash: hash,
      last_idempotent_action: action,
      last_idempotent_result: JSON.stringify(result),
      last_idempotent_timestamp: new Date().toISOString()
    });

    // Auditoria
    await base44.asServiceRole.entities.AuditLog.create({
      action: `DOCUMENT_${action.toUpperCase()}`,
      entity_type: 'DOCUMENT_INTAKE',
      entity_id: document_id,
      actor_email: user.email,
      actor_name: user.full_name,
      details: `Ação "${action}" executada com sucesso. Duração: ${endTime - startTime}ms`
    });

    return Response.json({
      status: 'success',
      action: action,
      result: result,
      execution_time_ms: endTime - startTime,
      idempotency_key_hash: hash
    });

  } catch (error) {
    console.error('Erro ao processar documento (idempotente):', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function approveDocumentIdempotent(base44, doc, user) {
  if (doc.status === 'approved') {
    return { message: 'Já estava aprovado', skipped: true };
  }

  await base44.asServiceRole.entities.DocumentIntake.update(doc.id, {
    status: 'approved',
    approved_by: user.email,
    approved_at: new Date().toISOString()
  });

  return { approved: true, timestamp: new Date().toISOString() };
}

async function rejectDocumentIdempotent(base44, doc, user) {
  if (doc.status === 'rejected') {
    return { message: 'Já estava rejeitado', skipped: true };
  }

  await base44.asServiceRole.entities.DocumentIntake.update(doc.id, {
    status: 'rejected',
    rejected_by: user.email,
    rejected_at: new Date().toISOString()
  });

  return { rejected: true, timestamp: new Date().toISOString() };
}

async function deleteDocumentIdempotent(base44, doc, user) {
  if (doc.status === 'deleted') {
    return { message: 'Já estava deletado', skipped: true };
  }

  if (!['draft', 'pendente', 'rejected'].includes(doc.status)) {
    throw new Error('Não é possível deletar documento com status ' + doc.status);
  }

  await base44.asServiceRole.entities.DocumentIntake.update(doc.id, {
    status: 'deleted',
    deleted_by: user.email,
    deleted_at: new Date().toISOString()
  });

  return { deleted: true, timestamp: new Date().toISOString() };
}

async function reprocessDocumentIdempotent(base44, doc, user) {
  if (doc.status === 'processing') {
    return { message: 'Já está em processamento', skipped: true };
  }

  await base44.asServiceRole.entities.DocumentIntake.update(doc.id, {
    status: 'processing',
    reprocessed_by: user.email,
    reprocessed_at: new Date().toISOString()
  });

  // Dispara reprocessamento via função
  try {
    await base44.asServiceRole.functions.invoke('classifyAndRouteDocument', {
      document_id: doc.id,
      file_url: doc.file_url,
      file_name: doc.file_name_original
    });
  } catch (e) {
    console.warn('Reprocessamento disparado mas pode estar async:', e.message);
  }

  return { reprocessing: true, timestamp: new Date().toISOString() };
}