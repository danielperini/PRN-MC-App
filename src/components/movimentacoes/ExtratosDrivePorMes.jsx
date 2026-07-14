import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { EXTRATO_DRIVE_FOLDERS_2026 } from '@/config/extratoDriveFolders';
import { AlertCircle, Banknote, CheckCircle2, FolderOpen, Loader2, RefreshCw, Trash2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const ESPERAS = [1500, 3500, 7000];
const RETRY_STATUS = [429, 503, 504, 524];
const progressoInicial = { ativo: false, etapa: '', percentual: 0, processados: 0, total: 0, importados: 0, atualizados: 0, erros: 0 };

function dormir(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function statusDoErro(error) {
  return Number(error?.response?.status || error?.status || String(error?.message || '').match(/status code (\d{3})/i)?.[1] || 0);
}
async function invocarComRetry(nome, payload, onRetry) {
  let ultimoErro;
  for (let tentativa = 0; tentativa <= ESPERAS.length; tentativa += 1) {
    try {
      return await base44.functions.invoke(nome, payload);
    } catch (error) {
      ultimoErro = error;
      const status = statusDoErro(error);
      if (!RETRY_STATUS.includes(status) || tentativa === ESPERAS.length) throw error;
      onRetry?.(tentativa + 1, status, ESPERAS[tentativa]);
      await dormir(ESPERAS[tentativa]);
    }
  }
  throw ultimoErro;
}
function contarDocumentos(registros) {
  return new Set(registros.map((r) => r.drive_file_id || r.id).filter(Boolean)).size;
}
function errosResumidos(erros = []) {
  return erros.slice(0, 3).map((erro) => ({ arquivo: erro.arquivo || 'Arquivo sem nome', etapa: erro.etapa || 'processamento', mensagem: erro.erro || 'Erro não informado' }));
}

export default function ExtratosDrivePorMes({ movimentacoes = [], onSincronizado }) {
  const [sincronizandoMes, setSincronizandoMes] = useState(null);
  const [limpandoMes, setLimpandoMes] = useState(null);
  const [errosPorMes, setErrosPorMes] = useState({});
  const [progressoPorMes, setProgressoPorMes] = useState({});
  const pastas = useMemo(() => EXTRATO_DRIVE_FOLDERS_2026.filter((item) => item.ano > 2026 || item.mes_num >= 2), []);
  const registrosPorMes = useMemo(() => {
    const mapa = new Map();
    movimentacoes.forEach((registro) => {
      const key = `${registro.ano}-${String(registro.mes_num || 0).padStart(2, '0')}`;
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key).push(registro);
    });
    return mapa;
  }, [movimentacoes]);

  function atualizarProgresso(mes, patch) {
    setProgressoPorMes((prev) => ({ ...prev, [mes]: { ...(prev[mes] || progressoInicial), ...patch } }));
  }

  async function limparDuplicados(item, silencioso = false) {
    setLimpandoMes(item.mes_num);
    try {
      const resposta = await invocarComRetry('limparExtratosDuplicados', { mes_num: item.mes_num, ano: item.ano }, (tentativa, status) => {
        atualizarProgresso(item.mes_num, { etapa: `Serviço temporariamente indisponível (${status}). Tentativa ${tentativa}/3…` });
      });
      const dados = resposta?.data || resposta || {};
      if (!dados.success) throw new Error(dados.error || 'Falha ao limpar duplicados.');
      const deletados = Number(dados.resumo?.deletados || 0);
      if (!silencioso) toast.success(deletados ? `${item.mes}: ${deletados} duplicado(s) removido(s).` : `${item.mes}: nenhum duplicado encontrado.`);
      await onSincronizado?.();
      return deletados;
    } finally {
      setLimpandoMes(null);
    }
  }

  async function sincronizarPasta(item) {
    if (!item.folder_id) return toast.error(`A pasta de ${item.mes} não foi informada.`);
    const mes = item.mes_num;
    let processados = 0;
    let importados = 0;
    let atualizados = 0;
    let erros = 0;
    let restantes = 1;
    let ciclos = 0;
    const falhas = [];
    setSincronizandoMes(mes);
    setErrosPorMes((prev) => ({ ...prev, [mes]: [] }));
    atualizarProgresso(mes, { ...progressoInicial, ativo: true, etapa: 'Lendo a pasta do Google Drive…', percentual: 2 });

    try {
      while (restantes > 0 && ciclos < 50) {
        ciclos += 1;
        const resposta = await invocarComRetry('lerExtratosBancariosDrive', {
          mes_num: mes,
          ano: item.ano,
          folder_id: item.folder_id,
          batch_size: 3,
          reprocessar_existentes: true,
        }, (tentativa, status, espera) => {
          atualizarProgresso(mes, { etapa: `Erro ${status}. Nova tentativa ${tentativa}/3 em ${Math.round(espera / 1000)}s…` });
        });
        const dados = resposta?.data || resposta || {};
        if (!dados.success) throw new Error(dados.error || 'Falha ao processar a pasta mensal.');
        const resumo = dados.resumo || {};
        const lote = Number(resumo.processados_neste_lote || 0);
        processados += lote;
        importados += Number(resumo.novos_criados || 0);
        atualizados += Number(resumo.atualizados || 0);
        erros += Number(resumo.erros || 0);
        restantes = Number(resumo.restantes || 0);
        falhas.push(...errosResumidos(dados.erros || []));
        const total = Math.max(processados + restantes, 1);
        atualizarProgresso(mes, {
          ativo: restantes > 0,
          etapa: restantes > 0 ? `Lote ${ciclos} concluído. Continuando…` : 'Conferindo duplicidades…',
          percentual: restantes > 0 ? Math.max(3, Math.min(92, Math.round((processados / total) * 92))) : 94,
          processados,
          total,
          importados,
          atualizados,
          erros,
        });
        await onSincronizado?.();
        if (restantes > 0 && lote === 0) throw new Error('A fila não avançou.');
      }

      const deletados = await limparDuplicados(item, true);
      atualizarProgresso(mes, { ativo: false, etapa: deletados ? `${deletados} duplicado(s) removido(s).` : 'Importação e conferência concluídas.', percentual: 100 });
      setErrosPorMes((prev) => ({ ...prev, [mes]: falhas }));
      toast.success(`${item.mes}: ${importados} novo(s), ${atualizados} atualizado(s), ${deletados} duplicado(s) removido(s).`);
    } catch (error) {
      const mensagem = error?.message || String(error);
      setErrosPorMes((prev) => ({ ...prev, [mes]: falhas.length ? falhas : [{ arquivo: 'Falha geral', etapa: 'função', mensagem }] }));
      atualizarProgresso(mes, { ativo: false, etapa: 'Importação interrompida após as tentativas automáticas.', erros: Math.max(erros, 1) });
      toast.error(`${item.mes}: ${mensagem}`, { duration: 12000 });
    } finally {
      setSincronizandoMes(null);
    }
  }

  return <section className="space-y-3">
    <div><h2 className="text-sm font-bold text-slate-900">Extratos bancários por mês</h2><p className="text-xs text-gray-400">Período considerado a partir do depósito de fevereiro de 2026. Duplicados são removidos ao final de cada processamento.</p></div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {pastas.map((item) => {
        const key = `${item.ano}-${String(item.mes_num).padStart(2, '0')}`;
        const registros = registrosPorMes.get(key) || [];
        const contas = registros.filter((r) => r.tipo === 'extrato_conta').length;
        const rendimentos = registros.filter((r) => r.tipo === 'extrato_rendimento').length;
        const duplicado = contas > 1 || rendimentos > 1;
        const progresso = progressoPorMes[item.mes_num] || progressoInicial;
        const falhas = errosPorMes[item.mes_num] || [];
        const sincronizando = sincronizandoMes === item.mes_num;
        const limpando = limpandoMes === item.mes_num;
        return <div key={key} className={`space-y-3 rounded-2xl border bg-white p-4 shadow-sm ${duplicado ? 'border-amber-300' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between"><div><p className="font-bold text-slate-900">{item.mes} {item.ano}</p><p className="text-[11px] text-gray-400">{contarDocumentos(registros)} documento(s) importado(s)</p></div><FolderOpen className="h-4 w-4 text-slate-600" /></div>
          <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border bg-slate-50 p-2.5"><Banknote className="mb-1 h-3.5 w-3.5" /><p className="text-[10px] text-gray-400">Extrato de conta</p><p className="font-bold">{contas}</p></div><div className="rounded-xl border bg-blue-50 p-2.5"><TrendingUp className="mb-1 h-3.5 w-3.5 text-blue-600" /><p className="text-[10px] text-blue-500">Rendimento</p><p className="font-bold text-blue-700">{rendimentos}</p></div></div>
          {duplicado && <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">Duplicidade detectada. A limpeza manterá um documento canônico por tipo.</div>}
          {(sincronizando || progresso.percentual > 0) && <div className="space-y-2 rounded-xl border bg-slate-50 p-3"><div className="flex justify-between text-xs"><span>{progresso.etapa}</span><strong>{progresso.percentual}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-slate-800" style={{ width: `${progresso.percentual}%` }} /></div><p className="text-[10px] text-gray-500">{progresso.processados}/{progresso.total || '?'} processados · {progresso.importados} importados · {progresso.atualizados} atualizados · {progresso.erros} erros</p></div>}
          {falhas.length > 0 && <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3"><p className="flex items-center gap-1 text-xs font-bold text-red-700"><AlertCircle className="h-3.5 w-3.5" /> Falhas desta execução</p>{falhas.map((falha, indice) => <p key={indice} className="text-[11px] text-red-700"><strong>{falha.arquivo}</strong><br />Etapa: {falha.etapa} · {falha.mensagem}</p>)}</div>}
          <div className="flex gap-2"><Button onClick={() => sincronizarPasta(item)} disabled={sincronizando || limpando} className="flex-1 gap-2 bg-slate-900 text-white">{sincronizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Ler e revisar</Button>{duplicado && <Button variant="outline" onClick={() => limparDuplicados(item)} disabled={sincronizando || limpando}>{limpando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button>}</div>
          {!sincronizando && progresso.percentual === 100 && <p className="flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Concluído</p>}
        </div>;
      })}
    </div>
  </section>;
}
