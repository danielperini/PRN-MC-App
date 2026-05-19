import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { REPORT_CHAPTERS } from '@/config/reportChapters';

const TYPE_ICONS = {
  editorial: '📄',
  data: '📊',
  gallery: '📸',
  financial: '💰',
  governance: '🧭',
  conclusion: '🎯',
};

const SECOES_PADRAO = REPORT_CHAPTERS.map((chapter) => ({
  id: chapter.id,
  nome: chapter.title,
  descricao: chapter.summaryDescription || chapter.group,
  icone: TYPE_ICONS[chapter.type] || '📄',
  selecionado: chapter.defaultSelected !== false,
}));

export default function RelatorioEditorialSectionSelector({ onSelecaoMudou, secoesSelecionadas = null }) {
  const [secoes, setSecoes] = useState(secoesSelecionadas || SECOES_PADRAO);
  const [expandido, setExpandido] = useState(false);

  const handleToggleSecao = (id) => {
    const novasSecoes = secoes.map((secao) =>
      secao.id === id ? { ...secao, selecionado: !secao.selecionado } : secao
    );
    setSecoes(novasSecoes);
    onSelecaoMudou?.(novasSecoes);
  };

  const handleSelecionarTodas = () => {
    const novasSecoes = secoes.map((secao) => ({ ...secao, selecionado: true }));
    setSecoes(novasSecoes);
    onSelecaoMudou?.(novasSecoes);
  };

  const handleDesselecionarTodas = () => {
    const novasSecoes = secoes.map((secao) => ({ ...secao, selecionado: false }));
    setSecoes(novasSecoes);
    onSelecaoMudou?.(novasSecoes);
  };

  const totalSelecionadas = secoes.filter((secao) => secao.selecionado).length;

  return (
    <Card className="border-2 border-slate-200">
      <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setExpandido(!expandido)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Seções do Relatório Editorial</CardTitle>
            <span className="text-sm font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded">
              {totalSelecionadas} de {secoes.length}
            </span>
          </div>
          {expandido ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
        </div>
      </CardHeader>

      {expandido ? (
        <CardContent className="space-y-6 pt-6">
          <div className="flex gap-2 pb-4 border-b">
            <Button variant="outline" size="sm" onClick={handleSelecionarTodas}>Selecionar todas</Button>
            <Button variant="outline" size="sm" onClick={handleDesselecionarTodas}>Limpar seleção</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {secoes.map((secao) => (
              <label key={secao.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer">
                <Checkbox checked={secao.selecionado} onCheckedChange={() => handleToggleSecao(secao.id)} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">{secao.icone}</span>
                    <Label className="cursor-pointer font-medium text-slate-900">{secao.nome}</Label>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{secao.descricao}</p>
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
