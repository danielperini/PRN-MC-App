import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const TUTORIAIS_FOLDER_ID = '1uoA5dDwINz6v7vxpF4nbAn4G16-LppkO';
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];

function tituloFromNome(nome) {
  // Remove extensão e underscores/hifens
  return nome.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Buscar token do connector googledrive (BYO_SHARED workspace connector)
    let accessToken: string;
    try {
      const connection = await base44.asServiceRole.connectors.getConnection('6a6d5c4b784a7fe768da2d1d');
      accessToken = connection.access_token;
    } catch (connErr) {
      // Fallback: tentar pelo tipo (shared connector)
      try {
        const connection2 = await base44.asServiceRole.connectors.getConnection('googledrive');
        accessToken = connection2.access_token;
      } catch (e2) {
        return Response.json({
          error: 'Conector Google Drive não conectado. Acesse Configurações > Conectores e reconecte o Google Drive.'
        }, { status: 200 });
      }
    }

    // Listar arquivos na pasta Tutoriais
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${TUTORIAIS_FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,createdTime,mimeType)&pageSize=100`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!listRes.ok) {
      const errText = await listRes.text();
      return Response.json({
        error: `Pasta de tutoriais não encontrada ou sem permissão de leitura (ID: ${TUTORIAIS_FOLDER_ID}). Status HTTP: ${listRes.status}. Detalhe: ${errText}`
      }, { status: 200 });
    }
    const listData = await listRes.json();
    const allFiles = listData.files || [];

    // Filtrar apenas arquivos de vídeo
    const videoFiles = allFiles.filter(f =>
      VIDEO_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext)) ||
      (f.mimeType && f.mimeType.startsWith('video/'))
    );

    const sr = base44.asServiceRole;
    let criados = 0;
    let atualizados = 0;

    for (const file of videoFiles) {
      const thumbnail_url = `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
      const embed_url = `https://drive.google.com/file/d/${file.id}/preview`;
      const titulo = tituloFromNome(file.name);

      // Buscar se já existe
      const existentes = await sr.entities.TutorialVideo.filter({ drive_file_id: file.id });

      if (existentes && existentes.length > 0) {
        await sr.entities.TutorialVideo.update(existentes[0].id, {
          titulo,
          thumbnail_url,
          embed_url,
          drive_created_at: file.createdTime,
        });
        atualizados++;
      } else {
        await sr.entities.TutorialVideo.create({
          drive_file_id: file.id,
          titulo,
          thumbnail_url,
          embed_url,
          drive_created_at: file.createdTime,
          ordem: 0,
          ativo: true,
        });
        criados++;
      }
    }

    if (videoFiles.length === 0) {
      return Response.json({
        success: true,
        total: 0,
        criados: 0,
        atualizados: 0,
        message: 'Nenhum vídeo encontrado na pasta. Verifique se há arquivos .mp4/.mov na pasta correta do Drive.'
      });
    }

    return Response.json({
      success: true,
      total: videoFiles.length,
      criados,
      atualizados,
      message: `${videoFiles.length} vídeo(s) encontrado(s): ${criados} novo(s), ${atualizados} atualizado(s).`
    });
  } catch (error) {
    console.error('[sincronizarTutoriaisDrive] Erro inesperado:', error.message);
    return Response.json({ error: `Erro inesperado: ${error.message}` }, { status: 200 });
  }
});