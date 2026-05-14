# Inteligência Editorial Sociológica — Relatórios Institucionais

## 🎯 Objetivo

Expandir a inteligência editorial dos relatórios institucionais incorporando, de forma elegante e coerente, referências metodológicas ligadas à **sociologia da cultura**, **participação social**, **mediação cultural** e **percepção territorial**.

---

## ✅ Princípios Fundamentais

### O que É Incorporado
✅ Linguagem sociológica natural e elegante  
✅ Fortalecimento da leitura institucional  
✅ Valorização de participação e território  
✅ Destaque de escuta e construção coletiva  
✅ Evidência de mediação cultural  
✅ Conexão entre ações e desenvolvimento social  

### O que NÃO É Feito
❌ Transformação em texto acadêmico  
❌ Linguagem artificial ou forçada  
❌ Inserção de teoria sem relação com ações reais  
❌ Invenção de metodologia inexistente  
❌ Jargão acadêmico em excesso  
❌ Dados não verificados nos registros  

---

## 📊 Dimensões Sociológicas Identificáveis

### 1. **Participação Social**
- Envolvimento ativo de comunidades e públicos
- Construção conjunta dos processos
- Protagonismo compartilhado
- Múltiplas vozes e perspectivas representadas

**Indicadores nos dados:**
- `publico_total > 0`
- `quantas_repeticoes > 1`
- `parceria === 'Sim'`

**Exemplo de linguagem:**
> "As atividades realizadas no período ampliaram experiências de participação social, consolidando espaços de construção coletiva com os públicos participantes."

---

### 2. **Mediação Cultural**
- Facilitação entre públicos e conhecimento
- Práticas educativas que fortalecem experiências
- Escuta e validação de saberes diversos
- Espaços de diálogo e troca

**Indicadores nos dados:**
- Tipo de atividade: Oficina, Palestra, Workshop, Encontro, Roda de Conversa
- `equipe_responsavel` presente
- Foco educativo/formativo

**Exemplo de linguagem:**
> "Os processos educativos de mediação cultural consolidaram ações de escuta e interação com os públicos, reforçando a função educativa da instituição."

---

### 3. **Dimensão Territorial**
- Compreensão de contextos e dinâmicas locais
- Apropriação de espaços culturais e públicos
- Vínculo com comunidades vizinhas
- Desenvolvimento territorial através da cultura

**Indicadores nos dados:**
- `local` presente
- `eh_mobilizacao === true`
- `parceiro_nome` com referência local

**Exemplo de linguagem:**
> "A escuta territorial e a apropriação dos espaços reforçaram o vínculo entre os públicos e os museus, consolidando a dimensão cultural do desenvolvimento local."

---

### 4. **Escuta e Percepção**
- Coleta de feedback e observações
- Registros de vivências e impressões
- Diálogo contínuo com comunidades
- Integração de percepções na avaliação

**Indicadores nos dados:**
- `observacoes` preenchidas
- `comentarios_gerais` presentes
- Atividades com avaliação participativa

**Exemplo de linguagem:**
> "Processos de escuta evidenciaram as percepções e experiências dos participantes, consolidando práticas de valorização das vozes comunitárias."

---

### 5. **Produção de Memória**
- Documentação visual e textual
- Construção de acervo institucional
- Patrimônio como ferramenta de aprendizagem
- Preservação de vivências

**Indicadores nos dados:**
- `fotos` com quantidade > 0
- `documentos` anexados
- `titulo` descritivo

**Exemplo de linguagem:**
> "A produção de registros visuais e documentais consolidou memória do período, evidenciando as apropriações dos espaços e as vivências compartilhadas."

---

### 6. **Construção Coletiva**
- Articulação entre equipes e museus
- Parcerias com comunidades e instituições
- Integração de saberes diversos
- Atuação institucional coordenada

**Indicadores nos dados:**
- `houve_contratacoes === true`
- `numero_empresas > 0`
- `parceria === 'Sim'`

