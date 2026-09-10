BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Canonical metadata used by the migrated frontend. Keep the legacy project_metas
-- table intact; this table is the stable entity backing Meta relations.
CREATE TABLE IF NOT EXISTS metas (
  id TEXT PRIMARY KEY,
  codigo TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem NUMERIC,
  aditivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_activities (
  id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  meta_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meta_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_metas_codigo ON metas(codigo);
CREATE INDEX IF NOT EXISTS idx_meta_activities_meta ON meta_activities(meta_id);
CREATE INDEX IF NOT EXISTS idx_meta_activities_activity ON meta_activities(activity_id);

-- 1. Build canonical metas from the information already present in rubricas.
--    Nothing is deleted and existing ids are preserved.
INSERT INTO metas (id, codigo, titulo, descricao, ativo, ordem)
SELECT
  'meta-' || md5(lower(trim(coalesce(r.meta_titulo, r.meta, '')))),
  NULLIF((regexp_match(upper(coalesce(r.meta, r.meta_titulo, '')), '(META\\s*[0-9]+B?)'))[1], ''),
  trim(coalesce(r.meta_titulo, r.meta)),
  NULL,
  TRUE,
  min(coalesce(r.ordem_exibicao, 0))
FROM rubricas r
WHERE trim(coalesce(r.meta_titulo, r.meta, '')) <> ''
GROUP BY 1,2,3
ON CONFLICT (id) DO UPDATE
SET codigo = COALESCE(EXCLUDED.codigo, metas.codigo),
    titulo = CASE WHEN metas.titulo = '' THEN EXCLUDED.titulo ELSE metas.titulo END,
    updated_at = NOW();

-- Also preserve project_metas as a source of canonical titles when present.
INSERT INTO metas (id, codigo, titulo, descricao, ativo, ordem)
SELECT
  'project-meta-' || pm.id::text,
  NULL,
  pm.nome,
  pm.descricao,
  COALESCE(pm.ativo, TRUE),
  pm.ordem
FROM project_metas pm
WHERE trim(coalesce(pm.nome, '')) <> ''
ON CONFLICT (id) DO NOTHING;

-- 2. Fill missing Rubrica -> Meta ids without overwriting an existing manual link.
WITH candidates AS (
  SELECT
    r.id AS rubrica_id,
    m.id AS meta_id,
    row_number() OVER (PARTITION BY r.id ORDER BY
      CASE WHEN lower(trim(coalesce(r.meta_titulo,''))) = lower(trim(m.titulo)) THEN 0 ELSE 1 END,
      CASE WHEN m.codigo IS NOT NULL AND upper(trim(coalesce(r.meta,''))) ILIKE '%' || m.codigo || '%' THEN 0 ELSE 1 END,
      m.id
    ) AS rn
  FROM rubricas r
  JOIN metas m ON (
    lower(trim(coalesce(r.meta_titulo,''))) = lower(trim(m.titulo))
    OR (m.codigo IS NOT NULL AND upper(trim(coalesce(r.meta,''))) ILIKE '%' || m.codigo || '%')
  )
  WHERE trim(coalesce(r.meta_titulo, r.meta, '')) <> ''
)
UPDATE rubricas r
SET meta_manual_ids = jsonb_build_array(c.meta_id),
    updated_at = NOW()
FROM candidates c
WHERE c.rubrica_id = r.id
  AND c.rn = 1
  AND (r.meta_manual_ids IS NULL OR jsonb_array_length(r.meta_manual_ids) = 0);

-- 3. Resolve Activity -> Meta from existing meta_id/meta_codigo and the canonical
--    metadata above. This is deliberately additive.
UPDATE activities a
SET meta_id = m.id,
    updated_at = NOW()
FROM metas m
WHERE (a.meta_id IS NULL OR trim(a.meta_id) = '')
  AND (
    (m.codigo IS NOT NULL AND upper(trim(coalesce(a.meta_codigo,''))) = upper(trim(m.codigo)))
    OR (m.codigo IS NOT NULL AND upper(trim(coalesce(a.meta_codigo,''))) LIKE '%' || upper(trim(m.codigo)) || '%')
  );

-- 4. Rebuild the junction table from resolved activities. No activity is deleted.
INSERT INTO meta_activities (meta_id, activity_id)
SELECT DISTINCT a.meta_id, a.id::text
FROM activities a
WHERE a.meta_id IS NOT NULL AND trim(a.meta_id) <> ''
ON CONFLICT (meta_id, activity_id) DO NOTHING;

-- 5. Make report activity links available for activities that already have a report.
--    The insert is guarded by the actual table shape used by the migrated schema.
DO $$
BEGIN
  IF to_regclass('public.report_activities') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='report_activities' AND column_name='activity_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='report_activities' AND column_name='report_id'
    ) THEN
      INSERT INTO report_activities (activity_id, report_id)
      SELECT a.id::text, a.report_id::text
      FROM activities a
      WHERE a.report_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  NULL;
END $$;

-- 6. Financial consistency indexes. These make dashboard aggregation deterministic
--    and fast without changing monetary values.
CREATE INDEX IF NOT EXISTS idx_rubricas_meta_manual_ids ON rubricas USING GIN (meta_manual_ids);
CREATE INDEX IF NOT EXISTS idx_rubricas_ativo ON rubricas(ativo);
CREATE INDEX IF NOT EXISTS idx_activities_meta_id ON activities(meta_id);
CREATE INDEX IF NOT EXISTS idx_activities_report_id ON activities(report_id);

-- 7. Local fiscal-document relationships. Base44 ids remain historical only.
ALTER TABLE attachments ALTER COLUMN base44_id DROP NOT NULL;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS purchase_request_id text;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS document_intake_id text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS nota_fiscal_url text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS nf_pdf_url text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS nf_xml_url text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS arquivo_url text;

CREATE INDEX IF NOT EXISTS idx_attachments_purchase_request_id ON attachments(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_attachments_document_intake_id ON attachments(document_intake_id);

-- Restore direct links for requests already created from Entrada Única.
WITH fiscal AS (
  SELECT DISTINCT ON (entidade_destino_id)
    entidade_destino_id AS purchase_request_id,
    id::text AS intake_id,
    file_name_original,
    mime_type,
    arquivo_original_url,
    nf_pdf_url,
    nf_xml_url
  FROM document_intakes
  WHERE entidade_destino='PurchaseRequest'
    AND NULLIF(entidade_destino_id,'') IS NOT NULL
  ORDER BY entidade_destino_id, updated_at DESC NULLS LAST, id DESC
)
UPDATE purchase_requests p
SET nota_fiscal_url = COALESCE(NULLIF(p.nota_fiscal_url,''), NULLIF(f.nf_pdf_url,''), NULLIF(f.arquivo_original_url,'')),
    nf_pdf_url = COALESCE(NULLIF(p.nf_pdf_url,''), NULLIF(f.nf_pdf_url,''), CASE WHEN f.mime_type ILIKE '%pdf%' THEN NULLIF(f.arquivo_original_url,'') END),
    nf_xml_url = COALESCE(NULLIF(p.nf_xml_url,''), NULLIF(f.nf_xml_url,'')),
    arquivo_url = COALESCE(NULLIF(p.arquivo_url,''), NULLIF(f.arquivo_original_url,''))
FROM fiscal f
WHERE p.id::text=f.purchase_request_id;

INSERT INTO attachments (
  id, purchase_request_id, document_intake_id, file_name, file_url, file_type,
  description, nf_tipo_documento, nf_nome_original, nf_revisado, created_date
)
SELECT
  gen_random_uuid()::text, di.entidade_destino_id, di.id::text,
  COALESCE(NULLIF(di.file_name_final,''),di.file_name_original), di.arquivo_original_url, di.mime_type,
  'Entrada Única - Nota Fiscal',
  CASE WHEN di.mime_type ILIKE '%xml%' OR di.tipo_detectado ILIKE '%XML%' THEN 'xml_nf' ELSE 'pdf_nf' END,
  di.file_name_original, TRUE, NOW()
FROM document_intakes di
WHERE di.entidade_destino='PurchaseRequest'
  AND NULLIF(di.entidade_destino_id,'') IS NOT NULL
  AND NULLIF(di.arquivo_original_url,'') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM attachments a
    WHERE a.purchase_request_id=di.entidade_destino_id
      AND (a.document_intake_id=di.id::text OR a.file_url=di.arquivo_original_url)
  );

INSERT INTO schema_migrations(version)
VALUES ('004_finalize_relationships')
ON CONFLICT (version) DO NOTHING;

COMMIT;
