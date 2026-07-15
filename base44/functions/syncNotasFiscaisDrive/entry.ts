import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MAX_FILES = 500;
const ALLOWED_MIME = new Set(['application/pdf', 'text/xml', 'application/xml', 'image/jpeg', 'image/png', 'image/webp']);

function normalize(value:any){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
function isInvoiceFile(file:any){
  if(!ALLOWED_MIME.has(String(file?.mimeType||'')))return false;
  const name=normalize(file?.name);
  if(['extrato','rendimento','comprovante','contrato','aditivo','orcamento'].some(term=>name.includes(term)))return false;
  return /\bnf\b/.test(name)||name.includes('nota fiscal')||name.endsWith('.xml')||name.endsWith('.pdf');
}
function errorMessage(error:any){return String(error?.message||error||'Erro desconhecido').slice(0,800)}

Deno.serve(async(request)=>{
  try{
    const base44=createClientFromRequest(request);
    const body=await request.json().catch(()=>({}));
    const user=await base44.auth.me().catch(()=>null);
    if(!user)return Response.json({success:false,error:'Não autorizado'},{status:401});
    const folderId=String(body.folder_id||'').trim();
    if(!folderId)return Response.json({success:false,error:'folder_id obrigatório'},{status:400});

    let token:string|null=null;
    try{token=(await base44.asServiceRole.connectors.getConnection('googledrive'))?.accessToken||null}catch(_){ }
    if(!token)return Response.json({success:false,code:'DRIVE_NOT_CONNECTED',error:'Google Drive não está conectado.'},{status:401});

    async function listFolder(id:string){
      const files:any[]=[];let pageToken='';
      do{
        const q=encodeURIComponent(`'${id}' in parents and trashed=false`);
        const fields=encodeURIComponent('nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,md5Checksum,parents)');
        const url=`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`;
        const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
        if(!response.ok)throw new Error(`Google Drive HTTP ${response.status}: ${await response.text()}`);
        const payload=await response.json();files.push(...(payload.files||[]));pageToken=payload.nextPageToken||'';
      }while(pageToken&&files.length<MAX_FILES);
      return files.slice(0,MAX_FILES);
    }

    const files=await listFolder(folderId);
    const invoiceFiles=files.filter(isInvoiceFile);
    const existing=await base44.asServiceRole.entities.DocumentIntake.list('-created_date',5000).catch(()=>[]);
    const byDriveId=new Map(existing.filter((item:any)=>item?.drive_file_id).map((item:any)=>[String(item.drive_file_id),item]));
    const imported:any[]=[];const existingRows:any[]=[];const errors:any[]=[];

    for(const file of invoiceFiles){
      if(byDriveId.has(String(file.id))){existingRows.push({drive_file_id:file.id,arquivo:file.name,id:byDriveId.get(String(file.id))?.id});continue;}
      try{
        const record=await base44.asServiceRole.entities.DocumentIntake.create({
          drive_file_id:file.id,
          file_name_original:file.name,
          arquivo_original_url:file.webViewLink||`https://drive.google.com/file/d/${file.id}/view`,
          mime_type:file.mimeType,
          tamanho_bytes:Number(file.size||0),
          tipo_detectado:'nota_fiscal_pendente_validacao',
          status_processamento:'pendente',
          origem:'google_drive_sync',
          pasta_drive_id:folderId,
          drive_created_at:file.createdTime||null,
          drive_modified_at:file.modifiedTime||null,
          checksum:file.md5Checksum||null,
          importado_em:new Date().toISOString(),
        });
        imported.push({id:record.id,drive_file_id:file.id,arquivo:file.name});
      }catch(error:any){errors.push({drive_file_id:file.id,arquivo:file.name,erro:errorMessage(error)})}
    }

    return Response.json({
      success:errors.length===0,
      pasta:folderId,
      arquivos_encontrados:files.length,
      candidatos_nota_fiscal:invoiceFiles.length,
      importadas:imported.length,
      existentes:existingRows.length,
      erros:errors.length,
      notas_importadas:imported,
      notas_existentes:existingRows,
      falhas:errors,
      idempotencia:'drive_file_id',
      observacao:'Arquivos foram incluídos na lista de conferência. A extração fiscal continua pelo pipeline real de DocumentIntake.',
    },{status:errors.length?207:200});
  }catch(error:any){return Response.json({success:false,error:errorMessage(error)},{status:500})}
});
