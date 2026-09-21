import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const APPLY = String(process.env.RECONCILE_APPLY || '') === '1';
const USE_AI = String(process.env.RECONCILE_USE_AI || '1') !== '0';
// Keep this deliberately small. It protects the paid OCR API while avoiding
// a multi-hour serial queue when a historic month has incomplete PDFs.
const AI_CONCURRENCY = Math.max(1, Math.min(2, Number(process.env.RECONCILE_AI_CONCURRENCY || 2)));
const MONTHS = new Set(String(process.env.RECONCILE_MONTHS || '')
  .split(',').map(value => value.trim()).filter(Boolean));
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
const pool = new Pool(process.env.DATABASE_URL ? { connectionString:process.env.DATABASE_URL } : {
  host:process.env.DB_HOST || 'db', port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || 'appgestor', user:process.env.POSTGRES_USER || 'appgestor',
  password:process.env.POSTGRES_PASSWORD || ''
});

const digits = value => String(value || '').replace(/\D/g, '');
const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
const canonicalNumber = value => String(value || '').replace(/^0+/, '').trim();
const canonicalDate = value => String(value || '').slice(0, 10);
const monthOf = value => {
  const date = canonicalDate(value);
  return /^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(date) ? `${date.slice(5,7)}-${date.slice(0,4)}` : '';
};
const fiscalKey = data => {
  const taxId = digits(data.nf_emitente_cpf_cnpj || data.cnpj || data.cpf);
  const number = canonicalNumber(data.nf_numero || data.numero);
  const value = Number(data.nf_valor_total ?? data.valor ?? 0);
  const date = canonicalDate(data.nf_data_emissao || data.data);
  if (!taxId || !number || !Number.isFinite(value) || value <= 0 || !/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)) return null;
  return `${taxId}|${number}|${value.toFixed(2)}|${date}`;
};
const inScope = data => !MONTHS.size || MONTHS.has(monthOf(data.nf_data_emissao || data.data));
const urlFile = value => {
  const match = String(value || '').match(/\/api\/files\/([^/?#]+)/i);
  if (!match) return null;
  const file = path.join(uploadDir, path.basename(decodeURIComponent(match[1])));
  return fs.existsSync(file) ? file : null;
};
const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const pick = (...values) => values.find(present) || '';

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length); let next = 0;
  async function consume() {
    while (next < items.length) {
      const index = next++;
      result[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length:Math.min(limit, items.length) }, consume));
  return result;
}

function canonicalMeta(pdf) {
  const ai = pdf.resultado_ia || {};
  const xml = pdf.xml_resultado_ia || {};
  // XML has priority when it is actually a fiscal XML linked to this PDF.
  // It carries the canonical key without relying on the filename or OCR.
  return {
    nf_numero: pick(xml.nf_numero, xml.numero, ai.nf_numero, ai.numero),
    nf_valor_total: Number(pick(xml.nf_valor_total, xml.valor, ai.nf_valor_total, ai.valor) || 0),
    nf_data_emissao: canonicalDate(pick(xml.nf_data_emissao, xml.data, ai.nf_data_emissao, ai.data)),
    nf_emitente_nome: pick(xml.nf_emitente_nome, xml.fornecedor, ai.nf_emitente_nome, ai.fornecedor),
    nf_emitente_cpf_cnpj: pick(xml.nf_emitente_cpf_cnpj, xml.cnpj, xml.cpf, ai.nf_emitente_cpf_cnpj, ai.cnpj, ai.cpf),
    descricao_servico: pick(ai.descricao_servico, xml.descricao_servico),
    centro_custo: pick(pdf.centro_custo, ai.centro_custo_sugerido, ai.centro_custo),
    rubrica_id: pick(pdf.rubrica_id_sugerida, ai.rubrica_id),
  };
}

async function analyzePdf(pdf) {
  if (!USE_AI || !process.env.OPENAI_API_KEY) return null;
  const filePath = urlFile(pdf.arquivo_original_url);
  if (!filePath) return null;
  const body = fs.readFileSync(filePath);
  if (!body.byteLength) return null;
  const filename = path.basename(filePath);
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append('file', new Blob([body], { type:'application/pdf' }), filename);
  const uploaded = await fetch('https://api.openai.com/v1/files', {
    method:'POST', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` }, body:form,
    signal:AbortSignal.timeout(45000)
  });
  if (!uploaded.ok) throw new Error(`OpenAI upload ${uploaded.status}`);
  const upload = await uploaded.json();
  try {
    const prompt = `Leia somente o conteúdo deste PDF. Classifique-o estritamente como NOTA_FISCAL ou OUTRO. Recibo, comprovante de pagamento, extrato bancário, contrato, orçamento, relatório e imagem são OUTRO. Para NOTA_FISCAL extraia do documento, nunca do nome do arquivo: número da NF, valor total, data de emissão (YYYY-MM-DD), emitente, CNPJ/CPF do emitente e descrição. Retorne somente JSON: {"tipo_documento":"NOTA_FISCAL|OUTRO","nf_numero":"","nf_valor_total":0,"nf_data_emissao":"YYYY-MM-DD","nf_emitente_nome":"","nf_emitente_cpf_cnpj":"","descricao_servico":""}.`;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json' },
      body:JSON.stringify({
        model:process.env.OPENAI_INVOICE_MODEL || 'gpt-4.1-mini',
        input:[{ role:'user',content:[{ type:'input_text',text:prompt },{ type:'input_file',file_id:upload.id }] }],
        text:{ format:{ type:'json_object' } }
      }), signal:AbortSignal.timeout(45000)
    });
    if (!response.ok) throw new Error(`OpenAI response ${response.status}`);
    const payload = await response.json();
    const text = payload.output_text || payload.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '{}';
    return JSON.parse(text);
  } finally {
    await fetch(`https://api.openai.com/v1/files/${upload.id}`, {
      method:'DELETE', headers:{ Authorization:`Bearer ${process.env.OPENAI_API_KEY}` }
    }).catch(() => {});
  }
}

