# Sistema Avançado de Notificações e Preferências

## Visão Geral

Sistema centralizado e elegante de notificações para o Museus Centro / Viaduto das Artes, com suporte a:

- ✅ Notificações em tempo real no sistema
- ✅ Notificações por email com resumo diário/semanal
- ✅ Preferências personalizadas por perfil de usuário
- ✅ Categorias configuráveis (12 categorias)
- ✅ Prioridades de alerta
- ✅ Logs detalhados de envio e leitura
- ✅ Cancelamento de assinatura com link no email
- ✅ Reassinatura de notificações

---

## Componentes Principais

### 1. NotificationCenter
Painel central de notificações no sistema.

**Localização:** `components/notifications/NotificationCenter.jsx`

**Recursos:**
- Exibir todas as notificações do usuário
- Filtrar por categoria
- Marcar como lido
- Marcar como importante (pin)
- Arquivar notificações
- Badge com contagem de não lidas

**Props:**
- `isOpen` (boolean): Controlar abertura/fechamento
- `onClose` (function): Callback ao fechar

### 2. NotificationBell
Sino único de notificações para o header.

**Localização:** `components/notifications/NotificationBell.jsx`

**Recursos:**
- Ícone com badge de contagem
- Abre NotificationCenter ao clicar
- Subscrição em tempo real

**Uso:**
```jsx
import NotificationBell from '@/components/notifications/NotificationBell';

<NotificationBell />
```

### 3. NotificationPreferencesPanel
Painel para gerenciar preferências de notificação.

**Localização:** `components/notifications/NotificationPreferencesPanel.jsx`

**Recursos:**
- Configurar email de notificações
- Ativar/desativar categorias
- Escolher frequência de envio
- Cancelar/reativar assinatura de email

**Uso:**
```jsx
import NotificationPreferencesPanel from '@/components/notifications/NotificationPreferencesPanel';

<NotificationPreferencesPanel />
```

---

## Entidades

### NotificationPreference
Armazena preferências de notificação do usuário.

```javascript
{
  user_email: string (PK),
  user_role: 'coordenador' | 'profissional' | 'observador' | 'patrocinador' | 'admin',
  email_address: string,
  receive_email_notifications: boolean,
  email_frequency: 'immediate' | 'daily' | 'weekly' | 'important_only' | 'disabled',
  receive_in_app: boolean,
  receive_push: boolean,
  notification_categories: object, // { system: boolean, financial: boolean, ... }
  priority_alerts_only: boolean,
  unsubscribed_at: date,
  last_email_sent_at: date,
  ...
}
```

### SystemNotification
Armazena cada notificação individual.

```javascript
{
  id: string (PK),
  user_email: string,
  title: string,
  message: string,
  category: string, // system, financial, reports, ...
  type: string, // purchase_approved, report_returned, ...
  priority: 'low' | 'normal' | 'high' | 'critical',
  related_entity_type: string,
  related_entity_id: string,
  action_url: string,
  status: 'unread' | 'read' | 'important' | 'pinned' | 'archived',
  email_sent: boolean,
  email_sent_at: date,
  read_at: date,
  museum: string,
  created_at: date,
  ...
}
```

### NotificationLog
Registra eventos de notificação para auditoria.

```javascript
{
  id: string (PK),
  notification_id: string,
  user_email: string,
  event_type: 'sent' | 'read' | 'clicked' | 'archived' | 'email_sent' | 'email_failed' | 'unsubscribed',
  category: string,
  priority: string,
  delivery_method: 'in_app' | 'email' | 'push',
  status: 'success' | 'failed' | 'pending',
  error_message: string,
  timestamp: date,
  ...
}
```

---

## Funções Backend

### sendNotificationToUser
Envia uma notificação para um usuário respeitando suas preferências.

**Localização:** `functions/sendNotificationToUser.js`

**Payload:**
```javascript
{
  user_email: string (required),
  title: string (required),
  message: string (required),
  category: string (required), // uma das 12 categorias
  type: string (required), // tipo específico (ex: purchase_approved)
  priority: 'low' | 'normal' | 'high' | 'critical',
  related_entity_type: string,
  related_entity_id: string,
  action_url: string,
  museum: string,
  user_role: string // coordenador, profissional, ...
}
```

