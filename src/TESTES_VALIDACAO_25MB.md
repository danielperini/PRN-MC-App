# Plano de Testes: Limite de 25 MB

## Preparação

### Arquivo de Teste 5 MB
```bash
# Criar arquivo de teste 5 MB
dd if=/dev/zero bs=1M count=5 of=test_5mb.pdf
```

### Arquivo de Teste 24 MB
```bash
dd if=/dev/zero bs=1M count=24 of=test_24mb.pdf
```

### Arquivo de Teste 26 MB (inválido)
```bash
dd if=/dev/zero bs=1M count=26 of=test_26mb.pdf
```

### Arquivo XML Pequeno
```bash
cat > test.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<nfe>
  <infNFe>
    <ide>
      <nNF>12345</nNF>
      <dEmi>2026-04-27</dEmi>
    </ide>
    <emit>
      <CNPJ>12345678000195</CNPJ>
      <xNome>EMPRESA TESTE</xNome>
    </emit>
    <dest>
      <CNPJ>12345678000295</CNPJ>
      <xNome>CLIENTE TESTE</xNome>
    </dest>
    <det>
      <infNFel>
        <vNF>1000.00</vNF>
      </infNFel>
    </det>
  </infNFe>
</nfe>
EOF
```

### Imagem de Teste 20 MB
```bash
# Usando ImageMagick
convert -size 4000x4000 xc:blue test_20mb.jpg
```

---

## Teste 1: PDF Pequeno (5 MB)

### Frontend
1. Ir para "Entrada Única" ou página de upload
2. Arrastar `test_5mb.pdf`
3. ✅ Esperado: Arquivo aceito, tamanho mostra "5.00 MB"
4. ✅ Esperado: Nenhuma mensagem de erro

### Backend
1. Executar upload
2. ✅ Esperado: Arquivo é salvo com sucesso
3. ✅ Esperado: Resposta: `{ ok: true, saved: true }`

### IA
1. Verificar se IA começa a processar
2. ✅ Esperado: Processamento normal

---

## Teste 2: PDF Grande Válido (24 MB)

### Frontend
1. Arrastar `test_24mb.pdf`
2. ✅ Esperado: Arquivo aceito, tamanho mostra "24.00 MB"
3. ✅ Esperado: Nenhuma mensagem de erro

### Backend
1. Executar upload
2. ✅ Esperado: Arquivo é salvo
3. ✅ Esperado: `{ ok: true, saved: true }`

### Backup
1. Verificar se arquivo é enviado para Drive
2. ✅ Esperado: Backup realizado com sucesso
3. ✅ Esperado: `drive_file_id` preenchido

---

## Teste 3: PDF Acima do Limite (26 MB)

### Frontend
1. Arrastar `test_26mb.pdf`
2. ✅ Esperado: Mensagem "Arquivo muito grande. O limite máximo permitido é de 25 MB."
3. ✅ Esperado: Arquivo NOT added to selectedFiles
4. ✅ Esperado: Erro mostrado em caixa de alertaPDF

### Backend
1. Tentar enviar (se conseguir passar do frontend)
2. ✅ Esperado: Resposta `{ ok: false, error: "Arquivo muito grande..." }`
3. ✅ Esperado: Status 400
4. ✅ Esperado: Log: `Arquivo rejeitado por exceder tamanho máximo`

---

## Teste 4: XML Pequeno (< 1 MB)

### Frontend
1. Arrastar `test.xml`
2. ✅ Esperado: Arquivo aceito

### Backend
1. Processar com `processarNotaFiscal`
2. ✅ Esperado: Extração de dados funciona
3. ✅ Esperado: NF é identificada
4. ✅ Esperado: Status: `lido_com_sucesso` ou `leitura_parcial`

---

## Teste 5: Imagem Grande Válida (20 MB)

### Frontend
1. Arrastar `test_20mb.jpg`
2. ✅ Esperado: Arquivo aceito, tamanho mostra "20.00 MB"

### Backend
1. Executar upload
2. ✅ Esperado: Arquivo salvo

### Backup
1. Enviar para Drive
2. ✅ Esperado: Backup funciona
3. ✅ Esperado: Imagem na pasta `03_Fotos_Atividades`

---

## Teste 6: Imagem Acima do Limite (26 MB)

### Frontend
1. Arrastar imagem de 26 MB
2. ✅ Esperado: Mensagem de erro
3. ✅ Esperado: Arquivo não é adicionado

### Backend
1. Tentar upload
2. ✅ Esperado: Rejeição com status 400

---

## Teste 7: Upload Múltiplo — Todos Válidos

### Setup
- Arrastar: `test_5mb.pdf` + `test.xml` + `test_20mb.jpg`

### Frontend
1. ✅ Esperado: Todos 3 arquivos aparecem na lista
2. ✅ Esperado: Tamanhos corretos mostrados
3. ✅ Esperado: Nenhuma mensagem de erro

### Backend
1. Executar upload de todos
2. ✅ Esperado: Todos são processados
3. ✅ Esperado: Mensagem: "Arquivos enviados com sucesso"

---

## Teste 8: Upload Múltiplo — Um Arquivo Inválido

### Setup
- Arrastar: `test_5mb.pdf` + `test_26mb.pdf` + `test_20mb.jpg`