async function ensureColumns() {
  await pool.query(`ALTER TABLE purchase_requests
    ADD COLUMN IF NOT EXISTS incluir_no_somatorio boolean DEFAULT true,
    ADD COLUMN IF NOT EXISTS duplicada_financeira boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS duplicata_de text`);
}

async function updatePurchaseFromFiscal(purchaseId, meta, pdf) {
  const fields = {
    nf_numero: canonicalNumber(meta.nf_numero),
    nf_emitente_nome: cleanText(meta.nf_emitente_nome),
    nf_emitente_cpf_cnpj: digits(meta.nf_emitente_cpf_cnpj),
    nf_valor_total: Number(meta.nf_valor_total),
    nf_data_emissao: canonicalDate(meta.nf_data_emissao),
    fornecedor_nome: cleanText(meta.nf_emitente_nome),
    valor_solicitado: Number(meta.nf_valor_total),
    valor_total: Number(meta.nf_valor_total),
    nota_fiscal_url: pdf.arquivo_original_url || '',
    nf_pdf_url: pdf.arquivo_original_url || '',
    arquivo_url: pdf.arquivo_original_url || '',
    nf_xml_url: pick(pdf.nf_xml_url, pdf.xml_arquivo_original_url),
    updated_at: new Date(), updated_date: new Date(),
  };
  if (meta.descricao_servico) fields.descricao_item = cleanText(meta.descricao_servico);
  if (meta.centro_custo) fields.centro_custo = meta.centro_custo;
  if (meta.rubrica_id) fields.rubrica_id = meta.rubrica_id;
  const entries = Object.entries(fields).filter(([, value]) => present(value) || typeof value === 'number');
  const values = entries.map(([, value]) => value);
  values.push(String(purchaseId));
  await pool.query(`UPDATE purchase_requests SET ${entries.map(([field], index) => `${field}=$${index + 1}`).join(',')} WHERE id=$${values.length}`, values);
}