**Exemplo:**
```javascript
await base44.functions.invoke('sendNotificationToUser', {
  user_email: 'user@example.com',
  title: 'Solicitação Aprovada',
  message: 'Sua solicitação de compra foi aprovada.',
  category: 'financial',
  type: 'purchase_approved',
  priority: 'high',
  related_entity_type: 'PurchaseRequest',
  related_entity_id: 'purchase-123',
  action_url: '/Compras?purchase_id=purchase-123',
  museum: 'MHAB'
});
```

### sendDailyNotificationDigest
Envia resumo diário de notificações para usuários que escolheram essa frequência.

**Localização:** `functions/sendDailyNotificationDigest.js`

**Como usar:**
- Criar automação agendada para rodar uma vez por dia
- Ex: 8:00 AM (horário de São Paulo)
- Será executada automaticamente

**Automação Exemplo:**
```
Type: Scheduled
Name: Daily Notification Digest
Function: sendDailyNotificationDigest
Schedule: Daily at 08:00 AM
```

---

## Categorias de Notificação

1. **system** - Notificações do sistema
2. **financial** - Alertas financeiros e de compra
3. **reports** - Status de relatórios
4. **programming** - Atualizações de programação e eventos
5. **communication** - Comunicação e clipping
6. **web_clipping** - Menções na web e redes sociais
7. **approvals** - Pendências de aprovação
8. **documents** - Documentos e arquivos
9. **agenda** - Eventos de agenda
10. **ai_suggestions** - Sugestões de IA
11. **backup** - Status de backup
12. **team** - Atualizações da equipe

---

## Fluxo de Notificação

### 1. Evento Disparador
Um evento no sistema (aprovação de compra, envio de relatório, etc) dispara a notificação.

### 2. Verificar Preferências
Sistema verifica as preferências do usuário:
- Categoria habilitada?
- Email habilitado?
- Frequência correta?

### 3. Criar Notificação em Tempo Real
Se `receive_in_app` = true, criar SystemNotification com status "unread".

### 4. Enviar Email
- Se `email_frequency` = 'immediate': enviar logo
- Se `email_frequency` = 'daily': adicionar ao digest do dia
- Se `email_frequency` = 'weekly': adicionar ao digest da semana
- Se `priority` = 'critical': sempre enviar imediatamente

### 5. Registrar Log
Criar entrada em NotificationLog com evento e status.

---

## Preferências por Perfil

### Coordenador
Pode receber notificações sobre:
- Novas solicitações de compra
- Solicitações aprovadas/devolvidas
- Pagamentos realizados
- Documentos sem vínculo
- Relatórios para revisão
- Novos usuários cadastrados
- Erros de backup
- Inconsistências financeiras
- Rubricas próximas do limite

### Profissional
Pode receber notificações sobre:
- Suas próprias solicitações (status mudanças)
- Seus próprios pagamentos
- Seus próprios relatórios (aprovados/devolvidos)
- Comentários em relatórios
- Atividades vinculadas
- Exportações completadas

### Observador / Patrocinador
Pode receber notificações sobre:
- Novos relatórios institucionais
- Novas programações
- Novas galerias de fotos
- Novas publicações
- Novos indicadores publicados
- Resumos mensais

---

## Configuração de Email

### Templates de Email

Todos os emails incluem:

1. **Cabeçalho** com data e resumo do período
2. **Notificações agrupadas por categoria**
3. **Links para ação** quando aplicável
4. **Rodapé obrigatório:**
   - Gerenciar preferências
   - Cancelar assinatura
   - Aviso de cadastro

### Cancelar Assinatura

Todos os emails contêm link para cancelar assinatura:
- Desinscribe todos os emails
- Mantém notificações no sistema
- Usuário pode reativar nas preferências

### Reassinatura

Usuário pode:
1. Ir em Notificações e Preferências
2. Reativar "Receber notificações por email"
3. Escolher categorias e frequência novamente

---

## Exemplos de Uso

### 1. Notificar quando compra é aprovada

```javascript
// No fluxo de aprovação de compra:
await base44.functions.invoke('sendNotificationToUser', {
  user_email: purchase.created_by,
  title: 'Solicitação Aprovada',
  message: `R$ ${purchase.valor} - ${purchase.descricao}`,
  category: 'financial',
  type: 'purchase_approved',
  priority: 'high',
  related_entity_type: 'PurchaseRequest',
  related_entity_id: purchase.id,
  action_url: `/Compras?purchase_id=${purchase.id}`,
  museum: purchase.centro_custo
});
```

### 2. Notificar coordenador de nova solicitação

