# Processamento de Nota Fiscal com IA Múltipla — Claude, Gemini, GPT

**Status**: ✅ Implementado

**Data**: 2026-04-27

**Objetivo**: Processar notas fiscais com Claude (modelo preferido) e fallbacks automáticos para Gemini e GPT-4o

---

## 🎯 Funcionalidades

### ✅ 1. Processamento com Claude (Padrão)

**Função**: `processarNotaFiscalComClaude`

**Modelo**: Claude Sonnet 4.6 (mais preciso e poderoso)

**Capacidades**:
- ✅ Extração completa de dados NF
- ✅ Detecção de inconsistências reais
- ✅ Análise de risco de duplicação
- ✅ Sugestão de rubrica com justificativa
- ✅ Score de confiabilidade (0-100)
- ✅ Resposta em JSON estruturado

### ✅ 2. Fallback Automático: Gemini 3.1 Pro

**Modelo**: Google Gemini 3.1 Pro (rápido, preciso)

**Quando ativa**:
- Claude falha (timeout, erro de API)
- Usuário especifica `modelo: 'gemini'`

### ✅ 3. Fallback Final: GPT-4o

**Modelo**: OpenAI GPT-4o Turbo (compatibilidade)

**Quando ativa**:
- Claude E Gemini falham
- Usuário especifica `modelo: 'gpt'`

---

## 🚀 Como Usar

### Frontend (EntradaUnica.jsx)

Chamar a função com modelo preferido:

```javascript
// Opção 1: Deixar usar Claude (padrão)
await base44.functions.invoke('processarNotaFiscalComClaude', {
  intake_id: documentIntake.id,
  file_url: documentIntake.arquivo_original_url,
  orientacoes_usuario: '',
  modelo: 'claude' // opcional, padrão é claude
});

// Opção 2: Forçar Gemini
await base44.functions.invoke('processarNotaFiscalComClaude', {
  intake_id: documentIntake.id,
  file_url: documentIntake.arquivo_original_url,
  orientacoes_usuario: '',
  modelo: 'gemini'
});

// Opção 3: Forçar GPT
await base44.functions.invoke('processarNotaFiscalComClaude', {
  intake_id: documentIntake.id,
  file_url: documentIntake.arquivo_original_url,
  orientacoes_usuario: '',
  modelo: 'gpt'
});
```

### Payload da Resposta

```json
{
  "ok": true,
  "intake_id": "doc-123",
  "tipo_detectado": "NOTA_FISCAL_PDF",
  "modelo_utilizado": "claude_sonnet_4_6",
  "score_confiabilidade": 95,
  "resultado_ia": {
    "eh_nota_fiscal": true,
    "nf_numero": "12345",
    "nf_valor_total": "1500.00",
    "nf_data_emissao": "2026-04-25",
    "nf_emitente_nome": "FORNECEDOR LTDA",
    "nf_emitente_cpf_cnpj": "12345678000100",
    "nf_destinatario_nome": "MUSEUS CENTRO",
    "descricao_servico": "Serviço de comunicação - design gráfico",
    "municipio": "São Paulo",
    "competencia": "Abril/2026",
    "tipo_servico": "Serviço",
    "categoria_sugerida": "Serviços de comunicação: designer, foto, vídeo",
    "inconsistencias": [],
    "avisos": [],
    "risco_duplicacao": "baixo",
    "score_confiabilidade": 95,
    "justificativa_rubrica": "Serviço de design gráfico → Comunicação",
    "modelo_ia_utilizado": "claude_sonnet_4_6"
  },
  "file_name_final": "12345 - FORNECEDOR LTDA - MUSEUS CENTRO - R$ 1.500,00.pdf",
  "erros_encontrados": []
}
```

---

## 🔄 Fluxo de Fallback

```
Processamento de Nota Fiscal
    ↓
[1] Tenta Claude Sonnet 4.6
    ✅ Sucesso? → Retorna resultado (Claude)
    ❌ Falha? → Tenta próximo
    ↓
[2] Tenta Gemini 3.1 Pro
    ✅ Sucesso? → Retorna resultado (Gemini)
    ❌ Falha? → Tenta próximo
    ↓
[3] Tenta GPT-4o
    ✅ Sucesso? → Retorna resultado (GPT)
    ❌ Falha? → Erro: nenhum modelo funcionou
    ↓
Salva DocumentIntake com status: ERRO_PROCESSAMENTO
```

---

## 📊 Comparação de Modelos

| Aspecto | Claude 4.6 | Gemini 3.1 | GPT-4o |
|---------|-----------|-----------|--------|
| **Precisão** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Velocidade** | ⚡⚡⚡⚡ | ⚡⚡⚡⚡⚡ | ⚡⚡⚡ |
| **Visão (PDF/IMG)** | ✅ Excelente | ✅ Excelente | ✅ Bom |
| **Custo** | 💰 Médio | 💰 Baixo | 💰 Médio |
| **Fallback** | Primário | Secundário | Terciário |

