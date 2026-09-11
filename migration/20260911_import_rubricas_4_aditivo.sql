BEGIN;

INSERT INTO rubricas (
  id, rubrica, nome, grupo, descricao, unidade, quantidade,
  periodo_frequencia, valor_unitario, valor_rubrica, valor_total,
  origem_recurso, centro_custo, museu_codigo, escopo_orcamentario,
  natureza_despesa, nome_natureza, meta, ordem_exibicao, ativo,
  valor_utilizado, saldo, saldo_real, percentual_utilizado,
  created_at, updated_at
)
SELECT
  v.id, v.rubrica, v.rubrica, 'Noturno nos Museus 2026 - Museus Pampulha',
  v.descricao, 'serviço', 1, 1, v.valor, v.valor, v.valor,
  '4º ADITIVO', 'Noturno Pampulha', 'NOTURNO', 'NOTURNO',
  '339039', 'Serviços de terceiros - Pessoa jurídica',
  '11 - Realizar as edições 2024, 2025 e 2026 do projeto Noturno nos Museus',
  v.ordem, TRUE, 0, v.valor, v.valor, 0, NOW(), NOW()
FROM (VALUES
  ('rubrica-4a-apresentacoes-pampulha', 'Apresentações culturais no MCK, MAP e Casa do Baile', 'Apresentações culturais vinculadas ao Noturno nos Museus Pampulha, nos equipamentos MCK, MAP e Casa do Baile.', 30000.00::numeric, 1001),
  ('rubrica-4a-infraestrutura-pampulha', 'Infraestrutura e iluminação', 'Infraestrutura e iluminação vinculadas ao Noturno nos Museus Pampulha.', 30000.00::numeric, 1002),
  ('rubrica-4a-produtor-pampulha', 'Produtor', 'Serviço de produção vinculado ao Noturno nos Museus Pampulha.', 10469.85::numeric, 1003),
  ('rubrica-4a-sinalizacao-pampulha', 'Sinalização', 'Sinalização vinculada ao Noturno nos Museus Pampulha.', 11250.00::numeric, 1004)
) AS v(id, rubrica, descricao, valor, ordem)
WHERE NOT EXISTS (
  SELECT 1
  FROM rubricas r
  WHERE r.origem_recurso = '4º ADITIVO'
    AND lower(r.rubrica) = lower(v.rubrica)
    AND r.centro_custo = 'Noturno Pampulha'
);

COMMIT;
