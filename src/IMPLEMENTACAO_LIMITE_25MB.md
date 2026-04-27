# Implementação: Limite de Upload de 25 MB

## Status: Em Progresso

Data de Início: 2026-04-27
Objetivo: Garantir limite máximo de 25 MB em todos os uploads do sistema

---

## ✅ Etapa 1 — CONFIGURAÇÃO GLOBAL

### Arquivos Criados
- ✅ `lib/uploadConfig.js` — Constantes e funções de validação
- ✅ `lib/helpTextsUpload.js` — Textos de ajuda padronizados
- ✅ `components/upload/FileSizeHelp.jsx` — Componente de exibição de limite

### Configurações
```javascript
MAX_UPLOAD_SIZE_MB = 25
MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024 (26,214,400 bytes)
```

---

## ✅ Etapa 2 — FRONTEND

### Componentes Atualizados
- ✅ `components/entrada/DocumentUploadZone.jsx`
  - Importa `validateFiles` e `formatFileSize`
  - Valida tamanho ANTES do envio
  - Mostra tamanho do arquivo em formato legível
  - Bloqueia apenas arquivos inválidos
  - Permite continuar com arquivos válidos
  - Exibe mensagens de erro por arquivo

### Validação
- ✅ Cada arquivo é validado individualmente
- ✅ Arquivos válidos continuam selecionados
- ✅ Mensagens de erro claras e específicas
- ✅ Tamanho exibido em unidade apropriada (B, KB, MB)

---

## ✅ Etapa 3 — BACKEND

### Funções Atualizadas
- ✅ `functions/processDocumentUpload`
  - Valida tamanho ANTES de fazer upload
  - Retorna erro estruturado se > 25 MB
  - Log de erro incluído

- ✅ `functions/processarNotaFiscal`
  - Valida tamanho ANTES de processar
  - Atualiza status como 'leitura_falhou' se arquivo > 25 MB
  - Retorna erro específico ao frontend

- ✅ `functions/backupSingleFile`
  - Valida tamanho ANTES de fazer backup no Drive
  - Retorna erro com status 400 se arquivo > 25 MB
  - Log incluído

### Validação
```javascript
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

if (bytes.length > MAX_UPLOAD_SIZE_BYTES) {
  return error("Arquivo muito grande. O limite máximo permitido é de 25 MB.");
}
```

---

## 📋 ETAPA 4 — TESTES OBRIGATÓRIOS

### Casos de Teste

#### 1. ✅ PDF Pequeno (5 MB)
- [ ] Frontend: aceita sem erro
- [ ] Backend: processa normalmente
- [ ] IA: processa sem problema
- [ ] Backup: envia para Drive

#### 2. ✅ PDF Grande Válido (24 MB)
- [ ] Frontend: aceita sem erro
- [ ] Backend: processa normalmente
- [ ] IA: processa sem problema (ou mostra aviso de análise incompleta)
- [ ] Backup: envia para Drive

#### 3. ✅ PDF Acima do Limite (25.5 MB)
- [ ] Frontend: mostra erro "Arquivo muito grande"
- [ ] Frontend: bloqueia upload
- [ ] Frontend: arquivo não é adicionado à lista
- [ ] Backend: rejeita com status 400
- [ ] Backend: log de rejeição

#### 4. ✅ XML Pequeno (< 1 MB)
- [ ] Frontend: aceita
- [ ] Backend: processa normalmente
- [ ] NF é extraída corretamente

#### 5. ✅ Imagem Grande Válida (20 MB)
- [ ] Frontend: aceita
- [ ] Backend: processa normalmente
- [ ] Backup: envia para Drive

#### 6. ✅ Imagem Acima do Limite (26 MB)
- [ ] Frontend: mostra erro
- [ ] Backend: rejeita com status 400

#### 7. ✅ Upload Múltiplo — Todos Válidos
- [ ] PDF 5 MB + XML 100 KB + Imagem 10 MB
- [ ] Frontend: aceita todos
- [ ] Backend: processa todos
- [ ] Mensagem: "Arquivos enviados com sucesso"

#### 8. ✅ Upload Múltiplo — Um Arquivo Inválido
- [ ] PDF 5 MB + PDF 26 MB + Imagem 15 MB
- [ ] Frontend: rejeita apenas o de 26 MB
- [ ] Frontend: mantém os outros dois selecionados
- [ ] Frontend: mostra erro específico para o arquivo grande
- [ ] Backend: processa apenas os dois válidos
- [ ] Mensagem: "Arquivo muito grande. Os demais foram mantidos na seleção"

#### 9. ✅ NF PDF + XML (Entrada Única)
- [ ] PDF 10 MB + XML 500 KB
- [ ] Frontend: aceita ambos
- [ ] Backend: processa ambos
- [ ] IA classifica corretamente
- [ ] NF é extraída de ambos

#### 10. ✅ Backup no Drive
- [ ] Arquivo válido (20 MB) é enviado com sucesso
- [ ] Hash é calculado corretamente
- [ ] drive_file_id é preenchido
- [ ] last_synced_at é atualizado
- [ ] Atualização posterior (PATCH) funciona

#### 11. ✅ Análise por IA
- [ ] Arquivo válido de 20 MB é analisado
- [ ] Se IA completar: dados são preenchidos
- [ ] Se IA falhar: mensagem é exibida
- [ ] Arquivo fica salvo mesmo se IA falhar

