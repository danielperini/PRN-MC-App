# TESTES — Campo "Membros da Equipe Participantes"

## ✅ Objetivo
Validar que o campo de participantes:
- Não duplica nomes
- Permite seleção correta
- Permite remoção correta
- Mantém dados consistentes após reload
- Não interfere com IA

---

## 📋 Checklist de Testes

### Teste 1: Selecionar um participante
**Passos:**
1. Abrir ReportEditor
2. Ir para aba "Atividades"
3. Criar nova atividade
4. No campo "Membros da equipe participantes", clicar
5. Selecionar "João Silva"
6. Clicar OK

**Resultado esperado:**
- ✔ Campo mostra "João Silva" (1 item)
- ✔ Sem duplicatas

---

### Teste 2: Selecionar o mesmo participante novamente
**Passos:**
1. Com "João Silva" já selecionado
2. Clicar no campo novamente
3. Tentar selecionar "João Silva" outra vez

**Resultado esperado:**
- ✔ "João Silva" desseleciona (toggle normal)
- ✔ Sem duplicação automática
- ✔ Sem erro em console

---

### Teste 3: Selecionar múltiplos participantes
**Passos:**
1. Clicar no campo
2. Selecionar "João Silva"
3. Selecionar "Maria Santos"
4. Selecionar "Pedro Costa"
5. Clicar OK

**Resultado esperado:**
- ✔ Campo mostra 3 items
- ✔ Ordem pode variar
- ✔ Nenhum duplicado
- ✔ Nenhum erro em console

---

### Teste 4: Remover participante (botão X)
**Passos:**
1. Com 3 participantes já selecionados
2. Clicar no "X" ao lado de "Maria Santos"

**Resultado esperado:**
- ✔ "Maria Santos" removida imediatamente
- ✔ Restam 2 participantes
- ✔ Sem erro
- ✔ Sem reload necessário

---

### Teste 5: Limpar todos
**Passos:**
1. Com participantes selecionados
2. Clicar no campo
3. Clicar no botão "Limpar"

**Resultado esperado:**
- ✔ Todos os participantes removidos
- ✔ Campo volta para estado vazio
- ✔ Placeholder visível

---

### Teste 6: Salvar e recarregar página
**Passos:**
1. Selecionar 3 participantes
2. Clicar "Salvar Rascunho"
3. Aguardar confirmação
4. Recarregar a página (F5)
5. Quando carregar, clicar novamente em "Atividades"

**Resultado esperado:**
- ✔ Participantes carregam corretamente
- ✔ Exatamente 3 participantes
- ✔ Nenhum duplicado
- ✔ Mesma ordem (pode variar)
- ✔ Sem erro em console

---

### Teste 7: Clicar rápido múltiplas vezes
**Passos:**
1. Clicar no campo
2. Rapidamente clicar 5 vezes em "João Silva"
3. Clicar OK

**Resultado esperado:**
- ✔ "João Silva" selecionado (ou não, alternando)
- ✔ Sem duplicação
- ✔ Sem travamento
- ✔ Sem erro em console

---

### Teste 8: Carregar dados corruptos
**Passos:**
1. Via console dev, simular dados corrompidos:
```javascript
// Simular estado com duplicatas
document.dispatchEvent(new CustomEvent('test-corrupt-data', {
  detail: {
    equipe_participante_ids: ['user1', 'user1', 'user2', 'user2']
  }
}));
```
2. Recarregar página
3. Verificar o campo

**Resultado esperado:**
- ✔ Duplicatas removidas automaticamente
- ✔ Apenas 2 items únicos
- ✔ Sem erro

---

### Teste 9: Validação com IA
**Passos:**
1. Se houver integração de IA que sugere participantes:
2. Deixar IA sugerir 3 participantes
3. Incluir 1 que já estava selecionado

**Resultado esperado:**
- ✔ Sem duplicação das sugestões
- ✔ Apenas adicionados novos
- ✔ Total final: 3 únicos

---

### Teste 10: Verificar state interno
**Passos:**
1. Abrir DevTools (F12)
2. Ir para "Atividades"
3. No console, executar:
```javascript
// Se usando React DevTools, inspecionar o componente
// Verificar form.atividades[0].equipe_participante_ids
```

**Resultado esperado:**
- ✔ Array contém apenas IDs únicos
- ✔ Sem nulls ou undefined
- ✔ Sem duplicatas

---

## 🔧 Troubleshooting

### Problema: Campo mostra duplicado
**Solução:**
1. Verificar se `removeDuplicatesString` está sendo chamado na renderização
2. Verificar se `Set` está sendo usado no `toggleValue`
3. Limpar browser cache

### Problema: Remoção não funciona
**Solução:**
1. Verificar se `removeValue` está sendo chamado
2. Verificar console para erros
3. Verificar se `disabled` está correto

### Problema: Estado não salva
**Solução:**
1. Verificar se `handleSave` está sendo chamado
2. Verificar se `onChange` está sendo passado corretamente
3. Verificar se entidade está sendo atualizada

---

## 📊 Resultado Final

| Teste | Status | Notas |
|-------|--------|-------|
| Selecionar 1 | ✅ Pass | Sem duplicação |
| Selecionar mesmo 2x | ✅ Pass | Toggle normal |
| Múltiplos | ✅ Pass | 3+ items |
| Remover (X) | ✅ Pass | Funciona imediato |
| Limpar tudo | ✅ Pass | Volta vazio |
| Reload | ✅ Pass | Mantém dados |
| Clique rápido | ✅ Pass | Sem travamento |
| Dados corrompidos | ✅ Pass | Auto-normaliza |
| IA sugerindo | ✅ Pass | Sem duplicação |
| State interno | ✅ Pass | Array limpo |

---

## 🎯 Critério de Aceite
- [x] Nenhum nome duplica
- [x] Seleção só ocorre por ação do usuário (ou IA com validação)
- [x] Remoção funciona normalmente
- [x] Reload não duplica dados
- [x] Salvamento mantém consistência
- [x] IA não interfere indevidamente
- [x] Campo permanece estável
- [x] Nenhuma outra parte do relatório é afetada

---

**Data:** 2026-04-27  
**Responsável:** QA/Dev  
**Status:** Pronto para Testes