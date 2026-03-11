# Exemplos de Implementação - Sistema de Ajuda Contextual

## 1. Sidebar (✅ JÁ IMPLEMENTADO)

```jsx
// Cada item do menu já usa HelpWrapper:
<HelpWrapper
  componentKey={`sidebar-${item.name.toLowerCase()}`}
  label={item.label}
  componentType="sidebar_item"
  contextDescription={`Item de menu para acessar ${item.label}`}
>
  <Link to={createPageUrl(item.name)}>
    <Button>{item.label}</Button>
  </Link>
</HelpWrapper>
```

---

## 2. Dashboard - Cards de Resumo

```jsx
// Exemplo para adicionar em Dashboard.jsx:

import { HelpWrapper } from '@/components/help/withContextualHelp';

// Em um card de resumo:
<HelpWrapper
  componentKey="dashboard-card-total-activities"
  label="Total de Atividades"
  componentType="card"
  contextDescription="Card exibindo o total de atividades realizadas no período"
>
  <Card className="bg-blue-50">
    <CardHeader>
      <CardTitle>Total de Atividades</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold">42</div>
    </CardContent>
  </Card>
</HelpWrapper>
```

---

## 3. ReportEditor - Campos de Formulário

```jsx
// Exemplo para adicionar em components/reports/AtividadesSection.jsx:

import { HelpFormField } from '@/components/help/HelpFormField';

<HelpFormField
  label="Título da Atividade"
  contextDescription="Nome descritivo e único da atividade realizada"
>
  <Input
    placeholder="Ex: Workshop de Fotografia - Turma A"
    value={activityData.titulo}
    onChange={(e) => updateActivity({ titulo: e.target.value })}
  />
</HelpFormField>

<HelpFormField
  label="Público Estimado"
  contextDescription="Quantidade de pessoas que participarão desta atividade"
>
  <Input
    type="number"
    placeholder="0"
    value={activityData.publico_estimado}
    onChange={(e) => updateActivity({ publico_estimado: parseInt(e.target.value) })}
  />
</HelpFormField>

<HelpFormField
  label="Classificação"
  contextDescription="META = atividade compromissada no plano de trabalho | ROTINA = atividade regular | EXTRA = além do plano"
>
  <Select value={activityData.classificacao} onValueChange={(val) => updateActivity({ classificacao: val })}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="META">META</SelectItem>
      <SelectItem value="ROTINA">ROTINA</SelectItem>
      <SelectItem value="EXTRA">EXTRA</SelectItem>
    </SelectContent>
  </Select>
</HelpFormField>
```

---

## 4. ReportEditor - Botões de Ação

```jsx
// Exemplo para adicionar em pages/ReportEditor.jsx:

import { HelpButton } from '@/components/help/HelpButton';

<div className="flex gap-2 justify-end mt-6">
  <HelpButton
    componentKey="btn-salvar-rascunho"
    label="Salvar Rascunho"
    contextDescription="Salva o relatório sem submeter para revisão"
    variant="outline"
    onClick={handleSaveDraft}
  >
    Salvar Rascunho
  </HelpButton>

  <HelpButton
    componentKey="btn-submeter-relatorio"
    label="Submeter Relatório"
    contextDescription="Envia o relatório para revisão do coordenador"
    className="bg-blue-600 hover:bg-blue-700"
    onClick={handleSubmit}
  >
    Submeter para Revisão
  </HelpButton>
</div>
```

---

## 5. Tabelas - Headers e Ações

