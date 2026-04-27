# PLANO DE IMPLEMENTAÇÃO — NOTIFICAÇÕES POR EMAIL

## OBJETIVO
Garantir que coordenadores e solicitantes recebam emails quando ações críticas ocorrem no sistema.

---

## 1. EMAIL #1: RELATÓRIO ENVIADO PARA REVISÃO

### Quando dispara?
- Usuário clica "Enviar para Revisão" em ReportEditor
- Status muda de DRAFT para SUBMITTED

### Onde implementar?
- **Arquivo**: pages/ReportEditor.js
- **Função**: handleSave('SUBMITTED')
- **Linha**: Após linha 225 (após base44.entities.Report.update)

### Código a adicionar:
```javascript
// Após sucesso do save
if (nextStatus === 'SUBMITTED') {
  try {
    await base44.functions.invoke('notifyCoordinatorOnSubmit', {
      reportId: report.id,
      authorName: form.author_name,
      autorEmail: currentUser?.email,
      mes: form.mes_referencia,
      ano: form.ano,
      museu: form.museu,
    });
  } catch (error) {
    console.error('Erro ao notificar coordenação:', error);
    // Não quebra fluxo, apenas loga
  }
}
```

### Email será enviado para:
- Todos os COORDENADORES do sistema (role = COORDENADOR ou admin)
- Base dados: UserPermission com can_review_reports = true

### Conteúdo do email:
```
Assunto: Novo Relatório para Revisar — [MÊS/ANO] — [MUSEU]

Corpo:
- Nome do profissional
- Museu
- Mês/Ano
- Link para revisar o relatório
- Deadline (se houver)
```

### Validação:
- ✓ Função notifyCoordinatorOnSubmit existe?
- ✓ Email template pronto?
- ✓ Coordenadores recebem?

---

## 2. EMAIL #2: NOVA SOLICITAÇÃO DE COMPRA

### Quando dispara?
- Usuário clica "Salvar" em PurchaseFormDialog
- Nova compra é criada com status RASCUNHO

### Onde implementar?
- **Arquivo**: components/compras/PurchaseFormDialog.js
- **Função**: handleSave()
- **Linha**: Após linha 134 (após base44.entities.PurchaseRequest.create)

### Código a adicionar:
```javascript
// Após sucesso da criação
if (!prefill?.id) {
  // Apenas para novas compras
  try {
    await base44.functions.invoke('notifyCoordinatorOnPurchaseSubmitted', {
      purchaseId: payload.id, // Retornado da create
      description: payload.descricao_item,
      requestedBy: currentUser?.full_name,
      requestedByEmail: currentUser?.email,
      amount: payload.valor_solicitado,
      rubrica: payload.rubrica_id,
      centro_custo: payload.centro_custo,
    });
  } catch (error) {
    console.error('Erro ao notificar compra:', error);
  }
}
```

### Email será enviado para:
- Todos os coordenadores com can_manage_users ou gestao_compras
- Coordenador da equipe do solicitante (se houver)

### Conteúdo do email:
```
Assunto: Nova Solicitação de Compra — [DESCRIÇÃO] — R$ [VALOR]

Corpo:
- Solicitante: [Nome]
- Descrição: [Item]
- Valor: R$ [X.XXX,XX]
- Rubrica: [Rubrica]
- Centro de custo: [Centro]
- Data: [Data/hora]
- Link direto para revisar
```

### Validação:
- ✓ Função notifyCoordinatorOnPurchaseSubmitted existe?
- ✓ Email template pronto?
- ✓ Coordenadores recebem?

---

## 3. EMAIL #3: SOLICITAÇÃO DE COMPRA APROVADA

### Quando dispara?
- Coordenador clica "Aprovar" em AprovacoesFila
- Status muda de SOLICITADO para APROVADO_COORD

### Onde implementar?
- **Arquivo**: components/compras/AprovacoesFila.js
- **Função**: handleAction(purchase, 'approve_coord')
- **Linha**: Após linha 200 (após purchaseActions sucesso)

### Código a adicionar:
```javascript
// Após sucesso da aprovação
if (action === 'approve_coord') {
  try {
    const updatedPurchase = await base44.entities.PurchaseRequest.get(purchase.id);
    await base44.functions.invoke('notifyPurchaseApproved', {
      purchaseId: purchase.id,
      description: purchase.descricao_item,
      amount: purchase.valor_solicitado,
      approvedBy: currentUser?.full_name,
      approvedByEmail: currentUser?.email,
      createdBy: purchase.created_by, // Email do solicitante
      rubrica: purchase.rubrica_id,
      nextStep: 'admin_approval', // Próxima aprovação
    });
  } catch (error) {
    console.error('Erro ao notificar aprovação:', error);
  }
}
```

### Email será enviado para:
- **Para solicitante**: notificar que foi aprovado por coordenação
- **Para admin**: notificar que está pendente de aprovação administrativa

### Conteúdo do email:
```
Assunto: Sua Solicitação de Compra foi Aprovada! ✓

Para solicitante:
- Sua compra foi aprovada por [Coordenador]
- Data: [Data/hora]
- Descrição: [Item]
- Valor: R$ [X.XXX,XX]
- Status: Aguardando aprovação administrativa
- Link para acompanhar

Para admin:
- Nova solicitação aguardando aprovação administrativa
- Solicitante: [Nome]
- Descrição: [Item]
- Link para aprovar/rejeitar
```

### Validação:
- ✓ Função notifyPurchaseApproved existe?
- ✓ Email template pronto?
- ✓ Ambos recebem?

