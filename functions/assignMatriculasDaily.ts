import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Fetch all users
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 9999);
    
    const ano = new Date().getFullYear();
    
    // Find users without matricula
    const usersWithoutMatricula = allUsers.filter(u => !u.matricula);
    
    if (usersWithoutMatricula.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'Todos os usuários já possuem matrícula',
        assigned: 0 
      });
    }
    
    // Get the highest sequence number from existing matriculas
    const existingMatriculas = allUsers
      .filter(u => u.matricula && u.matricula.startsWith(`MCA${ano}`))
      .map(u => {
        const seq = u.matricula.replace(`MCA${ano}`, '');
        return parseInt(seq, 10);
      });
    
    let nextSeq = Math.max(...existingMatriculas, 0) + 1;
    
    // Assign matriculas to users without one
    for (const user of usersWithoutMatricula) {
      const matricula = `MCA${ano}${String(nextSeq).padStart(8, '0')}`;
      await base44.asServiceRole.entities.User.update(user.id, { matricula });
      nextSeq++;
    }
    
    return Response.json({
      success: true,
      message: `${usersWithoutMatricula.length} matrículas atribuídas`,
      assigned: usersWithoutMatricula.length,
      first_matricula: `MCA${ano}${String(Math.max(...existingMatriculas, 0) + 1).padStart(8, '0')}`,
      last_matricula: `MCA${ano}${String(nextSeq - 1).padStart(8, '0')}`
    });
  } catch (error) {
    console.error('Error assigning matriculas:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});