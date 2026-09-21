import { spawn } from 'node:child_process';

function run(script, extraEnv={}) {
  return new Promise(resolve=>{
    const child=spawn(process.execPath,[script],{
      cwd:process.cwd(),
      env:{ ...process.env,...extraEnv },
      stdio:'inherit'
    });
    child.on('error',error=>resolve({ code:1,error:error.message }));
    child.on('exit',code=>resolve({ code:code ?? 1 }));
  });
}

const startedAt=new Date().toISOString();
console.log('DRIVE_DAILY_WATCHDOG_START',JSON.stringify({ started_at:startedAt }));

// Runs without a browser session or an app user. The current fiscal month is
// reconciled first; the backup pass then stores every eligible fiscal PDF in
// its emission-month folder. Both child jobs are idempotent.
const reconciliation=await run('drive-reconcile-current-month.mjs');
const backup=await run('backup-pending-drive.mjs');
const result={
  reconciliation,
  backup,
  started_at:startedAt,
  finished_at:new Date().toISOString()
};
console.log('DRIVE_DAILY_WATCHDOG_DONE',JSON.stringify(result));
if (reconciliation.code!==0 || backup.code!==0) process.exitCode=1;
