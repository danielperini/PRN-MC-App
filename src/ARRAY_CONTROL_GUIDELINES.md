# Guia de Controle Global de Arrays

## Objetivo
Padronizar o comportamento de todos os campos que utilizam arrays no sistema, evitando duplicidade, seleção automática indevida e falhas de remoção.

## 📦 Importação Obrigatória

```javascript
import { 
  removeDuplicatesById,
  removeDuplicatesString,
  normalizeArray,
  addItemWithoutDuplicate,
  removeItemById,
  updateItemInArray,
  filterByIds,
  mergeArrays
} from '@/lib/arrayUtils';
```

---

## 🔧 Funções Disponíveis

### 1. `removeDuplicatesById(lista, keyId = 'id')`
Remove duplicados baseado em ID único.

**Uso:**
```javascript
// Ao salvar estado
setAtividades(prev => removeDuplicatesById([...prev, novaAtividade], 'id'));

// Ao carregar do backend
const dados = await base44.entities.Atividade.list();
setAtividades(removeDuplicatesById(dados, 'id'));
```

---

### 2. `removeDuplicatesString(lista)`
Remove duplicados de arrays de strings.

**Uso:**
```javascript
// Em multiselect
const uniqueLabels = removeDuplicatesString(selectedLabels);

// Ao processar IDs
const uniqueIds = removeDuplicatesString(ids);
```

---

### 3. `normalizeArray(value)`
Normaliza qualquer valor para um array válido.

**Uso:**
```javascript
// Ao carregar dados
const lista = normalizeArray(atividade?.nomes); // Se vier string, converte

// Em campos que podem receber diferentes formatos
const items = normalizeArray(userInput);
```

---

### 4. `addItemWithoutDuplicate(lista, novoItem, keyId = 'id')`
Adiciona item sem criar duplicatas.

**Uso:**
```javascript
// Adicionar participante
setParticipantes(prev => 
  addItemWithoutDuplicate(prev, {id: user.id, nome: user.name}, 'id')
);

// Vai retornar a lista original se item já existe
```

---

### 5. `removeItemById(lista, idToRemove, keyId = 'id')`
Remove um item por ID.

**Uso:**
```javascript
// Remover atividade
setAtividades(prev => removeItemById(prev, atividadeId, 'id'));

// Remover participante
setParticipantes(prev => removeItemById(prev, userId, 'id'));
```

---

### 6. `updateItemInArray(lista, itemAtualizado, keyId = 'id')`
Atualiza item mantendo ordem e sem duplicados.

**Uso:**
```javascript
// Editar atividade
setAtividades(prev => 
  updateItemInArray(prev, {id: ativId, nome: 'Novo Nome'}, 'id')
);
```

---

### 7. `filterByIds(objetos, ids, keyId = 'id')`
Filtra objetos pelos IDs fornecidos.

**Uso:**
```javascript
// Exibir apenas participantes selecionados
const selecionados = filterByIds(todosPossiveis, selectedIds, 'id');

// Validar lista
const validos = filterByIds(attachments, selectedAttachmentIds, 'id');
```

---

### 8. `mergeArrays(lista1, lista2, keyId = 'id')`
Mescla dois arrays removendo duplicados.

**Uso:**
```javascript
// Combinar duas listas de atividades
const merged = mergeArrays(novasAtividades, atividadesExistentes, 'id');
setAtividades(merged);
```

---

## ✅ Padrões Corretos

### ✔ Adicionar Item
```javascript
// CORRETO
setArray(prev => addItemWithoutDuplicate(prev, novoItem, 'id'));

// OU CORRETO
setArray(prev => removeDuplicatesById([...prev, novoItem], 'id'));

// ERRADO
setArray([...array, item]); // Pode duplicar

// ERRADO
setArray(prev => [...prev, item]); // Sem validação
```

### ✔ Remover Item
```javascript
// CORRETO
setArray(prev => removeItemById(prev, idToRemove, 'id'));

// ERRADO
const newArray = array.filter(item => item.id !== id);
setArray(newArray); // Sem normalização

// ERRADO
array.splice(index, 1); // Mutando estado
```

