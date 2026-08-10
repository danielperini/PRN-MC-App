import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      base44_id TEXT UNIQUE,
      user_email TEXT,
      type TEXT,
      title TEXT,
      message TEXT,
      entity_type TEXT,
      entity_id TEXT,
      action_url TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      resolved BOOLEAN DEFAULT FALSE,
      email_sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'appgestor-api' });
});

app.get('/db-health', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS now');
    res.json({ status: 'ok', database: 'connected', now: r.rows[0].now });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.get('/notifications', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC, id DESC');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/notifications', async (req, res) => {
  try {
    const {
      base44_id, user_email, type, title, message,
      entity_type, entity_id, action_url,
      is_read, resolved, email_sent
    } = req.body;

    const r = await pool.query(
      `INSERT INTO notifications
       (base44_id, user_email, type, title, message, entity_type, entity_id, action_url, is_read, resolved, email_sent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,FALSE),COALESCE($10,FALSE),COALESCE($11,FALSE))
       RETURNING *`,
      [
        base44_id || null, user_email || null, type || null, title || null,
        message || null, entity_type || null, entity_id || null,
        action_url || null, is_read ?? null, resolved ?? null, email_sent ?? null
      ]
    );

    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/notifications/:id', async (req, res) => {
  try {
    const { title, message, is_read, resolved, email_sent } = req.body;
    const r = await pool.query(
      `UPDATE notifications SET
        title = COALESCE($1, title),
        message = COALESCE($2, message),
        is_read = COALESCE($3, is_read),
        resolved = COALESCE($4, resolved),
        email_sent = COALESCE($5, email_sent),
        updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title ?? null, message ?? null, is_read ?? null, resolved ?? null, email_sent ?? null, req.params.id]
    );

    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/notifications/:id', async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM notifications WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, id: r.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = Number(process.env.PORT || 3000);

initDb()
  .then(() => {
    app.listen(port, '0.0.0.0', () => console.log(`AppGestor API listening on port ${port}`));
  })
  .catch((e) => {
    console.error('Database init failed:', e.message);
    process.exit(1);
  });