#### 12. ✅ Falha de IA Sem Perda
- [ ] Arquivo é salvo
- [ ] IA não consegue processar (timeout ou erro)
- [ ] Arquivo continua disponível
- [ ] Mensagem: "Arquivo salvo, mas análise automática falhou"

#### 13. ✅ Envio para Aprovação
- [ ] Arquivo válido é enviado para coordenador
- [ ] Coordenador recebe notificação
- [ ] Coordenador consegue fazer review

#### 14. ✅ Mensagens Corretas
- [ ] Upload válido: "Arquivo enviado com sucesso."
- [ ] Upload múltiplo: "Arquivos enviados com sucesso."
- [ ] Arquivo grande: "Arquivo muito grande. O limite máximo permitido é de 25 MB."
- [ ] IA falhou: "Arquivo salvo com sucesso, mas a análise automática não foi concluída."
- [ ] Backup falhou: "Arquivo salvo no sistema, mas houve falha no backup externo."

#### 15. ✅ Edge Cases
- [ ] Arquivo com exatamente 25 MB: aceito
- [ ] Arquivo com 25.0001 MB: rejeitado
- [ ] Arquivo corrompido/inválido: tratamento apropriado
- [ ] Timeout ao baixar: mensagem clara

---

## 📖 ETAPA 5 — MANUAL E AJUDA

### Seções a Atualizar

#### 1. Manual Principal
- [ ] Adicionar seção: "Limite de tamanho dos arquivos"
- [ ] Descrever limite de 25 MB
- [ ] Listar pontos de upload
- [ ] Orientações para arquivos grandes

#### 2. Entrada Única de Documentos
- [ ] Atualizar: limite de 25 MB por arquivo

#### 3. Pagamentos da Equipe
- [ ] Atualizar: comprovantes até 25 MB

#### 4. Compras
- [ ] Atualizar: NF PDF/XML até 25 MB

#### 5. Fotos de Atividades
- [ ] Atualizar: imagens até 25 MB

#### 6. Backup no Drive
- [ ] Atualizar: limite aplicado também no backup

#### 7. FAQ
- [ ] Pergunta: "Qual o tamanho máximo permitido para upload?"
- [ ] Resposta: "O limite é de 25 MB por arquivo..."

#### 8. Assistente IA
- [ ] Reindexar com novo conhecimento sobre limite de 25 MB
- [ ] Assistente deve responder corretamente sobre o limite

---

## 🔍 VERIFICAÇÃO FINAL — CHECKLIST DE ACEITE

### Frontend
- [ ] Validação de tamanho funciona em todos os formulários
- [ ] Mensagens de erro são claras e específicas
- [ ] Arquivos válidos continuam selecionados mesmo com erros
- [ ] Tamanho é exibido em formato legível
- [ ] Nenhum layout foi quebrado

### Backend
- [ ] `processDocumentUpload` valida tamanho
- [ ] `processarNotaFiscal` valida tamanho
- [ ] `backupSingleFile` valida tamanho
- [ ] Erros retornam status 400 com mensagem clara
- [ ] Logs são registrados para auditoria

### Database
- [ ] `Attachment.file_size` é preenchido corretamente
- [ ] Schemas não foram alterados desnecessariamente
- [ ] Histórico de backup mantém integridade

### Upload Múltiplo
- [ ] Bloqueia apenas arquivos inválidos
- [ ] Mantém arquivos válidos selecionados
- [ ] Mostra mensagens por arquivo
- [ ] Permite continuar com válidos

### Mensagens
- [ ] Sucesso: "Arquivo enviado com sucesso."
- [ ] Múltiplo: "Arquivos enviados com sucesso."
- [ ] Erro: "Arquivo muito grande. O limite máximo permitido é de 25 MB."
- [ ] IA falhou: "Arquivo salvo com sucesso, mas a análise automática não foi concluída."
- [ ] Backup falhou: "Arquivo salvo no sistema, mas houve falha no backup externo."

### Manual
- [ ] Novo conteúdo adicionado
- [ ] Todas as seções atualizadas
- [ ] FAQ criado
- [ ] Exemplos claros fornecidos

### Assistente IA
- [ ] Conhecimento atualizado
- [ ] Responde corretamente sobre limite

### Nenhum Fluxo Existente Quebrado
- [ ] Uploads válidos funcionam normalmente
- [ ] IA continua processando
- [ ] Backup continua funcionando
- [ ] Aprovações continuam funcionando
- [ ] Nenhuma mensagem de erro interna

---

## 📝 NOTAS

### Pontos Importantes
1. Backend é a fonte da verdade — frontend valida por UX
2. Todas as validações usando `MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024`
3. Mensagens padronizadas em `lib/uploadConfig.js`
4. Textos de ajuda centralizados em `lib/helpTextsUpload.js`
5. Nenhuma lógica duplicada
6. Nenhum layout alterado desnecessariamente

### Arquivos Principais
- `lib/uploadConfig.js` — Constantes globais
- `lib/helpTextsUpload.js` — Textos de ajuda
- `components/upload/FileSizeHelp.jsx` — Componente de ajuda
- `components/entrada/DocumentUploadZone.jsx` — Validação frontend
- `functions/processDocumentUpload` — Validação backend
- `functions/processarNotaFiscal` — Validação NF
- `functions/backupSingleFile` — Validação backup

---

## 🚀 Próximos Passos

1. Executar todos os testes de 15 casos
2. Atualizar Manual e FAQ
3. Reindexar Assistente IA
4. Fazer rollout em produção
5. Monitorar logs por erros

---