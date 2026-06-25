# Documentação de Fluxos de Backup - Museus Centro

## Visão Geral

O sistema possui dois fluxos principais de backup no Google Drive:
1. **Backup de Relatórios** (PDFs de relatórios mensais, parciais e finais)
2. **Backup de Notas Fiscais** (PDFs, XMLs e documentos complementares)

---

## 1. BACKUP DE RELATÓRIOS

### Função Principal
- **Arquivo:** `functions/backupRelatoriosDrive.js`
- **Trigger:** Botão "Backup Relatórios" na página de Compras (coordenadores)
- **Execução:** Paginada em lotes de 10 relatórios

### Estrutura de Pastas no Drive
```
Relatórios/
├── Relatórios Mensais/
│   └── 2026/
│       └── Junho/
│           └── Relatorio_mensal_Junho_2026_MHAB.pdf
├── Relatórios Parciais/
│   └── 2026/
│       └── Maio/
│           └── Relatorio_parcial_Maio_2026_MIS.pdf
└── Relatórios Finais/
    └── 2026/
        └── Abril/
            └── Relatorio_final_Abril_2026_MUMO.pdf
```

### Fluxo de Execução

```
1. Usuário clica em "Backup Relatórios"
   ↓
2. Função busca relatórios aprovados com PDF (limite: 10 por lote)
   ↓
3. Para cada relatório:
   a. Verifica se já tem backup recente (< 24h) → Pula se existir
   b. Determina tipo (mensal/parcial/final) e subpasta correspondente
   c. Busca/cria pasta: Relatórios → [Tipo] → [Ano] → [Mês]
   d. Verifica se arquivo já existe no Drive (por nome)
   e. Se não existe:
      - Download do PDF da URL (export_pdf_url ou pdf_url)
      - Upload para Google Drive com nome padronizado
   f. Atualiza entidade Report:
      - drive_backup_relatorio_url
      - drive_backup_relatorio_id
      - drive_backup_status: 'concluido'
      - drive_backup_at: timestamp
   ↓
4. Retorna estatísticas: processados, erros, temMais, cursor
   ↓
5. Se temMais=true, usuário pode continuar próximo lote
```

### Nome Padronizado de Arquivo
```
Relatorio_[tipo]_[mes]_[ano]_[museu].pdf

Exemplos:
- Relatorio_mensal_Junho_2026_MHAB.pdf
- Relatorio_parcial_Maio_2026_MIS.pdf
- Relatorio_final_Abril_2026_MUMO.pdf
```

### Campos Atualizados na Entidade Report
```javascript
{
  drive_backup_relatorio_url: "https://drive.google.com/file/d/FILE_ID/view",
  drive_backup_relatorio_id: "FILE_ID",
  drive_backup_status: "concluido" | "em_processamento" | "erro" | "sem_arquivo",
  drive_backup_at: "2026-06-25T14:30:00.000Z"
}
```

### Tratamento de Erros
- **PDF não encontrado:** Status = 'sem_arquivo'
- **Upload falhou:** Status = 'erro', log em errosDetalhe
- **Rate limit Drive:** Retry automático com backoff

---

## 2. BACKUP DE NOTAS FISCAIS

### Funções Principais
- **Arquivo:** `functions/syncNotaFiscalDriveBackup.js`
- **Trigger:** 
  - Automático: Após aprovação de compra
  - Manual: Botão "Backup Compras" na página de Compras
- **Execução:** Paginada em lotes de 10 solicitações

### Estrutura de Pastas no Drive
```
Notas Fiscais/ (ou pasta raiz configurada)
└── JANEIRO_2026/
    ├── NF-001-MHAB-FORNECEDOR-SERVIÇOS-MuseusCentro-JANEIRO-2026-R$-1.000,00.pdf
    ├── XML-001-MHAB-FORNECEDOR-SERVIÇOS-MuseusCentro-JANEIRO-2026-R$-1.000,00.xml
    └── COMP-001-MHAB-FORNECEDOR-SERVIÇOS-MuseusCentro-JANEIRO-2026-R$-1.000,00.pdf
```

