import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

const MANUAL_CONTENT = {
  title: 'Manual de Instruções - Plataforma Museu Centro',
  subtitle: 'Relatório Mensal Individual 2026',
  version: '1.0 - Março de 2026',
  sections: [
    {
      id: 'visao-geral',
      title: '🎯 Visão Geral',
      content: `A Plataforma Museu Centro é um sistema centralizado para registro, acompanhamento e aprovação de relatórios mensais dos profissionais dos museus.

Objetivos Principais:
• Facilitar o registro de atividades mensais
• Documentar oportunidades e desafios
• Acompanhar aprovação de relatórios
• Manter histórico centralizado de dados

Usuários do Sistema:
• Profissionais: Criam e editam seus relatórios mensais
• Coordenadores: Revisam e aprovam relatórios
• Administradores: Gerenciam configurações e usuários`
    },
    {
      id: 'primeiros-passos',
      title: '🚀 Primeiros Passos',
      content: `1. Acessando o Sistema
  • Acesse a plataforma através do link fornecido
  • Faça login com seu email corporativo
  • Complete seu registro se for primeira vez

2. Sua Primeira Página
Ao entrar no sistema, você verá o Painel Inicial com:
  • Números do Projeto: Visão consolidada de atividades e público
  • Atalhos Rápidos: Acesso rápido às principais funcionalidades
  • Relatórios Recentes: Últimos relatórios criados/editados
  • Alertas de Pendências: Se houver relatórios aguardando revisão`
    },
    {
      id: 'para-profissionais',
      title: '👤 Para Profissionais',
      content: `CRIANDO UM NOVO RELATÓRIO

Passo 1: Iniciar Novo Relatório
  • Clique em "Novo Relatório" (botão preto no canto superior direito)
  • Você será redirecionado para o editor

Passo 2: Preencher Identificação
  • Mês de Referência: Selecione o mês
  • Ano: Ano do relatório (padrão: 2026)
  • Nome do Profissional: Seu nome (pré-preenchido)
  • Função: Sua função (Educador, Produtor Cultural, etc.)
  • Museu Principal: Selecione seu museu

Passo 3: Resumo Executivo
  • Escreva um resumo das principais atividades
  • Use "Gerar com IA" para sugestões
  • Você pode editar o texto gerado livremente

Passo 4: Registrar Atividades
  • Clique em "Atividades"
  • Clique em "+ Adicionar Atividade"
  • Preencha: Título, Descrição, Data, Público Estimado, Classificação
  • Para META: Selecione código, resultado e status

Passo 5: Adicionar Oportunidades
  • Clique em "Oportunidades"
  • Momentos Especiais: Histórias e depoimentos (opcional)
  • Oportunidades: Descreva oportunidades encontradas

Passo 6: Avaliação do Mês
  • Preencha: Pontos Positivos, Dificuldades, Sugestões
  • MARQUE a checkbox de declaração de responsabilidade
  • Clique em "Enviar para Revisão"

SALVANDO E ENVIANDO
  • Auto-save: Sistema salva a cada 5 segundos
  • Salvar Rascunho: Fica como DRAFT
  • Enviar para Revisão: Notifica o coordenador`
    },
    {
      id: 'para-coordenadores',
      title: '👔 Para Coordenadores',
      content: `REVISANDO RELATÓRIOS

1. Acessar Relatórios Pendentes
  • Clique em "Revisão"
  • Filtre por museu ou status
  • Use a busca para encontrar relatórios específicos

2. Workflow de Revisão

INICIAR REVISÃO:
  • Clique em "Assumir Revisão"
  • Relatório muda para IN_REVIEW
  • Você é responsável pela revisão

REVISAR:
  • Clique em "Ver" para abrir o relatório
  • Leia todas as seções
  • Analise dados e observações

DEVOLVER (se necessário):
  • Clique em "Devolver"
  • Escreva comentários por seção
  • Profissional receberá notificação

APROVAR:
  • Clique em "Aprovar"
  • (Opcional) Adicione observação
  • Relatório muda para APPROVED

PAINEL DE COORDENAÇÃO
  • Visão geral de números
  • Carousel de momentos publicados
  • Métricas de atividades
  • Análise de oportunidades
  • Compliance Panel
  • Log completo de aprovações`
    },
    {
      id: 'funcionalidades-avancadas',
      title: '✨ Funcionalidades Avançadas',
      content: `EXPORTAR EM PDF
  • Abra um relatório
  • Clique em "Gerar PDF"
  • Arquivo é baixado automaticamente

BUSCA E FILTROS
  • Use barra de busca por nome, museu, mês ou atividade
  • Clique em "Filtros" para filtrar por múltiplos critérios
  • Aplique os filtros desejados

TEMPLATES DE RELATÓRIOS
  Salvar Como Template:
    • Clique em "Salvar como Template"
    • Dê nome e descrição
    • Escolha seções a incluir
  
  Carregar de Template:
    • Clique em "Carregar Template"
    • Selecione de seus templates ou públicos
    • Dados são pré-preenchidos

ANÁLISE DE ATIVIDADES
  • Visualize gráficos consolidados
  • Filtre por equipe, museu e período
  • Veja resumos de público e tipos

EXPORTAR CSV
  • Clique em "Exportar CSV"
  • Dados estruturados para análise em Excel`
    },
    {
      id: 'duvidas-frequentes',
      title: '❓ Dúvidas Frequentes',
      content: `P: Perdi meu relatório em rascunho?
R: Todos os rascunhos são salvos automaticamente. Acesse "Relatórios" e procure pelo status DRAFT.

P: Posso editar após enviar?
R: Não. Se o coordenador devolver (status RETURNED), você poderá editar novamente.

P: O que significa cada status?
• DRAFT: Rascunho em progresso
• SUBMITTED: Enviado, aguardando revisão
• IN_REVIEW: Coordenador está revisando
• RETURNED: Devolvido para ajustes
• APPROVED: Aprovado, pode exportar
• ARCHIVED: Arquivado, não pode editar

P: Como vejo comentários do coordenador?
R: Ao abrir relatório RETURNED, comentários aparecem em caixa vermelha no topo.

P: Existe limite de tempo para enviar?
R: Recomenda-se enviar até o final do mês.

P: Posso deletar um relatório?
R: Apenas relatórios DRAFT podem ser deletados por você.

P: Profissionais podem ver relatórios uns dos outros?
R: Não. Cada profissional vê apenas seus relatórios.`
    },
    {
      id: 'glossario',
      title: '📚 Glossário',
      content: `META: Atividades relacionadas a objetivos específicos do 3º Aditivo
ROTINA: Atividades habituais do departamento
EXTRA: Atividades adicionais ou extraordinárias
Público Estimado: Quantidade aproximada de pessoas impactadas
Template: Modelo reutilizável de relatório
Draft: Rascunho não enviado
Compliance: Conformidade com requisitos de envio
Auto-save: Salvamento automático de dados`
    },
    {
      id: 'dicas-uteis',
      title: '🎓 Dicas Úteis',
      content: `✅ Salve frequentemente enquanto edita
✅ Use templates para relatórios similares
✅ Revise antes de enviar - não há volta atrás
✅ Complete todas as seções obrigatórias
✅ Inclua dados precisos em públicos e datas
✅ Aproveite a IA para sugestões rápidas
✅ Comunique-se com coordenadores sobre prazos
✅ Revise os comentários devolvidos com atenção
✅ Mantenha um histórico local dos seus dados
✅ Use filtros para encontrar relatórios rapidamente`
    }
  ]
};

