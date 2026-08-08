import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const FOLDER_GERAL = '1KHek34-ES3eef7E7YAh4q8ZhLgjPZuZC';
const FOLDER_MIS_MEDIACAO = '1s8t3ERUthNKEStvFAKyGChXlu3MLVuzn';
const MESES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES_CAP = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const BATCH_SIZE = 5;

function normalize(s: any){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' '); }
function normalizeMes(text: any){
  const t = normalize(text);
  for(let i=0;i<MESES_NOMES.length;i++){
    if(t.includes(normalize(MESES_NOMES[i]))) return { mes: MESES_CAP[i], mesNum: i+1 };
  }
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
    for(const item of data.files || []){
      if(item.mimeType === 'application/vnd.google-apps.folder'){
        out.push(...await listFolderImages(accessToken, item.id, [...path, item.name]));
      } else if(String(item.mimeType||'').startsWith('image/')){
        out.push({ ...item, _path: path });
      }
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

function classificarGeral(img: any){
  const contexto = [...(img._path||[]), img.name].join(' ');
  const museu = normalizeMuseu(contexto) || 'GERAL';
  const mes = normalizeMes(contexto);
  const anoMatch = contexto.match(/20\d{2}/);
  const ano = anoMatch ? Number(anoMatch[0]) : new Date(img.createdTime||Date.now()).getFullYear();
  const nomePad = `GALERIA_${museu.replace(/\s+/g,'_')}_${String(mes?.mesNum||'00').padStart(2,'0')}_${ano}_${img.name.replace(/\s+/g,'_').slice(0,60)}`.replace(/[^a-zA-Z0-9_.-]/g,'_');
  return { museu, mes: mes?.mes || '', mesNum: mes?.mesNum || null, ano, file_name: nomePad, contexto };
}

async function analisarFotoMIS(base44: any, fileUrl: string, imgName: string, programacao: any[]): Promise<any>{
  const progResumida = programacao
    .filter(p => normalize(p.museu||'').includes('mis') || normalize(p.local||'').includes('mis') || normalize(p.titulo||'').includes('media'))
    .slice(0, 30)
    .map(p => ({ titulo: p.titulo, data: p.data||p.data_inicio, horario: p.horario, local: p.local, tipo: p.tipo||p.tipo_atividade, descricao: (p.descricao||p.sinopse||'').slice(0,200) }));

  const prompt = `Analise esta foto do acervo do MIS (Museu da Imagem e do Som) — pasta "MIS Mediação".
Com base na imagem e na programação cultural abaixo, identifique:
1. Que atividade/evento está retratado
2. Data aproximada (mês e ano)
3. Local dentro do museu
4. Descrição curta para legenda

Programação MIS relevante:
${JSON.stringify(progResumida)}

Nome do arquivo: "${imgName}"

Retorne APENAS JSON: {"atividade":"...","mes":"...","ano":2026,"local":"...","legenda":"...","museu":"MIS"}`;
  try {
    const res = await invokeLLM(base44.asServiceRole,{
      prompt,
      file_urls: [fileUrl],
      response_json_schema: {
        type: 'object',
        properties: {
          atividade: { type: 'string' },
          mes: { type: 'string' },
          ano: { type: 'number' },
          local: { type: 'string' },
          legenda: { type: 'string' },
          museu: { type: 'string' }
        }
      }
    });
    return res || {};
  } catch(e){
    return { atividade: imgName, mes: '', ano: new Date().getFullYear(), local: 'MIS', legenda: imgName, museu: 'MIS' };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch {}
    if(!user) return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const modo = String(body.modo || 'listar');
    const offset = Number(body.offset ?? 0);

    const connection = await base44.asServiceRole.connectors.getConnection('googledrive').catch(() => null);
    const accessToken = connection?.accessToken;
    if(!accessToken) return Response.json({ success: false, code: 'DRIVE_NOT_CONNECTED', error: 'Google Drive não conectado.' }, { status: 401 });

    // ===== MODO LIMPAR =====
    if(modo === 'limpar'){
      const todas = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 5000).catch(() => []);
      let deletadas = 0;
      for(const foto of todas){
        await base44.asServiceRole.entities.ReportPhoto.delete(foto.id).catch(() => {});
        deletadas++;
      }
      return Response.json({ success: true, modo: 'limpar', deletadas, total_anterior: todas.length });
    }

    // ===== MODO LISTAR =====
    if(modo === 'listar'){
      const [geral, mis] = await Promise.all([
        listFolderImages(accessToken, FOLDER_GERAL).catch(() => []),
        listFolderImages(accessToken, FOLDER_MIS_MEDIACAO).catch(() => [])
      ]);
      return Response.json({
        success: true, modo: 'listar',
        total_geral: geral.length,
        total_mis: mis.length,
        total: geral.length + mis.length
      });
    }

    // ===== MODO PROCESSAR GERAL =====
    if(modo === 'processar_geral'){
      const imagens = await listFolderImages(accessToken, FOLDER_GERAL).catch(() => []);
      const bloco = imagens.slice(offset, offset + BATCH_SIZE);
      let criadas = 0, erros = 0;
      const falhas: any[] = [];

      for(const img of bloco){
        try {
          const info = classificarGeral(img);
          const fileUrl = await baixarEEnviar(base44, accessToken, img);
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
          });
          criadas++;
        } catch(error: any){
          erros++;
          falhas.push({ id: img.id, nome: img.name, erro: String(error?.message||error) });
        }
      }

      const nextOffset = offset + BATCH_SIZE;
      return Response.json({
        success: erros === 0, modo: 'processar_geral',
        total_imagens: imagens.length, offset,
        next_offset: nextOffset, has_more: nextOffset < imagens.length,
        criadas, erros, falhas
      });
    }

    // ===== MODO PROCESSAR MIS (com IA) =====
    if(modo === 'processar_mis'){
      const [imagens, programacao] = await Promise.all([
        listFolderImages(accessToken, FOLDER_MIS_MEDIACAO).catch(() => []),
        base44.asServiceRole.entities.Programacao.list('-created_date', 500).catch(() => [])
      ]);
      const bloco = imagens.slice(offset, offset + BATCH_SIZE);
      let criadas = 0, erros = 0;
      const falhas: any[] = [];

      for(const img of bloco){
        try {
          const fileUrl = await baixarEEnviar(base44, accessToken, img);
          const analise = await analisarFotoMIS(base44, fileUrl, img.name, programacao);
          const mesNorm = normalizeMes(analise.mes || '');
          const ano = analise.ano || new Date(img.createdTime||Date.now()).getFullYear();
          const nomePad = `GALERIA_MIS_${String(mesNorm?.mesNum||'00').padStart(2,'0')}_${ano}_${img.name.replace(/\s+/g,'_').slice(0,60)}`.replace(/[^a-zA-Z0-9_.-]/g,'_');
          await base44.asServiceRole.entities.ReportPhoto.create({
            file_url: fileUrl,
            file_name: nomePad,
            caption: analise.legenda || analise.atividade || img.name,
            legenda: analise.legenda || analise.atividade || img.name,
            museu: 'MIS',
            mes_referencia: mesNorm?.mes || MESES_CAP[new Date(img.createdTime||Date.now()).getMonth()],
            ano,
            drive_file_id: img.id,
            drive_backup_status: 'concluido',
            fonte_ia: 'drive_sync',
            contexto_ia: JSON.stringify({ atividade: analise.atividade, local: analise.local, data_foto: analise.mes, origem: 'MIS Mediação' }),
          });
          criadas++;
        } catch(error: any){
          erros++;
          falhas.push({ id: img.id, nome: img.name, erro: String(error?.message||error) });
        }
      }

      const nextOffset = offset + BATCH_SIZE;
      return Response.json({
        success: erros === 0, modo: 'processar_mis',
        total_imagens: imagens.length, offset,
        next_offset: nextOffset, has_more: nextOffset < imagens.length,
        criadas, erros, falhas
      });
    }

    return Response.json({ success: false, error: 'Modo desconhecido: ' + modo }, { status: 400 });
  } catch(error: any){
    return Response.json({ success: false, error: String(error?.message||error) }, { status: 500 });
  }
});