import pg from 'pg';
import { google } from 'googleapis';

// Import existing Drive images into the app gallery without changing the
// original files. Only an unambiguous activity identifier may establish a
// report/activity relation; folder names and AI are review hints, not proof.
const apply = process.argv.includes('--apply');
const ai = process.argv.includes('--ai');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(0, Number(limitArg.split('=')[1]) || 0) : Infinity;
const rootId = process.env.GOOGLE_DRIVE_PHOTO_BACKUP_ROOT_ID || '1Lf3PB53WXV0ZwGgtr6etsrzp9Jyv465B';
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});
const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const monthNumber = value => {
  const n = Number(value);
  return n >= 1 && n <= 12 ? n : monthNames.findIndex(name => norm(name) === norm(value)) + 1;
};
const monthOf = date => {
  const match = String(date || '').match(/^(20\d\d)[:-](0[1-9]|1[0-2])[:-]\d\d/);
  return match ? `${match[1]}-${match[2]}` : '';
};
const folderMonth = value => String(value || '').match(/^(20\d\d)-(0[1-9]|1[0-2])\b/)?.[0] || '';
const activityIds = name => [...String(name || '').matchAll(/(?:^|[^a-z0-9])(ATI_[a-z0-9]+_[a-z0-9]+)/ig)].map(match => match[1]);
const museumOf = value => {
  const match = String(value || '').toUpperCase().match(/\b(MHAB|MUMO|MIS\s*BH|MISBH)\b/);
  return match ? (match[1].replace(/\s+/g, '') === 'MISBH' ? 'MIS BH' : match[1]) : '';
};
const sameMuseum = (left, right) => !left || !right || norm(left).replace(/\s/g, '') === norm(right).replace(/\s/g, '');
const compareFile = (a, b) => Number(Boolean(b.verified)) - Number(Boolean(a.verified))
  || Number(Boolean(b.exifMonth)) - Number(Boolean(a.exifMonth))
  || a.file.id.localeCompare(b.file.id);

async function listAll(drive, query, fields) {
  const result = [];
  let pageToken;
  do {
    const page = await drive.files.list({ q: query, fields: `nextPageToken,files(${fields})`,
      pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true });
    result.push(...(page.data.files || []));
    pageToken = page.data.nextPageToken;
  } while (pageToken);
  return result;
}

