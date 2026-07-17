/**
 * GeracaoCompletaDialog
 * 
 * Painel de geração completa do relatório em 6 etapas sequenciais.
 * Cada etapa chama gerarRelatorioCompleto com a etapa correspondente.
 * Ao final, recarrega o relatório e exibe resumo auditado.
 */
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  X, Sparkles, CheckCircle2, AlertCircle, Loader2,
  FileText, Users, ImagePlus, BarChart2, BookOpen, FolderCheck,
} from 'lucide-react';
import { toast } from 'sonner';

const ETAPAS = [
  {
    key: 'contexto',
    label: 'Coleta de dados reais',
    descricao: 'Carrega relatórios da equipe, atividades, fotos, NFs e rubricas do período.',
    icon: BarChart2,
    cor: 'blue',
  },
  {
    key: 'textos_principais',
    label: 'Geração de textos principais',
    descricao: 'Descrição das ações, divulgação, impactos e avaliação — com citações reais da equipe.',
    icon: FileText,
    cor: 'purple',
  },
  {
    key: 'metas_detalhadas',
    label: 'Metas detalhadas por IA',
    descricao: 'Cada meta recebe análise densa: atividades vinculadas, NFs, fotos comprobatórias e % de execução.',
    icon: BookOpen,
    cor: 'indigo',
  },
  {
    key: 'equipe_financeiro',
    label: 'Equipe e quadro financeiro',
    descricao: 'Monta a tabela de profissionais, rubricas auditadas e links de documentos.',
    icon: Users,
    cor: 'green',
  },
  {
    key: 'fotos_evidencias',
    label: 'Fotos e evidências por meta',
    descricao: 'Vincula fotos comprobatórias a cada meta e gera o levantamento de pendências.',
    icon: ImagePlus,
    cor: 'orange',
  },
  {
    key: 'finalizar',
    label: 'Finalização e auditoria',
    descricao: 'Registra o relatório como pronto para revisão e exportação.',
    icon: FolderCheck,
    cor: 'emerald',
  },
];

const COR_CLASSES = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
};

