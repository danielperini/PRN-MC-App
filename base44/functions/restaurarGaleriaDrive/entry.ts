import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { authorizeAdminOrCoordinator } from '../_shared/authorization.ts';

const MESES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const TAMANHO_BLOCO = 10;

function normalize(value:any){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
function normalizeMes(text:any){
  const t=normalize(text);
  for(let i=0;i<MESES_NOMES.length;i++){const mes=normalize(MESES_NOMES[i]);if(t.includes(mes))return{mes:MESES_NOMES[i],mesNum:i+1};}
  const match=t.match(/(?:^|\D)(0?[1-9]|1[0-2])(?:\D|$)/);if(!match)return null;const n=Number(match[1]);return{mes:MESES_NOMES[n-1],mesNum:n};
}
function normalizeMuseu(text:any){const t=normalize(text);if(t.includes('mis')||t.includes('imagem')||t.includes('som'))return'MIS';if(t.includes('mhab')||t.includes('abilio')||t.includes('historico'))return'MHAB';if(t.includes('mumo')||t.includes('moda'))return'MUMO';return null}
function extrairAtividadeDoNome(fileName=''){const match=String(fileName).match(/__([^_][^_]+(?:_[^_][^_]+)*)__\d+\.\w+$/)||String(fileName).match(/^(.+?)__\d{10,}/);return match?match[1].replace(/_/g,' ').replace(/\s+/g,' ').trim():null}
function formatarData(value:any){if(!value)return'';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`}
function nomeAtividade(a:any){return a?.titulo||a?.nome||a?.descricao||''}
function idAtividade(a:any){return a?.id||a?._id||a?.activity_id||null}
function gerarLegenda(fileName:string,atividade:any,museu:any,mes:any,ano:any){
  const nome=nomeAtividade(atividade)||extrairAtividadeDoNome(fileName)||'Sem vínculo';
  const local=atividade?.local||atividade?.local_realizacao||museu||'';
  const data=formatarData(atividade?.data_realizacao||atividade?.data_inicio)||((mes&&ano)?`${mes}/${ano}`:'');
  return[nome,local,data].filter(Boolean).join(' — ');
}
function activityScore(atividade:any,fileName:string,museu:any,mes:any,ano:any){
  const texto=normalize(fileName);const nome=normalize(nomeAtividade(atividade));let score=0;
  if(nome&&texto&&(texto.includes(nome)||nome.split(' ').filter((p:string)=>p.length>3).some((p:string)=>texto.includes(p))))score+=7;
  if(museu&&normalize(atividade?.museu||atividade?.local).includes(normalize(museu)))score+=2;
  const data=atividade?.data_realizacao||atividade?.data_inicio;const d=data?new Date(data):null;
  if(d&&!Number.isNaN(d.getTime())&&mes&&d.getMonth()+1===mes.mesNum)score+=4;
  if(d&&!Number.isNaN(d.getTime())&&ano&&d.getFullYear()===ano)score+=2;
  return score;
}
async function listFolderImages(accessToken:string,folderId:string,path:string[]=[]):Promise<any[]>{
  const out:any[]=[];let pageToken='';
  do{
    const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields=encodeURIComponent('nextPageToken,files(id,name,mimeType,size,md5Checksum,webViewLink,thumbnailLink,createdTime,modifiedTime,parents)');
    const url=`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`;
    const res=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});if(!res.ok)throw new Error(`Google Drive listagem HTTP ${res.status}: ${await res.text()}`);
    const data=await res.json();
    for(const item of data.files||[]){
      if(item.mimeType==='application/vnd.google-apps.folder')out.push(...await listFolderImages(accessToken,item.id,[...path,item.name]));
      else if(String(item.mimeType||'').startsWith('image/'))out.push({...item,_path:path});
    }
    pageToken=data.nextPageToken||'';
  }while(pageToken);
  return out;
}
async function baixarEEnviar(base44:any,accessToken:string,img:any){
  const download=await fetch(`https://www.googleapis.com/drive/v3/files/${img.id}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${accessToken}`}});
  if(!download.ok)throw new Error(`Download Drive HTTP ${download.status}: ${await download.text()}`);
  const bytes=await download.arrayBuffer();if(!bytes.byteLength)throw new Error('Arquivo baixado do Drive está vazio.');
  const file=new File([bytes],img.name,{type:img.mimeType||'image/jpeg'});
  const upload=await base44.asServiceRole.integrations.Core.UploadFile({file});
  const fileUrl=upload?.file_url||upload?.url||upload?.data?.file_url;
  if(!fileUrl)throw new Error('Upload para o armazenamento do Base44 não retornou URL.');
  return fileUrl;
}
function urlEhDrive(url:any){return /drive\.google\.com|googleusercontent\.com/i.test(String(url||''))}

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const authorization=await authorizeAdminOrCoordinator(base44);if(!authorization.ok)return authorization.response;
    const user=authorization.user;
    const body=await req.json().catch(()=>({}));const folderId=String(body.folder_id||'').trim();const modo=String(body.modo||'preview');
    if(!folderId)return Response.json({success:false,error:'folder_id obrigatório'},{status:400});
    const connection=await base44.asServiceRole.connectors.getConnection('googledrive').catch(()=>null);const accessToken=connection?.accessToken;
    if(!accessToken)return Response.json({success:false,code:'DRIVE_NOT_CONNECTED',error:'Google Drive não está conectado.'},{status:401});

    const [imagens,reports,fotosExistentes,attachments]=await Promise.all([
      listFolderImages(accessToken,folderId),
      base44.asServiceRole.entities.Report.list('-created_date',3000).catch(()=>[]),
      base44.asServiceRole.entities.ReportPhoto.list('-created_date',5000).catch(()=>[]),
      base44.asServiceRole.entities.Attachment.list('-created_date',5000).catch(()=>[]),
    ]);
    const existentePorDrive=new Map<string,any>();
    [...fotosExistentes,...attachments].forEach((foto:any)=>{const id=foto?.drive_file_id||foto?.google_drive_file_id;if(id&&!existentePorDrive.has(id))existentePorDrive.set(id,foto)});
    const resultados:any[]=[];

    for(const img of imagens){
      const contexto=[...(img._path||[]),img.name].join(' ');const museuDetectado=normalizeMuseu(contexto);const mesDetectado=normalizeMes(contexto);const anoMatch=contexto.match(/20\d{2}/);const ano=anoMatch?Number(anoMatch[0]):new Date(img.createdTime||Date.now()).getFullYear();
      let reportVinculado:any=null;
      const candidatos=(reports||[]).filter((report:any)=>{
        const museuOk=!museuDetectado||normalizeMuseu(report.museu)===museuDetectado;
        const mesOk=!mesDetectado||normalize(report.mes_referencia)===normalize(mesDetectado.mes)||Number(report.mes_num)===mesDetectado.mesNum;
        const anoOk=!report.ano||Number(report.ano)===ano;return museuOk&&mesOk&&anoOk;
      });
      reportVinculado=candidatos[0]||null;
      const atividades=(reportVinculado?.atividades||reportVinculado?.activities||reportVinculado?.atividades_realizadas||[]).filter(Boolean);
      const ranked=atividades.map((atividade:any)=>({atividade,score:activityScore(atividade,img.name,museuDetectado,mesDetectado,ano)})).sort((a:any,b:any)=>b.score-a.score);
      const atividadeVinculada=ranked[0]?.score>=4?ranked[0].atividade:null;
      if(!reportVinculado&&ranked[0]?.atividade)reportVinculado=reports.find((r:any)=>(r.atividades||[]).some((a:any)=>idAtividade(a)===idAtividade(ranked[0].atividade)))||null;
      const existente=existentePorDrive.get(img.id);const precisaDownload=!existente||!existente.file_url||urlEhDrive(existente.file_url);
      const legenda=gerarLegenda(img.name,atividadeVinculada,museuDetectado||reportVinculado?.museu,mesDetectado?.mes||reportVinculado?.mes_referencia,ano);
      const museu=String(museuDetectado||reportVinculado?.museu||'').toUpperCase()||null;const mes=mesDetectado?.mes||reportVinculado?.mes_referencia||null;
      const nomePad=`GALERIA_${museu||'GERAL'}_${String(mesDetectado?.mesNum||'00').padStart(2,'0')}_${ano}_${img.name.replace(/\s+/g,'_').slice(0,60)}`.replace(/[^a-zA-Z0-9_.-]/g,'_');
      resultados.push({drive_file_id:img.id,drive_nome_original:img.name,drive_url:img.webViewLink,thumbnail_url:img.thumbnailLink||'',file_name:nomePad,mime_type:img.mimeType,size_bytes:Number(img.size||0),md5_checksum:img.md5Checksum||'',legenda,museu,mes,mes_num:mesDetectado?.mesNum||null,ano,report_id:reportVinculado?.id||null,report_autor:reportVinculado?.author_name||'',atividade_id:idAtividade(atividadeVinculada),atividade_titulo:nomeAtividade(atividadeVinculada)||null,atividade_data:atividadeVinculada?.data_realizacao||atividadeVinculada?.data_inicio||null,ja_importada:Boolean(existente&&!precisaDownload),precisa_reparar:Boolean(existente&&precisaDownload),selecionada:precisaDownload});
    }

    if(modo!=='confirmar')return Response.json({success:true,modo:'preview',total_imagens:imagens.length,total_novas:resultados.filter(r=>!r.ja_importada&&!r.precisa_reparar).length,total_reparar:resultados.filter(r=>r.precisa_reparar).length,total_ja_importadas:resultados.filter(r=>r.ja_importada).length,resultados});

    const selecionadas=resultados.filter(r=>!r.ja_importada||r.precisa_reparar);let criadas=0;let reparadas=0;let erros=0;const falhas:any[]=[];const totalBlocos=Math.ceil(selecionadas.length/TAMANHO_BLOCO);
    for(let inicio=0;inicio<selecionadas.length;inicio+=TAMANHO_BLOCO){
      const bloco=selecionadas.slice(inicio,inicio+TAMANHO_BLOCO);const blocoAtual=Math.floor(inicio/TAMANHO_BLOCO)+1;
      for(const foto of bloco){
        try{
          const img=imagens.find(i=>i.id===foto.drive_file_id);if(!img)throw new Error('Arquivo não localizado no lote do Drive.');
          const fileUrl=await baixarEEnviar(base44,accessToken,img);const existente=existentePorDrive.get(foto.drive_file_id);
          const payload={report_id:foto.report_id||'',file_name:foto.file_name,file_url:fileUrl,drive_file_id:foto.drive_file_id,caption:foto.legenda,mes_referencia:foto.mes||'',ano:foto.ano,author:foto.report_autor||''};
          if(existente?.id&&fotosExistentes.some((item:any)=>item.id===existente.id)){await base44.asServiceRole.entities.ReportPhoto.update(existente.id,payload);reparadas++;}
          else{await base44.asServiceRole.entities.ReportPhoto.create(payload);criadas++;}
          existentePorDrive.set(foto.drive_file_id,{...payload,id:existente?.id||foto.drive_file_id});
        }catch(error:any){erros++;falhas.push({drive_file_id:foto.drive_file_id,arquivo:foto.drive_nome_original,erro:String(error?.message||error),bloco:blocoAtual});}
      }
    }
    await base44.asServiceRole.entities.AuditLog.create({action:'CREATE',entity_type:'REPORT_PHOTO',entity_id:'batch',actor_email:user.email,actor_name:user.full_name||user.email,details:`Restauração real do Drive: ${criadas} criadas, ${reparadas} reparadas, ${erros} erros em ${totalBlocos} blocos. Pasta: ${folderId}`}).catch(()=>{});
    return Response.json({success:erros===0,modo:'confirmar',total_analisadas:imagens.length,total_processadas:selecionadas.length,total_criadas:criadas,total_reparadas:reparadas,total_erros:erros,total_ja_existiam:resultados.filter(r=>r.ja_importada).length,total_blocos:totalBlocos,falhas});
  }catch(error:any){return Response.json({success:false,error:String(error?.message||error)},{status:500})}
});
