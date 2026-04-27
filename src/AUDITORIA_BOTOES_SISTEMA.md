# AUDITORIA COMPLETA — BOTÕES E AÇÕES DO MUSEUS CENTRO

## STATUS: EM ANDAMENTO (ETAPA 1 — MAPEAMENTO)

---

## 1. SEÇÃO: COMPRAS (pages/Compras.js)

### 1.1 BOTÃO: "Nova Solicitação"
- **Componente**: pages/Compras.js (linha 623)
- **Função chamada**: setShowForm(true)
- **Backend real**: ❌ NÃO — abre dialog apenas
- **Entidade afetada**: PurchaseRequest (criada no dialog)
- **Status esperado**: RASCUNHO
- **Feedback**: ✓ Dialog abre
- **⚠️ CRÍTICO**: Dialog cria a compra, precisa validar salvar real

### 1.2 BOTÃO: "Editar" (linha 340-346)
- **Componente**: TabelaSolicitacoes -> PurchaseFormDialog
- **Função chamada**: onEdit(p) -> setEditingPurchase(p)
- **Backend real**: ❌ Apenas abre formulário
- **Entidade afetada**: PurchaseRequest
- **Feedback**: ✓ Dialog abre com dados
- **⚠️ CRÍTICO**: Salvar dentro do dialog deve persistir

### 1.3 BOTÃO: "Relatório PDF" (linha 613)
- **Componente**: pages/Compras.js (linha 616)
- **Função chamada**: setShowReportGen(true)
- **Backend real**: ❌ Abre componente apenas
- **Entidade afetada**: N/A
- **Feedback**: Dialog abre
- **Status**: ⚠️ Verificar se gera realmente

### 1.4 TAB: "Documentos"
- **Componente**: GestaoDocumental (linha 957)
- **Função chamada**: Renderiza componente
- **Backend real**: ✓ Provavelmente sim
- **Entidade afetada**: Attachment, PurchaseDocument
- **Feedback**: ⚠️ Verificar depois

### 1.5 TAB: "Rubricas"
- **Componente**: RubricasGrid (linha 938)
- **Função chamada**: Carrega rubricas
- **Backend real**: ✓ Via useQuery
- **Entidade afetada**: Rubrica
- **Feedback**: ✓ Mostra dados
- **Status**: ✓ OK

---

## 2. SEÇÃO: GESTÃO DE PAGAMENTOS (pages/GestaoPagamentos.js)

### 2.1 BOTÃO: "Marcar como PAGO" (linha 295)
- **Componente**: GestaoPagamentos.js (linha 301)
- **Função chamada**: setDialogOpen(true)
- **Backend real**: ❌ Abre dialog apenas
- **Entidade afetada**: PurchaseRequest
- **Status esperado**: PAGO
- **Feedback**: Dialog abre
- **⚠️ CRÍTICO**: Ver handleConfirm() (linha 106)

### 2.2 BOTÃO: "Confirmar Pagamento" (linha 217)
- **Componente**: PagamentoLoteDialog (linha 215)
- **Função chamada**: handleConfirm()
- **Backend real**: ✓ purchaseActions (linha 115)
- **Entidade afetada**: PurchaseRequest
- **Status esperado**: PAGO
- **Feedback**: 
  - ✓ Toast sucesso (linha 127)
  - ✓ Toast erro (linha 131)
- **Validação**:
  - ✓ Verifica comprovante (linha 107)
  - ✓ Loop para multiplas compras (linha 113)
  - ✓ Conta erros (linha 122)
- **⚠️ PROBLEMA**: Se erro parcial, retorna erro geral (linha 131)

### 2.3 BOTÃO: "Upload Comprovante" (linha 189-203)
- **Componente**: PagamentoLoteDialog
- **Função chamada**: handleUpload() (linha 97)
- **Backend real**: ✓ base44.integrations.Core.UploadFile (linha 100)
- **Entidade afetada**: Não persiste diretamente
- **Status esperado**: URL armazenado em state
- **Feedback**: ✓ Toast sucesso (linha 103)
- **⚠️ PROBLEMA**: Loading state mas upload não mostra erro

---

## 3. SEÇÃO: RELATÓRIOS (pages/ReportEditor.js)

