# Limite de Upload: 25 MB

## ⚡ Resumo Rápido

Sistema implementado para limitar uploads em **25 MB** com validação em frontend e backend.

### Arquivos Principais
- `lib/uploadConfig.js` — Constantes e funções
- `lib/helpTextsUpload.js` — Textos de ajuda
- `components/upload/FileSizeHelp.jsx` — Componente de ajuda
- `components/entrada/DocumentUploadZone.jsx` — Upload validado
- `functions/processDocumentUpload` — Backend validado
- `functions/processarNotaFiscal` — NF validada
- `functions/backupSingleFile` — Backup validado

### Documentação
- `SUMARIO_LIMITE_25MB.md` — Visão geral executiva
- `IMPLEMENTACAO_LIMITE_25MB.md` — Checklist de aceite
- `TESTES_VALIDACAO_25MB.md` — Plano de 15 testes
- `README_LIMITE_25MB.md` — Este arquivo

---

## 🔧 Como Usar

### Frontend — Validar Arquivo Individual
```javascript
import { validateFile, formatFileSize } from '@/lib/uploadConfig';

const file = /* File object from input */;
const validation = validateFile(file);

if (validation.valid) {
  console.log(`Arquivo ${file.name} tem ${validation.size}`);
  // Pode fazer upload
} else {
  console.error(validation.errors[0]); // "Arquivo muito grande..."
  // Mostrar erro ao usuário
}
```

### Frontend — Validar Múltiplos Arquivos
```javascript
import { validateFiles } from '@/lib/uploadConfig';

const files = /* FileList from input */;
const { valid, invalid } = validateFiles(files);

console.log(`${valid.length} válidos, ${invalid.length} inválidos`);

// Manter válidos selecionados
// Mostrar erros dos inválidos
```

### Backend — Validar Tamanho em Bytes
```javascript
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

if (bytes.length > MAX_UPLOAD_SIZE_BYTES) {
  return Response.json({
    ok: false,
    error: 'Arquivo muito grande. O limite máximo permitido é de 25 MB.'
  }, { status: 400 });
}
```

### Componente — Mostrar Limite
```javascript
import FileSizeHelp from '@/components/upload/FileSizeHelp';

export default function MyForm() {
  return (
    <>
      <input type="file" />
      <FileSizeHelp variant="info" />
    </>
  );
}
```

### Usar Textos Padronizados
```javascript
import { HELP_TEXTS_UPLOAD } from '@/lib/helpTextsUpload';

const message = HELP_TEXTS_UPLOAD.VALIDACAO_FRONTEND.arquivo_invalido;
// "Arquivo muito grande. O limite máximo permitido é de 25 MB."
```

---

## ✅ Checklist Rápido

### Implementação
- [x] Configuração global criada
- [x] Frontend validado
- [x] Backend validado
- [x] Componentes criados
- [x] Textos padronizados
- [x] Documentação completa

### Próximos Passos
- [ ] Executar testes (15 casos)
- [ ] Atualizar Manual
- [ ] Reindexar IA
- [ ] Deploy

---

## 🧪 Testes Rápidos

### Teste 1: Arquivo Válido
```bash
# Criar arquivo de 5 MB
dd if=/dev/zero bs=1M count=5 of=test.pdf

# Frontend: Arrastar → deve aceitar
# Backend: Upload → deve funcionar
```

### Teste 2: Arquivo Inválido
```bash
# Criar arquivo de 26 MB
dd if=/dev/zero bs=1M count=26 of=big.pdf

# Frontend: Arrastar → deve rejeitar
# Mensagem: "Arquivo muito grande..."
```

### Teste 3: Upload Múltiplo
```bash
# Arquivos: 5 MB + 26 MB + 10 MB
# Frontend: Deve aceitar apenas 5 MB e 10 MB
# Mensagem: Erro do 26 MB, resto mantido
```

---

## 📝 Mensagens do Sistema

| Situação | Mensagem |
|---|---|
| Upload válido | "Arquivo enviado com sucesso." |
| Upload múltiplo válido | "Arquivos enviados com sucesso." |
| Arquivo grande | "Arquivo muito grande. O limite máximo permitido é de 25 MB." |
| IA não completou | "Arquivo salvo com sucesso, mas a análise automática não foi concluída." |
| Backup falhou | "Arquivo salvo no sistema, mas houve falha no backup externo." |

---

## 🔍 Onde Está Implementado

### Frontend
- `DocumentUploadZone` — Validação ao selecionar arquivo

### Backend (Validação Tripla)
1. `processDocumentUpload` — Ao fazer upload
2. `processarNotaFiscal` — Ao processar NF
3. `backupSingleFile` — Ao fazer backup

---

## 💾 Segurança

- ✅ Validação em frontend (UX)
- ✅ Validação em backend (segurança)
- ✅ Arquivo rejeitado antes de ser processado
- ✅ Log de todas as rejeições
- ✅ Backend nunca confia só em frontend

---

## 📊 Limite

```javascript
MAX_SIZE_MB = 25
MAX_SIZE_BYTES = 25 * 1024 * 1024 = 26,214,400 bytes
```

---

## 🚀 Deploy

### Checklist
1. [ ] Testes passaram
2. [ ] Manual atualizado
3. [ ] IA reindexada
4. [ ] Deploy em staging
5. [ ] Teste em staging
6. [ ] Deploy em produção
7. [ ] Monitorar logs

---

## 📞 Suporte

### FAQ

**P: Qual o limite de arquivo?**
R: 25 MB por arquivo. Se maior, comprima ou divida em múltiplos.

**P: Todos os tipos de arquivo têm limite?**
R: Sim, PDF, XML, imagem — todos 25 MB máximo.

**P: Posso contornar o limite?**
R: Não, validação é feita no backend também.

**P: Meu arquivo tem 25.5 MB, posso enviar?**
R: Não, ultrapassa o limite. Comprima usando uma ferramenta online.

**P: Upload múltiplo — um arquivo é grande, o que acontece?**
R: Arquivo grande é rejeitado, mas os outros continuam selecionados.

---

## 📚 Documentação Completa

Para informações mais detalhadas, ver:
- `SUMARIO_LIMITE_25MB.md` — Visão geral completa
- `IMPLEMENTACAO_LIMITE_25MB.md` — Implementação e checklist
- `TESTES_VALIDACAO_25MB.md` — Plano de testes detalhado

---

## ✨ Pronto para Usar

Sistema está **100% implementado** e pronto para:
- [ ] Testes
- [ ] Integração em produção
- [ ] Monitoramento

---

**Última atualização**: 2026-04-27

**Status**: ✅ Implementação concluída

**Próximo passo**: Executar testes (arquivo: `TESTES_VALIDACAO_25MB.md`)