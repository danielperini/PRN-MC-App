import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

const SECOES_PADRAO = [
  {
    id: 'capa',
    nome: 'Capa Editorial',
    descricao: 'Título, período, museu, visual',
    icone: '📄',
    selecionado: true
  },
  {
    id: 'territorio',
    nome: 'Introdução e Território',
    descricao: 'Contexto, bairro, ocupação urbana, circulação',
    icone: '🗺️',
    selecionado: true
  },
  {
    id: 'indicadores',
    nome: 'Resumo e Indicadores',
    descricao: 'Números principais, métricas, KPIs',
    icone: '📊',
    selecionado: true
  },
  {
    id: 'publico',
    nome: 'Público Alcançado',
    descricao: 'Quantidades, faixas etárias, distribuição, impacto',
    icone: '👥',
    selecionado: true
  },
  {
    id: 'atividades',
    nome: 'Atividades por Eixo',
    descricao: 'Educativo, produção, comunicação, análise temática',
    icone: '🎭',
    selecionado: true
  },
  {
    id: 'financeiro',
    nome: 'Execução Financeira',
    descricao: 'Rubricas, gastos, análise orçamentária',
    icone: '💰',
    selecionado: true
  },
  {
    id: 'prestacao',
    nome: 'Prestação de Contas',
    descricao: 'Conformidade, auditoria, documentação',
    icone: '✅',
    selecionado: true
  },
  {
    id: 'conclusao',
    nome: 'Conclusão',
    descricao: 'Síntese, aprendizados, recomendações, perspectivas',
    icone: '🎯',
    selecionado: true
  }
];

export default function RelatorioEditorialSectionSelector({ onSelecaoMudou, secoesSelecionadas = null }) {
  const [secoes, setSecoes] = useState(
    secoesSelecionadas || SECOES_PADRAO
  );
  const [expandido, setExpandido] = useState(false);

  const handleToggleSecao = (id) => {
    const novasSecoes = secoes.map(secao =>
      secao.id === id ? { ...secao, selecionado: !secao.selecionado } : secao
    );
    setSecoes(novasSecoes);
    if (onSelecaoMudou) {
      onSelecaoMudou(novasSecoes);
    }
  };

  const handleSelecionarTodas = () => {
    const novasSecoes = secoes.map(s => ({ ...s, selecionado: true }));
    setSecoes(novasSecoes);
    if (onSelecaoMudou) {
      onSelecaoMudou(novasSecoes);
    }
  };

  const handleDesselecionarTodas = () => {
    const novasSecoes = secoes.map(s => ({ ...s, selecionado: false }));
    setSecoes(novasSecoes);
    if (onSelecaoMudou) {
      onSelecaoMudou(novasSecoes);
    }
  };

  const totalSelecionadas = secoes.filter(s => s.selecionado).length;

  return (
    <Card className="border-2 border-slate-200">
      <CardHeader 
        className="cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Seções do Relatório Editorial</CardTitle>
            <span className="text-sm font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded">
              {totalSelecionadas} de {secoes.length}
            </span>
          </div>
          {expandido ? 
            <ChevronUp className="w-5 h-5 text-slate-500" /> :
            <ChevronDown className="w-5 h-5 text-slate-500" />
          }
        </div>
      </CardHeader>

      {expandido && (
        <CardContent className="space-y-6 pt-6">
          {/* Ações Rápidas */}
          <div className="flex gap-2 pb-4 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelecionarTodas}
              className="text-xs"
            >
              Selecionar Todas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDesselecionarTodas}
              className="text-xs"
            >
              Desselecionar Todas
            </Button>
          </div>

          {/* Grid de Seções */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {secoes.map(secao => (
              <div
                key={secao.id}
                className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  secao.selecionado
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                onClick={() => handleToggleSecao(secao.id)}
              >
                <Checkbox
                  id={secao.id}
                  checked={secao.selecionado}
                  onCheckedChange={() => handleToggleSecao(secao.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <Label 
                    htmlFor={secao.id}
                    className="flex items-center gap-2 cursor-pointer font-semibold text-slate-900"
                  >
                    <span className="text-lg">{secao.icone}</span>
                    {secao.nome}
                  </Label>
                  <p className="text-xs text-slate-600 mt-1">{secao.descricao}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Resumo de Seleção */}
          <div className="bg-slate-50 p-4 rounded-lg border">
            <p className="text-sm font-semibold text-slate-700 mb-2">Seções selecionadas:</p>
            <div className="flex flex-wrap gap-2">
              {secoes
                .filter(s => s.selecionado)
                .map(s => (
                  <span
                    key={s.id}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full"
                  >
                    {s.icone} {s.nome}
                  </span>
                ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}