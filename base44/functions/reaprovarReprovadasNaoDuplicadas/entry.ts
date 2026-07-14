import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const REJECTED = new Set(['REPROVADO', 'REJEITADO']);
const APPROVED = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function normalize(value:any){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
function digits(value:any){return String(value||'').replace(/\D/g,'')}
function numberBR(value:any){
  if(typeof value==='number')return Number.isFinite(value)?Math.abs(value):0;
  const text=String(value||'').replace(/R\$/gi,'').replace(/\s/g,'');
  const parsed=Number(text.includes(',')?text.replace(/\./g,'').replace(',','.'):text);
  return Number.isFinite(parsed)?Math.abs(parsed):0;
}
function statusOf(item:any){return String(item?.status||item?.status_processamento||'').toUpperCase()}
function valueOf(item:any){return numberBR(item?.valor_pago??item?.valor_aprovado_admin??item?.valor_aprovado??item?.valor_final??item?.valor_solicitado??item?.valor_total??item?.valor??item?.nf_valor_total)}
function nfNumber(item:any){return digits(item?.nf_numero||item?.numero_nota||item?.numero_nf||item?.nota_fiscal_numero)}
function supplierDoc(item:any){return digits(item?.fornecedor_cpf_cnpj||item?.fornecedor_cnpj||item?.nf_emitente_cpf_cnpj||item?.cnpj_fornecedor)}
function accessKey(item:any){return digits(item?.nf_chave_acesso||item?.chave_acesso||item?.nota_fiscal_chave)}
function competence(item:any){
  const raw=item?.competencia||item?.mes_competencia||item?.data_pagamento||item?.paid_at||item?.nf_data_emissao||item?.data_emissao||item?.created_date;
  if(!raw)return '';
  const text=String(raw);const direct=text.match(/(20\d{2})[-\/]?(0[1-9]|1[0-2])/);if(direct)return `${direct[1]}-${direct[2]}`;
  const date=new Date(raw);if(Number.isNaN(date.getTime()))return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
function strictKey(item:any){
  const access=accessKey(item);if(access.length>=44)return `chave:${access}`;
  const nf=nfNumber(item);const doc=supplierDoc(item);if(nf&&doc)return `nf:${nf}:${doc}`;
  const value=valueOf(item).toFixed(2);const comp=competence(item);
  if(doc&&value!=='0.00'&&comp)return `doc-valor-comp:${doc}:${value}:${comp}`;
  const url=item?.nota_fiscal_url||item?.file_url||item?.nf_pdf_url||item?.pdf_url||item?.arquivo_original_url;
  if(url)return `url:${url}`;
  return `id:${item?.id}`;
}
function score(item:any){
  const hasDrive=Boolean(item?.backup_drive_url||item?.drive_file_url||item?.nota_fiscal_url||item?.nf_pdf_url||item?.arquivo_original_url);
  return (accessKey(item).length>=44?1000:0)+(nfNumber(item)?300:0)+(supplierDoc(item)?200:0)+(hasDrive?100:0)+(item?.updated_date?10:0);
}
function reasonOf(item:any){
  return item?.motivo_reprovacao||item?.rejection_reason||item?.motivo_rejeicao||item?.observacao_reprovacao||item?.observacoes||'Motivo de reprovação não registrado';
}

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(!user)return Response.json({success:false,error:'Unauthorized'},{status:401});
    if(!['admin','coordenador','coordinator'].includes(normalize(user.role)))return Response.json({success:false,error:'Apenas administradores ou coordenadores podem executar esta rotina.'},{status:403});

    const purchases=await base44.asServiceRole.entities.PurchaseRequest.list('-created_date',5000);
    const rejected=purchases.filter((item:any)=>REJECTED.has(statusOf(item)));
    const approvedKeys=new Map<string,any>();
    purchases.filter((item:any)=>APPROVED.has(statusOf(item))).forEach((item:any)=>{
      const key=strictKey(item);const current=approvedKeys.get(key);
      if(!current||score(item)>score(current))approvedKeys.set(key,item);
    });

    const rejectedGroups=new Map<string,any[]>();
    for(const item of rejected){const key=strictKey(item);if(!rejectedGroups.has(key))rejectedGroups.set(key,[]);rejectedGroups.get(key)!.push(item)}

    const reapproved:any[]=[];const duplicates:any[]=[];const errors:any[]=[];

    for(const [key,group] of rejectedGroups.entries()){
      const sorted=[...group].sort((a,b)=>score(b)-score(a)||String(b.updated_date||'').localeCompare(String(a.updated_date||'')));
      const canonical=sorted[0];
      const approvedDuplicate=approvedKeys.get(key);
      if(approvedDuplicate){
        for(const item of sorted)duplicates.push({id:item.id,nf:nfNumber(item)||null,fornecedor:item.fornecedor_nome||item.nf_emitente_nome||null,valor:valueOf(item),motivo_reprovacao:reasonOf(item),duplicado_de:approvedDuplicate.id,chave:key});
        continue;
      }
      for(const item of sorted.slice(1))duplicates.push({id:item.id,nf:nfNumber(item)||null,fornecedor:item.fornecedor_nome||item.nf_emitente_nome||null,valor:valueOf(item),motivo_reprovacao:reasonOf(item),duplicado_de:canonical.id,chave:key});
      try{
        await base44.asServiceRole.entities.PurchaseRequest.update(canonical.id,{
          status:'APROVADO_COORD',
          reaprovado_automaticamente:true,
          reaprovado_em:new Date().toISOString(),
          motivo_reprovacao_anterior:reasonOf(canonical),
          motivo_reaprovacao:'Reaprovado após validação determinística: nenhuma duplicidade fiscal encontrada por chave de acesso, NF + CNPJ ou CNPJ + valor + competência.'
        });
        reapproved.push({id:canonical.id,nf:nfNumber(canonical)||null,fornecedor:canonical.fornecedor_nome||canonical.nf_emitente_nome||null,valor:valueOf(canonical),motivo_reprovacao:reasonOf(canonical),chave:key});
      }catch(error:any){errors.push({id:canonical.id,erro:String(error?.message||error)})}
    }

    return Response.json({success:true,resumo:{reprovadas_analisadas:rejected.length,reaprovadas:reapproved.length,duplicadas_mantidas_reprovadas:duplicates.length,erros:errors.length},reaprovadas:reapproved,duplicadas:duplicates,erros:errors});
  }catch(error:any){return Response.json({success:false,error:String(error?.message||error)},{status:500})}
});
