# 4 Próximas Etapas Implementadas — Entrada Única

**Status**: ✅ Completo

**Data**: 2026-04-27

---

## 1️⃣ DETECÇÃO DE DUPLICATAS

### Função: `detectNFDuplicates`

Identifica se uma NF já foi processada antes.

```javascript
await base44.functions.invoke('detectNFDuplicates', {
  nf_numero: "12345",
  nf_emitente_cpf_cnpj: "11222333000181",
  nf_valor_total: 1500.00,
  exclude_id: document_id // opcional
});
```

**Retorna**:
```json
{
  "duplicates_found": true,
  "intake_duplicates": [
    {
      "id": "...",
      "file_name": "NF-12345-FORNECEDOR.pdf",
      "status": "approved",
      "tipo": "intake"
    }
  ],
  "approved_duplicates": [
    {
      "id": "...",
      "file_name": "NF-12345.pdf",
      "report_id": "...",
      "tipo": "approved"
    }
  ],
  "confidence": "HIGH"
}
```

**Estratégia de Busca**:
1. **Exato**: NF número + CNPJ + valor (idêntico) = ALTA PROBABILIDADE
2. **Provável**: NF número + CNPJ (mesmo valor ±0.01) = MÉDIA PROBABILIDADE
3. Busca em 2 locais: `DocumentIntake` (pendente) + `Attachment` (aprovado)

**Uso na Interface**:
- Modal de revisão mostra aviso se duplicata detectada
- Usuário pode optar por:
  - ✅ Continuar (novo processamento)
  - 🔗 Vincular à NF anterior (merge)
  - ❌ Descartar

---

## 2️⃣ PERMISSÕES GRANULARES

### Função: `checkDocumentPermissions`

Valida se usuário pode fazer ação em documento.

```javascript
await base44.functions.invoke('checkDocumentPermissions', {
  document_id: "abc123",
  action: "approve" // view | edit | approve | delete | reclassify | reprocess
});
```

**Retorna**:
```json
{
  "has_permission": true,
  "user_role": "admin",
  "document_status": "pronto_para_aprovacao",
  "permissions_breakdown": {
    "view": true,
    "edit": false,
    "approve": true,
    "delete": false,
    "reclassify": false,
    "reprocess": true
  },
  "reason": null
}
```

**Matriz de Permissões**:

| Ação | Admin | Coordenador | Proprietário |
|------|-------|-------------|--------------|
| **view** | ✅ | ✅ (se pode ver todos) | ✅ |
| **edit** | ✅ | ✅ (se status revisar/rejeitado) | ✅ (se draft/pendente) |
| **approve** | ✅ | ✅ (se autorizado + status pronto) | ❌ |
| **delete** | ✅ | ✅ (com perms gerir) | ✅ (se draft/pendente) |
| **reclassify** | ✅ | ✅ (se pode gerir) | ❌ |
| **reprocess** | ✅ | ✅ (se pode gerir) | ❌ |

**Auditoria**:
- Toda negação de permissão é registrada em `AuditLog`
- Campo `PERMISSION_DENIED` com detalhes

---

## 3️⃣ IDEMPOTÊNCIA

### Função: `processDocumentIdempotent`

Garante que operações não são executadas 2x.

```javascript
const idempotencyKey = `approve_${document_id}_${user_id}_${timestamp}`;

await base44.functions.invoke('processDocumentIdempotent', {
  document_id: "abc123",
  action: "approve",
  idempotency_key: idempotencyKey
});
```

**Retorna (primeira vez)**:
```json
{
  "status": "success",
  "action": "approve",
  "result": { "approved": true, "timestamp": "..." },
  "execution_time_ms": 234,
  "idempotency_key_hash": "abc123def456..."
}
```

**Retorna (segunda chamada idêntica)**:
```json
{
  "status": "already_processed",
  "previous_result": { "approved": true, "timestamp": "..." },
  "message": "Esta operação já foi executada. Retornando resultado anterior."
}
```

**Ações Idempotentes**:
- `approve` — ✅ Idempotente
- `reject` — ✅ Idempotente
- `delete` — ✅ Idempotente
- `reprocess` — ✅ Idempotente

**Implementação**:
1. Frontend gera `idempotency_key` único
2. Backend gera hash SHA-256
3. Verifica se já processado → retorna resultado anterior
4. Se novo: executa ação + salva hash
5. Proximas tentativas com mesma chave → resultado anterior

**Proteção contra**:
- ✅ Double-submit (clique acidental 2x)
- ✅ Network retry (timeout → retry)
- ✅ Page reload durante processamento
- ✅ WebSocket desconexão

---

## 4️⃣ PAINEL DE MONITORAMENTO

### Componente: `DocumentMonitoringDashboard`

Dashboard em tempo real com métricas do sistema.

**Localização**: Aba "Monitoramento" na página EntradaUnica

**Métricas em Tempo Real**:

