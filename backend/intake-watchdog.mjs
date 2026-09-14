import pg from 'pg';

const { Pool } = pg;
const timeoutMinutes = Math.max(5, Number(process.env.INTAKE_AI_TIMEOUT_MINUTES || 10));
const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD });
try {
  const { rows } = await pool.query("UPDATE document_intakes SET status_processamento = 'AGUARDANDO_REVISAO', grupo_status = 'AGUARDANDO_REVISAO', updated_at = NOW() WHERE status_processamento = 'ANALISANDO_IA' AND updated_at < NOW() - ($1::text || ' minutes')::interval RETURNING id, file_name_original", [timeoutMinutes]);
  console.log('INTAKE_WATCHDOG', JSON.stringify({ timeoutMinutes, released: rows.length, documents: rows }));
} catch (error) {
  console.error('INTAKE_WATCHDOG_ERROR', error.message);
  process.exitCode = 1;
} finally { await pool.end(); }
