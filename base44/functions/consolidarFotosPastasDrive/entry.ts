import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const PASTAS_ORIGEM = [
  '1JIQOY1eY29Qt-iUFgivfioaSoaFXGFJy',
  '1KHek34-ES3eef7E7YAh4q8ZhLgjPZuZC',
];
const PASTA_DESTINO = '1s8t3ERUthNKEStvFAKyGChXlu3MLVuzn';
const BLOCO_PROCESSAMENTO = 5;
const LIMITE_MAPEAMENTO = 200;

function normalize(value: any){ return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' '); }
function normalizeMuseu(text: any){
  const t = normalize(text);
  if(t.includes('casa do baile') || t.includes('casa baile')) return 'Casa do Baile';
  if(t.includes('mis') || t.includes('imagem') || t.includes('som')) return 'MIS';
  if(t.includes('mhab') || t.includes('abilio') || t.includes('historico')) return 'MHAB';
  if(t.includes('mumo') || t.includes('moda')) return 'MUMO';
  if(t.includes('map') || t.includes('pampulha')) return 'MAP';
  return null;
}

async function listFolderImagesRecursive(accessToken: string, folderId: string, path: string[] = []): Promise<any[]>{
  const out: any[] = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,md5Checksum,webViewLink,thumbnailLink,createdTime,modifiedTime,parents)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if(!res.ok) throw new Error(`Drive listagem HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for(const item of data.files || []){
      if(item.mimeType === 'application/vnd.google-apps.folder'){
        out.push(...await listFolderImagesRecursive(accessToken, item.id, [...path, item.name]));
      } else if(String(item.mimeType || '').startsWith('image/')){
        out.push({ ...item, _path: path, _sourceFolderId: folderId });
      }
    }
    pageToken = data.nextPageToken || '';
  } while(pageToken);
  return out;
}

async function listDestinationFileNames(accessToken: string, folderId: string): Promise<Set<string>>{
  const names = new Set<string>();
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(name)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if(!res.ok) break;
    const data = await res.json();
    for(const item of data.files || []) names.add(String(item.name || '').toLowerCase());
    pageToken = data.nextPageToken || '';
  } while(pageToken);
  return names;
}

async function copyFileToDestination(accessToken: string, fileId: string, fileName: string): Promise<string>{
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true&fields=id,webViewLink`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: fileName, parents: [PASTA_DESTINO] }),
  });
  if(!res.ok) throw new Error(`Copy HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const newId = data.id;
  if(!newId) throw new Error('Copy não retornou ID.');
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(newId)}&sz=w1600`;
}

async function deleteFile(accessToken: string, fileId: string): Promise<void>{
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if(!res.ok && res.status !== 204) throw new Error(`Delete HTTP ${res.status}: ${await res.text()}`);
}

