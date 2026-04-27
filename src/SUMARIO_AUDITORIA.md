# AUDITORIA DE BOTÕES E AÇÕES — SUMÁRIO EXECUTIVO

**Data**: 27/04/2026  
**Status**: ⚠️ CRÍTICO — Problemas de notificação identificados  
**Responsabilidade**: Sistema Base44 (não é problema de UI, é de backend)

---

## RESULTADO EXECUTIVO

### ✅ O que está funcionando:
- ✓ Todos os botões fazem chamadas ao backend
- ✓ Dados são persistidos no banco
- ✓ Validações funcionam
- ✓ Toasts/feedback funcionam
- ✓ Loading states funcionam
- ✓ QueryClient invalidateQueries funciona

### ❌ O que está FALTANDO:
- ❌ **Notificações por email para coordenadores quando:**
  - Relatório é enviado para revisão
  - Nova solicitação de compra é criada
  - Solicitação é aprovada
  - Solicitação é recusada

---

## IMPACTO

### Situação ATUAL (com bug):
1. Usuário submete relatório → Status muda para SUBMITTED ✓ mas Coordenador não é notificado ✗
2. Usuário cria compra → Compra é salva ✓ mas Coordenador não é notificado ✗
3. Coordenador aprova compra → Compra passa para APROVADO_COORD ✓ mas Solicitante não sabe ✗
4. Coordenador rejeita compra → Compra vai para RECUSADO ✓ mas Solicitante não sabe por quê ✗

### Resultado:
- Coordenadores perdem notificações
- Comunicação manual necessária
- Atrasos no fluxo aprovação
- Usuários não recebem feedback

### Risco:
- 🔴 **CRÍTICO**: Coordenadores não sabem que têm tarefas pendentes
- 🔴 **CRÍTICO**: Solicitantes não sabem status de suas solicitações

---

## LISTA DE AÇÕES REQUERIDAS

| # | Ação | Onde | Tipo | Prioridade |
|---|---|---|---|---|
| 1 | Adicionar notificação email (relatório enviado) | pages/ReportEditor.js | Integração | 🔴 |
| 2 | Adicionar notificação email (compra nova) | components/compras/PurchaseFormDialog.js | Integração | 🔴 |
| 3 | Adicionar notificação email (compra aprovada) | components/compras/AprovacoesFila.js | Integração | 🔴 |
| 4 | Adicionar notificação email (compra recusada) | components/compras/AprovacoesFila.js | Integração | 🔴 |
| 5 | Melhorar erro em lote pagamentos | pages/GestaoPagamentos.js | UX | 🟡 |

---

## SOLUÇÃO

### O que precisa ser feito:

**Para cada ação crítica (relatório, compra, etc.), adicionar:**

```javascript
// Após sucesso da ação principal
try {
  await base44.functions.invoke('notifyCoordinators', {
    // Dados da notificação
  });
} catch (error) {
  // Log apenas, não quebra fluxo
  console.error('Erro ao notificar:', error);
}
```

### Esforço:
- Adicionar 4 chamadas de função (5 linhas cada)
- Testar cada uma
- Confirmar que emails chegam

### Timeline:
- **Implementação**: 30-60 minutos
- **Testes**: 30-60 minutos
- **Deploy**: 10 minutos
- **Total**: ~2 horas

---

## FUNÇÕES BACKEND NECESSÁRIAS

Precisamos que existam (ou sejam criadas):

1. `notifyCoordinatorOnSubmit` — Quando relatório é enviado
2. `notifyCoordinatorOnPurchaseSubmitted` — Quando compra nova é criada
3. `notifyPurchaseApproved` — Quando compra é aprovada
4. `notifyPurchaseRejected` — Quando compra é recusada

**Status**: ❓ VERIFICAR QUAIS JÁ EXISTEM

---

## PRÓXIMOS PASSOS

### Imediato (hoje):
- [ ] Confirmar funções de notificação existem
- [ ] Confirmar templates de email existem
- [ ] Começar integração

### Curto prazo (esta semana):
- [ ] Implementar 4 notificações
- [ ] Testar em dev
- [ ] Deploy para prod

### Médio prazo:
- [ ] Auditar outros fluxos (EntradaUnica, TeamPayments)
- [ ] Implementar logs de auditoria
- [ ] Dashboard de atividades

---

## DOCUMENTAÇÃO COMPLETA

- **AUDITORIA_BOTOES_SISTEMA.md** — Mapeamento detalhado de todos os botões
- **PLANO_IMPLEMENTACAO_EMAILS.md** — Instruções passo a passo para implementar emails

---

## CONCLUSÃO

**Sistema funciona tecnicamente ✓, mas falha em notificação ✗**

A solução é simples e rápida: adicionar 4 chamadas de função que já devem existir.

Não é problema de arquitetura, é apenas integração faltante.

---

**Prioridade**: 🔴 CRÍTICO  
**Impacto**: Alto (afeta experiência de coordenadores e solicitantes)  
**Esforço**: Baixo (2 horas)  
**Urgência**: IMEDIATA