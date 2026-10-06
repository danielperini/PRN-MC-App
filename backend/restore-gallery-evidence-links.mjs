import crypto from 'node:crypto';
import pg from 'pg';

// Restore only links proven by the exact Drive object of an image attachment.
// Never infer a report from museum, month, filename or AI-generated captions.
// Dry-run by default. Changes and editor projections are snapshotted together.
const apply = process.argv.includes('--apply');
const { Pool } = pg;
const pool = new Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || '',
});
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const array = value => Array.isArray(value) ? value : [];
const id = value => String(value ?? '').trim();
const norm = value => id(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
const photoKeys = value => {
  const keys = [];
  const url = id(value?.file_url || value?.url);
  const driveId = id(value?.drive_file_id) || url.match(/(?:\/file\/d\/|\/api\/drive-files\/)([A-Za-z0-9_-]+)/)?.[1];
  if (driveId) keys.push(`drive:${driveId}`);
  if (url) keys.push(`url:${url}`);
  if (id(value?.id || value?.base44_id)) keys.push(`id:${id(value.id || value.base44_id)}`);
  return keys;
};
const appendUnique = (items, additions) => {
  const result = [...array(items)];
  const keys = new Set(result.flatMap(photoKeys));
  let added = 0;
  for (const photo of additions) {
    const identifiers = photoKeys(photo);
    if (identifiers.some(key => keys.has(key))) continue;
    result.push(photo); identifiers.forEach(key => keys.add(key)); added++;
  }
  return { items:result, added };
};
const editorPhoto = row => {
  const raw = object(row.raw_data);
  const photoId = id(row.base44_id || raw.id || row.id);
  return {
    ...raw, id:photoId, base44_id:photoId,
    drive_file_id:row.drive_file_id || raw.drive_file_id || '',
    url:row.file_url || raw.url || raw.file_url || '',
    file_url:row.file_url || raw.file_url || raw.url || '',
    fileName:row.file_name || raw.fileName || raw.file_name || '',
    file_name:row.file_name || raw.file_name || raw.fileName || '',
    caption:row.caption || row.legenda || raw.caption || raw.legenda || '',
    activityId:row.activity_id || null, activity_id:row.activity_id || null,
    author:row.author || raw.author || '',
    museum:row.museu || raw.museum || raw.museu || '',
    museu:row.museu || raw.museu || raw.museum || '',
  };
};

async function candidates(db) {
  const rows = (await db.query(`SELECT p.id AS photo_id,p.drive_file_id,p.report_id AS old_report_id,
      p.activity_id AS old_activity_id,p.author AS old_author,p.museu AS old_museu,
      p.mes_referencia AS old_month,p.ano AS old_year,p.raw_data AS photo_raw,
      a.id AS attachment_id,r.id::text AS report_id,r.author_name,r.museu AS report_museum,
      r.mes_referencia AS report_month,r.ano AS report_year,ra.base44_activity_id AS activity_id
    FROM report_photos p
    JOIN attachments a ON a.drive_file_id=p.drive_file_id
      AND a.file_type LIKE 'image/%'
    JOIN reports r ON r.id::text=a.report_id OR r.base44_id=a.report_id
    JOIN report_activities ra ON ra.report_id=r.id::text AND ra.base44_activity_id=a.activity_id
    WHERE (p.report_id IS NULL OR p.report_id='') AND p.drive_file_id IS NOT NULL
    ORDER BY p.id,a.id`)).rows;
  const byPhoto = new Map();
  for (const row of rows) {
    const list = byPhoto.get(String(row.photo_id)) || [];
    list.push(row); byPhoto.set(String(row.photo_id),list);
  }
  const ready = [], review = [];
  for (const [photoId,list] of byPhoto) {
    const targets = new Set(list.map(row => `${row.report_id}|${row.activity_id}`));
    if (targets.size !== 1) { review.push({photo_id:photoId,reason:'multiple_attachment_destinations'}); continue; }
    const row = list[0];
    const raw = object(row.photo_raw);
    const priorReport = id(raw.report_id || raw.reportId || raw.relatorio_id);
    const priorActivity = id(raw.activity_id || raw.activityId);
    if ((priorReport && priorReport !== id(row.report_id))
      || (priorActivity && priorActivity !== id(row.activity_id))) {
      review.push({photo_id:photoId,reason:'conflicting_original_reference'}); continue;
    }
    if (id(row.old_author) && norm(row.old_author) !== norm(row.author_name)) {
      review.push({photo_id:photoId,reason:'conflicting_author'}); continue;
    }
    ready.push(row);
  }
  return {ready,review};
}

async function missingAttachmentPhotos(db) {
  const rows = (await db.query(`SELECT a.id AS attachment_id,a.report_id AS source_report_id,
      a.activity_id AS source_activity_id,a.drive_file_id,a.file_name,a.file_url,a.file_type,
      a.local_path,a.local_file_size,a.source_file_size,a.local_md5,a.source_file_hash,
      a.description,a.created_by,a.created_by_id,a.created_date,
      r.id::text AS report_id,r.author_name,r.museu AS report_museum,
      r.mes_referencia AS report_month,r.ano AS report_year,
      ra.base44_activity_id AS valid_activity_id
    FROM attachments a
    JOIN reports r ON r.id::text=a.report_id OR r.base44_id=a.report_id
    LEFT JOIN report_activities ra ON ra.report_id=r.id::text AND ra.base44_activity_id=a.activity_id
    WHERE a.file_type LIKE 'image/%' AND a.file_url IS NOT NULL AND a.file_url<>''
      AND NOT EXISTS (SELECT 1 FROM report_photos p WHERE
        (a.drive_file_id IS NOT NULL AND p.drive_file_id=a.drive_file_id)
        OR p.file_url=a.file_url OR p.attachment_id=a.id::text
        OR (p.report_id=r.id::text AND p.md5 IS NOT NULL
          AND (p.md5=a.local_md5 OR p.md5=a.source_file_hash)
          AND (a.activity_id IS NULL OR p.activity_id=a.activity_id)))
    ORDER BY a.id`)).rows;
  const byAttachment = new Map();
  for (const row of rows) {
    const list = byAttachment.get(String(row.attachment_id)) || [];
    list.push(row); byAttachment.set(String(row.attachment_id),list);
  }
  const ready = [], review = [];
  for (const [attachmentId,list] of byAttachment) {
    if (new Set(list.map(row => row.report_id)).size !== 1) {
      review.push({attachment_id:attachmentId,reason:'multiple_report_matches'}); continue;
    }
    ready.push(list[0]);
  }
  return {ready,review};
}

async function hashCandidates(db) {
  const rows = (await db.query(`SELECT p.id AS photo_id,p.report_id AS old_report_id,
      p.activity_id AS old_activity_id,p.author AS old_author,p.museu AS old_museu,
      p.mes_referencia AS old_month,p.ano AS old_year,p.raw_data AS photo_raw,
      a.id AS attachment_id,a.report_id AS source_report_id,
      a.activity_id AS source_activity_id,r.id::text AS report_id,r.author_name,
      r.museu AS report_museum,r.mes_referencia AS report_month,r.ano AS report_year,
      ra.base44_activity_id AS activity_id
    FROM report_photos p
    JOIN attachments a ON p.md5 IS NOT NULL AND p.md5<>''
      AND (p.md5=a.local_md5 OR p.md5=a.source_file_hash)
      AND a.file_type LIKE 'image/%'
    JOIN reports r ON r.id::text=a.report_id OR r.base44_id=a.report_id
    LEFT JOIN report_activities ra ON ra.report_id=r.id::text AND ra.base44_activity_id=a.activity_id
    WHERE (p.report_id IS NULL OR p.report_id='')
      AND NOT EXISTS (SELECT 1 FROM report_photos existing WHERE
        (a.drive_file_id IS NOT NULL AND existing.drive_file_id=a.drive_file_id)
        OR existing.file_url=a.file_url OR existing.attachment_id=a.id::text)
    ORDER BY p.id,a.id`)).rows;
  const byPhoto = new Map(), byAttachment = new Map();
  for (const row of rows) {
    byPhoto.set(String(row.photo_id),[...(byPhoto.get(String(row.photo_id)) || []),row]);
    byAttachment.set(String(row.attachment_id),[...(byAttachment.get(String(row.attachment_id)) || []),row]);
  }
  const ready = [], review = [];
  for (const [photoId,list] of byPhoto) {
    if (list.length !== 1 || byAttachment.get(String(list[0].attachment_id)).length !== 1) {
      review.push({photo_id:photoId,reason:'nonunique_hash_match'}); continue;
    }
    const row = list[0];
    const raw = object(row.photo_raw);
    const priorReport = id(raw.report_id || raw.reportId || raw.relatorio_id);
    const priorActivity = id(raw.activity_id || raw.activityId);
    if ((priorReport && priorReport !== id(row.report_id))
      || (priorActivity && priorActivity !== id(row.activity_id))
      || (id(row.old_author) && norm(row.old_author) !== norm(row.author_name))) {
      review.push({photo_id:photoId,reason:'conflicting_original_reference'}); continue;
    }
    ready.push(row);
  }
  return {ready,review};
}

async function snapshot(db,runId,table,sourceId) {
  await db.query(`INSERT INTO report_relation_repair_snapshots(run_id,source_table,source_id,row_data)
    SELECT $1,$2,id::text,to_jsonb(source) FROM ${table} AS source WHERE id::text=$3
    ON CONFLICT DO NOTHING`,[runId,table,String(sourceId)]);
}

async function main() {
  const db = await pool.connect();
  const runId = crypto.randomUUID();
  try {
    const plan = await candidates(db);
    const hashPlan = await hashCandidates(db);
    const attachmentPlan = await missingAttachmentPhotos(db);
    const matchedAttachmentIds = new Set(hashPlan.ready.map(row => String(row.attachment_id)));
    attachmentPlan.ready = attachmentPlan.ready.filter(row => !matchedAttachmentIds.has(String(row.attachment_id)));
    const summary = {run_id:runId,mode:apply?'apply':'dry_run',candidates:plan.ready.length,
      reports:new Set(plan.ready.map(row => row.report_id)).size,
      activities:new Set(plan.ready.map(row => `${row.report_id}|${row.activity_id}`)).size,
      review:plan.review,attachment_photos_to_import:attachmentPlan.ready.length,
      attachment_reports:new Set(attachmentPlan.ready.map(row => row.report_id)).size,
      attachment_activities_valid:attachmentPlan.ready.filter(row => row.valid_activity_id).length,
      attachment_activities_unresolved:attachmentPlan.ready.filter(row => row.source_activity_id && !row.valid_activity_id).length,
      attachment_review:attachmentPlan.review,hash_links_to_restore:hashPlan.ready.length,
      hash_review:hashPlan.review,linked:0,linked_by_hash:0,imported:0,
      report_projection_added:0,activity_projection_added:0,
      normalized_activity_projection_added:0};
    if (!apply || (!plan.ready.length && !hashPlan.ready.length && !attachmentPlan.ready.length)) {
      console.log('RESTORE_GALLERY_EVIDENCE_LINKS',JSON.stringify(summary)); return;
    }
    await db.query('BEGIN');
    await db.query(`CREATE TABLE IF NOT EXISTS report_relation_repair_snapshots (
      run_id UUID NOT NULL,captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_table TEXT NOT NULL,source_id TEXT NOT NULL,row_data JSONB NOT NULL,
      PRIMARY KEY(run_id,source_table,source_id))`);
    await db.query('SELECT id FROM report_photos WHERE id::text=ANY($1::text[]) ORDER BY id FOR UPDATE',
      [[...plan.ready,...hashPlan.ready].map(row => String(row.photo_id))]);
    await db.query('SELECT id FROM attachments WHERE id::text=ANY($1::text[]) ORDER BY id FOR UPDATE',
      [[...attachmentPlan.ready,...hashPlan.ready].map(row => String(row.attachment_id))]);
    const fresh = await candidates(db);
    const freshHashes = await hashCandidates(db);
    const freshAttachments = await missingAttachmentPhotos(db);
    const signature = rows => rows.map(row => `${row.photo_id}|${row.report_id}|${row.activity_id}`).sort().join(';');
    if (signature(fresh.ready) !== signature(plan.ready)) throw new Error('evidence_plan_changed_retry');
    const hashSignature = rows => rows.map(row => `${row.photo_id}|${row.attachment_id}|${row.report_id}|${row.activity_id || ''}`).sort().join(';');
    if (hashSignature(freshHashes.ready) !== hashSignature(hashPlan.ready)) throw new Error('hash_plan_changed_retry');
    freshAttachments.ready = freshAttachments.ready.filter(row => !matchedAttachmentIds.has(String(row.attachment_id)));
    const attachmentSignature = rows => rows.map(row => `${row.attachment_id}|${row.report_id}|${row.valid_activity_id || ''}`).sort().join(';');
    if (attachmentSignature(freshAttachments.ready) !== attachmentSignature(attachmentPlan.ready))
      throw new Error('attachment_plan_changed_retry');

    for (const row of plan.ready) {
      await snapshot(db,runId,'report_photos',row.photo_id);
      const raw = object(row.photo_raw);
      const audit = {at:new Date().toISOString(),attachment_id:row.attachment_id,
        drive_file_id:row.drive_file_id,report_id:row.report_id,activity_id:row.activity_id,
        method:'same_drive_file_as_activity_evidence',old_museum:row.old_museu,
        old_month:row.old_month,old_year:row.old_year};
      const result = await db.query(`UPDATE report_photos SET report_id=$2,activity_id=$3,
        author=$4,museu=$5,mes_referencia=$6,ano=$7,
        raw_data=$8::jsonb,updated_date=NOW()
        WHERE id=$1 AND (report_id IS NULL OR report_id='')`,[
        row.photo_id,row.report_id,row.activity_id,row.author_name || row.old_author || '',
        row.report_museum || row.old_museu || '',row.report_month || row.old_month || '',
        row.report_year || row.old_year || null,
        JSON.stringify({...raw,report_id:row.report_id,activity_id:row.activity_id,
          evidence_link_repair:audit}),
      ]);
      if (result.rowCount !== 1) throw new Error(`photo_changed_retry:${row.photo_id}`);
      summary.linked++;
    }

    for (const row of hashPlan.ready) {
      await snapshot(db,runId,'report_photos',row.photo_id);
      const raw = object(row.photo_raw);
      const audit = {at:new Date().toISOString(),attachment_id:row.attachment_id,
        report_id:row.report_id,activity_id:row.activity_id || null,
        method:'unique_matching_image_md5_and_attachment',old_museum:row.old_museu,
        old_month:row.old_month,old_year:row.old_year};
      const result = await db.query(`UPDATE report_photos SET report_id=$2,activity_id=$3,
        attachment_id=$4,author=$5,museu=$6,mes_referencia=$7,ano=$8,
        raw_data=$9::jsonb,updated_date=NOW()
        WHERE id=$1 AND (report_id IS NULL OR report_id='')`,[
        row.photo_id,row.report_id,row.activity_id || null,String(row.attachment_id),
        row.author_name || row.old_author || '',row.report_museum || row.old_museu || '',
        row.report_month || row.old_month || '',row.report_year || row.old_year || null,
        JSON.stringify({...raw,report_id:row.report_id,activity_id:row.activity_id || null,
          unresolved_source_activity_id:row.activity_id ? null : row.source_activity_id || null,
          evidence_link_repair:audit}),
      ]);
      if (result.rowCount !== 1) throw new Error(`hash_photo_changed_retry:${row.photo_id}`);
      summary.linked_by_hash++;
    }

    for (const row of attachmentPlan.ready) {
      const photoId = `evidence-attachment-${row.attachment_id}`;
      const raw = {id:photoId,source:'activity_evidence_attachment',attachment_id:String(row.attachment_id),
        source_report_id:row.source_report_id,source_activity_id:row.source_activity_id || null,
        activity_unresolved:Boolean(row.source_activity_id && !row.valid_activity_id),
        drive_file_id:row.drive_file_id || null,file_url:row.file_url};
      const inserted = await db.query(`INSERT INTO report_photos
        (base44_id,report_id,activity_id,attachment_id,drive_file_id,file_name,file_url,
         local_path,file_size,md5,legenda,caption,author,museu,mes_referencia,ano,
         galeria_oculta,drive_backup_status,created_by_id,created_by,created_date,updated_date,raw_data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,
          FALSE,$16,$17,$18,$19,NOW(),$20::jsonb)
        ON CONFLICT (base44_id) DO NOTHING RETURNING id`,[
        photoId,row.report_id,row.valid_activity_id || null,String(row.attachment_id),
        row.drive_file_id || null,row.file_name || '',row.file_url,row.local_path || null,
        row.local_file_size || row.source_file_size || null,row.local_md5 || row.source_file_hash || null,
        row.description || null,row.author_name || '',row.report_museum || '',row.report_month || '',
        row.report_year || null,row.drive_file_id ? 'concluido' : 'pendente',
        row.created_by_id || null,row.created_by || null,row.created_date || new Date(),JSON.stringify(raw),
      ]);
      if (inserted.rowCount !== 1) throw new Error(`attachment_photo_changed_retry:${row.attachment_id}`);
      summary.imported++;
    }

    // Append-only synchronization: existing report narratives, activities and
    // their photographs are preserved. Only missing canonical photos are added.
    const reportIds = (await db.query(`SELECT DISTINCT report_id FROM report_photos
      WHERE report_id IS NOT NULL AND report_id<>'' ORDER BY report_id`)).rows.map(row => row.report_id);
    summary.projection_reports_examined = reportIds.length;
    for (const reportId of reportIds) {
      const report = (await db.query('SELECT id,raw_data FROM reports WHERE id::text=$1 FOR UPDATE',[reportId])).rows[0];
      if (!report) throw new Error(`report_disappeared:${reportId}`);
      const photos = (await db.query(`SELECT * FROM report_photos WHERE report_id=$1
        ORDER BY ordem NULLS LAST,created_date,id`,[reportId])).rows;
      const photoByActivity = new Map();
      for (const photo of photos) {
        if (!photo.activity_id) continue;
        const list = photoByActivity.get(photo.activity_id) || [];
        list.push(editorPhoto(photo)); photoByActivity.set(photo.activity_id,list);
      }
      const original = object(report.raw_data);
      const reportPhotos = appendUnique(original.fotos,photos.map(editorPhoto));
      const activities = [...array(original.atividades)];
      const activityRows = (await db.query('SELECT id,base44_activity_id,nome,raw_data FROM report_activities WHERE report_id=$1',[reportId])).rows;
      const byId = new Map(activityRows.map(row => [id(row.base44_activity_id),row]));
      const seen = new Set();
      let reportActivityAdded = 0;
      const updatedActivities = activities.map(value => {
        const activity = object(value);
        const activityId = id(activity.id || activity.base44_activity_id);
        seen.add(activityId);
        const additions = photoByActivity.get(activityId) || [];
        const merged = appendUnique(activity.fotos,additions);
        reportActivityAdded += merged.added;
        return merged.added ? {...activity,fotos:merged.items} : value;
      });
      for (const [activityId,additions] of photoByActivity) {
        if (seen.has(activityId)) continue;
        const row = byId.get(activityId);
        if (!row) throw new Error(`unrecognized_report_activity:${reportId}|${activityId}`);
        updatedActivities.push({...object(row.raw_data),id:activityId,
          nome:row.nome || object(row.raw_data).nome || '',fotos:additions});
        reportActivityAdded += additions.length;
      }
      if (reportPhotos.added || reportActivityAdded) {
        await snapshot(db,runId,'reports',reportId);
        await db.query('UPDATE reports SET raw_data=$2::jsonb,updated_date=NOW() WHERE id=$1',[
          reportId,JSON.stringify({...original,fotos:reportPhotos.items,atividades:updatedActivities}),
        ]);
        summary.report_projection_added += reportPhotos.added;
        summary.activity_projection_added += reportActivityAdded;
      }
      for (const row of activityRows) {
        const additions = photoByActivity.get(id(row.base44_activity_id)) || [];
        if (!additions.length) continue;
        const originalActivity = object(row.raw_data);
        const merged = appendUnique(originalActivity.fotos,additions);
        if (!merged.added) continue;
        await snapshot(db,runId,'report_activities',row.id);
        await db.query('UPDATE report_activities SET raw_data=$2::jsonb WHERE id=$1',[
          row.id,JSON.stringify({...originalActivity,fotos:merged.items}),
        ]);
        summary.normalized_activity_projection_added += merged.added;
      }
    }
    await db.query('COMMIT');
    console.log('RESTORE_GALLERY_EVIDENCE_LINKS',JSON.stringify(summary));
  } catch (error) {
    if (apply) await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { db.release(); await pool.end(); }
}
main().catch(error => { console.error('RESTORE_GALLERY_EVIDENCE_LINKS_FAILED',error); process.exitCode=1; });