```jsx
// Exemplo para adicionar em components/monitoring/ActivitiesTable.jsx:

import { HelpWrapper } from '@/components/help/withContextualHelp';

<table>
  <thead>
    <tr>
      <th>
        <HelpWrapper
          componentKey="table-header-titulo-atividade"
          label="Título"
          componentType="table_action"
          contextDescription="Nome da atividade realizada"
        >
          <span>Título</span>
        </HelpWrapper>
      </th>
      <th>
        <HelpWrapper
          componentKey="table-header-data-realizacao"
          label="Data"
          componentType="table_action"
          contextDescription="Data em que a atividade foi realizada"
        >
          <span>Data</span>
        </HelpWrapper>
      </th>
      <th>
        <HelpWrapper
          componentKey="table-header-publico"
          label="Público"
          componentType="table_action"
          contextDescription="Quantidade de participantes"
        >
          <span>Público</span>
        </HelpWrapper>
      </th>
    </tr>
  </thead>
  <tbody>
    {/* linhas da tabela */}
  </tbody>
</table>

// Ações em linha:
<HelpWrapper
  componentKey={`table-action-edit-${activity.id}`}
  label="Editar"
  componentType="table_action"
  contextDescription="Abre a atividade para edição de detalhes"
>
  <Button
    size="sm"
    variant="ghost"
    onClick={() => handleEdit(activity.id)}
  >
    Editar
  </Button>
</HelpWrapper>

<HelpWrapper
  componentKey={`table-action-delete-${activity.id}`}
  label="Excluir"
  componentType="table_action"
  contextDescription="Remove a atividade do relatório"
>
  <Button
    size="sm"
    variant="ghost"
    onClick={() => handleDelete(activity.id)}
  >
    Excluir
  </Button>
</HelpWrapper>
```

---

## 6. Filtros

```jsx
// Exemplo para adicionar em components/dashboard/AdvancedFilters.jsx:

import { HelpFormField } from '@/components/help/HelpFormField';

<div className="flex gap-4">
  <HelpFormField
    label="Status"
    contextDescription="Filtra atividades por status (rascunho, submetido, aprovado)"
  >
    <Select value={filterStatus} onValueChange={setFilterStatus}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={null}>Todos</SelectItem>
        <SelectItem value="DRAFT">Rascunho</SelectItem>
        <SelectItem value="SUBMITTED">Submetido</SelectItem>
        <SelectItem value="APPROVED">Aprovado</SelectItem>
      </SelectContent>
    </Select>
  </HelpFormField>

  <HelpFormField
    label="Período"
    contextDescription="Data inicial e final para filtrar relatórios"
  >
    <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
  </HelpFormField>

  <HelpButton
    componentKey="btn-aplicar-filtro"
    label="Aplicar"
    contextDescription="Aplica os filtros selecionados"
    onClick={handleApplyFilters}
  >
    Aplicar
  </HelpButton>
</div>
```

---

## 7. Gráficos

```jsx
// Exemplo para adicionar em components/dashboard/TrendChart.jsx:

import { HelpWrapper } from '@/components/help/withContextualHelp';

<HelpWrapper
  componentKey="chart-tendencia-atividades"
  label="Tendência de Atividades"
  componentType="graph"
  contextDescription="Gráfico de linha mostrando evolução do número de atividades ao longo dos meses"
>
  <div className="w-full h-96">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="atividades" stroke="#3b82f6" />
      </LineChart>
    </ResponsiveContainer>
  </div>
</HelpWrapper>
```

---

## 8. Abas

```jsx
// Exemplo para adicionar em pages/Compras.jsx:

import { HelpWrapper } from '@/components/help/withContextualHelp';

<Tabs defaultValue="compras">
  <TabsList>
    <HelpWrapper
      componentKey="tab-compras"
      label="Compras"
      componentType="tab"
      contextDescription="Visualize e gerencie solicitações de compra"
    >
      <TabsTrigger value="compras">Compras</TabsTrigger>
    </HelpWrapper>

    <HelpWrapper
      componentKey="tab-orcamento"
      label="Orçamento"
      componentType="tab"
      contextDescription="Controle de rubricas, saldos e disponibilidade financeira"
    >
      <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
    </HelpWrapper>

    <HelpWrapper
      componentKey="tab-relatorio-financeiro"
      label="Relatório"
      componentType="tab"
      contextDescription="Visualize relatórios e extrato financeiro consolidado"
    >
      <TabsTrigger value="relatorio">Relatório</TabsTrigger>
    </HelpWrapper>
  </TabsList>

  <TabsContent value="compras">
    {/* conteúdo */}
  </TabsContent>
  {/* outros tabs */}
</Tabs>
```

