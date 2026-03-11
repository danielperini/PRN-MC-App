# 🚀 Quick Start - Sistema de Ajuda Contextual

## O Essencial em 2 Minutos

### 1️⃣ Para Botões Comuns (AUTOMÁTICO)

```jsx
import { AutoButton } from '@/components/help/AutoButton';

// Qualquer um desses funciona direto:
<AutoButton onClick={handleSave}>Salvar</AutoButton>
<AutoButton>Novo</AutoButton>
<AutoButton variant="destructive">Excluir</AutoButton>
<AutoButton>Editar</AutoButton>
<AutoButton>Submeter</AutoButton>
<AutoButton>Aprovar</AutoButton>
```

✅ **Auto-detecta** tipo de botão pelo label  
✅ **Gera ajuda automaticamente** com Claude  
✅ **Sem configuração extra** necessária

---

### 2️⃣ Para Campos Comuns (AUTOMÁTICO)

```jsx
import { AutoField } from '@/components/help/AutoField';

// Qualquer um desses funciona direto:
<AutoField label="Email">
  <Input type="email" />
</AutoField>

<AutoField label="Titulo">
  <Input placeholder="Nome..." />
</AutoField>

<AutoField label="Descricao">
  <Textarea />
</AutoField>
```

✅ **Auto-detecta** tipo de campo pelo label  
✅ **Gera ajuda automaticamente** com Claude  
✅ **Sem configuração extra** necessária

---

### 3️⃣ Para Elementos Customizados

```jsx
import { HelpWrapper } from '@/components/help/withContextualHelp';

<HelpWrapper
  componentKey="meu-elemento-unico"
  label="Meu Elemento"
  componentType="button" // ou: field, tab, graph, card, etc
  contextDescription="O que este elemento faz"
>
  <Button>Clique aqui</Button>
</HelpWrapper>
```

---

## 🤖 Automação - O Melhor Parte

### 1. Ajuda Gerada Automaticamente
✅ Toda vez que você usa `<AutoButton>` ou `<AutoField>`, o sistema:
- Detecta o tipo
- Procura ajuda no banco de dados
- Se não existir, Claude gera automaticamente
- Salva no banco para reutilização

### 2. Componentes Padrão Gerados Diariamente
✅ A automação `Auto-gerar Ajuda Contextual` roda **diariamente às 2am**:
- Verifica se existem textos para componentes padrão
- Gera ajudas faltantes com Claude
- Salva no banco de dados
- **Você não precisa fazer nada!**

### 3. Gerenciar Ajudas
✅ Acesse `/help-management` (Painel > Plataforma > Gerenciador de Ajuda):
- Veja todas as ajudas geradas
- Edite manualmente quando quiser
- Regenere com Claude quando precisar
- Filtrie por tipo e pesquise

---

## 📋 Componentes Automáticos Suportados

### Botões Auto-Detectados:
`Novo` | `Salvar` | `Editar` | `Excluir` | `Submeter` | `Aprovar` | `Rejeitar` | `Exportar` | `Filtrar` | `Buscar` | `Cancelar`

### Campos Auto-Detectados:
`Titulo` | `Descrição` | `Email` | `Data` | `Status`

### Itens de Menu Auto-Detectados (Sidebar):
`Dashboard` | `Relatórios` | `Calendário` | `Suprimentos` | `Usuários` | `Arquivos` | `Auditoria` | `Configurações`

---

## ✨ Fluxo Completo

```
Você escreve: <AutoButton>Salvar</AutoButton>
                    ↓
Sistema detecta: componentKey="btn-salvar", type="button"
                    ↓
Verifica banco de dados se existe ajuda
                    ↓
Não existe → Claude gera: "Salva as alterações realizadas. Use para confirmar mudanças..."
                    ↓
Salva no banco (memória + localStorage + BD)
                    ↓
Usuário passa mouse por 3 segundos
                    ↓
Tooltip aparece com ajuda elegante
```

---

## 🎯 Migração (Para App Existente)

### Antes:
```jsx
<Button onClick={handleSave}>Salvar</Button>
```

### Depois:
```jsx
<AutoButton onClick={handleSave}>Salvar</AutoButton>
```

**É só trocar `Button` por `AutoButton`!**

---

## ⚙️ Configuração Extra (Opcional)

Se quiser forçar a regeneração agora:

```bash
# No console do app:
await base44.functions.invoke('autoGenerateHelpTexts', {})
```

Resultado:
```json
{
  "generated": 25,    // Novos textos criados
  "existing": 8,      // Já existiam
  "total": 33         // Total agora
}
```

---

## 📚 Próximos Passos

1. **Imediato**: Comece trocando `<Button>` por `<AutoButton>`
2. **Hoje**: Troque `<Input>` etc por `<AutoField>`
3. **Essa semana**: Migre componentes personalizados com `<HelpWrapper>`
4. **Futuro**: Ajuste a automação conforme precisar

---

## 🆘 Troubleshooting

### A ajuda não aparece?
- Espere 3 segundos com mouse no elemento
- Verifique se está dentro de `<HelpContextProvider>` (já está no Layout.js)
- Verifique console para erros

### Quer editar uma ajuda?
- Vá para `/help-management`
- Busque pelo component key
- Clique em "Editar"

### Quer regenerar com Claude?
- `/help-management`
- Clique no ícone de regenerar (circular)
- Claude gerará novo texto

---

**Pronto! Comece a usar `<AutoButton>` e `<AutoField>` agora! 🚀**