import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const TOOLTIPS = {
  Dashboard: 'Visão geral do sistema com indicadores principais e atividades recentes',
  EntradaUnica: 'Upload centralizado de documentos para processamento automático e roteamento',
  Relatorios: 'Edição e envio de relatórios mensais com atividades e métricas',
  CoordReview: 'Revisão e aprovação de relatórios enviados pelos profissionais',
  Compras: 'Gerenciamento de solicitações de compra, pagamentos e documentação',
  Agenda: 'Calendario com programação de eventos dos museus',
  GaleriaFotos: 'Galeria de fotos aprovadas com metadata e busca avançada',
  RubricasPorMuseu: 'Consulta de rubricas orçamentárias por museu e disponibilidade',
  GestorArquivos: 'Gerenciamento de arquivos, backup e sincronização com Google Drive',
  ProgramacaoEspelho: 'Dados completos da programação com links, minibios e materiais de divulgação',
  MeusDados: 'Perfil pessoal, configurações e preferências de notificações',
  Mensagens: 'Sistema de mensagens para comunicação com equipe e coordenação',
  UserManagement: 'Gerenciar usuários, permissões e papéis no sistema',
  PlataformaAdmin: 'Configurações gerais, backup e manutenção da plataforma',
  GeradorListaPresenca: 'Gerar automaticamente listas de presença formatadas para eventos',
  GeradorTermoCompromisso: 'Gerador de termos de compromisso para contratos e parcerias',
  AssistentePlanejamento: 'Assistente IA para análise, sugestões e planejamento de atividades',
  Manual: 'Manual completo, guias de uso e centro de ajuda',
  LeitorNoticias: 'Feed de notícias sobre cultura, arte e eventos relacionados',
};

export default function SidebarTooltip({ label, children, collapsed }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);
  const autoCloseRef = useRef(null);

  const handleMouseEnter = () => {
    if (collapsed) {
      timeoutRef.current = setTimeout(() => {
        setVisible(true);
        // Auto-fechar após 5 segundos
        autoCloseRef.current = setTimeout(() => {
          setVisible(false);
        }, 5000);
      }, 500); // 500ms de delay para 5s total
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    setVisible(false);
  };

  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    setVisible(false);
  };

  const tooltip = TOOLTIPS[label];
  if (!tooltip) return children;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
    >
      {children}

      {visible && collapsed && (
        <div className="fixed left-20 top-0 z-50 mt-0">
          <div className="bg-slate-950 border border-slate-700 rounded-lg shadow-lg p-3 w-56 animate-slide-in">
            <div className="flex justify-between items-start gap-2 mb-2">
              <p className="font-semibold text-white text-sm leading-tight">{label}</p>
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-white flex-shrink-0 p-0.5"
                title="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">{tooltip}</p>
            <p className="text-slate-500 text-[10px] mt-2">Fecha automaticamente em 5s</p>
          </div>
        </div>
      )}
    </div>
  );
}