---

## 9. Menus Dropdown

```jsx
// Exemplo para adicionar em components/reports/ReportGenerator.jsx:

import { HelpWrapper } from '@/components/help/withContextualHelp';

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <HelpButton
      componentKey="btn-menu-exportar"
      label="Exportar"
      contextDescription="Menu com opções para exportar e salvar relatórios"
      variant="outline"
    >
      Exportar
    </HelpButton>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <HelpWrapper
      componentKey="menu-export-pdf"
      label="Exportar como PDF"
      componentType="menu_item"
      contextDescription="Gera um arquivo PDF com o relatório formatado"
    >
      <DropdownMenuItem onClick={handleExportPDF}>
        📄 PDF
      </DropdownMenuItem>
    </HelpWrapper>

    <HelpWrapper
      componentKey="menu-export-excel"
      label="Exportar como Excel"
      componentType="menu_item"
      contextDescription="Gera um arquivo Excel com dados estruturados para análise"
    >
      <DropdownMenuItem onClick={handleExportExcel}>
        📊 Excel
      </DropdownMenuItem>
    </HelpWrapper>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## 10. Checkboxes e Radios

```jsx
// Exemplo para adicionar em formulários:

import { HelpWrapper } from '@/components/help/withContextualHelp';

<HelpWrapper
  componentKey="checkbox-acessibilidade-total"
  label="Acessibilidade Total"
  componentType="field"
  contextDescription="Marca se a atividade possui total acessibilidade (física, visual, auditiva)"
>
  <div className="flex items-center gap-2">
    <Checkbox
      id="access-total"
      checked={activity.acessibilidade === 'Total'}
      onCheckedChange={(checked) => {
        if (checked) updateActivity({ acessibilidade: 'Total' });
      }}
    />
    <label htmlFor="access-total">Acessibilidade Total</label>
  </div>
</HelpWrapper>
```

---

## 11. Upload de Arquivos

```jsx
// Exemplo para adicionar em components/reports/ActivityAttachments.jsx:

import { HelpWrapper } from '@/components/help/withContextualHelp';

<HelpWrapper
  componentKey="upload-foto-atividade"
  label="Upload de Foto"
  componentType="upload"
  contextDescription="Envie foto(s) da atividade para documenter e divulgar"
>
  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer">
    <Upload className="w-8 h-8 mx-auto mb-2" />
    <p>Clique para selecionar ou arraste arquivo</p>
  </div>
</HelpWrapper>
```

---

## 12. Indicadores

```jsx
// Exemplo para adicionar em componentes de dashboard:

import { HelpWrapper } from '@/components/help/withContextualHelp';

<HelpWrapper
  componentKey="indicator-compliance-rate"
  label="Taxa de Conformidade"
  componentType="indicator"
  contextDescription="Percentual de relatórios submetidos dentro do prazo limite"
>
  <div className="text-center">
    <div className="text-4xl font-bold text-green-600">94%</div>
    <p className="text-sm text-slate-600">Taxa de Conformidade</p>
  </div>
</HelpWrapper>
```

---

## ⚡ Aplicação Rápida

### Template Genérico:

```jsx
<HelpWrapper
  componentKey="unique-id-here"
  label="Nome do Elemento"
  componentType="button|field|filter|tab|graph|card|menu_item|table_action|workflow_action|indicator|upload|map_widget|sidebar_item|other"
  contextDescription="O que este elemento faz"
>
  {/* Seu elemento aqui */}
</HelpWrapper>
```

### Shortcuts Recomendados:

```jsx
// Para botões: use HelpButton
<HelpButton componentKey="..." label="..." contextDescription="...">...</HelpButton>

// Para campos: use HelpFormField
<HelpFormField label="..." contextDescription="..."><Input /></HelpFormField>

// Para o resto: use HelpWrapper
<HelpWrapper componentKey="..." label="..." componentType="..." contextDescription="...">
  {/* elemento */}
</HelpWrapper>
```

---

**Pronto para começar! Copie e adapte os exemplos acima para sua aplicação.** 🚀