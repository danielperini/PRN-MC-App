BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snapshot dos registros anteriores à primeira aplicação. Não altera valores de compras.
CREATE TABLE IF NOT EXISTS backup_007_simposio_rubricas AS
SELECT * FROM rubricas
WHERE grupo = 'Simpósio do Patrimônio Cultural de BH'
   OR (origem_recurso = '5º ADITIVO' AND meta_titulo ILIKE '%Simpósio%');

CREATE TABLE IF NOT EXISTS backup_007_simposio_metas AS
SELECT * FROM project_metas
WHERE nome ILIKE '%Simpósio%';

-- A meta é criada apenas se ainda não existir no banco migrado.
INSERT INTO project_metas (id, nome, descricao, ativo, ordem)
SELECT left(md5('5a-simposio-patrimonio-bh'), 24),
       'Meta 24 - Realizar o 3º Simpósio do Patrimônio Cultural de Belo Horizonte',
       '5º Termo Aditivo. MHAB, mês 28, um dia das 8h30 às 17h. Promover reflexão, formação e intercâmbio sobre preservação do patrimônio cultural material e imaterial. Evidências: programação, lista de presença, fotos/vídeos, comunicação, contratos, notas fiscais e relatório. Orçamento: R$ 15.800,00; não há meta quantitativa exclusiva de público.',
       TRUE, (SELECT COALESCE(MAX(ordem), 23) + 1 FROM project_metas)
WHERE NOT EXISTS (
  SELECT 1 FROM project_metas
  WHERE nome ILIKE '%Simpósio%Patrimônio%' OR nome ILIKE '%Simposio%Patrimonio%'
)
ON CONFLICT (id) DO NOTHING;

-- Preserva IDs e saldos de rubricas existentes; altera só o centro genérico antigo.
UPDATE rubricas
SET centro_custo = 'Terceiro Simpósio do Patrimônio de BH', updated_at = NOW()
WHERE (grupo = 'Simpósio do Patrimônio Cultural de BH'
       OR (origem_recurso = '5º ADITIVO' AND meta_titulo ILIKE '%Simpósio%'))
  AND (centro_custo IS NULL OR centro_custo IN ('', 'Geral', 'Geral/Transversal', 'Simpósio'));

-- Corrige apenas a representação de quantidade da importação anterior, sem mudar o total.
UPDATE rubricas
SET quantidade = 2, periodo_frequencia = 1, updated_at = NOW()
WHERE (grupo = 'Simpósio do Patrimônio Cultural de BH' OR origem_recurso = '5º ADITIVO')
  AND lower(trim(rubrica)) = lower('Apresentações culturais')
  AND quantidade = 1 AND periodo_frequencia = 2 AND valor_rubrica = 6700;

-- Linhas oficiais do 5º aditivo: inserir apenas as ausentes, sem duplicar as já importadas.
INSERT INTO rubricas (
  id, rubrica, nome, grupo, natureza_despesa, codigo, unidade, quantidade, periodo_frequencia,
  valor_unitario, valor_rubrica, valor_total, origem_recurso, centro_custo,
  museu_codigo, meta, meta_titulo, ordem_exibicao, ativo,
  valor_utilizado, saldo, saldo_real, percentual_utilizado, created_at, updated_at
)
SELECT v.id, v.nome, v.nome, 'Simpósio do Patrimônio Cultural de BH', v.natureza, v.codigo, v.unidade,
       v.quantidade, v.periodos, v.valor_unitario, v.total, v.total,
       '5º ADITIVO', 'Terceiro Simpósio do Patrimônio de BH', 'MHAB',
       'META 24',
       'Realizar o 3º Simpósio do Patrimônio Cultural de Belo Horizonte', v.ordem, TRUE,
       0, v.total, v.total, 0, NOW(), NOW()
FROM (VALUES
  ('rubrica-5a-coordenador-simposio', 'Coordenador Geral (Simpósio)', 'Serviço', 1, 1, 3000.00::numeric, 3000.00::numeric, '339039', '42', 2001),
  ('rubrica-5a-producao-simposio', 'Produção', 'Serviço', 1, 1, 2500.00::numeric, 2500.00::numeric, '339039', '42', 2002),
  ('rubrica-5a-apresentacoes-simposio', 'Apresentações culturais', 'Serviço', 2, 1, 3350.00::numeric, 6700.00::numeric, '339039', '22', 2003),
  ('rubrica-5a-monitores-simposio', 'Monitores (Diárias)', 'Serviço', 2, 1, 300.00::numeric, 600.00::numeric, '339039', '42', 2004),
  ('rubrica-5a-material-simposio', 'Material Educativo (kit)', 'Unidade', 80, 1, 37.50::numeric, 3000.00::numeric, '339030', '12', 2005)
) AS v(id, nome, unidade, quantidade, periodos, valor_unitario, total, natureza, codigo, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM rubricas r
  WHERE (r.grupo = 'Simpósio do Patrimônio Cultural de BH'
         OR (r.origem_recurso = '5º ADITIVO' AND r.meta_titulo ILIKE '%Simpósio%'))
    AND lower(trim(r.rubrica)) = lower(v.nome)
)
AND NOT EXISTS (
  -- Se houver importação parcial/legada, não acrescente orçamento sem revisão.
  SELECT 1 FROM rubricas r
  WHERE r.grupo = 'Simpósio do Patrimônio Cultural de BH'
     OR (r.origem_recurso = '5º ADITIVO' AND r.meta_titulo ILIKE '%Simpósio%')
)
ON CONFLICT (id) DO NOTHING;