### 3.1 BOTÃO: "Salvar Rascunho" (linha 631)
- **Componente**: ReportEditor.js
- **Função chamada**: handleSave('DRAFT')
- **Backend real**: ✓ base44.entities.Report.update (linha 225)
- **Entidade afetada**: Report
- **Status esperado**: DRAFT
- **Feedback**: 
  - ✓ Toast sucesso (linha 230)
  - ✓ Toast erro (linha 236)
  - ✓ Loading state (saving)
- **Validação**: ✓ Valida report.id (linha 216)
- **Status**: ✓ CORRETO

### 3.2 BOTÃO: "Enviar para Revisão" (linha 635)
- **Componente**: ReportEditor.js
- **Função chamada**: handleSave('SUBMITTED')
- **Backend real**: ✓ base44.entities.Report.update (linha 225)
- **Entidade afetada**: Report
- **Status esperado**: SUBMITTED
- **Feedback**: ✓ Toast sucesso (linha 228)
- **⚠️ PROBLEMA**: NÃO dispara notificação por email para coordenadores
- **Email obrigatório**: SIM — coordenadores devem ser notificados

### 3.3 BOTÃO: "Gerar PDF para Assinatura" (linha 259)
- **Componente**: ReportEditor.js
- **Função chamada**: handleExportPdf()
- **Backend real**: ✓ base44.functions.invoke('generateSingleReportPDF') (linha 268)
- **Entidade afetada**: N/A (apenas gera HTML)
- **Feedback**: ✓ Toast sucesso/erro (linha 282, 285)
- **Status**: ✓ OK

### 3.4 UPLOAD: Fotos
- **Componente**: ReportPhotoSection (linha 576)
- **Função chamada**: onAddPhoto()
- **Backend real**: ✓ persistReportPhotos() (linha 589)
- **Entidade afetada**: Report.fotos
- **Feedback**: ✓ Feedback da persistência
- **Status**: ✓ OK

---

## 4. SEÇÃO: COMPRAS — DETALHES CRÍTICOS

### 4.1 Dialog: PurchaseFormDialog
- **Localização**: components/compras/PurchaseFormDialog
- **Ações principais**: Salvar solicitação
- **Botão "Salvar"** (linha 226)
  - **Função**: handleSave()
  - **Backend**: ✓ base44.entities.PurchaseRequest.create/update (linha 134-135)
  - **Feedback**: 
    - ✓ Validação financeira (linha 101-113)
    - ✓ Toast sucesso (linha 137)
    - ✓ Toast erro (linha 141)
  - **Loading state**: ✓ saving (linha 226)
  - **Status**: ✅ CORRETO
  - **⚠️ PROBLEMA**: Não dispara notificação por email

### 4.2 Dialog: AprovacoesFila
- **Localização**: components/compras/AprovacoesFila
- **Botão "Aprovar"** (linha 292-304)
  - **Função**: handleAction(p, 'approve_coord')
  - **Backend**: ✓ base44.functions.invoke('purchaseActions') (linha 187)
  - **Validações**: 
    - ✓ Vínculo orçamentário (linha 161)
    - ✓ Divergência NF (linha 166)
    - ✓ Dúvidas IA (linha 173)
  - **Feedback**: ✓ Toast sucesso (linha 194)
  - **Loading state**: ✓ loading[p.id]
  - **Status**: ✅ CORRETO
  - **⚠️ PROBLEMA**: Não dispara notificação por email para solicitante

- **Botão "Recusar"** (linha 306-312)
  - **Função**: handleAction(p, 'reject')
  - **Backend**: ✓ purchaseActions (linha 187)
  - **Feedback**: ✓ Toast sucesso (linha 198)
  - **Status**: ✅ CORRETO
  - **⚠️ PROBLEMA**: Não dispara notificação por email

- **Botão "Analisar NF com IA"** (linha 278-286)
  - **Função**: handleAnalisarNF(p, tp)
  - **Backend**: ✓ base44.functions.invoke('analisarConformidadeNF') (linha 135)
  - **Feedback**: ✓ Toast info (linha 139)
  - **Status**: ✅ CORRETO

---

## 5. SEÇÃO: ENTRADA ÚNICA (pages/EntradaUnica.jsx)

