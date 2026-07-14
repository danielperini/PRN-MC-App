import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { EXTRATO_DRIVE_FOLDERS_2026 } from '@/config/extratoDriveFolders';
import { AlertCircle, Banknote, ExternalLink, FolderOpen, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
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

export default function ExtratosDrivePorMes({ movimentacoes = [], onSincronizado }) {
  const [sincronizandoMes, setSincronizandoMes] = useState(null);
  const [errosPorMes, setErrosPorMes] = useState({});

  const registrosPorMes = useMemo(() => {
    const map = new Map();
    movimentacoes.forEach(registro => {
      const key = `${registro.ano}-${String(registro.mes_num || 0).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(registro);
    });
    return map;
  }, [movimentacoes]);

  async function sincronizarPasta(item) {
    if (!item.folder_id) {
      toast.error(`A pasta de ${item.mes} ainda não foi informada.`);
      return;
    }

    setSincronizandoMes(item.mes_num);
    setErrosPorMes(prev => ({ ...prev, [item.mes_num]: [] }));
    toast.info(`Buscando extrato de conta e extrato de rendimento em ${item.mes}…`);
    try {
      const response = await base44.functions.invoke('lerExtratosBancariosDrive', {
        mes_num: item.mes_num,
        ano: item.ano,
        folder_id: item.folder_id,
      });
      const data = response?.data || response || {};
      if (!data.success) throw new Error(data.error || 'Falha ao ler a pasta mensal');

      const resumo = data.resumo || {};
      const erros = resumirErros(data.erros || []);
      setErrosPorMes(prev => ({ ...prev, [item.mes_num]: erros }));

      if (erros.length > 0) {
        const primeiro = erros[0];
        toast.error(
          `${item.mes}: ${resumo.novos_criados || 0} importado(s), ${resumo.erros || erros.length} erro(s). ` +
          `${primeiro.etapa}: ${primeiro.mensagem}`,
          { duration: 12000 }
        );
      } else if ((resumo.pdfs_encontrados || 0) === 0) {
        toast.info(`Nenhum extrato PDF encontrado em ${item.mes}.`);
      } else if ((resumo.novos_criados || 0) === 0 && (resumo.restantes || 0) === 0) {
        toast.success(`${item.mes}: todos os extratos já estavam importados.`);
      } else {
        toast.success(
          `${item.mes}: ${resumo.novos_criados || 0} novo(s) extrato(s) importado(s)` +
          ((resumo.restantes || 0) > 0 ? ` · ${resumo.restantes} restante(s)` : '')
        );
      }
      await onSincronizado?.();
    } catch (error) {
      const mensagem = error?.message || String(error);
      setErrosPorMes(prev => ({ ...prev, [item.mes_num]: [{ arquivo: 'Falha geral', etapa: 'função', mensagem }] }));
      toast.error(`${item.mes}: ${mensagem}`, { duration: 12000 });
    } finally {
      setSincronizandoMes(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Extratos bancários por mês</h2>
        <p className="text-xs text-gray-400">Cada pasta é lida separadamente para localizar extrato de conta e extrato de rendimento.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {EXTRATO_DRIVE_FOLDERS_2026.map(item => {
          const key = `${item.ano}-${String(item.mes_num).padStart(2, '0')}`;
          const registros = registrosPorMes.get(key) || [];
          const contas = registros.filter(r => r.tipo === 'extrato_conta').length;
          const rendimentos = registros.filter(r => r.tipo === 'extrato_rendimento').length;
          const sincronizando = sincronizandoMes === item.mes_num;
          const erros = errosPorMes[item.mes_num] || [];

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
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Lendo…</>
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