### Padrão de Nomenclatura

#### NF Normal (PDF)
```
NF-[número]-[centro_custo]-[fornecedor]-[natureza]-MuseusCentro-[mes]-[ano]-R$-[valor].pdf

Exemplo:
NF-12345-MHAB-ABC_SERVICOS-LIMPEZA-MuseusCentro-JANEIRO-2026-R$-1.000,00.pdf
```

#### XML da NF
```
XML-[número]-[centro_custo]-[fornecedor]-[natureza]-MuseusCentro-[mes]-[ano]-R$-[valor].xml
```

#### Documentos Complementares (Recibos/Comprovantes)
```
COMP-[número]-[centro_custo]-[fornecedor]-[natureza]-MuseusCentro-[mes]-[ano]-R$-[valor].pdf
RECIBO-[número]-[centro_custo]-[fornecedor]-[natureza]-MuseusCentro-[mes]-[ano]-R$-[valor].pdf
```

### Detecção de Tipo Complementar
A função `detectTipoComplementar()` verifica:
1. Campo `tipo_documento_complementar` (salvo pela IA)
2. Nome do arquivo (heurística por palavras-chave)
3. Descrição/categoria do attachment

**Palavras-chave para RECIBO:**
- "recibo", "RECIBO"

**Palavras-chave para COMPROVANTE:**
- "comprovante", "COMPROVANTE", "PIX", "TED", "BOLETO", "TRANSFERENCIA", "PAGAMENTO"

### Fluxo de Execução

```
1. Usuário clica em "Backup Compras" ou compra é aprovada
   ↓
2. Função busca solicitações aprovadas sem backup (limite: 10)
   ↓
3. Para cada solicitação:
   a. Resolve PurchaseRequest (por ID ou intake)
   b. Resolve attachments vinculados:
      - Por purchase_request_id
      - Por nf_numero
      - Por document_intake_id
      - Documentos complementares (por NF referenciada ou CNPJ)
   ↓
4. Para cada attachment:
   a. Verifica se já tem backup (backup_drive_file_id) → Pula se existir
   b. Gera nome padronizado (buildFileName)
   c. Determina pasta do mês (JANEIRO_2026, FEVEREIRO_2026, etc.)
   d. Busca/cria pasta no Drive
   e. Upload do arquivo (PDF ou XML)
   f. Atualiza Attachment:
      - file_name (nome padronizado)
      - nf_nome_renomeado
      - backup_drive_file_id
      - backup_drive_folder_id
      - backup_status: 'SINCRONIZADO'
      - backup_synced_at: timestamp
   ↓
5. Atualiza PurchaseRequest:
   - backup_drive_status: 'SINCRONIZADO'
   - backup_drive_folder_id
   - backup_drive_total_arquivos
   ↓
6. Retorna estatísticas
```

### Campos Atualizados nas Entidades

#### Attachment
```javascript
{
  file_name: "NF-12345-MHAB-ABC_SERVICOS-...",
  nf_nome_renomeado: "NF-12345-MHAB-ABC_SERVICOS-...",
  nome_padronizado_ia: "NF-12345-MHAB-ABC_SERVICOS-...",
  backup_done: true,
  backup_status: "SINCRONIZADO" | "PENDENTE_CONFIG_DRIVE" | "DELETADO_NO_BACKUP",
  backup_drive_parent_folder_id: "PARENT_ID",
  backup_drive_folder_id: "FOLDER_ID",
  backup_drive_folder_name: "JANEIRO_2026",
  backup_drive_file_id: "FILE_ID",
  backup_drive_file_name: "NF-12345-...",
  backup_synced_at: "2026-06-25T14:30:00.000Z"
}
```

