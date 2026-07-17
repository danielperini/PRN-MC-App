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
function num(v:any){
  if(typeof v==='number')return Number.isFinite(v)?v:0;
  if(v==null||v==='')return 0;
  let t=String(v).trim().replace(/R\$/gi,'').replace(/\s/g,'');
  const neg=t.includes('-')||/\d[\d.,]*D$/i.test(t);
  t=t.replace(/[CD]$/i,'').replace(/[^\d,.-]/g,'');
  if(t.includes(','))t=t.replace(/\./g,'').replace(',','.');
  else if((t.match(/\./g)||[]).length>1)t=t.replace(/\./g,'');
  const x=Number(t.replace(/(?!^)-/g,''));
  return Number.isFinite(x)?(neg?-Math.abs(x):x):0;
}
function monthFromText(v:string){const t=normalize(v);for(const [k,m] of Object.entries(MONTH_MAP))if(t.includes(k))return m;return null}
function yearFromText(v:string){const m=String(v||'').match(/20\d{2}/);return m?Number(m[0]):null}
function isStatementPdf(f:any){if(f.mimeType!=='application/pdf')return false;const n=normalize(f.name);return n.includes('extrato')||n.includes('rendimento')||n.includes('investimento')||n.includes('aplicacao')}
function errorMessage(e:any){return String(e?.message||e||'Erro desconhecido').slice(0,800)}
function parseBankDate(value:any,fallbackYear:number){
  const text=String(value||'').trim();let m=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);let year:number,month:number,day:number;
  if(m){year=Number(m[1]);month=Number(m[2]);day=Number(m[3]);}
  else{m=text.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);if(!m)return null;day=Number(m[1]);month=Number(m[2]);year=m[3]?Number(m[3]):fallbackYear;if(year<100)year+=2000;}
  if(!year||month<1||month>12||day<1||day>31)return null;
  return {year,month,day,key:`${year}-${String(month).padStart(2,'0')}`,normalized:`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`};
}
function dominantBankCompetence(launches:any[],fallbackYear:number,fallbackMonth:number){
  const counts=new Map<string,number>();
  for(const launch of launches){const parsed=parseBankDate(launch?.data,fallbackYear);if(parsed)counts.set(parsed.key,(counts.get(parsed.key)||0)+1);}
  const key=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||`${fallbackYear}-${String(fallbackMonth).padStart(2,'0')}`;
  const [year,month]=key.split('-').map(Number);return {key,year,month};
}

function typeFromFilename(name:string):'extrato_conta'|'extrato_rendimento'|null{
  const n=normalize(name);
  if(n.includes('extrato mensal')||n.includes('extrato da conta')||n.includes('extrato conta')||n.includes('conta corrente'))return 'extrato_conta';
  if(n.includes('rendimento')||n.includes('investimento')||n.includes('fundo')||n.includes('cdb')||n.includes('poupanca')||n.includes('aplicacao'))return 'extrato_rendimento';
  return null;
}
function typeFromAnalysis(v:any):'extrato_conta'|'extrato_rendimento'|null{
  const t=normalize(v);
  if(t.includes('fundo')||t.includes('investimento')||t.includes('rendimento')||t.includes('cotas'))return 'extrato_rendimento';
  if(t.includes('conta corrente')||t.includes('fluxo de caixa')||t.includes('extrato de conta'))return 'extrato_conta';
  return null;
}
function normalizedCD(v:any){const t=normalize(v).replace(/[^cd]/g,'');return t==='c'?'C':t==='d'?'D':''}
function isInternalDescription(description:string){const d=normalize(description);return /\bresg(ate| aut| automat| automatico)?\b/.test(d)||/\baplic(acao| automat| automatica| financeira)?\b/.test(d)||/\bapl(ic)?\b/.test(d)||['transferencia entre contas','transf entre contas','transferencia para aplicacao','conta investimento','investimento para conta corrente','conta corrente para investimento','resgate fundo','resgate cdb','aplicacao fundo','aplicacao cdb'].some(t=>d.includes(t))}
function isOperationalDebitDescription(description:string){const d=normalize(description);return d.includes('deb pix')||d.includes('deb pix ch')||d.includes('envio ted')||d.includes('pag boleto')||d.includes('envio tev')||d.includes('envio transf')||d.includes('tarifa')||d.includes('pagamento')}
function isYieldDescription(description:string){const d=normalize(description);return d.includes('rendimento bruto')||d.includes('rendimento no mes')||d.includes('rendimento liquido')||d.includes('rentabilidade')||d.includes('juros')||d.includes('correcao monetaria')||d.includes('resultado no mes')}