### Frontend
1. ✅ Esperado: Arquivo de 5 MB é aceito
2. ✅ Esperado: Arquivo de 26 MB mostra erro
3. ✅ Esperado: Arquivo de 20 MB é aceito
4. ✅ Esperado: Mensagem: "Arquivo muito grande (test_26mb.pdf)"
5. ✅ Esperado: Mensagem: "Os demais foram mantidos na seleção"

### Backend
1. Processar apenas os dois válidos
2. ✅ Esperado: 5 MB + 20 MB são salvos
3. ✅ Esperado: Mensagem de sucesso para os dois

---

## Teste 9: NF PDF + XML (Entrada Única)

### Setup
- Preparar PDF de NF (10 MB) + XML de NF (500 KB)

### Frontend
1. Arrastar ambos
2. ✅ Esperado: Ambos são aceitos

### Backend
1. Processar com IA (Entrada Única)
2. ✅ Esperado: PDF é analisado para extração
3. ✅ Esperado: XML é analisado para extração
4. ✅ Esperado: Ambos são classificados corretamente

### Result
1. ✅ Esperado: PDF vai para `ReviewModalFoto` ou `ReviewModalNF`
2. ✅ Esperado: XML vai para `ReviewModalNF`
3. ✅ Esperado: Usuário consegue revisar ambos

---

## Teste 10: Backup no Drive

### Setup
1. Upload arquivo válido de 20 MB
2. Executar `backupSingleFile`

### Backup
1. ✅ Esperado: Hash é calculado
2. ✅ Esperado: Arquivo é enviado para Drive
3. ✅ Esperado: `drive_file_id` é preenchido
4. ✅ Esperado: `backup_done` = true
5. ✅ Esperado: `backup_date` é atualizado

### Drive
1. Verificar no Google Drive
2. ✅ Esperado: Arquivo aparece em pasta correta
3. ✅ Esperado: Arquivo tem nome padronizado (para NF)

---

## Teste 11: Análise por IA

### Setup
1. Upload arquivo válido de 20 MB (PDF de NF ou imagem)
2. Aguardar análise

### IA
1. ✅ Esperado: IA começa a processar
2. ✅ Esperado: Se completar: dados preenchidos
3. ✅ Esperado: Se falhar: mensagem é exibida
4. ✅ Esperado: Arquivo fica salvo mesmo assim

---

## Teste 12: Falha de IA Sem Perda

### Setup
1. Upload arquivo de 20 MB
2. Forçar falha de IA (timeout ou erro de API)

### Resultado
1. ✅ Esperado: Arquivo continua salvo
2. ✅ Esperado: Mensagem: "Arquivo salvo com sucesso, mas a análise automática não foi concluída"
3. ✅ Esperado: Arquivo aparece em "Pendentes de Revisão"
4. ✅ Esperado: Usuário consegue fazer review manual

---

## Teste 13: Envio para Aprovação

### Setup
1. Upload arquivo de 15 MB
2. Completar review
3. Clicar "Enviar para Aprovação"

### Coordenador
1. ✅ Esperado: Coordenador recebe notificação
2. ✅ Esperado: Coordenador consegue fazer review
3. ✅ Esperado: Coordenador consegue aprova ou rejeitar

---

## Teste 14: Mensagens Corretas

### Cenário 1: Upload Válido
- ✅ Esperado: "Arquivo enviado com sucesso."

### Cenário 2: Upload Múltiplo Válido
- ✅ Esperado: "Arquivos enviados com sucesso."

### Cenário 3: Arquivo Grande
- ✅ Esperado: "Arquivo muito grande. O limite máximo permitido é de 25 MB."

### Cenário 4: IA Falhou
- ✅ Esperado: "Arquivo salvo com sucesso, mas a análise automática não foi concluída."

### Cenário 5: Backup Falhou
- ✅ Esperado: "Arquivo salvo no sistema, mas houve falha no backup externo."

---

## Teste 15: Edge Cases

### Arquivo com exatamente 25 MB
1. ✅ Esperado: Aceito (25 * 1024 * 1024 = 26,214,400 bytes)

### Arquivo com 25.0001 MB
1. ✅ Esperado: Rejeitado

### Arquivo Corrompido
1. ✅ Esperado: Tratamento apropriado (não trava)

### Timeout ao Baixar
1. ✅ Esperado: Mensagem clara sobre erro

---

## Checklist de Testes

- [ ] Teste 1: PDF 5 MB ✅
- [ ] Teste 2: PDF 24 MB ✅
- [ ] Teste 3: PDF 26 MB ✅
- [ ] Teste 4: XML pequeno ✅
- [ ] Teste 5: Imagem 20 MB ✅
- [ ] Teste 6: Imagem 26 MB ✅
- [ ] Teste 7: Múltiplo — todos válidos ✅
- [ ] Teste 8: Múltiplo — um inválido ✅
- [ ] Teste 9: NF PDF + XML ✅
- [ ] Teste 10: Backup Drive ✅
- [ ] Teste 11: Análise IA ✅
- [ ] Teste 12: IA falha sem perda ✅
- [ ] Teste 13: Envio aprovação ✅
- [ ] Teste 14: Mensagens ✅
- [ ] Teste 15: Edge cases ✅

---

## Resultado Final

Data: ___________
Testador: ___________
Resultado: [ ] PASSOU [ ] FALHOU

Observações:
___________________________________________________________________________
___________________________________________________________________________

---