import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const RELEASES_FOLDER_ID = '1ORE5fdfWe3WIhpVouB1Et6VLN2kVXFr8';

async function listFolderContents(accessToken, folderId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&fields=files(id,name,mimeType)&pageSize=100`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!response.ok) return [];
  const data = await response.json();
  return data.files || [];
}

async function getFileContent(accessToken, fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!response.ok) return null;
  return response.text();
}

function parseReleaseFolder(folderName) {
  // Formato: _2026-05-maio-lançamento de catálogo
  const match = folderName.match(/_(\d{4})-(\d{2})-(.+?)(?:-(.+))?$/);
  if (!match) return null;
  
  const ano = parseInt(match[1]);
  const mesNum = parseInt(match[2]);
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const mes = meses[mesNum - 1];
  const descricao = match[4] || '';
  
  return { ano, mes, descricao };
}

function extractKeywords(texto) {
  const palavras = texto.toLowerCase().split(/\s+/).filter(p => p.length > 3);
  const frequentes = [...new Set(palavras)].slice(0, 10);
  return frequentes;
}

function detectMuseus(texto) {
  const museus = [];
  if (texto.includes('MHAB') || texto.includes('Museu Histórico de Abernathy')) museus.push('MHAB');
  if (texto.includes('MIS') || texto.includes('Museu de Imagem e Som')) museus.push('MIS');
  if (texto.includes('MUMO') || texto.includes('Museu de Mobilidade')) museus.push('MUMO');
  return [...new Set(museus)];
}

function detectTiposAtividade(texto) {
  const tipos = [];
  const patterns = {
    'oficina': /oficina/gi,
    'palestra': /palestra/gi,
    'exposição': /expos[iç]ão/gi,
    'workshop': /workshop/gi,
    'visita': /visita|tour/gi,
    'evento': /evento|manifestação/gi,
    'lançamento': /lançamento|release/gi,
    'performance': /performance|apresentação/gi
  };
  
  Object.entries(patterns).forEach(([tipo, regex]) => {
    if (regex.test(texto)) tipos.push(tipo);
  });
  
  return tipos;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Obter conexão com Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    
    // Listar subpastas da pasta Releases
    const subpastas = await listFolderContents(accessToken, RELEASES_FOLDER_ID);
    const releasesPastas = subpastas.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    
    let sincronizados = 0;
    let erros = [];
    
    for (const pasta of releasesPastas) {
      const parsed = parseReleaseFolder(pasta.name);
      if (!parsed) continue;
      
      try {
        // Listar arquivos na subpasta
        const arquivos = await listFolderContents(accessToken, pasta.id);
        
        for (const arquivo of arquivos) {
          // Pular pastas
          if (arquivo.mimeType === 'application/vnd.google-apps.folder') continue;
          
          // Ler conteúdo
          const conteudo = await getFileContent(accessToken, arquivo.id);
          if (!conteudo) continue;
          
          // Verificar se já existe
          const existentes = await base44.asServiceRole.entities.Release.filter({
            drive_file_id: arquivo.id
          });
          
          if (existentes.length > 0) continue; // Já sincronizado
          
          // Extrair dados do conteúdo
          const titulo = arquivo.name.replace(/\.[^.]+$/, '');
          const museus = detectMuseus(conteudo);
          const tipos = detectTiposAtividade(conteudo);
          const tags = extractKeywords(conteudo);
          
          // Criar release
          await base44.asServiceRole.entities.Release.create({
            titulo,
            conteudo_completo: conteudo,
            drive_file_id: arquivo.id,
            drive_file_name: arquivo.name,
            pasta_drive: pasta.name,
            mes: parsed.mes,
            ano: parsed.ano,
            museus,
            tipos_atividade: tipos,
            palavras_chave: tags,
            status: 'novo',
            data_sincronizacao: new Date().toISOString(),
            ativo: true
          });
          
          sincronizados++;
        }
      } catch (e) {
        erros.push(`Pasta ${pasta.name}: ${e.message}`);
      }
    }
    
    return Response.json({
      success: true,
      sincronizados,
      erros,
      mensagem: `${sincronizados} releases sincronizados`
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});