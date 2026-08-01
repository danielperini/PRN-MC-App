import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const TUTORIAIS_FOLDER_ID = '1re7Bcv4D3p7oEeg5BHUbFotF2aJstE6R';
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];

function tituloFromNome(nome: string): string {
  return nome.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Obter token do conector Google Drive (shared)
    let accessToken: string;
    try {
      const { accessToken: token } = await base44.asServiceRole.connectors.getConnection('googledrive');
      if (!token) throw new Error('Token vazio');
      accessToken = token;
    } catch (e) {
      return Response.json({
        error: `Conector Google Drive sem token válido: ${e?.message}. Reconecte em Configurações > Conectores.`
      });
    }

    // Listar arquivos na pasta Tutoriais
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${TUTORIAIS_FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,createdTime,mimeType)&pageSize=100`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      return Response.json({
        error: `Pasta de tutoriais não encontrada ou sem permissão (ID: ${TUTORIAIS_FOLDER_ID}). Status: ${listRes.status}. Detalhe: ${errText}`
      });
    }

    const listData = await listRes.json();
    const allFiles = listData.files || [];

    const videoFiles = allFiles.filter((f: any) =>
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
      message: `${videoFiles.length} vídeo(s): ${criados} novo(s), ${atualizados} atualizado(s).`
    });

  } catch (error: any) {
    console.error('[sincronizarTutoriaisDrive] Erro:', error.message);
    return Response.json({ error: `Erro inesperado: ${error.message}` });
  }
});