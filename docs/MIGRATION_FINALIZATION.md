# Finalização da migração

## O que esta etapa fecha

A migração finaliza a cadeia de dados que o painel de Coordenação usa para cruzar execução financeira e cumprimento físico:

`Rubrica -> Meta -> Atividade -> Relatório`

Também deixa a aplicação preparada para manter os vínculos em PostgreSQL sem depender de relações implícitas do Base44.

## Mudanças

- `migration/sql/004_finalize_relationships.sql`
  - cria `metas` quando necessário;
  - cria `meta_activities` quando necessário;
  - cria índices para consultas do painel;
  - transforma `rubricas.meta` / `meta_titulo` em vínculos `meta_manual_ids` quando o vínculo ainda está vazio;
  - resolve `activities.meta_id` a partir de `meta_codigo`;
  - preenche a tabela de junção `meta_activities`;
  - preserva os dados existentes e é idempotente;
  - registra a versão em `schema_migrations`.
- `compose.yml`
  - adiciona o serviço `migrate`;
  - o serviço API só inicia depois de a migração SQL terminar com sucesso.

## Verificação pós-deploy

1. `GET /health` deve retornar `status=ok`.
2. `GET /db-health` deve retornar `database=connected`.
3. O painel deve deixar de exibir `Sem rubricas vinculadas` para metas que tenham correspondência em `rubricas.meta` ou `rubricas.meta_titulo`.
4. Atividades com `meta_codigo` devem aparecer em `meta_activities`.
5. Meta 20 deve refletir atividades reais quando os relatórios aprovados tiverem `meta_codigo`/`meta_id` correspondente.
6. O valor financeiro deve continuar vindo de `rubricas.valor_total`/`valor_rubrica` e `valor_utilizado`; a migração não altera valores monetários.
7. Upload, relatórios, fotos e anexos devem continuar apontando para `/api/files/...`.

## Critério de conclusão

A migração de dados desta etapa está concluída quando o deploy executar o serviço `migrate` com sucesso e os quatro níveis abaixo puderem ser percorridos sem dados órfãos:

- Rubrica -> Meta
- Meta -> Atividade
- Atividade -> Relatório
- Relatório -> Documentos/Fotos

As funções Base44 que ainda dependam de serviços externos (Drive, Gmail, IA ou APIs de terceiros) continuam sendo pontos de integração separados; elas não devem ser mascaradas por respostas `success=true` se a operação não tiver sido executada.
