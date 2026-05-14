import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Download, RefreshCw, Eye } from 'lucide-react';
import RelatorioEditorialSectionSelector from './RelatorioEditorialSectionSelector';

/**
 * Componente Fase 3 — Relatório Editorial Institucional
 * Permite seleção de seções + consolidação + visualização + exportação
 */
export default function RelatorioEditorialFase3({ relatorioId, museu, periodo }) {
  const [secoesSelecionadas, setSecoesSelecionadas] = useState([]);
  const [consolidacaoGerada, setConsolidacaoGerada] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [aba, setAba] = useState('selecao');

  const handleGerar = async () => {
    if (secoesSelecionadas.filter(s => s.selecionado).length === 0) {
      alert('Selecione pelo menos uma seção');
      return;
    }

    setCarregando(true);
    try {
      // Chamar função Base44 para consolidar
      const response = await base44.functions.invoke('consoConsolidacaoEditorial', {
        relatorio_id: relatorioId,
        periodo_mes: periodo?.mes,
        periodo_ano: periodo?.ano,
        museu: museu,
        incluir_releases: true,
        incluir_programacao: true,
        incluir_atividades: true
      });

      if (response.data?.sucesso) {
        setConsolidacaoGerada(response.data);
        setAba('visualizacao');
      }
    } catch (error) {
      console.error('Erro ao gerar consolidação:', error);
      alert('Erro ao gerar consolidação: ' + error.message);
    } finally {
      setCarregando(false);
    }
  };

  const handleExportar = async () => {
    if (!consolidacaoGerada) return;

    // Simulação de export para PDF
    const conteudo = consolidacaoGerada.narrativa;
    const elemento = document.createElement('a');
    elemento.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(conteudo);
    elemento.download = `Relatorio_Editorial_${museu}_${periodo?.ano}-${periodo?.mes}.txt`;
    elemento.click();
  };

  return (
    <div className="w-full space-y-6">
      <Tabs value={aba} onValueChange={setAba} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="selecao">Seleção de Seções</TabsTrigger>
          <TabsTrigger value="visualizacao" disabled={!consolidacaoGerada}>
            Visualização
          </TabsTrigger>
          <TabsTrigger value="ia">IA & Insights</TabsTrigger>
        </TabsList>

        {/* ABA 1: Seleção */}
        <TabsContent value="selecao" className="space-y-6">
          <RelatorioEditorialSectionSelector
            onSelecaoMudou={setSecoesSelecionadas}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Consolidação Editorial</p>
              <p>Selecione as seções desejadas para gerar uma narrativa única conectando:</p>
              <ul className="list-disc ml-4 mt-2 space-y-1 text-xs">
                <li>Relatório oficial do período</li>
                <li>Releases institucionais</li>
                <li>Programação cadastrada</li>
                <li>Atividades realizadas</li>
              </ul>
            </div>
          </div>

          <Button
            onClick={handleGerar}
            disabled={carregando}
            size="lg"
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {carregando ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Gerando Consolidação...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Gerar Relatório Editorial
              </>
            )}
          </Button>
        </TabsContent>

        {/* ABA 2: Visualização */}
        <TabsContent value="visualizacao" className="space-y-6">
          {consolidacaoGerada && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Relatório Editorial — {museu}</CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        {periodo?.mes} de {periodo?.ano}
                      </p>
                    </div>
                    <Button
                      onClick={handleExportar}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Exportar
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-slate-200">
                <CardContent className="pt-6">
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-slate-700 leading-relaxed text-justify">
                      {consolidacaoGerada.narrativa}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fontes Utilizadas */}
              <Card className="bg-slate-50">
                <CardHeader>
                  <CardTitle className="text-base">Fontes Utilizadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {consolidacaoGerada.fontes && (
                      <>
                        <div className="p-3 bg-white rounded border">
                          <p className="text-xs font-semibold text-slate-600">Relatório</p>
                          <p className="text-xl font-bold text-slate-900 mt-1">
                            {consolidacaoGerada.fontes.relatorio ? '✓' : '—'}
                          </p>
                        </div>
                        <div className="p-3 bg-white rounded border">
                          <p className="text-xs font-semibold text-slate-600">Releases</p>
                          <p className="text-xl font-bold text-slate-900 mt-1">
                            {consolidacaoGerada.fontes.releases || 0}
                          </p>
                        </div>
                        <div className="p-3 bg-white rounded border">
                          <p className="text-xs font-semibold text-slate-600">Programação</p>
                          <p className="text-xl font-bold text-slate-900 mt-1">
                            {consolidacaoGerada.fontes.programacao || 0}
                          </p>
                        </div>
                        <div className="p-3 bg-white rounded border">
                          <p className="text-xs font-semibold text-slate-600">Atividades</p>
                          <p className="text-xl font-bold text-slate-900 mt-1">
                            {consolidacaoGerada.fontes.atividades || 0}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ABA 3: IA & Insights */}
        <TabsContent value="ia" className="space-y-6">
          <Card className="bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
            <CardHeader>
              <CardTitle className="text-purple-900">IA Institucional — Fase 3</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              <p>
                Sistema inteligente contínuo capaz de:
              </p>
              <ul className="space-y-2 list-disc ml-4">
                <li><strong>Memória Institucional</strong> — Histórico, evolução, linha do tempo</li>
                <li><strong>Observatório Cultural</strong> — Participação, território, acessibilidade</li>
                <li><strong>IA Curatorial</strong> — Destaques, impacto, narrativas</li>
                <li><strong>IA Territorial</strong> — Bairros, circulação, ocupação urbana</li>
                <li><strong>IA de Comunicação</strong> — Imprensa, repercussão, alcance</li>
                <li><strong>IA de Impacto Social</strong> — Participação, fidelização, transformação</li>
                <li><strong>IA Multimodal</strong> — Imagens, vídeos, PDFs, documentos</li>
                <li><strong>Sistema de Recomendação</strong> — Sugestões automáticas</li>
                <li><strong>IA de Governança</strong> — Detecção de riscos e inconsistências</li>
                <li><strong>IA de Conhecimento</strong> — Respostas a perguntas institucionais</li>
              </ul>
              <p className="text-xs text-slate-600 mt-4 pt-4 border-t">
                📊 Fase 3 transforma Museus Centro de "app de relatórios" para 
                <strong> plataforma institucional inteligente de gestão cultural, memória, transparência e inteligência territorial.</strong>
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}