function classifyLaunch(l:any,recordType:string){
  const description=String(l?.descricao||l?.historico||'').trim();
  const cd=normalizedCD(l?.indicador_cd||l?.natureza_cd||l?.credito_debito);
  const internal=isInternalDescription(description);
  let launchType='';let category='nao_classificado';
  if(recordType==='extrato_rendimento'){
    if(isYieldDescription(description)){launchType='rendimento';category='rendimento_investimento';}
    else if(internal){launchType=cd==='C'?'credito':'debito';category='transferencia_interna_investimento';}
    else{launchType=cd==='C'?'credito':cd==='D'?'debito':normalize(l?.tipo_sugerido||l?.tipo);category='movimentacao_investimento';}
  }else{
    if(internal){launchType=cd==='D'?'debito':'credito';category='transferencia_interna_conta';}
    else if(cd==='D'||isOperationalDebitDescription(description)){launchType='debito';category='debito_operacional';}
    else if(cd==='C'){launchType='credito';category='credito_externo_candidato';}
    else{const informed=normalize(l?.tipo_sugerido||l?.tipo);launchType=informed.includes('cred')?'credito':informed.includes('deb')?'debito':informed.includes('rend')?'rendimento':informed;category=launchType==='debito'?'debito_operacional':launchType==='credito'?'credito_externo_candidato':'nao_classificado';}
  }
  return {...l,descricao:description,indicador_cd:cd,tipo:launchType,categoria:category,transferencia_interna:internal,valor:Math.abs(num(l?.valor)),saldo:l?.saldo==null?null:num(l.saldo)};
}

