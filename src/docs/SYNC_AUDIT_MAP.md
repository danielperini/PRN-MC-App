# SYNC_AUDIT_MAP — Mapa de Auditoria de Sincronização
> Gerado em 2026-07-18 | Fase A+B do plano de canonicalização de métricas

---

## 1. Indicadores Visíveis e Suas Fontes Canônicas

| Indicador | Entidade fonte | Campo(s) | Função canônica | Observação |
|---|---|---|---|---|
| Público Total (Dashboard) | `Programacao` (atividades) | `CAMPOS_PUBLICO` (10 aliases) | `calcularTotalPublico(atividades)` | Soma via `resolvePublico` |
| Público por Museu | `Programacao` | `museu`, `unidade`, `centro_custo` + CAMPOS_PUBLICO | `calcularAtividadesPeriodo` + `calcularTotalPublico` | Agrupado no `sincronizarRelatorioExecucao` |
| Público Geral Declarado | `Report` | `publico_geral_declarado` | direto — não entra na soma de atividades | Campo separado exibido no Dashboard |
| Realizado por Rubrica | `PurchaseRequest` | `valor_pago / valor_aprovado_admin / valor_aprovado / valor_solicitado` | `calcularRealizadoRubrica(compras, rubricaId)` | Status: APROVADO, APROVADO_COORD, APROVADO_ADMIN, PAGO |
| Saldo de Rubrica | `Rubrica` | `valor_rubrica - valor_utilizado` | `calcularSaldoRubrica(rubrica)` | `valor_utilizado` atualizado por `syncRubricaOnPurchaseStatusChange` |
| Total Orçado (3º Aditivo) | constante | `OFFICIAL_ADITIVO_TOTAL = 1.320.000` | `reconcileFinancialTotals` | Definido em `reconcileFinancialTotals.js` |
| Total Executado | `PurchaseRequest` + `Rubrica.valor_utilizado` | `valor_utilizado` (Rubrica) | `getRubricaUsed` / `reconcileFinancialTotals` | Dupla fonte — pode divergir |
| Atividades no Período | `Programacao` | `data / data_atividade / data_inicio` | `calcularAtividadesPeriodo(atividades, inicio, fim, museu)` | Filtro por CAMPOS_DATA |
| Notas Fiscais Aprovadas | `PurchaseRequest` | `status IN (APROVADO*)`, `nf_data_emissao` | `calcularNotasPeriodo(compras, inicio, fim)` | |
| Fotos da Galeria | `Attachment` + `ReportPhoto` | `file_url / foto_url / image_url` | `resolveFotoUrl` + paginação em `galleryReportData.js` | Deduplicação por URL base |

---

## 2. Eventos de Sincronização — Produtores e Consumidores

| Evento | Produtores (emit) | Consumidores (listen) | O que invalida |
|---|---|---|---|
| `rubricas:sync` | `AutoRubricasSync.jsx` (useEffect), `Layout.jsx` (pull-to-refresh) | `AutoRubricasSync.jsx`, componentes de Rubricas | Cache local de rubricas, totais orçamentários |
| `rubricas:recalculadas` | `AutoRubricasSync.jsx` (pós-sincronização) | `RubricasGrid`, `OrcamentoDashboard`, `BudgetHealthDashboard` | Totais de orçamento por museu/grupo |
| `purchase:changed` | `purchaseActions` (backend → frontend event), `PurchaseFormDialog` | `TabelaSolicitacoes`, `AprovacoesFila`, `DashboardFinanceiro` | Lista de compras, totais por rubrica |
| `dashboard:update` | `syncDashboardDataFromReports` (backend), `refreshDashboardData` (backend) | `Dashboard.jsx`, `DashboardProfissional.jsx` | Todos os KPIs do dashboard |
| `notas-drive:sync` | `AutoNotasDriveSync.jsx`, `Layout.jsx` (pull-to-refresh) | `AutoNotasDriveSync.jsx`, `ConferenciaNotasDrive` | Cache de NFs do Drive |
| `gallery:sync` | não há emissão sistemática atualmente | `GaleriaFotos.jsx` via invalidação manual | Cache da galeria (chave v7_deduped) |

---

## 3. Funções de Cálculo Existentes e Localização

### Antes da canonicalização (código disperso)

| Função/Lógica | Arquivo original | Status |
|---|---|---|
| `publico(item)` — resolve público de um item | `sincronizarRelatorioExecucao.js` L128 | ✅ Migrado → `resolvePublico` em `fieldResolvers.js` |
| `valor(item)` — resolve valor financeiro | `sincronizarRelatorioExecucao.js` L118 | ✅ Migrado → `resolveValor` em `fieldResolvers.js` |
| `primeiro(item, campos)` — primeiro campo não-nulo | `sincronizarRelatorioExecucao.js` L25 | ✅ Migrado → `primeiroCampo` em `fieldResolvers.js` |
| `dataISO(value)` — extrai data YYYY-MM-DD | `sincronizarRelatorioExecucao.js` L17 | ✅ Migrado → `resolveData` em `fieldResolvers.js` |
| `extrairMetaId(item)` | `sincronizarRelatorioExecucao.js` L42 | ✅ Migrado → `resolveMetaId` em `fieldResolvers.js` |
| `extrairMetaNome(item)` | `sincronizarRelatorioExecucao.js` L49 | ✅ Migrado → `resolveMetaNome` em `fieldResolvers.js` |
| `dentroPeriodo(item, inicio, fim)` | `sincronizarRelatorioExecucao.js` L91 | ✅ Canonicalizado → `calcularAtividadesPeriodo` em `canonicalMetrics.js` |
| `getRubricaBudget(rubrica)` | `reconcileFinancialTotals.js` L6 | Mantido — especializado em rubricas com aliases de planilha |
| `getRubricaUsed(rubrica)` | `reconcileFinancialTotals.js` L19 | Mantido — especializado; `calcularSaldoRubrica` usa lógica equivalente |
| `reconcileFinancialTotals(rubricas)` | `reconcileFinancialTotals.js` L30 | Mantido — orquestrador completo de reconciliação |

