# Melhorias de Estabilidade Implementadas

## Versão 1.0.0 — Mai 2026

---

## 📋 RESUMO

Este documento documenta as melhorias de estabilidade, tratamento de erros e UX implementadas no app Museus Centro / Viaduto das Artes para garantir zero página branca e mensagens claras ao usuário.

---

## 🔧 MUDANÇAS IMPLEMENTADAS

### 1. ErrorBoundary Global (lib/ErrorBoundary.jsx)

**Objetivo:** Capturar qualquer erro React e mostrar tela amigável.

**Funcionalidade:**
- Tela de erro amigável em vez de página branca
- Salva erro em localStorage para debug
- Botões: "Tentar novamente", "Voltar ao painel", "Recarregar"
- ID do erro para rastreamento
- Mostra erro técnico apenas em dev

**Onde usar:**
```jsx
<ErrorBoundary>
  <MinhaPage />
</ErrorBoundary>
```

**Implementado em:**
- `App.jsx` (global)
- Todas as rotas em `SafePage`

---

### 2. Mensagens Padronizadas (lib/actionFeedback.js)

**Objetivo:** Standar todas as mensagens de sucesso, erro e aviso.

**Funcionalidade:**
- `showSuccess(key)` — toast verde
- `showError(key)` — toast vermelho
- `showInfo(msg)` — toast azul
- `showWarning(msg)` — toast amarelo
- `handleApiError(error)` — trata erros de API automaticamente
- `preventDoubleClick(fn)` — evita clique duplo em ações críticas

**Mensagens predefinidas:**
```javascript
const MESSAGES = {
  saved: 'Salvo com sucesso.',
  sent: 'Enviado com sucesso.',
  created: 'Cadastro realizado com sucesso.',
  deleted: 'Excluído com sucesso.',
  // ... mais mensagens
};
```

**Como usar:**
```javascript
import { showSuccess, showError, toastMessages } from '@/lib/actionFeedback';

// Opção 1
showSuccess('saved');

// Opção 2
toastMessages.saved();

// Com mensagem customizada
showSuccess('saved', 'Seu arquivo foi salvo!');

// Erro com mensagem do backend
showError('saveFailed', error.message);
```

---

### 3. Tela de Acesso Restrito (lib/AccessDenied.jsx)

**Objetivo:** Mostrar tela amigável quando usuário não tem permissão.

**Funcionalidade:**
- Ícone de cadeado
- Mensagem clara do motivo (permissão, cadastro incompleto, etc)
- Botões: "Voltar ao painel", "Sair"
- Sem página branca

**Reasons:**
- `permission` — Sem permissão
- `unregistered` — Cadastro incompleto
- `notAuthenticated` — Precisa fazer login
- `inactive` — Conta desativada

**Como usar:**
```jsx
import AccessDenied from '@/lib/AccessDenied';

if (!hasPermission) {
  return <AccessDenied reason="permission" />;
}

return <MyPage />;
```

---

### 4. Loading Page (components/common/LoadingPage.jsx)

**Objetivo:** Mostrar tela de carregamento consistente.

**Componentes:**
- `<LoadingPage />` — página inteira com spinner
- `<LoadingSkeleton />` — skeleton de loading

**Como usar:**
```jsx
import LoadingPage, { LoadingSkeleton } from '@/components/common/LoadingPage';

if (loading) {
  return <LoadingPage message="Carregando relatórios..." />;
}

if (!data) {
  return <LoadingSkeleton count={3} />;
}

return <MyContent />;
```

---

### 5. App.jsx Refatorado

**Mudanças:**
- Removido ErrorBoundary antigo (AppErrorBoundary)
- Adicionado novo `<ErrorBoundary>` do lib/
- Melhor estrutura de SafePage
- Importações limpas

**Ordem de wrapping:**
```
ErrorBoundary
  └─ AuthProvider
      └─ ThemeProvider
          └─ PatrocinadorViewProvider
              └─ QueryClientProvider
                  └─ Router
                      └─ AuthenticatedApp (SafePage + Rotas)
```

---

### 6. Documentação e Checklists

**Arquivos criados:**
- `CHECKLIST_ESTABILIDADE.md` — teste geral completo
- `MELHORIAS_ESTABILIDADE.md` — este documento

---

## 🚀 COMO USAR NAS PÁGINAS

### Padrão Recomendado para Página Assíncrona

```jsx
import React, { useEffect, useState } from 'react';
import LoadingPage from '@/components/common/LoadingPage';
import AccessDenied from '@/lib/AccessDenied';
import ErrorBoundary from '@/lib/ErrorBoundary';
import { showSuccess, showError } from '@/lib/actionFeedback';

export default function MyPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAccess, setHasAccess] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const result = await base44.entities.MyEntity.list();
        setData(result);
      } catch (err) {
        console.error('Erro ao carregar:', err);
        if (err.status === 403) {
          setHasAccess(false);
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Sem acesso → tela amigável
  if (!hasAccess) {
    return <AccessDenied reason="permission" />;
  }

  // Carregando → spinner
  if (loading) {
    return <LoadingPage message="Carregando dados..." />;
  }

  // Erro → tela amigável
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold text-red-600">Erro ao carregar</p>
          <p className="text-sm text-slate-500">{error}</p>
          <button onClick={() => window.location.reload()} className="...">
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Dados carregados
  return <ErrorBoundary>{/* conteúdo aqui */}</ErrorBoundary>;
}
```

