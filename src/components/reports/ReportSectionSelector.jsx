import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { REPORT_CHAPTERS, REPORT_CHAPTER_IDS, buildReportSectionOptions } from '@/config/reportChapters';

const CAPITULOS = buildReportSectionOptions(REPORT_CHAPTERS).map((option) => ({
  id: option.id,
  sectionId: option.sectionId,
  contentKey: option.contentKey,
  label: option.title,
  categoria: option.chapter?.group,
}));

const TEMPLATES = {
  completo: { nome: 'Relatório Completo', descricao: 'Todos os capítulos', capitulos: REPORT_CHAPTER_IDS },
  resumido: { nome: 'Relatório Resumido', descricao: 'Síntese executiva', capitulos: ['capa', 'sumario_executivo', 'introducao', 'indicadores_premium', 'publico', 'metas', 'conclusao'] },
  financeiro: { nome: 'Prestação de Contas', descricao: 'Foco financeiro', capitulos: ['capa', 'financeiro', 'rubricas', 'prestacao', 'notas-fiscais-contratos', 'governanca_documental', 'conclusao'] },
  institucional: { nome: 'Relatório Institucional', descricao: 'Narrativa completa', capitulos: ['capa', 'expediente', 'introducao', 'territorio', 'programacao', 'agenda_programacao', 'atividades_museu', 'relatorios_completos', 'galeria_evidencias', 'comunicacao', 'app_museu_centro', 'sistema_governanca', 'conclusao'] },
  patrocinador: { nome: 'Relatório Patrocinador', descricao: 'Resultados', capitulos: ['capa', 'sumario_executivo', 'indicadores_premium', 'publico', 'programacao', 'galeria_evidencias', 'comunicacao', 'financeiro', 'conclusao'] },
};

export default function ReportSectionSelector({ secoesSelecionadas = [], onSelectionChange, onGerar }) {
  const [selecionados, setSelecionados] = useState(secoesSelecionadas.length ? secoesSelecionadas : REPORT_CHAPTER_IDS);
  const categorias = [...new Set(CAPITULOS.map((chapter) => chapter.categoria))];

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
          <Button variant="secondary" size="sm" onClick={() => update(REPORT_CHAPTER_IDS)} className="text-xs">Todos</Button>
          <Button variant="secondary" size="sm" onClick={() => update([])} className="text-xs">Nenhum</Button>
          <span className="ml-auto text-xs text-gray-600 py-2">{selecionados.length} de {CAPITULOS.length} capítulos selecionados</span>
        </div>

        <div className="space-y-5">
          {categorias.map((categoria) => (
            <section key={categoria} className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">{categoria}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border-l border-gray-200 pl-4">
                {CAPITULOS.filter((chapter) => chapter.categoria === categoria).map((capitulo) => (
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
        Gerar Relatório ({selecionados.length} capítulos)
      </Button>
    </Card>
  );
}
