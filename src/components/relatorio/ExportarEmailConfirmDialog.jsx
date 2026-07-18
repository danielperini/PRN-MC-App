import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Mail, X, Loader2, CheckCircle2, Send, AlertTriangle, FileText, Camera } from 'lucide-react';

export default function ExportarEmailConfirmDialog({ relatorioId, relatorio, userEmail, onClose }) {
  const [fase, setFase] = useState('confirm'); // confirm | processando | concluido | erro
  const [jobId, setJobId] = useState(null);
  const [totalPartes, setTotalPartes] = useState(0);
  const [parteAtual, setParteAtual] = useState(0);
  const [parteLabel, setParteLabel] = useState('');
  const [folderLink, setFolderLink] = useState('');
  const [erros, setErros] = useState([]);
  const processandoRef = useRef(false);

  const destinatario = relatorio?.gerado_por_email || userEmail || '—';
  const totalFotos = (relatorio?.anexos_evidencias || []).length;
  const totalLotesFotos = totalFotos > 0 ? Math.ceil(totalFotos / 20) : 0;
  const totalArquivos = 3 + totalLotesFotos;

  function getParteLabel(idx, total) {
    if (idx === 0) return 'Parte 1 — Identificação e Público';
    if (idx === 1) return 'Parte 2 — Metas e Equipe';
    if (idx === 2) return 'Parte 3 — Impactos e Assinatura';
    const loteIdx = idx - 3;
    const ini = (loteIdx * 20 + 1).toString().padStart(3, '0');
    const fim = Math.min((loteIdx + 1) * 20, totalFotos).toString().padStart(3, '0');
    return `Fotos ${ini}–${fim}`;
  }

  async function processarParteSequencial(jid, parte, total, accErros) {
    if (!processandoRef.current) return;

    setParteAtual(parte + 1);
    setParteLabel(getParteLabel(parte, total));

    try {
      const res = await base44.functions.invoke('exportarRelatorioExecucaoEmail', {
        job_id: jid,
        parte,
      });

      if (res?.erros?.length) {
        accErros.push(...(res.erros || []));
      }

      if (res?.finalizado) {
        processandoRef.current = false;
        setErros(accErros);
        setFase('concluido');
        return;
      }

      // Próxima parte
      if (parte + 1 < total) {
        await processarParteSequencial(jid, parte + 1, total, accErros);
      } else {
        processandoRef.current = false;
        setErros(accErros);
        setFase('concluido');
      }
    } catch (e) {
      accErros.push(`Parte ${parte}: ${e.message}`);
      // Tenta continuar mesmo com erro numa parte
      if (parte + 1 < total) {
        await processarParteSequencial(jid, parte + 1, total, accErros);
      } else {
        processandoRef.current = false;
        setErros(accErros);
        setFase(accErros.length === total ? 'erro' : 'concluido');
      }
    }
  }

  async function handleConfirmar() {
    setFase('processando');
    processandoRef.current = true;

    try {
      // Cria o job no servidor e obtém o job_id imediatamente
      const res = await base44.functions.invoke('exportarRelatorioExecucaoEmail', {
        relatorio_id: relatorioId,
      });

      if (!res?.job_id) throw new Error(res?.error || 'Falha ao criar job de exportação');

      setJobId(res.job_id);
      setTotalPartes(res.partes_total);
      setFolderLink(res.folder_link || '');

      // Processa cada parte sequencialmente — sem bloquear o browser
      await processarParteSequencial(res.job_id, 0, res.partes_total, []);
    } catch (e) {
      processandoRef.current = false;
      setFase('erro');
      toast.error('Erro ao exportar: ' + e.message);
    }
  }

  useEffect(() => {
    return () => { processandoRef.current = false; };
  }, []);

  const progresso = totalPartes > 0 ? Math.round((parteAtual / totalPartes) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900">Exportar Completo por E-mail</h2>
              <p className="text-xs text-slate-500">Geração por capítulo, sem travar o navegador</p>
            </div>
          </div>
          {fase === 'confirm' && (
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Corpo */}
        <div className="px-5 py-5 space-y-4">

          {/* ── CONFIRMAÇÃO ── */}
          {fase === 'confirm' && (
            <>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-sm text-slate-700 font-medium">O que será gerado:</p>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {[
                    { n: 1, label: 'Parte 1: Identificação e Público', icon: FileText },
                    { n: 2, label: 'Parte 2: Cronograma de Metas e Equipe', icon: FileText },
                    { n: 3, label: 'Parte 3: Impactos, Avaliação e Assinatura', icon: FileText },
                  ].map(item => (
                    <li key={item.n} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">{item.n}</span>
                      PDF — {item.label}
                    </li>
                  ))}
                  {totalFotos > 0 && (
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <Camera className="w-2.5 h-2.5 text-indigo-600" />
                      </span>
                      {totalLotesFotos} PDF(s) de fotos ({totalFotos} imagens, máx. 20 por arquivo)
                    </li>
                  )}
                </ul>
                <div className="pt-2 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{totalArquivos} arquivo(s) no total</span>
                  · Salvos automaticamente no Google Drive
                </div>
              </div>

              <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
                <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs text-blue-800 font-medium">Links enviados para:</p>
                  <p className="text-xs text-blue-600 font-mono mt-0.5">{destinatario}</p>
                </div>
              </div>

              <p className="text-xs text-slate-400 text-center">
                Cada capítulo é processado separadamente — você acompanha o progresso aqui.
              </p>
            </>
          )}

          {/* ── PROCESSANDO ── */}
          {fase === 'processando' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-slate-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Gerando capítulos…</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{parteLabel || 'Iniciando…'}</p>
                </div>
                <span className="text-xs font-bold text-slate-600 shrink-0">{parteAtual}/{totalPartes}</span>
              </div>

              {/* Barra de progresso */}
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-800 rounded-full transition-all duration-500"
                  style={{ width: `${progresso}%` }}
                />
              </div>

              {/* Lista de capítulos */}
              <div className="space-y-1.5">
                {Array.from({ length: totalPartes }).map((_, i) => {
                  const label = getParteLabel(i, totalPartes);
                  const concluida = i < parteAtual - 1;
                  const atual = i === parteAtual - 1;
                  return (
                    <div key={i} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                      concluida ? 'bg-green-50 text-green-700' :
                      atual ? 'bg-slate-100 text-slate-800 font-medium' :
                      'text-slate-400'
                    }`}>
                      {concluida
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        : atual
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500 shrink-0" />
                          : <span className="w-3.5 h-3.5 shrink-0" />
                      }
                      {label}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400 text-center">Não feche esta janela — o progresso pode ser perdido.</p>
            </div>
          )}

          {/* ── CONCLUÍDO ── */}
          {fase === 'concluido' && (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">Exportação concluída ✓</p>
                <p className="text-xs text-slate-500 mt-1">
                  {totalPartes} PDF(s) gerados e links enviados para <span className="font-medium text-slate-700">{destinatario}</span>.
                </p>
              </div>
              {erros.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200 text-left">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{erros.length} parte(s) com erro: {erros.join(', ')}</span>
                </div>
              )}
              {folderLink && (
                <a
                  href={folderLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  📁 Abrir pasta no Google Drive
                </a>
              )}
            </div>
          )}

          {/* ── ERRO FATAL ── */}
          {fase === 'erro' && (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7 text-red-500" />
              </div>
              <p className="font-semibold text-slate-900 text-sm">Erro ao iniciar exportação</p>
              <p className="text-xs text-slate-500">Tente novamente ou verifique sua conexão com o Google Drive.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          {fase === 'confirm' && (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
              <Button
                size="sm"
                onClick={handleConfirmar}
                className="bg-slate-900 text-white hover:bg-slate-700 gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Gerar e Enviar por E-mail
              </Button>
            </>
          )}
          {(fase === 'concluido' || fase === 'erro') && (
            <Button
              size="sm"
              onClick={onClose}
              className={fase === 'concluido' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-900 text-white'}
            >
              Fechar
            </Button>
          )}
          {fase === 'processando' && (
            <span className="text-xs text-slate-400 italic">Aguarde a conclusão…</span>
          )}
        </div>
      </div>
    </div>
  );
}