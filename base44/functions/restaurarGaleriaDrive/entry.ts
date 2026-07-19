import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MESES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const BLOCO_DOWNLOAD = 5; // downloads por chamada de confirmar

function normalize(value: any){ return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' '); }
function normalizeMes(text: any){
  const t = normalize(text);
  for(let i = 0; i < MESES_NOMES.length; i++){
    const mes = normalize(MESES_NOMES[i]);
    if(t.includes(mes)) return { mes: MESES_NOMES[i], mesNum: i+1 };
  }
  const match = t.match(/(?:^|\D)(0?[1-9]|1[0-2])(?:\D|$)/);
  if(!match) return null;
  const n = Number(match[1]);
  return { mes: MESES_NOMES[n-1], mesNum: n };
}
function normalizeMuseu(text: any){
  const t = normalize(text);
  if(t.includes('casa do baile') || t.includes('casa baile')) return 'Casa do Baile';
  if(t.includes('mis') || t.includes('imagem') || t.includes('som')) return 'MIS';
  if(t.includes('mhab') || t.includes('abilio') || t.includes('historico')) return 'MHAB';
  if(t.includes('mumo') || t.includes('moda')) return 'MUMO';
  return null;
}
function extrairAtividadeDoNome(fileName = ''){
  const match = String(fileName).match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/) || String(fileName).match(/^(.+?)__\d{10,}/);
  return match ? match[1].replace(/_/g,' ').replace(/\s+/g,' ').trim() : null;
}
function formatarData(value: any){
  if(!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function nomeAtividade(a: any){ return a?.titulo || a?.nome || a?.descricao || ''; }
function idAtividade(a: any){ return a?.id || a?._id || a?.activity_id || null; }
function gerarLegenda(fileName: string, atividade: any, museu: any, mes: any, ano: any){
  const nome = nomeAtividade(atividade) || extrairAtividadeDoNome(fileName) || 'Sem vínculo';
  const local = atividade?.local || atividade?.local_realizacao || museu || '';
  const data = formatarData(atividade?.data_realizacao || atividade?.data_inicio) || ((mes && ano) ? `${mes}/${ano}` : '');
  return [nome, local, data].filter(Boolean).join(' — ');
}
function activityScore(atividade: any, fileName: string, museu: any, mes: any, ano: any){
  const texto = normalize(fileName);
  const nome = normalize(nomeAtividade(atividade));
  let score = 0;
  if(nome && texto && (texto.includes(nome) || nome.split(' ').filter((p: string) => p.length > 3).some((p: string) => texto.includes(p)))) score += 7;
  if(museu && normalize(atividade?.museu || atividade?.local).includes(normalize(museu))) score += 2;
  const data = atividade?.data_realizacao || atividade?.data_inicio;
  const d = data ? new Date(data) : null;
  if(d && !Number.isNaN(d.getTime()) && mes && d.getMonth()+1 === mes.mesNum) score += 4;
  if(d && !Number.isNaN(d.getTime()) && ano && d.getFullYear() === ano) score += 2;
  return score;
}
async function listFolderImages(accessToken: string, folderId: string, path: string[] = []): Promise<any[]>{
  const out: any[] = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,md5Checksum,webViewLink,thumbnailLink,createdTime,modifiedTime,parents)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if(!res.ok) throw new Error(`Google Drive listagem HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for(const item of data.files || []){
      if(item.mimeType === 'application/vnd.google-apps.folder'){
        out.push(...await listFolderImages(accessToken, item.id, [...path, item.name]));
      } else if(String(item.mimeType || '').startsWith('image/')){
        out.push({ ...item, _path: path });
      }
    }
    pageToken = data.nextPageToken || '';
  } while(pageToken);
  return out;
}
async function baixarEEnviar(base44: any, accessToken: string, img: any){
  const download = await fetch(`https://www.googleapis.com/drive/v3/files/${img.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if(!download.ok) throw new Error(`Download Drive HTTP ${download.status}: ${await download.text()}`);
  const bytes = await download.arrayBuffer();
  if(!bytes.byteLength) throw new Error('Arquivo baixado do Drive está vazio.');
  const file = new File([bytes], img.name, { type: img.mimeType || 'image/jpeg' });
  const upload = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  const fileUrl = upload?.file_url || upload?.url || upload?.data?.file_url;
  if(!fileUrl) throw new Error('Upload para o armazenamento do Base44 não retornou URL.');
  return fileUrl;
}
function urlEhDrive(url: any){ return /drive\.google\.com|googleusercontent\.com/i.test(String(url || '')); }

function classificarImagem(img: any, reports: any[], fotosExistentes: any[], attachments: any[], existentePorDrive: Map<string, any>){
  const contexto = [...(img._path || []), img.name].join(' ');
  const museuDetectado = normalizeMuseu(contexto);
  const mesDetectado = normalizeMes(contexto);
  const anoMatch = contexto.match(/20\d{2}/);
  const ano = anoMatch ? Number(anoMatch[0]) : new Date(img.createdTime || Date.now()).getFullYear();

  const candidatos = (reports || []).filter((report: any) => {
    const museuOk = !museuDetectado || normalizeMuseu(report.museu) === museuDetectado;
    const mesOk = !mesDetectado || normalize(report.mes_referencia) === normalize(mesDetectado.mes) || Number(report.mes_num) === mesDetectado.mesNum;
    const anoOk = !report.ano || Number(report.ano) === ano;
    return museuOk && mesOk && anoOk;
  });
  let reportVinculado: any = candidatos[0] || null;

  const atividades = (reportVinculado?.atividades || reportVinculado?.activities || []).filter(Boolean);
  const ranked = atividades.map((a: any) => ({ atividade: a, score: activityScore(a, img.name, museuDetectado, mesDetectado, ano) })).sort((a: any, b: any) => b.score - a.score);
  const atividadeVinculada = ranked[0]?.score >= 4 ? ranked[0].atividade : null;

  if(!reportVinculado && ranked[0]?.atividade){
    reportVinculado = reports.find((r: any) => (r.atividades || []).some((a: any) => idAtividade(a) === idAtividade(ranked[0].atividade))) || null;
  }

  const existente = existentePorDrive.get(img.id);
  const precisaDownload = !existente || !existente.file_url || urlEhDrive(existente.file_url);
  const legenda = gerarLegenda(img.name, atividadeVinculada, museuDetectado || reportVinculado?.museu, mesDetectado?.mes || reportVinculado?.mes_referencia, ano);
  const museu = String(museuDetectado || reportVinculado?.museu || '').toUpperCase() || null;
  const mes = mesDetectado?.mes || reportVinculado?.mes_referencia || null;
  const nomePad = `GALERIA_${museu || 'GERAL'}_${String(mesDetectado?.mesNum || '00').padStart(2,'0')}_${ano}_${img.name.replace(/\s+/g,'_').slice(0,60)}`.replace(/[^a-zA-Z0-9_.-]/g,'_');

  return {
    drive_file_id: img.id,
    drive_nome_original: img.name,
    drive_url: img.webViewLink,
    thumbnail_url: img.thumbnailLink || '',
    file_name: nomePad,
    mime_type: img.mimeType,
    size_bytes: Number(img.size || 0),
    md5_checksum: img.md5Checksum || '',
    legenda,
    museu,
    mes,
    mes_num: mesDetectado?.mesNum || null,
    ano,
    report_id: reportVinculado?.id || null,
    report_autor: reportVinculado?.author_name || '',
    atividade_id: idAtividade(atividadeVinculada),
    atividade_titulo: nomeAtividade(atividadeVinculada) || null,
    atividade_data: atividadeVinculada?.data_realizacao || atividadeVinculada?.data_inicio || null,
    ja_importada: Boolean(existente && !precisaDownload),
    precisa_reparar: Boolean(existente && precisaDownload),
    selecionada: precisaDownload,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user: any = null;
    try { user = await base44.auth.me(); } catch { return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 }); }
    if(!user) return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const folderId = String(body.folder_id || '').trim();
    const modo = String(body.modo || 'preview');
    if(!folderId && modo !== 'reparar_casa_baile') return Response.json({ success: false, error: 'folder_id obrigatório' }, { status: 400 });

    // Paginação para preview
    const offset = Number(body.offset ?? 0);
    const limite = Number(body.limite ?? 80); // itens por página de preview

    const connection = await base44.asServiceRole.connectors.getConnection('googledrive').catch(() => null);
    const accessToken = connection?.accessToken;
    if(!accessToken){
      return Response.json({ success: false, code: 'DRIVE_NOT_CONNECTED', error: 'Google Drive não está conectado.' }, { status: 401 });
    }

    if(modo === 'reparar_casa_baile'){
      const todasFotos = await base44.asServiceRole.entities.ReportPhoto.list('-created_date', 5000).catch(() => []);
      const fotosCasaDoBaile = todasFotos.filter((foto: any) => normalizeMuseu(`${foto.museu || ''} ${foto.caption || ''} ${foto.legenda || ''}`) === 'Casa do Baile' && foto.drive_file_id);
      const bloco = fotosCasaDoBaile.slice(offset, offset + BLOCO_DOWNLOAD);
      let reparadas = 0;
      const falhas: any[] = [];

      for(const foto of bloco){
        try {
          const extensao = String(foto.file_name || '').split('.').pop()?.toLowerCase() || 'jpg';
          const mimeType = extensao === 'png' ? 'image/png' : extensao === 'webp' ? 'image/webp' : 'image/jpeg';
          const fileUrl = await baixarEEnviar(base44, accessToken, { id: foto.drive_file_id, name: foto.file_name || `casa-do-baile.${extensao}`, mimeType });
          await base44.asServiceRole.entities.ReportPhoto.update(foto.id, { file_url: fileUrl });
          reparadas++;
        } catch(error: any){
          falhas.push({ id: foto.id, arquivo: foto.file_name, erro: String(error?.message || error) });
        }
      }

      const nextOffset = offset + BLOCO_DOWNLOAD;
      return Response.json({
        success: falhas.length === 0,
        modo,
        total_imagens: fotosCasaDoBaile.length,
        bloco_processado: bloco.length,
        reparadas,
        total_erros: falhas.length,
        falhas,
        next_offset: nextOffset,
        has_more: nextOffset < fotosCasaDoBaile.length,
      });
    }

    // Buscar dados em paralelo
    const [imagensEncontradas, reports, fotosExistentes, attachments] = await Promise.all([
      listFolderImages(accessToken, folderId),
      base44.asServiceRole.entities.Report.list('-created_date', 3000).catch(() => []),
      base44.asServiceRole.entities.ReportPhoto.list('-created_date', 5000).catch(() => []),
      base44.asServiceRole.entities.Attachment.list('-created_date', 5000).catch(() => []),
    ]);
    const filtroMuseu = normalizeMuseu(body.museu_filter || '');
    const imagens = filtroMuseu
      ? imagensEncontradas.filter((img: any) => normalizeMuseu([...(img._path || []), img.name].join(' ')) === filtroMuseu)
      : imagensEncontradas;

    const existentePorDrive = new Map<string, any>();
    [...fotosExistentes, ...attachments].forEach((foto: any) => {
      const id = foto?.drive_file_id || foto?.google_drive_file_id;
      if(id && !existentePorDrive.has(id)) existentePorDrive.set(id, foto);
    });

    // ==== MODO PREVIEW (paginado) ====
    if(modo !== 'confirmar'){
      const totalImagens = imagens.length;
      const imagensPagina = imagens.slice(offset, offset + limite);
      const resultados = imagensPagina.map(img => classificarImagem(img, reports, fotosExistentes, attachments, existentePorDrive));

      // Totais globais (calculados sobre todas as imagens, mas rápido pois não baixa nada)
      let totalNovas = 0; let totalReparar = 0; let totalJaImportadas = 0;
      for(const img of imagens){
        const ex = existentePorDrive.get(img.id);
        if(!ex) totalNovas++;
        else if(!ex.file_url || urlEhDrive(ex.file_url)) totalReparar++;
        else totalJaImportadas++;
      }

      return Response.json({
        success: true,
        modo: 'preview',
        total_imagens: totalImagens,
        total_novas: totalNovas,
        total_reparar: totalReparar,
        total_ja_importadas: totalJaImportadas,
        offset,
        limite,
        has_more: offset + limite < totalImagens,
        resultados,
      });
    }

    // ==== MODO CONFIRMAR (bloco controlado por offset+limite) ====
    // Processa apenas um bloco de imagens para evitar timeout
    const blocoImagens = imagens.slice(offset, offset + BLOCO_DOWNLOAD);
    const selecionadas = blocoImagens.map(img => classificarImagem(img, reports, fotosExistentes, attachments, existentePorDrive))
      .filter(r => !r.ja_importada || r.precisa_reparar);

    let criadas = 0; let reparadas = 0; let erros = 0;
    const falhas: any[] = [];

    for(const foto of selecionadas){
      try {
        const img = blocoImagens.find(i => i.id === foto.drive_file_id);
        if(!img) throw new Error('Arquivo não localizado no bloco do Drive.');
        const fileUrl = await baixarEEnviar(base44, accessToken, img);
        const existente = existentePorDrive.get(foto.drive_file_id);
        const payload = {
          report_id: foto.report_id || '',
          file_name: foto.file_name,
          file_url: fileUrl,
          drive_file_id: foto.drive_file_id,
          caption: foto.legenda,
          mes_referencia: foto.mes || '',
          ano: foto.ano,
          author: foto.report_autor || '',
          museu: foto.museu || '',
          atividade_id: foto.atividade_id || '',
        };
        if(existente?.id && fotosExistentes.some((item: any) => item.id === existente.id)){
          await base44.asServiceRole.entities.ReportPhoto.update(existente.id, payload);
          reparadas++;
        } else {
          await base44.asServiceRole.entities.ReportPhoto.create(payload);
          criadas++;
        }
      } catch(error: any){
        erros++;
        falhas.push({ drive_file_id: foto.drive_file_id, arquivo: foto.drive_nome_original, erro: String(error?.message || error) });
      }
    }

    const totalImagens = imagens.length;
    const nextOffset = offset + BLOCO_DOWNLOAD;
    const hasMore = nextOffset < totalImagens;

    if(!hasMore){
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'CREATE', entity_type: 'REPORT_PHOTO', entity_id: 'batch',
        actor_email: user.email, actor_name: user.full_name || user.email,
        details: `Restauração concluída: ${criadas} criadas, ${reparadas} reparadas, ${erros} erros. Pasta: ${folderId}`,
      }).catch(() => {});
    }

    return Response.json({
      success: erros === 0,
      modo: 'confirmar',
      offset,
      next_offset: nextOffset,
      has_more: hasMore,
      total_imagens: totalImagens,
      bloco_processado: blocoImagens.length,
      selecionadas_no_bloco: selecionadas.length,
      total_criadas: criadas,
      total_reparadas: reparadas,
      total_erros: erros,
      falhas,
    });

  } catch(error: any){
    return Response.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
});