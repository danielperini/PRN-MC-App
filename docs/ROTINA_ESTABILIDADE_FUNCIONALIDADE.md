# Rotina de estabilidade e funcionalidade — Museus Centro / Viaduto das Artes

## Objetivo

Garantir que o app continue estável, funcional e coerente com sua finalidade institucional, financeira, documental e editorial. Esta rotina deve ser usada antes de deploys, após alterações críticas e sempre que houver instabilidade em produção.

## Princípios obrigatórios

1. Não alterar layout, rotas, entidades, permissões, regras financeiras ou fluxos consolidados sem necessidade comprovada.
2. Backend/Base44 é fonte de verdade; frontend apenas reflete estado real.
3. Rubrica é fonte de verdade financeira.
4. Mudanças devem ser pequenas, cirúrgicas e reversíveis.
5. Nenhum guard global deve ser ativado no `main.jsx` sem validação rigorosa.
6. Otimizações devem ser locais por página ou por fluxo, não interceptando o app inteiro.
7. Toda correção deve preservar compatibilidade com Base44 e GitHub Sync.

---

## Rotina 1 — Checklist antes de qualquer deploy

Executar antes de publicar:

- Verificar se `src/main.jsx` está mínimo e sem guards globais pesados.
- Verificar se `src/api/base44Client.js` está simples e compatível com o SDK Base44.
- Verificar se `src/App.jsx` não bloqueia páginas por permissões sem timeout.
- Confirmar que rotas principais estão registradas em `src/pages.config.js`.
- Confirmar que páginas pesadas usam lazy loading.
- Confirmar que não há imports duplicados de páginas pesadas no `App.jsx`.
- Confirmar que serviços secundários não bloqueiam o carregamento inicial.

Páginas mínimas a abrir após deploy:

1. `/Dashboard`
2. `/Agenda`
3. `/GaleriaFotos`
4. `/Relatorios`
5. `/Compras`
6. `/RubricasPorMuseu`
7. `/RelatorioFisicoFinanceiro`
8. `/RelatorioPreview?report=dados`

Critério de aceite:

- Nenhuma página pode ficar branca.
- Nenhuma página pode ficar presa indefinidamente em loading.
- O console não deve apresentar erro fatal vermelho no carregamento inicial.
- Rate limit não pode zerar dados críticos sem fallback.

---

## Rotina 2 — Estabilidade do bootstrap

Arquivos críticos:

- `src/main.jsx`
- `src/App.jsx`
- `src/api/base44Client.js`
- `src/pages.config.js`

Regra:

