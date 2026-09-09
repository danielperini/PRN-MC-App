import pg from 'pg';
import * as XLSX from 'xlsx';
import crypto from 'node:crypto';

const { Pool } = pg;
const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const pool = new Pool({
  host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const clean = v => v instanceof Date ? `${String(v.getDate()).padStart(2,'0')}/${String(v.getMonth()+1).padStart(2,'0')}/${v.getFullYear()}` : String(v ?? '').trim();
const q = s => `"${String(s).replaceAll('"','""')}"`;

function monthInfo(name='') {
  const months={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  const n=norm(name); let month=null; for(const [k,v] of Object.entries(months)) if(n.includes(k)){month=v;break;}
  const m=n.match(/(?:20)?(\d{2})/); let year=m?Number(m[1]):null; if(year && year<100) year+=2000;
  return {month,year};
}
function parseDate(v,sheet) {
  if(v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if(typeof v==='number' && v>20000){const d=XLSX.SSF.parse_date_code(v); if(d?.y)return new Date(d.y,d.m-1,d.d);}
  const t=clean(v); if(!t)return null; const {month,year}=monthInfo(sheet);
  let m=t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/); if(m){let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1]);}
  m=t.match(/(\d{1,2})[\/.\-](\d{1,2})/); if(m)return new Date(year||2026,+m[2]-1,+m[1]);
  m=t.match(/^(\d{1,2})/); if(m&&month&&year)return new Date(year,month-1,+m[1]);
  return month&&year?new Date(year,month-1,1):null;
}
function museum(equipment,local='') {const t=norm(`${equipment} ${local}`);if(t.includes('mhab')||t.includes('abilio barreto'))return 'MHAB';if(t.includes('mis')||t.includes('imagem e do som'))return 'MIS';if(t.includes('mumo')||t.includes('museu da moda'))return 'MUMO';return 'Externo';}
function headerKey(v){const h=norm(v);if(h.includes('nome da acao')||h.includes('nome da atividade')||h==='nome')return 'nome';if(h.includes('sinopse'))return 'sinopse';if(h.includes('tipo de atividade'))return 'tipo_atividade';if(h==='formato')return 'formato';if(h==='data'||h.includes('periodo'))return 'data';if(h.includes('horario'))return 'horario';if(h.includes('publico-alvo')||h.includes('publico alvo'))return 'publico_alvo';if(h.includes('acessibilidade'))return 'acessibilidade';if(h.includes('classificacao indicativa'))return 'classificacao_indicativa';if(h.includes('vagas'))return 'vagas';if(h.includes('inscricao')||h.includes('acesso'))return 'inscricao';if(h==='local')return 'local';if(h.includes('endereco completo'))return 'endereco_completo';if(h==='status')return 'status';if(h.includes('link de imagens'))return 'link_imagens';return h.replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function rowsFromSheet(ws,name){const matrix=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});if(matrix.length<4)return[];let hi=-1;for(let i=0;i<Math.min(10,matrix.length);i++){const s=(matrix[i]||[]).map(norm).join('|');if(s.includes('nome da acao')&&s.includes('data')){hi=i;break;}}if(hi<0)return[];const headers=(matrix[hi]||[]).map(headerKey);const out=[];for(let r=hi+1;r<matrix.length;r++){const row=matrix[r]||[];const vals={};headers.forEach((h,i)=>{if(h)vals[h]=clean(row[i]);});const equipamento=clean(row[0]);const nome=vals.nome||clean(row[1]);if(!nome||(!equipamento&&!vals.data))continue;const dt=parseDate(row[headers.indexOf('data')] ?? vals.data,name);const {month,year}=monthInfo(name);const mk=dt?`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`:(month&&year?`${year}-${String(month).padStart(2,'0')}`:'');const sourceKey=`sheet:${name}:${r+1}`;out.push({base44_id:sourceKey,source_key:sourceKey,source_sheet:name,source_row:r+1,source_url:SOURCE_URL,equipamento,museu:museum(equipamento,vals.local),titulo:nome,nome_acao:nome,sinopse:vals.sinopse||'',descricao:vals.sinopse||'',tipo_atividade:vals.tipo_atividade||'',formato:vals.formato||'',data:vals.data||'',data_inicio:dt?dt.toISOString():null,horario:vals.horario||'',publico_alvo:vals.publico_alvo||'',acessibilidade:vals.acessibilidade||'',classificacao_indicativa:vals.classificacao_indicativa||'',vagas:vals.vagas||'',inscricao:vals.inscricao||'',local:vals.local||'',endereco_completo:vals.endereco_completo||'',status:vals.status||'',link_imagens:vals.link_imagens||'',month_key:mk});}return out;}
async function columns(){const r=await pool.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='programacoes'`);return new Map(r.rows.map(x=>[x.column_name,x.data_type]));}
function dbValue(type,v){if(v===undefined)return null;if(type==='json'||type==='jsonb')return JSON.stringify(v);if(type==='integer'||type==='bigint')return v===''?null:Number(v);return v;}
async function save(item,cols){const data=Object.fromEntries(Object.entries(item).filter(([k,v])=>cols.has(k)&&v!==undefined));if(cols.has('updated_at'))data.updated_at=new Date().toISOString();let existing=null;if(cols.has('source_key')){const r=await pool.query(`SELECT id FROM programacoes WHERE source_key=$1 LIMIT 1`,[item.source_key]);existing=r.rows[0];}if(!existing&&cols.has('base44_id')){const r=await pool.query(`SELECT id FROM programacoes WHERE base44_id=$1 LIMIT 1`,[item.base44_id]);existing=r.rows[0];}if(!existing&&cols.has('month_key')&&cols.has('museu')&&(cols.has('titulo')||cols.has('nome_acao'))){const titleCol=cols.has('titulo')?'titulo':'nome_acao';const r=await pool.query(`SELECT id FROM programacoes WHERE month_key=$1 AND museu=$2 AND ${q(titleCol)}=$3 LIMIT 1`,[item.month_key,item.museu,item.titulo]);existing=r.rows[0];}
  const entries=Object.entries(data).filter(([k])=>k!=='id');if(existing){const vals=entries.map(([k,v])=>dbValue(cols.get(k),v));vals.push(existing.id);await pool.query(`UPDATE programacoes SET ${entries.map(([k],i)=>`${q(k)}=$${i+1}`).join(',')} WHERE id=$${vals.length}`,vals);return 'updated';}
  if(cols.has('id')&&!('id' in data)){/* serial/identity id is left to PostgreSQL */}const names=entries.map(([k])=>q(k));const vals=entries.map(([k,v])=>dbValue(cols.get(k),v));await pool.query(`INSERT INTO programacoes (${names.join(',')}) VALUES (${vals.map((_,i)=>`$${i+1}`).join(',')})`,vals);return 'created';}
export async function syncProgramacao(){const started=new Date();try{const response=await fetch(XLSX_URL);if(!response.ok)throw new Error(`download ${response.status}`);const wb=XLSX.read(await response.arrayBuffer(),{type:'array',cellDates:true});const target=wb.SheetNames.filter(n=>/(setembro|outubro|novembro)\s*2026/i.test(norm(n)));let items=[];for(const name of target)items.push(...rowsFromSheet(wb.Sheets[name],name));const cols=await columns();if(!cols.size)throw new Error('tabela programacoes ausente');let created=0,updated=0,failed=0;for(const item of items){try{const s=await save(item,cols);s==='created'?created++:updated++;}catch(e){failed++;console.error('PROGRAMACAO_SYNC_ROW_ERROR',item.source_key,e.message);}}console.log('PROGRAMACAO_SYNC_OK',JSON.stringify({sheets:target,found:items.length,created,updated,failed,started:started.toISOString()}));return{found:items.length,created,updated,failed};}catch(e){console.error('PROGRAMACAO_SYNC_ERROR',e);return{error:e.message};}}
function msUntilSix(){const now=new Date();const target=new Date(now);target.setHours(6,0,0,0);if(target<=now)target.setDate(target.getDate()+1);return target-now;}
function schedule(){setTimeout(async()=>{await syncProgramacao();setInterval(syncProgramacao,24*60*60*1000);},msUntilSix());}
// Sincroniza imediatamente em cada deploy/restart e depois diariamente às 06:00 no fuso configurado do container.
setTimeout(syncProgramacao,4000);
schedule();
