import pg from 'pg';
import { google } from 'googleapis';

// Read-only by default. Only a capture timestamp supplied by Drive's image
// metadata may change a photo's period; folder/upload dates are not capture dates.
const apply = process.argv.includes('--apply');
const pool = new pg.Pool({
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || '',
});
const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const auth=new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID,process.env.GOOGLE_DRIVE_CLIENT_SECRET);
auth.setCredentials({refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN});
const drive=google.drive({version:'v3',auth});
const counters={mode:apply?'apply':'dry_run',scanned:0,capture_dates_found:0,period_corrections:0,
  exact_dates_saved:0,linked_period_conflicts:0,no_capture_metadata:0,existing_capture_metadata:0,
  ai_captions_corrected:0,backup_files_moved:0,backup_move_errors:0,errors:0};
const photoRootId=process.env.GOOGLE_DRIVE_PHOTO_BACKUP_ROOT_ID || '1Lf3PB53WXV0ZwGgtr6etsrzp9Jyv465B';
const parseJson=value=>{try{return typeof value==='string' ? JSON.parse(value) : (value || {})}catch{return {}}};
const exactDate=value=>{
  const match=String(value || '').match(/^(20\d{2})[:\-](0[1-9]|1[0-2])[:\-]([0-2]\d|3[01])/);
  if (!match) return '';
  const date=`${match[1]}-${match[2]}-${match[3]}`;
  return new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)===date ? date : '';
};
try {
  const photos=(await pool.query(`SELECT id,drive_file_id,file_name,report_id,mes_referencia,ano,
    caption,legenda,fonte_ia,raw_data,contexto_ia FROM report_photos WHERE
    (museu ILIKE '%noturno%' OR file_name ILIKE '%noturno%' OR legenda ILIKE '%noturno%' OR caption ILIKE '%noturno%') ORDER BY id`)).rows;
  const backupMoves=[];
  let cursor=0;
  await Promise.all(Array.from({length:5},async()=>{
    while(cursor<photos.length) {
      const photo=photos[cursor++]; counters.scanned++;
      try {
        const context=parseJson(photo.contexto_ia);
        const originalContext=parseJson(photo.raw_data?.contexto_ia);
        let date=exactDate(context.data_foto || originalContext.data_foto || photo.raw_data?.data_foto);
        let source='stored_photo_metadata';
        if (date) counters.existing_capture_metadata++;
        if (!date && photo.drive_file_id) {
          const {data}=await drive.files.get({fileId:photo.drive_file_id,
            fields:'id,imageMediaMetadata(time)',supportsAllDrives:true});
          date=exactDate(data.imageMediaMetadata?.time);
          source='drive_image_metadata';
        }
        if (!date) { counters.no_capture_metadata++; continue; }
        counters.capture_dates_found++;
        const month=months[Number(date.slice(5,7))-1], year=Number(date.slice(0,4));
        const changedPeriod=photo.mes_referencia!==month || Number(photo.ano)!==year;
        if (changedPeriod && photo.report_id) counters.linked_period_conflicts++;
        if (changedPeriod && !photo.report_id) counters.period_corrections++;
        if (changedPeriod && !photo.report_id && photo.raw_data?.monthly_backup_root===photoRootId && photo.raw_data?.monthly_backup_file_id)
          backupMoves.push({fileId:photo.raw_data.monthly_backup_file_id,month:`${year}-${date.slice(5,7)}`,photoId:photo.id});
        if (photo.raw_data?.data_foto!==date) counters.exact_dates_saved++;
        const rewrite=value=>changedPeriod && !photo.report_id && photo.fonte_ia==='drive_sync'
          ? String(value || '').replace(new RegExp(`${photo.mes_referencia} de ${photo.ano}`,'gi'),`${month.toLowerCase()} de ${year}`)
          : value;
        const caption=rewrite(photo.caption), legenda=rewrite(photo.legenda);
        if (caption!==photo.caption || legenda!==photo.legenda) counters.ai_captions_corrected++;
        if (!apply || (photo.raw_data?.data_foto===date && (!changedPeriod || photo.report_id) && caption===photo.caption && legenda===photo.legenda)) continue;
        const raw={...(photo.raw_data && typeof photo.raw_data==='object' ? photo.raw_data : {}),data_foto:date,
          mes_referencia:photo.report_id ? photo.mes_referencia : month,ano:photo.report_id ? photo.ano : year,
          caption,legenda};
        context.capture_date_source=source;
        context.capture_date_verified_at=new Date().toISOString();
        context.exif_month=date.slice(0,7);
        await pool.query(`UPDATE report_photos SET raw_data=$2::jsonb,contexto_ia=$3,caption=$6,legenda=$7,
          mes_referencia=CASE WHEN report_id IS NULL THEN $4 ELSE mes_referencia END,
          ano=CASE WHEN report_id IS NULL THEN $5 ELSE ano END,updated_date=NOW() WHERE id=$1`,
        [photo.id,JSON.stringify(raw),JSON.stringify(context),month,year,caption,legenda]);
      } catch(error) { counters.errors++; console.error('NOTURNO_PHOTO_DATE_ERROR',photo.id,error.message); }
    }
  }));
  if (apply && backupMoves.length) {
    const folders=(await drive.files.list({q:`'${photoRootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields:'files(id,name)',pageSize:1000,supportsAllDrives:true,includeItemsFromAllDrives:true})).data.files || [];
    const knownFolderIds=new Set(folders.map(folder=>folder.id));
    const targets=new Map();
    for (const move of backupMoves) {
      if (targets.has(move.month)) continue;
      const label=`${move.month} - ${months[Number(move.month.slice(5,7))-1]}`;
      let folder=folders.find(item=>item.name===label);
      if (!folder) folder=(await drive.files.create({requestBody:{name:label,mimeType:'application/vnd.google-apps.folder',parents:[photoRootId]},fields:'id,name',supportsAllDrives:true})).data;
      targets.set(move.month,folder.id);
      knownFolderIds.add(folder.id);
    }
    const unique=[...new Map(backupMoves.map(move=>[move.fileId,move])).values()];
    let cursor=0;
    await Promise.all(Array.from({length:5},async()=>{
      while(cursor<unique.length) {
        const move=unique[cursor++];
        try {
          const target=targets.get(move.month);
          const file=(await drive.files.get({fileId:move.fileId,fields:'id,parents',supportsAllDrives:true})).data;
          const parents=file.parents || [];
          if (parents.includes(target)) continue;
          const old=parents.find(id=>knownFolderIds.has(id));
          if (!old) throw new Error('backup_not_in_monthly_photo_root');
          await drive.files.update({fileId:move.fileId,addParents:target,removeParents:old,fields:'id,parents',supportsAllDrives:true});
          counters.backup_files_moved++;
        } catch(error) { counters.backup_move_errors++; console.error('NOTURNO_PHOTO_BACKUP_MOVE_ERROR',move.photoId,error.message); }
      }
    }));
  }
  console.log('NOTURNO_PHOTO_DATE_AUDIT',JSON.stringify(counters));
} finally { await pool.end(); }