async function createPurchase(meta, pdf) {
  const id = crypto.randomUUID();
  const now = new Date();
  await pool.query(`INSERT INTO purchase_requests (
    id,base44_id,descricao_item,meta_id,rubrica_id,centro_custo,competencia_mes,
    valor_solicitado,valor_total,fornecedor_nome,status,pago,status_pagamento,
    nf_numero,nf_emitente_nome,nf_emitente_cpf_cnpj,nf_valor_total,nf_data_emissao,
    nota_fiscal_url,nf_pdf_url,nf_xml_url,arquivo_url,incluir_no_somatorio,duplicada_financeira,
    created_by,created_date,updated_date,created_at,updated_at
  ) VALUES (
    $1,$1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),'',
    $6,$6,$7,'SOLICITADO',false,'AGUARDANDO_PAGAMENTO',
    $8,$7,$9,$6,$10::date,
    $11,$11,NULLIF($12,''),$11,true,false,
    'sistema-conciliacao',$13,$13,$13,$13
  )`,[
    id, cleanText(meta.descricao_servico) || `NF ${canonicalNumber(meta.nf_numero)} — ${cleanText(meta.nf_emitente_nome)}`,
    '', meta.rubrica_id || '', meta.centro_custo || '', Number(meta.nf_valor_total), cleanText(meta.nf_emitente_nome),
    canonicalNumber(meta.nf_numero), digits(meta.nf_emitente_cpf_cnpj), canonicalDate(meta.nf_data_emissao),
    pdf.arquivo_original_url || '', pick(pdf.nf_xml_url, pdf.xml_arquivo_original_url), now
  ]);
  return id;
}

function purchaseKey(purchase) {
  return fiscalKey({
    nf_emitente_cpf_cnpj: purchase.nf_emitente_cpf_cnpj,
    nf_numero: purchase.nf_numero,
    nf_valor_total: purchase.nf_valor_total,
    nf_data_emissao: purchase.nf_data_emissao,
  });
}
function purchaseScore(purchase, linkedIds) {
  let score = 0;
  if (linkedIds.has(String(purchase.id))) score += 128;
  if (purchase.nf_pdf_url || purchase.nota_fiscal_url || purchase.arquivo_url) score += 32;
  if (purchase.nf_xml_url) score += 8;
  if (purchase.rubrica_id) score += 4;
  if (purchase.centro_custo) score += 2;
  if (String(purchase.status || '').toUpperCase() === 'PAGO') score += 1;
  return score;
}

async function reconcileDuplicates(linkedIds) {
  const purchases = (await pool.query('SELECT * FROM purchase_requests')).rows;
  const groups = new Map();
  for (const purchase of purchases) {
    const key = purchaseKey(purchase);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(purchase); groups.set(key, list);
  }
  let marked = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a,b) => purchaseScore(b,linkedIds) - purchaseScore(a,linkedIds) || String(a.id).localeCompare(String(b.id)));
    const canonical = list[0];
    const duplicateIds = list.slice(1).map(row => String(row.id));
    if (!duplicateIds.length) continue;
    if (APPLY) await pool.query(`UPDATE purchase_requests
      SET incluir_no_somatorio=false,duplicada_financeira=true,duplicata_de=$1,status='CANCELADO',updated_at=NOW(),updated_date=NOW()
      WHERE id=ANY($2::text[])`, [String(canonical.id), duplicateIds]);
    marked += duplicateIds.length;
  }
  return marked;
}

