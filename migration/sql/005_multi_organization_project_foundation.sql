BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  document TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  contract_number TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_memberships (
  id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  project_id TEXT NOT NULL REFERENCES projects(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PROFESSIONAL',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_drive_roots (
  id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  project_id TEXT NOT NULL REFERENCES projects(id),
  root_folder_id TEXT,
  reports_folder_id TEXT,
  evidence_folder_id TEXT,
  purchases_folder_id TEXT,
  contracts_folder_id TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id)
);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reports','activities','report_activities','report_photos','attachments',
    'purchase_requests','purchase_documents','rubricas','lancamentos_rubrica',
    'project_metas','metas','meta_activities','document_intakes','notifications'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS organization_id TEXT', table_name);
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS project_id TEXT', table_name);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (organization_id, project_id)', 'idx_' || table_name || '_tenant_scope', table_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO organizations (id, name, legal_name, status)
VALUES ('org-viaduto-das-artes', 'Viaduto das Artes', 'Viaduto das Artes', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, organization_id, name, description, status)
VALUES (
  'project-museus-centro',
  'org-viaduto-das-artes',
  'Museus Centro',
  'Projeto legado migrado para o modelo multi-organização.',
  'ACTIVE'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_memberships (organization_id, user_id, role)
SELECT
  'org-viaduto-das-artes',
  u.id::text,
  CASE
    WHEN upper(COALESCE(u.role, '')) IN ('ADMIN', 'COORDENADOR')
      OR upper(COALESCE(u.base_role, '')) IN ('ADMIN', 'COORDENADOR')
    THEN 'ORG_ADMIN'
    ELSE 'MEMBER'
  END
FROM users u
WHERE COALESCE(u.acesso_liberado, TRUE) IS TRUE
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = EXCLUDED.role, updated_at = NOW();

INSERT INTO project_memberships (project_id, user_id, role)
SELECT
  'project-museus-centro',
  u.id::text,
  CASE
    WHEN upper(COALESCE(u.role, '')) = 'ADMIN'
      OR upper(COALESCE(u.base_role, '')) = 'ADMIN'
      THEN 'PROJECT_ADMIN'
    WHEN upper(COALESCE(u.role, '')) = 'COORDENADOR'
      OR upper(COALESCE(u.base_role, '')) = 'COORDENADOR'
      THEN 'COORDINATOR'
    WHEN upper(COALESCE(u.role, '')) = 'OBSERVADOR'
      THEN 'OBSERVER'
    ELSE 'PROFESSIONAL'
  END
FROM users u
WHERE COALESCE(u.acesso_liberado, TRUE) IS TRUE
ON CONFLICT (project_id, user_id) DO UPDATE
SET role = EXCLUDED.role, updated_at = NOW();

UPDATE reports
SET organization_id = 'org-viaduto-das-artes',
    project_id = 'project-museus-centro'
WHERE organization_id IS NULL OR project_id IS NULL;

UPDATE activities
SET organization_id = 'org-viaduto-das-artes',
    project_id = 'project-museus-centro'
WHERE organization_id IS NULL OR project_id IS NULL;

UPDATE project_metas
SET organization_id = 'org-viaduto-das-artes',
    project_id = 'project-museus-centro'
WHERE organization_id IS NULL OR project_id IS NULL;

UPDATE rubricas
SET organization_id = 'org-viaduto-das-artes',
    project_id = 'project-museus-centro'
WHERE organization_id IS NULL OR project_id IS NULL;

UPDATE purchase_requests
SET organization_id = 'org-viaduto-das-artes',
    project_id = 'project-museus-centro'
WHERE organization_id IS NULL OR project_id IS NULL;

UPDATE attachments
SET organization_id = 'org-viaduto-das-artes',
    project_id = 'project-museus-centro'
WHERE organization_id IS NULL OR project_id IS NULL;

INSERT INTO project_drive_roots (project_id, root_folder_id)
VALUES ('project-museus-centro', NULL)
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO schema_migrations(version)
VALUES ('005_multi_organization_project_foundation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
