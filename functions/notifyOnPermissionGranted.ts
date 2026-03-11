import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { fileId, fileName, userEmail, permissionType, grantedByName } = await req.json();

    if (!fileId || !fileName || !userEmail || !permissionType) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // Mapeia tipo de permissão para mensagem legível
    const permissionLabels = {
      view: 'visualização',
      edit: 'edição',
      delete: 'exclusão',
    };

    const permissionLabel = permissionLabels[permissionType] || permissionType;

    // Cria notificação para o usuário que recebeu a permissão
    await base44.asServiceRole.entities.Notification.create({
      user_email: userEmail,
      type: 'PERMISSION_GRANTED',
      title: 'Permissão Concedida',
      message: `${grantedByName} concedeu permissão de ${permissionLabel} para o arquivo "${fileName}"`,
      read: false,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});