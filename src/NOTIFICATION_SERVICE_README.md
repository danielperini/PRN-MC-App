# Módulo Central de Comunicação - NotificationService

## Visão Geral

Este módulo centraliza **todas as notificações do sistema**, fornecendo uma camada de abstração para envio de emails, preparada para múltiplos canais e provedores.

---

## Estrutura

```
services/notifications/
├── NotificationService.js          # Serviço principal
├── EmailProvider.js                # Provedor de email abstrato
└── templates/
    └── PurchaseNotificationTemplate.js  # Templates de compras
```

---

## Uso

### Enviar Notificação

```javascript
import { NotificationService, NotificationChannel } from '@/services/notifications/NotificationService';

// Enviar email
await NotificationService.send({
  channel: NotificationChannel.EMAIL,
  type: 'PURCHASE_DIGEST',
  recipients: ['email@exemplo.com'],
  data: { items: [...], batchSlot: 'manha' },
  entityType: 'PurchaseRequest',
  entityId: '123'
});
```

### Canais Suportados

- `EMAIL` - Implementado (Base44 SendEmail)
- `WHATSAPP` - Preparado (não implementado)
- `TELEGRAM` - Preparado (não implementado)

---

## Entidades

### NotificationQueue (existente: PurchaseNotificationQueue)

Armazena notificações pendentes de envio.

**Campos principais:**
- `purchase_id` - ID da solicitação
- `status` - pendente_lote, enviado, erro, cancelado
- `batch_slot` - manha (09:30) ou tarde (16:45)
- `batch_scheduled_at` - Data/hora agendada
- `sent_at` - Data/hora do envio
- `digest_id` - ID do lote consolidado

### NotificationLog (nova)

Registra histórico de todos os envios.

**Campos principais:**
- `notification_type` - Tipo da notificação
- `channel` - EMAIL, WHATSAPP, TELEGRAM
- `recipients` - Lista de destinatários
- `status` - PENDING, SENT, FAILED, etc.
- `provider` - base44_sendemail, resend, ses, etc.
- `error_message` - Erro, se houver
- `sent_at` - Data/hora do envio

---

## Templates

### PurchaseNotificationTemplate

Centraliza templates de emails de compras.

**Tipos:**
- `PURCHASE_DIGEST` - Lote consolidado
- `PURCHASE_APPROVED` - Aprovação individual (legado)
- `PURCHASE_RETURNED` - Devolução (legado)

**Personalização:**
- Agrupamento por centro de custo
- Links para NF, XML, Comprovante (sem anexos)
- Resumo do lote (quantidade, valor total)
- Identidade visual padrão do sistema

---

## Destinatários Fixos (Compras)

```javascript
[
  'adm@viadutodasartes.org.br',
  'notasfiscais@viadutodasartes.org.br',
  'danielperini.mc@viadutodasartes.org.br',
  'daniel@periniprojetos.com.br'
]
```

**Correções automáticas:**
- `danielperine` → `danielperini`
- `perineprojetos` → `periniprojetos`

---

## Lotes Agendados

**Horários (UTC-3 / São Paulo):**
- **Manhã:** 09:30 (segunda a sexta)
- **Tarde:** 16:45 (segunda a sexta)

**Automações:**
- `NotificacaoCompras Lote Manha` - 09:30
- `NotificacaoCompras Lote Tarde` - 16:45

---

## Fluxo de Notificação

```
1. Usuário clica em "Enviar Notificação"
   ↓
2. Sistema verifica se já está na fila
   ↓
3. Se NÃO: cria registro em PurchaseNotificationQueue
   ↓
4. Aguarda próximo lote (09:30 ou 16:45)
   ↓
5. sendPurchaseNotificationDigest processa fila
   ↓
6. NotificationService.send() envia email
   ↓
7. EmailProvider.send() usa Base44 SendEmail
   ↓
8. NotificationLog registra histórico
   ↓
9. Atualiza status para "enviado"
```

---

## Reenvio de Lotes

**Componente:** `ResendNotificationBatch`

- Botão "Reenviar Compilado"
- Cria novo registro na fila (não duplica)
- Reenvia último lote enviado do slot

**Função:** `reenviarLoteNotificacoes`

- Apenas administradores
- Reage itens do último digest_id
- Respeita horários de lote

