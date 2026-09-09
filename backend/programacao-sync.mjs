import pg from 'pg';
import * as XLSX from 'xlsx';
import crypto from 'node:crypto';

const { Pool } = pg;
const SHEET_ID = '1I8Tbj5URR7gEX_zZEAFVIkAAfBCs58LC';
const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const clean = v => v instanceof Date && !Number.isNaN(v.getTime())
  ? `${String(v.getDate()).padStart(2,'0')}/${String(v.getMonth()+1).padStart(2,'0')}/${v.getFullYear()}`
  : String(v ?? '').trim();
const q = s => `"${String(s).replaceAll('"','""')}"`;

function monthInfo(name='') {
  const months={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  const n=norm(name);
  let month=null;
  for(const [k,v] of Object.entries(months)) if(n.includes(k)){month=v;break;}
  const ym=n.match(/(20\d{2})/);
  let year=ym?Number(ym[1]):null;
  if(!year){const sm=n.match(/(?:^|\D)(\d{2})(?:\D|$)/); if(sm){year=2000+Number(sm[1]);}}
  return {month,year};
}

function parseDate(v,sheet) {
  if(v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if(typeof v==='number' && v>20000 && v<80000){
    const d=XLSX.SSF.parse_date_code(v);
    if(d?.y&&d?.m&&d?.d)return new Date(d.y,d.m-1,d.d);
  }
  const t=clean(v);
  if(!t) return null;
  const {month,year}=monthInfo(sheet);

  let m=t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if(m){let y=Number(m[3]);if(y<100)y+=2000;return new Date(y,Number(m[2])-1,Number(m[1]));}

  // intervalos como "06/10 à 9/10" ou "06/10 a 09/10"
  m=t.match(/(\d{1,2})[\/.\-](\d{1,2})/);
  if(m) return new Date(year||2026,Number(m[2])-1,Number(m[1]));

  // expressões como "a partir de 13/10"
  m=t.match(/(?:a\s+partir\s+de\s+)?(\d{1,2})[\/.\-](\d{1,2})/i);
  if(m) return new Date(year||2026,Number(m[2])-1,Number(m[1]));

  m=t.match(/^(\d{1,2})$/);
  if(m&&month&&year)return new Date(year,month-1,Number(m[1]));

  return month&&year?new Date(year,month-1,1):null;
}

function museum(equipment,local='') {
  const t=norm(`${equipment} ${local}`);
  if(t.includes('mhab')||t.includes('abilio barreto'))return 'MHAB';
  if(t.includes('mis')||t.includes('imagem e do som')||t.includes('imagem e som'))return 'MIS';
  if(t.includes('mumo')||t.includes('museu da moda'))return 'MUMO';
  return 'Externo';
}

function headerKey(v){
  const h=norm(v);
  if(h.includes('nome da acao')||h.includes('nome da atividade')||h.includes('nome da programacao')||h==='nome')return 'nome';
  if(h.includes('sinopse'))return 'sinopse';
  if(h.includes('tipo de atividade'))return 'tipo_atividade';
  if(h==='formato')return 'formato';
  if(h==='data'||h.includes('data ou periodo')||h.includes('data/periodo')||h==='periodo')return 'data';
  if(h.includes('horario'))return 'horario';
  if(h.includes('publico-alvo')||h.includes('publico alvo'))return 'publico_alvo';
  if(h.includes('acessibilidade'))return 'acessibilidade';
  if(h.includes('classificacao indicativa'))return 'classificacao_indicativa';
  if(h.includes('vagas'))return 'vagas';
  if(h.includes('inscricao')||h.includes('acesso'))return 'inscricao';
  if(h==='local')return 'local';
  if(h.includes('endereco completo'))return 'endereco_completo';
  if(h==='status')return 'status';
  if(h.includes('link de imagens'))return 'link_imagens';
  if(h.includes('minibios'))return 'minibios';
  if(h.includes('material de divulgacao'))return 'material_de_divulgacao';
  if(h.includes('observacoes'))return 'observacoes';
  return h.replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}

function scoreHeaderRow(row){
  const s=(row||[]).map(norm).join('|');
  let score=0;
  for(const k of ['nome da acao','data','sinopse','tipo de atividade','horario','publico-alvo']) if(s.includes(k)) score++;
  return score;
}

function rowsFromSheet(ws,name){
  const matrix=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
  if(matrix.length<4)return[];

  // estrutura real da planilha: linha 2 = Equipamento / Programação; linha 3 = cabeçalhos dos campos
  let hi=-1;
  if(matrix[1] && norm(matrix[1][0])==='equipamento' && norm(matrix[1][1])==='programacao') hi=2;
  if(hi<0){
    let best=-1,bestScore=0;
    for(let i=0;i<Math.min(10,matrix.length);i++){
      const sc=scoreHeaderRow(matrix[i]);
      if(sc>bestScore){bestScore=sc;best=i;}
    }
    if(bestScore>=2) hi=best;
  }
  if(hi<0)return[];

  const headers=(matrix[hi]||[]).map(headerKey);
  const out=[];
  const {month,year}=monthInfo(name);

  for(let r=hi+1;r<matrix.length;r++){
    const row=matrix[r]||[];
    if(!row.some(v=>String(v??'').trim()!==''))continue;

    const vals={};
    headers.forEach((h,i)=>{if(h)vals[h]=clean(row[i]);});
    const equipamento=clean(row[0]);
    const nome=vals.nome||clean(row[1]);
    if(!nome)continue;

    const dataIndex=headers.indexOf('data');
    const rawDate=dataIndex>=0?row[dataIndex]:vals.data;
    const dt=parseDate(rawDate,name);
    const mk=dt
      ? `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`
      : (month&&year?`${year}-${String(month).padStart(2,'0')}`:'');
    const sourceKey=`sheet:${name}:${r+1}`;

    out.push({
      base44_id:sourceKey,
      source_key:sourceKey,
      source_sheet:name,
      source_row:r+1,
      source_url:SOURCE_URL,
      equipamento,
      museu:museum(equipamento,vals.local),
      titulo:nome,
      nome_acao:nome,
      sinopse:vals.sinopse||'',
      descricao:vals.sinopse||'',
      tipo_atividade:vals.tipo_atividade||'',
      formato:vals.formato||'',
      data:vals.data||clean(rawDate)||'',
      data_inicio:dt?dt.toISOString():null,
      horario:vals.horario||'',
      publico_alvo:vals.publico_alvo||'',
      acessibilidade:vals.acessibilidade||'',
      classificacao_indicativa:vals.classificacao_indicativa||'',
      vagas:vals.vagas||'',
      inscricao:vals.inscricao||'',
      local:vals.local||'',
      endereco_completo:vals.endereco_completo||'',
      status:vals.status||'',
      link_imagens:vals.link_imagens||'',
      minibios:vals.minibios||'',
      material_de_divulgacao:vals.material_de_divulgacao||'',
      observacoes:vals.observacoes||'',
      month_key:mk,
    });
  }
  return out;
}

async function columns(){
  const r=await pool.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='programacoes'`);
  return new Map(r.rows.map(x=>[x.column_name,x.data_type]));
}

async function ensureProgramacaoSchema(){
  await pool.query(`CREATE TABLE IF NOT EXISTS programacoes (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const definitions={
    base44_id:'TEXT',source_key:'TEXT',source_sheet:'TEXT',source_row:'INTEGER',source_url:'TEXT',
    equipamento:'TEXT',museu:'TEXT',titulo:'TEXT',nome_acao:'TEXT',sinopse:'TEXT',descricao:'TEXT',
    tipo_atividade:'TEXT',formato:'TEXT',data:'TEXT',data_inicio:'TIMESTAMPTZ',horario:'TEXT',
    publico_alvo:'TEXT',acessibilidade:'TEXT',classificacao_indicativa:'TEXT',vagas:'TEXT',
    inscricao:'TEXT',local:'TEXT',endereco_completo:'TEXT',status:'TEXT',link_imagens:'TEXT',
    minibios:'TEXT',material_de_divulgacao:'TEXT',observacoes:'TEXT',month_key:'TEXT',
    source_active:'BOOLEAN',source_hash:'TEXT'
  };
  for(const [name,type] of Object.entries(definitions)){
    await pool.query(`ALTER TABLE programacoes ADD COLUMN IF NOT EXISTS ${q(name)} ${type}`);
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_programacoes_source_key ON programacoes(source_key)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_programacoes_month_key ON programacoes(month_key)`);
}

async function ensureMirrorSchema(){
  await pool.query(`CREATE TABLE IF NOT EXISTS programacao_planilha_espelho (
    source_key TEXT PRIMARY KEY,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    month_key TEXT,
    museu TEXT,
    titulo TEXT,
    data_inicio TIMESTAMPTZ,
    source_hash TEXT NOT NULL,
    payload JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_programacao_espelho_month_active ON programacao_planilha_espelho(month_key,active)`);
}
function dbValue(type,v){
  if(v===undefined)return null;
  if(type==='json'||type==='jsonb')return JSON.stringify(v);
  if(type==='integer'||type==='bigint'){
    const n=Number(v);
    return v===''||!Number.isFinite(n)?null:n;
  }
  return v;
}
function stableLocalId(sourceKey){
  const hex=crypto.createHash('sha256').update(String(sourceKey)).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
function sourceHash(item){
  return crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex');
}
async function enrichMissingFieldsWithAI(items){
  const apiKey=String(process.env.OPENAI_API_KEY||'').trim();
  const pending=items.filter(item=>!item.tipo_atividade||!item.publico_alvo||item.museu==='Externo');
  if(!apiKey||!pending.length)return items;
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),60000);
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:process.env.OPENAI_PROGRAMACAO_MODEL||'gpt-4.1-mini',
        input:[
          {role:'system',content:[{type:'input_text',text:'Você faz curadoria da programação do Museus Centro. Responda somente JSON válido, sem markdown. Não invente datas, nomes ou locais. Preserve evidências da planilha.'}]},
          {role:'user',content:[{type:'input_text',text:JSON.stringify({tarefa:'Complete somente campos ausentes. museu deve ser MHAB, MIS, MUMO ou Externo. Retorne um array de objetos com source_key, museu, tipo_atividade e publico_alvo.',registros:pending.map(({source_key,equipamento,titulo,sinopse,local,museu,tipo_atividade,publico_alvo})=>({source_key,equipamento,titulo,sinopse,local,museu,tipo_atividade,publico_alvo}))})}]}
        ]
      })
    });
    clearTimeout(timer);
    if(!response.ok)throw new Error(`OpenAI ${response.status}`);
    const body=await response.json();
    const text=body.output?.flatMap(item=>item.content||[]).find(content=>content.type==='output_text')?.text||'';
    const suggestions=JSON.parse(text);
    const byKey=new Map((Array.isArray(suggestions)?suggestions:[]).map(value=>[value.source_key,value]));
    for(const item of items){
      const suggestion=byKey.get(item.source_key);
      if(!suggestion)continue;
      if(item.museu==='Externo'&&['MHAB','MIS','MUMO','Externo'].includes(suggestion.museu))item.museu=suggestion.museu;
      if(!item.tipo_atividade)item.tipo_atividade=clean(suggestion.tipo_atividade);
      if(!item.publico_alvo)item.publico_alvo=clean(suggestion.publico_alvo);
    }
    console.log('PROGRAMACAO_AI_OK',JSON.stringify({analyzed:pending.length}));
  }catch(error){
    console.error('PROGRAMACAO_AI_SKIPPED',error.message);
  }
  return items;
}
async function saveMirror(item){
  const hash=sourceHash(item);
  await pool.query(`INSERT INTO programacao_planilha_espelho
    (source_key,source_sheet,source_row,month_key,museu,titulo,data_inicio,source_hash,payload,active,synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,TRUE,NOW())
    ON CONFLICT (source_key) DO UPDATE SET
      source_sheet=EXCLUDED.source_sheet,source_row=EXCLUDED.source_row,month_key=EXCLUDED.month_key,
      museu=EXCLUDED.museu,titulo=EXCLUDED.titulo,data_inicio=EXCLUDED.data_inicio,
      source_hash=EXCLUDED.source_hash,payload=EXCLUDED.payload,active=TRUE,synced_at=NOW()`,
    [item.source_key,item.source_sheet,item.source_row,item.month_key,item.museu,item.titulo,item.data_inicio,hash,JSON.stringify(item)]);
  return hash;
}
async function save(item,cols){
  item.source_active=true;
  item.source_hash=sourceHash(item);
  const data=Object.fromEntries(Object.entries(item).filter(([k,v])=>cols.has(k)&&v!==undefined));
  if(cols.has('updated_at'))data.updated_at=new Date().toISOString();
  let existing=null;
  if(cols.has('source_key')){
    const r=await pool.query(`SELECT id FROM programacoes WHERE source_key=$1 LIMIT 1`,[item.source_key]);
    existing=r.rows[0];
  }
  if(!existing&&cols.has('base44_id')){
    const r=await pool.query(`SELECT id FROM programacoes WHERE base44_id=$1 LIMIT 1`,[item.base44_id]);
    existing=r.rows[0];
  }
  if(!existing&&cols.has('month_key')&&cols.has('museu')&&(cols.has('titulo')||cols.has('nome_acao'))){
    const titleCol=cols.has('titulo')?'titulo':'nome_acao';
    const r=await pool.query(`SELECT id FROM programacoes WHERE month_key=$1 AND museu=$2 AND ${q(titleCol)}=$3 LIMIT 1`,[item.month_key,item.museu,item.titulo]);
    existing=r.rows[0];
  }

  if(existing){
    const entries=Object.entries(data).filter(([k])=>k!=='id');
    const vals=entries.map(([k,v])=>dbValue(cols.get(k),(k==='data'&&/date|timestamp/.test(cols.get(k)))?item.data_inicio:v));
    vals.push(existing.id);
    await pool.query(`UPDATE programacoes SET ${entries.map(([k],i)=>`${q(k)}=$${i+1}`).join(',')} WHERE id=$${vals.length}`,vals);
    return 'updated';
  }

  if(cols.has('id'))data.id=stableLocalId(item.source_key);
  const entries=Object.entries(data);
  const names=entries.map(([k])=>q(k));
  const vals=entries.map(([k,v])=>dbValue(cols.get(k),(k==='data'&&/date|timestamp/.test(cols.get(k)))?item.data_inicio:v));
  await pool.query(`INSERT INTO programacoes (${names.join(',')}) VALUES (${vals.map((_,i)=>`$${i+1}`).join(',')})`,vals);
  return 'created';
}

export async function syncProgramacao(){
  const started=new Date();
  try{
    const response=await fetch(XLSX_URL);
    if(!response.ok)throw new Error(`download ${response.status}`);
    const wb=XLSX.read(await response.arrayBuffer(),{type:'array',cellDates:true});
    const target=wb.SheetNames.filter(n=>/(setembro|outubro|novembro)\s*2026/i.test(norm(n)));
    let items=[];
    for(const name of target)items.push(...rowsFromSheet(wb.Sheets[name],name));
    items=await enrichMissingFieldsWithAI(items);

    await ensureProgramacaoSchema();
    await ensureMirrorSchema();
    const cols=await columns();
    if(!cols.size)throw new Error('tabela programacoes ausente');

    let created=0,updated=0,failed=0;
    const byMonth={};
    for(const item of items){
      byMonth[item.month_key]=(byMonth[item.month_key]||0)+1;
      try{
        await saveMirror(item);
        const s=await save(item,cols);
        s==='created'?created++:updated++;
      }catch(e){
        failed++;
        console.error('PROGRAMACAO_SYNC_ROW_ERROR',item.source_key,e.message);
      }
    }
    const sourceKeys=items.map(item=>item.source_key);
    if(sourceKeys.length){
      await pool.query(`UPDATE programacao_planilha_espelho SET active=FALSE,synced_at=NOW()
        WHERE source_sheet=ANY($1::text[]) AND NOT (source_key=ANY($2::text[]))`,[target,sourceKeys]);
      if(cols.has('source_active')){
        await pool.query(`UPDATE programacoes SET source_active=FALSE,updated_at=NOW()
          WHERE source_sheet=ANY($1::text[]) AND NOT (source_key=ANY($2::text[]))`,[target,sourceKeys]);
      }
    }
    const persistedResult=await pool.query(`SELECT month_key,COUNT(*)::int AS total FROM programacoes WHERE month_key=ANY($1::text[]) GROUP BY month_key ORDER BY month_key`,[Object.keys(byMonth)]);
    const persisted=Object.fromEntries(persistedResult.rows.map(row=>[row.month_key,row.total]));
    console.log('PROGRAMACAO_SYNC_OK',JSON.stringify({sheets:target,found:items.length,byMonth,persisted,created,updated,failed,started:started.toISOString()}));
    return{found:items.length,byMonth,persisted,created,updated,failed};
  }catch(e){
    console.error('PROGRAMACAO_SYNC_ERROR',e);
    return{error:e.message};
  }
}

function msUntilSixBrasilia(){
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(now);
  const get=t=>Number(parts.find(p=>p.type===t)?.value||0);
  const y=get('year'),m=get('month'),d=get('day'),h=get('hour'),min=get('minute'),sec=get('second');
  const nowLocal=Date.UTC(y,m-1,d,h,min,sec);
  let targetLocal=Date.UTC(y,m-1,d,6,0,0);
  if(targetLocal<=nowLocal)targetLocal+=24*60*60*1000;
  return targetLocal-nowLocal;
}
function schedule(){
  setTimeout(async()=>{
    await syncProgramacao();
    setInterval(syncProgramacao,24*60*60*1000);
  },msUntilSixBrasilia());
}

setTimeout(syncProgramacao,4000);
schedule();
