import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Vincula lançamentos de débito operacional em MovimentacaoBancaria NÃO
// ainda vinculados a PurchaseRequests PAGO/APROVADO_ADMIN pendentes de comprovante.
// Projetada para execução headless diária pela automação (service role) -
// não inventaria novos PDFs (isso é feito por lerExtratosBancariosDrive).

const SCORE_CORTE_VINCULO = 0.75;
const LOTE_COMPRAS = 80;

function normalize(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," "); }
function num(v){
  if(typeof v==="number")return Number.isFinite(v)?v:0;
  if(v==null||v==="")return 0;
  let t=String(v).trim().replace(/R\$/gi,"").replace(/\s/g,"");
  const neg=t.includes("-")||/\d[\d.,]*D$/i.test(t);
  t=t.replace(/[CD]$/i,"").replace(/[^\d,.-]/g,"");
  if(t.includes(","))t=t.replace(/\./g,"").replace(",",".");
  else if((t.match(/\./g)||[]).length>1)t=t.replace(/\./g,"");
  const x=Number(t.replace(/(?!^)-/g,""));
  return Number.isFinite(x)?(neg?-Math.abs(x):x):0;
}
function errorMessage(e){ return String((e&&e.message)||e||"Erro desconhecido").slice(0,800); }
function tokens(s){ return normalize(s).split(/[\s\-_\.\/()]+/).filter(t=>t.length>2&&!["LTDA","ME","EPP","EIRELI","MEI","DE","DA","DO","DAS","DOS","E","SA","LIMITADA"].includes(t)); }
function levenshtein(a,b){
  if(!a&&!b)return 0; if(!a)return b.length; if(!b)return a.length;
  const m=a.length, n=b.length; const dp=new Array(n+1);
  for(let j=0;j<=n;j++)dp[j]=j;
  for(let i=1;i<=m;i++){ let prev=dp[0]; dp[0]=i; for(let j=1;j<=n;j++){ const tmp=dp[j]; dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=tmp; } }
  return dp[n];
}
function similaridade(a,b){ const la=(a||"").length, lb=(b||"").length; if(!la&&!lb)return 1; return 1-levenshtein(a||"",b||"")/Math.max(la,lb); }
function scoreFornecedor(descricao, purchase){
  const nomeComp=normalize(purchase.fornecedor_nome||purchase.nf_emitente_nome||"");
  if(!nomeComp)return 0;
  const descNorm=normalize(descricao);
  const tF=tokens(nomeComp);
  if(!tF.length)return 0;
  let acertos=0;
  for(const tf of tF){ if(tokens(descricao).some(td=>td===tf||similaridade(td,tf)>0.82))acertos++; }
  const overlap=acertos/tF.length;
  const sim=similaridade(nomeComp,descNorm);
  return Math.max(overlap,sim)>=0.5?Math.max(overlap,sim*0.85):0;
}
function scoreValor(lancamento, purchase){
  const vLanc=Math.abs(num(lancamento&&lancamento.valor));
  if(vLanc<=0)return 0;
  const cand=[purchase.valor_pago,purchase.valor_aprovado_admin,purchase.valor_aprovado,purchase.nf_valor_total,purchase.valor_solicitado].filter(v=>typeof v==="number"&&v>0);
  if(!cand.length)return 0;
  const ref=cand[0];
  const diff=Math.abs(vLanc-ref)/Math.max(ref,1);
  return diff<=0.02?0.55:(diff<=0.05?0.4:(diff<=0.15?0.2:0));
}
function parseDateAny(v){
  if(!v)return null;
  const d=new Date(v); if(!isNaN(d.getTime()))return d;
  const s=String(v).trim();
  const br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(br){ let y=Number(br[3]); if(y<100)y+=2000; return new Date(y,Number(br[2])-1,Number(br[1])); }
  return null;
}
function scoreData(lancamento, purchase){
  const dl=parseDateAny(lancamento&&lancamento.data); if(!dl)return 0;
  for(const c of ["data_pagamento_efetivo","nf_data_emissao","data_pagamento","aprov_admin_data","aprov_coord_data"]){
    if(purchase[c]){ const dp=parseDateAny(purchase[c]); if(dp){ const diff=Math.abs(dl.getTime()-dp.getTime()); const days=diff/86400000; if(days<=3)return 0.35; if(days<=7)return 0.2; if(days<=15)return 0.1; } }
  }
  return 0;
}
function pontuarVinculo(lancamento, purchase){
  const valor=scoreValor(lancamento, purchase);
  const data=scoreData(lancamento, purchase);
  const forn=scoreFornecedor((lancamento&&lancamento.descricao)||"", purchase);
  const score=Math.min(1, valor*0.7+data*0.5+forn*0.4);
  return Math.round(score*100)/100;
}