export default function GeracaoCompletaDialog({ relatorioId, form, onConcluido, onClose }) {
  const [executando, setExecutando] = useState(false);
  const [etapaAtual, setEtapaAtual] = useState(-1); // -1 = aguardando início
  const [statusEtapas, setStatusEtapas] = useState({}); // key -> 'ok' | 'erro' | 'executando'
  const [resumos, setResumos] = useState({}); // key -> dados retornados
  const [erros, setErros] = useState({});

  const pct = etapaAtual < 0 ? 0 : Math.round(((etapaAtual + 1) / ETAPAS.length) * 100);

  async function iniciar() {
    if (!relatorioId) {
      toast.error('Nenhum relatório ativo. Gere primeiro um relatório na aba acima.');
      return;
    }
    setExecutando(true);
    setEtapaAtual(0);
    setStatusEtapas({});
    setResumos({});
    setErros({});

    for (let i = 0; i < ETAPAS.length; i++) {
      const etapa = ETAPAS[i];
      setEtapaAtual(i);
      setStatusEtapas(s => ({ ...s, [etapa.key]: 'executando' }));

      try {
        const res = await base44.functions.invoke('gerarRelatorioCompleto', {
          relatorio_id: relatorioId,
          etapa: etapa.key,
          data_inicio: form.data_inicio,
          data_fim: form.data_fim,
          filtro_museu: form.filtro_museu,
          filtro_meta_ids: form.filtro_meta_ids,
        });

        const data = res?.data || res;
        setStatusEtapas(s => ({ ...s, [etapa.key]: 'ok' }));
        setResumos(s => ({ ...s, [etapa.key]: data }));

        // Pequena pausa entre etapas para não saturar
        if (i < ETAPAS.length - 1) {
          await new Promise(r => setTimeout(r, 400));
        }
      } catch (err) {
        const msg = err?.message || String(err);
        setStatusEtapas(s => ({ ...s, [etapa.key]: 'erro' }));
        setErros(s => ({ ...s, [etapa.key]: msg }));
        // Erros não fatais: continua as próximas etapas
        toast.warning(`Etapa "${etapa.label}" falhou (continuando): ${msg}`);
      }
    }

    setExecutando(false);
    toast.success('Geração completa concluída! Relatório pronto para revisão e exportação em PDF.');
    onConcluido?.();
  }

  const etapasOk = Object.values(statusEtapas).filter(s => s === 'ok').length;
  const etapasErro = Object.values(statusEtapas).filter(s => s === 'erro').length;
  const concluido = !executando && etapaAtual === ETAPAS.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-900 to-slate-700 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <div>
              <h2 className="text-white font-bold text-base">Geração Completa por IA</h2>
              <p className="text-slate-300 text-xs">Dados reais · Citações da equipe · Fotos comprobatórias · 6 etapas</p>
            </div>
          </div>
          {!executando && (
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Barra de progresso */}
          {etapaAtual >= 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{executando ? `Executando etapa ${etapaAtual + 1} de ${ETAPAS.length}…` : concluido ? 'Concluído!' : ''}</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-2.5" />
              {concluido && (
                <div className="flex gap-3 text-xs">
                  <span className="text-green-600 font-medium">{etapasOk} etapas com sucesso</span>
                  {etapasErro > 0 && <span className="text-amber-600">{etapasErro} com aviso</span>}
                </div>
              )}
            </div>
          )}

          {/* Lista de etapas */}
          <div className="space-y-2">
            {ETAPAS.map((etapa, i) => {
              const status = statusEtapas[etapa.key];
              const Icon = etapa.icon;
              const resumo = resumos[etapa.key];
              const erro = erros[etapa.key];
              const ativo = etapaAtual === i;
              const aguardando = etapaAtual < i;

              return (
                <div
                  key={etapa.key}
                  className={`rounded-xl border p-3.5 transition-all ${
                    status === 'ok' ? 'border-green-200 bg-green-50' :
                    status === 'erro' ? 'border-amber-200 bg-amber-50' :
                    ativo ? `border-2 ${COR_CLASSES[etapa.cor]}` :
                    'border-slate-100 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      status === 'ok' ? 'bg-green-100' :
                      status === 'erro' ? 'bg-amber-100' :
                      ativo ? 'bg-white shadow-sm' : 'bg-slate-200'
                    }`}>
                      {status === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : status === 'erro' ? (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      ) : status === 'executando' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      ) : (
                        <Icon className={`w-4 h-4 ${aguardando ? 'text-slate-400' : 'text-slate-600'}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${
                          status === 'ok' ? 'text-green-800' :
                          status === 'erro' ? 'text-amber-800' :
                          ativo ? 'text-slate-900' : 'text-slate-500'
                        }`}>{etapa.label}</span>
                        {status === 'ok' && <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">Concluído</Badge>}
                        {status === 'erro' && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Aviso</Badge>}
                        {status === 'executando' && <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">Processando…</Badge>}
                      </div>
                      <p className={`text-xs mt-0.5 ${ativo || status ? 'text-slate-600' : 'text-slate-400'}`}>
                        {etapa.descricao}
                      </p>
                      {/* Resumo da etapa */}
                      {status === 'ok' && resumo && (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {resumo.total_atividades != null && (
                            <span className="text-[10px] bg-white border border-green-200 text-green-700 px-1.5 py-0.5 rounded-full">
                              {resumo.total_atividades} atividades
                            </span>
                          )}
                          {resumo.publicoTotal != null && (
                            <span className="text-[10px] bg-white border border-green-200 text-green-700 px-1.5 py-0.5 rounded-full">
                              Público: {resumo.publicoTotal.toLocaleString('pt-BR')}
                            </span>
                          )}
                          {resumo.total_reports != null && (
                            <span className="text-[10px] bg-white border border-green-200 text-green-700 px-1.5 py-0.5 rounded-full">
                              {resumo.total_reports} relatórios da equipe
                            </span>
                          )}
                          {resumo.total_metas != null && (
                            <span className="text-[10px] bg-white border border-green-200 text-green-700 px-1.5 py-0.5 rounded-full">
                              {resumo.total_metas} metas
                            </span>
                          )}
                          {resumo.total_fotos != null && (
                            <span className="text-[10px] bg-white border border-green-200 text-green-700 px-1.5 py-0.5 rounded-full">
                              {resumo.total_fotos} fotos
                            </span>
                          )}
                          {resumo.total_equipe != null && (
                            <span className="text-[10px] bg-white border border-green-200 text-green-700 px-1.5 py-0.5 rounded-full">
                              {resumo.total_equipe} profissionais
                            </span>
                          )}
                          {resumo.total_fotos_vinculadas != null && (
                            <span className="text-[10px] bg-white border border-green-200 text-green-700 px-1.5 py-0.5 rounded-full">
                              {resumo.total_fotos_vinculadas} fotos vinculadas
                            </span>
                          )}
                          {resumo.pendencias != null && resumo.pendencias > 0 && (
                            <span className="text-[10px] bg-white border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">
                              {resumo.pendencias} pendências detectadas
                            </span>
                          )}
                          {resumo.totalAprovado && (
                            <span className="text-[10px] bg-white border border-green-200 text-green-700 px-1.5 py-0.5 rounded-full">
                              {resumo.totalAprovado}
                            </span>
                          )}
                        </div>
                      )}
                      {erro && (
                        <p className="text-[10px] text-amber-700 mt-1 bg-amber-50 px-2 py-1 rounded">
                          ⚠ {erro.slice(0, 120)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Aviso sobre PDFs */}
          {concluido && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
              <p className="font-semibold">✅ Relatório gerado e pronto para exportação!</p>
              <p className="text-xs text-blue-700">
                Use <strong>"Revisar e Exportar"</strong> para editar seções antes do envio, 
                ou <strong>"PDF (3 partes)"</strong> para gerar diretamente. 
                Cada parte pode ser baixada separadamente para evitar timeout.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-center justify-between gap-3">
          {!executando && !concluido && (
            <p className="text-xs text-slate-500">
              A geração é feita em 6 etapas para evitar timeout. Aguarde cada etapa concluir.
            </p>
          )}
          {concluido && <p className="text-xs text-green-600 font-medium">Geração concluída com sucesso.</p>}
          {executando && <p className="text-xs text-blue-600">Não feche esta janela durante a geração.</p>}
          <div className="flex gap-2 ml-auto">
            {!executando && !concluido && (
              <>
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button onClick={iniciar} className="bg-slate-900 hover:bg-slate-700 text-white">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Iniciar Geração Completa
                </Button>
              </>
            )}
            {concluido && (
              <Button onClick={onClose} className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Fechar e Revisar
              </Button>
            )}
            {executando && (
              <Button disabled className="opacity-60">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Gerando…
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}