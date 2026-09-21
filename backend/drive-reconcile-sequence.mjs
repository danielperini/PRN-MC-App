import { spawn } from 'node:child_process';
import pg from 'pg';

const months=(process.env.DRIVE_RECONCILE_SEQUENCE || '03-2026,02-2026,04-2026,05-2026,06-2026,07-2026,08-2026,09-2026')
  .split(',').map(x=>x.trim()).filter(Boolean);
const pauseMs=Number(process.env.DRIVE_RECONCILE_RETRY_DELAY_MS || 300000);
// An unavailable source document cannot become available by retrying the
// same monthly job forever.  The intake records the item for review and the
// sequence continues with the next fiscal month after this bounded retry.
const maxAttempts=Number(process.env.DRIVE_RECONCILE_MAX_ATTEMPTS || 2);
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

function runMonth(month) {
  return new Promise(resolve=>{
    let output='';
    const child=spawn(process.execPath,['drive-reconcile-intake.mjs'],{
      cwd:process.cwd(), env:{ ...process.env,DRIVE_RECONCILE_MONTH:month },stdio:['ignore','pipe','pipe']
    });
    const collect=(chunk,stream)=>{ const text=chunk.toString(); output+=text; stream.write(text); };
    child.stdout.on('data',chunk=>collect(chunk,process.stdout));
    child.stderr.on('data',chunk=>collect(chunk,process.stderr));
    child.on('exit',code=>{
      const lines=output.match(/DRIVE_RECONCILE_DONE\s+(\{[^\n]+\})/g)||[];
      let summary=null;
      try { summary=JSON.parse(lines.at(-1).replace(/^DRIVE_RECONCILE_DONE\s+/,'')); } catch {}
      resolve({ code,summary });
    });
  });
}

function reconcileMonth(month) {
  return new Promise(resolve=>{
    const child=spawn(process.execPath,['reconcile-invoices-purchases.mjs'],{
      cwd:process.cwd(), env:{ ...process.env,RECONCILE_APPLY:'1',RECONCILE_MARK_PAGO:'1',RECONCILE_MONTHS:month },stdio:['ignore','pipe','pipe']
    });
    child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
    child.on('exit',code=>resolve(code));
  });
}

const pool=new pg.Pool({
  host:process.env.DB_HOST || 'db',
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor',
  user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || ''
});
const client=await pool.connect();

try {
  // A scheduled watchdog and a manual restart can happen at the same time.
  // Keep one importer active so that both cannot create or move the same file.
  const { rows:[lock] }=await client.query(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    ['gestor-museus:drive-reconcile-sequence']
  );
  if (!lock?.locked) {
    console.log('DRIVE_RECONCILE_SEQUENCE_SKIPPED',JSON.stringify({ reason:'already_running',months,checked_at:new Date().toISOString() }));
  } else {
    try {
      for (const month of months) {
        let attempt=0;
        while (true) {
          attempt++;
          console.log('DRIVE_RECONCILE_MONTH_START',JSON.stringify({ month,attempt,started_at:new Date().toISOString() }));
          const result=await runMonth(month);
          // The Drive importer owns files; this pass owns the one-PDF/one-purchase
          // relationship. It is idempotent and uses only the complete fiscal key.
          const reconcileCode=await reconcileMonth(month);
          const complete=result.code===0 && result.summary && Number(result.summary.errors||0)===0;
          console.log('DRIVE_RECONCILE_MONTH_RESULT',JSON.stringify({ month,attempt,complete,code:result.code,reconcile_code:reconcileCode,...(result.summary||{}) }));
          if (complete) break;
          if (attempt >= maxAttempts) {
            console.warn('DRIVE_RECONCILE_MONTH_ADVANCE_WITH_ERRORS',JSON.stringify({ month,attempt,errors:result.summary?.errors || null }));
            break;
          }
          console.warn('DRIVE_RECONCILE_MONTH_RETRY',JSON.stringify({ month,attempt,wait_ms:pauseMs }));
          await sleep(pauseMs);
        }
      }
      console.log('DRIVE_RECONCILE_SEQUENCE_DONE',JSON.stringify({ months,finished_at:new Date().toISOString() }));
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))",['gestor-museus:drive-reconcile-sequence']);
    }
  }
} finally {
  client.release();
  await pool.end();
}