export default function ManualInstrucoes() {
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (id) => {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="min-h-screen bg-white py-12 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-black mb-2">{MANUAL_CONTENT.title}</h1>
          <p className="text-gray-500 text-lg mb-2">{MANUAL_CONTENT.subtitle}</p>
          <p className="text-xs text-gray-400">{MANUAL_CONTENT.version}</p>
        </div>

        {/* Table of Contents */}
        <div className="mb-12 p-6 bg-gray-50 rounded-2xl border border-gray-100">
          <h2 className="text-base font-semibold text-black mb-4">📋 Índice</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MANUAL_CONTENT.sections.map(section => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-sm text-gray-600 hover:text-black transition-colors"
              >
                • {section.title}
              </a>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {MANUAL_CONTENT.sections.map(section => (
            <div
              key={section.id}
              id={section.id}
              className="border border-gray-200 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full p-6 bg-white hover:bg-gray-50 flex items-center justify-between transition-colors"
              >
                <h2 className="text-lg font-semibold text-black text-left">{section.title}</h2>
                {expandedSections[section.id] ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
              </button>

              {expandedSections[section.id] && (
                <div className="border-t border-gray-100 p-6 bg-gray-50">
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {section.content}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 text-center text-xs text-gray-500">
          <p>Última atualização: Março de 2026</p>
          <p className="mt-1">Entre em contato com seu coordenador para dúvidas não abordadas</p>
        </div>

        {/* Action Button */}
        <div className="mt-8 flex justify-center">
          <Button
            onClick={() => window.print()}
            className="bg-black hover:bg-gray-800 text-white"
          >
            📄 Imprimir Manual
          </Button>
        </div>
      </div>
    </div>
  );
}