Deno.serve(async (req)=>{
  const startTime=Date.now();
  try{
    const base44=createClientFromRequest(req);
    const body=await req.json().catch(()=>({}));

    const user=await base44.auth.me().catch(()=>null);
    const isServiceRole=!user;
    if(user&&!["admin","coordenador","coordinator"].includes(normalize(user.role))){
      return Response.json({success:false,error:"Apenas administradores ou coordenadores podem executar esta rotina."},{status:403});
    }

    // 1. Carrega MovimentacaoBancaria recentes (top 100) e extrai lançamentos
    //    de débito operacional ainda sem vínculo.
    const movs=await base44.asServiceRole.entities.MovimentacaoBancaria.list("-processado_em", 100);

    // Pré-filtro: só processa movimentações dos últimos 60 dias
    const cutoff=Date.now()-60*86400000;
    const cand=movs.filter(m=>{
      if(!m.lancamentos||!Array.isArray(m.lancamentos))return false;
      const procTs=m.processado_em?new Date(m.processado_em).getTime():0;
      if(m.processado_em&&procTs<cutoff)return false;
      return m.lancamentos.some(l=>l&&l.tipo==="debito"&&l.categoria==="debito_operacional"&&num(l.valor)>0&&!l.compra_vinculada_id);
    });

    // 2. Lista PurchaseRequests PAGO/APROVADO_ADMIN sem comprovante
    const pagos=await base44.asServiceRole.entities.PurchaseRequest.list("-updated_date", LOTE_COMPRAS*4);
    const alvos=(pagos||[]).filter(p=>
      (p.status==="PAGO"||p.status==="APROVADO_ADMIN")&&
      (!p.comprovante_url||String(p.comprovante_url).trim()==="")&&
      (!p.comprovante_pagamento_url||String(p.comprovante_pagamento_url).trim()==="")
    ).slice(0, LOTE_COMPRAS);

    const vinculados=[];
    const alvosJaVinculado=new Set();
    let movsAtualizadas=0;

    for(const mov of cand){
      const movUrl=mov.drive_file_url||"";
      let modified=false;
      const novosLancamentos=await Promise.all(mov.lancamentos.map(async (l, i)=>{
        if(!l||l.tipo!=="debito"||l.categoria!=="debito_operacional"||num(l.valor)<=0||l.compra_vinculada_id)return l;
        let melhor=null;
        for(const p of alvos){
          if(alvosJaVinculado.has(p.id))continue;
          const score=pontuarVinculo(l, p);
          if(!melhor||score>melhor.score){ melhor={purchase:p, score}; }
        }
        if(!melhor||melhor.score<SCORE_CORTE_VINCULO)return l;
        const p=melhor.purchase;
        const comprovanteUrl=movUrl||`https://drive.google.com/file/d/${mov.drive_file_id}/view`;
        const driveBackupFiles=Array.isArray(p.drive_backup_files)?[...p.drive_backup_files]:[];
        if(!driveBackupFiles.some(e=>e.tipo==="comprovante_extrato"&&e.movimentacao_id===mov.id)){
          driveBackupFiles.push({
            name:`Extrato: ${mov.drive_file_name||""}`,
            fileId:mov.drive_file_id, url:comprovanteUrl,
            tipo:"comprovante_extrato", origem:"vinculo-diario-auto",
            movimentacao_id:mov.id, lancamento_idx:i,
            lancamento_data:l.data, lancamento_descricao:l.descricao,
            lancamento_valor:l.valor, score:melhor.score,
            mes:mov.mes, ano:mov.ano
          });
        }
        await base44.asServiceRole.entities.PurchaseRequest.update(p.id, {
          comprovante_url:comprovanteUrl, comprovante_pagamento_url:comprovanteUrl,
          drive_backup_files:driveBackupFiles, drive_backup_status:"concluido",
          confianca_vinculo_pagamento:Math.round(melhor.score*100)/100,
          vinculo_automatico_ia:true
        });
        alvosJaVinculado.add(p.id);
        vinculados.push({
          purchase_id:p.id, fornecedor:p.fornecedor_nome,
          valor:Math.abs(num(l.valor)), data:l.data, descricao:l.descricao,
          movimentacao_id:mov.id, score:melhor.score
        });
        modified=true;
        return {...l, compra_vinculada_id:p.id, compra_vinculada_score:Math.round(melhor.score*100)/100};
      }));
      if(modified){
        await base44.asServiceRole.entities.MovimentacaoBancaria.update(mov.id, {lancamentos:novosLancamentos});
        movsAtualizadas++;
      }
    }

    const execution_ms=Date.now()-startTime;
    try{
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type:"auditoria_entrada_unica",
        entity_type:"MovimentacaoBancaria+PurchaseRequest",
        status:"success",
        total_files:cand.length,
        files_copied:vinculados.length,
        execution_time_ms:execution_ms,
        triggered_by:isServiceRole?"scheduled":"manual",
        details:JSON.stringify({vinculo:{movimentacoes_avaliadas:cand.length, movs_atualizadas:movsAtualizadas, alvos:alvos.length, vinculados:vinculados.length, restantes:alvos.length-vinculados.length}})
      });
    }catch(_){}

    return Response.json({
      success:true,
      resumo:{
        movimentacoes_avaliadas:cand.length,
        movs_atualizadas:movsAtualizadas,
        alvos:alvos.length,
        vinculados:vinculados.length,
        pendentes_sem_match:alvos.length-vinculados.length,
        execution_ms
      },
      vinculados
    });
  }catch(e){ return Response.json({success:false, error:errorMessage(e)},{status:500}); }
});