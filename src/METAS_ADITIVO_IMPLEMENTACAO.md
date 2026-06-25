# METAS DO 3º E 4º ADITIVO - IMPLEMENTAÇÃO COMPLETA

## Visão Geral

Este documento descreve todas as metas do 3º e 4º Aditivo implementadas no Dashboard Observador e componentes relacionados.

## Metas Implementadas (25 metas totais)

### METAS CONCLUÍDAS (5)
| Nº | Título | Status |
|---|---|---|
| META 01 | Equipe principal | CONCLUÍDA |
| META 02 | Plano de comunicação | CONCLUÍDA |
| META 07 | Contratação de educadores | CONCLUÍDA |
| META 14 | Acessibilidade | CONCLUÍDA |
| META 15 | Inscrição em Leis de Incentivo | CONCLUÍDA |

### METAS EM EXECUÇÃO - EXPOSIÇÕES (7)
| Nº | Título | Status |
|---|---|---|
| META 03 | Manutenção das exposições | EM EXECUÇÃO |
| META 04 | Alteração de núcleos e salas expositivas | EM EXECUÇÃO |
| META 08 | Exposição e evento MHAB | EM EXECUÇÃO |
| META 09 | Exposição e evento MIS | EM EXECUÇÃO |
| META 12 | Exposição MHAB (pesquisa e curadoria) | EM EXECUÇÃO |
| META 13 | Exposição MUMO (pesquisa e curadoria) | EM EXECUÇÃO |
| META 21 | Exposição e evento MUMO | EM EXECUÇÃO |

### METAS EM EXECUÇÃO - ATIVIDADES (7)
| Nº | Título | Status |
|---|---|---|
| META 05 | Ações educativas (mín. 60) | EM EXECUÇÃO |
| META 06 | Ações culturais (mín. 36) | EM EXECUÇÃO |
| META 10 | Mostras de baixa/média complexidade | EM EXECUÇÃO |
| META 11 | Noturno nos Museus | EM EXECUÇÃO |
| META 11A | Noturno 2026 | EM EXECUÇÃO |
| META 11B | Noturno Pampulha | EM EXECUÇÃO |
| META 19 | Atividade Presente de Iemanjá | EM EXECUÇÃO |
| META 20 | Ações educativas e/ou culturais (30 ações) | EM EXECUÇÃO |

### METAS EM EXECUÇÃO - CUSTEIO E PUBLICAÇÕES (3)
| Nº | Título | Status |
|---|---|---|
| META 16 | Diárias de educadores | EM EXECUÇÃO |
| META 17 | Publicações e catálogos | EM EXECUÇÃO |
| META 18 | Custeio das atividades educativas e culturais | EM EXECUÇÃO |

### METAS EM EXECUÇÃO - CONSULTORIA E DESPESAS (4)
| Nº | Título | Status |
|---|---|---|
| META 22 | Consultoria para execução do projeto | EM EXECUÇÃO |
| META 23 | Despesas Gerais | EM EXECUÇÃO |
| META 24 | Emenda Parlamentar | EM EXECUÇÃO |
| META 25 | Outras Ações | EM EXECUÇÃO |

## Componentes Atualizados

### 1. `utils/finance/metaFinancialMetrics.js`
- **Função principal:** `calculateMetaFinancialMetrics(rubricas)`
- **Retorna:** Array com 25 metas contendo dados financeiros calculados
- **Campos por meta:**
  - `numero`: Número da meta (ex: '1', '11A', '11B')
  - `numeroFormatado`: Formato exibido (ex: 'META 01', 'META 11A')
  - `titulo`: Descrição da meta
  - `status`: 'CONCLUÍDA' ou 'EM EXECUÇÃO'
  - `previsto`: Valor total previsto (soma das rubricas vinculadas)
  - `utilizado`: Valor total utilizado (soma das rubricas vinculadas)
  - `saldo`: previsto - utilizado
  - `percentualFinanceiro`: (utilizado / previsto) * 100
  - `percentualFisico`: 100 se CONCLUÍDA, else percentualFinanceiro
  - `rubricasCount`: Quantidade de rubricas vinculadas
  - `rubricasIds`: Array de IDs das rubricas vinculadas
  - `indicador`: String formatada para exibição

### 2. `components/dashboard/MetasAditivoSection`
- **Componente:** Exibe cards interativos para todas as 25 metas
- **Funcionalidades:**
  - Visualização em grid responsivo (1 col mobile, 2 col tablet, 3 col desktop)
  - Modal para vincular/desvincular rubricas por meta
  - Cálculos financeiros centralizados via `calculateMetaFinancialMetrics`
  - Busca e filtro de rubricas no modal

### 3. `pages/DashboardPatrocinadorSync`
- **Integração:** Consome dados financeiros reconciliados
- **Exibição:** Cards de execução orçamentária com totais oficiais

## Critérios de Vínculo de Rubricas

As rubricas são vinculadas às metas através dos seguintes critérios (em ordem de prioridade):

1. **ID oficial da meta** (`rubrica.meta_id === meta.id`)
2. **Número normalizado** (ex: 'META 01' → '1', '11A' → '11A')
3. **Mapeamento por título** (busca por palavras-chave no título da meta)

### Subdivisões de Metas
- **META 11A (Noturno 2026)** e **META 11B (Noturno Pampulha)** são vinculadas à **META 11 (Noturno nos Museus)** quando não há vínculo explícito

## Fontes de Dados

- **Rubricas:** Entidade `Rubrica` do Base44
- **Campos utilizados:**
  - `meta`, `meta_numero`, `meta_titulo` (vínculo textual)
  - `meta_id` (vínculo por ID oficial)
  - `valor_rubrica`, `valor_total`, `previsto` (orçamento)
  - `valor_utilizado`, `utilizado`, `realizado` (execução)
  - `centro_custo`, `escopo_orcamentario` (agrupamento por museu/projeto)

## Validação de Coerência Financeira

Todas as metas passam por validações automáticas:
- ✅ Saldo = Previsto - Utilizado
- ✅ Percentual = (Utilizado / Previsto) * 100
- ✅ Soma das metas = Total utilizado no dashboard
- ✅ Nenhuma rubrica duplicada entre metas

## Atualizações Futuras

Para adicionar novas metas:
1. Adicionar entrada no array `METAS_OFICIAIS` em `utils/finance/metaFinancialMetrics.js`
2. Manter formato: `{ numero, numeroFormatado, titulo, status }`
3. Para subdivisões, adicionar campo `metaPai` apontando para o número da meta pai
4. Componentes de UI atualizam automaticamente via `calculateMetaFinancialMetrics`

## Documentação Relacionada

- `utils/auditoria/reconcileFinancialTotals.js` - Reconciliação financeira oficial
- `utils/auditoria/validateFinancialCoherence.js` - Validações de coerência
- `utils/finance/rubricaAliases.js` - Mapa de aliases para rubricas e centros de custo