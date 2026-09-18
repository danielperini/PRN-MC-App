import { spawn } from 'node:child_process';

const months=(process.env.DRIVE_RECONCILE_SEQUENCE || '03-2026,02-2026,04-2026,05-2026,06-2026,07-2026,08-2026,09-2026')
  .split(',').map(x=>x.trim()).filter(Boolean);
const pauseMs=Number(process.env.DRIVE_RECONCILE_RETRY_DELAY_MS || 300000);
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

for (const month of months) {
  let attempt=0;
  while (true) {
    attempt++;
    console.log('DRIVE_RECONCILE_MONTH_START',JSON.stringify({ month,attempt,started_at:new Date().toISOString() }));
    const result=await runMonth(month);
    const complete=result.code===0 && result.summary && Number(result.summary.errors||0)===0;
    console.log('DRIVE_RECONCILE_MONTH_RESULT',JSON.stringify({ month,attempt,complete,code:result.code,...(result.summary||{}) }));
    if (complete) break;
    console.warn('DRIVE_RECONCILE_MONTH_RETRY',JSON.stringify({ month,attempt,wait_ms:pauseMs }));
    await sleep(pauseMs);
  }
}
console.log('DRIVE_RECONCILE_SEQUENCE_DONE',JSON.stringify({ months,finished_at:new Date().toISOString() }));