**Exemplo de linguagem:**
> "O trabalho colaborativo das equipes evidenciou articulação institucional, consolidando atuação conjunta e integrada para fortalecimento cultural."

---

## 🛠️ Ferramentas Implementadas

### 1. **Análise de Dimensões Sociológicas**
**Função:** `analisarDimensoesSociologicas`  
**Localização:** `functions/analisarDimensoesSociologicas.js`

Detecta automaticamente padrões sociológicos nos dados de atividades:
- Mapeia evidências por dimensão
- Calcula intensidade geral
- Gera introdução contextual
- Produz observações institucionais

**Uso:**
```javascript
const resultado = await base44.functions.invoke('analisarDimensoesSociologicas', {
  reportId: '...',
  atividades: [...],
  mes: 'Maio',
  ano: 2026,
  museu: 'MHAB',
  equipe: 'Educativo'
});
```

---

### 2. **Enriquecimento com Linguagem Sociológica**
**Função:** `enriquecerComLenguagemSociologica`  
**Localização:** `functions/enriquecerComLenguagemSociologica.js`

Gera frases e narrativas contextualizadas:
- Síntese integrada das atividades
- Narrativas por atividade destacada
- Linguagem variada e elegante
- Incorporação de padrões detectados

**Uso:**
```javascript
const resultado = await base44.functions.invoke('enriquecerComLenguagemSociologica', {
  reportId: '...',
  atividades: [...],
  patterns: {...}
});
```

---

### 3. **Componentes de Análise em Tempo Real**

#### `SociologicalAnalysisPanel`
- **Arquivo:** `components/reports/SociologicalAnalysisPanel.jsx`
- **Função:** Detectar dimensões e gerar introdução contextual
- **Localização:** Aba de Atividades do Relatório

#### `SociologicalLanguageEnhancer`
- **Arquivo:** `components/reports/SociologicalLanguageEnhancer.jsx`
- **Função:** Enriquecer narrativas com linguagem sociológica
- **Localização:** Seção de Inteligência Editorial

#### `SociologicalMethodologyGuide`
- **Arquivo:** `components/help/SociologicalMethodologyGuide.jsx`
- **Função:** Documentação visual e exemplos de linguagem
- **Localização:** Manual de Ajuda

---

## 🔄 Fluxo de Trabalho do Editor

### 1. **Editar Atividades**
→ Adicionar/editar atividades na aba "Atividades"

### 2. **Analisar Dimensões** (Novo)
→ Clique em "Analisar Dimensões" no painel superior
→ Sistema detecta padrões sociológicos
→ Gera introdução contextual automática

### 3. **Enriquecer Linguagem** (Novo)
→ Clique em "Enriquecer Linguagem" na seção Editorial
→ Sistema gera frases e narrativas
→ Escolha aplicar síntese ou frases isoladas

### 4. **Revisar e Integrar**
→ Copiar textos gerados
→ Integrar ao resumo executivo/comentários
→ Personalizar conforme necessário

### 5. **Validar Confiança**
→ Tab "Validação" executa verificação de integridade
→ Sistema valida apenas dados reais documentados

### 6. **Exportar PDF**
→ Antes de exportar: validação automática
→ PDF contém narrativa enriquecida e coerente

---

## 📋 Exemplos de Narrativas Geradas

### Exemplo 1 — Relatório com Alta Participação
**Análise detectada:** Participação (5), Mediação (3), Memória (2), Coletividade (4)

**Introdução gerada:**
> "No período de Maio de 2026, as ações desenvolvidas no MHAB refletiram processos de encontro, aprendizagem e participação cultural. Destacaram-se: abertura para participação e construção coletiva dos públicos, processos educativos de mediação cultural e formação, produção de memória através de registros e documentação, articulação institucional e trabalho colaborativo entre equipes. Este relatório expressa a dimensão social, cultural e territorial do trabalho realizado, sinalizando o compromisso institucional com participação, escuta e fortalecimento comunitário."

---

