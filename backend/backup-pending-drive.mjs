import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { google } from 'googleapis';

const { Pool } = pg;
const pool = new Pool({ host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432), database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor', password:process.env.POSTGRES_PASSWORD || '' });
const uploadDir=process.env.UPLOAD_DIR || '/app/uploads';
const rootId=process.env.GOOGLE_DRIVE_FOLDER_ID || '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
// This is the user-designated monthly backup tree. The older
// GOOGLE_DRIVE_PHOTOS_FOLDER_ID points to a different museum-first tree.
const photoRootId=process.env.GOOGLE_DRIVE_PHOTO_BACKUP_ROOT_ID || '1Lf3PB53WXV0ZwGgtr6etsrzp9Jyv465B';
const targetedPurchaseId=process.argv.find(arg=>arg.startsWith('--purchase-id='))?.slice('--purchase-id='.length) || '';
const photosOnly=process.argv.includes('--photos-only');
const photoLimitArg=process.argv.find(arg=>arg.startsWith('--photo-limit='));
const photoLimit=photoLimitArg ? Math.min(200,Math.max(1,Number(photoLimitArg.split('=')[1]) || 1)) : 200;
const targetedPhotoId=process.argv.find(arg=>arg.startsWith('--photo-id='))?.slice('--photo-id='.length) || '';
const dateOf=value => { const date=value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0,10) : String(value||'').slice(0,10); return /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date) ? date : ''; };
const clean=value => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim();
const sourceOf=p => p.nf_pdf_link || p.nota_fiscal_pdf_url || p.nota_fiscal_url || p.nf_pdf_url || p.arquivo_url || p.file_url || p.documento_url || p.drive_file_url || '';
const localOf=url => { const m=String(url||'').match(/\/api\/files\/([^/?#]+)/i); if(!m) return null; const file=path.join(uploadDir,path.basename(decodeURIComponent(m[1]))); return fs.existsSync(file) ? file : null; };
async function readSource(url) {
  const local=localOf(url);
  if(local) return { body:fs.createReadStream(local), mime:path.extname(local).toLowerCase()==='.xml' ? 'application/xml' : 'application/pdf' };
  if(!/^https:\/\//i.test(String(url))) return null;
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok || !response.body) throw new Error(`Documento fiscal indisponível (${response.status})`);
  return { body:Readable.fromWeb(response.body), mime:path.extname(new URL(response.url).pathname).toLowerCase()==='.xml' ? 'application/xml' : 'application/pdf' };
}
function imageMime(name) {
  const ext=path.extname(String(name||'')).toLowerCase();
  return ({ '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.heic':'image/heic' })[ext] || 'application/octet-stream';
}
function driveIdFromUrl(value) {
  const text=String(value||'');
  return text.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1]
    || text.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1]
    || '';
}
async function localPhotoHash(url) {
  const file=localOf(url);
  if(!file) return '';
  const hash=crypto.createHash('md5');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function readPhotoSource(url, fileName) {
  const local=localOf(url);
  if(local) {
    const mime=imageMime(fileName || local);
    if(!mime.startsWith('image/')) throw new Error('Arquivo local não é imagem');
    return { body:fs.createReadStream(local), mime };
  }
  if(!/^https:\/\//i.test(String(url))) return null;
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok || !response.body) throw new Error(`Foto indisponível (${response.status})`);
  const mime=String(response.headers.get('content-type') || '').split(';')[0] || imageMime(fileName || new URL(response.url).pathname);
  if(!mime.startsWith('image/')) throw new Error(`Origem não retornou imagem (${mime})`);
  return { body:Readable.fromWeb(response.body), mime };
}
const nameOf=(p,url) => { const amount=Number(p.nf_valor_total || p.valor_total || p.valor_solicitado || 0); return `${clean(p.nf_numero || 'SEM-NUM') || 'SEM-NUM'} - ${clean(p.nf_emitente_nome || p.fornecedor_nome || 'FORNECEDOR A REVISAR') || 'FORNECEDOR A REVISAR'} - MUSEUS CENTRO - R$ ${amount.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}${path.extname(url).toLowerCase()==='.xml'?'.xml':'.pdf'}`; };
function escapeDrive(value) { return String(value).replace(/'/g,"\\'"); }
function comparableName(value) { return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,''); }
async function main() {
  if(!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) throw new Error('Google Drive não configurado');
  // Older installations had the PDF backup link but no dedicated XML link.
  // Create the nullable field once so XML backup remains independently
  // traceable without replacing the PDF's canonical Drive identifier.
  await pool.query('ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS drive_backup_nf_xml_link text');
  const auth=new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID,process.env.GOOGLE_DRIVE_CLIENT_SECRET); auth.setCredentials({refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN});
  const drive=google.drive({version:'v3',auth}); const folderCache=new Map();
  async function folder(date) { const label=`${date.slice(5,7)}-${date.slice(0,4)}`; if(folderCache.has(label)) return folderCache.get(label); const found=await drive.files.list({q:`'${rootId}' in parents and name='${label}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:'files(id)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true}); const id=found.data.files?.[0]?.id || (await drive.files.create({requestBody:{name:label,mimeType:'application/vnd.google-apps.folder',parents:[rootId]},fields:'id',supportsAllDrives:true})).data.id; folderCache.set(label,id); return id; }
  async function ensureFolder(parentId,name) {
    const found=await drive.files.list({q:`'${parentId}' in parents and name='${escapeDrive(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:'files(id)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true});
    return found.data.files?.[0]?.id || (await drive.files.create({requestBody:{name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]},fields:'id',supportsAllDrives:true})).data.id;
  }
  const galleryFolderCache=new Map();
  const monthNumber=(value) => {
    const text=clean(value).toLowerCase();
    const months={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
    return months[text] || Number(text) || 0;
  };
  async function galleryFolder(photo) {
    const year=Number(photo.ano);
    const monthNumberValue=monthNumber(photo.mes_referencia);
    if (!Number.isInteger(year) || year<2020 || year>2100 || monthNumberValue<1 || monthNumberValue>12) return null;
    const month=String(monthNumberValue).padStart(2,'0');
    const key=`${year}|${month}`;
    if(galleryFolderCache.has(key)) return galleryFolderCache.get(key);
    const monthName=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][monthNumberValue-1];
    const monthFolder=await ensureFolder(photoRootId,`${year}-${month} - ${monthName}`);
    galleryFolderCache.set(key,monthFolder);
    return monthFolder;
  }
  const rows=photosOnly?[]:(await pool.query("SELECT * FROM purchase_requests WHERE (COALESCE(nota_fiscal_url,'')<>'' OR COALESCE(nota_fiscal_pdf_url,'')<>'' OR COALESCE(nf_pdf_url,'')<>'' OR COALESCE(arquivo_url,'')<>'' OR COALESCE(drive_file_url,'')<>'') AND COALESCE(drive_file_id,'')='' AND COALESCE(drive_backup_status,'')<>'CONCLUIDO'"+(targetedPurchaseId?' AND id::text=$1':''),targetedPurchaseId?[targetedPurchaseId]:[])).rows;
  let backed=0, skipped=0, failed=0;
  for(const p of rows) { try { const date=dateOf(p.nf_data_emissao || p.data_emissao); const url=sourceOf(p); const source=await readSource(url); if(!date || !source) { skipped++; continue; } const parent=await folder(date); const name=nameOf(p,url); const found=await drive.files.list({q:`'${parent}' in parents and name='${escapeDrive(name)}' and trashed=false`,fields:'files(id,webViewLink,name)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true}); let remote=found.data.files?.[0]; if(!remote) { const candidates=await drive.files.list({q:`'${parent}' in parents and trashed=false`,fields:'files(id,webViewLink,name,mimeType)',pageSize:1000,supportsAllDrives:true,includeItemsFromAllDrives:true}); remote=(candidates.data.files||[]).find(file=>file.mimeType!=='application/vnd.google-apps.folder'&&comparableName(file.name)===comparableName(name)); } if(remote?.id && remote.name!==name) remote=(await drive.files.update({fileId:remote.id,requestBody:{name},fields:'id,webViewLink,name',supportsAllDrives:true})).data; if(!remote) remote=(await drive.files.create({requestBody:{name,parents:[parent]},media:{mimeType:source.mime,body:source.body},fields:'id,webViewLink,name',supportsAllDrives:true})).data; const link=remote.webViewLink || `https://drive.google.com/file/d/${remote.id}/view`; await pool.query('UPDATE purchase_requests SET drive_file_id=$1, drive_file_url=$2, drive_backup_nf_pdf_link=$2, drive_backup_status=$3 WHERE id=$4',[remote.id,link,'CONCLUIDO',p.id]); backed++; } catch(error) { failed++; console.error('BACKUP_PENDING_FAILED',p.id,error.message); } }
  // XML is backed up only when a corresponding fiscal PDF is already present.
  // This keeps XML out of the visible intake queue until the fiscal pair is
  // complete, while preserving both files in the same MM-AAAA Drive folder.
  const xmlRows=photosOnly?[]:(await pool.query(`SELECT * FROM purchase_requests
    WHERE COALESCE(nf_xml_url,'')<>''
      AND COALESCE(drive_backup_nf_xml_link,'')=''
      AND (COALESCE(nota_fiscal_url,'')<>'' OR COALESCE(nota_fiscal_pdf_url,'')<>'' OR COALESCE(nf_pdf_url,'')<>'' OR COALESCE(arquivo_url,'')<>'' OR COALESCE(drive_file_id,'')<>'')
      ${targetedPurchaseId?'AND id::text=$1':''} ORDER BY id`,targetedPurchaseId?[targetedPurchaseId]:[])).rows;
  let xmlBacked=0, xmlSkipped=0, xmlFailed=0;
  for(const p of xmlRows) {
    try {
      const date=dateOf(p.nf_data_emissao || p.data_emissao);
      const xmlUrl=String(p.nf_xml_url || '').trim();
      const source=await readSource(xmlUrl);
      if(!date || !source) { xmlSkipped++; continue; }
      const parent=await folder(date);
      const name=nameOf(p,`${xmlUrl.split('?')[0]}.xml`).replace(/\.pdf$/i,'.xml');
      const found=await drive.files.list({q:`'${parent}' in parents and name='${escapeDrive(name)}' and trashed=false`,fields:'files(id,webViewLink,name)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true});
      let remote=found.data.files?.[0];
      if(!remote) {
        const candidates=await drive.files.list({q:`'${parent}' in parents and trashed=false`,fields:'files(id,webViewLink,name,mimeType)',pageSize:1000,supportsAllDrives:true,includeItemsFromAllDrives:true});
        remote=(candidates.data.files||[]).find(file=>file.mimeType!=='application/vnd.google-apps.folder'&&comparableName(file.name)===comparableName(name));
      }
      if(remote?.id && remote.name!==name) remote=(await drive.files.update({fileId:remote.id,requestBody:{name},fields:'id,webViewLink,name',supportsAllDrives:true})).data;
      if(!remote) remote=(await drive.files.create({requestBody:{name,parents:[parent]},media:{mimeType:'application/xml',body:source.body},fields:'id,webViewLink,name',supportsAllDrives:true})).data;
      const link=remote.webViewLink || `https://drive.google.com/file/d/${remote.id}/view`;
      await pool.query('UPDATE purchase_requests SET drive_backup_nf_xml_link=$1, updated_at=NOW(), updated_date=NOW() WHERE id=$2',[link,p.id]);
      xmlBacked++;
    } catch(error) { xmlFailed++; console.error('BACKUP_XML_FAILED',p.id,error.message); }
  }
  // Include historical photos marked "concluido" by the older museum-first
  // backup: that flag alone does not prove presence in the designated monthly
  // backup tree. A root marker makes this pass resumable across daily runs.
  const photoRows=targetedPurchaseId?[]:(await pool.query(`SELECT p.*,
      r.mes_referencia AS report_mes,r.ano AS report_ano
    FROM report_photos p LEFT JOIN reports r ON r.id::text=p.report_id
    WHERE COALESCE(p.file_url,'')<>''
      AND COALESCE(p.raw_data->>'monthly_backup_root','')<>$1
      AND p.ano BETWEEN 2020 AND 2100
      AND LOWER(COALESCE(p.mes_referencia,'')) IN
        ('janeiro','fevereiro','março','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro')
      AND ($3::text='' OR p.id::text=$3)
    ORDER BY p.updated_date NULLS FIRST,p.id LIMIT $2`,[photoRootId,photoLimit,targetedPhotoId])).rows;
  // Index the designated photo backup once. The same bytes may already be in
  // another monthly folder; never create another copy just because its name
  // or folder changed.
  const photoByHash=new Map();
  const photoFolderIds=new Set();
  if (photoRows.length) {
    const folders=await drive.files.list({q:`'${photoRootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,fields:'nextPageToken,files(id,name)',pageSize:1000,supportsAllDrives:true,includeItemsFromAllDrives:true});
    for (const folderEntry of folders.data.files || []) {
      photoFolderIds.add(folderEntry.id);
      let pageToken;
      do {
        const page=await drive.files.list({q:`'${folderEntry.id}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,md5Checksum,mimeType)',pageSize:1000,pageToken,supportsAllDrives:true,includeItemsFromAllDrives:true});
        for (const file of page.data.files || []) if (file.md5Checksum && String(file.mimeType).startsWith('image/')) photoByHash.set(file.md5Checksum.toLowerCase(),file);
        pageToken=page.data.nextPageToken;
      } while (pageToken);
    }
  }
  let photoBacked=0, photoSkipped=0, photoFailed=0;
  for(const photo of photoRows) {
    try {
      if (photo.report_ano && (Number(photo.report_ano)!==Number(photo.ano) ||
          monthNumber(photo.report_mes)!==monthNumber(photo.mes_referencia))) {
        photoSkipped++;
        await pool.query("UPDATE report_photos SET updated_date=NOW() WHERE id=$1",[photo.id]);
        continue;
      }
      const parent=await galleryFolder(photo);
      if (!parent) {
        photoSkipped++;
        await pool.query("UPDATE report_photos SET updated_date=NOW() WHERE id=$1",[photo.id]);
        continue;
      }
      const stableId=clean(photo.base44_id || photo.id).slice(0,48) || String(photo.id);
      const name=`${stableId} - ${clean(photo.file_name || 'foto').slice(0,180) || 'foto'}`;
      const photoHash=String(photo.md5 || await localPhotoHash(photo.file_url)).toLowerCase();
      let remote=photoHash ? photoByHash.get(photoHash) : null;
      if (!remote) {
        const found=await drive.files.list({q:`'${parent}' in parents and name='${escapeDrive(name)}' and trashed=false`,fields:'files(id,webViewLink,md5Checksum)',pageSize:1,supportsAllDrives:true,includeItemsFromAllDrives:true});
        const named=found.data.files?.[0];
        remote=photoHash && named?.md5Checksum?.toLowerCase()===photoHash ? named : null;
      }
      if(!remote) {
        const sourceDriveId=String(photo.drive_file_id || driveIdFromUrl(photo.file_url) || '').trim();
        if(sourceDriveId) {
          const original=(await drive.files.get({fileId:sourceDriveId,fields:'id,parents,md5Checksum,webViewLink',supportsAllDrives:true})).data;
          remote=(original.md5Checksum && photoByHash.get(original.md5Checksum.toLowerCase()))
            || ((original.parents || []).some(id=>photoFolderIds.has(id)) ? original
              : (await drive.files.copy({fileId:sourceDriveId,requestBody:{name,parents:[parent]},fields:'id,webViewLink,md5Checksum',supportsAllDrives:true})).data);
        } else {
          const source=await readPhotoSource(photo.file_url,photo.file_name);
          if(!source) { photoSkipped++; continue; }
          remote=(await drive.files.create({requestBody:{name,parents:[parent]},media:{mimeType:source.mime,body:source.body},fields:'id,webViewLink,md5Checksum',supportsAllDrives:true})).data;
        }
      }
      if (remote.md5Checksum) photoByHash.set(remote.md5Checksum.toLowerCase(),remote);
      await pool.query(`UPDATE report_photos SET drive_file_id=$1,drive_backup_status='concluido',
        raw_data=COALESCE(raw_data,'{}'::jsonb)||jsonb_build_object(
          'monthly_backup_root',$2::text,'monthly_backup_file_id',$1::text,'monthly_backup_at',NOW(),
          'previous_drive_file_id',COALESCE(raw_data->>'previous_drive_file_id',$3::text)),
        updated_date=NOW() WHERE id=$4`,[remote.id,photoRootId,photo.drive_file_id || '',photo.id]);
      photoBacked++;
    } catch(error) {
      photoFailed++;
      await pool.query("UPDATE report_photos SET drive_backup_status='erro',updated_date=NOW() WHERE id=$1",[photo.id]).catch(()=>{});
      console.error('REPORT_PHOTO_BACKUP_FAILED',photo.id,error.message);
    }
  }
  console.log(JSON.stringify({candidatas:rows.length,backup_concluido:backed,ignoradas:skipped,erros:failed,xml_candidatas:xmlRows.length,xml_backup_concluido:xmlBacked,xml_ignorados:xmlSkipped,xml_erros:xmlFailed,fotos_candidatas:photoRows.length,fotos_backup_concluido:photoBacked,fotos_ignoradas:photoSkipped,fotos_erros:photoFailed}));
  await pool.end();
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