function deterministic(extracted:any,recordType:string){
  const launches=(Array.isArray(extracted.lancamentos)?extracted.lancamentos:[]).map((l:any)=>classifyLaunch(l,recordType));
  const credits=launches.filter((l:any)=>l.tipo==='credito').reduce((s:number,l:any)=>s+l.valor,0);
  const debits=launches.filter((l:any)=>l.tipo==='debito').reduce((s:number,l:any)=>s+l.valor,0);
  const explicitYield=launches.filter((l:any)=>l.tipo==='rendimento').reduce((s:number,l:any)=>s+l.valor,0);
  const balances=launches.filter((l:any)=>l.saldo!=null);
  const finalBalance=balances.length?num(balances[balances.length-1].saldo):num(extracted.saldo_final);
  const initialBalance=num(extracted.saldo_inicial);
  const informedYield=[extracted.rendimento_bruto_mes,extracted.rendimento_bruto_no_mes,extracted.rendimento_mes,extracted.total_rendimento,extracted.rendimentos,extracted.rentabilidade_mes,extracted.resultado_mes].map((v:any)=>Math.abs(num(v))).find((v:number)=>v>0)||0;
  const applications=launches.filter((l:any)=>l.transferencia_interna&&(l.indicador_cd==='C'||normalize(l.descricao).includes('aplicacao'))).reduce((s:number,l:any)=>s+l.valor,0);
  const redemptions=launches.filter((l:any)=>l.transferencia_interna&&(l.indicador_cd==='D'||normalize(l.descricao).includes('resgate'))).reduce((s:number,l:any)=>s+l.valor,0);
  const reconciledYield=recordType==='extrato_rendimento'?Math.max(0,finalBalance-initialBalance-applications+redemptions):0;
  const totalYield=recordType==='extrato_rendimento'?(explicitYield||informedYield||reconciledYield):Math.abs(num(extracted.total_rendimento));
  return {lancamentos:launches,saldo_inicial:initialBalance,saldo_final:finalBalance,total_creditos:launches.length?credits:num(extracted.total_creditos),total_debitos:launches.length?debits:num(extracted.total_debitos),total_rendimento:totalYield,debitos_operacionais:launches.filter((l:any)=>l.categoria==='debito_operacional').reduce((s:number,l:any)=>s+l.valor,0),transferencias_internas:launches.filter((l:any)=>l.transferencia_interna).reduce((s:number,l:any)=>s+l.valor,0)};
}

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);const body=await req.json().catch(()=>({}));
    const user=await base44.auth.me().catch(()=>null);if(!user)return Response.json({success:false,error:'Unauthorized'},{status:401});
    if(!['admin','coordenador','coordinator'].includes(normalize(user.role)))return Response.json({success:false,error:'Apenas administradores ou coordenadores podem executar esta rotina.'},{status:403});
    let token:string|null=null;try{token=(await base44.asServiceRole.connectors.getConnection('googledrive'))?.accessToken||null}catch(_){ }
    if(!token)return Response.json({success:false,error:'Google Drive não está conectado.',code:'DRIVE_NOT_CONNECTED'},{status:401});
    async function listFolder(folderId:string){const out:any[]=[];let pageToken='';do{const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);const fields=encodeURIComponent('nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,md5Checksum)');const url=`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken?`&pageToken=${pageToken}`:''}`;const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Drive listagem HTTP ${r.status}: ${await r.text()}`);const d=await r.json();out.push(...(d.files||[]));pageToken=d.nextPageToken||''}while(pageToken);return out}
    async function collect(folderId:string,depth=0):Promise<any[]>{if(depth>8)return [];const items=await listFolder(folderId);const pdfs=items.filter(isStatementPdf);for(const folder of items.filter((i:any)=>i.mimeType==='application/vnd.google-apps.folder')){pdfs.push(...await collect(folder.id,depth+1))}return pdfs}
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
    const reprocess=Boolean(body.reprocessar_existentes);const candidates=pdfs.filter((f:any)=>reprocess||!existingByDrive.has(f.id));
    const batchSize=Math.max(1,Math.min(5,Number(body.batch_size||3)));const batch=candidates.slice(0,batchSize);const created:any[]=[],updated:any[]=[],errors:any[]=[];

    for(const pdf of batch){let stage='download';try{
      const folderMonth=Number(pdf._mes_num||monthFromText(pdf.name)||new Date(pdf.createdTime||Date.now()).getMonth()+1);const folderYear=Number(pdf._ano||yearFromText(pdf.name)||requestedYear||new Date().getFullYear());
      const dl=await fetch(`https://www.googleapis.com/drive/v3/files/${pdf.id}?alt=media&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`}});if(!dl.ok)throw new Error(`Drive download HTTP ${dl.status}: ${await dl.text()}`);
      stage='upload';const bytes=await dl.arrayBuffer();if(!bytes.byteLength)throw new Error('O PDF baixado está vazio');const file=new File([bytes],pdf.name||`${pdf.id}.pdf`,{type:'application/pdf'});const upload=await base44.asServiceRole.integrations.Core.UploadFile({file});const url=upload?.file_url||upload?.url||upload?.data?.file_url;if(!url)throw new Error('Upload temporário não retornou URL');
      stage='analysis';const extracted=await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt:`Analise fielmente o extrato bancário brasileiro "${pdf.name}". A pasta sugere ${MONTH_NAMES[folderMonth]}/${folderYear}, mas a competência verdadeira de cada lançamento deve ser definida exclusivamente pela data bancária impressa na linha. Não mova lançamentos para o mês da pasta.
Classifique como conta corrente ou fundo de investimento. Capture cliente, CPF/CNPJ, banco, conta, saldos e rendimento bruto. Leia rigidamente C/D. RESGATE, RESG AUT e APLICAÇÃO são transferências internas; nunca são débito operacional. PIX, TED, TEV, boleto, pagamento e tarifa com D são débitos operacionais. Retorne todos os lançamentos com data DD/MM/AAAA, descrição literal, indicador_cd, valor positivo, saldo e tipo_sugerido.`,
        file_urls:[url],response_json_schema:{type:'object',properties:{tipo_documento:{type:'string'},nome_cliente:{type:'string'},cpf_cnpj_cliente:{type:'string'},mes_referencia:{type:'number'},ano_referencia:{type:'number'},banco:{type:'string'},numero_conta:{type:'string'},saldo_inicial:{type:'number'},saldo_final:{type:'number'},rendimento_bruto_mes:{type:'number'},rendimento_bruto_no_mes:{type:'number'},rendimento_mes:{type:'number'},rentabilidade_mes:{type:'number'},resultado_mes:{type:'number'},total_creditos:{type:'number'},total_debitos:{type:'number'},total_rendimento:{type:'number'},lancamentos:{type:'array',items:{type:'object',properties:{data:{type:'string'},descricao:{type:'string'},indicador_cd:{type:'string'},tipo_sugerido:{type:'string'},valor:{type:'number'},saldo:{type:'number'}}}},resumo_ia:{type:'string'}}}
      })||{};
      const documentType=typeFromFilename(pdf.name)||typeFromAnalysis(extracted.tipo_documento)||'extrato_conta';
      const totals=deterministic(extracted,documentType);
      const extractedYear=Number(extracted.ano_referencia||folderYear);const competence=dominantBankCompetence(totals.lancamentos,extractedYear,Number(extracted.mes_referencia||folderMonth));
      const launches=totals.lancamentos.map((l:any)=>{const parsed=parseBankDate(l.data,competence.year);return parsed?{...l,data:parsed.normalized,competencia_bancaria:parsed.key}:l});
      const metadata=`Tipo: ${documentType}; pasta origem: ${MONTH_NAMES[folderMonth]}/${folderYear}; competência bancária dominante: ${MONTH_NAMES[competence.month]}/${competence.year}; rendimento: ${totals.total_rendimento.toFixed(2)}; débitos operacionais: ${totals.debitos_operacionais.toFixed(2)}; transferências internas: ${totals.transferencias_internas.toFixed(2)}.`;
      const payload={mes:MONTH_NAMES[competence.month],mes_num:competence.month,ano:competence.year,tipo:documentType,banco:extracted.banco||'Não identificado',conta:extracted.numero_conta||extracted.conta||'',saldo_inicial:totals.saldo_inicial,saldo_final:totals.saldo_final,total_creditos:totals.total_creditos,total_debitos:totals.total_debitos,total_rendimento:totals.total_rendimento,lancamentos:launches,drive_file_id:pdf.id,drive_file_url:pdf.webViewLink||`https://drive.google.com/file/d/${pdf.id}/view`,drive_file_name:pdf.name,processado_em:new Date().toISOString(),resumo_ia:`${extracted.resumo_ia||''} | ${metadata}`.trim()};
      stage='persist';const current=existingByDrive.get(pdf.id);if(current){await base44.asServiceRole.entities.MovimentacaoBancaria.update(current.id,payload);updated.push({arquivo:pdf.name,id:current.id,mes_num:competence.month,ano:competence.year,tipo:documentType})}else{const record=await base44.asServiceRole.entities.MovimentacaoBancaria.create(payload);existingByDrive.set(pdf.id,record);created.push({arquivo:pdf.name,id:record.id,mes_num:competence.month,ano:competence.year,tipo:documentType})}
    }catch(e:any){errors.push({arquivo:pdf.name,drive_file_id:pdf.id,etapa:stage,erro:errorMessage(e)})}}
    return Response.json({success:true,resumo:{pastas_lidas:sources.length,pdfs_encontrados:pdfs.length,novos_no_drive:candidates.length,processados_neste_lote:batch.length,novos_criados:created.length,atualizados:updated.length,restantes:Math.max(0,candidates.length-batch.length),erros:errors.length},novos:created,atualizados:updated,erros:errors});
  }catch(e:any){return Response.json({success:false,error:errorMessage(e)},{status:500})}
});