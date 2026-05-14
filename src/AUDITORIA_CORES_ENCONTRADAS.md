# Auditoria de Cores Fora da Paleta

## Problemas Encontrados

### 1. Dashboard.jsx
- `bg-black` (linha 57) — deve ser `bg-primary`
- `text-gray-500` (linha 96) — deve ser `text-muted-foreground`
- `text-gray-600` (linha 58) — deve ser `text-muted-foreground`
- `hover:bg-gray-100` (linha 58) — deve ser `hover:bg-secondary`
- `border-gray-200` (linha 43) — deve ser `border-border`
- `bg-white` (linhas 87, 463, 479) — deve ser `bg-background`
- `text-black` (linhas 92, 483) — deve ser `text-foreground`

### 2. Sidebar.jsx
- `bg-slate-900` (linha 360) — certo, mas hardcoded; usar token
- `border-slate-800` (linhas 365, 423) — certo, mas hardcoded
- `text-slate-300` (linha 375, 402) — usar tokens
- `bg-slate-700` (linhas 383, 432) — usar tokens
- `bg-slate-200` (linha 247) — ativ state usa genérico
- `text-slate-900` (linha 247) — genérico
- `hover:bg-slate-800` (linha 258) — genérico

### 3. globals.css
- `#e5e7eb` (linhas 173, 198) — border genérico
- `#f3f4f6` (linha 181) — background genérico
- `#9ca3af` (linha 182) — text genérico
- `#d1d5db` (linha 193) — text genérico
- `#6b7280` (linhas 208, 212, 216) — ícone genérico
- `#f9fafb` (linha 200) — background genérico
- `#000` (linhas 221, 226, 231) — preto absoluto

### 4. Padrões Gerais
- Classes Tailwind hardcoded em vez de tokens CSS
- Cores inline em style attribute
- Falta uso consistente de paleta de temas
- Gráficos podem usar cores fora da paleta

## Solução

1. Definir variáveis CSS centrais para cada tipo de cor
2. Remover todos os hex soltos e cores Tailwind genéricas
3. Usar apenas: primary, secondary, border, muted, destructive, background
4. Para temas customizados: definir vars no data-theme correspondente
5. Atualizar globals.css com cores de token
6. Refatorar componentes para usar tokens em vez de Tailwind genérico

## Próximos Passos
- [ ] Atualizar globals.css com variáveis CSS
- [ ] Corrigir Dashboard.jsx
- [ ] Corrigir Sidebar.jsx
- [ ] Auditar todos os componentes UI
- [ ] Auditar gráficos e charts
- [ ] Auditar cards e badges
- [ ] Verificar tabelas
- [ ] Verificar inputs/selects/forms
- [ ] Testar temas (museubh, miro, nuit)