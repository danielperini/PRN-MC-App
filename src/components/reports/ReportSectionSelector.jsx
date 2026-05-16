import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const CAPITULOS = [
  { id: 'capa', label: 'Capa editorial', categoria: 'Estrutura' },
  { id: 'introducao_institucional', label: 'Introdução institucional', categoria: 'Estrutura' },
  { id: 'introducao', label: 'Introdução e território', categoria: 'Estrutura' },
  { id: 'resumo', label: 'Resumo e indicadores', categoria: 'Análise' },
  { id: 'metas', label: 'Metas do 3º Aditivo', categoria: 'Metas' },
  { id: 'publico', label: 'Público alcançado', categoria: 'Métricas' },
  { id: 'programacao', label: 'Programação', categoria: 'Conteúdo' },
  { id: 'agenda_programacao', label: 'Agenda de programação', categoria: 'Conteúdo' },
  { id: 'atividades', label: 'Atividades por eixo', categoria: 'Conteúdo' },
  { id: 'relatorios_completos', label: 'Relatórios completos das equipes', categoria: 'Conteúdo' },
  { id: 'galeria_evidencias', label: 'Galeria e evidências', categoria: 'Evidências' },
  { id: 'fotos', label: 'Fotos das atividades', categoria: 'Evidências' },
  { id: 'comunicacao', label: 'Comunicação', categoria: 'Comunicação' },
  { id: 'clipping_links', label: 'Clipping, redes sociais e links', categoria: 'Comunicação' },
  { id: 'execucao_financeira', label: 'Execução financeira', categoria: 'Financeiro' },
  { id: 'compras_rubricas', label: 'Compras e rubricas', categoria: 'Financeiro' },
  { id: 'execucao_rubrica', label: 'Execução por rubrica', categoria: 'Financeiro' },
  { id: 'orcamento_museu', label: 'Rubricas por museu', categoria: 'Financeiro' },
  { id: 'prestacao_contas', label: 'Prestação de contas', categoria: 'Financeiro' },
  { id: 'repositorio', label: 'Repositório documental', categoria: 'Documentos' },
  { id: 'plataforma', label: 'Museu Centro APP', categoria: 'Institucional' },
  { id: 'memoria_institucional', label: 'Memória institucional', categoria: 'Institucional' },
  { id: 'conclusao', label: 'Conclusão', categoria: 'Estrutura' },
];

const TEMPLATES = {
  completo: { nome: 'Relatório Completo', descricao: 'Todos os capítulos', capitulos: CAPITULOS.map((c) => c.id) },
  resumido: { nome: 'Relatório Resumido', descricao: 'Síntese executiva', capitulos: ['capa', 'introducao_institucional', 'resumo', 'metas', 'publico', 'atividades', 'conclusao'] },
  financeiro: { nome: 'Prestação de Contas', descricao: 'Foco financeiro', capitulos: ['capa', 'execucao_financeira', 'compras_rubricas', 'execucao_rubrica', 'orcamento_museu', 'prestacao_contas', 'conclusao'] },
  institucional: { nome: 'Relatório Institucional', descricao: 'Narrativa completa', capitulos: ['capa', 'introducao_institucional', 'introducao', 'resumo', 'metas', 'programacao', 'agenda_programacao', 'relatorios_completos', 'galeria_evidencias', 'comunicacao', 'plataforma', 'memoria_institucional', 'conclusao'] },
  patrocinador: { nome: 'Relatório Patrocinador', descricao: 'Resultados', capitulos: ['capa', 'resumo', 'metas', 'publico', 'programacao', 'atividades', 'galeria_evidencias', 'comunicacao', 'execucao_financeira', 'orcamento_museu', 'conclusao'] },
};

export default function ReportSectionSelector({ secoesSelecionadas = [], onSelectionChange, onGerar }) {
  const [selecionados, setSelecionados] = useState(secoesSelecionadas.length ? secoesSelecionadas : CAPITULOS.map((c) => c.id));
  const categorias = [...new Set(CAPITULOS.map((c) => c.categoria))];

  function update(next) {
    setSelecionados(next);
    onSelectionChange?.(next);
  }

  function toggle(id) {
    update(selecionados.includes(id) ? selecionados.filter((item) => item !== id) : [...selecionados, id]);
  }

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Selecione os Capítulos do Relatório</h3>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
          {Object.entries(TEMPLATES).map(([key, template]) => (
            <Button key={key} variant="outline" size="sm" onClick={() => update(template.capitulos)} className="text-xs h-auto py-2 flex flex-col gap-1">
              <span className="font-semibold">{template.nome}</span>
              <span className="text-xs text-gray-500">{template.descricao}</span>
            </Button>
          ))}
        </div>

        <div className="flex gap-2 mb-6 pb-4 border-b">
          <Button variant="secondary" size="sm" onClick={() => update(CAPITULOS.map((c) => c.id))} className="text-xs">✓ Todos</Button>
          <Button variant="secondary" size="sm" onClick={() => update([])} className="text-xs">✗ Nenhum</Button>
          <span className="ml-auto text-xs text-gray-600 py-2">{selecionados.length} de {CAPITULOS.length} capítulos selecionados</span>
        </div>

        <div className="space-y-5">
          {categorias.map((categoria) => (
            <section key={categoria} className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">{categoria}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border-l border-gray-200 pl-4">
                {CAPITULOS.filter((c) => c.categoria === categoria).map((capitulo) => (
                  <div key={capitulo.id} className="flex items-center gap-3">
                    <Checkbox id={capitulo.id} checked={selecionados.includes(capitulo.id)} onCheckedChange={() => toggle(capitulo.id)} />
                    <Label htmlFor={capitulo.id} className="cursor-pointer text-sm font-normal">{capitulo.label}</Label>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <Button onClick={() => onGerar?.(selecionados)} disabled={selecionados.length === 0} className="w-full bg-black text-white hover:bg-gray-900">
        📄 Gerar Relatório ({selecionados.length} capítulos)
      </Button>
    </Card>
  );
}
