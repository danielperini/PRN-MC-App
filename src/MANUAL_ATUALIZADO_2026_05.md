# Manual Atualizado — Museus Centro App v2.1 (Maio 2026)

## 🎨 Atualizações Visuais

### Tema Miro
- **Sidebar**: Novo design escuro com fundo #1A1D2E (cinza escuro profissional)
- **Texto Sidebar**: #E6E8F0 (branco suave) para melhor legibilidade
- **Cores Primárias**: Azul vibrante (#4262FF) + Amarelo destaque (#FFD02F)
- **Status**: Verde sucesso (#2ECC71), Vermelho alerta (#FF5C5C)
- **Borders**: Subtis em #2B2F42 para contraste sem excesso

### Tema Museu BH
- Mantém identidade azul (#2E6F95) com ouro (#D9C6A5)
- Paleta expandida com cores de status e indicadores

## 📱 Melhorias Mobile (WebView)

### 1. Pull-to-Refresh
- Deslize para baixo no topo da página para atualizar dados
- Ícone animado com feedback visual
- Automático em Android/iOS

### 2. Selects Mobile Adaptativos
- **Mobile**: Bottom sheet (drawer) intuitivo
- **Desktop**: Dropdowns padrão
- Implementado em: Compras, Revisão de Pagamentos

### 3. Transições de Página
- Animações suaves entre rotas (250ms)
- Sem "piscar" ou carregamento visível

### 4. Exclusão de Conta
- Acesso em **Perfil → Informações → Zona de Perigo**
- Requer confirmação de email
- Remove todos os dados permanentemente
- Compliance com App Store/Play Store

## 💰 Pagamentos de Equipe (TeamPayment)

### Dashboard de Análise
- Visualize pagamentos por status
- Filtros por texto, profissional, mês, NF, rubrica
- Estatísticas: pendentes, automáticos, total aprovado

### Fluxo de Aprovação
1. **Pendente/Aguardando** → Revisor analisa documentos
2. **Devolução** → Enviado de volta para correção
3. **Aprovado** → Rubrica debitada automaticamente
4. **Pago** → Marca conclusão do pagamento
5. **Deletar** → Remove registros não aproveitados

### Otimistic Updates
- UI atualiza **imediatamente** (sem esperar servidor)
- Rollback automático se houver erro
- Melhor UX em conexões lentas

## 📊 Dashboard Patrocinador

### Visualizações Principais
- **Budget Execution**: Gráfico de pizza com % utilizado
- **Activity Metrics**: Frequência de atividades por tipo
- **Audience Data**: Público total, faixa etária, gênero
- **Timeline**: Histórico de atividades por mês

### Filtros Disponíveis
- Por museu
- Por período (mês/ano)
- Por tipo de atividade

## 🎯 Novas Funcionalidades

### Sistema de Temas
- Acesse **Aparência** para mudar tema global
- Prefere sua escolha em localStorage
- Temas: Padrão, Museu BH, Miro

### Integridade do Sistema
- Painel de auditoria de duplicatas
- Detector de inconsistências automático
- Backup periódico para Google Drive

### Gerador de Listas
- Gerador de **Lista de Presença** automático (PDF)
- Gerador de **Termo de Compromisso** (Word/PDF)

## 🔐 Segurança & Compliance

- ✅ Autenticação via Base44
- ✅ Controle de acesso por role (Admin, Coordenador, Profissional)
- ✅ Auditoria completa de ações
- ✅ Backup automático de documentos
- ✅ Exclusão de dados em 30 segundos

## 📞 Suporte

Para dúvidas sobre:
- **Relatórios**: Veja seção "Relatórios" na sidebar
- **Compras**: Acesse "Compras e Pagamentos"
- **Dados pessoais**: Edite em "Perfil → Informações"
- **Temas**: Configure em "Aparência e Manutenção"

---

**Última atualização**: 1º de maio de 2026  
**Versão**: 2.1  
**Status**: Pronto para produção