import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronUp } from 'lucide-react';

const TODAS_SECOES = [
  { id: 'capa', label: 'Capa Editorial', categoria: 'Estrutura' },
  { id: 'registros', label: 'Registros e Evidências', categoria: 'Conteúdo' },
  { id: 'introducao', label: 'Introdução e Território', categoria: 'Conteúdo' },
  { id: 'resumo', label: 'Resumo e Indicadores', categoria: 'Análise' },
  { id: 'publico', label: 'Público Alcançado', categoria: 'Métricas' },
  { id: 'programacao', label: 'Programação do Período', categoria: 'Conteúdo' },
  { id: 'atividades', label: 'Atividades por Eixo', categoria: 'Conteúdo' },
  { id: 'fotos', label: 'Fotos e Galeria', categoria: 'Conteúdo' },
  { id: 'comunicacao', label: 'Comunicação e Clipping', categoria: 'Conteúdo' },
  { id: 'releases', label: 'Releases e Destaques', categoria: 'Conteúdo' },
  { id: 'execucao_financeira', label: 'Execução Financeira', categoria: 'Financeiro' },
  { id: 'execucao_rubrica', label: 'Execução por Rubrica', categoria: 'Financeiro' },
  { id: 'pagamentos', label: 'Pagamentos e Solicitações', categoria: 'Financeiro' },
  { id: 'repositorio', label: 'Repositório Documental', categoria: 'Documentos' },
  { id: 'orcamento_museu', label: 'Orçamento por Museu', categoria: 'Financeiro' },
  { id: 'contratos', label: 'Contratos Vinculados', categoria: 'Documentos' },
  { id: 'aprovacoes', label: 'Aprovações e Pagamentos', categoria: 'Financeiro' },
  { id: 'indicadores', label: 'Indicadores Institucionais', categoria: 'Análise' },
  { id: 'plataforma', label: 'Desenvolvimento da Plataforma', categoria: 'Institucional' },
  { id: 'conclusao', label: 'Conclusão Editorial', categoria: 'Estrutura' },
];

const TEMPLATES = {
  completo: {
    nome: 'Relatório Completo',
    descricao: 'Todas as seções',
    secoes: TODAS_SECOES.map(s => s.id)
  },
  resumido: {
    nome: 'Relatório Resumido',
    descricao: 'Estrutura, resumos e indicadores',
    secoes: ['capa', 'introducao', 'resumo', 'publico', 'atividades', 'indicadores', 'conclusao']
  },
  financeiro: {
    nome: 'Prestação de Contas',
    descricao: 'Foco total em finanças',
    secoes: ['capa', 'execucao_financeira', 'execucao_rubrica', 'pagamentos', 'orcamento_museu', 'aprovacoes', 'conclusao']
  },
  institucional: {
    nome: 'Relatório Institucional',
    descricao: 'Narrativa e conteúdo completo',
    secoes: ['capa', 'introducao', 'resumo', 'publico', 'programacao', 'atividades', 'fotos', 'comunicacao', 'releases', 'indicadores', 'conclusao']
  },
  patrocinador: {
    nome: 'Relatório Patrocinador',
    descricao: 'Atividades, público e resultados',
    secoes: ['capa', 'resumo', 'publico', 'atividades', 'fotos', 'indicadores', 'conclusao']
  }
};

export default function ReportSectionSelector({ secoesSelecionadas = [], onSelectionChange, onGerar }) {
  const [secoes, setSecoes] = useState(
    secoesSelecionadas.length > 0 
      ? secoesSelecionadas 
      : TODAS_SECOES.map(s => s.id)
  );
  const [expandido, setExpandido] = useState({});

  const handleToggleSeccao = (id) => {
    const novasSecoes = secoes.includes(id)
      ? secoes.filter(s => s !== id)
      : [...secoes, id];
    setSecoes(novasSecoes);
    onSelectionChange?.(novasSecoes);
  };

  const handleTodas = () => {
    setSecoes(TODAS_SECOES.map(s => s.id));
    onSelectionChange?.(TODAS_SECOES.map(s => s.id));
  };

  const handleNenhuma = () => {
    setSecoes([]);
    onSelectionChange?.([]);
  };

  const handleTemplate = (templateId) => {
    const template = TEMPLATES[templateId];
    setSecoes(template.secoes);
    onSelectionChange?.(template.secoes);
  };

  const categorias = [...new Set(TODAS_SECOES.map(s => s.categoria))];

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Selecione as Seções do Relatório</h3>
        
        {/* Templates rápidos */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
          {Object.entries(TEMPLATES).map(([key, template]) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              onClick={() => handleTemplate(key)}
              className="text-xs h-auto py-2 flex flex-col items-center justify-center gap-1"
            >
              <span className="font-semibold">{template.nome}</span>
              <span className="text-xs text-gray-500">{template.descricao}</span>
            </Button>
          ))}
        </div>

        {/* Ações rápidas */}
        <div className="flex gap-2 mb-6 pb-4 border-b">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTodas}
            className="text-xs"
          >
            ✓ Todas
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleNenhuma}
            className="text-xs"
          >
            ✗ Nenhuma
          </Button>
          <span className="ml-auto text-xs text-gray-600 py-2">
            {secoes.length} de {TODAS_SECOES.length} seções selecionadas
          </span>
        </div>

        {/* Seções por categoria */}
        <div className="space-y-4">
          {categorias.map(categoria => {
            const secoesDaCategoria = TODAS_SECOES.filter(s => s.categoria === categoria);
            const isExpanded = expandido[categoria] !== false;
            
            return (
              <div key={categoria}>
                <button
                  onClick={() => setExpandido(prev => ({ ...prev, [categoria]: !prev[categoria] }))}
                  className="flex items-center gap-2 w-full py-2 px-3 hover:bg-slate-50 rounded-lg font-medium text-sm"
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span>{categoria}</span>
                  <span className="ml-auto text-xs text-gray-500">
                    ({secoesDaCategoria.filter(s => secoes.includes(s.id)).length}/{secoesDaCategoria.length})
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-4 space-y-2 border-l border-gray-200 pl-4 py-2">
                    {secoesDaCategoria.map(seccao => (
                      <div key={seccao.id} className="flex items-center gap-3">
                        <Checkbox
                          id={seccao.id}
                          checked={secoes.includes(seccao.id)}
                          onCheckedChange={() => handleToggleSeccao(seccao.id)}
                        />
                        <Label
                          htmlFor={seccao.id}
                          className="cursor-pointer text-sm font-normal"
                        >
                          {seccao.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Botão gerar */}
      <Button
        onClick={() => onGerar?.(secoes)}
        disabled={secoes.length === 0}
        className="w-full bg-black text-white hover:bg-gray-900"
      >
        📄 Gerar Relatório ({secoes.length} seções)
      </Button>
    </Card>
  );
}