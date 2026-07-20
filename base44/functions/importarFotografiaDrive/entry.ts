import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const ROOT_FOLDER_ID = '1kCcL0H7K2tLETDGo1sAs9LZ6UN_pLk4J';
const MAX_POR_SUBPASTA = 5;
const MESES_CAP = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function normalize(s: any){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' '); }

function extrairMuseu(nomePasta: string){
  const t = normalize(nomePasta);
  if(t.includes('mhab')) return 'MHAB';
  if(t.includes('misbh')||t.includes('mis')) return 'MIS';
  if(t.includes('mumo')) return 'MUMO';
  if(t.includes('casa do baile')) return 'Casa do Baile';
  if(t.includes('casa kubitschek')) return 'Casa Kubitschek';
  if(t.includes('pampulha')||t.includes('map')) return 'MAP';
  if(t.includes('noturno')) return 'NOTURNO';
  if(t.includes('mc')||t.includes('museus centro')) return 'MC';
  return 'GERAL';
}

function extrairMesAno(nomePasta: string){
  const match = nomePasta.match(/(\d{4})-(\d{2})/);
  if(match){
    const ano = Number(match[1]);
    const mesNum = Number(match[2]);
    if(mesNum >= 1 && mesNum <= 12){
      return { mes: MESES_CAP[mesNum-1], mesNum, ano };
    }
  }
  return { mes: '', mesNum: null, ano: 2026 };
}

async function listSubfolders(accessToken: string, folderId: string){
  const out: any[] = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`);
    const fields = encodeURIComponent('nextPageToken,files(id,name)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if(!res.ok) throw new Error(`Drive list folders HTTP ${res.status}`);
    const data = await res.json();
    out.push(...(data.files||[]));
    pageToken = data.nextPageToken || '';
  } while(pageToken);
  return out;
}

async function listFolderImagesLimited(accessToken: string, folderId: string, path: string[] = []): Promise<any[]>{
  const out: any[] = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,md5Checksum,webViewLink,thumbnailLink,createdTime,modifiedTime)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if(!res.ok) throw new Error(`Drive list HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const folders: any[] = [];
    const images: any[] = [];
    for(const item of data.files || []){
      if(item.mimeType === 'application/vnd.google-apps.folder'){
        folders.push(item);
      } else if(String(item.mimeType||'').startsWith('image/')){
        images.push({ ...item, _path: path });
      }
    }
    out.push(...images.slice(0, MAX_POR_SUBPASTA));
    for(const folder of folders){
      out.push(...await listFolderImagesLimited(accessToken, folder.id, [...path, folder.name]));
    }
    pageToken = data.nextPageToken || '';
  } while(pageToken);
  return out;
}

async function baixarEEnviar(base44: any, accessToken: string, img: any){
  const download = await fetch(`https://www.googleapis.com/drive/v3/files/${img.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if(!download.ok) throw new Error(`Download Drive HTTP ${download.status}`);
  const bytes = await download.arrayBuffer();
  if(!bytes.byteLength) throw new Error('Arquivo vazio.');
  const file = new File([bytes], img.name, { type: img.mimeType || 'image/jpeg' });
  const upload = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  const fileUrl = upload?.file_url || upload?.url || upload?.data?.file_url;
  if(!fileUrl) throw new Error('Upload não retornou URL.');
  return fileUrl;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch {}
    if(!user) return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const modo = String(body.modo || 'listar');

    const connection = await base44.asServiceRole.connectors.getConnection('googledrive').catch(() => null);
    const accessToken = connection?.accessToken;
    if(!accessToken) return Response.json({ success: false, code: 'DRIVE_NOT_CONNECTED', error: 'Google Drive não conectado.' }, { status: 401 });

    // ===== MODO LISTAR =====
    if(modo === 'listar'){
      const subpastas = await listSubfolders(accessToken, ROOT_FOLDER_ID);
      const resultados = await Promise.all(
        subpastas.map(async (sp) => {
          const imgs = await listFolderImagesLimited(accessToken, sp.id, [sp.name]).catch(() => []);
          return { pasta: sp.name, id: sp.id, total: imgs.length };
        })
      );
      const totalGeral = resultados.reduce((s, r) => s + r.total, 0);
      return Response.json({ success: true, modo: 'listar', pastas: resultados, total: totalGeral });
    }

    // ===== MODO PROCESSAR (uma subpasta por vez) =====
    if(modo === 'processar'){
      const subfolderIndex = Number(body.subfolder_index ?? 0);
      const subpastas = await listSubfolders(accessToken, ROOT_FOLDER_ID);
      if(subfolderIndex >= subpastas.length){
        return Response.json({ success: true, modo: 'processar', done: true, message: 'Todas as subpastas processadas.' });
      }
      const sp = subpastas[subfolderIndex];
      const imgs = await listFolderImagesLimited(accessToken, sp.id, [sp.name]).catch(() => []);
      let criadas = 0, erros = 0;
      const falhas: any[] = [];

      for(const img of imgs){
        try {
          const nomePasta = sp.name;
          const museu = extrairMuseu(nomePasta);
          const { mes, mesNum, ano } = extrairMesAno(nomePasta);
          const contexto = [...(img._path||[]), img.name].join(' ');
          const nomePad = `GALERIA_${museu.replace(/\s+/g,'_')}_${String(mesNum||'00').padStart(2,'0')}_${ano}_${img.name.replace(/\s+/g,'_').slice(0,60)}`.replace(/[^a-zA-Z0-9_.-]/g,'_');
          const fileUrl = await baixarEEnviar(base44, accessToken, img);
          await base44.asServiceRole.entities.ReportPhoto.create({
            file_url: fileUrl,
            file_name: nomePad,
            caption: contexto.slice(0, 200),
            legenda: contexto.slice(0, 200),
            museu,
            mes_referencia: mes,
            ano,
            drive_file_id: img.id,
            drive_backup_status: 'concluido',
            fonte_ia: 'drive_sync',
            contexto_ia: JSON.stringify({ pasta_origem: nomePasta, caminho: (img._path||[]).join('/'), origem: 'Importação Fotografia Drive' }),
          });
          criadas++;
        } catch(error: any){
          erros++;
          falhas.push({ id: img.id, nome: img.name, erro: String(error?.message||error) });
        }
      }

      return Response.json({
        success: erros === 0, modo: 'processar',
        subfolder_index: subfolderIndex,
        subfolder_name: sp.name,
        total_subfolders: subpastas.length,
        imagens: imgs.length, criadas, erros, falhas,
        has_more: subfolderIndex + 1 < subpastas.length,
        next_index: subfolderIndex + 1
      });
    }

    return Response.json({ success: false, error: 'Modo desconhecido: ' + modo }, { status: 400 });
  } catch(error: any){
    return Response.json({ success: false, error: String(error?.message||error) }, { status: 500 });
  }
});