### 5.1 UPLOAD: Documento
- **Componente**: DocumentUploadZone
- **Função chamada**: Upload via drag-drop
- **Backend**: ❓ VERIFICAR — classifyAndRouteDocument
- **Entidade**: DocumentIntake
- **Feedback**: ❓ VERIFICAR

### 5.2 BOTÃO: "Processar" ou similares
- **Status**: ❓ VERIFICAR — arquivo não lido

---

## 6. PROBLEMAS IDENTIFICADOS (RESUMO)

| ID | Página | Botão | Problema | Prioridade |
|---|---|---|---|---|
| P1 | ReportEditor | Enviar para Revisão | ❌ Sem notificação por email | 🔴 CRÍTICO |
| P2 | GestaoPagamentos | Confirmar Pagamento | ⚠️ Erro parcial não diferenciado | 🟡 MÉDIO |
| P3 | Compras | Nova Solicitação | ❌ Sem notificação por email | 🔴 CRÍTICO |
| P4 | Compras | Aprovar compra | ❌ Sem notificação por email | 🔴 CRÍTICO |
| P5 | Compras | Recusar compra | ❌ Sem notificação por email | 🔴 CRÍTICO |
| P6 | EntradaUnica | Upload | ❓ Precisa validar fluxo completo | 🔴 CRÍTICO |

---

## 7. AÇÕES OBRIGATÓRIAS (ORDEM)

### 7.1 AÇÃO CRÍTICA #1: Notificação por Email (Report Enviado)
- **Onde**: pages/ReportEditor.js → handleSave('SUBMITTED')
- **O que fazer**: Disparar email para coordenadores
- **Função**: notifyCoordinatorOnSubmit() (verificar se existe)
- **Quando**: Após `base44.entities.Report.update(report.id, payload)` (linha 225)
- **Status**: 🔴 NÃO IMPLEMENTADO

### 7.2 AÇÃO CRÍTICA #2: Notificação por Email (Compra Nova)
- **Onde**: components/compras/PurchaseFormDialog.js → handleSave()
- **O que fazer**: Disparar email para coordenadores
- **Quando**: Após `base44.entities.PurchaseRequest.create(payload)` (linha 134)
- **Status**: 🔴 NÃO IMPLEMENTADO

### 7.3 AÇÃO CRÍTICA #3: Notificação por Email (Compra Aprovada)
- **Onde**: components/compras/AprovacoesFila.js → handleAction() com action='approve_coord'
- **O que fazer**: Disparar email para solicitante + coordenadores
- **Quando**: Após `base44.functions.invoke('purchaseActions', ...)` sucesso (linha 187-200)
- **Status**: 🔴 NÃO IMPLEMENTADO

### 7.4 AÇÃO CRÍTICA #4: Notificação por Email (Compra Recusada)
- **Onde**: components/compras/AprovacoesFila.js → handleAction() com action='reject'
- **O que fazer**: Disparar email para solicitante com motivo
- **Quando**: Após purchaseActions sucesso
- **Status**: 🔴 NÃO IMPLEMENTADO

### 7.5 AÇÃO SECUNDÁRIA #5: Melhorar mensagem de erro (GestaoPagamentos)
- **Onde**: pages/GestaoPagamentos.js → handleConfirm()
- **O que fazer**: Individualizar erros de compra
- **Status**: 🟡 PODE ESPERAR

---

## 8. PRÓXIMAS ETAPAS

- [x] Ler components/compras/PurchaseFormDialog
- [x] Ler components/compras/AprovacoesFila
- [ ] Ler pages/EntradaUnica.jsx
- [ ] Ler functions/purchaseActions
- [ ] Ler functions/notifyCoordinatorOnSubmit (se existir)
- [x] Validar todos os toasts (feito para seções lidas)
- [x] Validar todos os queryClient.invalidateQueries() (feito para seções lidas)
- [ ] Implementar notificação por email (Report enviado) — P1
- [ ] Implementar notificação por email (Compra nova) — P3
- [ ] Implementar notificação por email (Compra aprovada) — P4
- [ ] Implementar notificação por email (Compra recusada) — P5
- [ ] Implementar logs de auditoria
- [ ] Testar todos os fluxos com notificações
- [ ] Validar EntradaUnica completa — P6

---

**Última atualização**: 2026-04-27
**Status**: Mapeamento 60% completo — CRÍTICOS IDENTIFICADOS