```javascript
// Quando nova compra é criada:
const coordinators = await base44.asServiceRole.entities.User.filter({
  role: 'coordenador'
});

for (const coord of coordinators) {
  await base44.functions.invoke('sendNotificationToUser', {
    user_email: coord.email,
    title: 'Nova Solicitação de Compra',
    message: `${purchase.descricao} - Valor: R$ ${purchase.valor}`,
    category: 'approvals',
    type: 'new_purchase_request',
    priority: 'high',
    related_entity_type: 'PurchaseRequest',
    related_entity_id: purchase.id,
    action_url: `/Compras?purchase_id=${purchase.id}`,
    museum: purchase.centro_custo
  });
}
```

### 3. Notificar sobre relatório devolvido

```javascript
// Quando relatório é devolvido para revisão:
await base44.functions.invoke('sendNotificationToUser', {
  user_email: report.author_email,
  title: 'Relatório Devolvido',
  message: `Seu relatório de ${report.mes_referencia} foi devolvido para ajustes.`,
  category: 'reports',
  type: 'report_returned',
  priority: 'high',
  related_entity_type: 'Report',
  related_entity_id: report.id,
  action_url: `/Relatorios?report_id=${report.id}`,
  museum: report.museu
});
```

---

## Integração com Automações

### Entity Automation
Disparar notificações quando eventos de entidade ocorrem:

```javascript
// Automação: When PurchaseRequest status changes
const automationConfig = {
  automation_type: 'entity',
  name: 'Notify on Purchase Status Change',
  function_name: 'notifyOnPurchaseStatusChanged',
  entity_name: 'PurchaseRequest',
  event_types: ['update'],
  trigger_conditions: {
    conditions: [
      { field: 'changed_fields', operator: 'contains', value: 'status' }
    ]
  }
};
```

### Scheduled Automation
Enviar digests diariamente:

```javascript
// Automação: Daily notification digest at 8 AM
const automationConfig = {
  automation_type: 'scheduled',
  name: 'Daily Notification Digest',
  function_name: 'sendDailyNotificationDigest',
  schedule_type: 'simple',
  repeat_interval: 1,
  repeat_unit: 'days',
  start_time: '08:00' // São Paulo timezone
};
```

---

## Segurança e Privacidade

### Regras de Acesso

1. **Profissional** só recebe notificações sobre seus próprios dados
2. **Observador/Patrocinador** só recebe notificações institucionais
3. **Coordenador** pode receber alertas administrativos
4. **Admin** acessa todas as notificações

### URLs Autenticadas

- Links em emails requerem autenticação
- Usuário é redirecionado para login se não autenticado
- Não incluir dados sensíveis no URL

### Dados Sensíveis

- Não incluir anexos no email
- Apenas links para visualizar no sistema
- Mensagens contêm resumo, não dados completos

---

## Monitoramento

### Logs de Auditoria

Consultar `NotificationLog` para:
- Rastrear envios de email
- Verificar falhas
- Auditar leitura de notificações
- Acompanhar cancelamentos

**Query exemplo:**
```javascript
const logs = await base44.asServiceRole.entities.NotificationLog.filter({
  event_type: 'email_failed'
}, '-timestamp', 100);
```

---

## Troubleshooting

### Notificações não chegando

1. Verificar se categoria está habilitada
2. Verificar preferências do usuário
3. Verificar logs de falha
4. Confirmar email está correto

### Email não está enviando

1. Verificar `receive_email_notifications` = true
2. Verificar frequência não é 'disabled'
3. Consultar `NotificationLog` para erros
4. Verificar email_address está preenchido

### Duplicatas de email

1. Sistema deduplicará notificações automáticas
2. Verificar se função está sendo chamada múltiplas vezes
3. Usar idempotência no trigger

---

## Performance

- Notificações não-bloqueantes (assíncronas)
- Digests em background (função agendada)
- Limite de 100 notificações por query
- Índices em user_email e status

---

## Próximos Passos

1. ✅ Criar automações para eventos importantes
2. ✅ Integrar NotificationBell no TopNav (já feito)
3. ✅ Criar página de preferências (já feita)
4. ✅ Testar fluxo completo
5. ✅ Configurar digest diário
6. ✅ Monitorar logs

---

## Suporte

Para dúvidas ou issues:
- Consultar logs em `NotificationLog`
- Verificar preferências em `NotificationPreference`
- Rastrear notificações em `SystemNotification