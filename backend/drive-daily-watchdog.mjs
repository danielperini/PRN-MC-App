import { spawn } from 'node:child_process';

function run(script, args=[], extraEnv={}) {
  return new Promise(resolve=>{
    const child=spawn(process.execPath,[script,...args],{
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
// Completes only incomplete records when the fiscal PDF itself supplies the
// missing fields. Receipts, extracts and ambiguous documents are skipped.
const fiscalAi=await run('reanalyze-purchase-fiscal-metadata.mjs');
// Same fiscal key (issuer tax id + NF + value + emission date) is the only
// duplicate criterion. Applying it suppresses duplicates for audit rather
// than deleting the underlying original files.
const duplicateReconciliation=await run('reconcile-invoices-purchases.mjs',[],{ RECONCILE_APPLY:'1', RECONCILE_USE_AI:'0' });
// This pass changes only the display name of a Drive file whose fiscal
// identity has already been verified. It moves that same file to the fiscal
// month when necessary; it never creates a second copy.
const canonicalNames=await run('audit-drive-purchase-links.mjs',['--rename-only','--normalize-month']);
const result={
  reconciliation,
  backup,
  fiscal_ai:fiscalAi,
  duplicate_reconciliation:duplicateReconciliation,
  canonical_names:canonicalNames,
  started_at:startedAt,
  finished_at:new Date().toISOString()
};
console.log('DRIVE_DAILY_WATCHDOG_DONE',JSON.stringify(result));
if (reconciliation.code!==0 || backup.code!==0 || fiscalAi.code!==0 || duplicateReconciliation.code!==0 || canonicalNames.code!==0) process.exitCode=1;