-- Reuse the same item-conciliation columns displayed by every other rubrica.
UPDATE rubricas r SET
  codigo_item_pbh = CASE WHEN r.natureza_despesa='339030' THEN '3.3.90.30.12'
                         ELSE '3.3.90.39.' || r.codigo END,
  item_pbh = CASE WHEN r.natureza_despesa='339030' THEN '3.3.90.30.12'
                  ELSE '3.3.90.39.' || r.codigo END,
  meta_manual_ids = '["24"]'::jsonb,
  updated_at = NOW()
WHERE r.centro_custo='Terceiro Simpósio do Patrimônio de BH'
  AND (r.codigo_item_pbh IS NULL OR r.item_pbh IS NULL OR r.meta_manual_ids IS NULL);

-- Abort instead of silently recording a partial or duplicate opening budget.
DO $$
DECLARE item_count INTEGER; budget NUMERIC;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(COALESCE(valor_total,valor_rubrica,0)),0)
    INTO item_count,budget FROM rubricas
   WHERE centro_custo='Terceiro Simpósio do Patrimônio de BH' AND ativo IS DISTINCT FROM FALSE;
  IF item_count<>5 OR budget<>15800 THEN
    RAISE EXCEPTION 'Orçamento do Simpósio inválido: % rubricas, R$ % (esperado: 5, R$ 15.800,00)',item_count,budget;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_simposio_rubrica_nome
  ON rubricas (lower(trim(rubrica)))
  WHERE centro_custo='Terceiro Simpósio do Patrimônio de BH';

-- The opening budget is immutable through generic entity editing. A future
-- formally approved remanejamento must have its own audited migration.
CREATE OR REPLACE FUNCTION protect_simposio_opening_budget() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.centro_custo='Terceiro Simpósio do Patrimônio de BH' THEN
      RAISE EXCEPTION 'Rubrica do Simpósio exige remanejamento formal para exclusão';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.centro_custo='Terceiro Simpósio do Patrimônio de BH'
     OR NEW.centro_custo='Terceiro Simpósio do Patrimônio de BH' THEN
    IF ROW(OLD.rubrica,OLD.grupo,OLD.natureza_despesa,OLD.codigo,OLD.codigo_item_pbh,
           OLD.valor_total,OLD.valor_rubrica,OLD.quantidade,OLD.valor_unitario,
           OLD.centro_custo,OLD.origem_recurso,OLD.ativo)
       IS DISTINCT FROM
       ROW(NEW.rubrica,NEW.grupo,NEW.natureza_despesa,NEW.codigo,NEW.codigo_item_pbh,
           NEW.valor_total,NEW.valor_rubrica,NEW.quantidade,NEW.valor_unitario,
           NEW.centro_custo,NEW.origem_recurso,NEW.ativo) THEN
      RAISE EXCEPTION 'Orçamento inicial do Simpósio exige remanejamento formal auditado';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_simposio_opening_budget ON rubricas;
CREATE TRIGGER trg_protect_simposio_opening_budget
  BEFORE UPDATE OR DELETE ON rubricas
  FOR EACH ROW EXECUTE FUNCTION protect_simposio_opening_budget();

-- A purchase and its fiscal document share one purchase_requests row. Enforce
-- the budget at that canonical write boundary, including imports and API calls.
CREATE OR REPLACE FUNCTION validate_simposio_purchase_budget() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  budget_row rubricas%ROWTYPE;
  meta_key TEXT := left(md5('5a-simposio-patrimonio-bh'), 24);
  used_rubrica NUMERIC;
  used_centro NUMERIC;
  current_amount NUMERIC;
  eligible BOOLEAN;