---

## Histórico de Notificações

**Componente:** `NotificationHistoryPanel`

- Visualiza todos os logs
- Filtros: Todos, Enviados, Falhas
- Exibe: data, tipo, canal, destinatários, status, provedor, erro

---

## Futura Compatibilidade

### Migrar para Resend

1. Implementar `EmailProvider._sendViaResend()`
2. Alterar `CURRENT_PROVIDER` para `'resend'`
3. Configurar `RESEND_API_KEY` nas secrets

```javascript
// Exemplo de implementação
async _sendViaResend({ to, subject, body, from_name }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${from_name} <noreply@viadutodasartes.org.br>`,
      to: [to],
      subject,
      html: body,
    }),
  });
  return res.json();
}
```

### Migrar para Amazon SES

1. Implementar `EmailProvider._sendViaSES()`
2. Alterar `CURRENT_PROVIDER` para `'ses'`
3. Configurar credenciais AWS

---

## Regras de Negócio

### Não Enviar Imediato

- **Sempre** usar fila
- **Nunca** enviar email direto de componentes
- **Sempre** passar por `NotificationService.send()`

### Não Duplicar

- Verificar se já existe na fila antes de adicionar
- Reenvio cria novo registro, não duplica enviados

### Não Anexar Arquivos

- Lotes podem conter dezenas de solicitações
- Inserir apenas **links** para:
  - `drive_backup_nf_pdf_link`
  - `drive_backup_nf_xml_link`
  - `comprovante_url`

---

## Logs e Auditoria

Todo envio é registrado em `NotificationLog`:

- Quem solicitou
- Quando entrou na fila
- Quando foi enviado
- Tempo de envio
- Destinatários
- Provedor utilizado
- Resultado (sucesso/erro)

---

## Componentes UI

### ResendNotificationBatch

```jsx
import ResendNotificationBatch from '@/components/notifications/ResendNotificationBatch';

<ResendNotificationBatch 
  batchSlot="manha"
  onSuccess={() => toast.success('Reenviado!')}
/>
```

### NotificationHistoryPanel

```jsx
import NotificationHistoryPanel from '@/components/notifications/NotificationHistoryPanel';

<NotificationHistoryPanel />
```

---

## Funções Backend

### sendPurchaseNotificationDigest

- Processa lotes agendados
- Usa `NotificationService.send()`
- Atualiza status na fila
- Registra em `NotificationLog`

### enqueuePurchaseNotification

- Adiciona solicitação à fila
- Calcula próximo slot automaticamente
- Evita duplicações

### reenviarLoteNotificacoes

- Reenvia último lote do slot
- Apenas administradores
- Cria novos registros na fila

---

## Manutenção

### Adicionar Novo Template

1. Criar template em `services/notifications/templates/`
2. Registrar em `NotificationService`
3. Usar em `NotificationService.send()`

### Adicionar Novo Canal

1. Adicionar em `NotificationChannel`
2. Implementar lógica em `NotificationService.send()`
3. Criar provider específico se necessário

### Adicionar Novo Provedor de Email

1. Implementar método em `EmailProvider`
2. Alterar `CURRENT_PROVIDER`
3. Configurar credenciais

---

## Status

- ✅ NotificationService - Implementado
- ✅ EmailProvider - Implementado (Base44 SendEmail)
- ✅ PurchaseNotificationTemplate - Implementado
- ✅ PurchaseNotificationQueue - Existente
- ✅ NotificationLog - Criada
- ✅ Lotes agendados - 09:30 e 16:45
- ✅ Reenvio de lotes - Implementado
- ✅ Histórico - Componente criado
- ⏳ WhatsApp - Preparado (não implementado)
- ⏳ Telegram - Preparado (não implementado)
- ⏳ Resend/SES - Preparado (não implementado)

---

## Notas Importantes

1. **Não alterar** layout existente
2. **Não alterar** lógica de IA existente
3. **Não alterar** workflow financeiro
4. **Não alterar** aprovação
5. **Não alterar** backup do Google Drive
6. **Sempre** usar `NotificationService.send()` para emails
7. **Nunca** chamar `SendEmail` diretamente de componentes

---

## Contato

Dúvidas sobre o módulo de notificação? Consultar a documentação ou verificar os logs em `NotificationLog`.