# Checklist de Estabilidade e Testes — Museus Centro / Viaduto das Artes

## ✅ Status: Em andamento (v1.0.0)

---

## 1. TESTE GERAL DE ROTAS

### Rotas Públicas (sem login)
- [ ] `/` — Home/Dashboard público
- [ ] `/Cadastro` — Página de cadastro
- [ ] `/ConviteAcesso` — Página de convite

### Rotas Protegidas (requer login)
- [ ] `/Dashboard` — Painel principal
- [ ] `/DashboardProfissional` — Painel profissional
- [ ] `/DashboardPatrocinador` — Painel patrocinador
- [ ] `/Relatorios` — Lista de relatórios
- [ ] `/ReportEditor` — Editor de relatórios
- [ ] `/Compras` — Painel de compras
- [ ] `/GestaoPagamentos` — Gestão de pagamentos
- [ ] `/EntradaUnica` — Entrada única de documentos
- [ ] `/GaleriaFotos` — Galeria de fotos
- [ ] `/Agenda` — Agenda/Programação
- [ ] `/ComunicacaoVisibilidade` — Painel de comunicação
- [ ] `/RubricasPorMuseu` — Rubricas por museu
- [ ] `/BaseConhecimento` — Base de conhecimento
- [ ] `/UserManagement` — Gerenciamento de usuários
- [ ] `/AdminUsers` — Administração de usuários
- [ ] `/PlataformaAdmin` — Admin da plataforma
- [ ] `/ActivityLog` — Auditoria

### Cada rota deve passar em:
- [ ] Acesso direto pela URL
- [ ] Acesso via menu/sidebar
- [ ] Carrega sem página branca
- [ ] Sem erros no console
- [ ] Links internos funcionam
- [ ] Responsivo em mobile
- [ ] Responsivo em tablet

---

## 2. AUTENTICAÇÃO

### Cadastro
- [ ] Link de cadastro visível e funcional
- [ ] Formulário carrega sem erros
- [ ] Domínios autorizados (@pbh.gov.br, etc) permitem senha direta
- [ ] Validação de campos obrigatórios funciona
- [ ] Mensagem de sucesso ao cadastrar
- [ ] Mensagem de erro clara se falhar
- [ ] Redireciona corretamente após sucesso

### Login com Google
- [ ] Botão "Entrar com Google" funciona
- [ ] OAuth callback funciona
- [ ] Usuário novo não registrado recebe mensagem amigável (UserNotRegisteredError)
- [ ] Usuário registrado entra corretamente
- [ ] Mensagem de erro se OAuth falhar

### Login Direto (domínios autorizados)
- [ ] Pode criar conta com e-mail e senha
- [ ] Validação de senha (mín. 8 caracteres)
- [ ] Confirmação de senha funciona
- [ ] Login com e-mail + senha funciona

### Logout
- [ ] Botão logout funciona
- [ ] Redireciona para home
- [ ] Token é limpo
- [ ] Sessão termina corretamente

---

## 3. PERMISSÕES E ACESSO

### Controle de Acesso por Papel
- [ ] Profissional: pode ver apenas seu painel e relatórios
- [ ] Coordenador: pode revisar e aprovar relatórios
- [ ] Admin: acesso a todas as áreas
- [ ] Observador: acesso somente leitura a dashboards específicos

### Acesso Restrito
- [ ] Usuário sem permissão recebe tela amigável (AccessDenied)
- [ ] Nunca tela branca para acesso negado
- [ ] Mensagem clara do motivo
- [ ] Botões para voltar ou sair

---

## 4. PÁGINAS E CARREGAMENTO

### Indicadores de Carregamento
- [ ] Todas as páginas com dados assíncronos mostram loading
- [ ] Loading nunca trava a página
- [ ] Skeleton screens aparecem quando esperado
- [ ] Mensagem de carregamento é clara

### Tratamento de Erros
- [ ] Erro ao carregar página → tela amigável
- [ ] Erro ao fazer requisição → toast com mensagem
- [ ] Erro de rede → mensagem clara
- [ ] Timeout → mensagem clara

### ErrorBoundary
- [ ] Qualquer erro React → tela de erro amigável
- [ ] Botões: "Tentar novamente", "Voltar ao painel"
- [ ] ID do erro salvo para debug
- [ ] Console mostra erro técnico (dev)

---

## 5. BOTÕES E AÇÕES

### Estados de Botão
Cada botão de ação deve ter:
- [ ] Estado loading visível (spinner)
- [ ] Disabled enquanto executa (evita clique duplo)
- [ ] Mensagem de sucesso ao completar
- [ ] Mensagem de erro claro se falhar

### Botões Críticos: Salvar, Enviar, Aprovar, Deletar
- [ ] Estado disabled enquanto processa
- [ ] Spinner/loading visível
- [ ] Clique duplo bloqueado
- [ ] Mensagem de sucesso após ação

