import pg from 'pg';
import { google } from 'googleapis';

const apply = process.argv.includes('--apply');
const rootId = process.argv.find(a => a.startsWith('--root-folder-id='))?.slice(17) || process.env.GOOGLE_DRIVE_FOLDER_ID || '1TJ44Sz-A3gub8lv_U2GRsn16hwkuhwkF';
const pool = new pg.Pool({ host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432), database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor', password: process.env.POSTGRES_PASSWORD || '' });
const months = { JAN:1, FEV:2, MAR:3, ABR:4, MAI:5, JUN:6, JUL:7, AGO:8, SET:9, OUT:10, NOV:11, DEZ:12 };
const suppliedProtocolAuthors = {
  '00001': 'Lara Carvalho Ferreira',
  '00002': 'Juliana Silva',
  '00004': 'Producao Viaduto das Artes',
  '00006': 'Caroline Abasse',
  '00007': 'Daniela Assis',
  '00009': 'Daniela Assis',
};
const norm = v => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
async function main() {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) throw new Error('Google Drive não configurado');
  const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET); auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version:'v3', auth }); const files=[];
  const walk = async parent => { let token; do { const r=await drive.files.list({q:`'${parent}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,mimeType,webViewLink)',pageSize:1000,pageToken:token,supportsAllDrives:true,includeItemsFromAllDrives:true}); for(const f of r.data.files||[]) f.mimeType==='application/vnd.google-apps.folder'?await walk(f.id):files.push(f); token=r.data.nextPageToken; } while(token); };
  await walk(rootId);
  const legacy = files.filter(f => /\.(pdf|html?)$/i.test(f.name) && !/Relatorio_Mensal_(APPROVED|DRAFT|RETURNED|SUBMITTED)_/i.test(f.name));
  const db=await pool.connect(); const summary={mode:apply?'apply':'dry_run',files:legacy.length,linked:0,ambiguous:[],unmatched:[]};
  try {
    // Legacy installations do not all have the optional protocol columns.
    // Read the existing schema and use whichever metadata is available.
    const reports=(await db.query('SELECT * FROM reports')).rows;
    for(const file of legacy){
      const n=file.name; const protocol=n.match(/MC[-_](JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(20\d{2})[-_](\d{4,})/i); const period=n.match(/(Janeiro|Fevereiro|Marco|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)[ _-]*(20\d{2})/i); const month=protocol?months[protocol[1].toUpperCase()]:period?months[norm(period[1]).slice(0,3).toUpperCase()]:null; const year=Number(protocol?.[2]||period?.[2]||0); const seq=protocol?.[3]; const author=n.replace(/\.[^.]+$/,'').replace(/^Relatorio(?:_Mensal)?[_ -]*/i,'').replace(/MC[-_][A-Z]+20\d{2}[-_]\d{4,}/i,'').replace(/[-_]*(Fevereiro|Marco|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)[ _-]*20\d{2}/i,'').trim();
      const directId = n.match(/(?:^|[_-])ID-(\d+)(?:[_-]|\.)/i)?.[1];
      const suppliedAuthor = seq ? suppliedProtocolAuthors[seq] : '';
      let candidates=reports.filter(r=>{ const byId=directId && String(r.id)===directId; const byProto=seq && (String(r.numero_protocolo||'').includes(seq)||String(r.numero_relatorio||'').includes(seq)); const byPeriod=month&&year&&Number(r.ano)===year&&Number(r.mes_referencia)===month; const byAuthor=(author||suppliedAuthor)&&norm(r.author_name).includes(norm(author||suppliedAuthor)); return byId || byProto || (byPeriod&&byAuthor); });
      if(candidates.length!==1){ (candidates.length?summary.ambiguous:summary.unmatched).push({file:n,candidates:candidates.map(r=>r.id)}); continue; }
      const r=candidates[0]; if(r.drive_backup_relatorio_id===file.id){summary.linked++;continue;} if(apply) await db.query(`UPDATE reports SET drive_backup_relatorio_id=$1,drive_backup_relatorio_url=$2,drive_backup_status='concluido',drive_backup_at=NOW(),updated_date=NOW() WHERE id=$3`,[file.id,file.webViewLink||`https://drive.google.com/file/d/${file.id}/view`,r.id]); summary.linked++;
    }
  } finally { db.release(); await pool.end(); }
  console.log('REPORT_LEGACY_RESTORE',JSON.stringify(summary));
}
main().catch(e=>{console.error('REPORT_LEGACY_RESTORE_ERROR',e.message);process.exitCode=1});
