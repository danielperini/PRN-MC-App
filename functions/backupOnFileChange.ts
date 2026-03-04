import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    
    // Trigger backup when files are created or deleted
    if (!['create', 'delete'].includes(event.type)) {
      return Response.json({ 
        success: true, 
        message: 'Evento ignorado' 
      });
    }

    const response = await base44.asServiceRole.functions.invoke('backupToGoogleDrive');
    
    return Response.json({
      success: true,
      message: `Backup automático realizado após ${event.type} de arquivo`,
      backup_data: response.data
    });
  } catch (error) {
    console.error('Error in backupOnFileChange:', error);
    return Response.json({ 
      error: error.message, 
      success: false 
    }, { status: 500 });
  }
});