### Exemplo 2 — Síntese com Múltiplas Dimensões
**Síntese linguística gerada:**
> "As atividades realizadas no período reuniram aproximadamente 350 participantes em processos de participação social, consolidaram 3 processos educativos de mediação cultural e escuta, evidenciaram produção compartilhada de memória através de documentação, e refletiram trabalho colaborativo das equipes, demonstrando articulação institucional coordenada e reforçando o compromisso com fortalecimento cultural e desenvolvimento territorial."

---

### Exemplo 3 — Narrativas por Atividade
**Para atividade "Oficina de Fotografia Participativa":**
> "A oficina consolidou práticas de mediação cultural e educação, reunindo participantes em construção coletiva do conhecimento visual, ampliando experiências de participação social e apropriação territorial, com significativa produção de registros visuais que consolidam memória institucional."

---

## 🔍 Validação de Qualidade

### Critérios Aplicados

✓ **Coerência com dados**
- Dimensões mencionadas têm evidências nos registros
- Estatísticas (participantes, atividades) são verificadas
- Nenhuma metodologia é inventada

✓ **Elegância institucional**
- Linguagem sofisticada sem academicismo excessivo
- Tom profissional e respeitoso
- Conecta ações com valores institucionais

✓ **Humanização do relato**
- Valoriza contribuições das equipes
- Destaca voz e perspectiva comunitária
- Evidencia aprendizados compartilhados

✓ **Cobertura equilibrada**
- Referências sociológicas integradas naturalmente
- Não domina a narrativa principal
- Contextualiza, não teoriza

---

## 🎨 Linguagem Padrão Por Dimensão

### Participação
- "ampliando experiências de participação social"
- "consolidando espaços de construção coletiva"
- "promovendo protagonismo dos participantes"
- "envolvimento ativo de comunidades"

### Mediação Cultural
- "práticas de mediação cultural e educação"
- "processos educativos de interação e aprendizagem"
- "consolidando espaços de diálogo e escuta"
- "reforçando a função educativa"

### Território
- "considerando a escuta territorial"
- "com dimensão territorial e pertencimento"
- "apropriação dos espaços culturais"
- "desenvolvimento territorial através da cultura"

### Memória
- "produção de registros visuais e documentais"
- "consolidando memória através de documentação"
- "evidenciando apropriação dos espaços"
- "construção colaborativa da memória"

### Coletividade
- "trabalho colaborativo das equipes"
- "articulação institucional integrada"
- "atuação conjunta entre museus"
- "consolidação de rede colaborativa"

---

## 🚀 Automações

### Automação 1: Validação ao Submeter
- **Gatilho:** Status do relatório muda para `SUBMITTED`
- **Ação:** Executa `revisarRelatorioAntesExportPDF`
- **Resultado:** Garante qualidade antes de envio

### Automação 2: Análise Sociológica
- **Gatilho:** Status do relatório muda para `SUBMITTED`
- **Ação:** Executa `analisarDimensoesSociologicas`
- **Resultado:** Documenta dimensões detectadas

---

## 📚 Referências Teóricas (Para Contexto)

As metodologias incorporadas se fundamentam em:
- **Sociologia da Cultura** — Bourdieu, Freidson, Peterson
- **Mediação Cultural** — Vygotsky, Freire
- **Educação Patrimonial** — Horta, Grunberg
- **Participação Social** — Santos, Gohn
- **Memória Social** — Halbwachs, Nora
- **Desenvolvimento Territorial** — Brandão, Buarque

*Nota: Estas referências informam a abordagem, mas não aparecem nos relatórios.*

---

## ✨ Resultado Final

Relatórios mais sofisticados que:
- ✓ Refletem dimensão cultural, social e territorial
- ✓ Valorizam participação e construção coletiva
- ✓ Destacam escuta e mediação cultural
- ✓ Conectam ações com desenvolvimento social
- ✓ Humanizam narrativa institucional
- ✓ Mantêm rigor e validação de dados
- ✓ Comunicam profundidade sem academicismo

---

**Versão:** 1.0  
**Data:** Maio de 2026  
**Status:** Implementado e Ativo