async function main() {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN)
    throw new Error('Credenciais Google Drive indisponíveis');
  const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth });
  const client = await pool.connect();
  const locked = apply ? (await client.query("SELECT pg_try_advisory_lock(hashtext('sync-gallery-drive')) AS locked")).rows[0].locked : true;
  if (!locked) { console.log('GALLERY_DRIVE_SYNC', JSON.stringify({ mode: 'skipped', reason: 'already_running' })); client.release(); return; }
  try {
    const folders = await listAll(drive, `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, 'id,name');
    const files = [];
    for (const folder of folders) {
      for (const file of await listAll(drive, `'${folder.id}' in parents and trashed=false`,
        'id,name,mimeType,md5Checksum,size,description,imageMediaMetadata(time),webViewLink')) {
        if (!String(file.mimeType || '').startsWith('image/')) continue;
        files.push({ file, folder: folder.name, folderMonth: folderMonth(folder.name),
          exifMonth: monthOf(file.imageMediaMetadata?.time) });
      }
    }
    const photos = (await client.query('SELECT id,drive_file_id,md5 FROM report_photos')).rows;
    const knownIds = new Set(photos.map(p => p.drive_file_id).filter(Boolean));
    const knownHashes = new Set(photos.map(p => String(p.md5 || '').toLowerCase()).filter(Boolean));
    const activities = (await client.query(`SELECT a.base44_activity_id,a.report_id,a.nome,a.museu_lista,a.data_inicio,
      r.id AS canonical_report_id,r.museu AS report_museu,r.mes_referencia,r.ano,r.author_name
      FROM report_activities a JOIN reports r ON r.id::text=a.report_id::text
      WHERE NULLIF(a.base44_activity_id,'') IS NOT NULL`)).rows;
    const byActivity = new Map();
    for (const activity of activities) {
      const key = String(activity.base44_activity_id).toLowerCase();
      byActivity.set(key, [...(byActivity.get(key) || []), activity]);
    }
    const candidates = files.map(item => {
      const explicit = [...new Set(activityIds(item.file.name).map(id => id.toLowerCase()))];
      const matches = explicit.flatMap(id => byActivity.get(id) || []);
      const distinct = new Map(matches.map(a => [`${a.canonical_report_id}|${a.base44_activity_id}`, a]));
      const activity = distinct.size === 1 ? [...distinct.values()][0] : null;
      const reportMonth = activity ? `${activity.ano}-${String(monthNumber(activity.mes_referencia)).padStart(2,'0')}` : '';
      const namedMuseum = museumOf(`${item.file.name} ${item.file.description || ''}`);
      const verified = Boolean(activity && reportMonth && reportMonth !== `${activity.ano}-00`
        && (!item.exifMonth || item.exifMonth === reportMonth)
        && sameMuseum(namedMuseum, activity.report_museu));
      return { ...item, activity, verified, reportMonth, namedMuseum,
        conflict: Boolean(activity && !verified) };
    });
    const groups = new Map();
    for (const item of candidates) {
      const key = item.file.md5Checksum ? `md5:${item.file.md5Checksum.toLowerCase()}` : `id:${item.file.id}`;
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    // Identical bytes attached to different activities in old exports do not
    // prove which activity owned the original. Keep that content unlinked.
    for (const group of groups.values()) {
      const targets = new Set(group.filter(item => item.verified)
        .map(item => `${item.activity.canonical_report_id}|${item.activity.base44_activity_id}`));
      if (targets.size > 1) for (const item of group) { item.verified = false; item.conflict = true; }
    }
    const counters = { drive_files: files.length, unique_content: groups.size, already_in_gallery: 0,
      imported: 0, verified_activity_links: 0, unlinked_for_review: 0, conflicting_metadata: 0,
      duplicate_drive_copies: files.length - groups.size, explicit_activity_ids: candidates.filter(c => activityIds(c.file.name).length).length,
      unique_activity_matches: candidates.filter(c => c.activity).length,
      content_groups_with_activity: [...groups.values()].filter(g => g.some(c => c.activity)).length,
      content_groups_with_verified_activity: [...groups.values()].filter(g => g.some(c => c.verified)).length,
      errors: 0 };
    for (const group of groups.values()) {
      if (group.some(item => knownIds.has(item.file.id)) || group.some(item => item.file.md5Checksum && knownHashes.has(item.file.md5Checksum.toLowerCase()))) {
        counters.already_in_gallery++; continue;
      }
      group.sort(compareFile);
      const item = group[0];
      const file = item.file;
      if (item.conflict) counters.conflicting_metadata++;
      if (!item.verified) counters.unlinked_for_review++;
      if (counters.imported >= limit) continue;
      const evidence = { source: 'Drive AllPictures', folder: item.folder,
        folder_month: item.folderMonth, exif_month: item.exifMonth,
        drive_description: String(file.description || '').slice(0, 1000),
        activity_id_in_filename: activityIds(file.name), metadata_conflict: item.conflict,
        linked_by: item.verified ? 'unique_activity_id_and_consistent_month_museum' : null };
      if (apply) {
        try {
          const month = item.verified ? item.reportMonth : (item.exifMonth || item.folderMonth);
          const [year, number] = month ? month.split('-') : [];
          const museum = item.verified ? item.activity.report_museu : item.namedMuseum;
          await client.query(`INSERT INTO report_photos
            (base44_id,report_id,activity_id,drive_file_id,file_name,file_url,file_size,md5,
             author,museu,mes_referencia,ano,galeria_oculta,fonte_ia,contexto_ia,drive_backup_status,raw_data,created_date,updated_date)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,'drive_metadata',$13,'concluido',$14::jsonb,NOW(),NOW())
            ON CONFLICT (base44_id) DO NOTHING`, [
            `drive-gallery-${file.id}`, item.verified ? String(item.activity.canonical_report_id) : null,
            item.verified ? String(item.activity.base44_activity_id) : null,
            file.id, file.name, `https://appgestor.periniprojetos.com.br/api/drive-files/${file.id}`,
            Number(file.size) || null, file.md5Checksum?.toLowerCase() || null,
            item.verified ? item.activity.author_name : null, museum || null,
            number ? monthNames[Number(number) - 1] : null, year ? Number(year) : null,
            JSON.stringify(evidence), JSON.stringify({ id: `drive-gallery-${file.id}`,
              url: `https://appgestor.periniprojetos.com.br/api/drive-files/${file.id}`,
              fileName: file.name, source: 'drive_gallery_sync', evidence }),
          ]);
          if (file.md5Checksum) knownHashes.add(file.md5Checksum.toLowerCase());
          knownIds.add(file.id);
        } catch (error) { counters.errors++; console.error('GALLERY_PHOTO_IMPORT_FAILED', file.id, error.message); continue; }
      }
      counters.imported++;
      if (item.verified) counters.verified_activity_links++;
    }
    counters.ai_suggestions = 0;
    counters.ai_reviewed = 0;
    if (apply && ai && process.env.OPENAI_API_KEY) {
      const uncertain = (await client.query(`SELECT id,file_name,museu,mes_referencia,ano,contexto_ia
        FROM report_photos WHERE base44_id LIKE 'drive-gallery-%' AND report_id IS NULL
        AND COALESCE(contexto_ia,'') NOT LIKE '%"ai_review"%'
        ORDER BY id LIMIT 12`)).rows;
      for (const photo of uncertain) {
        const month = `${photo.ano}-${String(monthNumber(photo.mes_referencia)).padStart(2,'0')}`;
        if (!photo.museu || month.endsWith('-00')) continue;
        const choices = activities.filter(activity =>
          `${activity.ano}-${String(monthNumber(activity.mes_referencia)).padStart(2,'0')}` === month
          && sameMuseum(photo.museu, activity.report_museu)).slice(0, 25);
        if (!choices.length) continue;
        counters.ai_reviewed++;
        try {
          const metadata = JSON.parse(photo.contexto_ia || '{}');
          const prompt = `Você audita metadados de fotos de museus. Não invente vínculo. Escolha um ID apenas se o nome/descrição da foto indicar claramente a atividade específica; caso contrário retorne null. Responda JSON {"activity_id":null|string,"confidence":0..1,"reason":string}. Foto: ${JSON.stringify({name:photo.file_name,museum:photo.museu,month,exif_month:metadata.exif_month,description:metadata.drive_description})}. Atividades candidatas: ${JSON.stringify(choices.map(c=>({id:c.base44_activity_id,name:c.nome,date:c.data_inicio,museum:c.report_museu})))}`;
          const response = await fetch('https://api.openai.com/v1/responses', {
            method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
            body:JSON.stringify({model:process.env.OPENAI_GALLERY_MODEL || 'gpt-4.1-mini',
              input:[{role:'user',content:[{type:'input_text',text:prompt}]}],text:{format:{type:'json_object'}}}),
            signal:AbortSignal.timeout(30000),
          });
          if (!response.ok) throw new Error(`OpenAI ${response.status}`);
          const body = await response.json();
          const content = body.output_text || body.output?.flatMap(o=>o.content || []).map(c=>c.text || '').join('') || '{}';
          const result = JSON.parse(content);
          const chosen = choices.find(c=>c.base44_activity_id === result.activity_id);
          // AI output is a proposal only; it cannot overwrite report ownership.
          metadata.ai_review = { suggested_activity_id: chosen?.base44_activity_id || null,
            confidence: Number(result.confidence) || 0, reason: String(result.reason || '').slice(0,500),
            reviewed_at: new Date().toISOString() };
          await client.query('UPDATE report_photos SET contexto_ia=$1,updated_date=NOW() WHERE id=$2',
            [JSON.stringify(metadata),photo.id]);
          if (chosen) counters.ai_suggestions++;
        } catch (error) { console.error('GALLERY_AI_REVIEW_FAILED',photo.id,error.message); }
      }
    }
    console.log('GALLERY_DRIVE_SYNC', JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counters }));
    if (counters.errors) process.exitCode = 1;
  } finally {
    if (apply) await client.query("SELECT pg_advisory_unlock(hashtext('sync-gallery-drive'))");
    client.release();
  }
}
try { await main(); } catch (error) { console.error('GALLERY_DRIVE_SYNC_FAILED', error); process.exitCode = 1; }
finally { await pool.end(); }
