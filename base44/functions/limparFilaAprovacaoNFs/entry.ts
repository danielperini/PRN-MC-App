import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const STATUS_APROVADOS = new Set(['APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO']);
const STATUS_PENDENTES = new Set(['ENVIADO_APROVACAO','AGUARDANDO_REVISAO']);

function normalizar(v:any){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
function digitos(v:any){return String(v||'').replace(/\D/g,'')}
function valor(v:any){const n=Number(v||0);return Number.isFinite(n)?n:0}
function dataRegistro(r:any){return String(r.updated_date||r.created_date||'')}
function xmlUrl(r:any){const d=r.data||r;const ia=d.resultado_ia||r.resultado_ia||{};return d.nf_xml_url||r.nf_xml_url||ia.drive_xml_url||ia.arquivos_fiscais?.xml||''}
function pdfUrl(r:any){const d=r.data||r;const ia=d.resultado_ia||r.resultado_ia||{};return d.arquivo_original_url||r.arquivo_original_url||ia.drive_pdf_url||ia.arquivos_fiscais?.pdf||''}
function chaveFiscal(r:any){
  const d=r.data||r;const ia=d.resultado_ia||r.resultado_ia||{};
  const chave=digitos(d.nf_chave_acesso||r.nf_chave_acesso||ia.nf_chave_acesso);if(chave.length===44)return `chave:${chave}`;
  const cnpj=digitos(d.nf_emitente_cpf_cnpj||d.fornecedor_cpf_cnpj||r.fornecedor_cpf_cnpj||ia.nf_emitente_cpf_cnpj);
  const nf=digitos(d.nf_numero||r.nf_numero||ia.nf_numero);
  const val=valor(d.nf_valor_total||r.nf_valor_total||ia.nf_valor_total).toFixed(2);
  const nome=normalizar(d.nf_emitente_nome||d.fornecedor_nome||r.fornecedor_nome||ia.nf_emitente_nome);
  if(cnpj&&nf)return `cnpj-nf:${cnpj}:${nf}`;
  if(nf&&val!=='0.00')return `nf-valor:${nf}:${val}:${nome}`;
  const arquivo=normalizar(d.file_name_final||d.file_name_original||r.file_name_final||r.file_name_original).replace(/\.(pdf|xml)$/,'').replace(/\b(comp|comprovante|xml|pdf)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
  return arquivo?`arquivo:${arquivo}`:`id:${r.id}`;
}
function statusPR(pr:any){return normalizar(pr.status).toUpperCase().replace(/ /g,'_')}

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(!user)return Response.json({success:false,error:'Unauthorized'},{status:401});
    if(!['admin','coordenador','coordinator'].includes(normalizar(user.role)))return Response.json({success:false,error:'Apenas administradores ou coordenadores.'},{status:403});

    const intakes=await base44.asServiceRole.entities.DocumentIntake.list('-created_date',5000);
    const prs=await base44.asServiceRole.entities.PurchaseRequest.list('-created_date',5000);
    const aprovadasPR=new Set(prs.filter((p:any)=>STATUS_APROVADOS.has(statusPR(p))).map(chaveFiscal));
    const grupos=new Map<string,any[]>();
    for(const intake of intakes){const key=chaveFiscal(intake);if(!grupos.has(key))grupos.set(key,[]);grupos.get(key).push(intake)}

    const arquivados:any[]=[];const consolidados:any[]=[];const erros:any[]=[];
    for(const [key,items] of grupos){
      items.sort((a,b)=>{
        const sa=STATUS_APROVADOS.has(String(a.status_processamento||'').toUpperCase())?100:0;
        const sb=STATUS_APROVADOS.has(String(b.status_processamento||'').toUpperCase())?100:0;
        const ca=(pdfUrl(a)?10:0)+(xmlUrl(a)?5:0);const cb=(pdfUrl(b)?10:0)+(xmlUrl(b)?5:0);
        return (sb+cb)-(sa+ca)||dataRegistro(b).localeCompare(dataRegistro(a));
      });
      const canonical=items[0];
      const aprovado=items.some(i=>STATUS_APROVADOS.has(String(i.status_processamento||'').toUpperCase()))||aprovadasPR.has(key);
      const mergedPdf=items.map(pdfUrl).find(Boolean)||'';const mergedXml=items.map(xmlUrl).find(Boolean)||'';
      const ids=Array.from(new Set(items.flatMap(i=>[i.resultado_ia?.drive_file_id,...(i.resultado_ia?.drive_file_ids||[])]).filter(Boolean)));
      try{
        if(mergedPdf||mergedXml){
          await base44.asServiceRole.entities.DocumentIntake.update(canonical.id,{
            arquivo_original_url: mergedPdf||mergedXml,
            nf_xml_url: mergedXml||canonical.nf_xml_url||'',
            resultado_ia:{...(canonical.resultado_ia||{}),drive_file_ids:ids,drive_pdf_url:mergedPdf||null,drive_xml_url:mergedXml||null,pdf_xml_unidos:Boolean(mergedPdf&&mergedXml),chave_fiscal_deterministica:key,duplicidades_consolidadas:Math.max(0,items.length-1)}
          });
          consolidados.push({id:canonical.id,chave:key,quantidade:items.length,com_xml:Boolean(mergedXml),aprovado});
        }
        for(const extra of items.slice(1)){
          const status=String(extra.status_processamento||'').toUpperCase();
          if(STATUS_PENDENTES.has(status)||status===''){
            await base44.asServiceRole.entities.DocumentIntake.update(extra.id,{status_processamento:aprovado?'JA_APROVADO_ARQUIVADO':'DUPLICADO_ARQUIVADO',resultado_ia:{...(extra.resultado_ia||{}),duplicado_de:canonical.id,chave_fiscal_deterministica:key,arquivado_em:new Date().toISOString()}});
            arquivados.push({id:extra.id,duplicado_de:canonical.id,chave:key,motivo:aprovado?'já aprovado':'duplicado'});
          }
        }
        if(aprovado&&STATUS_PENDENTES.has(String(canonical.status_processamento||'').toUpperCase())){
          await base44.asServiceRole.entities.DocumentIntake.update(canonical.id,{status_processamento:'JA_APROVADO_ARQUIVADO'});
          arquivados.push({id:canonical.id,chave:key,motivo:'já aprovado'});
        }
      }catch(e:any){erros.push({chave:key,erro:String(e?.message||e)})}
    }

    return Response.json({success:true,resumo:{intakes_analisados:intakes.length,grupos_fiscais:grupos.size,duplicados_arquivados:arquivados.length,grupos_consolidados:consolidados.filter(i=>i.quantidade>1).length,erros:erros.length},arquivados,consolidados,erros});
  }catch(e:any){return Response.json({success:false,error:String(e?.message||e)},{status:500})}
});
