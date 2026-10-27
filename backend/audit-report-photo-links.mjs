import pg from 'pg';

// Audita e, somente com --apply, repara vínculos inequívocos de foto -> atividade.
// Nunca inventa atividade: a reparação exige atividade pertencente ao mesmo relatório
// e uma única correspondência de data (metadata.data_foto/data_atividade).
const apply = process.argv.includes('--apply');
const pool = new pg.Pool({ host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432), database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor', password: process.env.POSTGRES_PASSWORD || '' });
const dateOnly = v => String(v || '').match(/^(20\d{2})[-:](\d{2})[-:](\d{2})/)?.[0]?.replaceAll(':', '-') || '';
const json = v => { try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch { return {}; } };
const out = { mode: apply ? 'apply' : 'dry_run', photos: 0, valid: 0, repaired: 0, unresolved: 0, monthConflicts: 0 };
try {
  const { rows } = await pool.query(`SELECT p.*, r.mes_referencia AS report_month, r.ano AS report_year,
    a.id AS activity_row_id, a.base44_activity_id AS activity_base_id, a.nome AS activity_name,
    a.data_inicio AS activity_date, a.data_fim AS activity_end
    FROM report_photos p JOIN reports r ON r.id::text=p.report_id
    LEFT JOIN report_activities a ON a.report_id::text=p.report_id
      AND (a.id::text=p.activity_id OR a.base44_activity_id::text=p.activity_id)
    WHERE p.duplicada_de IS NULL ORDER BY p.id`);
  for (const p of rows) {
    out.photos++;
    const raw = json(p.raw_data); const photoDate = dateOnly(raw.data_foto || raw.data_atividade || p.created_date);
    const activityDate = dateOnly(p.activity_date || p.activity_end);
    const reportKey = `${p.report_year}-${String({Janeiro:1,Fevereiro:2,Março:3,Abril:4,Maio:5,Junho:6,Julho:7,Agosto:8,Setembro:9,Outubro:10,Novembro:11,Dezembro:12}[p.report_month] || 0).padStart(2,'0')}`;
    if (photoDate && activityDate && photoDate.slice(0,7) !== activityDate.slice(0,7)) out.monthConflicts++;
    if (p.activity_row_id && (!photoDate || !activityDate || photoDate.slice(0,7) === activityDate.slice(0,7))) { out.valid++; continue; }
    const candidates = rows.filter(a => String(a.report_id) === String(p.report_id) && dateOnly(a.activity_date || a.activity_end) && photoDate && dateOnly(a.activity_date || a.activity_end).slice(0,7) === photoDate.slice(0,7));
    if (candidates.length === 1 && apply) {
      await pool.query('UPDATE report_photos SET activity_id=$2,mes_referencia=$3,ano=$4,updated_date=NOW() WHERE id=$1', [p.id, candidates[0].activity_base_id || candidates[0].activity_row_id, p.report_month, p.report_year]);
      out.repaired++;
    } else out.unresolved++;
  }
  console.log('REPORT_PHOTO_ACTIVITY_AUDIT', JSON.stringify(out));
} finally { await pool.end(); }
