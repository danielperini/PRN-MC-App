import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileDown, BookImage, Calendar, Building2, Layers, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  SECTION_LABELS,
  SECTION_ABREV,
  isAtividadeFisica,
  buscarAtividadesComFotos,
  gerarPDFAtividades,
  formatDateBR,
} from '@/utils/gerarRelatorioExecutivoAtividades';
import { gerarAmostraRelatorioExecutivo } from '@/utils/exportarAmostraRelatorioExecutivo';

const SECTION_ORDER = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile', 'NOTURNO'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MAX_FOTOS = 5;

const MUSEUS_LOTE = ['MHAB', 'MIS', 'MUMO', 'MAP', 'CasaKubitschek', 'CasaDoBalile'];
const MESES_LOTE = ['Março', 'Abril', 'Maio', 'Junho'];
const NOTURNO_MUSEUS = new Set(['MAP', 'CasaKubitschek', 'CasaDoBalile']);

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function RelatorioExecutivoPDFDialog({ open, onClose }) {
  const [museu, setMuseu] = useState('');
  const [meses, setMeses] = useState([]);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [pct, setPct] = useState(0);
  const [atividades, setAtividades] = useState([]);
  const [fetched, setFetched] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [usarFallbackAmostra, setUsarFallbackAmostra] = useState(false);

  // Lote
  const [loteExecutando, setLoteExecutando] = useState(false);
  const [loteProgresso, setLoteProgresso] = useState(null);
  const [loteConcluido, setLoteConcluido] = useState(null);
  const cancelRef = useRef(false);

  const anos = useMemo(() => {
    const atual = new Date().getFullYear();
    return [atual, atual - 1, atual - 2];
  }, []);

  const toggleMes = (m) => {
    setMeses((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };
  const toggleTodosMeses = () => {
    setMeses((prev) => prev.length === MESES.length ? [] : [...MESES]);
  };

  const buscarAtividades = useCallback(async () => {
    if (!museu || meses.length === 0) { toast.warning('Selecione museu e pelo menos um mês.'); return; }
    setLoading(true);
    setFetched(false);
    setAtividades([]);
    setUsarFallbackAmostra(false);
    setPct(2);
    try {
      // Para o path normal, usa o primeiro mês (multi-mês consolidado apenas no fallback)
      const mesBusca = meses[0];
      const resultado = await buscarAtividadesComFotos(museu, mesBusca, ano, {
        maxFotos: MAX_FOTOS,
        onProgresso: (p, t) => { setPct(p); setProgresso(t); },
      });
      setAtividades(resultado);
      const tem = resultado.some((a) => a.fotos.length > 0);
      setUsarFallbackAmostra(!tem);
      setFetched(true);
      setProgresso('');
      setPct(0);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao buscar atividades: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
      setProgresso('');
      setPct(0);
    }
  }, [museu, meses, ano]);

  const temFotos = atividades.some((a) => a.fotos.length > 0);

  async function gerarPDF() {
    if (!temFotos && !usarFallbackAmostra) return;
    setGerando(true);
    setPct(2);
    try {
      let resultado;
      if (usarFallbackAmostra) {
        setProgresso('Gerando PDF com fotos brutas do período...');
        resultado = await gerarAmostraRelatorioExecutivo(museu, meses, ano, {
          maxFotosPorAtividade: MAX_FOTOS,
          returnBlob: true,
          onProgresso: (p, t) => { setPct(p); setProgresso(t); },
        });
      } else {
        const mesBusca = meses[0];
        resultado = await gerarPDFAtividades(atividades, museu, mesBusca, ano, {
          returnBlob: true,
          onProgresso: (p, t) => { setPct(p); setProgresso(t); },
        });
      }

      if (resultado?.blob) {
        downloadBlob(resultado.blob, resultado.filename);
        toast.success(`PDF gerado! ${resultado.totalFotos} fotos em ${resultado.totalAtividades} atividades.`);
      } else {
        toast.warning('Não foi possível gerar o PDF (nenhuma imagem carregável).');
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF: ' + (e.message || 'tente novamente.'));
    } finally {
      setGerando(false);
      setProgresso('');
      setPct(0);
    }
  }

  async function gerarLoteCompleto() {
    setLoteExecutando(true);
    setLoteConcluido(null);
    cancelRef.current = false;
    const total = MUSEUS_LOTE.length * MESES_LOTE.length;
    setLoteProgresso({ atual: 0, total, museu: '', mes: '', statusTexto: 'Iniciando...', pct: 0 });

    let gerados = 0;
    let pulados = 0;
    const log = [];

    outer:
    for (const museuKey of MUSEUS_LOTE) {
      for (const mesKey of MESES_LOTE) {
        if (cancelRef.current) break outer;
        const maxFotos = NOTURNO_MUSEUS.has(museuKey) ? 5 : 4;
        const idx = gerados + pulados + 1;
        setLoteProgresso({
          atual: idx, total,
          museu: museuKey, mes: mesKey,
          statusTexto: `Processando ${SECTION_ABREV[museuKey]} · ${mesKey}`,
          pct: Math.round(((idx - 1) / total) * 100),
        });

        try {
          const atvs = await buscarAtividadesComFotos(museuKey, mesKey, ano, {
            maxFotos,
            onProgresso: (p, t) => setLoteProgresso(prev => ({
              ...prev, statusTexto: `${SECTION_ABREV[museuKey]} · ${mesKey}: ${t}`,
            })),
          });
          const tem = atvs.some((a) => a.fotos.length > 0);

          let resultado = null;
          if (tem) {
            resultado = await gerarPDFAtividades(atvs, museuKey, mesKey, ano, {
              returnBlob: true,
              onProgresso: (p, t) => setLoteProgresso(prev => ({
                ...prev, statusTexto: `${SECTION_ABREV[museuKey]} · ${mesKey}: ${t}`,
              })),
            });
          } else {
            resultado = await gerarAmostraRelatorioExecutivo(museuKey, [mesKey], ano, {
              maxFotosPorAtividade: maxFotos,
              returnBlob: true,
              onProgresso: (p, t) => setLoteProgresso(prev => ({
                ...prev, statusTexto: `${SECTION_ABREV[museuKey]} · ${mesKey}: ${t}`,
              })),
            });
          }

          if (resultado?.blob) {
            downloadBlob(resultado.blob, resultado.filename);
            gerados++;
            log.push({ museu: museuKey, mes: mesKey, status: 'gerado', fotos: resultado.totalFotos });
          } else {
            pulados++;
            log.push({ museu: museuKey, mes: mesKey, status: 'pulado' });
          }
        } catch (e) {
          if (String(e.message || '').includes('Nenhuma foto encontrada')) {
            pulados++;
            log.push({ museu: museuKey, mes: mesKey, status: 'pulado' });
          } else {
            log.push({ museu: museuKey, mes: mesKey, status: 'erro', erro: e.message });
          }
        }

        setLoteProgresso(prev => ({ ...prev, pct: Math.round((idx / total) * 100) }));
        // Pequena pausa para não sobrecarregar
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setLoteConcluido({ gerados, pulados, log, cancelado: cancelRef.current });
    setLoteExecutando(false);
    setLoteProgresso(null);
    if (gerados > 0) toast.success(`Lote concluído: ${gerados} PDF(s) gerado(s), ${pulados} pulado(s).`);
    else toast.warning('Nenhum PDF pôde ser gerado no lote.');
  }

  function cancelarLote() {
    cancelRef.current = true;
    setLoteProgresso(prev => prev ? { ...prev, statusTexto: 'Cancelando após item atual...' } : prev);
  }

  function reset() {
    setMuseu(''); setMeses([]); setAtividades([]); setFetched(false);
    setUsarFallbackAmostra(false);
    setLoteExecutando(false); setLoteProgresso(null); setLoteConcluido(null);
  }

  function handleClose() {
    if (loading || gerando || loteExecutando) return;
    reset();
    onClose();
  }

  const controlesBloqueados = loading || gerando || loteExecutando;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookImage className="h-5 w-5" />
            Relatório Executivo de Fotos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Painel de lote em execução */}
          {loteExecutando && loteProgresso && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                  <Layers className="h-4 w-4" /> Geração em Lote
                </p>
                <span className="text-xs font-bold text-blue-700">
                  {loteProgresso.atual} de {loteProgresso.total}
                </span>
              </div>
              <div className="w-full h-2.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${loteProgresso.pct}%` }} />
              </div>
              <div className="flex items-center gap-2 text-xs text-blue-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span className="truncate">{loteProgresso.statusTexto}</span>
              </div>
              <Button variant="outline" size="sm" onClick={cancelarLote} className="w-full text-red-600 border-red-200 hover:bg-red-50">
                <XCircle className="h-3.5 w-3.5 mr-1" /> Cancelar Lote
              </Button>
            </div>
          )}

          {/* Resumo do lote concluído */}
          {loteConcluido && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Lote {loteConcluido.cancelado ? 'cancelado' : 'concluído'}
                </p>
                <button type="button" onClick={() => setLoteConcluido(null)} className="text-xs text-blue-600 hover:underline">
                  Fechar resumo
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-green-50 border border-green-200 p-2">
                  <p className="text-lg font-bold text-green-700">{loteConcluido.gerados}</p>
                  <p className="text-xs text-green-600">PDFs gerados</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                  <p className="text-lg font-bold text-amber-700">{loteConcluido.pulados}</p>
                  <p className="text-xs text-amber-600">Pulados (sem fotos)</p>
                </div>
              </div>
              <div className="space-y-1 max-h-[30vh] overflow-y-auto">
                {loteConcluido.log.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded">
                    {item.status === 'gerado' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                    {item.status === 'pulado' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    {item.status === 'erro' && <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    <span className="font-medium text-gray-700">{SECTION_ABREV[item.museu]}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{item.mes}</span>
                    <span className="ml-auto text-gray-400">
                      {item.status === 'gerado' ? `${item.fotos} fotos` : item.status === 'pulado' ? 'Sem fotos — pulado' : 'Erro'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!fetched && !loteExecutando && !loteConcluido && (
            <>
              {/* Museu */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Museu
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SECTION_ORDER.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => !controlesBloqueados && setMuseu(museu === k ? '' : k)}
                      disabled={controlesBloqueados}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-all
                        ${museu === k ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-800 hover:border-gray-400'}
                        ${controlesBloqueados ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <p className="font-semibold">{SECTION_ABREV[k]}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mês (multi-select) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Mês de referência
                  </p>
                  <button
                    type="button"
                    onClick={() => !controlesBloqueados && toggleTodosMeses()}
                    disabled={controlesBloqueados}
                    className={`text-xs font-medium px-2 py-1 rounded-lg border transition-all
                      ${meses.length === MESES.length ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}
                      ${controlesBloqueados ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {meses.length === MESES.length ? 'Limpar' : 'Todos'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MESES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => !controlesBloqueados && toggleMes(m)}
                      disabled={controlesBloqueados}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition-all
                        ${meses.includes(m) ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}
                        ${controlesBloqueados ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ano */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Ano</p>
                <div className="flex gap-2">
                  {anos.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => !controlesBloqueados && setAno(a)}
                      disabled={controlesBloqueados}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-all
                        ${ano === a ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
                        ${controlesBloqueados ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Progresso de busca */}
          {loading && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                <span className="text-xs">{progresso || 'Buscando...'}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-right">{Math.round(pct)}%</p>
            </div>
          )}

          {/* Preview de atividades */}
          {fetched && atividades.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  {atividades.length} {atividades.length === 1 ? 'atividade encontrada' : 'atividades encontradas'}
                </p>
                <button type="button" onClick={() => { setFetched(false); setAtividades([]); setUsarFallbackAmostra(false); }} className="text-xs text-blue-600 hover:underline">
                  Voltar aos filtros
                </button>
              </div>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {atividades.map((item, idx) => {
                  const count = item.fotos.length;
                  const badge = count >= 3 ? 'bg-green-100 text-green-700' : count >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.atividade.titulo}</p>
                        <p className="text-xs text-gray-500">
                          {formatDateBR(item.atividade.data_realizacao || item.atividade.data_inicio) || 'Sem data'} · {item.atividade.classificacao}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge}`}>
                        {count} {count === 1 ? 'foto' : 'fotos'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!temFotos && (
                <p className="text-xs text-red-600 font-medium">Nenhuma atividade possui fotos. O PDF não pode ser gerado.</p>
              )}
            </div>
          )}

          {/* Fallback: sem atividades com fotos, mas com ReportPhotos brutas */}
          {fetched && usarFallbackAmostra && atividades.length === 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Sem atividades com fotos — usando fotos brutas do período</p>
                  <p className="mt-1 text-xs text-blue-700">
                    Não foram encontradas atividades físicas com fotos para {SECTION_ABREV[museu]} em {meses.join(', ')}/{ano}.
                    O PDF será gerado com as fotos brutas (ReportPhoto) do período, agrupadas em páginas de 4 fotos.
                  </p>
                </div>
              </div>
            </div>
          )}

          {fetched && atividades.length === 0 && !usarFallbackAmostra && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <BookImage className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="font-medium text-gray-700">Nenhuma atividade física encontrada</p>
              <p className="mt-1 text-sm text-gray-500">Tente outro museu, mês ou ano.</p>
              <button type="button" onClick={() => setFetched(false)} className="mt-3 text-xs text-blue-600 hover:underline">
                Voltar aos filtros
              </button>
            </div>
          )}

          {/* Progresso de geração do PDF */}
          {gerando && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <FileDown className="h-4 w-4 animate-bounce text-blue-500 shrink-0" />
                <span className="text-xs">{progresso || 'Gerando PDF...'}</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-right">{Math.round(pct)}%</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={handleClose} disabled={controlesBloqueados}>
            Fechar
          </Button>
          {!fetched && !loteExecutando && !loteConcluido && (
            <Button
              variant="outline"
              onClick={gerarLoteCompleto}
              disabled={controlesBloqueados}
              className="w-full sm:w-auto"
            >
              <Layers className="h-4 w-4 mr-1" /> Gerar Lote Completo
            </Button>
          )}
          {!fetched ? (
            <Button onClick={buscarAtividades} disabled={controlesBloqueados || !museu || meses.length === 0}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Buscando...</> : 'Buscar atividades'}
            </Button>
          ) : (
            <Button onClick={gerarPDF} disabled={controlesBloqueados || (!temFotos && !usarFallbackAmostra)}>
              {gerando ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Gerando...</> : <><FileDown className="h-4 w-4 mr-1" />Gerar PDF</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}