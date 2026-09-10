import { spawn } from 'node:child_process';

const now=new Date();
const month=`${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
const child=spawn(process.execPath,['drive-reconcile-sequence.mjs'],{
  cwd:process.cwd(),
  env:{
    ...process.env,
    DRIVE_RECONCILE_SEQUENCE:month,
    DRIVE_RECONCILE_SOURCE_MONTH_ONLY:'1'
  },
  stdio:'inherit'
});
child.on('exit',code=>process.exit(code ?? 1));