---

## 🔐 Segurança & Auditoria

### Log de Auditoria

Toda execução registra:

```json
{
  "action": "UPDATE",
  "entity_type": "DOCUMENT_INTAKE",
  "entity_id": "doc-123",
  "actor_email": "user@museus.org.br",
  "actor_name": "João Silva",
  "details": "Documento processado com IA: claude_sonnet_4_6. Tipo: NOTA_FISCAL_PDF. Score confiabilidade: 95%",
  "created_at": "2026-04-27T10:30:00Z"
}
```

### Proteção

- ✅ CPF/CNPJ nunca armazenado em logs
- ✅ Valores monetários armazenados com precisão
- ✅ Datas sempre em formato ISO (YYYY-MM-DD)
- ✅ Modelos usados registrados para auditoria

---

## 📋 Campos Retornados

### Obrigatórios

- `eh_nota_fiscal` — boolean
- `nf_numero` — string
- `nf_valor_total` — string (formato: "1234.56")
- `nf_data_emissao` — string (YYYY-MM-DD)
- `nf_emitente_nome` — string
- `nf_emitente_cpf_cnpj` — string (apenas dígitos)

### Adicionais

- `nf_destinatario_nome` — Museu Centro / tomador
- `descricao_servico` — O que é o serviço/produto
- `municipio` — Cidade de emissão
- `competencia` — Mês/ano de referência
- `tipo_servico` — "Serviço" | "Produto" | "Manutenção" | etc
- `categoria_sugerida` — Categoria para rubricação

### Validação

- `inconsistencias` — array de problemas críticos
- `avisos` — array de avisos não-críticos
- `risco_duplicacao` — "baixo" | "médio" | "alto"
- `score_confiabilidade` — 0-100 (qualidade da leitura)
- `justificativa_rubrica` — Por que sugere esta rubrica

---

## ⚙️ Integração com ReviewModalNF

A função atual em `ReviewModalNF` pode usar esta nova função automaticamente:

### Opção 1: Substituir Função

Em `classifyAndRouteDocument`, trocar PDF/NF para usar:

```javascript
// Antes (em classifyAndRouteDocument)
const iaResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
  prompt: `...`,
  file_urls: [fileUrl]
});

// Depois (nova função)
const iaResp = await base44.functions.invoke('processarNotaFiscalComClaude', {
  intake_id: intakeId,
  file_url: fileUrl,
  orientacoes_usuario: orientacoesUsuario,
  modelo: 'claude' // sempre Claude, com fallbacks
});
```

### Opção 2: Adicionar Botão "Reprocessar com Melhor IA"

Em `ReviewModalNF`, adicionar botão:

```jsx
<Button 
  variant="outline" 
  onClick={async () => {
    setReprocessing(true);
    try {
      const result = await base44.functions.invoke('processarNotaFiscalComClaude', {
        intake_id: intake.id,
        file_url: intake.arquivo_original_url,
        orientacoes_usuario: 'Usar Claude para máxima precisão',
        modelo: 'claude'
      });
      // Atualizar resultado_ia no intake
      await loadIntakes();
    } finally {
      setReprocessing(false);
    }
  }}
>
  🧠 Reprocessar com IA Melhorada
</Button>
```

---

## 🛠️ Troubleshooting

### ❌ Erro: "Nenhum modelo de IA conseguiu processar"

**Causa**: Todos os 3 modelos (Claude, Gemini, GPT) falharam

**Solução**:
1. Verificar conexão com internet
2. Verificar se arquivo é PDF/XML válido
3. Verificar limites de rate-limit das APIs
4. Tentar novamente em alguns minutos

### ❌ Erro: "score_confiabilidade baixo (< 50%)"

**Causa**: IA não conseguiu extrair dados suficientes

**Solução**:
1. Arquivo pode estar danificado ou ilegível
2. Documento pode não ser uma NF válida
3. Tentar com melhor qualidade de scan

### ⚠️ Aviso: "Risco de duplicação: alto"

**Causa**: IA detectou padrão similar a outra NF

**Ação**:
1. Usuário deve revisar manualmente
2. Verificar se número da NF já existe
3. Deletar uma se confirmada duplicação

---

## 📈 Performance

| Métrica | Esperado |
|---------|----------|
| Tempo médio (Claude) | 3-5 segundos |
| Tempo médio (Gemini) | 2-4 segundos |
| Tempo máximo (com fallback) | 15 segundos |
| Taxa de sucesso | > 98% |
| Taxa de fallback | ~2-5% |

---

## 🔮 Futuras Melhorias

- [ ] Comparação cruzada de resultados (quando modelos diferem)
- [ ] Ranking de confiabilidade por modelo
- [ ] Machine learning para aprender padrões de NF duplicadas
- [ ] Integração com API de validação fiscal SEFAZ
- [ ] Extração de XML paralela (se NF-e)
- [ ] Histórico de processamentos por documento

---

**Última atualização**: 2026-04-27

**Status**: Pronto para produção

---