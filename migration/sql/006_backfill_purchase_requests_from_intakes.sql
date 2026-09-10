-- Preenche solicitações antigas criadas pela Entrada Única.
-- Idempotente: nunca substitui um valor já informado na solicitação.
WITH linked AS (
  SELECT DISTINCT ON (p.id)
    p.id AS purchase_id,
    d.*
  FROM purchase_requests p
  JOIN document_intakes d ON p.id::text = COALESCE(
    NULLIF(d.entidade_destino_id::text, ''),
    NULLIF(d.resultado_ia->>'purchase_request_id', '')
  )
  WHERE COALESCE(d.status_registro, '') <> 'DELETADO'
  ORDER BY p.id, d.updated_at DESC NULLS LAST, d.id DESC
)
UPDATE purchase_requests p
SET
  meta_id = COALESCE(NULLIF(p.meta_id::text, ''), NULLIF(l.resultado_ia->>'meta_id', ''), NULLIF(l.resultado_ia->>'meta_sugerida', '')),
  rubrica_id = COALESCE(NULLIF(p.rubrica_id::text, ''), NULLIF(l.rubrica_id_sugerida::text, ''), NULLIF(l.resultado_ia->>'rubrica_id', '')),
  budgetline_id = COALESCE(NULLIF(p.budgetline_id::text, ''), NULLIF(p.rubrica_id::text, ''), NULLIF(l.rubrica_id_sugerida::text, ''), NULLIF(l.resultado_ia->>'rubrica_id', '')),
  centro_custo = COALESCE(NULLIF(p.centro_custo, ''), NULLIF(l.centro_custo, ''), NULLIF(l.resultado_ia->>'centro_custo_sugerido', ''), NULLIF(l.resultado_ia->>'centro_custo', '')),
  competencia_mes = COALESCE(NULLIF(p.competencia_mes, ''), NULLIF(l.resultado_ia->>'competencia', ''), NULLIF(l.resultado_ia->>'competencia_sugerida', '')),
  descricao_item = COALESCE(NULLIF(p.descricao_item, ''), NULLIF(l.resultado_ia->>'descricao_servico', ''), NULLIF(l.file_name_final, ''), NULLIF(l.file_name_original, '')),
  fornecedor_nome = COALESCE(NULLIF(p.fornecedor_nome, ''), NULLIF(l.resultado_ia->>'nf_emitente_nome', ''), NULLIF(l.resultado_ia->>'fornecedor_nome', '')),
  valor_solicitado = CASE WHEN COALESCE(p.valor_solicitado, 0) = 0 THEN NULLIF(l.resultado_ia->>'nf_valor_total', '')::numeric ELSE p.valor_solicitado END,
  valor_total = CASE WHEN COALESCE(p.valor_total, 0) = 0 THEN NULLIF(l.resultado_ia->>'nf_valor_total', '')::numeric ELSE p.valor_total END,
  nf_numero = COALESCE(NULLIF(p.nf_numero, ''), NULLIF(l.resultado_ia->>'nf_numero', '')),
  nf_emitente_nome = COALESCE(NULLIF(p.nf_emitente_nome, ''), NULLIF(l.resultado_ia->>'nf_emitente_nome', '')),
  nf_emitente_cpf_cnpj = COALESCE(NULLIF(p.nf_emitente_cpf_cnpj, ''), NULLIF(l.resultado_ia->>'nf_emitente_cpf_cnpj', '')),
  nf_valor_total = CASE WHEN COALESCE(p.nf_valor_total, 0) = 0 THEN NULLIF(l.resultado_ia->>'nf_valor_total', '')::numeric ELSE p.nf_valor_total END,
  nf_data_emissao = COALESCE(p.nf_data_emissao, NULLIF(l.resultado_ia->>'nf_data_emissao', '')::date),
  nota_fiscal_url = COALESCE(NULLIF(p.nota_fiscal_url, ''), NULLIF(l.arquivo_original_url, '')),
  nf_pdf_url = COALESCE(NULLIF(p.nf_pdf_url, ''), NULLIF(l.arquivo_original_url, '')),
  nf_xml_url = COALESCE(NULLIF(p.nf_xml_url, ''), NULLIF(l.nf_xml_url, ''), NULLIF(l.resultado_ia->>'nf_xml_url', '')),
  arquivo_url = COALESCE(NULLIF(p.arquivo_url, ''), NULLIF(l.arquivo_original_url, '')),
  updated_at = NOW(),
  updated_date = NOW()
FROM linked l
WHERE p.id = l.purchase_id;

-- Complementa campos fiscais quando o Attachment possui leitura mais completa.
WITH fiscal_attachment AS (
  SELECT DISTINCT ON (purchase_request_id)
    purchase_request_id, nf_emitente_cpf_cnpj, nf_numero, nf_data_emissao, nf_valor_total
  FROM attachments
  WHERE purchase_request_id IS NOT NULL
  ORDER BY purchase_request_id, updated_date DESC NULLS LAST, id DESC
)
UPDATE purchase_requests p
SET
  nf_emitente_cpf_cnpj = COALESCE(NULLIF(p.nf_emitente_cpf_cnpj, ''), NULLIF(a.nf_emitente_cpf_cnpj, '')),
  nf_numero = COALESCE(NULLIF(p.nf_numero, ''), NULLIF(a.nf_numero, '')),
  nf_data_emissao = COALESCE(p.nf_data_emissao, NULLIF(a.nf_data_emissao::text, '')::timestamp),
  nf_valor_total = CASE WHEN COALESCE(p.nf_valor_total, 0) = 0 THEN a.nf_valor_total ELSE p.nf_valor_total END,
  updated_at = NOW(), updated_date = NOW()
FROM fiscal_attachment a
WHERE p.id::text = a.purchase_request_id::text;

-- Vínculos confirmados pela rubrica/formulário dos dois registros históricos.
UPDATE purchase_requests SET meta_id='6a32aead6201158ef021b368', updated_at=NOW(), updated_date=NOW()
WHERE id='2f759a97-3a6d-4163-bb9e-6c5b8c56f670' AND COALESCE(meta_id::text, '')='';
UPDATE purchase_requests SET meta_id='6a32aead6201158ef021b370', updated_at=NOW(), updated_date=NOW()
WHERE id='69844398-dac2-4840-9bbe-75e1cff7aa3b' AND COALESCE(meta_id::text, '')='';
