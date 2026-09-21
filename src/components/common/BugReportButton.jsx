import React, { useMemo, useState } from 'react';
import { Bot, Bug, Loader2, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const pageLabel = () => {
  if (typeof window === 'undefined') return 'Aplicação';
  return document.title || window.location.pathname || 'Aplicação';
};

export default function BugReportButton({ currentUser }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const page = useMemo(() => pageLabel(), [open]);

  const submit = async (event) => {
    event.preventDefault();
    const message = description.trim();
    if (message.length < 12) {
      toast.error('Descreva o problema com pelo menos 12 caracteres.');
      return;
    }

    setSending(true);
    try {
      const response = await base44.functions.invoke('reportarProblemaApp', {
        descricao: message,
        pagina: typeof window !== 'undefined' ? window.location.pathname : '',
        titulo_pagina: page,
        navegador: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        usuario_email: currentUser?.email || '',
      });
      const result = response?.data || response || {};
      setAnalysis(result.analise || null);
      setDescription('');
      toast.success(result.email_enviado === false
        ? 'Problema registrado. O suporte será avisado assim que o e-mail estiver disponível.'
        : 'Problema analisado e enviado ao suporte.');
    } catch (error) {
      console.error('BUG_REPORT_FAILED', error);
      toast.error('Não foi possível registrar o problema. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => { setAnalysis(null); setOpen(true); }}
        className="fixed bottom-24 right-4 z-50 h-11 rounded-full bg-slate-900 px-4 text-white shadow-lg hover:bg-slate-800 lg:bottom-6 lg:right-6"
        aria-label="Reportar problema no aplicativo"
      >
        <Bug className="mr-2 h-4 w-4" />
        Reportar problema
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-indigo-600" />
              Reportar problema
            </DialogTitle>
            <DialogDescription>
              A IA vai organizar o relato e avisar o suporte técnico. Inclua o que você tentou fazer e a mensagem exibida, se houver.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={submit}>
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Página: {page}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-800" htmlFor="bug-description">O que aconteceu?</label>
              <textarea
                id="bug-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={sending}
                rows={5}
                maxLength={4000}
                placeholder="Ex.: ao salvar o relatório de agosto, a tela voltou para o início e não gravou a atividade."
                className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {analysis?.resumo && (
              <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
                <strong>Triagem automática:</strong> {analysis.resumo}
                {analysis.categoria ? <span className="block mt-1 text-xs">Categoria: {analysis.categoria}{analysis.gravidade ? ` · Prioridade: ${analysis.gravidade}` : ''}</span> : null}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={sending} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={sending} className="bg-indigo-600 hover:bg-indigo-700">
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {sending ? 'Analisando...' : 'Enviar para suporte'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
