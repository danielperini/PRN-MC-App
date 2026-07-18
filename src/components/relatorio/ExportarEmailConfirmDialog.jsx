import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Mail, X, Loader2, CheckCircle2, Send } from 'lucide-react';

export default function ExportarEmailConfirmDialog({ relatorioId, relatorio, userEmail, onClose }) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const destinatario = relatorio?.gerado_por_email || userEmail || '—';
  const totalFotos = (relatorio?.anexos_evidencias || []).length;
  const totalLotesFotos = Math.ceil(totalFotos / 20);
  const totalArquivos = 3 + (totalFotos > 0 ? totalLotesFotos : 0);

  async function handleConfirmar() {
    setEnviando(true);
    try {
      // fire-and-forget: não aguarda resultado
      base44.functions.invoke('exportarRelatorioExecucaoEmail', { relatorio_id: relatorioId })
        .catch(err => console.warn('exportar email bg error:', err));
      setEnviado(true);
      toast.success('Exportação iniciada! Você receberá os arquivos por email em instantes.');
    } catch (e) {
      toast.error('Erro ao iniciar exportação: ' + e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
              <Mail className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900">Exportar Completo por E-mail</h2>
              <p className="text-xs text-slate-500">Geração no servidor, sem travar o browser</p>
            </div>
          </div>
          {!enviado && (
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Corpo */}
        <div className="px-5 py-5 space-y-4">
          {!enviado ? (
            <>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-sm text-slate-700 font-medium">O que será gerado:</p>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">1</span>
                    PDF — Parte 1: Identificação e Público
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">2</span>
                    PDF — Parte 2: Cronograma de Metas e Equipe
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">3</span>
                    PDF — Parte 3: Impactos, Avaliação e Assinatura
                  </li>
                  {totalFotos > 0 && (
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0">📷</span>
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
                Você pode fechar esta janela após confirmar — a geração ocorre em segundo plano.
              </p>
            </>
          ) : (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">Exportação enviada para processamento ✓</p>
                <p className="text-xs text-slate-500 mt-1">
                  Os PDFs serão gerados e enviados para <span className="font-medium text-slate-700">{destinatario}</span> em instantes.
                </p>
              </div>
              <p className="text-xs text-slate-400">Você pode navegar normalmente enquanto isso.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          {!enviado ? (
            <>
              <Button variant="outline" size="sm" onClick={onClose} disabled={enviando}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmar}
                disabled={enviando}
                className="bg-slate-900 text-white hover:bg-slate-700 gap-1.5"
              >
                {enviando
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Iniciando...</>
                  : <><Send className="w-3.5 h-3.5" /> Gerar e Enviar por E-mail</>
                }
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onClose} className="bg-green-600 text-white hover:bg-green-700">
              Fechar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}