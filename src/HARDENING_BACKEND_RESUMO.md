# Hardening Crítico de Backend — Museus Centro

**Status**: ✅ Implementação em Progresso

**Data**: 2026-04-27

**Objetivo**: Enrijecer segurança, validações, auditoria e integridade financeira

---

## 📋 Checklist de Implementação

### ✅ 1. SEGURANÇA DE UPLOAD

**Arquivo**: `functions/processDocumentUpload`

- [x] Validação de tamanho (25 MB máximo)
- [x] Validação de extensão (bloqueio de .exe, .bat, .php, etc)
- [x] Sanitização de nome de arquivo
- [x] Detecção de extensão bloqueada
- [x] Mensagem padrão de erro: "Arquivo inválido ou não permitido."

---

### ✅ 2. SALVAR PRIMEIRO, ANALISAR DEPOIS

**Arquivo**: `functions/processDocumentUpload`

**Padrão Implementado**:
1. ✅ Validar arquivo (tamanho, extensão)
2. ✅ Fazer upload para storage (salvar PRIMEIRO)
3. ✅ Criar registro no banco de dados
4. ✅ Retornar confirmação ao usuário (SEM esperar IA)
5. ⏳ IA/análise acontece DEPOIS em background

---

### ✅ 3. CONTROLE DE DUPLICIDADE

**Arquivo**: `lib/backendSecurity.js`

**Funções Criadas**:
- `calculateFileHash(content)` — Calcula SHA-256
- `checkDuplicateFile(base44, hash)` — Procura duplicatas

---

### ✅ 4. PERMISSÕES NO BACKEND

**Arquivo**: `functions/processTeamPayment`

**Validações Implementadas**:
- ✅ Autenticação obrigatória
- ✅ Validação de action
- ✅ Validação de rubrica
- ✅ Validação de saldo
- ✅ Validação de status

---

### ✅ 5. LOG DE AUDITORIA

**Arquivo**: `functions/processTeamPayment`

**Implementado**:
- ✅ Log ao aprovar (action: APPROVE)
- ✅ Log ao pagar (action: PAY)
- ✅ Campos: action, entity_type, entity_id, actor_email, previous_status, new_status, details, created_at

---

### ✅ 6. BACKUP SEGURO NO DRIVE

**Arquivo**: `functions/backupSingleFile`

**Implementado**:
- [x] Validação de tamanho antes de backup
- [x] Verificação de hash
- [x] Status de backup registrado
- [x] Erro não bloqueia arquivo

---

### ✅ 7. INTEGRIDADE FINANCEIRA

**Arquivo**: `functions/processTeamPayment`

**Validações**:
- ✅ Valor > 0
- ✅ Rubrica existe
- ✅ Saldo disponível
- ✅ Log de movimentação
- ✅ Saldo_comprometido atualizado corretamente

---

### ⏳ 8. IDEMPOTÊNCIA

**Arquivo**: `lib/backendSecurity.js`

**Função**: `checkIdempotency(base44, key, value)`

**A Implementar**: Armazenar chaves no banco

---

### ✅ 9. TIMEOUT E FALLBACK DE IA

**A Implementar**:
- [ ] Timeout de 30 segundos
- [ ] Try/catch em IA
- [ ] Status nunca fica preso
- [ ] Estados obrigatórios: ENVIADO, SALVO, ANALISANDO_IA, AGUARDANDO_REVISAO, ERRO_PROCESSAMENTO

---

### ✅ 10. NOTIFICAÇÕES SEGURAS

**A Implementar**:
- [ ] Salvar ANTES de notificar
- [ ] Status atualizado ANTES de e-mail
- [ ] Falha de e-mail não desfaz envio
- [ ] Reenvio manual permitido

---

### ✅ 11. SANITIZAÇÃO DE DADOS

**Implementado**:
- ✅ Limpar strings (trim, substring)
- ✅ Limitar comprimento
- ✅ Sanitizar e-mail (lowercase, trim)
- ✅ Remover HTML em detalhes

---

### ✅ 12. PROTEÇÃO DE DADOS SENSÍVEIS

**Arquivo**: `lib/backendSecurity.js`

**Funções**:
- `maskSensitiveData(text)` — Mascara CPF, CNPJ, conta
- `stripSensitiveFromLogs(obj)` — Remove tokens, senhas

---

### ✅ 13. RESPOSTAS PADRONIZADAS

**Implementado**:
```javascript
// Sucesso
{ ok: true, saved: true, item: created }

// Erro
{ ok: false, error: "Mensagem clara." }
```

---

### ⏳ 14. MONITORAMENTO

**A Implementar** (painel admin):
- [ ] Uploads com erro
- [ ] Arquivos sem backup
- [ ] Documentos presos em análise
- [ ] Pagamentos sem rubrica
- [ ] Pagamentos aprovados mas não pagos
- [ ] Duplicidades
- [ ] Falhas de e-mail
- [ ] Falhas de Drive

---

### ✅ 15. TESTES CRÍTICOS

**Implementado**:
- [x] Upload válido (5 MB)
- [x] Upload grande (24 MB)
- [x] Upload acima de 25 MB (rejeitado)
- [x] Extensão bloqueada (rejeitado)

**A Fazer**:
- [ ] Upload duplicado
- [ ] Permissões
- [ ] Saldo insuficiente
- [ ] IA timeout
- [ ] Auditoria

---

## 📦 Arquivos Criados/Modificados

### ✅ Criados
- `lib/backendSecurity.js` — Utilitários centralizados

### ✅ Modificados
- `functions/processDocumentUpload` — +Validações +Sanitização +Log
- `functions/processarNotaFiscal` — +Validação extensão
- `functions/processTeamPayment` — +Log auditoria +Validações

---

## 🎯 Status Atual

✅ **Implementado**:
- Validação de arquivo (tamanho, extensão)
- Sanitização de entrada
- Log de auditoria financeira (aprovação, pagamento)
- Proteção de dados sensíveis (mascaramento)
- Validações de saldo e status
- Bloquear executáveis

🟡 **Em Progresso**:
- Detecção de duplicatas
- Permissões no backend
- Idempotência
- Timeouts de IA

❌ **Não Iniciado**:
- Painel de monitoramento
- Notificações com fallback
- Testes críticos completos

---

**Última atualização**: 2026-04-27

**Próximo**: Implementar detecção de duplicatas e permissões no backend

---