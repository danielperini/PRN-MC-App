import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Dados de treinamento do chatbot
    const trainingData = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      created_by: user.email,
      
      project_summary: {
        name: "Museus Centro - Belo Horizonte",
        description: "Iniciativa cultural que integra museus importantes da região central de BH",
        key_principle: "Todas as atividades são gratuitas e acessíveis"
      },

      museums: [
        {
          code: "MHAB",
          name: "Museu Histórico Abílio Barreto",
          founded: 1943,
          focus: "História da cidade"
        },
        {
          code: "MIS BH",
          name: "Museu da Imagem e do Som de Belo Horizonte",
          focus: "Patrimônio audiovisual",
          items: "Mais de 90 mil itens"
        },
        {
          code: "MUMO",
          name: "Museu de Moda de Belo Horizonte",
          distinction: "Primeiro museu público de moda do Brasil"
        }
      ],

      qa_training: [
        { question: "O que é o projeto Museus Centro?", answer: "É uma iniciativa cultural que integra museus de BH, promovendo exposições, atividades educativas e eventos culturais." },
        { question: "Quais são os museus participantes?", answer: "MHAB (Abílio Barreto), MIS BH (Imagem e Som) e MUMO (Museu de Moda)." },
        { question: "As atividades são pagas?", answer: "Não, todas as atividades são completamente gratuitas e acessíveis." },
        { question: "Qual é o foco de cada museu?", answer: "MHAB: história; MIS BH: audiovisual; MUMO: moda e história." },
        { question: "Que tipos de atividades são oferecidas?", answer: "Exposições, oficinas, mostras de cinema, eventos culturais, apresentações artísticas." },
        { question: "Por que o projeto é culturalmente importante?", answer: "Reforça a identidade cultural de BH, promove educação patrimonial e acesso à cultura." }
      ]
    };

    // Converter para JSON
    const jsonContent = JSON.stringify(trainingData, null, 2);
    const fileBlob = new Blob([jsonContent], { type: 'application/json' });
    const file = new File([fileBlob], 'chatbot_training_data.json');

    // Buscar ou criar a pasta no Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    
    // Procurar pasta existente
    let folderId = null;
    const searchResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=name=%27Treinamento%20Chatbot%20Museus%27%20and%20mimeType=%27application/vnd.google-apps.folder%27%20and%20trashed=false&spaces=drive&pageSize=1',
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    const searchData = await searchResponse.json();
    
    // Se não existir, criar pasta
    if (!searchData.files || searchData.files.length === 0) {
      const createFolderResponse = await fetch(
        'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Treinamento Chatbot Museus',
            mimeType: 'application/vnd.google-apps.folder'
          })
        }
      );
      const folderData = await createFolderResponse.json();
      folderId = folderData.id;
    } else {
      folderId = searchData.files[0].id;
    }

    // Upload do arquivo
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify({
      name: `chatbot_training_${new Date().toISOString().split('T')[0]}.json`,
      parents: [folderId]
    })], { type: 'application/json' }));
    formData.append('file', file);

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      }
    );

    const uploadedFile = await uploadResponse.json();

    return Response.json({
      success: true,
      message: 'Dados de treinamento enviados para Google Drive com sucesso',
      folder_id: folderId,
      file_id: uploadedFile.id,
      file_name: uploadedFile.name,
      created_at: uploadedFile.createdTime
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});