O `main.jsx` deve permanecer mínimo:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/theme-nuit.css'
import '@/styles/report-print-fixes.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
```

Não importar no `main.jsx`:

- purge hard;
- observers globais;
- rotinas de PDF;
- rotinas de agenda;
- corretores de DOM;
- interceptadores de storage;
- MutationObserver global;
- patch de IndexedDB;
- proxy global do Base44.

Qualquer rotina pesada deve entrar apenas na página específica.

---

## Rotina 3 — Estabilidade de dados Base44

Nunca interceptar globalmente o SDK Base44 com Proxy.

Permitido:

- cache local dentro de páginas específicas;
- timeout em consultas secundárias;
- fallback visual quando entidade opcional não existir;
- deduplicação local dentro do relatório;
- adiar serviços não essenciais.

Proibido:

- alterar `base44Client.js` para envolver todo o SDK;
- aplicar retry global sem controle;
- bloquear autenticação com timeout agressivo;
- retornar lista vazia em dados críticos sem aviso;
- disparar múltiplas chamadas simultâneas sem necessidade.

Entidades críticas que não podem quebrar o app:

- `Report`
- `PurchaseRequest`
- `Rubrica`
- `TeamMember`
- `TeamPayment`
- `Attachment`
- `DocumentIntake`
- `Programacao`
- `UserPermission`

Se uma entidade opcional não existir, registrar aviso e seguir sem travar.

---

## Rotina 4 — Teste funcional por módulo

### Dashboard

Verificar:

- indicadores carregam;
- público total aparece como inteiro;
- atividades do mês aparecem;
- orçamento previsto, utilizado e saldo aparecem;
- carrossel não bloqueia página se notícias falharem.

### Agenda

Verificar:

- lista de programação carrega;
- filtros funcionam;
- atividades de março e abril aparecem quando disponíveis;
- página não trava por excesso de dados.

### GaleriaFotos

Verificar:

- fotos carregam progressivamente;
- imagens repetidas não aparecem duplicadas;
- cards não travam a página;
- exportação A4 não acusa elemento fora da escala.

### Relatórios

Verificar:

- lista de relatórios aprovados carrega;
- criação/edição de relatório abre;
- anexos não somem;
- atividades não sobrescrevem atividades anteriores.

### Compras

Verificar:

- solicitações carregam;
- rubricas vinculadas aparecem;
- aprovação debita rubrica quando aplicável;
- anexos PDF/XML aparecem;
- status não duplica débito.

### Entrada Única

Verificar:

- upload funciona;
- PDF/XML/recibo são classificados;
- envio para aprovação não trava;
- arquivo enviado sai da fila quando processado.

### RubricasPorMuseu

Verificar:

- valores por museu carregam;
- rubricas gerais não debitam museu errado;
- saldo previsto/utilizado/% aparecem corretamente.

---

## Rotina 5 — Relatórios e PDFs

O app deve gerar três relatórios separados:

1. Relatório Principal / Dados
2. Relatório Galeria
3. Relatório de Atividades

Antes de gerar:

- executar purge hard somente dentro da página `RelatorioFisicoFinanceiro`;
- limpar HTML antigo;
- limpar metadados antigos;
- limpar storage apenas das chaves de relatório;
- limpar IndexedDB de prévias;
- não mexer em dados reais do app.

Chaves de relatório que podem ser limpas:

- `relatorio_fisico_financeiro_html`
- `relatorio_fisico_financeiro_dados_html`
- `relatorio_fisico_financeiro_galeria_html`
- `relatorio_fisico_financeiro_atividades_html`
- respectivas chaves `_meta`, `_saved_at` e `_storage`

Nunca limpar:

- sessão de login;
- dados de usuário;
- entidades Base44;
- configurações globais do app;
- permissões.

Critérios de aceite dos PDFs:

- PDF principal não pode trazer versão antiga.
- PDF galeria não pode duplicar imagens.
- PDF atividades deve listar relatórios aprovados e atividades integrais.
- Nenhum PDF deve conter `Campos consolidados`.
- Nenhum PDF deve conter `Clique para detalhar`.
- Nenhum PDF deve conter `Ver memória de cálculo`.
- Nenhum PDF deve gerar páginas vazias em sequência.
- Tabelas devem caber em A4.
- Cards não devem quebrar entre páginas.

---

## Rotina 6 — Limpeza de código morto

Antes de remover código, verificar:

1. O arquivo está importado em algum lugar?
2. O arquivo é rota registrada em `pages.config.js`?
3. O arquivo é usado dinamicamente por Base44?
4. O arquivo é fallback de compatibilidade?
5. O arquivo foi criado como guard emergencial e está desativado?

Arquivos de risco que só podem ser removidos após validação:

- páginas em `src/pages`;
- componentes compartilhados;
- serviços financeiros;
- arquivos de autenticação;
- templates de relatório;
- utilitários de upload;
- entidades ou adapters Base44.

Arquivos candidatos a revisão se não estiverem importados:

- guards globais antigos;
- patches emergenciais de relatório;
- utilitários experimentais de PDF;
- duplicatas de dashboard;
- templates antigos não referenciados;
- scripts de teste que não são chamados.

Regra:

Não excluir diretamente. Primeiro mover mentalmente para lista de candidatos, validar build, validar rotas e só então remover em commit separado.

---

## Rotina 7 — Ordem segura de correção quando produção quebra

1. Restaurar `main.jsx` mínimo.
2. Restaurar `base44Client.js` simples.
3. Remover guards globais.
4. Confirmar `Dashboard` abre.
5. Confirmar `Agenda` abre.
6. Confirmar `GaleriaFotos` abre.
7. Confirmar `Compras` abre.
8. Só depois corrigir relatórios.

Nunca corrigir relatório colocando interceptador global no app inteiro.

---

## Rotina 8 — Monitoramento após deploy

Após cada deploy:

- abrir em aba anônima;
- abrir em aba normal com Ctrl + F5;
- testar ao menos 5 rotas críticas;
- verificar console;
- verificar se há `Rate limit exceeded`;
- verificar se há `Entity schema not found`;
- verificar se há erro de import/export Vite;
- verificar se há erro de componente React.

Se houver erro de console:

- corrigir o primeiro erro vermelho;
- não corrigir avisos secundários antes do erro fatal;
- não fazer refactor amplo;
- não adicionar dependência.

---

## Rotina 9 — Definição de função atendendo ao que se propõe

Uma função está correta quando:

1. executa o fluxo principal sem erro;
2. mostra feedback visual ao usuário;
3. não bloqueia outras páginas;
4. não altera dados fora do escopo;
5. respeita permissões;
6. usa dados reais do app;
7. tem fallback quando dado opcional falta;
8. não causa rate limit desnecessário;
9. não gera duplicidade financeira ou documental;
10. preserva rastreabilidade.

Aplicar esta definição para cada módulo antes de declarar a função como pronta.

---

## Rotina 10 — Próximas melhorias recomendadas

1. Criar painel interno de saúde do app:
   - status das entidades;
   - última sincronização;
   - erros recentes;
   - tempo médio de carregamento por página.

2. Criar cache local controlado por página:
   - Dashboard;
   - Agenda;
   - Galeria;
   - Relatórios.

3. Criar botão de diagnóstico:
   - limpar apenas prévias de relatório;
   - testar leitura de entidades;
   - validar PDF A4;
   - listar itens duplicados.

4. Criar testes manuais documentados por rota.

5. Remover código morto em commits separados e pequenos.

---

## Comando operacional padrão

Antes de pedir nova alteração ao Codex/Base44, usar este roteiro:

```txt
Analise somente o módulo solicitado.
Não altere rotas, entidades, permissões, tema, layout global ou regras financeiras.
Não coloque guards globais no main.jsx.
Não altere base44Client.js sem necessidade extrema.
Faça mudança mínima, local, reversível e com fallback.
Preserve o que já funciona.
Depois valide build e rotas críticas.
```
