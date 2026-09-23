import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});

const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const date = (value) => /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(String(value || '').slice(0, 10)) ? String(value).slice(0, 10) : '';
const amount = (value) => Number(value || 0);
const urlOf = (row) => [row.nota_fiscal_url, row.nota_fiscal_pdf_url, row.nf_pdf_url, row.arquivo_url].find((value) => /^https?:\/\//i.test(String(value || '')));

async function readInvoiceWithAi(url, filename) {
  const fileResponse = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
  if (!fileResponse.ok) throw new Error(`document_fetch_${fileResponse.status}`);
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename || 'nota-fiscal.pdf');
  const upload = await fetch('https://api.openai.com/v1/files', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  if (!upload.ok) throw new Error(`openai_upload_${upload.status}`);
  const file = await upload.json();
  try {
    const prompt = 'Leia exclusivamente esta nota fiscal em PDF. Não use o nome do arquivo. Retorne somente JSON: {"tipo_documento":"NOTA_FISCAL|OUTRO","nf_numero":"","nf_valor_total":0,"nf_data_emissao":"YYYY-MM-DD","nf_emitente_nome":"","nf_emitente_cpf_cnpj":"","descricao_servico":""}. A data de emissão, fornecedor, número e valor devem vir do documento.';
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_INVOICE_MODEL || 'gpt-4.1-mini', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_file', file_id: file.id }] }], text: { format: { type: 'json_object' } } }),
    });
    if (!response.ok) throw new Error(`openai_response_${response.status}`);
    const envelope = await response.json();
    return JSON.parse(envelope.output_text || '{}');
  } finally {
    await fetch(`https://api.openai.com/v1/files/${file.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }).catch(() => {});
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('openai_not_configured');
  const { rows } = await pool.query(`SELECT * FROM purchase_requests
    WHERE (COALESCE(nota_fiscal_url,'')<>'' OR COALESCE(nf_xml_url,'')<>'')
      AND (NULLIF(nf_numero,'') IS NULL OR NULLIF(nf_emitente_nome,'') IS NULL OR COALESCE(nf_valor_total,0)<=0 OR nf_data_emissao IS NULL)
    ORDER BY updated_at DESC NULLS LAST LIMIT 50`);
  const result = { candidates: rows.length, updated: 0, skipped: 0, errors: [] };
  for (const purchase of rows) {
    try {
      const url = urlOf(purchase);
      if (!url) { result.skipped++; continue; }
      const ai = await readInvoiceWithAi(url, `NF-${purchase.id}.pdf`);
      const valid = ai.tipo_documento === 'NOTA_FISCAL' && text(ai.nf_numero) && text(ai.nf_emitente_nome) && amount(ai.nf_valor_total) > 0 && date(ai.nf_data_emissao);
      const numberConflict = text(purchase.nf_numero) && text(ai.nf_numero) && text(purchase.nf_numero).replace(/^0+/, '') !== text(ai.nf_numero).replace(/^0+/, '');
      const valueConflict = amount(purchase.nf_valor_total) > 0 && Math.abs(amount(purchase.nf_valor_total) - amount(ai.nf_valor_total)) > 0.01;
      if (!valid || numberConflict || valueConflict) { result.skipped++; continue; }
      const raw = purchase.raw_data && typeof purchase.raw_data === 'object' ? purchase.raw_data : {};
      const supplier = text(ai.nf_emitente_nome);
      const description = text(ai.descricao_servico);
      const heading = `NF ${text(ai.nf_numero)} — ${supplier}`;
      const canonicalDescription = description && description.toLocaleUpperCase('pt-BR') !== supplier.toLocaleUpperCase('pt-BR') ? `${heading} — ${description}`.slice(0, 1800) : heading;
      await pool.query(`UPDATE purchase_requests SET
        nf_numero=COALESCE(NULLIF(nf_numero,''),$1),
        nf_emitente_nome=COALESCE(NULLIF(nf_emitente_nome,''),$2),
        nf_emitente_cpf_cnpj=COALESCE(NULLIF(nf_emitente_cpf_cnpj,''),$3),
        nf_valor_total=CASE WHEN COALESCE(nf_valor_total,0)>0 THEN nf_valor_total ELSE $4 END,
        nf_data_emissao=COALESCE(nf_data_emissao,$5::date),
        descricao_item=$6,
        raw_data=COALESCE(raw_data,'{}'::jsonb)||$7::jsonb,
        updated_at=NOW()
        WHERE id=$8`, [text(ai.nf_numero), supplier, text(ai.nf_emitente_cpf_cnpj), amount(ai.nf_valor_total), date(ai.nf_data_emissao), canonicalDescription, JSON.stringify({ ...raw, ...ai, provedor_ia: 'openai_fiscal_reanalysis', analisado_em: new Date().toISOString() }), purchase.id]);
      result.updated++;
    } catch (error) { result.errors.push({ id: purchase.id, error: error.message }); }
  }
  console.log('PURCHASE_FISCAL_REANALYSIS', JSON.stringify(result));
}

main().catch((error) => { console.error('PURCHASE_FISCAL_REANALYSIS_FAILED', error); process.exitCode = 1; }).finally(() => pool.end());