#### PurchaseRequest
```javascript
{
  backup_drive_status: "SINCRONIZADO" | "PENDENTE_CONFIG_DRIVE",
  backup_drive_parent_folder_id: "PARENT_ID",
  backup_drive_folder_id: "FOLDER_ID",
  backup_drive_folder_name: "JANEIRO_2026",
  backup_drive_synced_at: "2026-06-25T14:30:00.000Z",
  backup_drive_total_arquivos: 3
}
```

### Normalização de Centro de Custo
```javascript
function normalizarCentroCusto(v) {
  // MHAB, MIS, MUMO, NOTURNO, PUBLICACOES, GERAL
}
```

### Sanitização de Nomes de Arquivo
- Remove acentos e caracteres especiais
- Remove: `\ / : ; ? * " ' ( ) [ ] { }`
- Substitui espaços múltiplos por único espaço
- Limite de 50 chars para fornecedor, 40 para natureza

---

## 3. CONFIGURAÇÕES E CONSTANTES

### Configurações Globais (`utils/constants.js`)
```javascript
BACKUP_CONFIG = {
  PARENT_FOLDER_ID: '1aJ5nfpgXcpu6SrDVecmhIQ2eq4vexqe3',
  BATCH_SIZE: 10,
  MAX_LOOPS: 50,
  SKIP_HOURS: 24, // Não refazer backup se já feito nas últimas 24h
  ROOT_FOLDER_NAME: 'Relatórios',
  NF_FOLDER_PREFIX: 'Notas Fiscais'
}
```

### Conector Google Drive
- **Integration Type:** `googledrive`
- **Scopes:** `https://www.googleapis.com/auth/drive`
- **Status:** Autorizado (verificar em `authorized_app_connectors`)

---

## 4. OPERAÇÕES MANUAIS

### Backup em Lote (Compras)
```javascript
// Página: Compras.jsx
// Botão: "Backup Compras"
// Função: driveBackupPurchase (via base44.functions.invoke)

// Fluxo:
let cursor = 0;
let totalProcessados = 0;
while (loops < 50) {
  const res = await base44.functions.invoke('driveBackupPurchase', { cursor });
  totalProcessados += res.processados;
  if (!res.temMais) break;
  cursor = res.cursor;
}
```

### Backup de Relatórios Aprovados
```javascript
// Página: Compras.jsx
// Botão: "Backup Relatórios"
// Função: backupRelatoriosDrive

// Mesma lógica paginada acima
```

### Backup Individual (Automático)
```javascript
// Trigger: Aprovação de compra (notifyPurchaseApprovedToFinanceiro)
// Função: syncNotaFiscalDriveBackup (via enqueuePurchaseNotification)
// Execução: Assíncrona, não bloqueia aprovação
```

---

## 5. TRATAMENTO DE ERROS

### Erros Comuns e Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| `Unauthorized` | Conector Drive expirado | Reautorizar em Settings → Integrations |
| `Failed to download PDF` | URL expirada ou inválida | Verificar export_pdf_url no Report |
| `Upload failed` | Permissão insuficiente no Drive | Verificar scopes do conector |
| `Rate limit` | Excesso de requisições | Aguardar e retry com backoff |
| `Folder not found` | Pasta raiz deletada | Recriar estrutura manualmente |

### Logs e Auditoria
- Todas as operações registram em `console.error`
- Erros detalhados retornados em `errosDetalhe`
- Status atualizado nas entidades para rastreabilidade

---

## 6. RECOMENDAÇÕES DE MANUTENÇÃO

### Diário
- [ ] Verificar se backups automáticos estão ocorrendo
- [ ] Monitorar erros em `drive_backup_status = 'erro'`

### Semanal
- [ ] Auditar estrutura de pastas no Drive
- [ ] Verificar se há NFs sem backup (`backup_drive_status != 'SINCRONIZADO'`)

### Mensal
- [ ] Revisar logs de erros
- [ ] Limpar backups duplicados ou órfãos
- [ ] Validar permissões do conector Google Drive

---