### ✔ Atualizar Item
```javascript
// CORRETO
setArray(prev => updateItemInArray(prev, {id: itemId, ...dados}, 'id'));

// ERRADO
const updated = array.map(item => 
  item.id === itemId ? {...item, ...dados} : item
);
setArray(updated); // Sem deduplicação
```

### ✔ Carregar do Backend
```javascript
// CORRETO - Remove duplicados automaticamente
const dados = await base44.entities.Atividade.list();
setAtividades(removeDuplicatesById(dados, 'id'));

// ERRADO
const dados = await base44.entities.Atividade.list();
setAtividades(dados); // Confiança cega no backend
```

### ✔ Em useEffect
```javascript
// CORRETO - Só executa se report muda
useEffect(() => {
  if (!report?.id) return;
  
  const normalized = normalizeArray(report.atividades);
  const deduped = removeDuplicatesById(normalized, 'id');
  setAtividades(deduped);
}, [report?.id]); // Dependency correto

// ERRADO
useEffect(() => {
  setAtividades(report.atividades); // Executa toda vez, sem normalização
}, [report]); // Dependency muito amplo
```

---

## 🎯 Campos Críticos (Prioridade Alta)

### ReportEditor
- [x] Membros da equipe participantes
- [x] Metas vinculadas
- [ ] Anexos/Documentos (TODO)
- [ ] Fotos (TODO)
- [ ] Depoimentos (TODO)

### AtividadesSection
- [x] Adicionar/Remover atividades
- [ ] Foto/Anexo de atividades (TODO)

### Compras
- [ ] Rubricas selecionadas
- [ ] Documentos anexados
- [ ] Fornecedores

### Dashboard
- [ ] Filtros multiselect
- [ ] Cards favoritos

---

## 🤖 IA - Regras Críticas

Quando IA sugere ou insere dados:

```javascript
// CORRETO - Mercha sem duplicar
const sugeridosByIA = resultado.dados;
setArray(prev => mergeArrays(prev, sugeridosByIA, 'id'));

// CORRETO - Apenas atualiza campos vazios
if (!form.nomes || form.nomes.length === 0) {
  setForm(prev => ({
    ...prev,
    nomes: resultado.sugestoes
  }));
}

// ERRADO - Sobrescreve tudo sem validação
setArray(resultado.dados);

// ERRADO - Executa múltiplas vezes
useEffect(() => {
  chamarIA(); // Pode rodar múltiplas vezes!
});
```

---

## 📋 Checklist de Implementação

Ao corrigir um campo de array:

- [ ] Importar funções do `arrayUtils`
- [ ] Validar que array é sempre `Array.isArray()`
- [ ] Remover duplicados ao adicionar
- [ ] Remover por ID (não por index)
- [ ] Normalizar dados do backend
- [ ] Corrigir renderização (sem duplicados)
- [ ] Testar: adicionar, remover, atualizar
- [ ] Testar: reload da página
- [ ] Testar: com dados vazios
- [ ] Testar: com IA (se aplicável)

---

## 🧪 Testes Obrigatórios

```javascript
// 1. Adicionar item repetido
setArray(prev => addItemWithoutDuplicate(prev, {id: '1', nome: 'A'}, 'id'));
setArray(prev => addItemWithoutDuplicate(prev, {id: '1', nome: 'A'}, 'id'));
// Resultado: Array com 1 item (não 2)

// 2. Remover item
setArray(prev => removeItemById(prev, '1', 'id'));
// Resultado: Item removido

// 3. Salvar e reload
await handleSave();
window.location.reload();
// Resultado: Sem duplicados, estado consistente

// 4. IA sugerindo dados
const sugestoes = await chamarIA();
setArray(prev => mergeArrays(prev, sugestoes, 'id'));
// Resultado: Sem duplicatas, dados mesclados corretamente
```

---

## 📞 Suporte

Em caso de dúvidas sobre qual função usar, consulte:
1. O nome da função (é bem descritivo)
2. Os exemplos acima
3. Os comentários no arquivo `lib/arrayUtils.js`

---

**Última atualização:** 2026-04-27  
**Status:** Implementação em andamento