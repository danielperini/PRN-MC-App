BEGIN;

-- The approved opening budget remains R$ 15.800,00. As with other addenda,
-- individual rubrica balances may be negative; the center-wide ceiling cannot.
-- This replaces only the purchase validation function installed by 007.
CREATE OR REPLACE FUNCTION validate_simposio_purchase_budget() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  budget_row rubricas%ROWTYPE;
  meta_key TEXT := left(md5('5a-simposio-patrimonio-bh'), 24);
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
    INTO used_centro
    FROM purchase_requests p JOIN rubricas r ON r.id=p.rubrica_id
   WHERE r.centro_custo='Terceiro Simpósio do Patrimônio de BH'
     AND p.id IS DISTINCT FROM NEW.id
     AND upper(coalesce(p.status,'')) IN ('APROVADO','APROVADO_COORD','APROVADO_ADMIN','PAGO')
     AND p.incluir_no_somatorio IS DISTINCT FROM FALSE AND p.duplicada_financeira IS DISTINCT FROM TRUE;
  IF current_amount<=0 THEN RAISE EXCEPTION 'Valor aprovado do Simpósio deve ser positivo'; END IF;
  IF used_centro + current_amount > 15800 THEN
    RAISE EXCEPTION 'Saldo insuficiente no centro de custo do Simpósio (limite de R$ 15.800,00)';
  END IF;
  RETURN NEW;
END $$;

INSERT INTO schema_migrations(version)
VALUES ('008_simposio_budget_policy')
ON CONFLICT (version) DO NOTHING;

COMMIT;