---

## 🔐 Botões com Ação

### Padrão para Botão com Loading

```jsx
const [loading, setLoading] = useState(false);

const handleSave = async () => {
  setLoading(true);
  try {
    await base44.entities.MyEntity.update(id, { name: 'Novo nome' });
    showSuccess('saved');
  } catch (err) {
    showError('saveFailed', err.message);
  } finally {
    setLoading(false);
  }
};

return (
  <Button
    onClick={handleSave}
    disabled={loading}
    className="gap-2"
  >
    {loading ? <Loader2 className="animate-spin" /> : <Save />}
    {loading ? 'Salvando...' : 'Salvar'}
  </Button>
);
```

---

## 📱 Responsividade

Nenhuma mudança foi feita em CSS/layout. Todos os componentes mantêm responsividade original.

---

## ✨ Melhorias Visuais

Nenhuma mudança visual além do ErrorBoundary. Identidade visual consolidada preservada.

---

## 🧪 Testes Obrigatórios

Antes de deploy, verificar:

1. **Sem página branca** — todas as rotas carregam com tela amigável
2. **Cadastro** — funciona para todos os domínios
3. **Google login** — OAuth callback funciona
4. **Permissões** — usuário sem acesso vê AccessDenied
5. **Botões** — loading, disabled, mensagens funcionam
6. **Mensagens** — toasts aparecem e desaparecem
7. **Build** — `npm run build` sem erros

---

## 🔄 Fluxo de Erro Completo

```
Usuario tenta ação
  ↓
Clica botão
  ↓
Loading visual aparece
  ↓
Requisição feita
  ↓
┌─────────────────────────────────────────────────┐
│                  SUCESSO                         │
│ Toast: "Salvo com sucesso."                      │
│ Dados atualizam                                  │
│ Toast desaparece após 3s                         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                  ERRO API                        │
│ Toast: "Não foi possível salvar."                │
│ Stack trace em console (dev)                     │
│ Estado volta ao anterior                         │
│ Toast persiste por 4s                           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                 ERRO REACT                       │
│ ErrorBoundary captura erro                       │
│ Tela de erro amigável aparece                   │
│ ID do erro para debug                            │
│ Botões: "Tentar novamente", "Voltar"            │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              ACESSO RESTRITO                    │
│ AccessDenied aparece                            │
│ Mensagem clara: "Sem permissão"                 │
│ Botões: "Voltar", "Sair"                        │
└─────────────────────────────────────────────────┘
```

---

## 📚 Referência Rápida

### Imports
```javascript
import ErrorBoundary from '@/lib/ErrorBoundary';
import AccessDenied from '@/lib/AccessDenied';
import LoadingPage, { LoadingSkeleton } from '@/components/common/LoadingPage';
import { showSuccess, showError, toastMessages } from '@/lib/actionFeedback';
```

### Funções
```javascript
showSuccess(key, customMessage?)      // toast verde
showError(key, customMessage?)         // toast vermelho
showInfo(message)                      // toast azul
showWarning(message)                   // toast amarelo
handleApiError(error, defaultKey?)    // trata erro API
preventDoubleClick(fn, delay?)        // evita clique duplo
```

### Keys de Mensagem
```
saved, sent, created, recorded, deleted, approved, returned,
linked, exported, backup, loggedIn, copied, updated, unlinked,
error, saveFailed, sendFailed, deleteFailed, createFailed,
updateFailed, uploadFailed, exportFailed, loginFailed,
permission, notAuthenticated, sessionExpired, networkError,
timeout, requiredFields, invalidEmail, passwordMismatch,
passwordTooShort, fileFailed, fileTooBig, invalidFileType
```

---

## 🎯 Próximas Ações

1. ✅ ErrorBoundary global implementado
2. ✅ Mensagens padronizadas criadas
3. ✅ AccessDenied implementado
4. ✅ LoadingPage criado
5. ⏳ Testar todas as rotas (CHECKLIST_ESTABILIDADE.md)
6. ⏳ Remover redundâncias de sinos/alertas
7. ⏳ Build e deploy

---

## 📞 Suporte

Para dúvidas:
- Ler `CHECKLIST_ESTABILIDADE.md` para entender testes
- Usar ErrorBoundary para bugs que causam página branca
- Usar actionFeedback para mensagens consistentes
- Usar AccessDenied para controle de acesso

---

**Data:** Maio 2026  
**Versão:** 1.0.0  
**Autor:** Base44 AI Assistant