BEGIN
  IF NEW.rubrica_id IS NOT NULL THEN
    SELECT * INTO budget_row FROM rubricas WHERE id=NEW.rubrica_id;
  END IF;
  IF NEW.centro_custo IS DISTINCT FROM 'Terceiro Simpósio do Patrimônio de BH'
     AND NEW.meta_id IS DISTINCT FROM meta_key
     AND COALESCE(budget_row.centro_custo,'') <> 'Terceiro Simpósio do Patrimônio de BH' THEN
    RETURN NEW;
  END IF;
  IF budget_row.id IS NULL OR budget_row.centro_custo <> 'Terceiro Simpósio do Patrimônio de BH'
     OR budget_row.ativo IS FALSE THEN
    RAISE EXCEPTION 'Selecione uma das cinco rubricas ativas do 5º Termo Aditivo';
  END IF;
  NEW.centro_custo := 'Terceiro Simpósio do Patrimônio de BH';
  NEW.meta_id := meta_key;
  NEW.raw_data := COALESCE(NEW.raw_data,'{}'::jsonb) || jsonb_build_object(
    'origem_recurso','5º Termo Aditivo',
    'natureza_despesa',budget_row.natureza_despesa,
    'codigo_item_pbh',budget_row.codigo_item_pbh,
    'grupo',budget_row.grupo);
  eligible := upper(coalesce(NEW.status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
    AND NEW.incluir_no_somatorio IS DISTINCT FROM FALSE
    AND NEW.duplicada_financeira IS DISTINCT FROM TRUE;
  IF NOT eligible THEN RETURN NEW; END IF;

  -- Serialize competing approvals before testing the aggregate ceilings.
  PERFORM pg_advisory_xact_lock(1580024);
  current_amount := CASE
    WHEN NEW.raw_data #>> '{official_balancete,eligible_cents}' ~ '^[0-9]+$'
      THEN (NEW.raw_data #>> '{official_balancete,eligible_cents}')::numeric / 100
    WHEN NEW.nf_valor_total > 0 THEN NEW.nf_valor_total
    WHEN NEW.valor_aprovado > 0 THEN NEW.valor_aprovado
    WHEN NEW.valor_total > 0 THEN NEW.valor_total
    ELSE COALESCE(NEW.valor_solicitado,0) END;
  SELECT COALESCE(SUM(CASE
      WHEN p.raw_data #>> '{official_balancete,eligible_cents}' ~ '^[0-9]+$'
        THEN (p.raw_data #>> '{official_balancete,eligible_cents}')::numeric / 100
      WHEN p.nf_valor_total > 0 THEN p.nf_valor_total
      WHEN p.valor_aprovado > 0 THEN p.valor_aprovado
      WHEN p.valor_total > 0 THEN p.valor_total
      ELSE COALESCE(p.valor_solicitado,0) END),0)
    INTO used_rubrica
    FROM purchase_requests p
   WHERE p.rubrica_id=NEW.rubrica_id AND p.id IS DISTINCT FROM NEW.id
     AND upper(coalesce(p.status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
     AND p.incluir_no_somatorio IS DISTINCT FROM FALSE AND p.duplicada_financeira IS DISTINCT FROM TRUE;
  SELECT COALESCE(SUM(CASE
      WHEN p.raw_data #>> '{official_balancete,eligible_cents}' ~ '^[0-9]+$'
        THEN (p.raw_data #>> '{official_balancete,eligible_cents}')::numeric / 100
      WHEN p.nf_valor_total > 0 THEN p.nf_valor_total
      WHEN p.valor_aprovado > 0 THEN p.valor_aprovado
      WHEN p.valor_total > 0 THEN p.valor_total
      ELSE COALESCE(p.valor_solicitado,0) END),0)
    INTO used_centro
    FROM purchase_requests p JOIN rubricas r ON r.id=p.rubrica_id
   WHERE r.centro_custo='Terceiro Simpósio do Patrimônio de BH'
     AND p.id IS DISTINCT FROM NEW.id
     AND upper(coalesce(p.status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
     AND p.incluir_no_somatorio IS DISTINCT FROM FALSE AND p.duplicada_financeira IS DISTINCT FROM TRUE;
  IF current_amount<=0 THEN RAISE EXCEPTION 'Valor aprovado do Simpósio deve ser positivo'; END IF;
  IF used_rubrica + current_amount > COALESCE(budget_row.valor_total,budget_row.valor_rubrica,0) THEN
    RAISE EXCEPTION 'Saldo insuficiente na rubrica do Simpósio';
  END IF;
  IF used_centro + current_amount > 15800 THEN
    RAISE EXCEPTION 'Saldo insuficiente no centro de custo do Simpósio';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_simposio_purchase_budget ON purchase_requests;
CREATE TRIGGER trg_validate_simposio_purchase_budget
  BEFORE INSERT OR UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION validate_simposio_purchase_budget();

INSERT INTO schema_migrations(version)
VALUES ('007_simposio_centro_custo')
ON CONFLICT (version) DO NOTHING;

COMMIT;
