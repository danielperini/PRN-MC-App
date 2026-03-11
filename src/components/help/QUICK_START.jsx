# 🚀 Quick Start - Sistema de Ajuda Contextual (v3.0)

## O Essencial em 2 Minutos

**⚡ NOVO: Sistema 100% automático com Claude!**
Menos configuração, mais ajuda inteligente.

---

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

1. **HOJE**: Comece trocando `<Button>` por `<AutoButton>` em novos componentes
2. **ESSA SEMANA**: Migre componentes importantes para `<AutoField>` 
3. **ESSE MÊS**: Revise ajudas geradas em `/help-management` → customize conforme precisar
4. **CONTÍNUO**: Adicione novos elementos com Auto* e Claude gera ajuda automaticamente

---

## 🆘 Troubleshooting

### A ajuda não aparece ao passar mouse?
- ✓ Espere 3+ segundos (tempo mínimo para tooltip)
- ✓ Verifique console do navegador (F12 → Console)
- ✓ Confirme que HelpContextProvider está no Layout.js
- ✓ Tente atualizar página (Ctrl+Shift+R)

### Ajuda aparece genérica ou errada?
- Acesse `/help-management`
- Busque pelo component key (ex: "btn-salvar")
- Clique "Editar" e customize manualmente
- Ou clique "Regenerar" para Claude recriar

### Quero gerar ajudas para componentes novos?
```bash
# No console da página:
await base44.functions.invoke('autoGenerateHelpTexts', {})
```
Claude gerará automaticamente para componentes sem ajuda.

### Como adiciono ajuda para elemento customizado?
```jsx
import { HelpWrapper } from '@/components/help/withContextualHelp';

<HelpWrapper
  componentKey="meu-elemento-unico"
  label="Meu Elemento"
  componentType="button"
  contextDescription="O que faz"
>
  <Button>Clique aqui</Button>
</HelpWrapper>
```

---

## 📊 Estatísticas (Dashboard)

Acesse `/help-management` para ver:
- ✅ Total de ajudas geradas: 50+
- 🤖 Modelo de IA usado: Claude 3.5 Sonnet
- 📝 Ajudas customizadas manualmente: 15
- ⏱️ Última automação: Hoje às 2am

---

## 🎁 Bônus: Atalhos de Teclado

- `?` (interrogação): Abre ajuda geral (em qualquer página)
- `Hover 3s`: Mostra tooltip de ajuda
- `/help-management`: Painel completo de gerenciamento

---

**Pronto! Comece usando `<AutoButton>` e `<AutoField>` em novos componentes! 🚀**