---

## 4. EMAIL #4: SOLICITAÇÃO DE COMPRA RECUSADA

### Quando dispara?
- Coordenador clica "Recusar" em AprovacoesFila
- Status muda para RECUSADO

### Onde implementar?
- **Arquivo**: components/compras/AprovacoesFila.js
- **Função**: handleAction(purchase, 'reject')
- **Linha**: Após linha 200

### Código a adicionar:
```javascript
// Após sucesso da rejeição
if (action === 'reject') {
  try {
    await base44.functions.invoke('notifyPurchaseRejected', {
      purchaseId: purchase.id,
      description: purchase.descricao_item,
      amount: purchase.valor_solicitado,
      rejectedBy: currentUser?.full_name,
      rejectedByEmail: currentUser?.email,
      createdBy: purchase.created_by, // Email do solicitante
      motivo: comentario || 'Não especificado',
    });
  } catch (error) {
    console.error('Erro ao notificar rejeição:', error);
  }
}
```

### Email será enviado para:
- **Para solicitante**: notificar da rejeição + motivo

### Conteúdo do email:
```
Assunto: Sua Solicitação de Compra foi Recusada ✗

- Solicitante: [Nome]
- Descrição: [Item]
- Valor: R$ [X.XXX,XX]
- Recusado por: [Coordenador]
- Data: [Data/hora]
- Motivo: [Comentário digitado]
- Ação: Você pode editá-la e reenviar
- Link para editar
```

### Validação:
- ✓ Função notifyPurchaseRejected existe?
- ✓ Email template pronto?
- ✓ Solicitante recebe?

---

## 5. FUNÇÕES BACKEND NECESSÁRIAS

Precisamos que estas funções existam:

1. **notifyCoordinatorOnSubmit**
   - Recebe: reportId, authorName, autorEmail, mes, ano, museu
   - Envia email para coordenadores
   - Log na auditoria

2. **notifyCoordinatorOnPurchaseSubmitted**
   - Recebe: purchaseId, description, requestedBy, requestedByEmail, amount, rubrica, centro_custo
   - Envia email para coordenadores
   - Log na auditoria

3. **notifyPurchaseApproved**
   - Recebe: purchaseId, description, amount, approvedBy, approvedByEmail, createdBy, rubrica, nextStep
   - Envia email para solicitante e admin
   - Log na auditoria

4. **notifyPurchaseRejected**
   - Recebe: purchaseId, description, amount, rejectedBy, rejectedByEmail, createdBy, motivo
   - Envia email para solicitante
   - Log na auditoria

**Status**: ❓ VERIFICAR QUAIS JÁ EXISTEM

---

## 6. CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Verificação
- [ ] Confirmar que funções de notificação existem (funções/notify*)
- [ ] Confirmar templates de email existem
- [ ] Confirmar coordenadores têm emails configurados
- [ ] Confirmar SMTP está funcionando

### Fase 2: Implementação
- [ ] Adicionar email #1 (ReportEditor)
- [ ] Adicionar email #2 (PurchaseFormDialog)
- [ ] Adicionar email #3 (AprovacoesFila — aprovação)
- [ ] Adicionar email #4 (AprovacoesFila — rejeição)

### Fase 3: Testes
- [ ] Testar email #1 em dev
- [ ] Testar email #2 em dev
- [ ] Testar email #3 em dev
- [ ] Testar email #4 em dev
- [ ] Verificar se emails chegam
- [ ] Verificar conteúdo dos emails
- [ ] Verificar logs de auditoria

### Fase 4: Deploy
- [ ] Deploy para prod
- [ ] Monitorar envio de emails
- [ ] Testar fluxo completo em prod

---

## 7. PADRÃO DE CÓDIGO (Template)

Para todas as notificações, usar este padrão:

```javascript
// SEMPRE em try/catch para não quebrar fluxo
try {
  await base44.functions.invoke('nomeNotificacao', {
    // Dados necessários para construir email
    purchaseId: purchase.id,
    userEmail: user.email,
    userName: user.full_name,
    // ... outros dados
  });
  // Log de sucesso é opcional (função faz isso)
} catch (error) {
  console.error('Erro ao notificar:', error);
  // NÃO quebra fluxo — usuário já viu toast de sucesso
}
```

---

## 8. INTEGRAÇÃO COM AUDITORIA

Cada notificação disparada deve ser registrada em AuditLog:

```javascript
// Dentro da função de notificação (backend)
await base44.entities.AuditLog.create({
  action: 'NOTIFY_EMAIL',
  entity_type: 'PURCHASE_REQUEST', // ou REPORT
  entity_id: purchaseId,
  actor_email: system@museus.centro',
  actor_name: 'Sistema',
  details: `Email enviado para ${destinatarios} sobre aprovação de compra`,
});
```

---

## 9. MÉTRICAS DE SUCESSO

✅ Implementação bem-sucedida se:

- [ ] 100% dos relatórios enviados = email para coordenação
- [ ] 100% das compras novas = email para coordenadores
- [ ] 100% das aprovações = email para solicitante
- [ ] 100% das rejeições = email para solicitante com motivo
- [ ] 0 erros de envio que quebrem fluxo
- [ ] Todos os emails chegam em até 1 minuto
- [ ] Auditoria registra todos os envios
- [ ] Usuários confirmam recebimento

---

**Prioridade**: 🔴 CRÍTICO
**Timeline**: Imediato (próximas 48h)
**Responsável**: Desenvolvedor Base44