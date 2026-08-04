import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const PASTAS_DRIVE = [
  { id: '1zwGkjC3YK62U0xf72SlBLC0YcoEykVU5', nome: 'Casa do Baile' },
  { id: '1UyE7LOwcveYLTuQ4d-a0ZlAXiPJ67J7m', nome: 'Museu de Arte da Pampulha' },
  { id: '1qToudYUOf1MUJgZCT4v9p2w5KJfMP8dp', nome: 'Museu Histórico Abílio Barreto' },
  { id: '1AKvhVab7MlLgrvwf6QPSmkEQ5P_J8Pj1', nome: 'Passeio de Barco' },
  { id: '11tlhwDZ8YnjDmh6uUU72wvwQrkEXMuxO', nome: 'Museu da Imagem e do Som de Belo Horizonte' },
  { id: '1OhHErYW9oQobBwKjj8g3sJXH1cBhheQ5', nome: 'Museu Casa Kubitschek' },
  { id: '1j44N8BufKJd64MhdwD0L1pWqIyammD0j', nome: 'Museu da Moda de Belo Horizonte (MUMO)' },
];
const MESES_CAP = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function normalize(s: any){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' '); }
function normalizeMes(text: any){
  const t = normalize(text);
  for(let i=0;i<MESES_NOMES.length;i++){ if(t.includes(normalize(MESES_NOMES[i]))) return { mes: MESES_CAP[i], mesNum: i+1 }; }
  const m = t.match(/(?:^|\D)(0?[1-9]|1[0-2])(?:\D|$)/);
  if(m){ const n=Number(m[1]); return { mes: MESES_CAP[n-1], mesNum: n }; }
  return null;
}
function normalizeMuseu(text: any){
  const t = normalize(text);
  if(t.includes('casa do baile')||t.includes('casa baile')) return 'Casa do Baile';
  if(t.includes('mis')||t.includes('imagem')||t.includes('som')) return 'MIS';
  if(t.includes('mhab')||t.includes('abilio')||t.includes('historico')) return 'MHAB';
  if(t.includes('mumo')||t.includes('moda')) return 'MUMO';
  if(t.includes('map')||t.includes('pampulha')||t.includes('arte da pampulha')) return 'MAP';
  if(t.includes('noturno')) return 'NOTURNO';
  return null;
}

async function listFolderImages(accessToken: string, folderId: string, path: string[] = []): Promise<any[]>{
  const out: any[] = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,md5Checksum,webViewLink,thumbnailLink,createdTime,modifiedTime,parents)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if(!res.ok) throw new Error(`Drive list HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const folders: any[] = [];
    const images: any[] = [];
    for(const item of data.files || []){
      if(item.mimeType === 'application/vnd.google-apps.folder') folders.push(item);
      else if(String(item.mimeType||'').startsWith('image/')) images.push({ ...item, _path: path });
    }
    out.push(...images); // 100% — sem limite
    for(const folder of folders){
      out.push(...await listFolderImages(accessToken, folder.id, [...path, folder.name]));
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

function classificarFoto(img: any, pastaNome: string){
  const contexto = [...(img._path||[]), img.name].join(' ');
  const museu = normalizeMuseu(contexto) || 'GERAL';
  const mes = normalizeMes(contexto);
  const anoMatch = contexto.match(/20\d{2}/);
  const ano = anoMatch ? Number(anoMatch[0]) : new Date(img.createdTime||Date.now()).getFullYear();
  const nomePad = `GALERIA_${museu.replace(/\s+/g,'_')}_${String(mes?.mesNum||'00').padStart(2,'0')}_${ano}_${img.name.replace(/\s+/g,'_').slice(0,60)}`.replace(/[^a-zA-Z0-9_.-]/g,'_');
  return { museu, mes: mes?.mes || '', mesNum: mes?.mesNum || null, ano, file_name: nomePad, contexto };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch {}
    if(!user) return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const targetOffset = Number(body.offset ?? 0);
    const maxNoRequest = Number(body.max_no_request ?? 12); // quantas fotos baixa por request

    const connection = await base44.asServiceRole.connectors.getConnection('googledrive').catch(() => null);
    const accessToken = connection?.accessToken;
    if(!accessToken) return Response.json({ success: false, code: 'DRIVE_NOT_CONNECTED', error: 'Google Drive não conectado.' }, { status: 401 });

    // 1. Lista todas as 7 pastas recursivamente (uma única vez)
    const todasImagens: any[] = [];
    for(const p of PASTAS_DRIVE){
      const imgs = await listFolderImages(accessToken, p.id, [p.nome]).catch(() => []);
      for(const img of imgs) todasImagens.push({ ...img, _pasta_nome: p.nome });
    }

    // 2. Deduplicação contra ReportPhoto existentes
    const existentes = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 10000).catch(() => []);
    const porDriveId = new Map<string, any>();
    for(const foto of existentes){
      const id = foto?.drive_file_id;
      if(id && !porDriveId.has(id)) porDriveId.set(id, foto);
    }

    // 3. Processa um bloco a partir de targetOffset
    const bloco = todasImagens.slice(targetOffset, targetOffset + maxNoRequest);
    let criadas = 0, erros = 0, puladas = 0;
    const falhas: any[] = [];

    for(const img of bloco){
      try {
        const existente = porDriveId.get(img.id);
        const urlOk = existente?.file_url && !/drive\.google\.com/i.test(String(existente.file_url));
        if(existente && urlOk){ puladas++; continue; }

        const info = classificarFoto(img, img._pasta_nome);
        const fileUrl = await baixarEEnviar(base44, accessToken, img);
        if(existente?.id){
          await base44.asServiceRole.entities.ReportPhoto.update(existente.id, {
            file_url: fileUrl,
            file_name: info.file_name,
            caption: info.contexto.slice(0, 200),
            legenda: info.contexto.slice(0, 200),
            museu: info.museu.toUpperCase(),
            mes_referencia: info.mes,
            ano: info.ano,
            drive_backup_status: 'concluido',
            fonte_ia: 'drive_sync',
            contexto_ia: JSON.stringify({ pasta_origem: img._pasta_nome, caminho: (img._path||[]).join('/'), origem: 'Restauração 100%' }),
          });
        } else {
          await base44.asServiceRole.entities.ReportPhoto.create({
            file_url: fileUrl,
            file_name: info.file_name,
            caption: info.contexto.slice(0, 200),
            legenda: info.contexto.slice(0, 200),
            museu: info.museu.toUpperCase(),
            mes_referencia: info.mes,
            ano: info.ano,
            drive_file_id: img.id,
            drive_backup_status: 'concluido',
            fonte_ia: 'drive_sync',
            contexto_ia: JSON.stringify({ pasta_origem: img._pasta_nome, caminho: (img._path||[]).join('/'), origem: 'Restauração 100%' }),
          });
        }
        criadas++;
      } catch(error: any){
        erros++;
        falhas.push({ id: img.id, nome: img.name, erro: String(error?.message||error) });
      }
    }

    const nextOffset = targetOffset + maxNoRequest;
    return Response.json({
      success: erros === 0,
      modo: 'restaurar_100',
      total_imagens: todasImagens.length,
      offset: targetOffset,
      next_offset: nextOffset,
      has_more: nextOffset < todasImagens.length,
      criadas, erros, puladas, falhas,
    });
  } catch(error: any){
    return Response.json({ success: false, error: String(error?.message||error) }, { status: 500 });
  }
});