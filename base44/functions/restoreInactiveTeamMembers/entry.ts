import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Restaura automaticamente todos os membros de equipe inativos/suspensos
 * Função idempotente — pode ser chamada múltiplas vezes com segurança
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Buscar todos os membros inativos
    const inactiveMembers = await base44.asServiceRole.entities.TeamMember.filter({
      status: { $ne: 'ATIVO' }
    });

    const membersArray = Array.isArray(inactiveMembers) 
      ? inactiveMembers 
      : inactiveMembers?.data || [];

    if (membersArray.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhum membro inativo encontrado',
        restored: []
      });
    }

    // Restaurar cada membro
    const restored = [];
    const errors = [];

    for (const member of membersArray) {
      try {
        await base44.asServiceRole.entities.TeamMember.update(member.id, {
          status: 'ATIVO'
        });
        restored.push({
          id: member.id,
          name: member.user_name,
          previousStatus: member.status
        });
      } catch (err) {
        errors.push({
          id: member.id,
          name: member.user_name,
          error: err.message
        });
      }
    }

    return Response.json({
      success: true,
      message: `${restored.length} membro(s) restaurado(s)${errors.length > 0 ? `, ${errors.length} erro(s)` : ''}`,
      restored,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Erro ao restaurar membros inativos:', error);
    return Response.json(
      { error: error.message || 'Erro ao processar' },
      { status: 500 }
    );
  }
});