async function gerarLegendaIA(base44: any, fileName: string, folderPath: string): Promise<string>{
  try {
    const contextoPasta = folderPath || 'pasta de atividades';
    const prompt = `Gere uma legenda curta e descritiva (máximo 80 caracteres) para uma foto de atividade cultural em museu. Nome do arquivo: "${fileName}". Contexto da pasta de origem: "${contextoPasta}". A legenda deve ser objetiva, em português, sem aspas. Exemplo: "Oficina educativa no MHAB" ou "Visita guiada no MIS".`;
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: { type: 'object', properties: { legenda: { type: 'string' } } },
    });
    const legenda = result?.legenda || result?.data?.legenda || '';
    if(legenda) return String(legenda).replace(/^["']|["']$/g, '').slice(0, 120);
  } catch { /* fallback abaixo */ }
  // Fallback: extrair do nome do arquivo
  const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return baseName.slice(0, 80) || 'Foto da galeria';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user: any = null;
    try { user = await base44.auth.me(); } catch { return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 }); }
    if(!user) return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const operacao = String(body.operacao || 'mapear');

    const connection = await base44.asServiceRole.connectors.getConnection('googledrive').catch(() => null);
    const accessToken = connection?.accessToken;
    if(!accessToken){
      return Response.json({ success: false, code: 'DRIVE_NOT_CONNECTED', error: 'Google Drive não está conectado.' }, { status: 401 });
    }

    // ==== OPERAÇÃO: MAPEAR ====
    if(operacao === 'mapear'){
      const skip = Number(body.skip ?? 0);
      const pastasParaMapear = body.pastas_origem && Array.isArray(body.pastas_origem) && body.pastas_origem.length > 0
        ? body.pastas_origem
        : PASTAS_ORIGEM;

      // Varredura recursiva de todas as pastas de origem
      let todasImagens: any[] = [];
      for(const pastaId of pastasParaMapear){
        try {
          const imgs = await listFolderImagesRecursive(accessToken, pastaId);
          todasImagens.push(...imgs);
        } catch(error: any){
          console.warn(`[consolidarFotos] Erro ao mapear pasta ${pastaId}: ${error?.message || error}`);
        }
      }

      const total = todasImagens.length;
      const bloco = todasImagens.slice(skip, skip + LIMITE_MAPEAMENTO);
      const arquivos = bloco.map((img: any) => ({
        id: img.id,
        name: img.name,
        folderId: img._sourceFolderId || '',
        folderPath: (img._path || []).join(' / '),
        mimeType: img.mimeType,
        size: Number(img.size || 0),
        webViewLink: img.webViewLink || '',
        thumbnailLink: img.thumbnailLink || '',
        createdTime: img.createdTime || '',
        museu: normalizeMuseu([...(img._path || []), img.name].join(' ')) || '',
      }));
      const proximoSkip = skip + LIMITE_MAPEAMENTO;
      const concluido = proximoSkip >= total;

      return Response.json({
        success: true,
        operacao: 'mapear',
        arquivos,
        totalEncontrado: total,
        skip,
        proximoSkip: concluido ? null : proximoSkip,
        concluido,
      });
    }

    // ==== OPERAÇÃO: PROCESSAR ====
    if(operacao === 'processar'){
      const arquivos = Array.isArray(body.arquivos) ? body.arquivos.slice(0, BLOCO_PROCESSAMENTO) : [];
      if(arquivos.length === 0){
        return Response.json({ success: true, operacao: 'processar', processadas: 0, duplicatas: 0, erros: 0, detalhes: [], concluido: true });
      }

      // Buscar nomes já existentes na pasta de destino para deduplicação
      const nomesDestino = await listDestinationFileNames(accessToken, PASTA_DESTINO);

      let processadas = 0;
      let duplicatas = 0;
      let erros = 0;
      const detalhes: any[] = [];

      for(const arquivo of arquivos){
        const fileName = String(arquivo.name || '');
        const fileId = String(arquivo.id || '');
        const folderPath = String(arquivo.folderPath || '');
        const museu = String(arquivo.museu || normalizeMuseu(folderPath + ' ' + fileName) || '');

        try {
          // 1. Deduplicação por nome exato
          if(nomesDestino.has(fileName.toLowerCase())){
            duplicatas++;
            detalhes.push({ id: fileId, name: fileName, status: 'duplicata', motivo: 'Já existe na pasta de destino' });
            continue;
          }

          // 2. Copiar para pasta de destino
          const fileUrl = await copyFileToDestination(accessToken, fileId, fileName);

          // 3. Gerar legenda via IA
          const legenda = await gerarLegendaIA(base44, fileName, folderPath);

          // 4. Criar registro na entidade ReportPhoto
          await base44.asServiceRole.entities.ReportPhoto.create({
            file_url: fileUrl,
            file_name: fileName,
            caption: legenda,
            legenda,
            museu: museu || '',
            fonte_ia: 'ia_curadoria',
            drive_file_id: fileId,
            drive_backup_status: 'concluido',
          });

          // 5. Deletar original da pasta de origem (apenas após sucesso total)
          await deleteFile(accessToken, fileId);

          // Adicionar nome à lista para evitar reprocessamento no mesmo lote
          nomesDestino.add(fileName.toLowerCase());

          processadas++;
          detalhes.push({ id: fileId, name: fileName, status: 'processada', legenda, museu });
        } catch(error: any){
          erros++;
          detalhes.push({ id: fileId, name: fileName, status: 'erro', erro: String(error?.message || error) });
        }
      }

      return Response.json({
        success: erros === 0,
        operacao: 'processar',
        processadas,
        duplicatas,
        erros,
        detalhes,
        concluido: true,
      });
    }

    return Response.json({ success: false, error: `Operação desconhecida: ${operacao}` }, { status: 400 });

  } catch(error: any){
    return Response.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
});