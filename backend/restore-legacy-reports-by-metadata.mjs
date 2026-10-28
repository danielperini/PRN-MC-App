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
  '00008': 'Clara Assumpcao',
  '00009': 'Daniela Assis',
};
// Canonical copies verified by reading the PDF contents through Drive.
const verifiedLegacyFiles = {
  '00001': '1Y1jGAdD7BNdprUn3i5eFa1lBpJ7I_RvI',
  '00002': '1Yq0SI5vsT8jGti1C4UktBUwwmbSmedA-',
  '00004': '1IeW8Ob5vofoMPbGY-zJ8srwUUhCvV6FV',
  '00006': '19MXPjCPKaLBBQNp9DaPlUxkrp6gfgzQZ',
  '00007': '1iOqtvfkrtmElvn0WfiEUPUrPwC8jx8KT',
  '00008': '1J_4sGXWUyDpSmljpecvxB4_ED9qUMVyK',
  '00009': '1HEsVTF7eguhAmE9gezeKpcFb2hGIjS2n',
};
const norm = v => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const monthValue = v => { const n=Number(v); if(Number.isInteger(n)) return n; const s=norm(v); const names=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']; const i=names.indexOf(s); if(i>=0) return i+1; const abbr={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12}; return abbr[s]||0; };
const authorMatches = (actual, expected) => { const a=new Set(norm(actual).split(' ').filter(x=>x.length>2)); const e=norm(expected).split(' ').filter(x=>x.length>2); return e.length>0 && e.filter(x=>a.has(x)).length >= Math.min(2,e.length); };
async function main() {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) throw new Error('Google Drive não configurado');
  const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET); auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version:'v3', auth }); const files=[];
  const walk = async parent => { let token; do { const r=await drive.files.list({q:`'${parent}' in parents and trashed=false`,fields:'nextPageToken,files(id,name,mimeType,webViewLink)',pageSize:1000,pageToken:token,supportsAllDrives:true,includeItemsFromAllDrives:true}); for(const f of r.data.files||[]) f.mimeType==='application/vnd.google-apps.folder'?await walk(f.id):files.push(f); token=r.data.nextPageToken; } while(token); };
  await walk(rootId);
  for (const id of Object.values(verifiedLegacyFiles)) {
    if (files.some(f => f.id === id)) continue;
    const f = (await drive.files.get({ fileId:id, fields:'id,name,mimeType,webViewLink', supportsAllDrives:true })).data;
    files.push(f);
  }
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
      let candidates=reports.filter(r=>{ const byId=directId && String(r.id)===directId; const byProto=seq && (String(r.numero_protocolo||'').includes(seq)||String(r.numero_relatorio||'').includes(seq)); const byPeriod=month&&year&&Number(r.ano)===year&&monthValue(r.mes_referencia)===month; const byAuthor=(author||suppliedAuthor)&&authorMatches(r.author_name,author||suppliedAuthor); return byId || byProto || (byPeriod&&byAuthor); });
      if(candidates.length!==1){ (candidates.length?summary.ambiguous:summary.unmatched).push({file:n,candidates:candidates.map(r=>r.id)}); continue; }
      const r=candidates[0]; if(r.drive_backup_relatorio_id===file.id){summary.linked++;continue;} if(apply) await db.query(`UPDATE reports SET drive_backup_relatorio_id=$1,drive_backup_relatorio_url=$2,drive_backup_status='concluido',drive_backup_at=NOW(),updated_date=NOW() WHERE id=$3`,[file.id,file.webViewLink||`https://drive.google.com/file/d/${file.id}/view`,r.id]); summary.linked++;
    }
  } finally { db.release(); await pool.end(); }
  console.log('REPORT_LEGACY_RESTORE',JSON.stringify(summary));
}
main().catch(e=>{console.error('REPORT_LEGACY_RESTORE_ERROR',e.message);process.exitCode=1});