### Exclusão
- [ ] Dialog de confirmação aparece
- [ ] Descrição clara do que será deletado
- [ ] Botão de cancelamento funciona
- [ ] Depois de deletar → mensagem de sucesso

---

## 6. MENSAGENS PADRONIZADAS

### Mensagens de Sucesso
- Salvar: "Salvo com sucesso."
- Enviar: "Enviado com sucesso."
- Criar: "Cadastro realizado com sucesso."
- Deletar: "Excluído com sucesso."
- Aprovar: "Aprovado com sucesso."
- Backup: "Backup sincronizado com sucesso."

### Mensagens de Erro
- Erro genérico: "Não foi possível completar a ação. Tente novamente."
- Erro de permissão: "Você não tem permissão para executar esta ação."
- Erro de autenticação: "Você precisa fazer login para continuar."
- Erro de rede: "Falha de conexão. Tente novamente."

### Comportamento de Toasts
- [ ] Aparecem no canto superior direito
- [ ] Desaparecem automaticamente após 3-4 segundos
- [ ] Não sobrepõem conteúdo importante
- [ ] Nunca mais de 3 toasts simultâneos

---

## 7. RESPONSIVIDADE

### Mobile (< 640px)
- [ ] Layout funciona completamente
- [ ] Botões são clicáveis (mín. 44px)
- [ ] Sidebar/menu acessível (mobile menu)
- [ ] Tabelas scrolláveis horizontalmente
- [ ] Inputs visíveis inteiros

### Tablet (640px - 1024px)
- [ ] Layout adapta corretamente
- [ ] Sidebar colapsável em telas pequenas
- [ ] Grids ajustam para 2 colunas
- [ ] Fonts legíveis

### Desktop (> 1024px)
- [ ] Layout completo funciona
- [ ] Sidebar sempre visível
- [ ] Grids em 3+ colunas conforme necessário

---

## 8. TESTES NAVEGADORES

- [ ] Chrome 90+
- [ ] Firefox 88+
- [ ] Safari 14+
- [ ] Edge 90+
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## 9. TESTES ESPECÍFICOS

### Dashboard
- [ ] Carrega dados sem página branca
- [ ] Gráficos renderizam
- [ ] Filtros funcionam
- [ ] Exportação PDF funciona

### Relatórios
- [ ] Lista carrega
- [ ] Editor abre sem erros
- [ ] Salvamento funciona
- [ ] Envio para aprovação funciona
- [ ] Aprovação/devolução trabalham

### Compras
- [ ] Lista de solicitações carrega
- [ ] Criar solicitação funciona
- [ ] Aprovar/reprovar funciona
- [ ] Upload de comprovantes funciona
- [ ] Backup funciona

### Comunicação
- [ ] Clipping carrega
- [ ] Filtros funcionam
- [ ] Links relacionados funcionam
- [ ] IA sintetiza sem travar

### Documentos
- [ ] Upload funciona
- [ ] Classificação automática funciona
- [ ] Roteamento correto
- [ ] Nenhuma página branca

### Galeria
- [ ] Fotos carregam
- [ ] Lightbox abre
- [ ] Filtros funcionam
- [ ] Download funciona

---

## 10. PERFORMANCE

- [ ] Página inicial carrega em < 2s
- [ ] Dashboards carregam em < 3s
- [ ] Nenhum memory leak (dev tools)
- [ ] CPU não sobe acima de 30% em idle
- [ ] Não há jank (lag) ao scrollar

---

## 11. SEGURANÇA

- [ ] Tokens JWT armazenados seguramente
- [ ] Não há credenciais expostas no code
- [ ] Rate limiting em endpoints críticos
- [ ] CORS configurado corretamente
- [ ] XSS mitigation implementado

---

## 12. REMOVER REDUNDÂNCIAS

### Sinos/Notificações
- [ ] Apenas um sino principal no layout
- [ ] Sem duplicação em páginas internas
- [ ] Consolidado em um componente

### Alertas
- [ ] Sem alertas duplicados para mesma ação
- [ ] Sem múltiplos toasts para uma ação

---

## 13. BUILD

- [ ] Build sem erros: `npm run build`
- [ ] Sem warnings críticos
- [ ] Todos os imports corretos
- [ ] Nenhum componente não-exportado
- [ ] Sem dependências circulares
- [ ] Todos os hooks em providers corretos

---

## 14. DEPLOY

- [ ] Build funciona em staging
- [ ] Todas as rotas acessíveis
- [ ] Autenticação funciona
- [ ] Sem console errors
- [ ] Sem 404s para assets estáticos

---

## Assinado por:
- [ ] Desenvolvedor
- [ ] QA
- [ ] Product

**Data:** ___________  
**Versão:** 1.0.0  
**Status:** ⏳ Pendente / ✅ Completo