import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const ROOT_FOLDER_ID = '1sI_XEZpUo3W5gcs2Nik3rGm1v6bAbKTh';
const MONTH_FOLDERS: Record<number, string | null> = {
  1: '1RV2mZM56GXI2CnDkwSJUp4y_s6uA82QX', 2: '1X7Ouq3bWMkw2FKuj5ToNrVqI8GT8fdU1',
  3: '1GPGPwo3mXZHmKLEI87GrfsvlHhnt7S9s', 4: '1VaIoAV8U9OFJNpwPQcd7Zg9_FM8NgV44',
  5: '155LK95qLqmv8QKRqBHUgJescETB1MOsw', 6: '166UanEeDSixvVKT7RhQ7edsTOtNqYdBT',
  7: '10udE1viTbqEtoGdpMZVcRA97SkpcWNsn',
};
const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_MAP: Record<string, number> = { janeiro:1, fevereiro:2, marco:3, abril:4, maio:5, junho:6, julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12, jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };

function normalize(v:any){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
function num(v:any){const x=Number(v||0);return Number.isFinite(x)?x:0}
function monthFromText(v:string){const t=normalize(v);for(const [k,m] of Object.entries(MONTH_MAP))if(t.includes(k))return m;return null}
function yearFromText(v:string){const m=String(v||'').match(/20\d{2}/);return m?Number(m[0]):null}
function isStatementPdf(f:any){if(f.mimeType!=='application/pdf')return false;const n=normalize(f.name);return n.includes('extrato')||n.includes('rendimento')||n.includes('investimento')||n.includes('aplicacao')}
function isYield(name:string){const n=normalize(name);return n.includes('rendimento')||n.includes('investimento')||n.includes('aplicacao')||n.includes('cdb')||n.includes('poupanca')}
function errorMessage(e:any){return String(e?.message||e||'Erro desconhecido').slice(0,800)}
function normalizedType(v:any){const t=normalize(v);if(t.includes('rend'))return 'rendimento';if(t.includes('cred')||t.includes('entrada'))return 'credito';if(t.includes('deb')||t.includes('saida')||t.includes('pagamento'))return 'debito';return t}
function fingerprint(l:any){return [normalize(l.data),normalize(l.descricao),normalizedType(l.tipo),Math.abs(num(l.valor)).toFixed(2),l.saldo==null?'':num(l.saldo).toFixed(2)].join('|')}
function deterministic(extracted:any, recordType:string){
  const seen=new Set<string>();
  const launches=(Array.isArray(extracted.lancamentos)?extracted.lancamentos:[]).map((l:any)=>({...l,tipo:normalizedType(l.tipo),valor:Math.abs(num(l.valor)),saldo:l.saldo==null?null:num(l.saldo)})).filter((l:any)=>{const f=fingerprint(l);if(seen.has(f))return false;seen.add(f);return true});
  const creditos=launches.filter((l:any)=>l.tipo==='credito').reduce((s:number,l:any)=>s+l.valor,0);
  const debitos=launches.filter((l:any)=>l.tipo==='debito').reduce((s:number,l:any)=>s+l.valor,0);
  const rendimentos=launches.filter((l:any)=>l.tipo==='rendimento').reduce((s:number,l:any)=>s+l.valor,0);
  const saldos=launches.filter((l:any)=>l.saldo!=null);
  const saldoFinal=saldos.length?num(saldos[saldos.length-1].saldo):num(extracted.saldo_final);
  const saldoInicial=num(extracted.saldo_inicial);
  return {
    lancamentos:launches,
    saldo_inicial:saldoInicial,
    saldo_final:saldoFinal,
    total_creditos:launches.length?creditos:num(extracted.total_creditos),
    total_debitos:launches.length?debitos:num(extracted.total_debitos),
    total_rendimento:recordType==='extrato_rendimento'?(rendimentos||Math.max(0,saldoFinal-saldoInicial)||num(extracted.total_rendimento)):num(extracted.total_rendimento),
    duplicados_removidos:Math.max(0,(extracted.lancamentos||[]).length-launches.length),
  };
}

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);const body=await req.json().catch(()=>({}));
    const user=await base44.auth.me().catch(()=>null);if(!user)return Response.json({success:false,error:'Unauthorized'},{status:401});
    if(!['admin','coordenador','coordinator'].includes(normalize(user.role)))return Response.json({success:false,error:'Apenas administradores ou coordenadores podem executar esta rotina.'},{status:403});
    let token:string|null=null;try{token=(await base44.asServiceRole.connectors.getConnection('googledrive'))?.accessToken||null}catch(_){ }
    if(!token)return Response.json({success:false,error:'Google Drive não está conectado.',code:'DRIVE_NOT_CONNECTED'},{status:401});

    async function listFolder(folderId:string){const out:any[]=[];let pageToken='';do{const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);const fields=encodeURIComponent('nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,md5Checksum)');const url=`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken?`&pageToken=${pageToken}`:''}`;const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Drive listagem HTTP ${r.status}: ${await r.text()}`);const d=await r.json();out.push(...(d.files||[]));pageToken=d.nextPageToken||''}while(pageToken);return out}
    async function collect(folderId:string,depth=0):Promise<any[]>{const items=await listFolder(folderId);const pdfs=items.filter(isStatementPdf);if(depth>=2)return pdfs;for(const folder of items.filter((i:any)=>i.mimeType==='application/vnd.google-apps.folder')){const n=normalize(folder.name);if(depth===0||n.includes('extrato')||n.includes('banco')||n.includes('financeiro'))pdfs.push(...await collect(folder.id,depth+1))}return pdfs}

    const requestedMonth=Number(body.mes_num||0),requestedYear=Number(body.ano||2026),explicitFolder=String(body.folder_id||'').trim()||null;
    const sources:Array<{folder_id:string,mes_num:number|null,ano:number}>=[];
    if(explicitFolder)sources.push({folder_id:explicitFolder,mes_num:requestedMonth||null,ano:requestedYear});
    else if(requestedMonth){const folder=MONTH_FOLDERS[requestedMonth];if(!folder)return Response.json({success:false,code:'MONTH_FOLDER_NOT_CONFIGURED',error:`A pasta de ${MONTH_NAMES[requestedMonth]||requestedMonth} não foi informada.`},{status:400});sources.push({folder_id:folder,mes_num:requestedMonth,ano:requestedYear})}
    else for(const [month,folder] of Object.entries(MONTH_FOLDERS))if(folder)sources.push({folder_id:folder,mes_num:Number(month),ano:2026});
    if(!sources.length)sources.push({folder_id:ROOT_FOLDER_ID,mes_num:null,ano:requestedYear});

    const pdfMap=new Map<string,any>();for(const source of sources)for(const file of await collect(source.folder_id))pdfMap.set(file.id,{...file,_mes_num:source.mes_num,_ano:source.ano});
    const pdfs=Array.from(pdfMap.values());
    const existing=await base44.asServiceRole.entities.MovimentacaoBancaria.list('-created_date',2000);
    const existingByDrive=new Map(existing.filter((r:any)=>r.drive_file_id).map((r:any)=>[r.drive_file_id,r]));
    const reprocess=Boolean(body.reprocessar_existentes);
    const candidates=pdfs.filter((f:any)=>reprocess||!existingByDrive.has(f.id));
    const batchSize=Math.max(1,Math.min(5,Number(body.batch_size||3)));const batch=candidates.slice(0,batchSize);
    const created:any[]=[],updated:any[]=[],errors:any[]=[];

    for(const pdf of batch){let stage='download';try{
      const type=isYield(pdf.name)?'extrato_rendimento':'extrato_conta';const monthNumber=Number(pdf._mes_num||monthFromText(pdf.name)||new Date(pdf.createdTime||Date.now()).getMonth()+1);const year=Number(pdf._ano||yearFromText(pdf.name)||requestedYear||new Date().getFullYear());
      const dl=await fetch(`https://www.googleapis.com/drive/v3/files/${pdf.id}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`}});if(!dl.ok)throw new Error(`Drive download HTTP ${dl.status}: ${await dl.text()}`);
      stage='upload';const bytes=await dl.arrayBuffer();if(!bytes.byteLength)throw new Error('O PDF baixado está vazio');const file=new File([bytes],pdf.name||`${pdf.id}.pdf`,{type:'application/pdf'});const upload=await base44.asServiceRole.integrations.Core.UploadFile({file});const url=upload?.file_url||upload?.url||upload?.data?.file_url;if(!url)throw new Error('Upload temporário não retornou URL');
      stage='analysis';const extracted=await base44.asServiceRole.integrations.Core.InvokeLLM({prompt:`Extraia fielmente os dados do extrato bancário brasileiro "${pdf.name}". Competência obrigatória: ${MONTH_NAMES[monthNumber]}/${year}. Retorne banco, conta, saldo inicial, saldo final e todos os lançamentos. Para cada lançamento: data DD/MM/AAAA, descrição, tipo credito/debito/rendimento, valor positivo e saldo. Não calcule totais; eles serão calculados deterministicamente pelo sistema.`,file_urls:[url],response_json_schema:{type:'object',properties:{banco:{type:'string'},conta:{type:'string'},saldo_inicial:{type:'number'},saldo_final:{type:'number'},total_creditos:{type:'number'},total_debitos:{type:'number'},total_rendimento:{type:'number'},lancamentos:{type:'array',items:{type:'object',properties:{data:{type:'string'},descricao:{type:'string'},tipo:{type:'string'},valor:{type:'number'},saldo:{type:'number'}}}},resumo_ia:{type:'string'}}}})||{};
      const totals=deterministic(extracted,type);const payload={mes:MONTH_NAMES[monthNumber],mes_num:monthNumber,ano:year,tipo,banco:extracted.banco||'Não identificado',conta:extracted.conta||'',saldo_inicial:totals.saldo_inicial,saldo_final:totals.saldo_final,total_creditos:totals.total_creditos,total_debitos:totals.total_debitos,total_rendimento:totals.total_rendimento,lancamentos:totals.lancamentos,drive_file_id:pdf.id,drive_file_url:pdf.webViewLink||`https://drive.google.com/file/d/${pdf.id}/view`,drive_file_name:pdf.name,processado_em:new Date().toISOString(),resumo_ia:`${extracted.resumo_ia||''} | Totais recalculados deterministicamente; ${totals.duplicados_removidos} lançamento(s) duplicado(s) removido(s).`.trim()};
      stage='persist';const current=existingByDrive.get(pdf.id);if(current){await base44.asServiceRole.entities.MovimentacaoBancaria.update(current.id,payload);updated.push({arquivo:pdf.name,id:current.id,mes_num:monthNumber,tipo})}else{const record=await base44.asServiceRole.entities.MovimentacaoBancaria.create(payload);existingByDrive.set(pdf.id,record);created.push({arquivo:pdf.name,id:record.id,mes_num:monthNumber,tipo})}
    }catch(e:any){errors.push({arquivo:pdf.name,drive_file_id:pdf.id,etapa:stage,erro:errorMessage(e)})}}

    return Response.json({success:true,resumo:{pastas_lidas:sources.length,pdfs_encontrados:pdfs.length,novos_no_drive:candidates.length,processados_neste_lote:batch.length,novos_criados:created.length,atualizados:updated.length,restantes:Math.max(0,candidates.length-batch.length),erros:errors.length},novos:created,atualizados:updated,erros:errors});
  }catch(e:any){return Response.json({success:false,error:errorMessage(e)},{status:500})}
});
