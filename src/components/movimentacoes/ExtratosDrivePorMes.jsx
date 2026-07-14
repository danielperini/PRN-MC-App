import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { EXTRATO_DRIVE_FOLDERS_2026 } from '@/config/extratoDriveFolders';
import { AlertCircle, Banknote, CheckCircle2, Clock3, ExternalLink, FolderOpen, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

function contarDocumentos(registros) {
  const ids = new Set(registros.map(r => r.drive_file_id || r.id).filter(Boolean));
  return ids.size;
}

function resumirErros(erros = []) {
  return erros.slice(0, 3).map(erro => ({
    arquivo: erro.arquivo || 'Arquivo sem nome',
    etapa: erro.etapa || 'processamento',
    mensagem: erro.erro || 'Erro não informado',
  }));
}

function formatarTempo(segundos) {
  if (!Number.isFinite(segundos) || segundos <= 0) return 'menos de 1 minuto';
  if (segundos < 60) return `${Math.ceil(segundos)}s`;
  const minutos = Math.ceil(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

const progressoInicial = {
  ativo: false,
  etapa: '',
  percentual: 0,
  processados: 0,
  total: 0,
  restantes: 0,
  importados: 0,
  erros: 0,
  etaSegundos: null,
};

export default function ExtratosDrivePorMes({ movimentacoes = [], onSincronizado }) {
  const [sincronizandoMes, setSincronizandoMes] = useState(null);
  const [errosPorMes, setErrosPorMes] = useState({});
  const [progressoPorMes, setProgressoPorMes] = useState({});

  const registrosPorMes = useMemo(() => {
    const map = new Map();
    movimentacoes.forEach(registro => {
      const key = `${registro.ano}-${String(registro.mes_num || 0).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(registro);
    });
    return map;
  }, [movimentacoes]);

  function atualizarProgresso(mes, patch) {
    setProgressoPorMes(prev => ({
      ...prev,
      [mes]: { ...(prev[mes] || progressoInicial), ...patch },
    }));
  }

  async function sincronizarPasta(item) {
    if (!item.folder_id) {
      toast.error(`A pasta de ${item.mes} ainda não foi informada.`);
      return;
    }

    const mes = item.mes_num;
    const inicioGeral = Date.now();
    let processadosAcumulados = 0;
    let importadosAcumulados = 0;
    let errosAcumulados = 0;
    let totalEstimado = 0;
    let restantes = 0;
    let ciclos = 0;
    const todosErros = [];

    setSincronizandoMes(mes);
    setErrosPorMes(prev => ({ ...prev, [mes]: [] }));
    atualizarProgresso(mes, {
      ...progressoInicial,
      ativo: true,
      etapa: 'Lendo a pasta do Google Drive…',
      percentual: 2,
    });
    toast.info(`Importando e processando os extratos de ${item.mes}…`);

    try {
      do {
        ciclos += 1;
        atualizarProgresso(mes, {
          ativo: true,
          etapa: ciclos === 1 ? 'Localizando os PDFs…' : `Processando lote ${ciclos}…`,
        });

        const response = await base44.functions.invoke('lerExtratosBancariosDrive', {
          mes_num: mes,
          ano: item.ano,
          folder_id: item.folder_id,
          batch_size: 3,
        });
        const data = response?.data || response || {};
        if (!data.success) throw new Error(data.error || 'Falha ao ler a pasta mensal');

        const resumo = data.resumo || {};
        const processadosLote = Number(resumo.processados_neste_lote || 0);
        const importadosLote = Number(resumo.novos_criados || 0);
        const errosLote = Number(resumo.erros || 0);
        restantes = Number(resumo.restantes || 0);

        if (ciclos === 1) {
          totalEstimado = Number(resumo.novos_no_drive || processadosLote + restantes || resumo.pdfs_encontrados || 0);
        }

        processadosAcumulados += processadosLote;
        importadosAcumulados += importadosLote;
        errosAcumulados += errosLote;
        todosErros.push(...resumirErros(data.erros || []));

        const duracaoSegundos = Math.max(1, (Date.now() - inicioGeral) / 1000);
        const mediaPorArquivo = processadosAcumulados > 0 ? duracaoSegundos / processadosAcumulados : null;
        const etaSegundos = mediaPorArquivo ? mediaPorArquivo * restantes : null;
        const denominador = Math.max(totalEstimado, processadosAcumulados + restantes, 1);
        const percentual = restantes === 0
          ? 100
          : Math.max(3, Math.min(98, Math.round((processadosAcumulados / denominador) * 100)));

        atualizarProgresso(mes, {
          ativo: restantes > 0,
          etapa: restantes > 0 ? `Lote ${ciclos} concluído. Preparando o próximo…` : 'Importação concluída.',
          percentual,
          processados: processadosAcumulados,
          total: denominador,
          restantes,
          importados: importadosAcumulados,
          erros: errosAcumulados,
          etaSegundos,
        });

        await onSincronizado?.();

        if (restantes > 0 && processadosLote === 0) {
          throw new Error('A fila não avançou. Verifique os erros exibidos antes de tentar novamente.');
        }
        if (restantes > 0 && errosLote === processadosLote && importadosLote === 0) {
          throw new Error('Todos os arquivos deste lote falharam. A importação foi interrompida para evitar repetição infinita.');
        }
      } while (restantes > 0 && ciclos < 50);

      const erros = todosErros.slice(0, 3);
      setErrosPorMes(prev => ({ ...prev, [mes]: erros }));
      atualizarProgresso(mes, {
        ativo: false,
        etapa: errosAcumulados > 0 ? 'Concluído com falhas.' : 'Importação concluída.',
        percentual: 100,
        etaSegundos: 0,
      });

      if (totalEstimado === 0) {
        toast.info(`Nenhum extrato PDF novo encontrado em ${item.mes}.`);
      } else if (errosAcumulados > 0) {
        toast.error(`${item.mes}: ${importadosAcumulados} importado(s) e ${errosAcumulados} erro(s).`, { duration: 12000 });
      } else {
        toast.success(`${item.mes}: ${importadosAcumulados} extrato(s) importado(s) e processado(s).`);
      }
    } catch (error) {
      const mensagem = error?.message || String(error);
      const erros = todosErros.length
        ? todosErros.slice(0, 3)
        : [{ arquivo: 'Falha geral', etapa: 'função', mensagem }];
      setErrosPorMes(prev => ({ ...prev, [mes]: erros }));
      atualizarProgresso(mes, {
        ativo: false,
        etapa: 'Importação interrompida.',
        erros: Math.max(errosAcumulados, erros.length),
        etaSegundos: null,
      });
      toast.error(`${item.mes}: ${mensagem}`, { duration: 12000 });
    } finally {
      setSincronizandoMes(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Extratos bancários por mês</h2>
        <p className="text-xs text-gray-400">Cada pasta é lida separadamente para localizar, importar e processar extratos de conta e rendimento.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {EXTRATO_DRIVE_FOLDERS_2026.map(item => {
          const key = `${item.ano}-${String(item.mes_num).padStart(2, '0')}`;
          const registros = registrosPorMes.get(key) || [];
          const contas = registros.filter(r => r.tipo === 'extrato_conta').length;
          const rendimentos = registros.filter(r => r.tipo === 'extrato_rendimento').length;
          const sincronizando = sincronizandoMes === item.mes_num;
          const erros = errosPorMes[item.mes_num] || [];
          const progresso = progressoPorMes[item.mes_num] || progressoInicial;

          return (
            <div key={key} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-900">{item.mes} {item.ano}</p>
                  <p className="text-[11px] text-gray-400">{contarDocumentos(registros)} documento(s) importado(s)</p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.folder_id ? 'bg-slate-100' : 'bg-amber-50'}`}>
                  <FolderOpen className={`w-4 h-4 ${item.folder_id ? 'text-slate-600' : 'text-amber-600'}`} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                  <Banknote className="w-3.5 h-3.5 text-slate-600 mb-1" />
                  <p className="text-[10px] text-gray-400">Extrato de conta</p>
                  <p className="text-sm font-bold text-slate-800">{contas}</p>
                </div>
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-2.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600 mb-1" />
                  <p className="text-[10px] text-blue-500">Rendimento</p>
                  <p className="text-sm font-bold text-blue-700">{rendimentos}</p>
                </div>
              </div>

              {!item.folder_id && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                  Pasta de abril não informada. A pasta repetida de março não foi reutilizada para evitar duplicidade.
                </p>
              )}

              {(sincronizando || progresso.percentual > 0) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {sincronizando
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600 shrink-0" />
                        : progresso.erros > 0
                          ? <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          : <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                      <span className="font-medium text-slate-700 truncate">{progresso.etapa}</span>
                    </div>
                    <span className="font-bold text-slate-700">{Math.round(progresso.percentual)}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progresso.percentual)}>
                    <div className="h-full bg-slate-800 rounded-full transition-all duration-500" style={{ width: `${progresso.percentual}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[10px] text-gray-500">
                    <span>{progresso.processados}/{progresso.total || '?'} processados · {progresso.importados} importados · {progresso.erros} erros</span>
                    {sincronizando && progresso.etaSegundos != null && (
                      <span className="flex items-center gap-1 whitespace-nowrap"><Clock3 className="w-3 h-3" />≈ {formatarTempo(progresso.etaSegundos)}</span>
                    )}
                  </div>
                </div>
              )}

              {erros.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p className="text-xs font-bold">Falhas desta execução</p>
                  </div>
                  {erros.map((erro, index) => (
                    <div key={`${erro.arquivo}-${index}`} className="text-[11px] text-red-700">
                      <p className="font-semibold break-words">{erro.arquivo}</p>
                      <p className="break-words"><span className="font-medium">Etapa:</span> {erro.etapa} · {erro.mensagem}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => sincronizarPasta(item)}
                  disabled={!item.folder_id || sincronizandoMes !== null}
                  className="flex-1 rounded-xl bg-slate-900 text-white hover:bg-slate-700 gap-1.5"
                >
                  {sincronizando
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{Math.round(progresso.percentual)}%</>
                    : <><RefreshCw className="w-3.5 h-3.5" />Ler pasta</>}
                </Button>
                {item.folder_url && (
                  <Button asChild size="sm" variant="outline" className="rounded-xl border-slate-300">
                    <a href={item.folder_url} target="_blank" rel="noreferrer" aria-label={`Abrir pasta de ${item.mes}`}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
