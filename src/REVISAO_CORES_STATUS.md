# Revisão Global de Cores — Status

## ✅ Corrigido

### globals.css
- [x] Rich Text Editor: `#e5e7eb`, `#f3f4f6`, `#9ca3af`, `#d1d5db`, `#6b7280`, `#f9fafb`, `#000` → tokens CSS
- [x] Diálogos/modais: `border border-black/10`, `bg-white` → `border-border`, `bg-card`

### Dashboard.jsx
- [x] `bg-white` → `bg-background`
- [x] `text-black` → `text-foreground`
- [x] `text-gray-500` / `text-gray-600` → `text-muted-foreground`
- [x] `border-gray-200` → `border-border`
- [x] `bg-gray-100` → `bg-secondary`
- [x] `bg-black` / `hover:bg-black` → `bg-primary` / `hover:bg-primary/90`

### Sidebar.jsx
- [x] `bg-slate-900` → `bg-primary`
- [x] `border-slate-800` → `border-border`
- [x] `text-slate-*` → tokens (foreground, muted-foreground, primary-foreground)
- [x] `bg-slate-700` → `bg-primary/80`
- [x] Estado ativo: `bg-slate-200` / `text-slate-900` → `bg-secondary` / `text-secondary-foreground`

### PurchaseCard.jsx
- [x] `bg-white`, `border-black`, `text-black` → tokens
- [x] `bg-gray-300`, `text-gray-600` → `bg-muted`, `text-muted-foreground`
- [x] `bg-green-600`, `hover:bg-green-700` → `bg-primary`, `hover:bg-primary/90`
- [x] `text-blue-700` → `text-primary`
- [x] `text-gray-400` → `text-muted-foreground`
- [x] `border-gray-300` → `border-border`

---

## ⏳ Ainda Falta Auditar

### Pages (principais)
- [ ] pages/Compras.jsx
- [ ] pages/Relatorios.jsx
- [ ] pages/ReportEditor.jsx
- [ ] pages/GaleriaFotos.jsx
- [ ] pages/ComunicacaoVisibilidade.jsx
- [ ] pages/EntradaUnica.jsx
- [ ] pages/GestaoDocumental.jsx
- [ ] pages/DashboardProfissional.jsx
- [ ] pages/DashboardPatrocinador.jsx
- [ ] pages/UserManagement.jsx
- [ ] pages/PlataformaAdmin.jsx
- [ ] pages/Agenda.jsx
- [ ] pages/RubricasPorMuseu.jsx
- [ ] pages/CoordReview.jsx
- [ ] pages/Fornecedores.jsx
- [ ] pages/BaseConhecimento.jsx

### Componentes UI (críticos)
- [ ] components/ui/button.jsx
- [ ] components/ui/input.jsx
- [ ] components/ui/card.jsx
- [ ] components/ui/select.jsx
- [ ] components/ui/tabs.jsx
- [ ] components/ui/dialog.jsx
- [ ] components/ui/alert.jsx
- [ ] components/ui/badge.jsx (revisar variants)
- [ ] components/ui/table.jsx
- [ ] components/ui/tooltip.jsx

### Componentes Dashboard
- [ ] components/dashboard/ExecutiveIndicators.jsx
- [ ] components/dashboard/NewsCarousel.jsx
- [ ] components/dashboard/GeneralStatsCards.jsx
- [ ] components/dashboard/ComplianceStats.jsx
- [ ] components/dashboard/CoordDashboard.jsx
- [ ] components/dashboard/DiariamenteNosMuseus.jsx
- [ ] components/dashboard/DashboardPatrocinador.jsx

### Componentes Compras
- [ ] components/compras/PurchaseFormDialog.jsx
- [ ] components/compras/OrcamentoDashboard.jsx
- [ ] components/compras/RubricasGrid.jsx
- [ ] components/compras/TeamManager.jsx
- [ ] components/compras/BudgetHealthDashboard.jsx
- [ ] components/compras/AprovacoesFila.jsx

### Componentes Relatórios
- [ ] components/reports/ActivitySummary.jsx
- [ ] components/reports/ActivityFilters.jsx
- [ ] components/reports/ReportCard.jsx
- [ ] components/reports/PDFGeneratorDialog.jsx
- [ ] components/reports/ExportPDF.jsx
- [ ] components/reports/RichTextEditor.jsx

