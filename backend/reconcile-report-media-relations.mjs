import crypto from 'node:crypto';
import pg from 'pg';

// Repairs the historical period in which photos were stored in the central
// gallery using a Base44 report id (or an activity id) that was later lost.
// It deliberately repairs only evidence-backed relations: an original report
// id, a unique report scope, or a source activity embedded in the file name.
// Ambiguous gallery material is left untouched rather than being assigned to
// the wrong professional report.
const apply = process.argv.includes('--apply') || process.env.REPORT_MEDIA_REPAIR_APPLY === '1';
const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalized(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function compatibleNames(left, right) {
  const a = normalized(left);
  const b = normalized(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function monthKey(value) {
  const key = normalized(value);
  const aliases = {
    janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
    julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
  };
  return aliases[key] || key;
}

function present(value) {
  return String(value ?? '').trim();
}

function safeLabel(value) {
  const label = present(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const key = normalized(label);
  if (!key || /^(foto|fotos|imagem|imagens|galeria)( \d+)?$/.test(key)) return '';
  if (/^\d+( \d+)*$/.test(key) || key.length < 3) return '';
  return label.slice(0, 500);
}

function labelFromCaption(photo) {
  let label = present(photo.caption || photo.legenda);
  // Common legacy caption forms: "Atividade · Agosto/2026" and
  // "Atividade — MUMO — 03/08/2026". The date is metadata, not its title.
  label = label.replace(/\s*[·|]\s*(?:janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/?\s*\d{2,4}\s*$/iu, '');
  label = label.replace(/\s*[—-]\s*(?:[0-3]?\d\/[0-1]?\d\/(?:20)?\d{2}|\d{4}-\d{2}-\d{2})\s*$/u, '');
  const candidate = safeLabel(label);
  const museum = normalized(photo.museu);
  return normalized(candidate) === museum ? '' : candidate;
}

function sourceFromPhoto(photo) {
  const fileName = present(photo.file_name);
  const parts = fileName.split('__');
  const prefix = parts[0] || '';
  const sourceToken = prefix.match(/_ATI_([A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)*)$/i)?.[1] || '';
  const title = safeLabel(parts.length >= 3 ? parts[1] : '') || labelFromCaption(photo);
  return { sourceToken, title };
}

function stableActivityId(reportId, sourceToken, title, idsOwnedByOtherReport) {
  const candidate = sourceToken ? `ATI_${sourceToken}` : '';
  if (candidate && !idsOwnedByOtherReport.has(candidate)) return candidate;
  const hash = crypto.createHash('sha256').update(`${reportId}:${normalized(title)}`).digest('hex').slice(0, 24);
  return `legacy-media-${reportId}-${hash}`;
}

function activityPayload(id, report, title, sourceToken) {
  return {
    id,
    nome: title,
    titulo: title,
    descricao: 'Atividade recuperada a partir dos metadados canônicos da foto.',
    museu_lista: report.museu ? [report.museu] : [],
    quantas_vezes_ocorreu: 1,
    publico_estimado: 0,
    recuperada_de_foto: true,
    origem_atividade_foto: sourceToken || 'legenda-da-foto',
  };
}

async function main() {
  const client = await pool.connect();
  const totals = {
    mode: apply ? 'apply' : 'dry-run', photos: 0, photoReportCanonicalized: 0,
    photoReportRecoveredByUniqueScope: 0, photosWithActivityLinked: 0,
    activitiesRestored: 0, reportAuthorsRepaired: 0,
    unresolvedPhotoReports: 0, unresolvedPhotoActivities: 0, ambiguousPhotoScopes: 0,
    authorConflictsPreserved: 0,
  };

  try {
    if (apply) await client.query('BEGIN');

    const reports = (await client.query(`SELECT id,base44_id,author_name,author_email,created_by,created_by_id,
      author_role,museu,mes_referencia,ano,raw_data FROM reports ORDER BY id`)).rows;
    const users = (await client.query('SELECT id,base44_id,email,full_name,role FROM users')).rows;
    const reportById = new Map(reports.map((row) => [String(row.id), row]));
    const reportByBase44 = new Map(reports.filter((row) => present(row.base44_id)).map((row) => [String(row.base44_id), row]));
    const reportsByScope = new Map();
    for (const report of reports) {
      const key = `${normalized(report.museu)}|${monthKey(report.mes_referencia)}|${report.ano || ''}`;
      if (!normalized(report.museu) || !monthKey(report.mes_referencia) || !report.ano) continue;
      const current = reportsByScope.get(key) || [];
      current.push(report);
      reportsByScope.set(key, current);
    }

    const activities = (await client.query('SELECT id,report_id,titulo,descricao FROM activities')).rows;
    const reportActivities = (await client.query(`SELECT base44_activity_id,report_id,report_base44_id,nome,descricao,
      museu_lista,raw_data FROM report_activities`)).rows;
    const ownedActivityIds = new Map();
    for (const row of activities) {
      if (present(row.id) && present(row.report_id)) ownedActivityIds.set(String(row.id), String(row.report_id));
    }
    for (const row of reportActivities) {
      if (present(row.base44_activity_id) && present(row.report_id)) {
        ownedActivityIds.set(String(row.base44_activity_id), String(row.report_id));
      }
    }
    const idsOwnedByOtherReport = new Set();
    const reportActivityById = new Map();
    const reportActivityByLabel = new Map();
    for (const row of reportActivities) {
      const reportId = String(row.report_id || '');
      if (!reportId) continue;
      reportActivityById.set(`${reportId}|${row.base44_activity_id}`, row);
      const label = normalized(row.nome || row.descricao);
      if (label) {
        const key = `${reportId}|${label}`;
        if (!reportActivityByLabel.has(key)) reportActivityByLabel.set(key, row);
        else reportActivityByLabel.set(key, null); // Never guess between duplicate titles.
      }
    }

    const rawActivityIdsByReport = new Map();
    for (const report of reports) {
      const raw = asObject(report.raw_data);
      rawActivityIdsByReport.set(String(report.id), new Set(
        (Array.isArray(raw.atividades) ? raw.atividades : [])
          .map((item) => present(item?.id || item?.base44_activity_id)).filter(Boolean),
      ));
    }

    // Repair author identity only where the historical name and an active
    // account match exactly, or where its creator email already identifies the
    // account. Conflicting Ana/Isabella data stays intact for human review.
    const usersByEmail = new Map(users.filter((user) => present(user.email)).map((user) => [normalized(user.email), user]));
    const usersByName = new Map();
    for (const user of users) {
      const key = normalized(user.full_name);
      if (key) {
        const candidates = usersByName.get(key) || [];
        candidates.push(user);
        usersByName.set(key, candidates);
      }
    }
    for (const report of reports) {
      const currentEmail = normalized(report.author_email || report.created_by);
      const emailUser = usersByEmail.get(currentEmail);
      const exactNamed = usersByName.get(normalized(report.author_name)) || [];
      const compatibleNamed = exactNamed.length ? exactNamed : users.filter((candidate) => compatibleNames(report.author_name, candidate.full_name));
      const nameUser = compatibleNamed.length === 1 ? compatibleNamed[0] : null;
      const user = emailUser || nameUser;
      if (!user) continue;
      const conflict = (emailUser && nameUser && String(emailUser.id) !== String(nameUser.id))
        || (emailUser && !nameUser && present(report.author_name) && !compatibleNames(report.author_name, emailUser.full_name));
      if (conflict) {
        totals.authorConflictsPreserved += 1;
        continue;
      }
      const desiredEmail = present(user.email);
      const needs = !normalized(report.author_email) || normalized(report.author_email) !== normalized(desiredEmail)
        || (nameUser && normalized(report.created_by).includes('@no-reply.base44.com'));
      if (!needs) continue;
      totals.reportAuthorsRepaired += 1;
      if (apply) {
        await client.query(`UPDATE reports SET author_email=$2,
          created_by=CASE WHEN lower(coalesce(created_by,'')) LIKE '%@no-reply.base44.com' THEN $2 ELSE created_by END,
          created_by_id=COALESCE(NULLIF($3,''),created_by_id),updated_date=NOW() WHERE id=$1`, [
          report.id, desiredEmail, present(user.base44_id),
        ]);
      }
    }

    const photos = (await client.query(`SELECT id,base44_id,report_id,activity_id,file_name,file_url,caption,legenda,
      author,museu,mes_referencia,ano,raw_data FROM report_photos ORDER BY id`)).rows;
    totals.photos = photos.length;
    const newActivities = new Map();
    const photoUpdates = [];

    for (const photo of photos) {
      const sourceReportId = present(photo.report_id);
      let report = reportById.get(sourceReportId) || reportByBase44.get(sourceReportId) || null;
      let recoveredByScope = false;
      if (!report) {
        const scope = `${normalized(photo.museu)}|${monthKey(photo.mes_referencia)}|${photo.ano || ''}`;
        const candidates = reportsByScope.get(scope) || [];
        if (candidates.length === 1) {
          [report] = candidates;
          recoveredByScope = true;
        } else {
          totals.unresolvedPhotoReports += 1;
          if (candidates.length > 1) totals.ambiguousPhotoScopes += 1;
          continue;
        }
      }
      const reportId = String(report.id);
      let canonicalized = sourceReportId !== reportId;
      let targetActivityId = present(photo.activity_id);
      if (targetActivityId && !reportActivityById.has(`${reportId}|${targetActivityId}`)) targetActivityId = '';

      if (!targetActivityId) {
        const source = sourceFromPhoto(photo);
        if (source.title) {
          const existingByLabel = reportActivityByLabel.get(`${reportId}|${normalized(source.title)}`);
          if (existingByLabel) targetActivityId = String(existingByLabel.base44_activity_id);
          else {
            const sourceId = stableActivityId(reportId, source.sourceToken, source.title,
              new Set([...idsOwnedByOtherReport, ...[...ownedActivityIds.entries()]
                .filter(([, owner]) => owner !== reportId).map(([id]) => id)]));
            const activityKey = `${reportId}|${sourceId}`;
            targetActivityId = sourceId;
            if (!reportActivityById.has(activityKey) && !newActivities.has(activityKey)) {
              newActivities.set(activityKey, { report, id: sourceId, title: source.title, sourceToken: source.sourceToken });
              reportActivityById.set(activityKey, { base44_activity_id: sourceId, report_id: reportId, nome: source.title });
              reportActivityByLabel.set(`${reportId}|${normalized(source.title)}`, { base44_activity_id: sourceId, report_id: reportId, nome: source.title });
              ownedActivityIds.set(sourceId, reportId);
            }
          }
        }
      }

      if (!targetActivityId) {
        totals.unresolvedPhotoActivities += 1;
      } else if (present(photo.activity_id) !== targetActivityId) {
        totals.photosWithActivityLinked += 1;
      }
      if (canonicalized) totals.photoReportCanonicalized += 1;
      if (recoveredByScope) totals.photoReportRecoveredByUniqueScope += 1;
      if (canonicalized || present(photo.activity_id) !== targetActivityId) {
        photoUpdates.push({ photo, report, activityId: targetActivityId || null, recoveredByScope });
      }
    }

    totals.activitiesRestored = newActivities.size;
    if (apply) {
      for (const item of newActivities.values()) {
        const reportId = String(item.report.id);
        const payload = activityPayload(item.id, item.report, item.title, item.sourceToken);
        await client.query(`INSERT INTO report_activities
          (base44_activity_id,report_id,report_base44_id,classificacao,nome,descricao,museu_lista,tipo_acao_lista,
           equipe_participante_ids,meta_vinculada_ids,quantas_vezes_ocorreu,publico_medio_sessao,publico_estimado,
           quantidade_produtos,total_produtos,data_inicio,data_fim,raw_data)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,1,0,0,0,0,NULL,NULL,$8::jsonb)
          ON CONFLICT (report_base44_id,base44_activity_id) DO UPDATE SET
            report_id=EXCLUDED.report_id,nome=EXCLUDED.nome,descricao=EXCLUDED.descricao,
            museu_lista=EXCLUDED.museu_lista,raw_data=EXCLUDED.raw_data`, [
          item.id, reportId, String(item.report.base44_id || reportId), 'Atividade recuperada', item.title,
          payload.descricao, JSON.stringify(payload.museu_lista), JSON.stringify(payload),
        ]);
        await client.query(`INSERT INTO activities
          (id,report_id,titulo,descricao,classificacao,equipe_responsavel,observacoes,publico_estimado,quantas_repeticoes,publico_total)
          VALUES ($1,$2,$3,$4,$5,$6,$7,0,1,0)
          ON CONFLICT (id) DO UPDATE SET report_id=EXCLUDED.report_id,titulo=EXCLUDED.titulo,
            descricao=EXCLUDED.descricao,classificacao=EXCLUDED.classificacao,observacoes=EXCLUDED.observacoes,updated_at=NOW()`, [
          item.id, reportId, item.title, payload.descricao, 'Atividade recuperada', item.report.equipe || '',
          `Recuperada de foto canônica (${item.sourceToken || 'legenda'}).`,
        ]);
        const presentIds = rawActivityIdsByReport.get(reportId) || new Set();
        if (!presentIds.has(item.id)) {
          await client.query(`UPDATE reports SET raw_data=jsonb_set(COALESCE(raw_data,'{}'::jsonb),'{atividades}',
              COALESCE(raw_data->'atividades','[]'::jsonb) || $2::jsonb,true),updated_date=NOW() WHERE id=$1`,
          [reportId, JSON.stringify([payload])]);
          presentIds.add(item.id);
          rawActivityIdsByReport.set(reportId, presentIds);
        }
      }
      for (const item of photoUpdates) {
        const raw = asObject(item.photo.raw_data);
        const nextRaw = {
          ...raw,
          report_id: String(item.report.id),
          activity_id: item.activityId,
          activityId: item.activityId,
          recuperada_relacao: true,
          estrategia_recuperacao: item.recoveredByScope ? 'escopo-unico-museu-mes' : 'identificador-original',
        };
        await client.query(`UPDATE report_photos SET report_id=$2,activity_id=$3,author=$4,museu=$5,
          mes_referencia=$6,ano=$7,raw_data=$8::jsonb,updated_date=NOW() WHERE id=$1`, [
          item.photo.id, String(item.report.id), item.activityId, item.report.author_name || item.photo.author || '',
          item.report.museu || item.photo.museu || '', item.report.mes_referencia || item.photo.mes_referencia || '',
          item.report.ano || item.photo.ano || null, JSON.stringify(nextRaw),
        ]);
      }
      await client.query('COMMIT');
    }
    console.log('REPORT_MEDIA_RELATION_RECONCILE', JSON.stringify(totals));
  } catch (error) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    console.error('REPORT_MEDIA_RELATION_RECONCILE_FAILED', error);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

try {
  await main();
} finally {
  await pool.end();
}