### Funções canônicas criadas (Fase B)

| Função | Arquivo | Descrição |
|---|---|---|
| `resolvePublico(item)` | `src/utils/fieldResolvers.js` | Resolve público de qualquer entidade via CAMPOS_PUBLICO |
| `resolveValor(item)` | `src/utils/fieldResolvers.js` | Resolve valor financeiro via CAMPOS_VALOR |
| `resolveMetaId(item)` | `src/utils/fieldResolvers.js` | Resolve ID de meta via CAMPOS_META_ID + objetos aninhados |
| `resolveMetaNome(item)` | `src/utils/fieldResolvers.js` | Resolve nome de meta via CAMPOS_META_NOME |
| `resolveData(item)` | `src/utils/fieldResolvers.js` | Extrai data ISO de qualquer campo de data |
| `resolveFotoUrl(item)` | `src/utils/fieldResolvers.js` | Resolve URL de foto via CAMPOS_FOTO |
| `primeiroCampo(item, campos)` | `src/utils/fieldResolvers.js` | Helper genérico de resolução por lista de campos |
| `calcularTotalPublico(atividades)` | `src/services/canonicalMetrics.js` | Soma público total de um array de atividades |
| `calcularRealizadoRubrica(compras, rubricaId)` | `src/services/canonicalMetrics.js` | Soma realizado de compras por rubrica |
| `calcularSaldoRubrica(rubrica)` | `src/services/canonicalMetrics.js` | Calcula saldo de uma rubrica |
| `calcularAtividadesPeriodo(atividades, inicio, fim, museu)` | `src/services/canonicalMetrics.js` | Filtra atividades por período e museu |
| `calcularNotasPeriodo(compras, inicio, fim)` | `src/services/canonicalMetrics.js` | Filtra e soma NFs aprovadas no período |
| `SyncOrchestrator.emit(evento, payload)` | `src/services/SyncOrchestrator.js` | Emite evento + window.dispatchEvent retroativamente |
| `SyncOrchestrator.on(evento, handler)` | `src/services/SyncOrchestrator.js` | Registra listener com retorno de unsub |
| `SyncOrchestrator.invalidateQueries(queryClient, escopo)` | `src/services/SyncOrchestrator.js` | Invalida queries React Query por escopo |

---

## 4. Divergências Identificadas (Fase A)

| Indicador | Fonte A | Fonte B | Divergência provável |
|---|---|---|---|
| Público total | `Programacao.CAMPOS_PUBLICO` (10 campos) | `Report.publico_geral_declarado` (campo único) | Dashboard mostra ambos separados; relatórios que não filtram por source somam os dois |
| Realizado por rubrica | `Rubrica.valor_utilizado` (campo persistido) | Soma live de `PurchaseRequest` aprovadas | `valor_utilizado` pode estar desatualizado se `syncRubricaOnPurchaseStatusChange` falhou |
| Total orçado | `OFFICIAL_ADITIVO_TOTAL = 1.320.000` (hardcoded) | Soma de `Rubrica.valor_rubrica` | Diverge quando rubricas inativas ou de crédito são incluídas na soma |
| Data de atividade | `Programacao.data` | `Activity.data_realizacao` | Agenda usa `Programacao`; relatórios mensais usam `Activity` — mesma atividade pode ter datas diferentes |
| ID de meta | 10 aliases em CAMPOS_META_ID | `Activity.meta_id` direto | Compras não vinculadas via `meta_id` mas via texto do campo `rubrica_nome` ignoram `resolveMetaId` |

---

## 5. Arquivos que Devem Migrar para os Módulos Canônicos (Próximas Fases)

| Arquivo | O que migrar | Módulo destino |
|---|---|---|
| `sincronizarRelatorioExecucao.js` | Constantes CAMPOS_* e funções `publico/valor/dataISO/primeiro` (já reimportando) | `fieldResolvers.js` ✅ feito |
| `reconcileFinancialTotals.js` | `getRubricaUsed` pode delegar para `resolveValor` | `fieldResolvers.js` — fase futura |
| `AutoRubricasSync.jsx` | `window.dispatchEvent('rubricas:sync')` | `SyncOrchestrator.emit('rubricas:sync')` |
| `AutoNotasDriveSync.jsx` | `window.dispatchEvent('notas-drive:sync')` | `SyncOrchestrator.emit('notas-drive:sync')` |
| `Layout.jsx` (pull-to-refresh) | `window.dispatchEvent('rubricas:sync')` + `'notas-drive:sync'` | `SyncOrchestrator.emit(...)` |
| `compras/RecalcularTotaisButton.jsx` | `window.dispatchEvent('rubricas:recalculadas')` | `SyncOrchestrator.emit(...)` |
| `Dashboard.jsx`, `DashboardProfissional.jsx` | Cálculo inline de público e saldo | `calcularTotalPublico`, `calcularSaldoRubrica` |
| `DashboardFinanceiro.jsx` | Soma inline de compras por rubrica | `calcularRealizadoRubrica` |
| `reconcileActivities.js`, `reconcileGallery.js` | `primeiro(item, CAMPOS_*)` local | `primeiroCampo` de `fieldResolvers.js` |
| `galleryReportData.js` | Lógica de data/foto inline | `resolveData`, `resolveFotoUrl` |

---

*Este documento é atualizado a cada fase de canonicalização. Próxima fase: migrar emissão de eventos para SyncOrchestrator.*