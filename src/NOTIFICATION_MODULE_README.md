# Módulo de Comunicação - NotificationService

## Visão Geral

Módulo centralizado para gerenciamento de todas as notificações do sistema, preparado para múltiplos canais e provedores.

## Estrutura

```
services/notifications/
├── NotificationService.js          # Serviço principal
├── EmailProvider.js                 # Provedor de email abstrato
└── templates/
    └── PurchaseNotificationTemplate.js  # Templates de compras
```

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
  entityId: '123',
});
```

### Canais Suportados

- `EMAIL` - Email (implementado)
- `WHATSAPP` - WhatsApp (preparado)
- `TELEGRAM` - Telegram (preparado)

### Tipos de Notificação

- `PURCHASE_DIGEST` - Lote consolidado de compras
- `PURCHASE_APPROVED` - Aprovação individual
- `PURCHASE_RETURNED` - Devolução
- `REPORT_APPROVED` - Relatório aprovado
- `PAYMENT_CONFIRMED` - Pagamento confirmado

## Provedores de Email

### Atual

- **Base44 SendEmail** - Integração nativa do Base44

### Futuros (preparado)

- Resend
- Amazon SES
- Postmark
- SendGrid

Para migrar, implementar o método correspondente em `EmailProvider.js`:

```javascript
async _sendViaResend({ to, subject, body, from_name }) {
  // Implementar chamada à API do Resend
}
```

## Templates

Templates centralizados em `services/notifications/templates/`.

### PurchaseNotificationTemplate

Template para lotes de compras com:
- Resumo do lote (quantidade, valor total)
- Agrupamento por centro de custo
- Cards com descrição, fornecedor, CNPJ, rubrica, links
- Links para NF, XML, comprovante (sem anexos)

## Fila de Notificações

Entidade: `PurchaseNotificationQueue`

### Status

- `pendente_lote` - Aguardando envio
- `enviado` - Enviado com sucesso
- `erro` - Falha no envio
- `cancelado` - Cancelado

### Lotes Automáticos

- **Manhã:** 09:30 (horário de Brasília)
- **Tarde:** 16:45 (horário de Brasília)
- Apenas dias úteis (segunda a sexta)

## Logs

Entidade: `NotificationLog`

Registra:
- Tipo da notificação
- Canal utilizado
- Destinatários
- Status do envio
- Provedor utilizado
- Erros (se houver)
- Data/hora do envio

## Componentes UI

### ResendNotificationBatch

Botão para reenviar lote de notificações.

```jsx
import ResendNotificationBatch from '@/components/notifications/ResendNotificationBatch';

<ResendNotificationBatch 
  batchSlot="manha" 
  onSuccess={() => console.log('Reenviado!')} 
/>
```

### NotificationHistoryPanel

Painel para visualizar histórico de notificações.

```jsx
import NotificationHistoryPanel from '@/components/notifications/NotificationHistoryPanel';

<NotificationHistoryPanel />
```

## Fluxo de Notificação

1. Usuário aprova compra
2. Sistema adiciona à `PurchaseNotificationQueue`
3. Aguarda próximo lote (09:30 ou 16:45)
4. Automação executa `sendPurchaseNotificationDigest`
5. Email consolidado enviado para destinatários fixos
6. Log registrado em `NotificationLog`

## Destinatários Fixos (Compras)

- adm@viadutodasartes.org.br
- notasfiscais@viadutodasartes.org.br
- danielperini.mc@viadutodasartes.org.br
- daniel@periniprojetos.com.br

## Funções Backend

### enqueuePurchaseNotification

Adiciona notificação à fila.

```javascript
const result = await base44.functions.invoke('enqueuePurchaseNotification', {
  purchaseId: '123'
});
```

### sendPurchaseNotificationDigest

Processa lote de notificações pendentes.

Executado automaticamente pelas automações:
- **NotificacaoCompras Lote Manha** - 09:30
- **NotificacaoCompras Lote Tarde** - 16:45

### reenviarLoteNotificacoes

Reenvia lote já enviado (não duplica).

```javascript
const result = await base44.functions.invoke('reenviarLoteNotificacoes', {
  batchSlot: 'manha'
});
```

## Migração de Provedor

Para migrar para outro provedor (ex: Resend):

1. Implementar método em `EmailProvider.js`:
   ```javascript
   async _sendViaResend({ to, subject, body, from_name }) {
     // Implementar
   }
   ```

2. Alterar `CURRENT_PROVIDER`:
   ```javascript
   const CURRENT_PROVIDER = 'resend';
   ```

3. Atualizar `_sendViaBase44` para chamar o novo método.

**Nenhuma outra alteração necessária** - todo o sistema usa `NotificationService.send()`.

## Boas Práticas

1. **Sempre usar NotificationService** - Nunca chamar `SendEmail` diretamente
2. **Templates centralizados** - Manter todos os templates em `services/notifications/templates/`
3. **Logs obrigatórios** - Toda notificação deve gerar log
4. **Não anexar arquivos** - Usar apenas links (lotes podem ter dezenas de itens)
5. **Verificar duplicidade** - Sempre checar se já está na fila antes de adicionar

## Troubleshooting

### Emails não chegam

1. Verificar se domínio está configurado no Base44 (Dashboard → Domains → Email domain)
2. Verificar logs em `NotificationLog`
3. Testar com `sendTestEmail`

### Lote não envia

1. Verificar se automação está ativa (Dashboard → Code → Automations)
2. Verificar horário da automação (UTC vs Brasília)
3. Verificar se há itens na fila:
   ```javascript
   const pending = await base44.entities.PurchaseNotificationQueue.filter({
     status: 'pendente_lote'
   });
   ```

## Créditos

Implementado seguindo diretrizes de modularidade e preparação para crescimento futuro.