```
┌─────────────────────────────────────────────────┐
│ 📊 ENTRADA ÚNICA — MONITORAMENTO LIVE            │
├─────────────────────────────────────────────────┤
│                                                   │
│  Total de Documentos: 1.245                      │
│  Em Processamento: 23                            │
│  Aprovados Hoje: 87                              │
│  Tempo Médio: 4.2 minutos                        │
│                                                   │
│  ⚠️  Duplicatas Detectadas Hoje: 5              │
│  🔴 Acessos Negados Hoje: 12                    │
│                                                   │
│ ┌─────────────────────────────────────────────┐  │
│ │ Timeline de Operações (últimas 24h)         │  │
│ │ [Gráfico de linha: operações por hora]      │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ ┌─────────────────────────────────────────────┐  │
│ │ Status Distribution                          │  │
│ │ ✅ Aprovados: 234                            │  │
│ │ 🔄 Processando: 23                           │  │
│ │ ⏳ Pendentes: 45                             │  │
│ │ ❌ Rejeitados: 12                            │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ ┌─────────────────────────────────────────────┐  │
│ │ Documentos Recentes                          │  │
│ │ [Lista das 10 últimas operações]            │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
└─────────────────────────────────────────────────┘
```

**Cards de Métrica**:

1. **Total de Documentos** 🔢
   - Todos documentos processados
   - Atualiza em tempo real

2. **Em Processamento** ⏳
   - Docs com status "processing"
   - Mostra fila de IA

3. **Aprovados Hoje** ✅
   - Aprovações das últimas 24h
   - Métrica de produtividade

4. **Tempo Médio** ⏱️
   - Minutos do upload à aprovação
   - Mede performance

5. **Duplicatas Detectadas** ⚠️
   - Quantas duplicadas encontradas hoje
   - Previne reprocessamento

6. **Acessos Negados** 🔴
   - Tentativas de acesso não autorizado
   - Indica segurança

**Gráficos**:

- **Timeline**: Operações por hora (últimas 24h)
- **Status Distribution**: Pizza/barras de status
- **Recentes**: Tabela com últimas 10 operações

**Atualização**:
- ⚡ Automática a cada 30 segundos
- 📱 Suporta mobile
- 🔄 Mantém estado entre abas

---

## 🔗 Fluxo Integrado

### Cenário Completo

```
1. USER UPLOAD
   └─> NF-12345-FORNECEDOR.pdf
   
2. DETECÇÃO DE DUPLICATAS
   └─> detectNFDuplicates invocado
   └─> Encontrada 1 duplicata (status: rejeitado)
   └─> Modal avisa "Esta NF já foi processada antes"
   
3. PERMISSÕES
   └─> checkDocumentPermissions invocado
   └─> User é "Profissional" → pode EDIT/DELETE apenas
   └─> Coordenador vê botão APPROVE habilitado
   
4. IDEMPOTÊNCIA
   └─> User clica "Aprovar"
   └─> idempotency_key gerado: approve_${docId}_${userId}_${now}
   └─> processDocumentIdempotent invocado
   └─> Primeira execução: executa e salva resultado
   └─> User clica outra vez por acidente
   └─> Segunda execução: retorna resultado anterior (sem reprocessar)
   
5. MONITORAMENTO
   └─> Dashboard atualiza em tempo real
   └─> Métrica "Aprovados Hoje" sobe de 86 para 87
   └─> Timeline vê pico de atividade na hora atual
   └─> Auditlog registra: DOCUMENT_APPROVE (user, doc, timestamp)
```

---

## 🎯 Casos de Uso

### Caso 1: Usuário envia NF duplicada

```
User: Upload de NF-12345
  ↓
Sistema: Detecta que NF-12345 já foi processada
  ↓
Modal: "⚠️ Esta NF já foi processada em 14 de Abr"
       [Ver original] [Continuar assim mesmo] [Cancelar]
  ↓
User: Clica [Ver original]
  ↓
Link abre documento anterior
```

### Caso 2: Coordenador aprova documento

```
Coord: Clica "Aprovar"
  ↓
Sistema: 
  - checkDocumentPermissions ✅ (Coordenador pode aprovar)
  - processDocumentIdempotent (idempotency_key novo)
  - Documento é aprovado
  
Coord: Clica acidentalmente "Aprovar" novamente
  ↓
Sistema:
  - checkDocumentPermissions ✅ (ainda ok)
  - processDocumentIdempotent (MESMA chave)
  - Retorna: "Já aprovado em 27 de Abr às 14:23"
  - Não reprocessa
```

### Caso 3: Monitoramento detecta anomalia

```
Dashboard mostra:
  - Fila processamento: 150 docs (anomalia!)
  - Acessos negados: 45 hoje (anomalia!)
  
Admin vê alertas e investiga:
  - Função classifyAndRouteDocument com erro
  - Ativa manual review
```

---

## 📈 Benefícios

| Área | Benefício |
|------|-----------|
| **Detecção de Duplicatas** | Evita reprocessamento de NFs, economiza créditos IA, garante unicidade |
| **Permissões Granulares** | Segurança por papel, auditoria completa, compliance |
| **Idempotência** | Sem efeitos colaterais de retry, experiência UX confiável |
| **Monitoramento** | Visibilidade total, alertas de problemas, otimização de performance |

---

## 🚀 Tecnologias

- **Backend**: Deno + @base44/sdk
- **Frontend**: React + Recharts (gráficos)
- **Banco**: DocumentIntake + AuditLog + Attachment
- **Segurança**: SHA-256 (idempotência), RBAC (permissões)

---

## 📝 Próximos Passos

- [ ] Alertas por email em anomalias
- [ ] Export de métricas (CSV/PDF)
- [ ] Webhook para integração com Slack
- [ ] Machine Learning para detecção de padrões

---

**Última atualização**: 2026-04-27

**Status**: Pronto para uso