### Componentes Entrada Única
- [ ] components/entrada/DocumentIntakeCard.jsx
- [ ] components/entrada/DocumentCoordPanel.jsx
- [ ] components/entrada/ReviewModalNF.jsx
- [ ] components/entrada/ReviewModalFoto.jsx
- [ ] components/entrada/ReviewModalDocAdmin.jsx

### Componentes Comunicação
- [ ] components/comunicacao/ClippingAutomatico.jsx
- [ ] components/comunicacao/SintesseIA.jsx
- [ ] components/comunicacao/RedesSociaisPanel.jsx
- [ ] components/comunicacao/ImpactoMuseu.jsx
- [ ] components/comunicacao/KeywordsCloud.jsx

### Gráficos (charts)
- [ ] Verificar colors em Recharts
- [ ] Usar palette do tailwind.config.js (--chart-1 a --chart-5)
- [ ] Não usar cores hardcoded em dados

### Tabelas
- [ ] Verificar zebra striping
- [ ] Verificar hover states
- [ ] Verificar header background
- [ ] Verificar borders

### Forms e Inputs
- [ ] Verificar focus states
- [ ] Verificar disabled states
- [ ] Verificar error states
- [ ] Verificar placeholder colors

### Modais e Dialogs
- [ ] Backdrop colors
- [ ] Close button colors
- [ ] Button colors
- [ ] Border colors

---

## 📝 Padrão de Correção

Para cada componente/página:

1. Substituir `bg-white` → `bg-card` ou `bg-background`
2. Substituir `text-black` → `text-foreground`
3. Substituir `border-gray-*`, `border-slate-*` → `border-border`
4. Substituir `text-gray-*`, `text-slate-*` → `text-foreground` ou `text-muted-foreground`
5. Substituir `bg-gray-*`, `bg-slate-*` → `bg-secondary` ou `bg-muted`
6. Substituir `text-blue-*` → `text-primary`
7. Substituir `bg-green-*`, `bg-red-*`, `bg-yellow-*` → cores de status apropriadas
8. Verificar `hover:`, `focus:`, `active:` states
9. Testar em temas: default, museubh, miro, nuit

---

## 🎨 Mapeamento de Cores

| Uso | Atual (ERRADO) | Novo (TOKEN) |
|-----|---|---|
| Fundo principal | `bg-white` | `bg-background` |
| Fundo card | `bg-white` | `bg-card` |
| Texto principal | `text-black` | `text-foreground` |
| Texto secundário | `text-gray-*` | `text-muted-foreground` |
| Bordas | `border-gray-200` | `border-border` |
| Fundo hover | `bg-gray-100` | `bg-secondary` |
| Botão primário | `bg-black` | `bg-primary` |
| Botão primário text | `text-white` | `text-primary-foreground` |
| Link/Ênfase | `text-blue-*` | `text-primary` |
| Status sucesso | `bg-green-*` | Usar variant em Badge |
| Status erro | `bg-red-*` | Usar `destructive` |
| Status alerta | `bg-yellow-*` | Usar `accent` |
| Disabled | `bg-gray-300` | `bg-muted` |

---

## 🔍 Buscar Rápido no Código

Para encontrar cores fora da paleta, procurar por:

```
bg-white
bg-black
text-black
text-white
border-gray-
border-slate-
text-gray-
text-slate-
bg-gray-
bg-slate-
text-blue-
text-red-
text-green-
text-yellow-
#e5e7eb
#f3f4f6
#9ca3af
#d1d5db
#6b7280
#f9fafb
#000
#fff
```

---

## ✨ Benefícios da Revisão

1. ✅ Consistência visual em todo o app
2. ✅ Suporte a temas (museubh, miro, nuit) funcionando
3. ✅ Accessibility: contraste WCAG AA
4. ✅ Manutenção: mudar paleta é simples (só trocar CSS vars)
5. ✅ Profissionalismo: identidade visual consolidada

---

**Data de início:** 2026-05-14  
**Status:** 🔄 Em progresso  
**Próximas ações:** Auditar pages e componentes restantes