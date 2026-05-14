# RELATÓRIO EDITORIAL INSTITUCIONAL + DASHBOARDS
## Arquitetura Completa — Museus Centro / Viaduto das Artes

**Data**: Maio 2026  
**Status**: Arquitetura Estruturada  
**Versão**: 1.0

---

## 📋 ÍNDICE

1. [Princípios](#princípios)
2. [Separação de Métricas](#separação-de-métricas)
3. [Estrutura de Dados](#estrutura-de-dados)
4. [Seções do Relatório](#seções-do-relatório)
5. [Dashboards & Cards](#dashboards--cards)
6. [Análise IA por Seção](#análise-ia-por-seção)
7. [Integração Backend](#integração-backend)

---

## 🎯 PRINCÍPIOS

### Fundamentais
✅ **Apenas dados reais** — Não gerar ficção  
✅ **Sem repetição** — Fotos/textos únicos  
✅ **Métricas limpas** — Ocultar vazias  
✅ **Padrão visual** — Consistência total  
✅ **Expandir, não remover** — Novos cards coexistem  
✅ **IA integrada** — Análise contínua  

### Não Fazer
❌ Alterar layout consolidado  
❌ Remover estruturas atuais  
❌ Gerar dados fictícios  
❌ Quebrar exportação PDF  
❌ Desativar dashboards existentes  

---

## 📊 SEPARAÇÃO DE MÉTRICAS

### Público Geral
```
= público institucional declarado no relatório

ORIGEM:
  - campo "publico_geral_declarado" (Report)
  - não vinculado a atividades específicas
  - representa circulação total do museu

MÉTRICA:
  - público_geral_total
  - público_geral_por_museu
  - público_geral_crescimento_mensal
```

### Público em Atividades
```
= SOMENTE atividades culturais/educativas com público registrado

INCLUI:
  ✅ Oficinas
  ✅ Mediações
  ✅ Visitas educativas
  ✅ Apresentações
  ✅ Rodas de conversa
  ✅ Formação
  ✅ Ações culturais
  ✅ Ações educativas

EXCLUI:
  ❌ Exposição (não tem público em pessoa)
  ❌ Catálogo (produção)
  ❌ Reunião (administrativa)
  ❌ Produção técnica
  ❌ Gestão (administrativo)
  ❌ Comunicação (sem público direto)

ORIGEM:
  - campo "publico_total" (Activity)
  - onde Activity.classificacao IN [META, ROTINA, EXTRA]
  - apenas WHERE Activity.eh_mobilizacao = false (não é divulgação pura)
  - apenas atividades com publico_total > 0

MÉTRICA:
  - atividades_culturais_total
  - publico_atividades_total
  - publico_medio_por_atividade
  - crescimento_participacao
  - taxa_fidelizacao (mesmo público, múltiplas atividades)
```

### Diferença Conceitual

```
Exemplo Maio 2026 — MHAB:

Público Geral:           4.500 pessoas
  (circulação do museu no mês, visitantes gerais)

Público em Atividades:   1.200 pessoas
  (apenas dos 23 eventos que realmente tiveram público)

Diferença:               3.300 pessoas
  (visitantes que não participaram de atividades registradas)

Atividades:              23
  (das quais 17 com público registrado)
```

---

## 🏗️ ESTRUTURA DE DADOS

### Entidades Envolvidas

```javascript
// Principal
Report {
  id,
  museu,
  mes_referencia,
  ano,
  publico_geral_declarado,  ← PÚBLICO GERAL
  atividades: Activity[]
}

Activity {
  id,
  report_id,
  titulo,
  publico_total,            ← PÚBLICO ATIVIDADES
  publico_estimado,
  quantas_repeticoes,
  classificacao,            // META, ROTINA, EXTRA
  eh_mobilizacao,           // true = divulgação
  tipo_equipe,              // EDUCATIVO, PRODUCAO, COMUNICACAO, ADMINISTRACAO
  // ... 50+ campos
}

Release {
  id,
  mes,
  ano,
  titulo,
  conteudo_completo,
  conteudo_resumido,
  museus: string[],
  tipos_atividade: string[],
  atividades_vinculadas: { activity_id, titulo, confianca }[]
}

PurchaseRequest {
  id,
  numero_processamento,
  status,                   // RASCUNHO, SOLICITADO, APROVADO, PAGO
  valor_solicitado,
  valor_pago,
  data_pagamento,
  rubrica_id,
  fornecedor_nome
}

Attachment {
  id,
  report_id,
  activity_id,
  file_name,
  file_type,
  file_url,
  drive_file_id,
  backup_done
}

Programacao {
  id,
  titulo,
  data_inicio,
  data_fim,
  museu,
  tipo_atividade,
  publico_estimado,
  status                    // planejado, realizado, cancelado
}

AIEmbedding {
  id,
  conteudo_tipo,            // relatorio, release, atividade...
  conteudo_id,
  embedding_vector,         // 1536 dims
  palavras_chave,
  entities: { museus, pessoas, locais, temas, atividades }
}

TeamMember {
  id,
  user_email,
  funcao,
  museu_projeto,
  contrato: {
    numero,
    data_assinatura,
    status_contrato,
    valor_total
  }
}

Fornecedor {
  id,
  nome,
  categoria,
  museus_atuacao,
  rubricas_utilizadas,
  historico_servicos
}
```

---

## 📑 SEÇÕES DO RELATÓRIO

### 1️⃣ CAPA EDITORIAL

**Objetivo**: Captura visual e impacto imediato

#### Cards
```
┌─────────────────┬──────────────────┬──────────────┐
│ Público Geral   │ Público Ativ.    │ Atividades   │
│ 4.500 pessoas   │ 1.200 pessoas    │ 23           │
│ ↑ 12% vs maio   │ ↑ 8% vs maio     │ ↑ 3%         │
└─────────────────┴──────────────────┴──────────────┘

┌──────────────────────────────────────────────────┐
│ Museus Participantes: MHAB | MIS | MUMO | Geral │
│ Período: Maio de 2026                            │
└──────────────────────────────────────────────────┘
```

#### Elementos
- Imagem forte (1–4 fotos das atividades de maior público)
- Título do período
- Destaque institucional (síntese 1 frase)
- Museus ativos

#### IA Analysis
```
Função: analisarCapaEditorial()
  ↓
Entrada:
  - Report ID
  - Fotos mais visualizadas
  - Atividades de maior público

Saída:
  - Foto selecionada (IA visual + contexto)
  - Destaque (1 frase forte)
  - Tema do período
```

---

### 2️⃣ INTRODUÇÃO E TERRITÓRIO

**Objetivo**: Contextualizar ocupação e circulação cultural

#### Métricas
```
Atuação por Museu:
  - atividades por museu
  - público por museu
  - percentual de participação

Circulação Territorial:
  - bairros alcançados
  - pontos de ativação
  - densidade de ocupação
```

#### Gráficos
```
Gráfico 1: Barras
  Título: Atividades por Museu
  MHAB: 8
  MIS: 9
  MUMO: 6
  Total: 23

Gráfico 2: Mapa (opcional)
  Circulação territorial
  Cores = densidade de público
```

#### Texto IA
```
Função: leituraTerritorioIA()
  ↓
Entrada:
  - Atividades do período
  - Localização de cada uma
  - Público alcançado

Saída:
  - Análise ocupação urbana
  - Circulação observada
  - Recomendações territoriais
  - 300–500 palavras
```

---

### 3️⃣ RESUMO E INDICADORES

**Objetivo**: Dashboard executivo rápido

#### Cards (Grid)
```
┌─────────┬──────────┬──────────┬──────────┐
│ Ativ.   │ Público  │ Relat.   │ Pagtos   │
│ 23      │ 1.200    │ 5        │ R$ 85K   │
│ ↑ 3%    │ ↑ 8%     │ ✓ 5/5    │ ↑ 12%    │
└─────────┴──────────┴──────────┴──────────┘

┌─────────┬──────────┬──────────┬──────────┐
│ Docs    │ Evidênc. │ Program. │ Releases │
│ 127     │ 89 fotos │ 31       │ 12       │
│ 100%    │ ↑ 15%    │ 23/31 ✓  │ ✓ 100%   │
└─────────┴──────────┴──────────┴──────────┘
```

#### Gráficos
```
Linha: Crescimento Mensal
  Jan: 18 ativ | Fev: 20 | Mar: 21 | Abr: 22 | Mai: 23

Pizza: Participação por Museu
  MHAB: 35%
  MIS: 39%
  MUMO: 26%

Barras: Público por Eixo
  Educativo: 600
  Mediação: 400
  Apresentações: 200
```

---

### 4️⃣ PÚBLICO ALCANÇADO

**Objetivo**: Análise profunda de participação

#### Separação Clara
```
PÚBLICO GERAL
  Total: 4.500
  Por Museu:
    MHAB: 1.500 (33%)
    MIS: 2.000 (44%)
    MUMO: 1.000 (23%)

PÚBLICO EM ATIVIDADES
  Total: 1.200
  Por Museu:
    MHAB: 400
    MIS: 500
    MUMO: 300
```

#### Gráficos
```
Barras Agrupadas: Público Geral vs Atividades
  ↑ visualizar a diferença

Linha: Crescimento Participação
  Mostrar tendência

Pizza: Distribuição por Eixo
  Educativo, Mediação, Apresentações, Formação...

Box Plot: Público por Faixa Etária
  Se dados disponíveis
```

#### Cards
```
Público Médio por Atividade:
  1.200 ÷ 17 ativ. = 71 pessoas/ativ.

Crescimento vs Período Anterior:
  +8% em participação

Taxa de Reincidência:
  XX% mesmo público em 2+ atividades

Acessibilidade:
  XX% das atividades com acessibilidade
```

---

### 5️⃣ ATIVIDADES POR EIXO

**Objetivo**: Quebra temática e estratégica

#### Separação
```
EDUCATIVO
  Quantidade: 8
  Público: 480
  % Total: 40%

MEDIAÇÃO
  Quantidade: 7
  Público: 420
  % Total: 35%

FORMAÇÃO
  Quantidade: 4
  Público: 180
  % Total: 15%

APRESENTAÇÕES
  Quantidade: 4
  Público: 120
  % Total: 10%
```

#### Gráficos
```
Pizza: % por Eixo (4 cores)

Barras Horizontais: Detalhes
  Educativo (Oficinas: 5, Visitas: 3)
  Mediação (Rodas: 4, Curadoria: 3)
  ...
```

#### Cards
```
Eixo com Maior Participação:
  Educativo (480 / 40%)

Eixo com Melhor Taxa:
  Mediação (60 pessoas/atividade)

Balanceamento:
  Visão de saúde de oferta
```

---

### 6️⃣ EXECUÇÃO FINANCEIRA

**Objetivo**: Transparência orçamentária

#### Resumo Geral
```
Valor Total Previsto:    R$ 234.500
Valor Utilizado:         R$ 189.300
Saldo:                   R$ 45.200
Percentual Executado:    81%
```

#### Por Museu
```
MHAB:
  Previsto: R$ 80.000
  Utilizado: R$ 65.300
  Percentual: 82%

MIS:
  Previsto: R$ 100.000
  Utilizado: R$ 82.500
  Percentual: 82%

MUMO:
  Previsto: R$ 54.500
  Utilizado: R$ 41.500
  Percentual: 76%
```

#### Por Rubrica (Top 5)
```
1. Equipe e Gestão:       R$ 85.000 (45%)
2. Comunicação:            R$ 42.300 (22%)
3. Produção/Infraestrutura: R$ 35.000 (18%)
4. Eventos/Artistas:       R$ 20.000 (11%)
5. Logística:              R$ 7.000 (4%)
```

#### Gráficos
```
Barras: Por Museu
  Executado vs Saldo lado a lado

Pizza: Distribuição por Rubrica
  5 maiores categorias

Linha: Execução Mensal
  Acumulado ao longo do tempo
```

#### Cards
```
Rubricas Zeradas:
  Nenhuma

Rubricas Críticas (>95%):
  X rubricas

Taxa de Conformidade:
  100% documentação?
```

---

### 7️⃣ PRESTAÇÃO DE CONTAS

**Objetivo**: Auditoria e documentação

#### Listagem
```
PAGAMENTOS
  Total Realizado: R$ 189.300
  Quantidade: 47
  Status: 47/47 (100%)

FORNECEDORES
  Quantidade: 23
  Pagamentos por Fornecedor: [tabela]

NOTAS FISCAIS
  Total: 47
  Pareadas com XML: 45 (96%)
  Sem XML: 2 (4%)

DOCUMENTAÇÃO
  Comprovantes: 47/47
  Backups Drive: 47/47
```

#### Cards
```
Pagamentos Realizados:    47
Notas Auditadas:          47 ✓
XML Pareados:             45 ✓
Divergências:             2 (⚠️)
```

#### Análise IA
```
Função: inteligenciaFinanceiraAvancada()
  ↓
Entrada:
  - PurchaseRequest (todos status=PAGO)
  - Attachment (NFe + XML)
  - TeamMember contracts

Saída:
  - Conformidade 100%?
  - Divergências detectadas
  - Recomendações
  - Risco score: 0–100
```

---

### 8️⃣ PROGRAMAÇÃO DO PERÍODO

**Objetivo**: Agenda e execução

#### Resumo
```
Total Programações:       31
Realizadas:              23 (74%)
Canceladas:              2 (6%)
Pendentes:               6 (20%)

Próximas Atividades:      [lista com 5 próximas]
```

#### Cards
```
Programações Planejadas:  31
Programações Realizadas:  23
Taxa de Realização:       74%

Próximas Atividades:      6
  (últimas do período)
```

#### Gráficos
```
Barras: Status da Programação
  Realizadas: 23
  Canceladas: 2
  Pendentes: 6

Timeline: Cronograma do Período
  Distribuição temporal de atividades
```

---

### 9️⃣ COMUNICAÇÃO E VISIBILIDADE

**Objetivo**: Repercussão e alcance

#### Métricas
```
RELEASES
  Total Publicado: 12
  Período: Maio 2026

NOTÍCIAS
  Menções Conquistadas: 18
  Publicações Externas: 8

CLIPPING
  Links Positivos: 18
  Alcance Estimado: 125.000 pessoas

REDES SOCIAIS
  Posts Publicados: 67
  Engajamento: XX%
```

#### Cards
```
Releases Publicados:      12
Notícias sobre Projeto:   18
Alcance Estimado:         125K pessoas
Taxa de Cobertura:        Excelente
```

#### Análise IA
```
Função: clippingInteligente()
  ↓
Entrada:
  - Release (todos do período)
  - Links do sistema
  - Mentions (API externa?)

Saída:
  - Síntese de repercussão
  - Tendências de tema
  - Recomendações comunicação
```

---

### 🔟 REGISTROS E EVIDÊNCIAS

**Objetivo**: Documentação visual e material

#### Inventário
```
FOTOS
  Total: 245
  Por Atividade: 245 ÷ 23 = ~11 fotos/atividade
  Sem Repetição: ✓ (validação manual)

DOCUMENTOS
  Contratos: 12
  Relatórios: 5
  PDFs Diversos: 18
  Total: 35

VÍDEOS
  Quantity: 7
  Duração Total: 87 minutos
```

#### Cards
```
Fotos Capturadas:        245
Documentos Arquivados:   35
Vídeos Produzidos:       7
Backups Realizados:      100%
```

#### Galeria Curada (Seção Separada)
```
Função: curadoriaAutomatica()
  ↓
Seleção: 1–4 fotos por atividade
  - Sem repetição
  - Maior qualidade visual
  - Contexto claro
  
Exibição:
  - Grid com legendas
  - Agrupado por museu/eixo
  - Clicável (zoom)
```

---

### 1️⃣1️⃣ EXECUÇÃO POR MUSEU

**Objetivo**: Análise comparativa

#### Tabela Comparativa
```
MHAB
  Orçamento: R$ 80.000
  Executado: R$ 65.300 (82%)
  Atividades: 8
  Público: 650
  Metas: 7/10

MIS
  Orçamento: R$ 100.000
  Executado: R$ 82.500 (82%)
  Atividades: 9
  Público: 800
  Metas: 8/10

MUMO
  Orçamento: R$ 54.500
  Executado: R$ 41.500 (76%)
  Atividades: 6
  Público: 400
  Metas: 5/10

GERAL
  Orçamento: R$ 234.500
  Executado: R$ 189.300 (81%)
  Atividades: 23
  Público: 1.850
  Metas: 20/30
```

#### Gráficos
```
Radar/Spider: Saúde por Museu
  Eixos: Orçamento, Atividades, Público, Metas, Comunicação

Barras: Comparativo Lado a Lado
  Cada métrica um grupo

Heatmap: Matriz de Saúde (opcional)
```

---

### 1️⃣2️⃣ EXECUÇÃO POR RUBRICA

**Objetivo**: Detalhamento orçamentário

#### Tabela
```
Grupo                        Total      Utilizado   Saldo      %
─────────────────────────────────────────────────────────────────
Equipe e Gestão             85.000      72.000      13.000     85%
Comunicação                 42.300      38.500      3.800      91%
Produção/Infraestrutura     35.000      29.300      5.700      84%
Eventos/Artistas            20.000      15.200      4.800      76%
Logística                   7.000       6.200       800        89%
Materiais                   15.200      12.800      2.400      84%
Consultoria                 10.000      8.300       1.700      83%
Outros                      20.000      7.000       13.000     35%
─────────────────────────────────────────────────────────────────
TOTAL                       234.500     189.300     45.200     81%
```

#### Gráficos
```
Barras Horizontais: Cada Rubrica
  Total vs Utilizado lado a lado

Pizza: Distribuição Total
  % de cada grupo

Waterfall: De Previsão para Utilizado
  Mostra fluuxo
```

---

### 1️⃣3️⃣ CONTRATOS E EQUIPE

**Objetivo**: Gestão de pessoas e fornecedores

#### Equipe Ativa
```
Total de Profissionais: 18
  Coordenação: 2
  Educativo: 6
  Produção: 5
  Comunicação: 3
  Administrativo: 2

Status Contratual:
  Ativos: 18
  Encerrados: 2
  Pendentes: 1
```

#### Fornecedores
```
Total de Fornecedores: 23
  Ativos: 20
  Inativos: 3

Categorias:
  Audiovisual: 5
  Design: 4
  Produção: 6
  Consultoria: 5
  Outros: 3

Pagamentos Total: R$ 189.300
Fornecedor Top: [nome] — R$ 45.200
```

#### Cards
```
Equipe Ativa:            18
Fornecedores Ativos:     20
Contratos Vigentes:      18
Pagamentos Realizados:   100%
```

---

### 1️⃣4️⃣ CURADORIA INSTITUCIONAL

**Objetivo**: Narrativa qualitativa

#### Frases Destaque
```
"[Frase 1 — 1 linha — impacto]"
  — Pessoa / Atividade

"[Frase 2]"
  — Pessoa / Atividade
```

#### Relatos
```
[1–3 relatos curtos, cada um: 50–100 palavras]
  Histórias de impacto
  Transformação percebida
  Depoimentos
```

#### Análise IA
```
Função: curadoriaAutomatica()
  ↓
Entrada:
  - Activity descriptions
  - Relatos (depoimentos)
  - Comentários

Saída:
  - Frases mais fortes (top 5)
  - Relatos curados
  - Conectar a temas
```

---

### 1️⃣5️⃣ GALERIA CURADA

**Objetivo**: Visual storytelling

#### Padrão
```
Por Atividade:
  1–4 fotos das melhores
  Sem repetição
  Legenda breve

Agrupamento:
  Por Museu
  Por Eixo
  Por Período (semana/quinzena)
```

#### Critérios de Seleção IA
```
Função: classifyPhotoMetadata()
  ↓
Entrada:
  - Foto URL
  - Contexto (atividade, data, público)
  - Metadados visuais

Saída:
  - Score de qualidade (0–100)
  - Score de contexto (0–100)
  - Score de impacto (0–100)
  - Recomendação: usar/não usar

Seleção Final:
  Top 1–4 por atividade
  Diversidade visual
  Sem repetição de pessoas/planos
```

---

### 1️⃣6️⃣ MEMÓRIA INSTITUCIONAL

**Objetivo**: Narrative histórica

#### Estrutura
```
SÍNTESE HISTÓRICA
  1–2 parágrafos
  O que é Museus Centro?
  O que foi em Maio?
  Qual a evolução?

EVOLUÇÃO DO PROJETO
  Dados: Jan → Fev → Mar → Abr → Maio
  Crescimento observado
  Marcos importantes

CONSOLIDAÇÃO INSTITUCIONAL
  O que aprendemos
  Estrutura agora mais forte?
  Recomendações para continuidade
```

#### Análise IA
```
Função: memoriaInstitucionaiContinu()
  ↓
Entrada:
  - Histórico de relatórios (Jan–Maio)
  - Releases
  - Documentos históricos
  - Embeddings semânticos

Saída:
  - Síntese histórica
  - Conexões de temas ao longo tempo
  - Tendências observadas
  - Recomendações institucionais
  - ~800 palavras
```

---

### 1️⃣7️⃣ CONSOLIDAÇÃO EDITORIAL IA

**Objetivo**: Análise profunda integrada

#### Uso de Dados
```
RELEASES
  12 releases do período
  Embedding de cada um
  Palavras-chave extraídas

RELATÓRIOS
  5 relatórios aprovados
  Conteúdo completo
  Contexto institucional

PROGRAMAÇÃO
  31 programações
  Status de realização
  Público alcançado

IMAGENS
  245 fotos
  Top 20 selecionadas
  Análise visual IA

DOCUMENTOS
  35 arquivos
  Contratos, PDFs, relatórios
  Contexto extraído
```

#### Análise IA
```
Função: consoConsolidacaoEditorial()
  ↓
Entrada:
  - Relatório ID
  - Seções a consolidar (array)
  - Releases do período
  - Programação
  - Atividades

Processamento:
  1. Extrair contexto de cada fonte
  2. Gerar embeddings
  3. Conectar temas
  4. Produzir narrativa integrada
  5. Validar com dados reais

Saída:
  - Texto longo (2000+ palavras)
  - Conexões entre seções
  - Análise de padrões
  - Recomendações estratégicas
  - Markdown formatado
```

---

### 1️⃣8️⃣ PAINEL EXECUTIVO (Cross-Dashboards)

**Objetivo**: Cards universais em todos os dashboards

#### Cards Primários (Sempre Visíveis)
```
┌──────────────────────────────────────────────────┐
│ 📊 PAINEL EXECUTIVO — MAIO 2026                  │
├──────────────────────────────────────────────────┤
│                                                  │
│  Público Geral          Público Atividades       │
│  4.500 pessoas          1.200 pessoas           │
│  ↑ 12% vs abr           ↑ 8% vs abr             │
│                                                  │
│  Atividades Realizadas  Museus Ativos           │
│  23 total               3 (MHAB, MIS, MUMO)     │
│  ↑ 3% vs abr            ✓ 100%                  │
│                                                  │
├──────────────────────────────────────────────────┤
│                                                  │
│  Relatórios Aprovados   Execução Financeira     │
│  5/5 ✓ 100%             R$ 189.3K / 81%         │
│                                                  │
│  Pagamentos Realizados  Evidências Capturadas   │
│  47/47 ✓ 100%           245 fotos + 7 vídeos    │
│                                                  │
│  Documentos Arquivados  Contratos Ativos        │
│  35 arquivos ✓          18 profissionais        │
│                                                  │
├──────────────────────────────────────────────────┤
│                                                  │
│  Comunicação            Releases Publicados     │
│  18 menções conquistadas 12 releases ✓          │
│                                                  │
│  Crescimento Mensal     Taxa de Metas           │
│  ↑ Continuo            20/30 (67%)              │
│                                                  │
└──────────────────────────────────────────────────┘
```

#### Comportamento
```
INCLUIR EM:
  ✓ Dashboard (Geral)
  ✓ Dashboard Profissional
  ✓ Dashboard Financeiro
  ✓ Dashboard Patrocinador
  ✓ Relatório Editorial (Seção 3)
  ✓ Todos os Relatórios Mensais

ATUALIZAR:
  - Diariamente (cron job)
  - A cada novo relatório aprovado
  - A cada pagamento registrado
  - A cada atividade finalizada

DADOS SEMPRE REAIS:
  - Não gerar mocks
  - Validar totalizadores
  - Referenciar fontes
```

---

## 📈 ANÁLISE IA POR SEÇÃO

### Matriz de Análise IA

```
SEÇÃO                    FUNÇÃO IA              ENTRADA            SAÍDA
─────────────────────────────────────────────────────────────────────────────
1. Capa                  analisarCapaEditorial()  Fotos, Público     Destaque
2. Território            leituraTerritorioIA()    Atividades, Loca.  Análise Geo
3. Indicadores           insightsAutomaticos()    Métricas          KPIs
4. Público               analisarMultimodal()     Dados Público      Segmentação
5. Atividades            analyzeActivityDesc()    Activity texts     Temática
6. Financeiro            inteligenciaFinan.()     Purchases, Rubricas Conformidade
7. Prestação             validarConfiança()       Documentos, Pagas  Auditoria
8. Programação           refreshProgramacao()     Programação BD     Status
9. Comunicação           clippingInteligente()    Releases, Links    Repercussão
10. Registros            classifyPhotoMetadata()  Fotos/Docs         Curadoria
11. Por Museu            queryMultiMuseu()        Atividades         Comparativo
12. Por Rubrica          getRubricasConsol()      Purchases          Uso Orça.
13. Contratos/Equipe     extractTeamContract()    TeamMembers        Portfólio
14. Curadoria            curadoriaAutomatica()    Activities, Texts  Destaques
15. Galeria              classifyPhotoMetadata()  Fotos              Top4/Ativ
16. Memória              memoriaInstitucion()     Histórico 5 meses  Evolução
17. Consolidação IA      consoConsolidacaoEdit()  Todas as fontes    Narrativa
18. Painel Exec.         combinarAllMetricas()    Todas as métricas  Dashboard
```

---

## 🔗 INTEGRAÇÃO BACKEND

### Fluxo de Dados

```
ENTRADA
  ↓
  Report.create() or Report.update()
  ↓
TRIGGER: Automation (entity: Report, event: update/create)
  ↓
consoConsolidacaoEditorial({
  relatorio_id,
  periodo_mes,
  periodo_ano,
  museu,
  secoes_selecionadas: ['capa', 'territorio', ...]
})
  ↓
PROCESSAMENTO IA:
  1. Extrair dados de todas as entidades
  2. Calcular métricas (público geral vs atividades)
  3. Chamar funções IA específicas
  4. Consolidar narrativas
  5. Validar com dados reais
  ↓
SAÍDA:
  {
    sucesso: true,
    narrativa: "...",
    secoes: {
      capa: {...},
      territorio: {...},
      ...
    },
    metricas: {...},
    fontes: {
      relatorio: true,
      releases: 12,
      programacao: 31,
      atividades: 23
    }
  }
  ↓
ATUALIZAR DASHBOARDS
  - Dashboard Geral
  - Dashboard Financeiro
  - Relatório Editorial (UI)
  ↓
EXPORTAR (PDF/DOCX/TXT)
  - Sem alterações no fluxo atual
  - Apenas adicionar seções conforme seleção
```

### Funções Backend Necessárias

#### Já Existentes (Reutilizar)
```
✅ consoConsolidacaoEditorial()
✅ leituraTerritorioIA()
✅ inteligenciaFinanceiraAvancada()
✅ curadoriaAutomatica()
✅ clippingInteligente()
✅ memoriaInstitucionaiContinu()
✅ classifyPhotoMetadata()
✅ extractTeamContractData()
✅ getRubricasConsolidadas()
✅ validarConfiancaRelatorio()
```

#### Novas (A Implementar)
```
❌ analisarCapaEditorial()
   → Seleção automática de foto + destaque

❌ combinarAllMetricas()
   → Painel Executivo (agregar cards)

❌ validarPublicoGeral_vs_Atividades()
   → Separar corretamente as métricas

❌ criarGalerialCurada()
   → Selecionar top 4 fotos por atividade

❌ gerarLinhaTempoPeríodo()
   → Timeline cromológica

❌ detectarMetas()
   → Quais metas foram atingidas?

❌ analisarSaudePorMuseu()
   → Matriz comparativa
```

---

## 📱 DASHBOARDS & WIDGETS

### Dashboard Geral (Expandido)

```
PAINEL EXECUTIVO (cards principais — sempre visível)
├─ Público Geral
├─ Público Atividades
├─ Atividades
├─ Relatórios
├─ Executado (%)
├─ Pagamentos
├─ Evidências
└─ Comunicação

SEÇÕES (expandíveis)
├─ Atividades
│  └─ Por Eixo (gráfico)
├─ Financeiro
│  └─ Por Museu (gráfico)
├─ Programação
│  └─ Status (timeline)
└─ Comunicação
   └─ Releases (lista)
```

### Dashboard Financeiro (Expandido)

```
PAINEL EXECUTIVO (cards — sempre visível)

ORÇAMENTO
├─ Por Museu (barras comparativas)
├─ Por Rubrica (pizza)
└─ Evolução Mensal (linha)

PAGAMENTOS
├─ Realizados vs Pendentes
├─ Fornecedores (top 5)
└─ Status Documentação

CONFORMIDADE
├─ Notas Fiscais (pareadas)
├─ Divergências (alert)
└─ Compliance Score
```

### Dashboard Profissional (Expandido)

```
MINHA ATUAÇÃO
├─ Minhas Atividades
│  ├─ Planejadas
│  ├─ Realizadas
│  └─ Público Acumulado
├─ Meu Museu
│  ├─ Relatório Pessoal
│  └─ Programações
└─ Métricas Pessoais
   ├─ Crescimento
   └─ Comparativo com Média

PAINEL GERAL (cards pequenos)
└─ Resumo da instituição
```

---

## 🎨 PADRÃO VISUAL

### Consistência
```
✓ Cards: 4–8 por linha (grid responsivo)
✓ Cores: Padrão institucional (azul, verde, laranja)
✓ Ícones: Lucide React (consistentes)
✓ Tipografia: Inter (família atual)
✓ Espaçamento: Tailwind (grid 4px)
✓ Borders: 1px, cinza 200
✓ Sombras: Leve (shadow-sm)
```

### Cards Padrão
```
┌─────────────────────────┐
│ 📊 Métrica              │
│ 1.234                   │
│ ↑ 12% vs período anterior│
└─────────────────────────┘
```

### Gráficos
```
- Barras: Recharts <BarChart>
- Linhas: Recharts <LineChart>
- Pizza: Recharts <PieChart>
- Mapa: React Leaflet (opcional)
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Estrutura (Semana 1)
- [ ] Documentar cada seção
- [ ] Definir componentes UI
- [ ] Mapear entidades
- [ ] Planejar queries

### Fase 2: Backend (Semana 2–3)
- [ ] Implementar queries de dados
- [ ] Criar funções IA
- [ ] Validar métricas
- [ ] Testes de dados reais

### Fase 3: Frontend (Semana 3–4)
- [ ] Cards por seção
- [ ] Gráficos
- [ ] Integração com API
- [ ] Responsividade

### Fase 4: IA & Consolidação (Semana 4–5)
- [ ] Implementar análises IA
- [ ] Consolidação editorial
- [ ] Validação automática
- [ ] Exportação PDF

### Fase 5: Dashboards (Semana 5)
- [ ] Integrar cards em dashboards
- [ ] Atualizar automático (cron)
- [ ] Testes de performance
- [ ] Deploy produção

---

## 🚀 CONCLUSÃO

Este documento define a **estrutura completa** do Relatório Editorial Institucional + Dashboards, mantendo:

✅ Layout consolidado  
✅ Dashboards atuais  
✅ Exportação PDF  
✅ Apenas dados reais  
✅ IA integrada  
✅ Expansível (não destrutivo)  

**Próximo passo**: Implementar seção por seção seguindo esta arquitetura.