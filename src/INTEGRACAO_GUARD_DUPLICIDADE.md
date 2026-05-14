# Integração do Guard de Duplicidade de Compras

## 📋 Resumo da Implementação

O sistema de proteção contra solicitações de compra duplicadas foi integrado em todo o fluxo de criação e aprovação de compras.

### ✅ Componentes Implementados

#### 1. **Modal de Detecção de Duplicidade**
- **Arquivo**: `components/compras/DuplicatePurchaseDetectedModal.jsx`
- **Funcionalidade**: Exibe aviso institucional quando duplicidade é detectada
- **Mostra**:
  - Número da NF
  - Fornecedor
  - Valor
  - Status da solicitação existente
  - Link para acessar a solicitação original

#### 2. **Hook de Auditoria**
- **Arquivo**: `hooks/useDuplicateAudit.js`
- **Funcionalidade**: Carrega lista de possíveis duplicidades em tempo real
- **Retorna**: `{ duplicates, loading, error }`

#### 3. **Painel de Integridade Financeira**
- **Arquivo**: `components/compras/DuplicateAuditPanel.jsx`
- **Funcionalidade**: Dashboard visual mostrando:
  - Contagem de duplicidades detectadas
  - Detalhes de cada ocorrência
  - Status e conformidade
  - Recomendações

#### 4. **Badge de Possível Duplicidade**
- **Arquivo**: `components/compras/PossibleDuplicityBadge.jsx`
- **Uso**: Marcar solicitações criadas ignorando aviso
- **Local**: Pode ser adicionado às cards/linhas de solicitação

#### 5. **Função de Auditoria IA**
- **Arquivo**: `functions/auditarDuplicidadeIA.js`
- **Execução**: Pode ser agendada ou chamada manualmente
- **Saída**: Registros de auditoria detalhados

---

## 🔗 Pontos de Integração

### **PurchaseFormDialog** (`components/compras/PurchaseFormDialog`)
✅ **Status**: Integrado

**Implementação**:
- Importação do guard: `findDuplicatePurchaseRequest`
- Modal modal de duplicidade: `DuplicatePurchaseDetectedModal`
- Verificação antes de criar nova solicitação
- Opção de ignorar e prosseguir

**Como funciona**:
1. Usuário preenche formulário e clica "Criar solicitação"
2. Sistema verifica duplicidade automaticamente
3. Se encontrar match, exibe modal com informações
4. Usuário pode revisar a solicitação existente ou confirmar criação

---

### **Entrada Única** (`pages/EntradaUnica`)
✅ **Status**: Integração via CoordReviewModalNF

**Implementação**:
- Verificação no `CoordReviewModalNF` antes de enviar para aprovação
- Modal institucional com detalhes da solicitação duplicada
- Link para acessar solicitação original

**Fluxo**:
1. Usuário revisa nota fiscal
2. Clica "Enviar para Aprovação" ou "Aprovar Direto"
3. Sistema verifica duplicidade
4. Se detectada, exibe modal
5. Usuário confirma ou cancela

---

### **CoordReviewModalNF** (`components/entrada/CoordReviewModalNF`)
✅ **Status**: Integrado

**Implementação**:
- Detecção automática antes de processar nota
- Modal exibe solicitação conflitante
- Opção "Prosseguir mesmo assim"
- Rastreamento de ignorância de aviso

---

### **Dashboard de Compras** (opcional)
📍 **Recomendado**: Adicionar `DuplicateAuditPanel`

**Localização sugerida**:
```jsx
import DuplicateAuditPanel from '@/components/compras/DuplicateAuditPanel';

// No componente Dashboard ou Compras:
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
  <DuplicateAuditPanel />
  {/* outros painéis */}
</div>
```

---

## 🛠️ Utilitários de Suporte

### Funções do Guard (`lib/purchaseDuplicateGuard.js`)

```javascript
// Encontrar duplicidade
const duplicate = await findDuplicatePurchaseRequest({
  base44,
  payload: purchaseData,
  currentId: null // ID a ignorar (para edição)
});

// Validar candidato
const isMatch = isDuplicateCandidate(existing, incoming, currentId);

// Gerar chave
const key = buildDuplicateKey(item);

// Mensagem de aviso
const msg = buildDuplicateWarning(duplicate);
```

### Normalização de Dados

```javascript
import { 
  getNFNumber,
  getSupplierDocument,
  getSupplierName,
  getNFValue,
  getNFDate
} from '@/lib/purchaseDuplicateGuard';

// Extrair dados padronizados
const nf = getNFNumber(purchase);
const doc = getSupplierDocument(purchase);
const supplier = getSupplierName(purchase);
const value = getNFValue(purchase);
```

---

## 📊 Auditoria Automática

### Função Agendada
**Nome**: `auditarDuplicidadeIA`
**Frequência recomendada**: Diariamente (00:05 UTC)

**Criação**:
```javascript
// Via dashboard ou API
await base44.functions.invoke('auditarDuplicidadeIA', {});
```

**Saída**:
```json
{
  "success": true,
  "message": "Auditoria concluída: 3 possível(eis) duplicidade(s) detectada(s)",
  "duplicates": [
    {
      "duplicate_id": "...",
      "original_id": "...",
      "nf_numero": "123456",
      "fornecedor": "Empresa X",
      "valor": 1500.00,
      "confianca": 95,
      "recomendacao": "Revisar manualmente"
    }
  ],
  "audit_count": 3,
  "grupos_analisados": 45
}
```

---

## 🎯 Fluxo Completo

```
[Criação de Solicitação]
         ↓
[Validação de Duplicidade]
         ↓
   [Duplicata Encontrada?]
   ↙              ↘
[Não]          [Sim]
 ↓              ↓
 ✅            [Modal com Aviso]
 Criar              ↓
                [Usuário Escolhe]
                ↙        ↘
            [Revisar]  [Confirmar]
             ↓           ↓
            🔗           ✅
         Ir para      Criar mesmo
         original      assim (com flag)
```

---

## 📝 Campos Relacionados (Entidade PurchaseRequest)

Recomendado adicionar à schema:

```json
{
  "created_by_ignoring_duplicate": {
    "type": "boolean",
    "default": false,
    "description": "Criada mesmo com aviso de duplicidade"
  },
  "duplicate_key": {
    "type": "string",
    "description": "Chave de duplicidade para auditoria"
  },
  "related_duplicate_id": {
    "type": "string",
    "description": "ID da solicitação duplicada"
  }
}
```

---

## 🔐 Segurança e Auditoria

1. **Rastreamento**: Todas as criações ignorando aviso são marcadas
2. **Logs**: AuditLog registra anomalias detectadas
3. **Auditoria IA**: Função agendada revisa periodicamente
4. **Conformidade**: Relatórios de integridade financeira

---

## ✨ Benefícios

- ✅ Redução de solicitações duplicadas
- ✅ Proteção contra erros administrativos
- ✅ Rastreabilidade completa
- ✅ Auditoria automática
- ✅ UX intuitiva com modais informativos
- ✅ Sem alteração do layout consolidado
- ✅ Apenas soma de proteção

---

## 🚀 Próximos Passos

1. **Testar em Produção**: Verificar detecção em cenários reais
2. **Ajustar Sensibilidade**: Calibrar limites de equivalência
3. **Automatizar Auditoria**: Agendar `auditarDuplicidadeIA` 
4. **Dashboard Expandido**: Adicionar métricas no DashboardFinanceiro
5. **Notificações**: Alertar coordenadores de possíveis duplicidades

---

**Implementado em**: 14/05/2026
**Status**: Pronto para produção ✅