## 7. FLUXO COMPLETO INTEGRADO

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENTRADA DE DOCUMENTO                         │
│                    (EntradaUnica / Gmail Sync)                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DocumentIntake                               │
│  - Classificação IA (NF, XML, Recibo, Contrato)                │
│  - Extração de dados (valor, CNPJ, emissor, data)              │
│  - Sugestão de rubrica                                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PurchaseRequest                              │
│  - Vinculação: rubrica_id, centro_custo, meta_id               │
│  - Status: SOLICITADO → APROVADO_COORD → APROVADO_ADMIN        │
│  - Atualização de rubrica (valor_utilizado, saldo)             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Fila de Notificação                          │
│  - enqueuePurchaseNotification                                  │
│  - Agendamento: 09:30 ou 16:45 (PurchaseNotificationQueue)      │
│  - Envio: sendPurchaseNotificationDigest                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKUP DRIVE (Automático)                    │
│  - syncNotaFiscalDriveBackup                                    │
│  - Padronização de nomes                                        │
│  - Upload para pasta do mês                                     │
│  - Atualização: Attachment + PurchaseRequest                    │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKUP DRIVE (Manual)                        │
│  - Botão "Backup Compras" / "Backup Relatórios"                │
│  - Processamento em lotes de 10                                 │
│  - Paginação com cursor                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. ENTIDADES ENVOLVIDAS

### Report
- Campos de backup: `drive_backup_relatorio_url`, `drive_backup_relatorio_id`, `drive_backup_status`, `drive_backup_at`

### Attachment
- Campos de backup: `backup_drive_file_id`, `backup_drive_folder_id`, `backup_drive_file_name`, `backup_status`, `backup_synced_at`

### PurchaseRequest
- Campos de backup: `backup_drive_status`, `backup_drive_folder_id`, `backup_drive_folder_name`, `backup_drive_total_arquivos`

### DocumentIntake
- Campos relacionados: `entidade_destino_id`, `nf_pdf_url`, `nf_xml_url`, `resultado_ia`

---

## 9. FUNÇÕES RELACIONADAS

### Backup de Relatórios
- `backupRelatoriosDrive` - Backup paginado de relatórios
- `backupRelatoriosAprovadosDrive` - Backup apenas de aprovados

### Backup de Compras/NFs
- `syncNotaFiscalDriveBackup` - Sincronização principal
- `driveBackupPurchase` - Backup em lote de compras
- `backupNotasFiscaisToDrive` - Backup alternativo

### Utilitários
- `padronizarNomeArquivosNF` - Padronização de nomes
- `detectNFDuplicates` - Detecção de duplicatas
- `validateNFDuplicate` - Validação de duplicidade

---

## 10. EXEMPLOS DE USO

### Exemplo 1: Backup Manual de Relatórios
```javascript
// No console do browser ou backend
let cursor = 0;
let total = 0;

while (true) {
  const res = await base44.functions.invoke('backupRelatoriosDrive', { cursor });
  if (!res.data.success) break;
  
  total += res.data.processados;
  console.log(`Processados: ${total}, Erros: ${res.data.erros}`);
  
  if (!res.data.temMais) break;
  cursor = res.data.cursor;
}

console.log(`Total: ${total} relatórios`);
```

### Exemplo 2: Verificar Status de Backup
```javascript
// Relatórios sem backup
const reports = await base44.entities.Report.filter({
  drive_backup_status: 'pendente'
});

console.log(`${reports.length} relatórios pendentes`);

// Compras sem backup
const purchases = await base44.entities.PurchaseRequest.filter({
  backup_drive_status: 'pendente'
});

console.log(`${purchases.length} compras pendentes`);
```

### Exemplo 3: Forçar Re-backup
```javascript
// Resetar status para forçar novo backup
await base44.entities.Report.updateMany(
  { drive_backup_status: 'concluido' },
  { $set: { drive_backup_status: 'pendente' } }
);
```

---

**Última atualização:** 2026-06-25  
**Responsável:** Equipe de Desenvolvimento Museus Centro