async function run() {
  await ensureColumns();
  const stats = { invoices:0, ai_read:0, ignored_non_invoice:0, incomplete:0, linked:0, created:0, duplicate_intakes:0, duplicate_purchases:0, errors:0 };
  const rows = (await pool.query(`SELECT p.*,x.resultado_ia AS xml_resultado_ia,x.arquivo_original_url AS xml_arquivo_original_url
    FROM document_intakes p
    LEFT JOIN document_intakes x ON x.id=p.nf_xml_intake_id AND COALESCE(x.status_registro,'')<>'DELETADO'
    WHERE COALESCE(p.status_registro,'')<>'DELETADO' AND p.tipo_detectado='NOTA_FISCAL_PDF'
    ORDER BY p.id`)).rows;
  const inspected = await mapLimit(rows, AI_CONCURRENCY, async (pdf, index) => {
    let meta = canonicalMeta(pdf);
    let ignored = false;
    let aiRead = false;
    let error = null;
    if (!fiscalKey(meta) && USE_AI) {
      try {
        const read = await analyzePdf(pdf);
        if (read?.tipo_documento === 'OUTRO') ignored = true;
        if (read?.tipo_documento === 'NOTA_FISCAL') {
          meta = { ...meta, ...Object.fromEntries(Object.entries(read).filter(([,value]) => present(value) || typeof value === 'number')) };
          aiRead = true;
          if (APPLY) await pool.query(`UPDATE document_intakes SET resultado_ia=COALESCE(resultado_ia,'{}'::jsonb)||$1::jsonb,status_processamento='AGUARDANDO_REVISAO',updated_at=NOW() WHERE id=$2`, [JSON.stringify({ ...read, provedor_ia:'openai_reconciliacao', analisado_em:new Date().toISOString() }),pdf.id]);
        }
      } catch (caught) { error = caught; console.error('INVOICE_RECONCILE_AI_ERROR',pdf.id,caught.message); }
    }
    if ((index + 1) % 5 === 0 || index + 1 === rows.length) console.log('INVOICE_RECONCILE_ANALYSIS_PROGRESS',JSON.stringify({ analyzed:index + 1,total:rows.length }));
    return { pdf,meta,ignored,aiRead,error };
  });
  const canonicalByKey = new Map();
  const ready = [];
  for (const { pdf,meta,ignored,aiRead,error } of inspected) {
    if (ignored) { stats.ignored_non_invoice++; continue; }
    if (aiRead) stats.ai_read++;
    if (error) stats.errors++;
    const key = fiscalKey(meta);
    if (!key || !inScope(meta)) { stats.incomplete++; continue; }
    stats.invoices++;
    const old = canonicalByKey.get(key);
    if (old) {
      const priority = row => (row.entidade_destino_id ? 100 : 0) + (row.nf_xml_intake_id ? 10 : 0) + (row.revisado_pelo_usuario ? 5 : 0) - Number(row.id) / 1e12;
      const keep = priority(pdf) > priority(old.pdf) ? { pdf,meta,key } : old;
      const discard = keep.pdf.id === pdf.id ? old.pdf : pdf;
      canonicalByKey.set(key, keep);
      if (APPLY) await pool.query(`UPDATE document_intakes SET status_registro='DELETADO',status_processamento='DUPLICADO_REMOVIDO',updated_at=NOW() WHERE id=$1`,[discard.id]);
      stats.duplicate_intakes++;
    } else canonicalByKey.set(key,{ pdf,meta,key });
  }
  ready.push(...canonicalByKey.values());
  const linkedIds = new Set();
  for (const item of ready) {
    const { pdf,meta,key } = item;
    let targetId = String(pdf.entidade_destino_id || '').trim();
    try {
      if (targetId) {
        if (APPLY) await updatePurchaseFromFiscal(targetId,meta,pdf);
        linkedIds.add(targetId); stats.linked++; continue;
      }
      const existing = (await pool.query(`SELECT id FROM purchase_requests
        WHERE regexp_replace(COALESCE(nf_emitente_cpf_cnpj,''),'[^0-9]','','g')=$1
          AND ltrim(COALESCE(nf_numero,''),'0')=$2
          AND ROUND(COALESCE(nf_valor_total,0)::numeric,2)=$3
          AND nf_data_emissao=$4::date
        ORDER BY CASE WHEN status='PAGO' THEN 0 ELSE 1 END,created_at NULLS LAST,id LIMIT 1`, [digits(meta.nf_emitente_cpf_cnpj),canonicalNumber(meta.nf_numero),Number(meta.nf_valor_total).toFixed(2),canonicalDate(meta.nf_data_emissao)])).rows[0];
      if (existing) { targetId = String(existing.id); if (APPLY) await updatePurchaseFromFiscal(targetId,meta,pdf); stats.linked++; }
      else { targetId = APPLY ? await createPurchase(meta,pdf) : `would-create:${key}`; stats.created++; }
      if (APPLY) await pool.query(`UPDATE document_intakes SET entidade_destino='PurchaseRequest',entidade_destino_id=$1,status_processamento='ENVIADO_APROVACAO',updated_at=NOW() WHERE id=$2`,[targetId,pdf.id]);
      linkedIds.add(targetId);
    } catch (error) { stats.errors++; console.error('INVOICE_RECONCILE_LINK_ERROR',pdf.id,error.message); }
  }
  stats.duplicate_purchases = await reconcileDuplicates(linkedIds);
  console.log('INVOICE_PURCHASE_RECONCILE_DONE',JSON.stringify({ apply:APPLY,months:[...MONTHS],...stats }));
}

run().catch(error => { console.error('INVOICE_PURCHASE_RECONCILE_FATAL',error); process.exitCode=1; }).finally(() => pool.end());
