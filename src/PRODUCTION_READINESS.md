# ✅ CHECKLIST DE PRONTO PARA PRODUÇÃO

**Data de Atualização:** 2026-04-27  
**Status:** Em Progresso

## 1️⃣ PADRÃO VISUAL (PRETO E BRANCO)

- [x] Dashboard — cards atualizados com padrão preto/branco
- [x] PurchaseCard — formatação preto/branco com status correto
- [x] TeamPaymentReview — tabela com header preto, cards padronizados
- [x] DashboardPatrocinador — cards preto/branco com fallback de dados
- [ ] Entrada Única — revisar cores
- [ ] Relatórios — revisar cards de atividades
- [ ] Compras — revisar card de compras

**Padrão aplicado:**
- Fundo: branco (#FFF)
- Borda: preto 2px (border-2 border-black)
- Botões primários: fundo preto, texto branco
- Botões secundários: borda preta, texto preto
- Status aprovado/pago: fundo preto, texto branco
- Status pendente: borda preta, fundo branco
- Alertas: borda preta, ícone preto, sem cores fortes

---

## 2️⃣ FEEDBACK AO USUÁRIO

### Botões com Loading

- [x] PurchaseCard — loading + mensagem "Salvando..."
- [x] TeamPaymentReview — loading em todas as ações (Aprovar, Recusar, Pagar)
- [x] Dashboard — botão Sincronizar com feedback
- [ ] Entrada Única — botão Enviar
- [ ] Relatórios — botão Salvar
- [ ] Compras — botão Criar

### Toast Messages

- [x] PurchaseCard — sucesso/erro ao pagar
- [x] TeamPaymentReview — sucesso/erro ao alterar status
- [ ] Entrada Única — análise IA, envio
- [ ] Relatórios — salvar, enviar
- [ ] Compras — criar, aprovar

### Estados Vazios

- [x] Dashboard — mensagem clara "Sem dados disponíveis"
- [x] DashboardPatrocinador — aviso quando período vazio
- [x] TeamPaymentReview — icone + mensagem no estado vazio
- [ ] Entrada Única — estado vazio de documentos
- [ ] Relatórios — estado vazio de lista

---

## 3️⃣ DADOS REAIS E SINCRONIZAÇÃO

### Dashboard

- [x] Carrega dados reais de Report, Activity
- [x] Refetch automático ao atualizar
- [x] Subscrição em tempo real (Report, Activity)
- [x] Stats calculados corretamente

### DashboardPatrocinador

- [x] Consome Report (status APPROVED)
- [x] Consome Programacao
- [x] Consome Rubrica com campos corretos
- [x] Subscrição em TeamPayment e PurchaseRequest
- [x] Fallback quando sem dados

### PurchaseCard

- [x] Carrega PurchaseRequest real
- [x] Vincula TeamPayment corretamente
- [x] Marca como pago e invalida cache

### TeamPaymentReview

- [x] Carrega TeamPayment da API
- [x] Atualiza status e invalida cache
- [x] Mostra dados reais (profissional, valor, mês)

---

## 4️⃣ FLUXOS COMPLETOS (PONTA A PONTA)

### Entrada Única
- [ ] Upload → Análise IA → Revisão → Envio → Vínculo correto

### Pagamentos
- [ ] Envio NF → Aprovação → Pagamento → Impacto rubrica

### Compras
- [ ] Criação → Aprovação → Execução → Rubrica atualizada

### Relatórios
- [ ] Preenchimento → Salvamento → Envio → Status correto

---

## 5️⃣ ESTABILIDADE

### Sem Estados Quebrados

- [x] PurchaseCard não trava em loading
- [x] TeamPaymentReview não trava em loading
- [ ] Entrada Única sem "ANALISANDO IA" infinito
- [ ] Relatórios sem draft perdido
- [ ] Dashboard sem stats zerados

### Sem Duplicidade

- [ ] Compras não duplicam ao clicar rápido
- [ ] Pagamentos não duplicam ao clicar rápido
- [ ] Relatórios não criam múltiplas versões

### Performance

- [ ] Sem re-renders desnecessários
- [ ] Sem múltiplas chamadas de API
- [ ] Debounce em busca/filtros
- [ ] Polling limitado (máx 60s)

---

## 6️⃣ PERMISSÕES

- [ ] Profissional vê apenas seus dados
- [ ] Coordenador vê equipe
- [ ] Admin vê tudo
- [ ] Botões habilitados conforme role

---

## 7️⃣ TESTES MANUAIS

### Dashboard
- [ ] Carregar com dados
- [ ] Filtrar por museu
- [ ] Filtrar por status
- [ ] Atualizar (refresh)
- [ ] Visualizar relatório

### DashboardPatrocinador
- [ ] Carregar dados de atividades
- [ ] Sincronizar com banco
- [ ] Visualizar gráficos
- [ ] Trocar tipo de gráfico

### Compras
- [ ] Criar compra
- [ ] Vincular rubrica
- [ ] Aprovar compra
- [ ] Marcar como pago
- [ ] Verificar impacto na rubrica

### Pagamentos
- [ ] Enviar NF
- [ ] Aprovar pagamento
- [ ] Recusar pagamento
- [ ] Marcar como pago
- [ ] Adicionar comentário

---

## 8️⃣ RESPONSIVIDADE

- [ ] Desktop (1920px)
- [ ] Tablet (768px)
- [ ] Mobile (375px)

---

## 9️⃣ ACESSIBILIDADE

- [ ] Contraste alto em cores
- [ ] Ícones com label
- [ ] Formulários com label
- [ ] Teclado navegável

---

## 🔟 DOCUMENTAÇÃO

- [ ] README.md atualizado
- [ ] CHANGELOG.md atualizado
- [ ] Guia de estilo (styleGuide.js)
- [ ] Padrão visual documentado

---

## 📋 RESUMO DO PROGRESSO

```
Padrão Visual:       [████░░░░░] 40%
Feedback:            [████░░░░░] 40%
Dados Reais:         [██████░░░] 60%
Fluxos Completos:    [███░░░░░░] 30%
Estabilidade:        [███░░░░░░] 30%
Testes:              [░░░░░░░░░░] 0%
```

---

## 🚀 PRÓXIMOS PASSOS

1. Aplicar padrão preto/branco em Entrada Única
2. Adicionar feedback de loading em Relatórios
3. Testar fluxos completos (upload → envio → vínculo)
4. Verificar duplicidade em compras e pagamentos
5. Testes manuais completos

---

## ✅ ÚLTIMO ATUALIZADO

**27/04/2026 às 14:30 UTC-3**
- Dashboard e DashboardPatrocinador atualizados
- PurchaseCard com padrão preto/branco
- TeamPaymentReview com feedback melhorado
- StyleGuide criado como referência
- StandardCard criado para uso futuro