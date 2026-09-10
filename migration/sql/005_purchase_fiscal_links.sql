BEGIN;

ALTER TABLE attachments ALTER COLUMN base44_id DROP NOT NULL;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS purchase_request_id text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS document_intake_id text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS nota_fiscal_url text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS nf_pdf_url text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS nf_xml_url text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS arquivo_url text;

CREATE INDEX IF NOT EXISTS idx_attachments_purchase_request_id ON attachments(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_attachments_document_intake_id ON attachments(document_intake_id);

WITH fiscal AS (
  SELECT DISTINCT ON (entidade_destino_id)
    entidade_destino_id AS purchase_request_id, arquivo_original_url, nf_pdf_url, nf_xml_url, mime_type
  FROM document_intakes
  WHERE entidade_destino='PurchaseRequest' AND NULLIF(entidade_destino_id,'') IS NOT NULL
  ORDER BY entidade_destino_id, updated_at DESC NULLS LAST, id DESC
)
UPDATE purchase_requests p
SET nota_fiscal_url=COALESCE(NULLIF(p.nota_fiscal_url,''),NULLIF(f.nf_pdf_url,''),NULLIF(f.arquivo_original_url,'')),
    nf_pdf_url=COALESCE(NULLIF(p.nf_pdf_url,''),NULLIF(f.nf_pdf_url,''),CASE WHEN f.mime_type ILIKE '%pdf%' THEN NULLIF(f.arquivo_original_url,'') END),
    nf_xml_url=COALESCE(NULLIF(p.nf_xml_url,''),NULLIF(f.nf_xml_url,'')),
    arquivo_url=COALESCE(NULLIF(p.arquivo_url,''),NULLIF(f.arquivo_original_url,''))
FROM fiscal f WHERE p.id::text=f.purchase_request_id;

INSERT INTO attachments (id,purchase_request_id,document_intake_id,file_name,file_url,file_type,description,nf_tipo_documento,nf_nome_original,nf_revisado,created_date)
SELECT gen_random_uuid()::text,di.entidade_destino_id,di.id::text,
       COALESCE(NULLIF(di.file_name_final,''),di.file_name_original),di.arquivo_original_url,di.mime_type,
       'Entrada Única - Nota Fiscal',
       CASE WHEN di.mime_type ILIKE '%xml%' OR di.tipo_detectado ILIKE '%XML%' THEN 'xml_nf' ELSE 'pdf_nf' END,
       di.file_name_original,TRUE,NOW()
FROM document_intakes di
WHERE di.entidade_destino='PurchaseRequest'
  AND NULLIF(di.entidade_destino_id,'') IS NOT NULL
  AND NULLIF(di.arquivo_original_url,'') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.purchase_request_id=di.entidade_destino_id AND (a.document_intake_id=di.id::text OR a.file_url=di.arquivo_original_url));

COMMIT;
